import type { VeloProductListItem } from "./velo-products-types";

const CACHE_VERSION = 1;
const LIST_TTL_MS = 5 * 60 * 1000;
const COLLECTIONS_TTL_MS = 30 * 60 * 1000;
const LIST_PREFIX = "velo_products_list_v1";
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

function collectionsCacheKey(userId: string) {
  return `${COLLECTIONS_PREFIX}:${userId}`;
}

function readJson<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota or private mode */
  }
}

export function readProductsListCache(
  userId: string,
  opts: {
    search?: string;
    draft?: string;
    page?: number;
    pageSize?: number;
  }
): { products: VeloProductListItem[]; total: number; hasMore: boolean } | null {
  const key = listCacheKey(
    userId,
    opts.search ?? "",
    opts.draft ?? "all",
    opts.page ?? 1,
    opts.pageSize ?? 20
  );
  const entry = readJson<ListCachePayload>(key);
  if (!entry || entry.v !== CACHE_VERSION) return null;
  if (Date.now() - entry.at > LIST_TTL_MS) return null;
  return {
    products: entry.products.map(normalizeProductListItem),
    total: entry.total,
    hasMore: entry.hasMore,
  };
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
  const key = listCacheKey(
    userId,
    opts.search ?? "",
    opts.draft ?? "all",
    opts.page ?? 1,
    opts.pageSize ?? 20
  );
  writeJson(key, {
    v: CACHE_VERSION,
    at: Date.now(),
    products: data.products.map(normalizeProductListItem),
    total: data.total,
    hasMore: data.hasMore,
  } satisfies ListCachePayload);
}

export function invalidateProductsListCache(userId?: string) {
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
  } catch {
    /* ignore */
  }
}

export function readCollectionsCache(
  userId: string
): { id: string; label: string; slug: string }[] | null {
  const entry = readJson<CollectionsCachePayload>(collectionsCacheKey(userId));
  if (!entry || entry.v !== CACHE_VERSION) return null;
  if (Date.now() - entry.at > COLLECTIONS_TTL_MS) return null;
  return entry.items;
}

export function writeCollectionsCache(
  userId: string,
  items: { id: string; label: string; slug: string }[]
) {
  writeJson(collectionsCacheKey(userId), {
    v: CACHE_VERSION,
    at: Date.now(),
    items,
  } satisfies CollectionsCachePayload);
}

export function invalidateCollectionsCache(userId?: string) {
  if (typeof window === "undefined" || !userId) return;
  try {
    sessionStorage.removeItem(collectionsCacheKey(userId));
  } catch {
    /* ignore */
  }
}
