export type PrinterDebugLevel = "info" | "error";

export type PrinterDebugEntry = {
  ts: string;
  level: PrinterDebugLevel;
  step: string;
  message: string;
  data?: unknown;
};

const STORAGE_KEY = "saree_printer_debug_logs_v1";
const MAX_LOGS = 100;

function readLogs(): PrinterDebugEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PrinterDebugEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLogs(logs: PrinterDebugEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(logs.slice(-MAX_LOGS)));
  } catch {
    // Never break app flow because of logging/storage limits.
  }
}

export function addPrinterLog(
  step: string,
  message: string,
  data?: unknown,
  level: PrinterDebugLevel = "info"
): void {
  try {
    const logs = readLogs();
    logs.push({
      ts: new Date().toISOString(),
      level,
      step,
      message,
      data,
    });
    writeLogs(logs);
  } catch {
    // Logging should never throw.
  }
}

export function getPrinterLogs(): PrinterDebugEntry[] {
  return readLogs();
}

export function clearPrinterLogs(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}

