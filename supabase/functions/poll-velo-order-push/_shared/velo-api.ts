const PAID_VALUES = new Set(["paid", "success", "captured"]);

export type VeloOrderRow = {
  orderId?: string;
  id?: string;
  customer?: { name?: string };
  quantity?: number;
  totalQuantity?: number;
  items?: Array<{ quantity?: number; qty?: number }>;
  products?: Array<{ quantity?: number; qty?: number }>;
  lineItems?: Array<{ quantity?: number; qty?: number }>;
  paymentStatus?: string;
  payment_status?: string;
  paidAt?: string;
  createdAt?: string;
  orderDate?: string;
  bookedAt?: string;
};

export type VeloOrdersResponse = {
  orders?: VeloOrderRow[];
  nextSince?: string;
};

export function normalizeBaseUrl(url: string): string {
  let raw = (url || "").trim();
  if (!raw) return "https://sakthi-textiles-shop.vercel.app";
  if (!/^https?:\/\//i.test(raw)) {
    raw = `https://${raw.replace(/^\/+/, "")}`;
  }
  return raw.replace(/\/$/, "");
}

export function resolveExternalOrderId(order: VeloOrderRow): string | null {
  const id = order.orderId ?? order.id;
  if (id == null) return null;
  const s = String(id).trim();
  return s.length > 0 ? s : null;
}

export function isPaidVeloOrder(order: VeloOrderRow): boolean {
  const raw = (order.paymentStatus ?? order.payment_status ?? "").trim().toLowerCase();
  return PAID_VALUES.has(raw);
}

export function orderQuantity(order: VeloOrderRow): number {
  for (const key of ["items", "products", "lineItems"] as const) {
    const arr = order[key];
    if (Array.isArray(arr) && arr.length > 0) {
      let total = 0;
      for (const item of arr) {
        const q = Number(item.quantity ?? item.qty ?? 1);
        if (Number.isFinite(q) && q >= 1) total += Math.floor(q);
      }
      if (total > 0) return total;
    }
  }
  const fallback = Number(order.totalQuantity ?? order.quantity ?? 1);
  return Number.isFinite(fallback) && fallback >= 1 ? Math.floor(fallback) : 1;
}

export function orderCreatedAtIso(order: VeloOrderRow): string | null {
  const raw =
    order.paidAt?.trim() ||
    order.createdAt?.trim() ||
    order.orderDate?.trim() ||
    order.bookedAt?.trim() ||
    "";
  if (!raw) return null;
  const ts = new Date(raw).getTime();
  return Number.isNaN(ts) ? null : new Date(ts).toISOString();
}

export function isRecentEnoughForPush(createdAtIso: string | null, maxAgeMs: number): boolean {
  if (!createdAtIso) return false;
  const ts = new Date(createdAtIso).getTime();
  if (Number.isNaN(ts)) return false;
  return Date.now() - ts <= maxAgeMs;
}

export async function fetchVeloOrdersFromShop(params: {
  apiKey: string;
  apiBaseUrl: string;
  since: string;
  limit?: number;
}): Promise<VeloOrdersResponse> {
  const base = normalizeBaseUrl(params.apiBaseUrl);
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
  const url = `${base}/api/velo/orders?since=${encodeURIComponent(params.since)}&limit=${limit}`;

  const res = await fetch(url, {
    headers: { "x-velo-key": params.apiKey.trim() },
    cache: "no-store",
  });

  const text = await res.text();
  if (!res.ok) {
    let message = `Velo API ${res.status}`;
    try {
      const j = JSON.parse(text) as { message?: string };
      if (j.message) message = j.message;
    } catch {
      if (text) message = text.slice(0, 200);
    }
    throw new Error(message);
  }

  try {
    return JSON.parse(text) as VeloOrdersResponse;
  } catch {
    throw new Error("Invalid Velo API JSON response");
  }
}
