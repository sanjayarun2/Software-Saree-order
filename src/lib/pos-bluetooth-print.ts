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
const PREFERRED_PRINTER_NAME = "KPC307-UEWB-63DA";
const PREFERRED_PRINTER_ADDRESS = "00:29:F3:4F:63:DA";

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

async function getPlugin() {
  return ESCPOSPlugin;
}

async function loadPluginRobust() {
  // RawBT-like behavior: don't fail too early on first cold start.
  // Try once, warm up bridge, then retry.
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const cap = (globalThis as any)?.Capacitor;
      const pluginInBridge = !!cap?.Plugins?.ESCPOSPlugin;
      addPrinterLog("plugin.load", `Bridge plugin present: ${pluginInBridge}`);
      addPrinterLog("plugin.load", `Attempt ${attempt} starting`);
      const plugin = await withTimeout(getPlugin(), PLUGIN_LOAD_TIMEOUT_MS, "Loading print plugin");
      try {
        await withTimeout(plugin.echo({ value: "warmup" }), 5000, "Warming plugin");
        addPrinterLog("plugin.load", `Attempt ${attempt} warmup success`);
      } catch {
        // warmup is best-effort
        addPrinterLog("plugin.load", `Attempt ${attempt} warmup failed (ignored)`);
      }
      addPrinterLog("plugin.load", `Attempt ${attempt} success`);
      return plugin;
    } catch (e) {
      lastErr = e;
      addPrinterLog("plugin.load", `Attempt ${attempt} failed`, String(e), "error");
      await new Promise((r) => setTimeout(r, 800));
    }
  }
  throw lastErr ?? new Error("Failed to load print plugin");
}

async function discoverBluetoothPrintersWithPermission(
  plugin: Awaited<ReturnType<typeof getPlugin>>
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
  plugin: Awaited<ReturnType<typeof getPlugin>>,
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
        mmFeedPaper: "20",
        initializeBeforeSend: true,
        sendDelay: "30",
        chunkSize: "512",
      },
      {
        type,
        id,
        text,
        address: printer.address || undefined,
        mmFeedPaper: "20",
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
  plugin: Awaited<ReturnType<typeof getPlugin>>,
  payload: Parameters<Awaited<ReturnType<typeof getPlugin>>["printFormattedText"]>[0]
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

export async function listBluetoothPrinters(): Promise<{ success: boolean; printers: SavedPosPrinter[]; error?: string }> {
  if (!Capacitor.isNativePlatform()) {
    addPrinterLog("printers.scan", "Not native platform", undefined, "error");
    return { success: false, printers: [], error: "Bluetooth printer setup is only available in Android app." };
  }
  try {
    const plugin = await loadPluginRobust();
    const { result: isEnabled } = await withTimeout(
      plugin.bluetoothIsEnabled(),
      5000,
      "Checking Bluetooth status"
    );
    if (!isEnabled) {
      addPrinterLog("printers.scan", "Bluetooth is OFF", undefined, "error");
      return { success: false, printers: [], error: "Bluetooth is turned off." };
    }
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
    const plugin = await loadPluginRobust();
    const { result: isEnabled } = await withTimeout(
      plugin.bluetoothIsEnabled(),
      5000,
      "Checking Bluetooth status"
    );
    if (!isEnabled) {
      addPrinterLog("printer.test", "Bluetooth is OFF", undefined, "error");
      return { success: false, error: "Bluetooth is turned off." };
    }

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
  const lines: string[] = [
    SEPARATOR,
    "[C]<b>FROM:</b>",
    `[L]${from.replace(/\n/g, "\n[L]")}`,
    "",
    SEPARATOR,
    "[C]<b>TO:</b>",
    `[L]${to.replace(/\n/g, "\n[L]")}`,
    "",
    SEPARATOR,
  ];

  if (order.courier_name) {
    lines.push(`[L]Courier: ${order.courier_name}`);
  }
  if (order.quantity) {
    lines.push(`[L]Qty: ${order.quantity}`);
  }
  lines.push(SEPARATOR);
  lines.push(""); // feed

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
    const plugin = await loadPluginRobust();

    const { result: isEnabled } = await withTimeout(
      plugin.bluetoothIsEnabled(), 5000, "Checking Bluetooth status"
    );
    if (!isEnabled) {
      addPrinterLog("orders.print", "Bluetooth is OFF", undefined, "error");
      return {
        success: false,
        error: "Bluetooth is turned off. Please enable Bluetooth on your device.",
      };
    }

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
