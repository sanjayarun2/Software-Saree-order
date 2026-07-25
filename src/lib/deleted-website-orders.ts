import { get, set, createStore } from "idb-keyval";
import { supabase } from "./supabase";

const store = createStore("saree-order-cache", "data");

function key(userId: string): string {
  return `deleted_external_orders:${userId}`;
}

async function readLocal(userId: string): Promise<Set<string>> {
  const rows = (await get<string[]>(key(userId), store)) ?? [];
  return new Set(rows.filter((id) => Boolean(id?.trim())));
}

async function writeLocal(userId: string, ids: Set<string>): Promise<void> {
  await set(key(userId), Array.from(ids), store);
}

/** Mark a website external_order_id as deleted (local + Supabase). */
export async function rememberDeletedExternalOrder(
  userId: string,
  externalOrderId: string
): Promise<void> {
  const id = externalOrderId.trim();
  if (!userId || !id) return;

  const local = await readLocal(userId);
  local.add(id);
  await writeLocal(userId, local);

  try {
    const { error } = await supabase.from("deleted_website_orders").upsert(
      {
        user_id: userId,
        external_order_id: id,
        deleted_at: new Date().toISOString(),
      },
      { onConflict: "user_id,external_order_id" }
    );
    if (error) {
      console.warn("[Delete] tombstone upsert failed:", error.message);
    }
  } catch (e) {
    console.warn("[Delete] tombstone upsert error:", e);
  }
}

export async function isDeletedExternalOrder(
  userId: string,
  externalOrderId: string
): Promise<boolean> {
  const id = externalOrderId.trim();
  if (!userId || !id) return false;
  const local = await readLocal(userId);
  if (local.has(id)) return true;
  return false;
}

/** Pull tombstones from DB into local cache (call on sync / website poll). */
export async function hydrateDeletedExternalOrders(
  userId: string
): Promise<Set<string>> {
  const local = await readLocal(userId);
  try {
    const { data, error } = await supabase
      .from("deleted_website_orders")
      .select("external_order_id")
      .eq("user_id", userId)
      .limit(5000);
    if (error) {
      console.warn("[Delete] hydrate tombstones failed:", error.message);
      return local;
    }
    for (const row of data ?? []) {
      const id = String(row.external_order_id ?? "").trim();
      if (id) local.add(id);
    }
    await writeLocal(userId, local);
  } catch (e) {
    console.warn("[Delete] hydrate tombstones error:", e);
  }
  return local;
}
