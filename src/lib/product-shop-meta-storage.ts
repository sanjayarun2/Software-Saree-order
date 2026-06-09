import { createStore, get, set } from "idb-keyval";

const store = createStore("velo-product-shop-meta", "v1");

export type ProductShopMeta = {
  productId: string;
  slug?: string | null;
  collectionId?: string | null;
  collectionSlug?: string | null;
  updatedAt: string;
};

function metaKey(userId: string): string {
  return `meta:${userId}`;
}

export async function getProductShopMetaMap(
  userId: string
): Promise<Record<string, ProductShopMeta>> {
  if (typeof window === "undefined") return {};
  const raw = await get<Record<string, ProductShopMeta>>(metaKey(userId), store);
  return raw && typeof raw === "object" ? raw : {};
}

export async function getProductShopMeta(
  userId: string,
  productId: string
): Promise<ProductShopMeta | null> {
  const map = await getProductShopMetaMap(userId);
  return map[productId] ?? null;
}

export async function saveProductShopMeta(
  userId: string,
  meta: ProductShopMeta
): Promise<void> {
  if (typeof window === "undefined" || !meta.productId) return;
  const map = await getProductShopMetaMap(userId);
  map[meta.productId] = {
    ...map[meta.productId],
    ...meta,
    updatedAt: meta.updatedAt || new Date().toISOString(),
  };
  await set(metaKey(userId), map, store);
}

export async function saveProductShopMetaBatch(
  userId: string,
  items: ProductShopMeta[]
): Promise<void> {
  if (typeof window === "undefined" || !items.length) return;
  const map = await getProductShopMetaMap(userId);
  const now = new Date().toISOString();
  for (const item of items) {
    if (!item.productId) continue;
    map[item.productId] = { ...map[item.productId], ...item, updatedAt: item.updatedAt || now };
  }
  await set(metaKey(userId), map, store);
}

/** Slug fallback when shop API omits slug on single upsert. */
export function slugifyProductName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}
