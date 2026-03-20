import { Capacitor } from "@capacitor/core";
import { ESCPOSPlugin } from "@albgen/capacitor-escpos-plugin";
import type { Order } from "./db-types";
import { normalizeAddressBlock } from "./pdf-utils";
import { addPrinterLog } from "./printer-debug-log";

interface PrintResult {
  success: boolean;
  error?: string;
}

export interface SavedPosPrinter {
  id: string;
  name?: string;
  address?: string;
  type?: string;
  driver?: "escpos";
}

const SAVED_PRINTER_KEY = "saree_pos_saved_printer_v1";
const PLUGIN_LOAD_TIMEOUT_MS = 20_000; // slow/cold Android starts can exceed 5s
const PRINT_TIMEOUT_MS = 25_000; // allow slower BT stacks on some Android devices
const PRINTER_DISCOVERY_TIMEOUT_MS = 12_000;
const PRINT_DISPATCH_GRACE_MS = 3_500;
const POS_ADDRESS_LINE_FEED_MM = "6"; // mirror A4 address line height (SIZE_ADDRESS(12) * 0.5 = 6mm)
const PRINTER_CHARS_PER_LINE = 32; // plugin uses printerNbrCharactersPerLine=32 by default
const PREFERRED_PRINTER_NAME = "KPC307-UEWB-63DA";
const PREFERRED_PRINTER_ADDRESS = "00:29:F3:4F:63:DA";
const AGENT_DEBUG_INGEST_URL =
  "http://127.0.0.1:7242/ingest/ee5546e0-5de3-43aa-a6c6-7022a2b471d7";
const AGENT_RUN_ID = `pos_match_pre_${Date.now()}`;

type PrinterInfoLike = {
  address?: string;
  name?: string;
  bondState?: string;
  type?: string;
  deviceClass?: string;
  majorDeviceClass?: string;
};

type PrinterCandidate = {
  key: string;
  address: string;
  name: string;
  bondState: string;
  type: string;
};

function readSavedPrinter(): SavedPosPrinter | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SAVED_PRINTER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedPosPrinter;
    if (!parsed || !parsed.id) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function getSavedPosPrinter(): SavedPosPrinter | null {
  return readSavedPrinter();
}

export function savePosPrinter(printer: SavedPosPrinter): void {
  if (typeof window === "undefined") return;
  if (!printer?.id) return;
  const normalized: SavedPosPrinter = {
    ...printer,
    type: printer.type || "bluetooth",
    driver: "escpos",
  };
  window.localStorage.setItem(SAVED_PRINTER_KEY, JSON.stringify(normalized));
}

export function clearSavedPosPrinter(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SAVED_PRINTER_KEY);
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms / 1000}s`)),
      ms
    );
    promise
      .then((v) => { clearTimeout(timer); resolve(v); })
      .catch((e) => { clearTimeout(timer); reject(e); });
  });
}

function isPermissionError(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    m.includes("missing permission") ||
    m.includes("permission") ||
    m.includes("denied")
  );
}

async function loadPluginRobust(): Promise<{ plugin: typeof ESCPOSPlugin }> {
  // RawBT-like behavior: don't fail too early on first cold start.
  // Try once, warm up bridge, then retry.
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const cap = (globalThis as any)?.Capacitor;
      const pluginInBridge = !!cap?.Plugins?.ESCPOSPlugin;
      addPrinterLog("plugin.load", `Bridge plugin present: ${pluginInBridge}`);
      addPrinterLog("plugin.load", `Attempt ${attempt} starting`);
      // IMPORTANT: Do NOT wrap ESCPOSPlugin in an async-return Promise.
      // registerPlugin() proxy can behave like a thenable object in Promise resolution,
      // which causes artificial "Loading print plugin timed out" even when plugin exists.
      const plugin = ESCPOSPlugin;
      try {
        await withTimeout(plugin.echo({ value: "warmup" }), 5000, "Warming plugin");
        addPrinterLog("plugin.load", `Attempt ${attempt} warmup success`);
      } catch {
        // warmup is best-effort
        addPrinterLog("plugin.load", `Attempt ${attempt} warmup failed (ignored)`);
      }
      addPrinterLog("plugin.load", `Attempt ${attempt} success`);
      // Return plain wrapper object to avoid thenable-assimilation stalls.
      return { plugin };
    } catch (e) {
      lastErr = e;
      addPrinterLog("plugin.load", `Attempt ${attempt} failed`, String(e), "error");
      await new Promise((r) => setTimeout(r, 800));
    }
  }
  throw lastErr ?? new Error("Failed to load print plugin");
}

async function discoverBluetoothPrintersWithPermission(
  plugin: typeof ESCPOSPlugin
): Promise<Record<string, PrinterInfoLike>> {
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      addPrinterLog("printers.scan", `Scan attempt ${attempt} started`);
      // If permission is missing, plugin asks permission internally and may reject once.
      // Retry once after short wait so scan succeeds right after user grants it.
      const printersObj = await withTimeout(
        plugin.listPrinters({ type: "bluetooth" }),
        PRINTER_DISCOVERY_TIMEOUT_MS,
        "Searching for printers"
      );
      addPrinterLog("printers.scan", `Scan attempt ${attempt} success`);
      return printersObj as Record<string, PrinterInfoLike>;
    } catch (e: any) {
      lastErr = e;
      const msg = e?.message ?? String(e);
      addPrinterLog("printers.scan", `Scan attempt ${attempt} failed`, msg, "error");
      if (!isPermissionError(msg) || attempt === 2) break;
      await new Promise((r) => setTimeout(r, 1400));
    }
  }
  throw lastErr ?? new Error("Could not scan Bluetooth printers");
}

function normalizePrinters(printers: Record<string, PrinterInfoLike>): PrinterCandidate[] {
  return Object.entries(printers).map(([key, p]) => ({
    key,
    address: (p?.address ?? "").trim(),
    name: (p?.name ?? "").trim(),
    bondState: (p?.bondState ?? "").trim(),
    type: (p?.type ?? "").trim() || "bluetooth",
  }));
}

function pickBestPrinter(printers: PrinterCandidate[]): PrinterCandidate | null {
  if (!printers.length) return null;

  const saved = readSavedPrinter();
  if (saved?.id) {
    const savedMatch = printers.find(
      (p) =>
        p.key.toLowerCase() === saved.id.toLowerCase() ||
        p.address.toLowerCase() === saved.id.toLowerCase() ||
        p.name.toLowerCase() === saved.id.toLowerCase()
    );
    if (savedMatch) return savedMatch;
  }

  // 1) Prefer exact device reported by user
  const exact = printers.find(
    (p) =>
      p.address.toLowerCase() === PREFERRED_PRINTER_ADDRESS.toLowerCase() ||
      p.name.toLowerCase() === PREFERRED_PRINTER_NAME.toLowerCase()
  );
  if (exact) return exact;

  // 2) Prefer bonded printers with common POS naming
  const posNamedBonded = printers.find((p) => {
    const n = p.name.toLowerCase();
    return (
      p.bondState === "BOND_BONDED" &&
      (n.includes("kpc") || n.includes("pos") || n.includes("printer") || n.includes("epson"))
    );
  });
  if (posNamedBonded) return posNamedBonded;

  // 3) Any bonded device
  const bonded = printers.find((p) => p.bondState === "BOND_BONDED");
  if (bonded) return bonded;

  // 4) Fallback first
  return printers[0];
}

async function printWithVariants(
  plugin: typeof ESCPOSPlugin,
  printer: PrinterCandidate,
  text: string
): Promise<void> {
  const idCandidates = ["first", printer.key, printer.address, printer.name].filter(Boolean);
  const typeCandidates = [printer.type, "bluetooth"].filter(Boolean);

  const variants = idCandidates.flatMap((id) =>
    typeCandidates.flatMap((type) => [
      {
        type,
        id,
        text,
        mmFeedPaper: POS_ADDRESS_LINE_FEED_MM,
        initializeBeforeSend: true,
        sendDelay: "30",
        chunkSize: "512",
      },
      {
        type,
        id,
        text,
        address: printer.address || undefined,
        mmFeedPaper: POS_ADDRESS_LINE_FEED_MM,
        initializeBeforeSend: true,
        useEscPosAsterik: true,
        sendDelay: "60",
        chunkSize: "256",
      },
    ])
  );

  let lastError: unknown = null;
  for (const payload of variants) {
    try {
      addPrinterLog("print.variant", "Trying print payload", {
        id: payload.id,
        type: payload.type,
        sendDelay: payload.sendDelay,
        chunkSize: payload.chunkSize,
        useEscPosAsterik: payload.useEscPosAsterik ?? false,
      });

      // #region agent log POS print payload
      fetch(AGENT_DEBUG_INGEST_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Debug-Session-Id": "9bc241",
        },
        body: JSON.stringify({
          sessionId: "9bc241",
          runId: AGENT_RUN_ID,
          hypothesisId: "C_pos_mmfeed_variant",
          location: "src/lib/pos-bluetooth-print.ts",
          message: "Trying printFormattedText payload",
          data: {
            printerKey: printer.key,
            printerAddress: printer.address,
            variantId: payload.id,
            type: payload.type,
            mmFeedPaper: payload.mmFeedPaper,
            sendDelay: payload.sendDelay,
            chunkSize: payload.chunkSize,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion

      await dispatchPrint(plugin, payload);
      addPrinterLog("print.variant", "Print payload succeeded", {
        id: payload.id,
        type: payload.type,
      });
      return;
    } catch (e) {
      lastError = e;
      addPrinterLog("print.variant", "Print payload failed", String(e), "error");
    }
  }
  throw lastError ?? new Error("All print variants failed");
}

async function dispatchPrint(
  plugin: typeof ESCPOSPlugin,
  payload: Parameters<typeof ESCPOSPlugin.printFormattedText>[0]
): Promise<void> {
  // Plugin quirk: Android implementation rejects on error, but does not resolve on success.
  // We treat "no reject within grace period" as dispatched successfully.
  let rejectedError: unknown = null;
  let resolved = false;

  const op = plugin.printFormattedText(payload)
    .then(() => {
      resolved = true;
    })
    .catch((e) => {
      rejectedError = e;
    });

  const grace = withTimeout(
    new Promise<void>((resolve) => {
      setTimeout(resolve, PRINT_DISPATCH_GRACE_MS);
    }),
    PRINT_TIMEOUT_MS,
    "Printing"
  );

  await Promise.race([op, grace]);

  if (rejectedError) {
    addPrinterLog("print.dispatch", "Plugin rejected print", String(rejectedError), "error");
    throw rejectedError;
  }
  if (resolved) {
    addPrinterLog("print.dispatch", "Plugin resolved print");
    return;
  }
  // If still pending after grace and no rejection, treat as sent to printer.
  addPrinterLog("print.dispatch", "Plugin did not reject; treated as dispatched");
}

async function dispatchPdfPrint(
  plugin: typeof ESCPOSPlugin,
  payload: Record<string, unknown>
): Promise<void> {
  let rejectedError: unknown = null;
  let resolved = false;
  const op = (plugin as any).printPdfBase64(payload)
    .then(() => {
      resolved = true;
    })
    .catch((e: unknown) => {
      rejectedError = e;
    });

  const grace = withTimeout(
    new Promise<void>((resolve) => setTimeout(resolve, PRINT_DISPATCH_GRACE_MS)),
    PRINT_TIMEOUT_MS,
    "Printing PDF"
  );

  await Promise.race([op, grace]);
  if (rejectedError) throw rejectedError;
  if (resolved) return;
}

async function printPdfWithVariants(
  plugin: typeof ESCPOSPlugin,
  printer: PrinterCandidate,
  pdfBase64: string
): Promise<void> {
  const idCandidates = ["first", printer.key, printer.address, printer.name].filter(Boolean);
  const uniqueIds = Array.from(new Set(idCandidates));

  const variants = uniqueIds.flatMap((id) => [
    {
      type: "bluetooth", // force plugin transport type; scanned `type` can be numeric like "3"
      id,
      address: printer.address || undefined,
      pdfBase64,
      mmFeedPaper: POS_ADDRESS_LINE_FEED_MM,
      initializeBeforeSend: true,
      sendDelay: "40",
      chunkSize: "512",
      printerDpi: 203,
      printerWidthMM: 72,
      printerNbrCharactersPerLine: 48,
    },
    {
      type: "bluetooth",
      id,
      pdfBase64,
      mmFeedPaper: POS_ADDRESS_LINE_FEED_MM,
      initializeBeforeSend: true,
      useEscPosAsterik: true,
      sendDelay: "60",
      chunkSize: "256",
      printerDpi: 203,
      printerWidthMM: 72,
      printerNbrCharactersPerLine: 48,
    },
  ]);

  let lastError: unknown = null;
  for (const payload of variants) {
    try {
      addPrinterLog("print.pdf.variant", "Trying PDF print payload", {
        id: payload.id,
        type: payload.type,
        address: payload.address ?? null,
        sendDelay: payload.sendDelay,
        chunkSize: payload.chunkSize,
        useEscPosAsterik: payload.useEscPosAsterik ?? false,
      });

      // #region agent log PDF variant attempt
      fetch(AGENT_DEBUG_INGEST_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "9bc241" },
        body: JSON.stringify({
          sessionId: "9bc241",
          runId: AGENT_RUN_ID,
          hypothesisId: "F_pdf_variant_fallback",
          location: "src/lib/pos-bluetooth-print.ts",
          message: "Trying printPdfBase64 variant",
          data: {
            id: payload.id,
            type: payload.type,
            address: payload.address ?? null,
            sendDelay: payload.sendDelay,
            chunkSize: payload.chunkSize,
            useEscPosAsterik: payload.useEscPosAsterik ?? false,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion

      await dispatchPdfPrint(plugin, payload);
      addPrinterLog("print.pdf.variant", "PDF print payload succeeded", {
        id: payload.id,
        type: payload.type,
      });
      return;
    } catch (e) {
      lastError = e;
      addPrinterLog("print.pdf.variant", "PDF print payload failed", String(e), "error");
    }
  }
  throw lastError ?? new Error("All PDF print variants failed");
}

export async function listBluetoothPrinters(): Promise<{ success: boolean; printers: SavedPosPrinter[]; error?: string }> {
  if (!Capacitor.isNativePlatform()) {
    addPrinterLog("printers.scan", "Not native platform", undefined, "error");
    return { success: false, printers: [], error: "Bluetooth printer setup is only available in Android app." };
  }
  try {
    addPrinterLog("printers.scan", "Scan flow started");
    const { plugin } = await loadPluginRobust();
    addPrinterLog("printers.scan", "Plugin loaded");
    // Skip bluetoothIsEnabled() pre-check; this can hang on some Android stacks.
    // listPrinters() in the native plugin already validates Bluetooth state.
    addPrinterLog("printers.scan", "Skipping bluetoothIsEnabled pre-check");
    addPrinterLog("printers.scan", "Starting printer discovery");
    const printersObj = await discoverBluetoothPrintersWithPermission(plugin);
    const printers = normalizePrinters(printersObj as Record<string, PrinterInfoLike>).map((p) => ({
      id: p.address || p.name || p.key,
      name: p.name,
      address: p.address,
      type: "bluetooth",
      driver: "escpos" as const,
    }));
    addPrinterLog("printers.scan", "Printers discovered", {
      count: printers.length,
      items: printers.map((p) => ({ id: p.id, name: p.name, address: p.address })),
    });
    return { success: true, printers };
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    addPrinterLog("printers.scan", "Scan failed", msg, "error");
    const isPluginLoadTimeout = msg.toLowerCase().includes("loading print plugin timed out");
    return {
      success: false,
      printers: [],
      error: isPluginLoadTimeout
        ? "Printer plugin not available in this app build. Please install the latest APK build (native rebuild required)."
        : msg,
    };
  }
}

export async function testSavedPosPrinter(): Promise<PrintResult> {
  if (!Capacitor.isNativePlatform()) {
    addPrinterLog("printer.test", "Not native platform", undefined, "error");
    return {
      success: false,
      error: "Printer test is only available in the Android app.",
    };
  }
  try {
    const { plugin } = await loadPluginRobust();
    // Skip bluetoothIsEnabled() pre-check; this can hang on some Android stacks.
    addPrinterLog("printer.test", "Skipping bluetoothIsEnabled pre-check");

    const printersObj = await discoverBluetoothPrintersWithPermission(plugin);
    const printerEntries = normalizePrinters(printersObj as Record<string, PrinterInfoLike>);
    const printer = pickBestPrinter(printerEntries);
    if (!printer) {
      addPrinterLog("printer.test", "No usable printer found", undefined, "error");
      return { success: false, error: "No usable Bluetooth printer found." };
    }
    addPrinterLog("printer.test", "Using printer", {
      key: printer.key,
      name: printer.name,
      address: printer.address,
      bondState: printer.bondState,
      type: printer.type,
    });

    const testText = [
      "[C]<b>Saree Order App</b>",
      "[C]POS Printer Test",
      "[L]Printer: " + (printer.name || "Unknown"),
      "[L]Address: " + (printer.address || "N/A"),
      "[L]Status: Connected",
      "",
      "------------------------------",
      "",
    ].join("\n");

    await printWithVariants(plugin, printer, testText);
    addPrinterLog("printer.test", "Test print sent");
    return { success: true };
  } catch (e: any) {
    addPrinterLog("printer.test", "Test print failed", e?.message ?? String(e), "error");
    return { success: false, error: e?.message ?? String(e) };
  }
}

function formatOrderForEscPos(order: Order, normalize: boolean): string {
  const rawFrom = order.sender_details ?? "";
  const rawTo = order.recipient_details ?? "";
  const from = normalize ? normalizeAddressBlock(rawFrom) : rawFrom;
  const to = normalize ? normalizeAddressBlock(rawTo) : rawTo;

  const SEPARATOR = "--------------------------------";

  // Wrap each normalized address line to the printer width so it matches PDF wrapping better.
  const wrapLine = (s: string): string => {
    const words = (s || "").trim().split(/\s+/g).filter(Boolean);
    if (words.length <= 1) {
      const str = (s || "").trim();
      return str.length > PRINTER_CHARS_PER_LINE
        ? str.match(new RegExp(`.{1,${PRINTER_CHARS_PER_LINE}}`, "g"))?.join("\n") ?? str
        : str;
    }
    const out: string[] = [];
    let cur = "";
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (next.length > PRINTER_CHARS_PER_LINE) {
        if (cur) out.push(cur);
        cur = w;
      } else {
        cur = next;
      }
    }
    if (cur) out.push(cur);
    return out.join("\n");
  };

  const wrappedFrom = (from || "").split("\n").map((l) => wrapLine(l)).join("\n");
  const wrappedTo = (to || "").split("\n").map((l) => wrapLine(l)).join("\n");

  // POS PDF address block is only: FROM | logo/text | TO
  // So for POS Bluetooth printing we keep the same: remove courier/qty and print a centered logo placeholder.
  const lines: string[] = [
    SEPARATOR,
    "[L]<b>FROM:</b>",
    `[L]${wrappedFrom.replace(/\n/g, "\n[L]")}`,
    "",
    "[C]Thank you for your purchase",
    "[C]Warm wishes from Saree Orders",
    "",
    SEPARATOR,
    "[L]<b>TO:</b>",
    `[L]${wrappedTo.replace(/\n/g, "\n[L]")}`,
    "",
    SEPARATOR,
    "",
  ];

  const printableLines = lines
    .map((l) => l.replace(/\[(L|C|R)\]/g, "").replace(/<[^>]+>/g, ""))
    .filter((l) => l.trim().length > 0);
  const maxPrintableLineLen = printableLines.reduce((m, l) => Math.max(m, l.length), 0);
  const centerLines = lines.filter((l) => l.startsWith("[C]")).length;
  const leftLines = lines.filter((l) => l.startsWith("[L]")).length;

  // #region agent log POS formatted text
  fetch(AGENT_DEBUG_INGEST_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "9bc241",
    },
    body: JSON.stringify({
      sessionId: "9bc241",
      runId: AGENT_RUN_ID,
      hypothesisId: "B_pos_text_layout",
      location: "src/lib/pos-bluetooth-print.ts",
      message: "Built POS formatted text for one order",
      data: {
        normalize,
        rawFromLen: rawFrom.length,
        rawToLen: rawTo.length,
        normalizedFromLineCount: (from || "").split("\n").filter(Boolean).length,
        normalizedToLineCount: (to || "").split("\n").filter(Boolean).length,
        formattedLineCount: lines.length,
        maxPrintableLineLen,
        centerLines,
        leftLines,
        separatorCount: lines.filter((l) => l === SEPARATOR).length,
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  return lines.join("\n");
}

export async function printOrdersViaBluetooth(
  orders: Order[],
  normalize = true
): Promise<PrintResult> {
  if (!Capacitor.isNativePlatform()) {
    addPrinterLog("orders.print", "Not native platform", undefined, "error");
    return {
      success: false,
      error: "Bluetooth printing is only available in the Android app.",
    };
  }

  try {
    const { plugin } = await loadPluginRobust();
    // Skip bluetoothIsEnabled() pre-check; this can hang on some Android stacks.
    addPrinterLog("orders.print", "Skipping bluetoothIsEnabled pre-check");

    const printers = await discoverBluetoothPrintersWithPermission(plugin);
    const printerEntries = normalizePrinters(printers as Record<string, PrinterInfoLike>);
    if (!printerEntries.length) {
      addPrinterLog("orders.print", "No paired printers found", undefined, "error");
      return {
        success: false,
        error: "No paired Bluetooth printers found. Please pair your POS printer first.",
      };
    }

    const printer = pickBestPrinter(printerEntries);
    if (!printer) {
      addPrinterLog("orders.print", "No usable printer", undefined, "error");
      return {
        success: false,
        error: "No usable Bluetooth printer found.",
      };
    }
    addPrinterLog("orders.print", "Selected printer", {
      key: printer.key,
      name: printer.name,
      address: printer.address,
      bondState: printer.bondState,
      type: printer.type,
      orders: orders.length,
    });

    // #region agent log POS selected printer
    fetch(AGENT_DEBUG_INGEST_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "9bc241",
      },
      body: JSON.stringify({
        sessionId: "9bc241",
        runId: AGENT_RUN_ID,
        hypothesisId: "A_pos_printer_selection",
        location: "src/lib/pos-bluetooth-print.ts",
        message: "Selected printer for POS print",
        data: {
          printerKey: printer.key,
          printerName: printer.name,
          printerAddress: printer.address,
          bondState: printer.bondState,
          ordersCount: orders.length,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    for (const order of orders) {
      const text = formatOrderForEscPos(order, normalize);
      await printWithVariants(plugin, printer, text);
    }

    return { success: true };
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    addPrinterLog("orders.print", "Print failed", msg, "error");
    if (msg.includes("timed out")) {
      return {
        success: false,
        error: "Printer not responding. Make sure the POS printer is turned on, paired, and nearby.",
      };
    }
    if (msg.toLowerCase().includes("connect") || msg.toLowerCase().includes("socket")) {
      return {
        success: false,
        error: "Could not connect to POS printer. Make sure it is turned on and paired.",
      };
    }
    return {
      success: false,
      error: `Printing failed: ${msg}`,
    };
  }
}

export async function printPdfBase64ViaBluetooth(pdfBase64: string): Promise<PrintResult> {
  if (!Capacitor.isNativePlatform()) {
    return { success: false, error: "Bluetooth printing is only available in the Android app." };
  }
  try {
    // #region agent log PDF direct print entry
    fetch(AGENT_DEBUG_INGEST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "9bc241" },
      body: JSON.stringify({
        sessionId: "9bc241",
        runId: AGENT_RUN_ID,
        hypothesisId: "D_pdf_raster_entry",
        location: "src/lib/pos-bluetooth-print.ts",
        message: "Starting printPdfBase64ViaBluetooth",
        data: { pdfBase64Length: pdfBase64.length },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    const { plugin } = await loadPluginRobust();
    const printers = await discoverBluetoothPrintersWithPermission(plugin);
    const printerEntries = normalizePrinters(printers as Record<string, PrinterInfoLike>);
    if (!printerEntries.length) {
      return {
        success: false,
        error: "No paired Bluetooth printers found. Please pair your POS printer first.",
      };
    }
    const printer = pickBestPrinter(printerEntries);
    if (!printer) {
      return { success: false, error: "No usable Bluetooth printer found." };
    }
    if (typeof (plugin as any).printPdfBase64 !== "function") {
      return {
        success: false,
        error:
          "Printer plugin not updated in this build. Please install the latest APK with native plugin patch.",
      };
    }

    // #region agent log PDF direct print payload
    fetch(AGENT_DEBUG_INGEST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "9bc241" },
      body: JSON.stringify({
        sessionId: "9bc241",
        runId: AGENT_RUN_ID,
        hypothesisId: "E_pdf_raster_payload",
        location: "src/lib/pos-bluetooth-print.ts",
        message: "Dispatching printPdfBase64 payload",
        data: {
          printerKey: printer.key,
          printerName: printer.name,
          printerAddress: printer.address,
          forcedTransportType: "bluetooth",
          pluginMethodPresent: typeof (plugin as any).printPdfBase64 === "function",
          idCandidates: ["first", printer.key, printer.address, printer.name].filter(Boolean),
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    await printPdfWithVariants(plugin, printer, pdfBase64);
    return { success: true };
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    return { success: false, error: `Printing failed: ${msg}` };
  }
}
