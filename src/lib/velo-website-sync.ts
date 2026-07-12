import type { Order, OrderInsert } from "./db-types";
import { normalizeWebsitePaymentStatus, isPaidOrderPayment } from "./order-payment-status";
import {
  type ApiIntegrationRow,
  DEFAULT_VELO_WEBSITE_BASE_URL,
  getEnabledApiIntegrations,
  updateApiIntegrationSyncState,
} from "./api-settings-supabase";
import { getAllOrders } from "./local-store";
import { createOrder, getSuggestions, updateOrder } from "./order-service";
import { buildSuggestionsFromOrders } from "./order-suggestions";
import { supabase } from "./supabase";
import { normalizeShopBaseUrl } from "./shop-url-utils";
import {
  notifyNewWebsiteOrders,
  type ImportedWebsiteOrderSummary,
} from "./order-alert-service";
import { markWebsitePollComplete } from "./sync-coalesce";
import type { WebsiteOrderLineItem } from "./db-types";
import {
  hasWebsiteLineItems,
  lineItemsFromVeloApiItems,
  totalQuantityFromLineItems,
} from "./website-order-line-items";
import { buildWebsiteToAddress } from "./pdf-address-sanitize";

const EPOCH_SINCE = new Date(0).toISOString();
const MAX_RECIPIENT_LEN = 600;
const POLL_LIMIT = 50;

export type { ImportedWebsiteOrderSummary } from "./order-alert-service";

export type VeloWebsitePollResult = {
  imported: number;
  updated: number;
  skipped: number;
  errors: string[];
  newOrders: ImportedWebsiteOrderSummary[];
};

type VeloLineItem = {
  productId?: string;
  productCode?: string | null;
  imageUrl?: string | null;
  unitPrice?: number;
  name?: string;
  title?: string;
  productName?: string | null;
  product?: string | { name?: string; title?: string; productName?: string };
  quantity?: number;
  qty?: number;
  count?: number;
};

type VeloWebsiteOrderPayload = {
  orderId?: string;
  id?: string;
  address?: string | Record<string, unknown>;
  customer?: {
    name?: string;
    mobile?: string;
    phone?: string;
    email?: string;
  };
  items?: VeloLineItem[];
  products?: VeloLineItem[];
  lineItems?: VeloLineItem[];
  orderItems?: VeloLineItem[];
  quantity?: number;
  totalQuantity?: number;
  createdAt?: string;
  paidAt?: string;
  orderDate?: string;
  bookedAt?: string;
  paymentStatus?: string;
  payment_status?: string;
};

type VeloOrdersApiResponse = {
  orders?: VeloWebsiteOrderPayload[];
  nextSince?: string;
};

let pollInFlightPromise: Promise<VeloWebsitePollResult> | null = null;

const INTEGRATIONS_CACHE_MS = 60_000;
let integrationsCache: { userId: string; at: number; rows: ApiIntegrationRow[] } | null = null;
const senderAddressCache = new Map<string, { at: number; address: string }>();
const SENDER_CACHE_MS = 120_000;

export { wasWebsitePollRecent } from "./sync-coalesce";

async function getCachedEnabledIntegrations(userId: string): Promise<ApiIntegrationRow[]> {
  const now = Date.now();
  if (
    integrationsCache &&
    integrationsCache.userId === userId &&
    now - integrationsCache.at < INTEGRATIONS_CACHE_MS
  ) {
    return integrationsCache.rows;
  }
  const rows = await getEnabledApiIntegrations(userId);
  integrationsCache = { userId, at: now, rows };
  return rows;
}

const VELO_PROXY_FUNCTION = "velo-website-orders";

function formatFetchError(err: unknown): string {
  const msg = (err as Error).message || "Connection failed";
  if (/failed to fetch|networkerror|load failed/i.test(msg)) {
    return "Cannot reach Velo website API from this device (network/CORS). Deploy the velo-website-orders Supabase Edge Function, or update CORS on the shop API.";
  }
  return msg;
}

function normalizeBaseUrl(url: string): string {
  return normalizeShopBaseUrl(url || DEFAULT_VELO_WEBSITE_BASE_URL);
}

function itemName(item: VeloLineItem): string {
  if (typeof item.product === "object" && item.product) {
    const p = item.product;
    return (p.name || p.title || p.productName || "Item").trim();
  }
  if (typeof item.product === "string" && item.product.trim()) return item.product.trim();
  return (item.name || item.title || item.productName || "Item").trim();
}

function itemQty(item: VeloLineItem): number {
  const raw = item.quantity ?? item.qty ?? item.count ?? 1;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

function extractLineItems(order: VeloWebsiteOrderPayload): VeloLineItem[] {
  for (const key of ["items", "products", "lineItems", "orderItems"] as const) {
    const arr = order[key];
    if (Array.isArray(arr) && arr.length > 0) return arr;
  }
  return [];
}

function parseProducts(order: VeloWebsiteOrderPayload): {
  productLines: string[];
  totalQty: number;
} {
  const items = extractLineItems(order);
  if (items.length === 0) {
    const fallback = Number(order.totalQuantity ?? order.quantity ?? 1);
    const qty = Number.isFinite(fallback) && fallback >= 1 ? Math.floor(fallback) : 1;
    return { productLines: [], totalQty: qty };
  }

  const productLines: string[] = [];
  let totalQty = 0;
  for (const item of items) {
    const name = itemName(item);
    const qty = itemQty(item);
    totalQty += qty;
    productLines.push(`${name} x${qty}`);
  }
  return { productLines, totalQty: Math.max(1, totalQty) };
}

function formatAddressField(address: VeloWebsiteOrderPayload["address"]): string {
  if (!address) return "";
  if (typeof address === "string") return address.trim();
  if (typeof address === "object") {
    const a = address as Record<string, unknown>;
    const parts = [
      a.line1,
      a.line2,
      a.street,
      a.area,
      a.city,
      a.state,
      a.pincode,
      a.postalCode,
      a.zip,
      a.country,
    ]
      .filter((v) => typeof v === "string" && v.trim())
      .map((v) => (v as string).trim());
    if (parts.length) return parts.join(", ");
    return JSON.stringify(address);
  }
  return String(address).trim();
}

function buildRecipientDetails(order: VeloWebsiteOrderPayload, _externalId: string): string {
  const mobile =
    order.customer?.mobile?.trim() ||
    order.customer?.phone?.trim() ||
    "";

  // TO for labels/app: name + address only — no Web #, no Items block.
  // Mob No is always the last separate line when mobile is present.
  return buildWebsiteToAddress({
    customerName: order.customer?.name?.trim() || null,
    addressText: formatAddressField(order.address) || null,
    mobile,
    maxLen: MAX_RECIPIENT_LEN,
  });
}

function resolveBookingDate(order: VeloWebsiteOrderPayload): string {
  const raw = order.paidAt || order.createdAt || order.orderDate || order.bookedAt;
  if (raw) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  return new Date().toISOString().slice(0, 10);
}

function resolveExternalOrderId(order: VeloWebsiteOrderPayload): string | null {
  const id = order.orderId ?? order.id;
  if (id == null) return null;
  const s = String(id).trim();
  return s.length > 0 ? s : null;
}

async function getDefaultSenderAddress(userId: string): Promise<string> {
  const cached = senderAddressCache.get(userId);
  if (cached && Date.now() - cached.at < SENDER_CACHE_MS) {
    return cached.address;
  }
  try {
    const suggestions = await getSuggestions(userId);
    const senders = buildSuggestionsFromOrders(suggestions).senders;
    if (senders.length > 0) {
      senderAddressCache.set(userId, { at: Date.now(), address: senders[0] });
      return senders[0];
    }
  } catch {
    /* use fallback below */
  }
  const fallback = "Shop Address";
  senderAddressCache.set(userId, { at: Date.now(), address: fallback });
  return fallback;
}

async function findImportedWebsiteOrder(
  userId: string,
  externalOrderId: string
): Promise<Order | null> {
  const map = await getAllOrders(userId);
  const local = Object.values(map).find(
    (o) => o.external_order_id === externalOrderId
  );
  if (local) return local;

  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("user_id", userId)
    .eq("external_order_id", externalOrderId)
    .maybeSingle();

  if (error) {
    console.warn("[VeloSync] find imported order failed:", error.message);
    return null;
  }
  return (data as Order) ?? null;
}

function mapWebsiteLineItems(order: VeloWebsiteOrderPayload): WebsiteOrderLineItem[] {
  const fromApi = lineItemsFromVeloApiItems(extractLineItems(order));
  if (fromApi.length > 0) return fromApi;

  const { productLines } = parseProducts(order);
  return productLines.map((line) => {
    const match = line.match(/^(.+?)\s+x(\d+)$/i);
    const name = match ? match[1].trim() : line;
    const quantity = match ? Math.max(1, Number(match[2]) || 1) : 1;
    return { name, quantity };
  });
}

function mapWebsiteOrderToInsert(
  order: VeloWebsiteOrderPayload,
  userId: string,
  senderDetails: string,
  externalOrderId: string
): OrderInsert {
  const lineItems = mapWebsiteLineItems(order);
  const { totalQty } = parseProducts(order);
  const mobile =
    order.customer?.mobile?.trim() ||
    order.customer?.phone?.trim() ||
    "";

  return {
    recipient_details: buildRecipientDetails(order, externalOrderId),
    sender_details: senderDetails,
    booked_by: order.customer?.name?.trim() || "Website",
    booked_mobile_no: mobile,
    courier_name: "Professional",
    booking_date: resolveBookingDate(order),
    status: "PENDING",
    user_id: userId,
    quantity: lineItems.length ? totalQuantityFromLineItems(lineItems) : totalQty,
    order_source: "website",
    external_order_id: externalOrderId,
    website_line_items: lineItems.length ? lineItems : null,
    payment_status: normalizeWebsitePaymentStatus(
      order.paymentStatus ?? order.payment_status
    ),
  };
}

async function fetchVeloOrdersViaProxy(
  opts: {
    integrationId?: string;
    apiKey?: string;
    apiBaseUrl?: string;
    since: string;
    limit: number;
  }
): Promise<VeloOrdersApiResponse> {
  const { data, error } = await supabase.functions.invoke(VELO_PROXY_FUNCTION, {
    body: {
      integration_id: opts.integrationId,
      api_key: opts.apiKey,
      api_base_url: opts.apiBaseUrl,
      since: opts.since,
      limit: opts.limit,
    },
  });

  if (error) {
    if (/function not found|404|not deployed/i.test(error.message)) {
      throw new Error(
        "Supabase proxy not deployed. Deploy function velo-website-orders in your Supabase project."
      );
    }
    throw new Error(error.message);
  }

  if (data && typeof data === "object" && "error" in data && data.error) {
    throw new Error(String(data.error));
  }

  return data as VeloOrdersApiResponse;
}

async function fetchVeloOrdersDirect(
  integration: ApiIntegrationRow,
  since: string
): Promise<VeloOrdersApiResponse> {
  const base = normalizeBaseUrl(integration.api_base_url);
  const url = `${base}/api/velo/orders?since=${encodeURIComponent(since)}&limit=${POLL_LIMIT}`;

  const res = await fetch(url, {
    headers: { "x-velo-key": integration.api_key.trim() },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Velo API ${res.status}: failed to fetch orders`);
  }

  return (await res.json()) as VeloOrdersApiResponse;
}

async function fetchVeloOrders(
  integration: ApiIntegrationRow
): Promise<VeloOrdersApiResponse> {
  const since = integration.last_since || EPOCH_SINCE;

  try {
    return await fetchVeloOrdersViaProxy({
      integrationId: integration.id,
      since,
      limit: POLL_LIMIT,
    });
  } catch (proxyErr) {
    const proxyMsg = (proxyErr as Error).message || "";
    if (!/not deployed|function not found/i.test(proxyMsg)) {
      throw proxyErr;
    }
    try {
      return await fetchVeloOrdersDirect(integration, since);
    } catch (directErr) {
      throw new Error(formatFetchError(directErr));
    }
  }
}

export async function testVeloWebsiteConnection(
  apiKey: string,
  apiBaseUrl?: string
): Promise<{ ok: boolean; error?: string }> {
  const key = apiKey.trim();
  if (!key) return { ok: false, error: "API key is required." };

  const base = normalizeBaseUrl(apiBaseUrl ?? DEFAULT_VELO_WEBSITE_BASE_URL);

  try {
    const data = await fetchVeloOrdersViaProxy({
      apiKey: key,
      apiBaseUrl: base,
      since: EPOCH_SINCE,
      limit: 1,
    });
    if (!data || (!Array.isArray(data.orders) && !data.nextSince)) {
      return { ok: false, error: "Unexpected API response format." };
    }
    return { ok: true };
  } catch (proxyErr) {
    const proxyMsg = (proxyErr as Error).message || "";
    if (!/not deployed|function not found/i.test(proxyMsg)) {
      return { ok: false, error: proxyMsg || "Connection failed." };
    }
  }

  const url = `${base}/api/velo/orders?since=${encodeURIComponent(EPOCH_SINCE)}&limit=1`;

  try {
    const res = await fetch(url, {
      headers: { "x-velo-key": key },
      cache: "no-store",
    });
    if (!res.ok) {
      return { ok: false, error: `API returned ${res.status}. Check your API key.` };
    }
    const data = (await res.json()) as VeloOrdersApiResponse;
    if (!data || (!Array.isArray(data.orders) && !data.nextSince)) {
      return { ok: false, error: "Unexpected API response format." };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: formatFetchError(e) };
  }
}

async function importOrdersForIntegration(
  userId: string,
  integration: ApiIntegrationRow,
  senderDetails: string
): Promise<{
  imported: number;
  updated: number;
  skipped: number;
  nextSince: string | null;
  error: string | null;
  newOrders: ImportedWebsiteOrderSummary[];
}> {
  const data = await fetchVeloOrders(integration);
  const orders = Array.isArray(data.orders) ? data.orders : [];
  let imported = 0;
  let updated = 0;
  let skipped = 0;
  const newOrders: ImportedWebsiteOrderSummary[] = [];

  for (const raw of orders) {
    const externalId = resolveExternalOrderId(raw);
    if (!externalId) {
      skipped++;
      continue;
    }

    const paymentStatus = normalizeWebsitePaymentStatus(
      raw.paymentStatus ?? raw.payment_status
    );
    const existing = await findImportedWebsiteOrder(userId, externalId);
    const lineItems = mapWebsiteLineItems(raw);

    const summaryFromRaw = (): ImportedWebsiteOrderSummary => ({
      externalOrderId: externalId,
      customerName: raw.customer?.name?.trim() || "Customer",
      quantity: lineItems.length
        ? totalQuantityFromLineItems(lineItems)
        : parseProducts(raw).totalQty,
      createdAt:
        raw.paidAt?.trim() ||
        raw.createdAt?.trim() ||
        raw.orderDate?.trim() ||
        raw.bookedAt?.trim() ||
        undefined,
    });

    if (existing) {
      const wasPaid = isPaidOrderPayment(existing.payment_status);
      const patches: Record<string, unknown> = {};
      if (existing.payment_status !== paymentStatus) {
        patches.payment_status = paymentStatus;
      }
      if (lineItems.length > 0 && !hasWebsiteLineItems(existing.website_line_items)) {
        patches.website_line_items = lineItems;
      }

      // Refresh TO: strip legacy Web # / Items and enforce Mob No last line.
      const cleanTo = buildRecipientDetails(raw, externalId);
      const mobile =
        raw.customer?.mobile?.trim() ||
        raw.customer?.phone?.trim() ||
        existing.booked_mobile_no?.trim() ||
        "";
      if (
        cleanTo &&
        cleanTo !== (existing.recipient_details ?? "").trim() &&
        (/Web\s*#/i.test(existing.recipient_details ?? "") ||
          /(?:^|\n)---\s*(?:\n|$)/.test(existing.recipient_details ?? "") ||
          /^Items:$/m.test(existing.recipient_details ?? "") ||
          (mobile && !/\(Mob No\s*:/i.test(existing.recipient_details ?? "")))
      ) {
        patches.recipient_details = cleanTo;
      }
      if (mobile && !existing.booked_mobile_no?.trim()) {
        patches.booked_mobile_no = mobile;
      }

      if (Object.keys(patches).length > 0) {
        await updateOrder(userId, existing.id, patches);
        updated++;
        const nowPaid = isPaidOrderPayment(
          (patches.payment_status as typeof paymentStatus) ?? existing.payment_status
        );
        if (!wasPaid && nowPaid) {
          newOrders.push(summaryFromRaw());
        }
      } else {
        skipped++;
      }
      continue;
    }

    if (!isPaidOrderPayment(paymentStatus)) {
      skipped++;
      continue;
    }

    const insert = mapWebsiteOrderToInsert(raw, userId, senderDetails, externalId);
    try {
      await createOrder(userId, insert);
      imported++;
      newOrders.push({
        externalOrderId: externalId,
        customerName: insert.booked_by?.trim() || "Customer",
        quantity: insert.quantity ?? 1,
        createdAt:
          raw.paidAt?.trim() ||
          raw.createdAt?.trim() ||
          raw.orderDate?.trim() ||
          raw.bookedAt?.trim() ||
          undefined,
      });
    } catch (e) {
      const msg = (e as Error).message ?? "";
      if (/duplicate|unique|23505/i.test(msg)) {
        skipped++;
        continue;
      }
      throw e;
    }
  }

  const nextSince = data.nextSince?.trim() || null;
  return { imported, updated, skipped, nextSince, error: null, newOrders };
}

export async function pollVeloWebsiteOrders(userId: string): Promise<VeloWebsitePollResult> {
  if (pollInFlightPromise) return pollInFlightPromise;
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { imported: 0, updated: 0, skipped: 0, errors: ["Offline"], newOrders: [] };
  }

  pollInFlightPromise = (async (): Promise<VeloWebsitePollResult> => {
    const result: VeloWebsitePollResult = {
      imported: 0,
      updated: 0,
      skipped: 0,
      errors: [],
      newOrders: [],
    };

    try {
      const integrations = await getCachedEnabledIntegrations(userId);
      const active = integrations.filter((i) => i.api_key.trim().length > 0);
      if (!active.length) return result;

      const senderDetails = await getDefaultSenderAddress(userId);

      for (const integration of active) {
        try {
          const batch = await importOrdersForIntegration(userId, integration, senderDetails);
          result.imported += batch.imported;
          result.updated += batch.updated;
          result.skipped += batch.skipped;
          result.newOrders.push(...batch.newOrders);

          await updateApiIntegrationSyncState(integration.id, {
            last_since: batch.nextSince ?? integration.last_since,
            last_sync_at: new Date().toISOString(),
            last_error: null,
          });
        } catch (e) {
          const msg = (e as Error).message || "Sync failed";
          result.errors.push(`${integration.label}: ${msg}`);
          await updateApiIntegrationSyncState(integration.id, {
            last_sync_at: new Date().toISOString(),
            last_error: msg,
          });
        }
      }
    } finally {
      markWebsitePollComplete();
    }

    if ((result.imported > 0 || result.updated > 0) && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("velo-website-orders-imported", { detail: result }));
    }

    if (result.newOrders.length > 0) {
      void notifyNewWebsiteOrders(result.newOrders);
    }

    return result;
  })();

  try {
    return await pollInFlightPromise;
  } finally {
    pollInFlightPromise = null;
  }
}
