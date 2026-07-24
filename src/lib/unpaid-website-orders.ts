import {
  getEnabledApiIntegrations,
  type ApiIntegrationRow,
} from "./api-settings-supabase";
import type { WebsiteOrderLineItem } from "./db-types";
import { normalizeWebsitePaymentStatus } from "./order-payment-status";
import { normalizeShopBaseUrl } from "./shop-url-utils";
import { supabase } from "./supabase";
import { lineItemsFromVeloApiItems } from "./website-order-line-items";

const VELO_PROXY_FUNCTION = "velo-website-orders";
const LOOKBACK_DAYS = 30;
const PAGE_LIMIT = 100;
const MAX_PAGES = 8;
const MAX_ORDERS = 400;
const CACHE_TTL_MS = 45_000;

export type UnpaidWebsiteOrder = {
  orderId: string;
  createdAt: string | null;
  amount: number | null;
  currency: string | null;
  paymentStatus: "unpaid";
  customerName: string;
  customerMobile: string;
  customerEmail: string;
  addressLines: string[];
  items: WebsiteOrderLineItem[];
  shopLabel: string;
  integrationId: string;
};

type ShopListOrder = {
  orderId?: string;
  id?: string;
  createdAt?: string;
  amount?: number;
  currency?: string;
  paymentStatus?: string;
  payment_status?: string;
  customer?: {
    name?: string;
    mobile?: string;
    phone?: string;
    email?: string;
  };
  address?: {
    line1?: string | null;
    line2?: string | null;
    city?: string | null;
    state?: string | null;
    postalCode?: string | null;
    country?: string | null;
  } | null;
  items?: unknown[];
};

type ShopListResponse = {
  orders?: ShopListOrder[];
  nextSince?: string | null;
  error?: string;
  message?: string;
};

type CacheEntry = {
  at: number;
  userId: string;
  orders: UnpaidWebsiteOrder[];
};

let memoryCache: CacheEntry | null = null;

function lookbackSinceIso(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - LOOKBACK_DAYS);
  return d.toISOString();
}

function formatAddressLines(
  address: ShopListOrder["address"]
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

/** Digits-only mobile for display / dialing heuristics. */
export function digitsOnlyPhone(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\D/g, "");
}

/**
 * Build a tel: href for click-to-call.
 * Indian 10-digit numbers → +91; already international → keep leading +.
 */
export function mobileToTelHref(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;
  const digits = digitsOnlyPhone(trimmed);
  if (!digits) return null;

  if (trimmed.startsWith("+") && digits.length >= 8) {
    return `tel:+${digits}`;
  }
  if (digits.length === 10) {
    return `tel:+91${digits}`;
  }
  if (digits.length === 12 && digits.startsWith("91")) {
    return `tel:+${digits}`;
  }
  if (digits.length >= 8) {
    return `tel:+${digits}`;
  }
  return null;
}

export function formatMobileDisplay(raw: string | null | undefined): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return "";
  const digits = digitsOnlyPhone(trimmed);
  if (digits.length === 10) return `+91 ${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) {
    return `+${digits.slice(0, 2)} ${digits.slice(2)}`;
  }
  return trimmed;
}

export function formatMoneyAmount(
  amount: number | null | undefined,
  currency: string | null | undefined
): string {
  if (amount == null || !Number.isFinite(amount)) return "—";
  const cur = (currency || "INR").toUpperCase();
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: cur === "RS" ? "INR" : cur,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${cur} ${Math.round(amount).toLocaleString("en-IN")}`;
  }
}

function isUnpaidShopStatus(raw: string | null | undefined): boolean {
  const v = (raw ?? "").trim().toLowerCase();
  if (!v) return false;
  if (v === "paid" || v === "success" || v === "captured") return false;
  if (v === "no_payment_required") return false;
  return normalizeWebsitePaymentStatus(v) === "unpaid";
}

function mapShopOrder(
  raw: ShopListOrder,
  integration: ApiIntegrationRow
): UnpaidWebsiteOrder | null {
  const orderId = (raw.orderId || raw.id || "").trim();
  if (!orderId) return null;
  const paymentRaw = raw.paymentStatus ?? raw.payment_status;
  if (!isUnpaidShopStatus(paymentRaw)) return null;

  const mobile =
    raw.customer?.mobile?.trim() || raw.customer?.phone?.trim() || "";

  return {
    orderId,
    createdAt: raw.createdAt?.trim() || null,
    amount: typeof raw.amount === "number" && Number.isFinite(raw.amount)
      ? raw.amount
      : null,
    currency: raw.currency?.trim() || null,
    paymentStatus: "unpaid",
    customerName: raw.customer?.name?.trim() || "Customer",
    customerMobile: mobile,
    customerEmail: raw.customer?.email?.trim() || "",
    addressLines: formatAddressLines(raw.address ?? null),
    items: lineItemsFromVeloApiItems(raw.items),
    shopLabel: integration.label?.trim() || "Website",
    integrationId: integration.id,
  };
}

async function fetchPageViaProxy(opts: {
  integrationId: string;
  since: string;
  limit: number;
  paymentStatus?: "unpaid";
}): Promise<ShopListResponse> {
  const { data, error } = await supabase.functions.invoke(VELO_PROXY_FUNCTION, {
    body: {
      integration_id: opts.integrationId,
      since: opts.since,
      limit: opts.limit,
      ...(opts.paymentStatus ? { payment_status: opts.paymentStatus } : {}),
    },
  });

  if (error) {
    throw new Error(error.message || "Proxy failed");
  }
  if (data && typeof data === "object" && "error" in data && (data as { error?: unknown }).error) {
    throw new Error(String((data as { error: unknown }).error));
  }
  return (data ?? {}) as ShopListResponse;
}

async function fetchPageDirect(
  integration: ApiIntegrationRow,
  since: string,
  limit: number,
  paymentStatus?: "unpaid"
): Promise<ShopListResponse> {
  const base = normalizeShopBaseUrl(integration.api_base_url);
  const params = new URLSearchParams({
    since,
    limit: String(limit),
  });
  if (paymentStatus) params.set("paymentStatus", paymentStatus);
  const url = `${base}/api/velo/orders?${params.toString()}`;
  const res = await fetch(url, {
    headers: { "x-velo-key": integration.api_key.trim() },
    cache: "no-store",
  });
  const payload = (await res.json().catch(() => ({}))) as ShopListResponse;
  if (!res.ok) {
    throw new Error(
      payload.message || payload.error || `Velo API ${res.status}`
    );
  }
  return payload;
}

async function fetchPagesForIntegration(
  integration: ApiIntegrationRow
): Promise<UnpaidWebsiteOrder[]> {
  if (!integration.api_key?.trim()) return [];

  const collected: UnpaidWebsiteOrder[] = [];
  let since = lookbackSinceIso();
  let useServerFilter = true;

  for (let page = 0; page < MAX_PAGES; page++) {
    let payload: ShopListResponse;
    try {
      payload = await fetchPageViaProxy({
        integrationId: integration.id,
        since,
        limit: PAGE_LIMIT,
        paymentStatus: useServerFilter ? "unpaid" : undefined,
      });
    } catch (proxyErr) {
      const msg = (proxyErr as Error).message || "";
      // Older shops may reject paymentStatus — retry without filter once.
      if (
        useServerFilter &&
        /invalid.*paymentstatus|payment_status|400/i.test(msg)
      ) {
        useServerFilter = false;
        payload = await fetchPageViaProxy({
          integrationId: integration.id,
          since,
          limit: PAGE_LIMIT,
        });
      } else if (/not deployed|function not found|404/i.test(msg)) {
        try {
          payload = await fetchPageDirect(
            integration,
            since,
            PAGE_LIMIT,
            useServerFilter ? "unpaid" : undefined
          );
        } catch (directErr) {
          const dmsg = (directErr as Error).message || "";
          if (
            useServerFilter &&
            /invalid.*paymentstatus|400/i.test(dmsg)
          ) {
            useServerFilter = false;
            payload = await fetchPageDirect(
              integration,
              since,
              PAGE_LIMIT
            );
          } else {
            throw directErr;
          }
        }
      } else {
        throw proxyErr;
      }
    }

    const rows = Array.isArray(payload.orders) ? payload.orders : [];
    for (const row of rows) {
      const mapped = mapShopOrder(row, integration);
      if (mapped) collected.push(mapped);
    }

    if (rows.length === 0) break;
    const next = payload.nextSince?.trim() || null;
    if (!next || next === since) break;
    if (rows.length < PAGE_LIMIT) break;
    since = typeof next === "string" ? next : new Date(next).toISOString();
    if (collected.length >= MAX_ORDERS) break;
  }

  return collected;
}

function sortNewestFirst(orders: UnpaidWebsiteOrder[]): UnpaidWebsiteOrder[] {
  return [...orders].sort((a, b) => {
    const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
    const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
    return tb - ta;
  });
}

function dedupeByOrderId(orders: UnpaidWebsiteOrder[]): UnpaidWebsiteOrder[] {
  const seen = new Set<string>();
  const out: UnpaidWebsiteOrder[] = [];
  for (const o of orders) {
    const key = `${o.integrationId}:${o.orderId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(o);
  }
  return out;
}

export function peekUnpaidWebsiteOrdersCache(
  userId: string
): UnpaidWebsiteOrder[] | null {
  if (!memoryCache || memoryCache.userId !== userId) return null;
  if (Date.now() - memoryCache.at > CACHE_TTL_MS) return null;
  return memoryCache.orders;
}

/** Live unpaid website checkouts — never written to local orders table. */
export async function fetchUnpaidWebsiteOrders(
  userId: string,
  opts?: { force?: boolean }
): Promise<{ orders: UnpaidWebsiteOrder[]; error: string | null }> {
  if (!opts?.force) {
    const cached = peekUnpaidWebsiteOrdersCache(userId);
    if (cached) return { orders: cached, error: null };
  }

  const integrations = await getEnabledApiIntegrations(userId);
  const withKey = integrations.filter((i) => i.api_key.trim().length > 0);
  if (!withKey.length) {
    return {
      orders: [],
      error: "Connect a website API key in Settings → API to see unpaid orders.",
    };
  }

  const errors: string[] = [];
  const batches = await Promise.all(
    withKey.map(async (integration) => {
      try {
        return await fetchPagesForIntegration(integration);
      } catch (e) {
        errors.push(
          `${integration.label || "Website"}: ${(e as Error).message || "Failed"}`
        );
        return [] as UnpaidWebsiteOrder[];
      }
    })
  );

  const orders = sortNewestFirst(dedupeByOrderId(batches.flat())).slice(
    0,
    MAX_ORDERS
  );

  memoryCache = { at: Date.now(), userId, orders };

  return {
    orders,
    error: orders.length === 0 && errors.length ? errors.join(" · ") : null,
  };
}
