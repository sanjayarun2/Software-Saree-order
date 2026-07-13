import type { WebsiteOrderLineItem } from "./db-types";
import {
  extractImageUrlFromUnknown,
  extractProductCodeFromText,
} from "./product-image-url";

export type { WebsiteOrderLineItem };
export { extractProductCodeFromText };

export function normalizeWebsiteLineItems(
  raw: unknown
): WebsiteOrderLineItem[] {
  if (!Array.isArray(raw)) return [];
  const out: WebsiteOrderLineItem[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const item = row as Record<string, unknown>;
    const name = String(item.name ?? item.productName ?? "").trim();
    if (!name) continue;
    const qtyRaw = Number(item.quantity ?? 1);
    const quantity =
      Number.isFinite(qtyRaw) && qtyRaw >= 1 ? Math.floor(qtyRaw) : 1;
    const unitRaw = item.unitPrice;
    const unitPrice =
      typeof unitRaw === "number" && Number.isFinite(unitRaw) ? unitRaw : null;
    const productCodeRaw =
      typeof item.productCode === "string" ? item.productCode.trim() : "";
    const productCode =
      productCodeRaw || extractProductCodeFromText(name) || null;
    out.push({
      productId:
        typeof item.productId === "string" ? item.productId.trim() || null : null,
      name,
      productCode,
      quantity,
      imageUrl: extractImageUrlFromUnknown(item),
      unitPrice,
    });
  }
  return out;
}

export function hasWebsiteLineItems(raw: unknown): boolean {
  return normalizeWebsiteLineItems(raw).length > 0;
}

export function websiteLineItemsMissingImages(raw: unknown): boolean {
  const items = normalizeWebsiteLineItems(raw);
  return items.length > 0 && items.some((item) => !item.imageUrl?.trim());
}

export function lineItemsFromVeloApiItems(
  items: unknown
): WebsiteOrderLineItem[] {
  if (!Array.isArray(items)) return [];
  return normalizeWebsiteLineItems(
    items.map((row) => {
      if (!row || typeof row !== "object") return row;
      const item = row as Record<string, unknown>;
      const nestedProduct =
        item.product && typeof item.product === "object"
          ? (item.product as Record<string, unknown>)
          : null;
      return {
        productId: item.productId ?? nestedProduct?.id ?? nestedProduct?.productId,
        name:
          item.productName ??
          item.name ??
          nestedProduct?.name ??
          nestedProduct?.title,
        productCode:
          item.productCode ?? nestedProduct?.productCode ?? nestedProduct?.sku,
        quantity: item.quantity ?? item.qty ?? item.count,
        imageUrl:
          extractImageUrlFromUnknown(item) ??
          extractImageUrlFromUnknown(nestedProduct),
        unitPrice: item.unitPrice ?? nestedProduct?.price,
        image: item.image ?? nestedProduct?.image,
        thumbnail: item.thumbnail ?? nestedProduct?.thumbnail,
        featuredImage: item.featuredImage ?? nestedProduct?.featuredImage,
        images: item.images ?? nestedProduct?.images,
      };
    })
  );
}

export function totalQuantityFromLineItems(
  items: WebsiteOrderLineItem[]
): number {
  if (!items.length) return 1;
  const sum = items.reduce((acc, line) => acc + line.quantity, 0);
  return sum > 0 ? sum : 1;
}

/** Merge fresher image URLs / codes from `fresh` into `base` by productId/code/name. */
export function mergeWebsiteLineItems(
  base: WebsiteOrderLineItem[],
  fresh: WebsiteOrderLineItem[]
): WebsiteOrderLineItem[] {
  if (!fresh.length) return base;
  if (!base.length) return fresh;

  const codeOf = (item: WebsiteOrderLineItem) =>
    (item.productCode?.trim() ||
      extractProductCodeFromText(item.name) ||
      "").toUpperCase();

  return base.map((item) => {
    const itemCode = codeOf(item);
    const match =
      fresh.find(
        (f) =>
          (item.productId && f.productId && item.productId === f.productId) ||
          (itemCode && codeOf(f) === itemCode)
      ) ??
      fresh.find(
        (f) => f.name.trim().toLowerCase() === item.name.trim().toLowerCase()
      );

    if (!match) return item;
    return {
      ...item,
      productId: item.productId || match.productId,
      productCode: item.productCode || match.productCode || itemCode || null,
      imageUrl: item.imageUrl || match.imageUrl,
      unitPrice: item.unitPrice ?? match.unitPrice,
      quantity: item.quantity || match.quantity,
    };
  });
}

/** True when `next` has any extra image / code vs `prev`. */
export function websiteLineItemsImproved(
  prev: unknown,
  next: WebsiteOrderLineItem[]
): boolean {
  const before = normalizeWebsiteLineItems(prev);
  if (!before.length && next.length) return true;
  if (!next.length) return false;
  const merged = mergeWebsiteLineItems(before, next);
  const beforeImgs = before.filter((i) => i.imageUrl?.trim()).length;
  const afterImgs = merged.filter((i) => i.imageUrl?.trim()).length;
  if (afterImgs > beforeImgs) return true;
  return merged.some(
    (row, i) =>
      (row.imageUrl ?? null) !== (before[i]?.imageUrl ?? null) ||
      (row.productCode ?? null) !== (before[i]?.productCode ?? null) ||
      (row.productId ?? null) !== (before[i]?.productId ?? null)
  );
}
