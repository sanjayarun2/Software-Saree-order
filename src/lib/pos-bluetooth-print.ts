import { Capacitor } from "@capacitor/core";
import { ESCPOSPlugin } from "@albgen/capacitor-escpos-plugin";
import type { Order } from "./db-types";
import { prepareAddressForPdf } from "./pdf-utils";
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
const PRINT_PROFILE_KEY = "saree_pos_print_profile_v1";
const PRINT_TIMEOUT_MS = 25_000; // allow slower BT stacks on some Android devices
const PRINTER_DISCOVERY_TIMEOUT_MS = 12_000;
/** Text plugin often never resolves on success — short no-reject window = dispatched. */
const PRINT_TEXT_DISPATCH_GRACE_MS = 700;
/** Prefer zero inter-chunk delay; fall back only if a device needs slower pacing. */
const FAST_SEND_DELAY = "0";
const FAST_CHUNK_SIZE = "1024";
const FALLBACK_SEND_DELAY = "40";
const FALLBACK_CHUNK_SIZE = "512";
/** Feed before ESC/POS cut (0 = cut immediately after last dots; no extra blank). */
const POS_CUT_FEED_MM = "0";
const PRINTER_CHARS_PER_LINE = 32; // plugin uses printerNbrCharactersPerLine=32 by default
/** Must match POS PDF page width in pos-pdf-utils (SECTION_H / POS_PAGE_W = 74.25mm). */
const POS_PAPER_WIDTH_MM = 74.25;
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

type RememberedPrintProfile = {
  id: string;
  address?: string;
  sendDelay: string;
  chunkSize: string;
  useEscPosAsterik: boolean;
};

type PrinterSession = {
  plugin: typeof ESCPOSPlugin;
  printer: PrinterCandidate;
  pdfProfile: RememberedPrintProfile | null;
  textProfile: RememberedPrintProfile | null;
};

let printerSession: PrinterSession | null = null;
let sessionLoadInFlight: Promise<PrinterSession> | null = null;
let printQueue: Promise<void> = Promise.resolve();

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

function readRememberedProfiles(): {
  pdf: RememberedPrintProfile | null;
  text: RememberedPrintProfile | null;
} {
  if (typeof window === "undefined") return { pdf: null, text: null };
  try {
    const raw = window.localStorage.getItem(PRINT_PROFILE_KEY);
    if (!raw) return { pdf: null, text: null };
    const parsed = JSON.parse(raw) as {
      pdf?: RememberedPrintProfile | null;
      text?: RememberedPrintProfile | null;
    };
    return { pdf: parsed.pdf ?? null, text: parsed.text ?? null };
  } catch {
    return { pdf: null, text: null };
  }
}

function writeRememberedProfile(
  kind: "pdf" | "text",
  profile: RememberedPrintProfile
): void {
  if (typeof window === "undefined") return;
  try {
    const current = readRememberedProfiles();
    const next = { ...current, [kind]: profile };
    window.localStorage.setItem(PRINT_PROFILE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  if (printerSession) {
    if (kind === "pdf") printerSession.pdfProfile = profile;
    else printerSession.textProfile = profile;
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
  // Saved target changed — drop session so next print binds to the new device.
  printerSession = null;
}

export function clearSavedPosPrinter(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SAVED_PRINTER_KEY);
  window.localStorage.removeItem(PRINT_PROFILE_KEY);
  printerSession = null;
}

function candidateFromSaved(saved: SavedPosPrinter): PrinterCandidate {
  const address = (saved.address || saved.id || "").trim();
  const name = (saved.name || "").trim();
  const key = address || name || saved.id;
  return {
    key,
    address,
    name: name || address || saved.id,
    bondState: "BOND_BONDED",
    type: "bluetooth",
  };
}

function enqueuePrint<T>(job: () => Promise<T>): Promise<T> {
  const run = printQueue.then(job, job);
  printQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
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
        p.name.toLowerCase() === saved.id.toLowerCase() ||
        (saved.address &&
          p.address.toLowerCase() === saved.address.toLowerCase())
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

/**
 * Load plugin + printer once per app session.
 * Uses saved printer address immediately (no BT scan) when available.
 */
async function ensurePrinterSession(opts?: {
  forceRescan?: boolean;
}): Promise<PrinterSession> {
  const forceRescan = Boolean(opts?.forceRescan);
  if (printerSession && !forceRescan) {
    return printerSession;
  }
  if (sessionLoadInFlight && !forceRescan) {
    return sessionLoadInFlight;
  }

  const load = (async (): Promise<PrinterSession> => {
    const { plugin } = await loadPluginRobust();
    const remembered = readRememberedProfiles();
    const saved = readSavedPrinter();

    let printer: PrinterCandidate | null = null;
    if (!forceRescan && saved && (saved.address || saved.id)) {
      printer = candidateFromSaved(saved);
      addPrinterLog("session.load", "Using saved printer (skip scan)", {
        key: printer.key,
        address: printer.address,
        name: printer.name,
      });
    } else {
      addPrinterLog("session.load", forceRescan ? "Forced rescan" : "No saved printer; scanning");
      const printersObj = await discoverBluetoothPrintersWithPermission(plugin);
      const entries = normalizePrinters(printersObj as Record<string, PrinterInfoLike>);
      printer = pickBestPrinter(entries);
      if (printer && !saved) {
        savePosPrinter({
          id: printer.address || printer.key,
          address: printer.address,
          name: printer.name,
          type: "bluetooth",
          driver: "escpos",
        });
      }
    }

    if (!printer) {
      throw new Error("No usable Bluetooth printer found.");
    }

    const next: PrinterSession = {
      plugin,
      printer,
      pdfProfile: remembered.pdf,
      textProfile: remembered.text,
    };
    printerSession = next;
    addPrinterLog("session.load", "Printer session ready", {
      key: next.printer.key,
      address: next.printer.address,
      hasPdfProfile: Boolean(next.pdfProfile),
      hasTextProfile: Boolean(next.textProfile),
    });
    return next;
  })();

  sessionLoadInFlight = load;
  try {
    return await load;
  } finally {
    if (sessionLoadInFlight === load) sessionLoadInFlight = null;
  }
}

/** Optional warm-up from Printer Setup so the first order print is already hot. */
export async function warmPosPrinterSession(): Promise<PrintResult> {
  if (!Capacitor.isNativePlatform()) {
    return { success: false, error: "Printer warm-up is only available in the Android app." };
  }
  try {
    await ensurePrinterSession();
    return { success: true };
  } catch (e: any) {
    printerSession = null;
    return { success: false, error: e?.message ?? String(e) };
  }
}

function buildPdfPayload(
  printer: PrinterCandidate,
  pdfBase64: string,
  profile: Partial<RememberedPrintProfile> & { id: string }
): Record<string, unknown> {
  return {
    type: "bluetooth",
    id: profile.id,
    address: profile.address ?? (printer.address || undefined),
    pdfBase64,
    action: "printCut",
    cut: true,
    mmFeedPaper: POS_CUT_FEED_MM,
    initializeBeforeSend: true,
    sendDelay: profile.sendDelay ?? FAST_SEND_DELAY,
    chunkSize: profile.chunkSize ?? FAST_CHUNK_SIZE,
    useEscPosAsterik: profile.useEscPosAsterik ?? false,
    printerDpi: 203,
    printerWidthMM: POS_PAPER_WIDTH_MM,
    printerNbrCharactersPerLine: 48,
  };
}

function buildTextPayload(
  printer: PrinterCandidate,
  text: string,
  profile: Partial<RememberedPrintProfile> & { id: string }
): Parameters<typeof ESCPOSPlugin.printFormattedText>[0] {
  return {
    type: "bluetooth",
    id: profile.id,
    address: profile.address ?? (printer.address || undefined),
    text,
    action: "printCut",
    mmFeedPaper: POS_CUT_FEED_MM,
    initializeBeforeSend: true,
    sendDelay: profile.sendDelay ?? FAST_SEND_DELAY,
    chunkSize: profile.chunkSize ?? FAST_CHUNK_SIZE,
    useEscPosAsterik: profile.useEscPosAsterik ?? false,
  } as Parameters<typeof ESCPOSPlugin.printFormattedText>[0];
}

function pdfProfileCandidates(printer: PrinterCandidate): RememberedPrintProfile[] {
  const ids = Array.from(
    new Set(
      [printer.address, printer.key, printer.name, "first"].filter(
        (v): v is string => Boolean(v && String(v).trim())
      )
    )
  );
  const combos: Array<Pick<RememberedPrintProfile, "sendDelay" | "chunkSize" | "useEscPosAsterik">> = [
    { sendDelay: FAST_SEND_DELAY, chunkSize: FAST_CHUNK_SIZE, useEscPosAsterik: false },
    { sendDelay: FALLBACK_SEND_DELAY, chunkSize: FALLBACK_CHUNK_SIZE, useEscPosAsterik: false },
    { sendDelay: FALLBACK_SEND_DELAY, chunkSize: FALLBACK_CHUNK_SIZE, useEscPosAsterik: true },
  ];
  const out: RememberedPrintProfile[] = [];
  for (const id of ids) {
    for (const c of combos) {
      out.push({
        id,
        address: printer.address || undefined,
        ...c,
      });
    }
  }
  return out;
}

function textProfileCandidates(printer: PrinterCandidate): RememberedPrintProfile[] {
  return pdfProfileCandidates(printer);
}

async function dispatchPrint(
  plugin: typeof ESCPOSPlugin,
  payload: Parameters<typeof ESCPOSPlugin.printFormattedText>[0]
): Promise<void> {
  // Plugin quirk: Android rejects on error, but often does not resolve on success.
  let rejectedError: unknown = null;
  let resolved = false;

  const op = plugin
    .printFormattedText(payload)
    .then(() => {
      resolved = true;
    })
    .catch((e) => {
      rejectedError = e;
    });

  await Promise.race([
    op,
    new Promise<void>((resolve) => setTimeout(resolve, PRINT_TEXT_DISPATCH_GRACE_MS)),
  ]);

  if (rejectedError) {
    addPrinterLog("print.dispatch", "Plugin rejected print", String(rejectedError), "error");
    throw rejectedError;
  }
  if (resolved) {
    addPrinterLog("print.dispatch", "Plugin resolved print");
    return;
  }
  addPrinterLog("print.dispatch", "No reject within grace; treated as dispatched");
}

async function dispatchPdfPrint(
  plugin: typeof ESCPOSPlugin,
  payload: Record<string, unknown>
): Promise<void> {
  // printPdfBase64 resolves on success — await it (no artificial 3.5s grace).
  await withTimeout(
    (plugin as any).printPdfBase64(payload) as Promise<void>,
    PRINT_TIMEOUT_MS,
    "Printing PDF"
  );
}

async function printTextFast(
  plugin: typeof ESCPOSPlugin,
  printer: PrinterCandidate,
  text: string,
  remembered: RememberedPrintProfile | null
): Promise<void> {
  const tried = new Set<string>();
  const queue: RememberedPrintProfile[] = [];
  if (remembered) queue.push(remembered);
  for (const p of textProfileCandidates(printer)) queue.push(p);

  let lastError: unknown = null;
  for (const profile of queue) {
    const key = `${profile.id}|${profile.sendDelay}|${profile.chunkSize}|${profile.useEscPosAsterik}`;
    if (tried.has(key)) continue;
    tried.add(key);
    try {
      addPrinterLog("print.text", "Trying text profile", profile);
      await dispatchPrint(plugin, buildTextPayload(printer, text, profile));
      writeRememberedProfile("text", profile);
      addPrinterLog("print.text", "Text profile succeeded", profile);
      return;
    } catch (e) {
      lastError = e;
      addPrinterLog("print.text", "Text profile failed", String(e), "error");
      // Saved/direct id failed — invalidate session so next attempt can rescan.
      if (remembered && profile === remembered) {
        printerSession = null;
      }
    }
  }
  throw lastError ?? new Error("All text print profiles failed");
}

async function printPdfFast(
  plugin: typeof ESCPOSPlugin,
  printer: PrinterCandidate,
  pdfBase64: string,
  remembered: RememberedPrintProfile | null
): Promise<void> {
  const tried = new Set<string>();
  const queue: RememberedPrintProfile[] = [];
  if (remembered) queue.push(remembered);
  for (const p of pdfProfileCandidates(printer)) queue.push(p);

  let lastError: unknown = null;
  for (const profile of queue) {
    const key = `${profile.id}|${profile.sendDelay}|${profile.chunkSize}|${profile.useEscPosAsterik}`;
    if (tried.has(key)) continue;
    tried.add(key);
    try {
      addPrinterLog("print.pdf", "Trying PDF profile", profile);
      await dispatchPdfPrint(plugin, buildPdfPayload(printer, pdfBase64, profile));
      writeRememberedProfile("pdf", profile);
      addPrinterLog("print.pdf", "PDF profile succeeded", profile);
      return;
    } catch (e) {
      lastError = e;
      addPrinterLog("print.pdf", "PDF profile failed", String(e), "error");
      if (remembered && profile === remembered) {
        printerSession = null;
      }
    }
  }
  throw lastError ?? new Error("All PDF print profiles failed");
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
    return await enqueuePrint(async () => {
      const session = await ensurePrinterSession();
      const testText = [
        "[C]<b>Saree Order App</b>",
        "[C]POS Printer Test",
        "[L]Printer: " + (session.printer.name || "Unknown"),
        "[L]Address: " + (session.printer.address || "N/A"),
        "[L]Status: Connected",
        "",
        "------------------------------",
        "",
      ].join("\n");

      await printTextFast(
        session.plugin,
        session.printer,
        testText,
        session.textProfile
      );
      addPrinterLog("printer.test", "Test print sent");
      return { success: true };
    });
  } catch (e: any) {
    addPrinterLog("printer.test", "Test print failed", e?.message ?? String(e), "error");
    // First failure with saved-only session: rescan once then retry once.
    try {
      return await enqueuePrint(async () => {
        const session = await ensurePrinterSession({ forceRescan: true });
        const testText = [
          "[C]<b>Saree Order App</b>",
          "[C]POS Printer Test",
          "[L]Printer: " + (session.printer.name || "Unknown"),
          "[L]Address: " + (session.printer.address || "N/A"),
          "[L]Status: Connected",
          "",
          "------------------------------",
          "",
        ].join("\n");
        await printTextFast(session.plugin, session.printer, testText, null);
        return { success: true };
      });
    } catch (e2: any) {
      return { success: false, error: e2?.message ?? e?.message ?? String(e) };
    }
  }
}

function formatOrderForEscPos(order: Order, normalize: boolean): string {
  const from = prepareAddressForPdf(order.sender_details ?? "", normalize, "from");
  const to = prepareAddressForPdf(
    order.recipient_details ?? "",
    normalize,
    "to",
    order.booked_mobile_no
  );

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
        rawFromLen: (order.sender_details ?? "").length,
        rawToLen: (order.recipient_details ?? "").length,
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
    return await enqueuePrint(async () => {
      let session = await ensurePrinterSession();
      addPrinterLog("orders.print", "Selected printer", {
        key: session.printer.key,
        name: session.printer.name,
        address: session.printer.address,
        orders: orders.length,
        reusedSession: true,
      });

      try {
        for (const order of orders) {
          const text = formatOrderForEscPos(order, normalize);
          await printTextFast(
            session.plugin,
            session.printer,
            text,
            session.textProfile
          );
        }
      } catch (firstErr) {
        addPrinterLog(
          "orders.print",
          "Fast path failed; rescanning once",
          String(firstErr),
          "error"
        );
        session = await ensurePrinterSession({ forceRescan: true });
        for (const order of orders) {
          const text = formatOrderForEscPos(order, normalize);
          await printTextFast(session.plugin, session.printer, text, null);
        }
      }

      return { success: true };
    });
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
    return await enqueuePrint(async () => {
      let session = await ensurePrinterSession();
      if (typeof (session.plugin as any).printPdfBase64 !== "function") {
        return {
          success: false,
          error:
            "Printer plugin not updated in this build. Please install the latest APK with native plugin patch.",
        };
      }

      addPrinterLog("orders.print", "PDF print via session", {
        key: session.printer.key,
        address: session.printer.address,
        hasProfile: Boolean(session.pdfProfile),
        pdfBase64Length: pdfBase64.length,
      });

      try {
        await printPdfFast(
          session.plugin,
          session.printer,
          pdfBase64,
          session.pdfProfile
        );
      } catch (firstErr) {
        addPrinterLog(
          "orders.print",
          "PDF fast path failed; rescanning once",
          String(firstErr),
          "error"
        );
        session = await ensurePrinterSession({ forceRescan: true });
        await printPdfFast(session.plugin, session.printer, pdfBase64, null);
      }
      return { success: true };
    });
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    return { success: false, error: `Printing failed: ${msg}` };
  }
}
