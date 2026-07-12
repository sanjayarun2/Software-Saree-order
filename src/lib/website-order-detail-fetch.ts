import {
  getPrimaryEnabledIntegration,
} from "./api-settings-supabase";
import type { WebsiteOrderLineItem } from "./db-types";
import { lineItemsFromVeloApiItems } from "./website-order-line-items";
import { normalizeShopBaseUrl } from "./shop-url-utils";
import { supabase } from "./supabase";

const VELO_PROXY_FUNCTION = "velo-website-orders";
const DETAIL_TIMEOUT_MS = 8_000;

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
  error?: string;
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

function snapshotFromPayload(
  payload: ShopOrderDetailResponse
): WebsiteOrderDetailSnapshot | null {
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

async function fetchOrderDetailViaProxy(
  integrationId: string,
  externalOrderId: string
): Promise<WebsiteOrderDetailSnapshot | null> {
  const { data, error } = await supabase.functions.invoke(VELO_PROXY_FUNCTION, {
    body: {
      integration_id: integrationId,
      order_id: externalOrderId,
    },
  });

  if (error) {
    console.warn("[WebsiteOrderDetail] proxy failed:", error.message);
    return null;
  }

  if (data && typeof data === "object" && "error" in data && data.error) {
    console.warn("[WebsiteOrderDetail] proxy error:", String(data.error));
    return null;
  }

  return snapshotFromPayload((data ?? {}) as ShopOrderDetailResponse);
}

async function fetchOrderDetailDirect(
  apiKey: string,
  apiBaseUrl: string,
  externalOrderId: string
): Promise<WebsiteOrderDetailSnapshot | null> {
  const base = normalizeShopBaseUrl(apiBaseUrl);
  const url = `${base}/api/velo/orders/${encodeURIComponent(externalOrderId)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DETAIL_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      headers: { "x-velo-key": apiKey },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const payload = (await res.json()) as ShopOrderDetailResponse;
    return snapshotFromPayload(payload);
  } catch (e) {
    console.warn("[WebsiteOrderDetail] direct failed:", (e as Error).message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Load one website order packing snapshot.
 * Prefer Supabase proxy (CORS-safe on phone), then short-timeout direct fetch.
 */
export async function fetchWebsiteOrderDetailSnapshot(
  userId: string,
  externalOrderId: string
): Promise<WebsiteOrderDetailSnapshot | null> {
  const integration = await getPrimaryEnabledIntegration(userId);
  const id = externalOrderId.trim();
  if (!integration?.api_key?.trim() || !id) return null;

  const viaProxy = await fetchOrderDetailViaProxy(integration.id, id);
  if (viaProxy) return viaProxy;

  return fetchOrderDetailDirect(
    integration.api_key.trim(),
    integration.api_base_url,
    id
  );
}
