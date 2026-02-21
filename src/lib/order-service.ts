import { supabase } from "./supabase";
import type { Order, OrderInsert, OrderStatus } from "./db-types";
import {
  getAllOrders,
  setAllOrders,
  getOrder as getLocalOrder,
  putOrder,
  removeOrder,
  mergeOrders,
  removeOrdersNotIn,
  getLastSyncTimestamp,
  setLastSyncTimestamp,
  touchAccess,
  getOutbox,
  pushOutbox,
  removeOutboxEntry,
  getCachedSuggestions,
  setCachedSuggestions,
  type OutboxEntry,
} from "./local-store";

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ─── READ: Stale-While-Revalidate ──────────────────────────────

export interface OrderFilters {
  status?: OrderStatus;
  fromDate?: string;
  toDate?: string;
  allOrders?: boolean;
}

/**
 * Instantly returns orders from local cache, then revalidates in background.
 * `onFresh` is called when network data arrives (may be identical to cached).
 */
export async function getOrders(
  userId: string,
  filters: OrderFilters,
  onFresh?: (orders: Order[]) => void,
): Promise<Order[]> {
  const cached = await getOrdersLocal(userId, filters);
  if (cached.length) touchAccess(userId, cached.map((o) => o.id));

  revalidateOrders(userId, filters, onFresh);

  return cached;
}

/** Filter locally-cached orders by status / date range. */
export async function getOrdersLocal(userId: string, filters: OrderFilters): Promise<Order[]> {
  const map = await getAllOrders(userId);
  let list = Object.values(map);

  if (filters.status) {
    list = list.filter((o) => o.status === filters.status);
  }

  if (!filters.allOrders && filters.fromDate && filters.toDate) {
    const dateColumn = filters.status === "PENDING" ? "booking_date" : "despatch_date";
    list = list.filter((o) => {
      const d = o[dateColumn as keyof Order] as string | null;
      if (!d) return false;
      return d >= filters.fromDate! && d <= filters.toDate!;
    });
  }

  list.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
  return list;
}

async function revalidateOrders(
  userId: string,
  filters: OrderFilters,
  onFresh?: (orders: Order[]) => void,
): Promise<void> {
  try {
    const dateColumn = filters.status === "PENDING" ? "booking_date" : "despatch_date";
    let query = supabase
      .from("orders")
      .select("*")
      .eq("user_id", userId);

    if (filters.status) query = query.eq("status", filters.status);

    if (!filters.allOrders && filters.fromDate && filters.toDate) {
      query = query.gte(dateColumn, filters.fromDate).lte(dateColumn, filters.toDate);
    }

    query = query.order("created_at", { ascending: false });

    const { data, error } = await query;
    if (error) throw error;
    const orders = (data as Order[]) ?? [];

    await mergeOrders(userId, orders);
    await touchAccess(userId, orders.map((o) => o.id));

    if (onFresh) onFresh(orders);
  } catch (err) {
    console.warn("[OrderService] revalidate failed:", err);
  }
}

/** Get a single order: local-first, then revalidate. */
export async function getOrderById(
  userId: string,
  orderId: string,
  onFresh?: (order: Order | null) => void,
): Promise<Order | null> {
  const cached = await getLocalOrder(userId, orderId);
  if (cached) touchAccess(userId, [orderId]);

  (async () => {
    try {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("id", orderId)
        .eq("user_id", userId)
        .single();
      if (error) throw error;
      if (data) {
        await putOrder(userId, data as Order);
        await touchAccess(userId, [orderId]);
      }
      if (onFresh) onFresh((data as Order) ?? null);
    } catch {
      if (onFresh) onFresh(cached);
    }
  })();

  return cached;
}

// ─── WRITE: Outbox pattern ─────────────────────────────────────

export async function createOrder(userId: string, insert: OrderInsert): Promise<{ tempId: string }> {
  const tempId = `temp_${uid()}`;
  const now = new Date().toISOString();
  const optimistic: Order = {
    ...insert,
    id: tempId,
    despatch_date: null,
    created_at: now,
    updated_at: now,
  };

  await putOrder(userId, optimistic);

  const entry: OutboxEntry = {
    id: uid(),
    action: { type: "insert", payload: insert as unknown as Record<string, unknown>, tempId },
    createdAt: Date.now(),
  };
  await pushOutbox(userId, entry);

  flushOutbox(userId);

  return { tempId };
}

export async function updateOrder(
  userId: string,
  orderId: string,
  changes: Record<string, unknown>,
): Promise<void> {
  const existing = await getLocalOrder(userId, orderId);
  if (existing) {
    const updated = { ...existing, ...changes, updated_at: new Date().toISOString() } as Order;
    await putOrder(userId, updated);
  }

  const entry: OutboxEntry = {
    id: uid(),
    action: { type: "update", orderId, payload: { ...changes, updated_at: new Date().toISOString() } },
    createdAt: Date.now(),
  };
  await pushOutbox(userId, entry);

  flushOutbox(userId);
}

export async function deleteOrder(userId: string, orderId: string): Promise<void> {
  await removeOrder(userId, orderId);

  const entry: OutboxEntry = {
    id: uid(),
    action: { type: "delete", orderId },
    createdAt: Date.now(),
  };
  await pushOutbox(userId, entry);

  flushOutbox(userId);
}

export async function updateOrderStatus(
  userId: string,
  orderId: string,
  status: OrderStatus,
  despatchDate: string | null,
): Promise<void> {
  const existing = await getLocalOrder(userId, orderId);
  if (existing) {
    const updated: Order = {
      ...existing,
      status,
      despatch_date: despatchDate,
      updated_at: new Date().toISOString(),
    };
    await putOrder(userId, updated);
  }

  const entry: OutboxEntry = {
    id: uid(),
    action: { type: "status", orderId, status, despatch_date: despatchDate },
    createdAt: Date.now(),
  };
  await pushOutbox(userId, entry);

  flushOutbox(userId);
}

// ─── Outbox flush ──────────────────────────────────────────────

let flushing = false;

export async function flushOutbox(userId: string): Promise<void> {
  if (flushing) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;

  flushing = true;
  try {
    const queue = await getOutbox(userId);
    for (const entry of queue) {
      try {
        await processOutboxEntry(userId, entry);
        await removeOutboxEntry(userId, entry.id);
      } catch (err) {
        console.warn("[OrderService] outbox entry failed, will retry:", err);
        break;
      }
    }
  } finally {
    flushing = false;
  }
}

async function processOutboxEntry(userId: string, entry: OutboxEntry): Promise<void> {
  const { action } = entry;
  switch (action.type) {
    case "insert": {
      const { data, error } = await supabase
        .from("orders")
        .insert(action.payload)
        .select()
        .single();
      if (error) throw error;
      // Replace optimistic temp entry with real server record
      await removeOrder(userId, action.tempId);
      if (data) await putOrder(userId, data as Order);
      break;
    }
    case "update": {
      const { error } = await supabase
        .from("orders")
        .update(action.payload)
        .eq("id", action.orderId)
        .eq("user_id", userId);
      if (error) throw error;
      break;
    }
    case "delete": {
      const { error } = await supabase
        .from("orders")
        .delete()
        .eq("id", action.orderId);
      if (error) throw error;
      break;
    }
    case "status": {
      const { error } = await supabase
        .from("orders")
        .update({
          status: action.status,
          despatch_date: action.despatch_date,
          updated_at: new Date().toISOString(),
        })
        .eq("id", action.orderId)
        .eq("user_id", userId);
      if (error) throw error;
      break;
    }
  }
}

// ─── Delta Sync ────────────────────────────────────────────────

/**
 * Fetches only orders updated since last sync, merges them locally.
 * Also checks for server-side deletions by comparing IDs.
 * Returns true if any changes were applied.
 */
export async function syncOrders(userId: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return false;

  try {
    const lastSync = await getLastSyncTimestamp(userId);
    let changed = false;

    // Fetch changed orders since last sync
    let query = supabase
      .from("orders")
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: true });

    if (lastSync) {
      query = query.gt("updated_at", lastSync);
    }

    const { data: deltaData, error: deltaErr } = await query;
    if (deltaErr) throw deltaErr;

    const deltaOrders = (deltaData as Order[]) ?? [];
    if (deltaOrders.length > 0) {
      await mergeOrders(userId, deltaOrders);
      await touchAccess(userId, deltaOrders.map((o) => o.id));
      changed = true;
    }

    // Check for server-side deletions by fetching all IDs
    const { data: idData, error: idErr } = await supabase
      .from("orders")
      .select("id")
      .eq("user_id", userId);
    if (idErr) throw idErr;

    const serverIds = new Set((idData ?? []).map((r: { id: string }) => r.id));
    const localMap = await getAllOrders(userId);
    const localIds = Object.keys(localMap).filter((id) => !id.startsWith("temp_"));

    const deletedLocally = localIds.filter((id) => !serverIds.has(id));
    if (deletedLocally.length > 0) {
      await removeOrdersNotIn(userId, serverIds);
      changed = true;
    }

    // Update sync timestamp to the newest updated_at we received
    const newest = deltaOrders.length > 0
      ? deltaOrders[deltaOrders.length - 1].updated_at
      : lastSync;
    if (newest) await setLastSyncTimestamp(userId, newest);

    return changed;
  } catch (err) {
    console.warn("[OrderService] syncOrders failed:", err);
    return false;
  }
}

// ─── Dashboard stats from cache ────────────────────────────────

export interface DashboardStatsResult {
  total: number;
  dispatched: number;
  pending: number;
}

export async function getStatsFromCache(
  userId: string,
  from: string,
  to: string,
): Promise<DashboardStatsResult> {
  const map = await getAllOrders(userId);
  const orders = Object.values(map);

  let total = 0;
  let dispatched = 0;
  let pending = 0;

  for (const o of orders) {
    const bookDate = o.booking_date;
    if (bookDate >= from && bookDate <= to) total++;

    if (o.status === "DESPATCHED" && o.despatch_date && o.despatch_date >= from && o.despatch_date <= to) {
      dispatched++;
    }

    if (o.status === "PENDING" && bookDate >= from && bookDate <= to) {
      pending++;
    }
  }

  return { total, dispatched, pending };
}

// ─── Suggestions (cached, with SWR) ───────────────────────────

export async function getSuggestions(
  userId: string,
  onFresh?: (data: Order[]) => void,
): Promise<Order[]> {
  const cached = await getCachedSuggestions(userId);

  (async () => {
    try {
      const { data } = await supabase
        .from("orders")
        .select("recipient_details,sender_details,booked_by,booked_mobile_no,courier_name")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (data) {
        await setCachedSuggestions(userId, data as Order[]);
        if (onFresh) onFresh(data as Order[]);
      }
    } catch {
      // silent
    }
  })();

  return cached ?? [];
}

// ─── Full sync (initial load / pull-to-refresh) ───────────────

export async function fullSync(userId: string): Promise<Order[]> {
  try {
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    const orders = (data as Order[]) ?? [];

    const map: Record<string, Order> = {};
    for (const o of orders) map[o.id] = o;
    await setAllOrders(userId, map);
    await touchAccess(userId, orders.map((o) => o.id));

    if (orders.length > 0) {
      const newest = orders.reduce((a, b) =>
        (a.updated_at ?? "") > (b.updated_at ?? "") ? a : b,
      );
      await setLastSyncTimestamp(userId, newest.updated_at);
    }

    return orders;
  } catch (err) {
    console.warn("[OrderService] fullSync failed:", err);
    return [];
  }
}
