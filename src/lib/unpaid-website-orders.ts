import {
  getEnabledApiIntegrations,
  type ApiIntegrationRow,
} from "./api-settings-supabase";
import type { WebsiteOrderLineItem } from "./db-types";
import { normalizeWebsitePaymentStatus } from "./order-payment-status";
import {
  peekUnpaidWebsiteOrdersCache,
  writeUnpaidWebsiteOrdersCache,
} from "./unpaid-orders-cache";
import { normalizeShopBaseUrl } from "./shop-url-utils";
import { supabase } from "./supabase";
import { lineItemsFromVeloApiItems } from "./website-order-line-items";

const VELO_PROXY_FUNCTION = "velo-website-orders";
const LOOKBACK_DAYS = 30;
const PAGE_LIMIT = 100;
const MAX_PAGES = 5;
const MAX_ORDERS = 300;

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
  shopBaseUrl: string;
  integrationId: string;
};

type ShopListOrder = {
  orderId?: string;
  id?: string;
  createdAt?: string | Date;
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
  nextSince?: string | Date | null;
  nextBefore?: string | Date | null;
  sort?: string;
  error?: string;
  message?: string;
};

type FetchResult = {
  orders: UnpaidWebsiteOrder[];
  error: string | null;
  warning: string | null;
  fromCache: boolean;
  /** True when a background shop refresh is in flight. */
  revalidating?: boolean;
};

const revalidateInFlight = new Map<string, Promise<FetchResult>>();
const lastNetworkAt = new Map<string, number>();
const REVALIDATE_COOLDOWN_MS = 8_000;

function lookbackSinceIso(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - LOOKBACK_DAYS);
  return d.toISOString();
}

function asIso(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  const s = String(value).trim();
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isNaN(t) ? s : new Date(t).toISOString();
}

function formatAddressLines(address: ShopListOrder["address"]): string[] {
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

/** One connection per shop base URL + API key (DB often has duplicates). */
export function uniqueShopIntegrations(
  rows: ApiIntegrationRow[]
): ApiIntegrationRow[] {
  const map = new Map<string, ApiIntegrationRow>();
  for (const row of rows) {
    const key = row.api_key?.trim();
    if (!key) continue;
    const base = normalizeShopBaseUrl(row.api_base_url);
    const dedupeKey = `${base}|${key}`;
    if (!map.has(dedupeKey)) map.set(dedupeKey, row);
  }
  return [...map.values()];
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
    createdAt: asIso(raw.createdAt),
    amount:
      typeof raw.amount === "number" && Number.isFinite(raw.amount)
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
    shopBaseUrl: normalizeShopBaseUrl(integration.api_base_url),
    integrationId: integration.id,
  };
}

type FetchPageOpts = {
  integration: ApiIntegrationRow;
  since: string;
  limit: number;
  paymentStatus?: "unpaid";
  sort?: "desc";
  before?: string;
};

async function fetchPageViaProxy(opts: FetchPageOpts): Promise<ShopListResponse> {
  const { data, error } = await supabase.functions.invoke(VELO_PROXY_FUNCTION, {
    body: {
      integration_id: opts.integration.id,
      since: opts.since,
      limit: opts.limit,
      ...(opts.paymentStatus ? { payment_status: opts.paymentStatus } : {}),
      ...(opts.sort ? { sort: opts.sort } : {}),
      ...(opts.before ? { before: opts.before } : {}),
    },
  });

  if (error) {
    throw new Error(error.message || "Proxy failed");
  }
  if (
    data &&
    typeof data === "object" &&
    "error" in data &&
    (data as { error?: unknown }).error
  ) {
    throw new Error(String((data as { error: unknown }).error));
  }
  return (data ?? {}) as ShopListResponse;
}

async function fetchPageDirect(opts: FetchPageOpts): Promise<ShopListResponse> {
  const base = normalizeShopBaseUrl(opts.integration.api_base_url);
  const params = new URLSearchParams({
    since: opts.since,
    limit: String(opts.limit),
  });
  if (opts.paymentStatus) params.set("paymentStatus", opts.paymentStatus);
  if (opts.sort) params.set("sort", opts.sort);
  if (opts.before) params.set("before", opts.before);
  const url = `${base}/api/velo/orders?${params.toString()}`;
  const res = await fetch(url, {
    headers: { "x-velo-key": opts.integration.api_key.trim() },
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

function isUnsupportedFilterError(msg: string): boolean {
  return /invalid.*(paymentstatus|sort|before)|payment_status|400/i.test(msg);
}

async function fetchPageWithFallback(
  opts: FetchPageOpts
): Promise<ShopListResponse> {
  try {
    return await fetchPageViaProxy(opts);
  } catch (proxyErr) {
    const msg = (proxyErr as Error).message || "";
    // Prefer direct shop call for network/proxy/deploy issues (Capacitor + CORS
    // shops may still work via edge; when edge fails, try shop).
    try {
      return await fetchPageDirect(opts);
    } catch (directErr) {
      if (isUnsupportedFilterError(msg) || isUnsupportedFilterError((directErr as Error).message || "")) {
        throw directErr;
      }
      // Prefer the more specific direct error when both failed.
      throw directErr;
    }
  }
}

async function fetchPagesForIntegration(
  integration: ApiIntegrationRow
): Promise<UnpaidWebsiteOrder[]> {
  if (!integration.api_key?.trim()) return [];

  const collected: UnpaidWebsiteOrder[] = [];
  const since = lookbackSinceIso();

  // Prefer newest-first unpaid filter (requires shop sort=desc support).
  try {
    let before: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const payload = await fetchPageWithFallback({
        integration,
        since,
        limit: PAGE_LIMIT,
        paymentStatus: "unpaid",
        sort: "desc",
        ...(before ? { before } : {}),
      });
      const rows = Array.isArray(payload.orders) ? payload.orders : [];
      for (const row of rows) {
        const mapped = mapShopOrder(row, integration);
        if (mapped) collected.push(mapped);
      }
      if (rows.length === 0) break;
      const nextBefore = asIso(payload.nextBefore ?? null);
      // Older shops ignore sort=desc and omit nextBefore — stop after one page
      // (client still sorts) rather than infinite-looping on nextSince.
      if (!nextBefore || rows.length < PAGE_LIMIT) break;
      if (before && nextBefore === before) break;
      before = nextBefore;
      if (collected.length >= MAX_ORDERS) break;
    }
    return collected;
  } catch (err) {
    if (!isUnsupportedFilterError((err as Error).message || "")) {
      throw err;
    }
    // Fall through to unfiltered asc walk + client unpaid filter.
  }

  let cursor = since;
  for (let page = 0; page < MAX_PAGES; page++) {
    const payload = await fetchPageWithFallback({
      integration,
      since: cursor,
      limit: PAGE_LIMIT,
    });
    const rows = Array.isArray(payload.orders) ? payload.orders : [];
    for (const row of rows) {
      const mapped = mapShopOrder(row, integration);
      if (mapped) collected.push(mapped);
    }
    if (rows.length === 0) break;
    const next = asIso(payload.nextSince ?? null);
    if (!next || next === cursor || rows.length < PAGE_LIMIT) break;
    cursor = next;
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

function dedupeOrders(orders: UnpaidWebsiteOrder[]): UnpaidWebsiteOrder[] {
  const seen = new Set<string>();
  const out: UnpaidWebsiteOrder[] = [];
  for (const o of orders) {
    const key = `${o.shopBaseUrl}|${o.orderId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(o);
  }
  return out;
}

export { peekUnpaidWebsiteOrdersCache } from "./unpaid-orders-cache";

async function fetchUnpaidWebsiteOrdersNetwork(
  userId: string
): Promise<FetchResult> {
  const integrations = uniqueShopIntegrations(
    await getEnabledApiIntegrations(userId)
  );
  if (!integrations.length) {
    const result: FetchResult = {
      orders: [],
      error:
        "Connect a website API key in Settings → API to see unpaid orders.",
      warning: null,
      fromCache: false,
      revalidating: false,
    };
    writeUnpaidWebsiteOrdersCache(userId, [], null);
    lastNetworkAt.set(userId, Date.now());
    return result;
  }

  const errors: string[] = [];
  const batches = await Promise.all(
    integrations.map(async (integration) => {
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

  const orders = sortNewestFirst(dedupeOrders(batches.flat())).slice(
    0,
    MAX_ORDERS
  );

  const warning =
    orders.length > 0 && errors.length > 0 ? errors.join(" · ") : null;
  const error =
    orders.length === 0 && errors.length > 0 ? errors.join(" · ") : null;

  lastNetworkAt.set(userId, Date.now());

  // Don't wipe a good local list when every shop request fails.
  if (error) {
    const prev = peekUnpaidWebsiteOrdersCache(userId);
    if (prev && prev.orders.length > 0) {
      return {
        orders: prev.orders,
        error: null,
        warning: error,
        fromCache: true,
        revalidating: false,
      };
    }
  }

  writeUnpaidWebsiteOrdersCache(userId, orders, warning);

  return { orders, error, warning, fromCache: false, revalidating: false };
}

function scheduleRevalidate(
  userId: string,
  onFresh?: (result: FetchResult) => void
): boolean {
  const existing = revalidateInFlight.get(userId);
  if (existing) {
    void existing.then((r) => onFresh?.(r));
    return true;
  }

  const last = lastNetworkAt.get(userId) ?? 0;
  if (Date.now() - last < REVALIDATE_COOLDOWN_MS) {
    return false;
  }

  const promise = fetchUnpaidWebsiteOrdersNetwork(userId)
    .then((result) => {
      onFresh?.(result);
      return result;
    })
    .finally(() => {
      if (revalidateInFlight.get(userId) === promise) {
        revalidateInFlight.delete(userId);
      }
    });

  revalidateInFlight.set(userId, promise);
  return true;
}

/**
 * Stale-while-revalidate for unpaid checkouts (not the paid orders table).
 * Returns durable cache instantly when present; refreshes from shop in background.
 */
export async function fetchUnpaidWebsiteOrders(
  userId: string,
  opts?: {
    force?: boolean;
    onFresh?: (result: {
      orders: UnpaidWebsiteOrder[];
      error: string | null;
      warning: string | null;
      fromCache: boolean;
    }) => void;
  }
): Promise<FetchResult> {
  const force = Boolean(opts?.force);
  const onFresh = opts?.onFresh;

  if (!force) {
    const cached = peekUnpaidWebsiteOrdersCache(userId);
    if (cached) {
      // Fresh: serve instantly. Stale: serve + background refresh (SWR).
      if (!cached.isStale) {
        return {
          orders: cached.orders,
          error: null,
          warning: cached.warning,
          fromCache: true,
          revalidating: false,
        };
      }
      const revalidating = scheduleRevalidate(userId, onFresh);
      return {
        orders: cached.orders,
        error: null,
        warning: cached.warning,
        fromCache: true,
        revalidating,
      };
    }
  }

  const inFlight = revalidateInFlight.get(userId);
  if (inFlight && !force) {
    return inFlight.then((result) => ({ ...result, revalidating: false }));
  }

  const promise = fetchUnpaidWebsiteOrdersNetwork(userId).finally(() => {
    if (revalidateInFlight.get(userId) === promise) {
      revalidateInFlight.delete(userId);
    }
  });
  revalidateInFlight.set(userId, promise);
  const result = await promise;
  onFresh?.(result);
  return { ...result, revalidating: false };
}
