export type ProductSyncLogEntry = {
  id: string;
  at: string;
  action: string;
  requestId: string;
  ok: boolean;
  message: string;
  details?: string;
};

const STORAGE_KEY = "velo_product_sync_logs";
const MAX_LOGS = 200;

function readLogs(): ProductSyncLogEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ProductSyncLogEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLogs(logs: ProductSyncLogEntry[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(logs.slice(0, MAX_LOGS)));
}

export function appendProductSyncLog(
  entry: Omit<ProductSyncLogEntry, "id" | "at">
): ProductSyncLogEntry {
  const full: ProductSyncLogEntry = {
    ...entry,
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
  };
  const logs = [full, ...readLogs()].slice(0, MAX_LOGS);
  writeLogs(logs);
  return full;
}

export function listProductSyncLogs(): ProductSyncLogEntry[] {
  return readLogs();
}

export function clearProductSyncLogs() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}
