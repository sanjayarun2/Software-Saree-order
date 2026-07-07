import {
  getPrimaryEnabledIntegration,
} from "./api-settings-supabase";
import type { WebsiteOrderLineItem } from "./db-types";
import { lineItemsFromVeloApiItems } from "./website-order-line-items";
import { normalizeShopBaseUrl } from "./shop-url-utils";

type ShopOrderDetailResponse = {
  order?: {
    orderId?: string;
    items?: unknown[];
    customer?: { name?: string; mobile?: string; email?: string };
    address?: {
      line1?: string | null;
      line2?: string | null;
      city?: string | null;
      state?: string | null;
      postalCode?: string | null;
      country?: string | null;
    } | null;
    paymentStatus?: string;
    amount?: number;
    currency?: string;
  };
  message?: string;
};

function formatShopAddress(
  address: NonNullable<ShopOrderDetailResponse["order"]>["address"]
): string[] {
  if (!address) return [];
  return [
    address.line1,
    address.line2,
    [address.city, address.state, address.postalCode].filter(Boolean).join(", "),
    address.country,
  ]
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .map((v) => v.trim());
}

export async function fetchWebsiteOrderLineItems(
  userId: string,
  externalOrderId: string
): Promise<WebsiteOrderLineItem[]> {
  const snapshot = await fetchWebsiteOrderDetailSnapshot(userId, externalOrderId);
  return snapshot?.lineItems ?? [];
}

export type WebsiteOrderDetailSnapshot = {
  lineItems: WebsiteOrderLineItem[];
  customerName: string;
  customerMobile: string;
  addressLines: string[];
  amount: number | null;
  currency: string | null;
};

export async function fetchWebsiteOrderDetailSnapshot(
  userId: string,
  externalOrderId: string
): Promise<WebsiteOrderDetailSnapshot | null> {
  const integration = await getPrimaryEnabledIntegration(userId);
  const id = externalOrderId.trim();
  if (!integration?.api_key?.trim() || !id) return null;

  const base = normalizeShopBaseUrl(integration.api_base_url);
  const url = `${base}/api/velo/orders/${encodeURIComponent(id)}`;

  try {
    const res = await fetch(url, {
      headers: { "x-velo-key": integration.api_key.trim() },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const payload = (await res.json()) as ShopOrderDetailResponse;
    const order = payload.order;
    if (!order) return null;

    return {
      lineItems: lineItemsFromVeloApiItems(order.items),
      customerName: order.customer?.name?.trim() || "",
      customerMobile: order.customer?.mobile?.trim() || "",
      addressLines: formatShopAddress(order.address ?? null),
      amount: typeof order.amount === "number" ? order.amount : null,
      currency: order.currency?.trim() || null,
    };
  } catch (e) {
    console.warn("[WebsiteOrderDetail] snapshot failed:", (e as Error).message);
    return null;
  }
}
