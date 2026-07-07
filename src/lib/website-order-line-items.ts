import type { WebsiteOrderLineItem } from "./db-types";

export type { WebsiteOrderLineItem };

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
    out.push({
      productId:
        typeof item.productId === "string" ? item.productId.trim() || null : null,
      name,
      productCode:
        typeof item.productCode === "string"
          ? item.productCode.trim() || null
          : null,
      quantity,
      imageUrl:
        typeof item.imageUrl === "string" ? item.imageUrl.trim() || null : null,
      unitPrice,
    });
  }
  return out;
}

export function hasWebsiteLineItems(raw: unknown): boolean {
  return normalizeWebsiteLineItems(raw).length > 0;
}

export function lineItemsFromVeloApiItems(
  items: unknown
): WebsiteOrderLineItem[] {
  if (!Array.isArray(items)) return [];
  return normalizeWebsiteLineItems(
    items.map((row) => {
      if (!row || typeof row !== "object") return row;
      const item = row as Record<string, unknown>;
      return {
        productId: item.productId,
        name: item.productName ?? item.name,
        productCode: item.productCode,
        quantity: item.quantity,
        imageUrl: item.imageUrl,
        unitPrice: item.unitPrice,
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
