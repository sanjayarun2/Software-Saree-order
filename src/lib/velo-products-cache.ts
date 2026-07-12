import type { VeloProductListItem } from "./velo-products-types";

const CACHE_VERSION = 1;
/** Serve from cache instantly; revalidate after this (stale-while-revalidate). */
export const LIST_STALE_MS = 60 * 1000;
/** Discard cache entries older than this (gc). */
export const LIST_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const COLLECTIONS_STALE_MS = 5 * 60 * 1000;
const COLLECTIONS_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const LIST_PREFIX = "velo_products_list_v1";
const LIST_DEFAULT_KEY = "velo_products_default_v1";
const LIST_LRU_PREFIX = "velo_products_list_lru_v1";
const COLLECTIONS_PREFIX = "velo_products_collections_v1";
/** Max persisted search/list keys per user (LRU eviction). */
const MAX_PERSISTED_LIST_KEYS = 48;

type ListCachePayload = {
  v: number;
  at: number;
  products: VeloProductListItem[];
  total: number;
  hasMore: boolean;
};

type CollectionsCachePayload = {
  v: number;
  at: number;
  items: { id: string; label: string; slug: string }[];
};

export type ProductsListSnapshot = {
  products: VeloProductListItem[];
  total: number;
  hasMore: boolean;
  fetchedAt: number;
  isStale: boolean;
};

export type ProductsListQueryOpts = {
  search?: string;
  draft?: "all" | "draft" | "published" | string;
  page?: number;
  pageSize?: number;
};

const memoryListCache = new Map<string, ListCachePayload>();
const memoryCollectionsCache = new Map<string, CollectionsCachePayload>();

export function normalizeIsDraft(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (value === "true" || value === "1") return true;
  return false;
}

export function normalizeProductListItem(item: VeloProductListItem): VeloProductListItem {
  const raw = item as VeloProductListItem & Record<string, unknown>;
  const imageUrl =
    (typeof raw.imageUrl === "string" && raw.imageUrl.trim()) ||
    null;
  // Prefer explicit imageUrl; also accept alternate shop field names if present.
  let resolved = imageUrl;
  if (!resolved) {
    for (const key of ["thumbnailUrl", "featuredImageUrl", "image", "thumbnail"]) {
      const v = raw[key];
      if (typeof v === "string" && /^https?:\/\//i.test(v.trim())) {
        resolved = v.trim();
        break;
      }
      if (v && typeof v === "object") {
        const nested = v as Record<string, unknown>;
        const url = nested.url ?? nested.src;
        if (typeof url === "string" && /^https?:\/\//i.test(url.trim())) {
          resolved = url.trim();
          break;
        }
      }
    }
  }
  return {
    ...item,
    isDraft: normalizeIsDraft(item.isDraft),
    imageUrl: resolved,
  };
}

export function listCacheKey(userId: string, opts: ProductsListQueryOpts): string {
  const search = (opts.search ?? "").trim().toLowerCase();
  const draft = opts.draft ?? "all";
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? 20;
  return `${LIST_PREFIX}:${userId}:${draft}:${page}:${pageSize}:${search}`;
}

function listLruIndexKey(userId: string) {
  return `${LIST_LRU_PREFIX}:${userId}`;
}

function isDefaultListQuery(opts: ProductsListQueryOpts) {
  const search = (opts.search ?? "").trim();
  const draft = opts.draft ?? "all";
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? 20;
  return page === 1 && pageSize === 20 && !search && draft === "all";
}

function collectionsCacheKey(userId: string) {
  return `${COLLECTIONS_PREFIX}:${userId}`;
}

function readJson<T>(key: string, storage: Storage): T | null {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown, storage: Storage) {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota or private mode */
  }
}

function payloadToSnapshot(
  entry: ListCachePayload,
  allowStale: boolean
): ProductsListSnapshot | null {
  if (entry.v !== CACHE_VERSION) return null;
  const age = Date.now() - entry.at;
  if (!allowStale && age > LIST_STALE_MS) return null;
  if (age > LIST_MAX_AGE_MS) return null;
  return {
    products: entry.products.map(normalizeProductListItem),
    total: entry.total,
    hasMore: entry.hasMore,
    fetchedAt: entry.at,
    isStale: age > LIST_STALE_MS,
  };
}

function readListEntry(
  userId: string,
  opts: ProductsListQueryOpts,
  allowStale: boolean
): ProductsListSnapshot | null {
  const key = listCacheKey(userId, opts);

  const memory = memoryListCache.get(key);
  if (memory) {
    const snap = payloadToSnapshot(memory, allowStale);
    if (snap) return snap;
  }

  if (typeof window === "undefined") return null;

  const sessionEntry = readJson<ListCachePayload>(key, sessionStorage);
  if (sessionEntry) {
    const snap = payloadToSnapshot(sessionEntry, allowStale);
    if (snap) {
      memoryListCache.set(key, sessionEntry);
      return snap;
    }
  }

  const localEntry =
    readJson<ListCachePayload>(key, localStorage) ??
    (isDefaultListQuery(opts)
      ? readJson<ListCachePayload>(`${LIST_DEFAULT_KEY}:${userId}`, localStorage)
      : null);
  if (localEntry) {
    const snap = payloadToSnapshot(localEntry, allowStale);
    if (snap) {
      memoryListCache.set(key, localEntry);
      return snap;
    }
  }

  return null;
}

function touchListLru(userId: string, cacheKey: string) {
  if (typeof window === "undefined") return;
  const indexKey = listLruIndexKey(userId);
  const prev = readJson<string[]>(indexKey, localStorage) ?? [];
  const next = [cacheKey, ...prev.filter((k) => k !== cacheKey)].slice(0, MAX_PERSISTED_LIST_KEYS);
  writeJson(indexKey, next, localStorage);

  const keep = new Set(next);
  keep.add(`${LIST_DEFAULT_KEY}:${userId}`);
  for (const oldKey of prev) {
    if (!keep.has(oldKey) && oldKey.startsWith(`${LIST_PREFIX}:${userId}:`)) {
      try {
        localStorage.removeItem(oldKey);
        sessionStorage.removeItem(oldKey);
      } catch {
        /* ignore */
      }
    }
  }
}

export function peekVeloProductsList(
  userId: string,
  opts: ProductsListQueryOpts = {}
): ProductsListSnapshot | null {
  return readListEntry(userId, opts, true);
}

/** Fresh cache only (within LIST_STALE_MS). */
export function readProductsListCache(
  userId: string,
  opts: ProductsListQueryOpts
): ProductsListSnapshot | null {
  return readListEntry(userId, opts, false);
}

export function shouldRevalidateProductsList(snapshot: ProductsListSnapshot | null): boolean {
  if (!snapshot) return true;
  return snapshot.isStale;
}

export function writeProductsListCache(
  userId: string,
  opts: ProductsListQueryOpts,
  data: { products: VeloProductListItem[]; total: number; hasMore: boolean }
) {
  const key = listCacheKey(userId, opts);
  const entry: ListCachePayload = {
    v: CACHE_VERSION,
    at: Date.now(),
    products: data.products.map(normalizeProductListItem),
    total: data.total,
    hasMore: data.hasMore,
  };

  memoryListCache.set(key, entry);

  if (typeof window === "undefined") return;

  writeJson(key, entry, sessionStorage);
  const page = opts.page ?? 1;
  if (page === 1) {
    writeJson(key, entry, localStorage);
    touchListLru(userId, key);
    if (isDefaultListQuery(opts)) {
      writeJson(`${LIST_DEFAULT_KEY}:${userId}`, entry, localStorage);
    }
  }
}

export function invalidateProductsListCache(userId?: string) {
  if (userId) {
    for (const key of [...memoryListCache.keys()]) {
      if (key.startsWith(`${LIST_PREFIX}:${userId}:`)) {
        memoryListCache.delete(key);
      }
    }
    memoryCollectionsCache.delete(collectionsCacheKey(userId));
  } else {
    memoryListCache.clear();
    memoryCollectionsCache.clear();
  }

  if (typeof window === "undefined") return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (!key) continue;
      if (!key.startsWith(LIST_PREFIX)) continue;
      if (userId && !key.startsWith(`${LIST_PREFIX}:${userId}:`)) continue;
      keys.push(key);
    }
    keys.forEach((key) => sessionStorage.removeItem(key));

    const localKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (
        !key.startsWith(LIST_PREFIX) &&
        !key.startsWith(`${LIST_DEFAULT_KEY}:`) &&
        !key.startsWith(LIST_LRU_PREFIX)
      ) {
        continue;
      }
      if (userId && !key.includes(`:${userId}`)) continue;
      localKeys.push(key);
    }
    localKeys.forEach((key) => localStorage.removeItem(key));
  } catch {
    /* ignore */
  }
}

function collectionsPayloadToItems(
  entry: CollectionsCachePayload,
  allowStale: boolean
): { id: string; label: string; slug: string }[] | null {
  if (entry.v !== CACHE_VERSION) return null;
  const age = Date.now() - entry.at;
  if (!allowStale && age > COLLECTIONS_STALE_MS) return null;
  if (age > COLLECTIONS_MAX_AGE_MS) return null;
  return entry.items;
}

export function peekCollectionsCache(
  userId: string
): { id: string; label: string; slug: string }[] | null {
  const key = collectionsCacheKey(userId);
  const memory = memoryCollectionsCache.get(key);
  if (memory) {
    const items = collectionsPayloadToItems(memory, true);
    if (items) return items;
  }

  if (typeof window === "undefined") return null;

  const sessionEntry = readJson<CollectionsCachePayload>(key, sessionStorage);
  if (sessionEntry) {
    const items = collectionsPayloadToItems(sessionEntry, true);
    if (items) {
      memoryCollectionsCache.set(key, sessionEntry);
      return items;
    }
  }

  const localEntry = readJson<CollectionsCachePayload>(key, localStorage);
  if (localEntry) {
    const items = collectionsPayloadToItems(localEntry, true);
    if (items) {
      memoryCollectionsCache.set(key, localEntry);
      return items;
    }
  }

  return null;
}

export function readCollectionsCache(
  userId: string
): { id: string; label: string; slug: string }[] | null {
  const key = collectionsCacheKey(userId);
  const memory = memoryCollectionsCache.get(key);
  if (memory) {
    const items = collectionsPayloadToItems(memory, false);
    if (items) return items;
  }
  return peekCollectionsCache(userId);
}

export function writeCollectionsCache(
  userId: string,
  items: { id: string; label: string; slug: string }[]
) {
  const key = collectionsCacheKey(userId);
  const entry: CollectionsCachePayload = {
    v: CACHE_VERSION,
    at: Date.now(),
    items,
  };
  memoryCollectionsCache.set(key, entry);
  if (typeof window === "undefined") return;
  writeJson(key, entry, sessionStorage);
  writeJson(key, entry, localStorage);
}

export function invalidateCollectionsCache(userId?: string) {
  if (!userId) return;
  memoryCollectionsCache.delete(collectionsCacheKey(userId));
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(collectionsCacheKey(userId));
    localStorage.removeItem(collectionsCacheKey(userId));
  } catch {
    /* ignore */
  }
}
