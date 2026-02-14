/**
 * Disk cache for orders - Cache-First strategy.
 * Loads instantly from cache, then refreshes from Supabase in background.
 */
const CACHE_KEY = "saree_orders_cache";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export interface CachedEntry {
  data: unknown[];
  timestamp: number;
}

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage;
  } catch {
    return null;
  }
}

function cacheKey(userId: string, status: string, fromDate: string, toDate: string, allOrders: boolean): string {
  return `${CACHE_KEY}_${userId}_${status}_${allOrders ? "all" : `${fromDate}-${toDate}`}`;
}

export function getCachedOrders(
  userId: string,
  status: string,
  fromDate: string,
  toDate: string,
  allOrders: boolean
): unknown[] | null {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(cacheKey(userId, status, fromDate, toDate, allOrders));
    if (!raw) return null;
    const entry = JSON.parse(raw) as CachedEntry;
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) return null;
    return entry.data;
  } catch {
    return null;
  }
}

export function setCachedOrders(
  userId: string,
  status: string,
  fromDate: string,
  toDate: string,
  allOrders: boolean,
  data: unknown[]
): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    const entry: CachedEntry = { data, timestamp: Date.now() };
    storage.setItem(cacheKey(userId, status, fromDate, toDate, allOrders), JSON.stringify(entry));
  } catch {
    // ignore
  }
}
