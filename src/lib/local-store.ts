import { get, set, del, createStore } from "idb-keyval";
import type { Order } from "./db-types";

const store = createStore("saree-order-cache", "data");

const LRU_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

// ─── Key helpers ───────────────────────────────────────────────

function ordersKey(userId: string): string {
  return `orders:${userId}`;
}
function metaKey(userId: string): string {
  return `meta:${userId}`;
}
function outboxKey(userId: string): string {
  return `outbox:${userId}`;
}
function suggestionsKey(userId: string): string {
  return `suggestions:${userId}`;
}

// ─── Types ─────────────────────────────────────────────────────

export type OutboxAction =
  | { type: "insert"; payload: Record<string, unknown>; tempId: string }
  | { type: "update"; orderId: string; payload: Record<string, unknown> }
  | { type: "delete"; orderId: string }
  | { type: "status"; orderId: string; status: string; despatch_date: string | null };

export interface OutboxEntry {
  id: string;
  action: OutboxAction;
  createdAt: number;
}

export interface StoreMeta {
  lastSyncTimestamp: string | null;
  accessLog: Record<string, number>;
}

interface SuggestionsCache {
  data: Order[];
  timestamp: number;
}

// ─── Orders CRUD ───────────────────────────────────────────────

export async function getAllOrders(userId: string): Promise<Record<string, Order>> {
  return (await get<Record<string, Order>>(ordersKey(userId), store)) ?? {};
}

export async function setAllOrders(userId: string, map: Record<string, Order>): Promise<void> {
  await set(ordersKey(userId), map, store);
}

export async function getOrder(userId: string, orderId: string): Promise<Order | null> {
  const map = await getAllOrders(userId);
  return map[orderId] ?? null;
}

export async function putOrder(userId: string, order: Order): Promise<void> {
  const map = await getAllOrders(userId);
  map[order.id] = order;
  await set(ordersKey(userId), map, store);
}

export async function removeOrder(userId: string, orderId: string): Promise<void> {
  const map = await getAllOrders(userId);
  delete map[orderId];
  await set(ordersKey(userId), map, store);
}

export async function mergeOrders(userId: string, orders: Order[]): Promise<void> {
  const map = await getAllOrders(userId);
  for (const o of orders) {
    const existing = map[o.id];
    if (!existing || o.updated_at >= existing.updated_at) {
      map[o.id] = o;
    }
  }
  await set(ordersKey(userId), map, store);
}

export async function removeOrdersNotIn(userId: string, serverIds: Set<string>): Promise<void> {
  const map = await getAllOrders(userId);
  let changed = false;
  for (const id of Object.keys(map)) {
    if (!serverIds.has(id)) {
      delete map[id];
      changed = true;
    }
  }
  if (changed) await set(ordersKey(userId), map, store);
}

// ─── Meta (sync timestamp + access log) ────────────────────────

async function getMeta(userId: string): Promise<StoreMeta> {
  return (await get<StoreMeta>(metaKey(userId), store)) ?? { lastSyncTimestamp: null, accessLog: {} };
}

async function setMeta(userId: string, meta: StoreMeta): Promise<void> {
  await set(metaKey(userId), meta, store);
}

export async function getLastSyncTimestamp(userId: string): Promise<string | null> {
  return (await getMeta(userId)).lastSyncTimestamp;
}

export async function setLastSyncTimestamp(userId: string, ts: string): Promise<void> {
  const meta = await getMeta(userId);
  meta.lastSyncTimestamp = ts;
  await setMeta(userId, meta);
}

export async function touchAccess(userId: string, orderIds: string[]): Promise<void> {
  if (!orderIds.length) return;
  const meta = await getMeta(userId);
  const now = Date.now();
  for (const id of orderIds) {
    meta.accessLog[id] = now;
  }
  await setMeta(userId, meta);
}

// ─── LRU Eviction ──────────────────────────────────────────────

export async function evictStaleEntries(userId: string): Promise<number> {
  const meta = await getMeta(userId);
  const cutoff = Date.now() - LRU_MAX_AGE_MS;
  const staleIds: string[] = [];

  for (const [id, ts] of Object.entries(meta.accessLog)) {
    if (ts < cutoff) staleIds.push(id);
  }

  if (!staleIds.length) return 0;

  const map = await getAllOrders(userId);
  for (const id of staleIds) {
    delete map[id];
    delete meta.accessLog[id];
  }

  await set(ordersKey(userId), map, store);
  await setMeta(userId, meta);
  return staleIds.length;
}

// ─── Outbox ────────────────────────────────────────────────────

export async function getOutbox(userId: string): Promise<OutboxEntry[]> {
  return (await get<OutboxEntry[]>(outboxKey(userId), store)) ?? [];
}

export async function pushOutbox(userId: string, entry: OutboxEntry): Promise<void> {
  const queue = await getOutbox(userId);
  queue.push(entry);
  await set(outboxKey(userId), queue, store);
}

export async function removeOutboxEntry(userId: string, entryId: string): Promise<void> {
  const queue = await getOutbox(userId);
  const filtered = queue.filter((e) => e.id !== entryId);
  await set(outboxKey(userId), filtered, store);
}

export async function clearOutbox(userId: string): Promise<void> {
  await del(outboxKey(userId), store);
}

// ─── Suggestions cache ─────────────────────────────────────────

const SUGGESTIONS_TTL_MS = 10 * 60 * 1000; // 10 minutes

export async function getCachedSuggestions(userId: string): Promise<Order[] | null> {
  const cached = await get<SuggestionsCache>(suggestionsKey(userId), store);
  if (!cached) return null;
  if (Date.now() - cached.timestamp > SUGGESTIONS_TTL_MS) return null;
  return cached.data;
}

export async function setCachedSuggestions(userId: string, data: Order[]): Promise<void> {
  await set(suggestionsKey(userId), { data, timestamp: Date.now() } as SuggestionsCache, store);
}

// ─── Full wipe (e.g. on logout) ───────────────────────────────

export async function clearUserData(userId: string): Promise<void> {
  await Promise.all([
    del(ordersKey(userId), store),
    del(metaKey(userId), store),
    del(outboxKey(userId), store),
    del(suggestionsKey(userId), store),
  ]);
}
