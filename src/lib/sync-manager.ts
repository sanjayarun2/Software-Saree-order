import { flushOutbox, syncDashboardOrders, syncOrders } from "./order-service";
import { pollVeloWebsiteOrders } from "./velo-website-sync";
import { mergeOrders } from "./local-store";
import { evictStaleEntries } from "./local-store";
import { supabase } from "./supabase";
import type { Order } from "./db-types";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { PluginListenerHandle } from "@capacitor/core";

let initialized = false;
let userId: string | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let websitePollTimer: ReturnType<typeof setInterval> | null = null;
const WEBSITE_POLL_INTERVAL_MS = 15_000;
let realtimeChannel: RealtimeChannel | null = null;
let appStateListenerHandle: PluginListenerHandle | null = null;
let syncInFlight = false;
let appInForeground = true;

const POLL_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes

function isNetworkError(err: unknown): boolean {
  if (err instanceof TypeError && /failed to fetch|network/i.test(err.message)) return true;
  return false;
}

function canRunWebsitePoll(): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return false;
  if (typeof document !== "undefined" && document.visibilityState === "visible") return true;
  return appInForeground;
}

async function safeWebsitePoll() {
  if (!userId) return;
  if (!canRunWebsitePoll()) return;
  try {
    await pollVeloWebsiteOrders(userId);
  } catch (err) {
    console.warn("[SyncManager] website poll failed:", err);
  }
}

async function safeSync() {
  if (!userId || syncInFlight) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  syncInFlight = true;
  try {
    await flushOutbox(userId);
    await safeWebsitePoll();
    await syncDashboardOrders(userId);
  } catch (err) {
    if (isNetworkError(err) && userId) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        await flushOutbox(userId!);
        await syncDashboardOrders(userId!);
      } catch {
        // silent — will retry on next poll
      }
    }
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
  if (!userId || appStateListenerHandle) return;
  try {
    const { App } = await import("@capacitor/app");
    appStateListenerHandle = await App.addListener("appStateChange", ({ isActive }) => {
      appInForeground = isActive;
      if (isActive && userId) {
        console.log("[SyncManager] Capacitor appStateChange – syncing");
        safeSync();
        void safeWebsitePoll();
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

  websitePollTimer = setInterval(() => {
    if (!userId) return;
    if (!canRunWebsitePoll()) return;
    safeWebsitePoll();
  }, WEBSITE_POLL_INTERVAL_MS);
}

function stopPolling() {
  if (pollTimer != null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (websitePollTimer != null) {
    clearInterval(websitePollTimer);
    websitePollTimer = null;
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
    setTimeout(() => safeSync(), 1500);
    setTimeout(() => safeWebsitePoll(), 2500);
  }
}

export function teardownSyncManager(): void {
  if (typeof window === "undefined") return;
  window.removeEventListener("online", handleOnline);
  window.removeEventListener("visibilitychange", handleVisibilityChange);
  void appStateListenerHandle?.remove().catch(() => {});
  appStateListenerHandle = null;
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
