import type { VeloProductListItem } from "./velo-products-types";

const CACHE_VERSION = 1;
const LIST_STALE_MS = 60 * 1000;
const LIST_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const COLLECTIONS_STALE_MS = 5 * 60 * 1000;
const COLLECTIONS_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const LIST_PREFIX = "velo_products_list_v1";
const LIST_DEFAULT_KEY = "velo_products_default_v1";
const COLLECTIONS_PREFIX = "velo_products_collections_v1";

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

const memoryListCache = new Map<string, ListCachePayload>();
const memoryCollectionsCache = new Map<string, CollectionsCachePayload>();

export function normalizeIsDraft(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (value === "true" || value === "1") return true;
  return false;
}

export function normalizeProductListItem(item: VeloProductListItem): VeloProductListItem {
  return {
    ...item,
    isDraft: normalizeIsDraft(item.isDraft),
  };
}

function listCacheKey(
  userId: string,
  search: string,
  draft: string,
  page: number,
  pageSize: number
) {
  return `${LIST_PREFIX}:${userId}:${draft}:${page}:${pageSize}:${search.trim().toLowerCase()}`;
}

function isDefaultListQuery(
  search: string,
  draft: string,
  page: number,
  pageSize: number
) {
  return page === 1 && pageSize === 20 && !search.trim() && draft === "all";
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
  opts: {
    search?: string;
    draft?: string;
    page?: number;
    pageSize?: number;
  },
  allowStale: boolean
): ProductsListSnapshot | null {
  const search = opts.search ?? "";
  const draft = opts.draft ?? "all";
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? 20;
  const key = listCacheKey(userId, search, draft, page, pageSize);

  const memory = memoryListCache.get(key);
  if (memory) {
    const snap = payloadToSnapshot(memory, allowStale);
    if (snap) return snap;
  }

  if (typeof window !== "undefined") {
    const sessionEntry = readJson<ListCachePayload>(key, sessionStorage);
    if (sessionEntry) {
      const snap = payloadToSnapshot(sessionEntry, allowStale);
      if (snap) {
        memoryListCache.set(key, sessionEntry);
        return snap;
      }
    }

    if (isDefaultListQuery(search, draft, page, pageSize)) {
      const localEntry = readJson<ListCachePayload>(
        `${LIST_DEFAULT_KEY}:${userId}`,
        localStorage
      );
      if (localEntry) {
        const snap = payloadToSnapshot(localEntry, allowStale);
        if (snap) {
          memoryListCache.set(key, localEntry);
          return snap;
        }
      }
    }
  }

  return null;
}

export function peekVeloProductsList(
  userId: string,
  opts: {
    search?: string;
    draft?: "all" | "draft" | "published";
    page?: number;
    pageSize?: number;
  } = {}
): ProductsListSnapshot | null {
  return readListEntry(userId, opts, true);
}

export function readProductsListCache(
  userId: string,
  opts: {
    search?: string;
    draft?: string;
    page?: number;
    pageSize?: number;
  }
): ProductsListSnapshot | null {
  return readListEntry(userId, opts, false);
}

export function writeProductsListCache(
  userId: string,
  opts: {
    search?: string;
    draft?: string;
    page?: number;
    pageSize?: number;
  },
  data: { products: VeloProductListItem[]; total: number; hasMore: boolean }
) {
  const search = opts.search ?? "";
  const draft = opts.draft ?? "all";
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? 20;
  const key = listCacheKey(userId, search, draft, page, pageSize);
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
  if (isDefaultListQuery(search, draft, page, pageSize)) {
    writeJson(`${LIST_DEFAULT_KEY}:${userId}`, entry, localStorage);
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

    if (userId) {
      localStorage.removeItem(`${LIST_DEFAULT_KEY}:${userId}`);
    }
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
