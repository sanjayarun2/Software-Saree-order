/**
 * Resolve and cache product image URLs for order line items.
 * Reuses shop/Velo product photos so order detail does not stay blank.
 */

import type { WebsiteOrderLineItem } from "./db-types";
import { listVeloProducts } from "./velo-products-api";
import { peekVeloProductsList } from "./velo-products-cache";
import {
  extractImageUrlFromUnknown,
  extractProductCodeFromText,
} from "./product-image-url";
import { createStore, get, set } from "idb-keyval";

export { extractImageUrlFromUnknown, extractProductCodeFromText };

const store = createStore("velo-product-image-cache", "v1");
const memoryUrlCache = new Map<string, string>();

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
      if (url) return { ...item, imageUrl: url };
    }
    return item;
  });
}

function productMatchesLine(
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
  return false;
}

function findInCachedProductLists(
  userId: string,
  item: WebsiteOrderLineItem
): string | null {
  const snap = peekVeloProductsList(userId, {
    page: 1,
    pageSize: 20,
    draft: "all",
  });
  const products = snap?.products ?? [];
  for (const p of products) {
    if (productMatchesLine(p, item)) {
      return (
        extractImageUrlFromUnknown(p) ??
        (typeof p.imageUrl === "string" ? p.imageUrl.trim() || null : null)
      );
    }
  }
  return null;
}

/**
 * Fill missing imageUrl on line items using:
 * 1) local IDB URL cache
 * 2) in-memory products list cache
 * 3) Velo products list search by code/id
 *
 * Persists newly found URLs so later opens are instant.
 */
export async function enrichLineItemsWithProductImages(
  userId: string,
  items: WebsiteOrderLineItem[]
): Promise<{ items: WebsiteOrderLineItem[]; changed: boolean }> {
  if (!items.length) return { items, changed: false };

  const cache = await readProductImageUrlCache(userId);
  let next = applyCachedUrls(items, cache);
  const newCacheEntries: Record<string, string> = {};

  const stillMissing = next.filter((i) => !i.imageUrl?.trim());
  for (const item of stillMissing) {
    const fromList = findInCachedProductLists(userId, item);
    if (fromList) {
      for (const key of productLookupKeys(item)) newCacheEntries[key] = fromList;
      next = next.map((row) =>
        productMatchesLine(
          {
            productId: row.productId ?? undefined,
            productCode: row.productCode,
            name: row.name,
          },
          item
        ) || row === item
          ? { ...row, imageUrl: row.imageUrl || fromList }
          : row
      );
    }
  }

  const needNetwork = next.filter((i) => !i.imageUrl?.trim());
  for (const item of needNetwork) {
    const code =
      item.productCode?.trim() ||
      extractProductCodeFromText(item.name) ||
      "";
    // Prefer id (works for draft/archived), then ST code, then name.
    const searches = [
      item.productId?.trim() || "",
      code,
      (item.name || "").trim().slice(0, 80),
    ].filter((s, idx, arr) => s.length > 0 && arr.indexOf(s) === idx);

    let foundUrl: string | null = null;
    let matchProductId: string | null = null;
    let matchProductCode: string | null = null;

    for (const search of searches) {
      try {
        const { products } = await listVeloProducts(
          userId,
          { search, page: 1, pageSize: 10, draft: "all" },
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
        const url =
          extractImageUrlFromUnknown(match) ??
          (typeof match.imageUrl === "string"
            ? match.imageUrl.trim() || null
            : null);
        if (!url) continue;
        foundUrl = url;
        matchProductId = match.productId ?? null;
        matchProductCode = match.productCode ?? null;
        break;
      } catch {
        /* try next search key */
      }
    }

    if (!foundUrl) continue;

    for (const key of productLookupKeys(item)) newCacheEntries[key] = foundUrl;
    if (matchProductCode) {
      newCacheEntries[`code:${matchProductCode.trim().toUpperCase()}`] =
        foundUrl;
    }
    if (matchProductId) newCacheEntries[`id:${matchProductId}`] = foundUrl;
    next = next.map((row) => {
      const sameItem =
        row.name === item.name ||
        (row.productId &&
          item.productId &&
          row.productId === item.productId) ||
        productMatchesLine(
          {
            productId: row.productId ?? undefined,
            productCode: row.productCode,
            name: row.name,
          },
          item
        );
      return sameItem && !row.imageUrl?.trim()
        ? {
            ...row,
            imageUrl: foundUrl,
            productCode: row.productCode || matchProductCode || code || null,
          }
        : row;
    });
  }

  if (Object.keys(newCacheEntries).length) {
    await writeProductImageUrlCache(userId, newCacheEntries);
  }

  const changed = next.some(
    (row, i) => (row.imageUrl ?? null) !== (items[i]?.imageUrl ?? null)
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
