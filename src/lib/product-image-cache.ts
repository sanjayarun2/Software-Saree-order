import type { WebsiteOrderLineItem } from "./db-types";
import { listVeloProducts, resolveVeloProductImages } from "./velo-products-api";
import { peekVeloProductsList } from "./velo-products-cache";
import {
  extractImageUrlFromUnknown,
  extractProductCodeFromText,
} from "./product-image-url";
import { createStore, get, set } from "idb-keyval";
import type { VeloProductListItem } from "./velo-products-types";

export { extractImageUrlFromUnknown, extractProductCodeFromText };

const store = createStore("velo-product-image-cache", "v1");
const memoryUrlCache = new Map<string, string>();
const ENRICH_CONCURRENCY = 6;

function cacheKey(userId: string) {
  return `urls:${userId}`;
}

function productLookupKeys(item: WebsiteOrderLineItem): string[] {
  const keys: string[] = [];
  if (item.productId?.trim()) keys.push(`id:${item.productId.trim()}`);
  const code =
    item.productCode?.trim().toUpperCase() ||
    extractProductCodeFromText(item.name);
  if (code) keys.push(`code:${code}`);
  return keys;
}

export function lineItemsMissingImages(items: WebsiteOrderLineItem[]): boolean {
  return items.some((item) => !item.imageUrl?.trim());
}

export function countMissingImages(items: WebsiteOrderLineItem[]): number {
  return items.filter((item) => !item.imageUrl?.trim()).length;
}

export async function readProductImageUrlCache(
  userId: string
): Promise<Record<string, string>> {
  if (typeof window === "undefined") return {};
  const memKey = cacheKey(userId);
  if (memoryUrlCache.has(memKey)) {
    try {
      return JSON.parse(memoryUrlCache.get(memKey)!) as Record<string, string>;
    } catch {
      /* fall through */
    }
  }
  try {
    const raw = await get<Record<string, string>>(memKey, store);
    const map = raw && typeof raw === "object" ? raw : {};
    memoryUrlCache.set(memKey, JSON.stringify(map));
    return map;
  } catch {
    return {};
  }
}

export async function writeProductImageUrlCache(
  userId: string,
  entries: Record<string, string>
): Promise<void> {
  if (typeof window === "undefined" || !Object.keys(entries).length) return;
  const map = { ...(await readProductImageUrlCache(userId)), ...entries };
  memoryUrlCache.set(cacheKey(userId), JSON.stringify(map));
  try {
    await set(cacheKey(userId), map, store);
  } catch {
    /* quota */
  }
}

function applyCachedUrls(
  items: WebsiteOrderLineItem[],
  cache: Record<string, string>
): WebsiteOrderLineItem[] {
  return items.map((item) => {
    if (item.imageUrl?.trim()) return item;
    for (const key of productLookupKeys(item)) {
      const url = cache[key]?.trim();
      if (url) {
        return {
          ...item,
          imageUrl: url,
          productCode:
            item.productCode ||
            extractProductCodeFromText(item.name) ||
            null,
        };
      }
    }
    return item;
  });
}

function normalizeNameForMatch(name: string): string {
  return name
    .toLowerCase()
    .replace(/\bst\d{3,}\b/gi, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function productImageUrl(p: VeloProductListItem): string | null {
  return (
    extractImageUrlFromUnknown(p) ??
    (typeof p.imageUrl === "string" ? p.imageUrl.trim() || null : null)
  );
}

export function productMatchesLine(
  p: { productId?: string; productCode?: string | null; name?: string },
  item: WebsiteOrderLineItem
): boolean {
  const id = item.productId?.trim();
  const code =
    item.productCode?.trim().toUpperCase() ||
    extractProductCodeFromText(item.name);
  if (id && p.productId === id) return true;
  if (code && (p.productCode ?? "").trim().toUpperCase() === code) return true;
  if (
    code &&
    typeof p.name === "string" &&
    p.name.toUpperCase().includes(code)
  ) {
    return true;
  }
  if (typeof p.name === "string" && item.name) {
    const a = normalizeNameForMatch(p.name);
    const b = normalizeNameForMatch(item.name);
    if (a && b && (a === b || a.includes(b) || b.includes(a))) return true;
  }
  return false;
}

function collectPeekedProducts(userId: string): VeloProductListItem[] {
  const queries = [
    { page: 1, pageSize: 20, draft: "all" as const },
    { page: 1, pageSize: 20, draft: "draft" as const },
    { page: 1, pageSize: 20, draft: "published" as const },
    { page: 2, pageSize: 20, draft: "all" as const },
    { page: 1, pageSize: 50, draft: "all" as const },
  ];
  const byId = new Map<string, VeloProductListItem>();
  for (const q of queries) {
    const snap = peekVeloProductsList(userId, q);
    for (const p of snap?.products ?? []) {
      if (p.productId) byId.set(p.productId, p);
    }
  }
  return [...byId.values()];
}

function findInPeekedProducts(
  products: VeloProductListItem[],
  item: WebsiteOrderLineItem
): { url: string; product: VeloProductListItem } | null {
  for (const p of products) {
    if (!productMatchesLine(p, item)) continue;
    const url = productImageUrl(p);
    if (url) return { url, product: p };
  }
  return null;
}

function rememberResolvedProduct(
  item: WebsiteOrderLineItem,
  match: VeloProductListItem,
  newCacheEntries: Record<string, string>
): WebsiteOrderLineItem {
  const url = productImageUrl(match);
  if (!url) return item;
  for (const key of productLookupKeys(item)) {
    newCacheEntries[key] = url;
  }
  if (match.productCode) {
    newCacheEntries[`code:${match.productCode.trim().toUpperCase()}`] = url;
  }
  if (match.productId) {
    newCacheEntries[`id:${match.productId}`] = url;
  }
  return {
    ...item,
    imageUrl: url,
    productId: item.productId || match.productId || null,
    productCode:
      item.productCode ||
      match.productCode ||
      extractProductCodeFromText(item.name) ||
      null,
  };
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await fn(items[i], i);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, Math.max(1, items.length)) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
}

async function resolveOneItemFromNetwork(
  userId: string,
  item: WebsiteOrderLineItem
): Promise<{
  url: string;
  productId: string | null;
  productCode: string | null;
} | null> {
  const code =
    item.productCode?.trim() ||
    extractProductCodeFromText(item.name) ||
    "";
  const searches = [
    item.productId?.trim() || "",
    code,
    (item.name || "").trim().slice(0, 80),
  ].filter((s, idx, arr) => s.length > 0 && arr.indexOf(s) === idx);

  for (const search of searches) {
    try {
      const { products } = await listVeloProducts(
        userId,
        { search, page: 1, pageSize: 20, draft: "all" },
        { forceRefresh: true }
      );
      const match =
        products.find((p) => productMatchesLine(p, item)) ??
        products.find((p) => p.productId === item.productId) ??
        (code
          ? products.find(
              (p) =>
                (p.productCode ?? "").trim().toUpperCase() ===
                  code.toUpperCase() ||
                (p.name ?? "").toUpperCase().includes(code.toUpperCase())
            )
          : undefined);
      if (!match) continue;
      const url = productImageUrl(match);
      if (!url) continue;
      return {
        url,
        productId: match.productId ?? null,
        productCode: match.productCode || code || null,
      };
    } catch {
      /* try next search key */
    }
  }
  return null;
}

export type EnrichLineItemsOptions = {
  /** Called whenever any line item gains an image (progressive UI). */
  onProgress?: (items: WebsiteOrderLineItem[]) => void;
};

/**
 * Fill missing imageUrl on line items using:
 * 1) local IDB URL cache
 * 2) peeked products list caches
 * 3) batch resolveImages by productId (preferred)
 * 4) parallel list searches by id / code / name (fallback)
 */
export async function enrichLineItemsWithProductImages(
  userId: string,
  items: WebsiteOrderLineItem[],
  opts: EnrichLineItemsOptions = {}
): Promise<{ items: WebsiteOrderLineItem[]; changed: boolean }> {
  if (!items.length) return { items, changed: false };

  const cache = await readProductImageUrlCache(userId);
  let next = applyCachedUrls(items, cache);
  const newCacheEntries: Record<string, string> = {};

  const emit = () => opts.onProgress?.([...next]);

  if (countMissingImages(next) < countMissingImages(items)) {
    emit();
  }

  const peeked = collectPeekedProducts(userId);
  const afterPeek = next.map((item) => {
    if (item.imageUrl?.trim()) return item;
    const hit = findInPeekedProducts(peeked, item);
    if (!hit) return item;
    return rememberResolvedProduct(item, hit.product, newCacheEntries);
  });
  if (afterPeek.some((row, i) => row.imageUrl !== next[i]?.imageUrl)) {
    next = afterPeek;
    emit();
  }

  // Batch resolve by product ids — covers most website order lines in one call.
  const missingWithIds = next
    .filter((item) => !item.imageUrl?.trim() && item.productId?.trim())
    .map((item) => item.productId!.trim());

  if (missingWithIds.length) {
    try {
      const resolved = await resolveVeloProductImages(userId, missingWithIds);
      if (resolved.length) {
        const byId = new Map(resolved.map((p) => [p.productId, p]));
        let touched = false;
        next = next.map((item) => {
          if (item.imageUrl?.trim()) return item;
          const id = item.productId?.trim();
          if (!id) return item;
          const match = byId.get(id);
          if (!match || !productImageUrl(match)) return item;
          touched = true;
          return rememberResolvedProduct(item, match, newCacheEntries);
        });
        if (touched) emit();
      }
    } catch {
      /* fall through to list searches */
    }
  }

  const needNetworkIdx = next
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => !item.imageUrl?.trim());

  if (needNetworkIdx.length) {
    try {
      await listVeloProducts(
        userId,
        { page: 1, pageSize: 50, draft: "all" },
        { forceRefresh: false }
      );
    } catch {
      /* optional warm */
    }

    await mapPool(needNetworkIdx, ENRICH_CONCURRENCY, async ({ item, index }) => {
      if (next[index]?.imageUrl?.trim()) return null;
      const resolved = await resolveOneItemFromNetwork(userId, item);
      if (!resolved) return null;

      for (const key of productLookupKeys(item)) {
        newCacheEntries[key] = resolved.url;
      }
      if (resolved.productCode) {
        newCacheEntries[`code:${resolved.productCode.trim().toUpperCase()}`] =
          resolved.url;
      }
      if (resolved.productId) {
        newCacheEntries[`id:${resolved.productId}`] = resolved.url;
      }

      next = next.map((row, i) => {
        if (i === index) {
          return {
            ...row,
            imageUrl: resolved.url,
            productId: row.productId || resolved.productId,
            productCode:
              row.productCode ||
              resolved.productCode ||
              extractProductCodeFromText(row.name) ||
              null,
          };
        }
        if (
          !row.imageUrl?.trim() &&
          productMatchesLine(
            {
              productId: resolved.productId ?? undefined,
              productCode: resolved.productCode,
              name: item.name,
            },
            row
          )
        ) {
          return {
            ...row,
            imageUrl: resolved.url,
            productId: row.productId || resolved.productId,
            productCode:
              row.productCode ||
              resolved.productCode ||
              extractProductCodeFromText(row.name) ||
              null,
          };
        }
        return row;
      });
      emit();
      return resolved;
    });
  }

  if (Object.keys(newCacheEntries).length) {
    await writeProductImageUrlCache(userId, newCacheEntries);
  }

  const changed = next.some(
    (row, i) =>
      (row.imageUrl ?? null) !== (items[i]?.imageUrl ?? null) ||
      (row.productCode ?? null) !== (items[i]?.productCode ?? null) ||
      (row.productId ?? null) !== (items[i]?.productId ?? null)
  );
  return { items: next, changed };
}

/**
 * Warm browser HTTP cache for a product image URL (best-effort).
 * Call after the img element loads successfully.
 */
export async function rememberLoadedProductImage(
  userId: string,
  item: Pick<
    WebsiteOrderLineItem,
    "productId" | "productCode" | "imageUrl" | "name"
  >
): Promise<void> {
  const url = item.imageUrl?.trim();
  if (!url || url.startsWith("data:")) return;

  const entries: Record<string, string> = {};
  for (const key of productLookupKeys(item as WebsiteOrderLineItem)) {
    entries[key] = url;
  }
  if (Object.keys(entries).length) {
    await writeProductImageUrlCache(userId, entries);
  }

  if (typeof caches === "undefined") return;
  try {
    const cache = await caches.open("velo-product-images-v1");
    const existing = await cache.match(url);
    if (existing) return;
    const res = await fetch(url, { mode: "cors", credentials: "omit" });
    if (res.ok) await cache.put(url, res.clone());
  } catch {
    /* CORS or offline — URL cache still helps */
  }
}

/** Prefer Cache API response when available (for future blob: usage). */
export async function getCachedProductImageResponse(
  url: string
): Promise<Response | null> {
  if (typeof caches === "undefined" || !url) return null;
  try {
    const cache = await caches.open("velo-product-images-v1");
    return (await cache.match(url)) ?? null;
  } catch {
    return null;
  }
}
