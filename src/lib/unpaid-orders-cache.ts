import type { UnpaidWebsiteOrder } from "./unpaid-website-orders";

const CACHE_VERSION = 1;
/** Serve instantly; background revalidate after this age. */
export const UNPAID_STALE_MS = 45_000;
/** Discard persisted entries older than this. */
export const UNPAID_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const STORAGE_PREFIX = "velo_unpaid_orders_v1";

type UnpaidCachePayload = {
  v: number;
  at: number;
  userId: string;
  orders: UnpaidWebsiteOrder[];
  warning: string | null;
};

export type UnpaidOrdersSnapshot = {
  orders: UnpaidWebsiteOrder[];
  warning: string | null;
  fetchedAt: number;
  isStale: boolean;
};

const memoryByUser = new Map<string, UnpaidCachePayload>();

function storageKey(userId: string) {
  return `${STORAGE_PREFIX}:${userId}`;
}

function readJson(key: string): UnpaidCachePayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as UnpaidCachePayload;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: UnpaidCachePayload) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / private mode */
  }
}

function toSnapshot(
  entry: UnpaidCachePayload,
  allowStale: boolean
): UnpaidOrdersSnapshot | null {
  if (entry.v !== CACHE_VERSION) return null;
  const age = Date.now() - entry.at;
  if (age > UNPAID_MAX_AGE_MS) return null;
  if (!allowStale && age > UNPAID_STALE_MS) return null;
  return {
    orders: entry.orders,
    warning: entry.warning,
    fetchedAt: entry.at,
    isStale: age > UNPAID_STALE_MS,
  };
}

/** Instant read: memory → localStorage (allows stale within 24h). */
export function peekUnpaidWebsiteOrdersCache(
  userId: string
): UnpaidOrdersSnapshot | null {
  const mem = memoryByUser.get(userId);
  if (mem && mem.userId === userId) {
    const snap = toSnapshot(mem, true);
    if (snap) return snap;
  }

  const stored = readJson(storageKey(userId));
  if (!stored || stored.userId !== userId) return null;
  const snap = toSnapshot(stored, true);
  if (!snap) return null;
  memoryByUser.set(userId, stored);
  return snap;
}

export function writeUnpaidWebsiteOrdersCache(
  userId: string,
  orders: UnpaidWebsiteOrder[],
  warning: string | null
): void {
  const payload: UnpaidCachePayload = {
    v: CACHE_VERSION,
    at: Date.now(),
    userId,
    orders,
    warning,
  };
  memoryByUser.set(userId, payload);
  writeJson(storageKey(userId), payload);
}

export function clearUnpaidWebsiteOrdersCache(userId: string): void {
  memoryByUser.delete(userId);
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(storageKey(userId));
  } catch {
    /* ignore */
  }
}
