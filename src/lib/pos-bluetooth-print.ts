import { Capacitor } from "@capacitor/core";
import type { Order } from "./db-types";
import { normalizeAddressBlock } from "./pdf-utils";

interface PrintResult {
  success: boolean;
  error?: string;
}

const PRINT_TIMEOUT_MS = 25_000; // allow slower BT stacks on some Android devices
const PRINTER_DISCOVERY_TIMEOUT_MS = 12_000;
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

async function getPlugin() {
  const { ESCPOSPlugin } = await import("@albgen/capacitor-escpos-plugin");
  return ESCPOSPlugin;
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
  const idCandidates = [printer.key, printer.address, printer.name].filter(Boolean);
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
      await withTimeout(plugin.printFormattedText(payload), PRINT_TIMEOUT_MS, "Printing");
      return;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError ?? new Error("All print variants failed");
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
    return {
      success: false,
      error: "Bluetooth printing is only available in the Android app.",
    };
  }

  try {
    const plugin = await withTimeout(getPlugin(), 5000, "Loading print plugin");

    const { result: hasPerms } = await withTimeout(
      plugin.bluetoothHasPermissions(), 5000, "Checking Bluetooth permissions"
    );
    if (!hasPerms) {
      return {
        success: false,
        error: "Bluetooth permission not granted. Please enable Bluetooth permissions in your device settings.",
      };
    }

    const { result: isEnabled } = await withTimeout(
      plugin.bluetoothIsEnabled(), 5000, "Checking Bluetooth status"
    );
    if (!isEnabled) {
      return {
        success: false,
        error: "Bluetooth is turned off. Please enable Bluetooth on your device.",
      };
    }

    const printers = await withTimeout(
      plugin.listPrinters({ type: "bluetooth" }), PRINTER_DISCOVERY_TIMEOUT_MS, "Searching for printers"
    );
    const printerEntries = normalizePrinters(printers as Record<string, PrinterInfoLike>);
    if (!printerEntries.length) {
      return {
        success: false,
        error: "No paired Bluetooth printers found. Please pair your POS printer first.",
      };
    }

    const printer = pickBestPrinter(printerEntries);
    if (!printer) {
      return {
        success: false,
        error: "No usable Bluetooth printer found.",
      };
    }

    for (const order of orders) {
      const text = formatOrderForEscPos(order, normalize);
      await printWithVariants(plugin, printer, text);
    }

    return { success: true };
  } catch (e: any) {
    const msg = e?.message ?? String(e);
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
