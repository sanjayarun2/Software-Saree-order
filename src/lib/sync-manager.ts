import { flushOutbox, syncOrders } from "./order-service";
import { evictStaleEntries } from "./local-store";

let initialized = false;
let userId: string | null = null;

function handleOnline() {
  if (!userId) return;
  console.log("[SyncManager] Online – flushing outbox & syncing");
  flushOutbox(userId);
  syncOrders(userId);
}

function handleVisibilityChange() {
  if (!userId) return;
  if (document.visibilityState === "visible") {
    console.log("[SyncManager] App resumed – syncing");
    flushOutbox(userId);
    syncOrders(userId);
  }
}

async function handleAppStateChange() {
  if (!userId) return;
  try {
    const { App } = await import("@capacitor/app");
    App.addListener("appStateChange", ({ isActive }) => {
      if (isActive && userId) {
        console.log("[SyncManager] Capacitor appStateChange – syncing");
        flushOutbox(userId!);
        syncOrders(userId!);
      }
    });
  } catch {
    // Not in a Capacitor environment, rely on visibilitychange instead
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

  if (navigator.onLine) {
    flushOutbox(uid);
    syncOrders(uid);
  }
}

export function teardownSyncManager(): void {
  if (typeof window === "undefined") return;
  window.removeEventListener("online", handleOnline);
  window.removeEventListener("visibilitychange", handleVisibilityChange);
  initialized = false;
  userId = null;
}

export function isOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine;
}
