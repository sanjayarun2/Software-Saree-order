import type { WebsiteOrderLineItem } from "./db-types";
import {
  buildCustomerCartShareText,
  buildShopCartUrl,
} from "./shop-product-urls";
import type { ShareCartLine } from "./share-cart-types";
import { isUsableShopProductId } from "./shop-url-utils";
import {
  digitsOnlyPhone,
  formatMoneyAmount,
  type UnpaidWebsiteOrder,
} from "./unpaid-website-orders";

export type UnpaidOfferMode = "none" | "percent" | "fixed";

export type UnpaidOfferInput = {
  mode: UnpaidOfferMode;
  /** 1–99 when mode=percent */
  percent: number;
  /** ₹ amount when mode=fixed */
  fixedAmount: number;
};

export type UnpaidOfferPreview = {
  originalTotal: number | null;
  discountAmount: number;
  discountedTotal: number | null;
  currency: string;
  label: string | null;
};

export function clampPercentOffer(raw: number): number {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n)) return 5;
  return Math.min(99, Math.max(1, n));
}

export function clampFixedOffer(raw: number, maxTotal: number | null): number {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n) || n < 1) return 1;
  if (maxTotal != null && Number.isFinite(maxTotal) && maxTotal > 0) {
    return Math.min(n, Math.max(1, Math.floor(maxTotal - 1)));
  }
  return n;
}

/** Prefer order.amount; else sum line unitPrice × qty when available. */
export function resolveUnpaidOrderSubtotal(
  order: Pick<UnpaidWebsiteOrder, "amount" | "items">
): number | null {
  if (typeof order.amount === "number" && Number.isFinite(order.amount) && order.amount >= 0) {
    return order.amount;
  }
  let sum = 0;
  let any = false;
  for (const item of order.items) {
    if (item.unitPrice == null || !Number.isFinite(item.unitPrice)) continue;
    any = true;
    sum += item.unitPrice * (item.quantity || 1);
  }
  return any ? sum : null;
}

export function computeUnpaidOfferPreview(
  order: Pick<UnpaidWebsiteOrder, "amount" | "currency" | "items">,
  offer: UnpaidOfferInput
): UnpaidOfferPreview {
  const currency = order.currency?.trim() || "INR";
  const originalTotal = resolveUnpaidOrderSubtotal(order);

  if (offer.mode === "none" || originalTotal == null) {
    return {
      originalTotal,
      discountAmount: 0,
      discountedTotal: originalTotal,
      currency,
      label: null,
    };
  }

  if (offer.mode === "percent") {
    const percent = clampPercentOffer(offer.percent);
    const discountAmount = Math.round((originalTotal * percent) / 100);
    const discountedTotal = Math.max(0, originalTotal - discountAmount);
    return {
      originalTotal,
      discountAmount,
      discountedTotal,
      currency,
      label: `${percent}% off`,
    };
  }

  const fixed = clampFixedOffer(offer.fixedAmount, originalTotal);
  const discountAmount = Math.min(fixed, Math.max(0, originalTotal - 1));
  const discountedTotal = Math.max(0, originalTotal - discountAmount);
  return {
    originalTotal,
    discountAmount,
    discountedTotal,
    currency,
    label: `${formatMoneyAmount(discountAmount, currency)} off`,
  };
}

export function unpaidItemsToShareCartLines(
  items: WebsiteOrderLineItem[]
): ShareCartLine[] {
  const out: ShareCartLine[] = [];
  for (const item of items) {
    const productId = item.productId?.trim() || "";
    if (!isUsableShopProductId(productId)) continue;
    out.push({
      productId,
      name: item.name.trim() || "Item",
      productCode: item.productCode?.trim() || null,
      quantity: item.quantity >= 1 ? Math.floor(item.quantity) : 1,
    });
  }
  return out;
}

/** WhatsApp path digits without +: 91XXXXXXXXXX for India. */
export function mobileToWhatsAppDigits(
  raw: string | null | undefined
): string | null {
  const digits = digitsOnlyPhone(raw);
  if (!digits || digits.length < 8) return null;
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  if (digits.startsWith("0") && digits.length === 11) {
    return `91${digits.slice(1)}`;
  }
  return digits;
}

export function buildUnpaidRecoveryWhatsAppText(opts: {
  customerName: string;
  lines: ShareCartLine[];
  cartUrl: string;
  preview: UnpaidOfferPreview;
}): string {
  const name = opts.customerName.trim() || "there";
  const parts: string[] = [];
  parts.push(`Hi ${name},`);
  parts.push("");

  if (opts.preview.label && opts.preview.originalTotal != null) {
    parts.push(
      "Special offer for you — only if you complete this order:"
    );
    const was = formatMoneyAmount(
      opts.preview.originalTotal,
      opts.preview.currency
    );
    const now =
      opts.preview.discountedTotal != null
        ? formatMoneyAmount(
            opts.preview.discountedTotal,
            opts.preview.currency
          )
        : "—";
    parts.push(`${opts.preview.label} (${was} → ${now}).`);
    parts.push("");
  }

  parts.push(
    buildCustomerCartShareText({
      lines: opts.lines,
      cartUrl: opts.cartUrl,
      orderHeading: "Your items:",
    })
  );

  return parts.join("\n");
}

export function buildUnpaidRecoveryCartUrl(
  shopBaseUrl: string,
  lines: ShareCartLine[]
): string {
  return buildShopCartUrl(
    shopBaseUrl,
    lines.map((l) => ({ productId: l.productId, quantity: l.quantity }))
  );
}

export function buildCustomerWhatsAppUrl(
  mobile: string | null | undefined,
  text: string
): string | null {
  const digits = mobileToWhatsAppDigits(mobile);
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

/** Open WhatsApp to this customer; no DB writes. */
export function openUnpaidRecoveryWhatsApp(opts: {
  order: UnpaidWebsiteOrder;
  offer: UnpaidOfferInput;
}): { ok: true } | { ok: false; error: string } {
  const lines = unpaidItemsToShareCartLines(opts.order.items);
  if (!lines.length) {
    return {
      ok: false,
      error:
        "No product IDs on this checkout — cannot build a cart link. Ask the customer to reorder from the shop.",
    };
  }

  let cartUrl: string;
  try {
    cartUrl = buildUnpaidRecoveryCartUrl(opts.order.shopBaseUrl, lines);
  } catch (e) {
    return {
      ok: false,
      error: (e as Error).message || "Could not build cart link.",
    };
  }

  const preview = computeUnpaidOfferPreview(opts.order, opts.offer);
  const text = buildUnpaidRecoveryWhatsAppText({
    customerName: opts.order.customerName,
    lines,
    cartUrl,
    preview,
  });

  const url = buildCustomerWhatsAppUrl(opts.order.customerMobile, text);
  if (!url) {
    return { ok: false, error: "No valid mobile number for WhatsApp." };
  }

  if (typeof window !== "undefined") {
    window.open(url, "_blank", "noopener,noreferrer");
  }
  return { ok: true };
}
