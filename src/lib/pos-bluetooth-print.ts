import { Capacitor } from "@capacitor/core";
import type { Order } from "./db-types";
import { normalizeAddressBlock } from "./pdf-utils";

interface PrintResult {
  success: boolean;
  error?: string;
}

async function getPlugin() {
  const { ESCPOSPlugin } = await import("@albgen/capacitor-escpos-plugin");
  return ESCPOSPlugin;
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
    const plugin = await getPlugin();

    const { result: hasPerms } = await plugin.bluetoothHasPermissions();
    if (!hasPerms) {
      return {
        success: false,
        error: "Bluetooth permission not granted. Please enable Bluetooth permissions in your device settings.",
      };
    }

    const { result: isEnabled } = await plugin.bluetoothIsEnabled();
    if (!isEnabled) {
      return {
        success: false,
        error: "Bluetooth is turned off. Please enable Bluetooth on your device.",
      };
    }

    const printers = await plugin.listPrinters({ type: "bluetooth" });
    const printerEntries = Object.values(printers);
    if (!printerEntries.length) {
      return {
        success: false,
        error: "No paired Bluetooth printers found. Please pair your POS printer first.",
      };
    }

    // Use the first bonded printer found
    const printer = printerEntries.find((p) => p.bondState === "BOND_BONDED") ?? printerEntries[0];

    for (const order of orders) {
      const text = formatOrderForEscPos(order, normalize);
      await plugin.printFormattedText({
        type: "bluetooth",
        id: printer.address,
        text,
        mmFeedPaper: "20",
        initializeBeforeSend: true,
      });
    }

    return { success: true };
  } catch (e: any) {
    const msg = e?.message ?? String(e);
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
