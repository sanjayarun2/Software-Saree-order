import { flushOutbox, syncDashboardOrders, syncOrders } from "./order-service";
import { mergeOrders } from "./local-store";
import { evictStaleEntries } from "./local-store";
import { supabase } from "./supabase";
import type { Order } from "./db-types";
import type { RealtimeChannel } from "@supabase/supabase-js";

let initialized = false;
let userId: string | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let realtimeChannel: RealtimeChannel | null = null;
let syncInFlight = false;

const POLL_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes

async function safeSync() {
  if (!userId || syncInFlight) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  syncInFlight = true;
  try {
    await flushOutbox(userId);
    await syncDashboardOrders(userId);
  } finally {
    syncInFlight = false;
  }
}

function handleOnline() {
  if (!userId) return;
  console.log("[SyncManager] Online – flushing outbox & syncing");
  safeSync();
}

function handleVisibilityChange() {
  if (!userId) return;
  if (document.visibilityState === "visible") {
    console.log("[SyncManager] App resumed – syncing");
    safeSync();
  }
}

async function handleAppStateChange() {
  if (!userId) return;
  try {
    const { App } = await import("@capacitor/app");
    App.addListener("appStateChange", ({ isActive }) => {
      if (isActive && userId) {
        console.log("[SyncManager] Capacitor appStateChange – syncing");
        safeSync();
      }
    });
  } catch {
    // Not in a Capacitor environment, rely on visibilitychange instead
  }
}

function startPolling() {
  stopPolling();
  pollTimer = setInterval(() => {
    if (!userId) return;
    if (document.visibilityState !== "visible") return;
    safeSync();
  }, POLL_INTERVAL_MS);
}

function stopPolling() {
  if (pollTimer != null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function startRealtime(uid: string) {
  stopRealtime();
  realtimeChannel = supabase
    .channel(`orders:user:${uid}`)
    .on<Order>(
      "postgres_changes",
      { event: "*", schema: "public", table: "orders", filter: `user_id=eq.${uid}` },
      async (payload) => {
        if (!userId) return;
        if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
          const row = payload.new as Order;
          if (row?.id) {
            await mergeOrders(userId, [row]);
          }
        } else if (payload.eventType === "DELETE") {
          await syncOrders(userId);
        }
      },
    )
    .subscribe((status) => {
      if (status === "CHANNEL_ERROR") {
        console.warn("[SyncManager] Realtime channel error, will rely on polling");
      }
    });
}

function stopRealtime() {
  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
}

export function initSyncManager(uid: string): void {
  if (initialized && userId === uid) return;

  userId = uid;

  if (typeof window === "undefined") return;

  if (!initialized) {
    window.addEventListener("online", handleOnline);
    window.addEventListener("visibilitychange", handleVisibilityChange);
    handleAppStateChange();
    initialized = true;
  }

  evictStaleEntries(uid).then((count) => {
    if (count > 0) console.log(`[SyncManager] Evicted ${count} stale entries`);
  });

  startPolling();
  startRealtime(uid);

  if (navigator.onLine) {
    safeSync();
  }
}

export function teardownSyncManager(): void {
  if (typeof window === "undefined") return;
  window.removeEventListener("online", handleOnline);
  window.removeEventListener("visibilitychange", handleVisibilityChange);
  stopPolling();
  stopRealtime();
  initialized = false;
  userId = null;
  syncInFlight = false;
}

export function isOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine;
}
