import type { PluginListenerHandle } from "@capacitor/core";
import { Capacitor } from "@capacitor/core";
import { readOrderAlertsEnabled } from "./order-alert-preferences";

export type ImportedWebsiteOrderSummary = {
  externalOrderId: string;
  customerName: string;
  quantity: number;
  /** ISO timestamp from shop; used to skip stale alerts on sync. */
  createdAt?: string;
};

/** Only alert on orders paid within this window during in-app poll sync. */
const SYNC_ALERT_MAX_AGE_MS = 5 * 60 * 1000;

const DEDUPE_KEY = "velo_order_alert_notified_v1";
const DEDUPE_MAX = 400;
const DEDUPE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CHANNEL_ID = "website-new-orders";
const ORDERS_PATH = "/orders/";

type DedupeEntry = { id: string; at: number };

let audioCtx: AudioContext | null = null;
let initialized = false;
let initPromise: Promise<void> | null = null;
let listenerHandles: PluginListenerHandle[] = [];

function readDedupe(): DedupeEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(DEDUPE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DedupeEntry[];
    if (!Array.isArray(parsed)) return [];
    const cutoff = Date.now() - DEDUPE_TTL_MS;
    return parsed.filter((e) => e?.id && typeof e.at === "number" && e.at >= cutoff);
  } catch {
    return [];
  }
}

function writeDedupe(entries: DedupeEntry[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(DEDUPE_KEY, JSON.stringify(entries.slice(0, DEDUPE_MAX)));
  } catch {
    /* ignore */
  }
}

function wasRecentlyNotified(externalOrderId: string): boolean {
  return readDedupe().some((e) => e.id === externalOrderId);
}

function markNotified(externalOrderId: string) {
  const next = [{ id: externalOrderId, at: Date.now() }, ...readDedupe().filter((e) => e.id !== externalOrderId)];
  writeDedupe(next.slice(0, DEDUPE_MAX));
}

function notificationIdFor(externalOrderId: string): number {
  let h = 0;
  for (let i = 0; i < externalOrderId.length; i++) {
    h = (Math.imul(31, h) + externalOrderId.charCodeAt(i)) | 0;
  }
  const id = Math.abs(h) % 2_000_000_000;
  return id === 0 ? 1 : id;
}

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx) audioCtx = new Ctx();
  return audioCtx;
}

/** Short POS-style two-tone cling (works in browser + Capacitor WebView). */
export async function playOrderClingSound(): Promise<void> {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    if (ctx.state === "suspended") await ctx.resume();
  } catch {
    /* ignore */
  }

  const now = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(0.35, now + 0.01);
  master.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
  master.connect(ctx.destination);

  const playTone = (freq: number, start: number, duration: number) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.9, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  };

  playTone(1046.5, now, 0.14);
  playTone(1318.5, now + 0.11, 0.28);
}

async function ensureNativeChannel(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    await LocalNotifications.createChannel({
      id: CHANNEL_ID,
      name: "New website orders",
      description: "Alerts when a customer places an order on your website",
      importance: 5,
      sound: "order_cling.wav",
      vibration: true,
      visibility: 1,
    });
  } catch (e) {
    console.warn("[OrderAlert] createChannel failed:", e);
  }
}

export async function requestOrderAlertPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return true;
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    const current = await LocalNotifications.checkPermissions();
    if (current.display === "granted") return true;
    const next = await LocalNotifications.requestPermissions();
    return next.display === "granted";
  } catch {
    return false;
  }
}

function openOrdersPage() {
  if (typeof window === "undefined") return;
  const target = `${window.location.origin}${ORDERS_PATH}`;
  if (window.location.pathname !== ORDERS_PATH) {
    window.location.href = target;
  }
}

async function showNativeNotification(order: ImportedWebsiteOrderSummary, title: string, body: string) {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    await LocalNotifications.schedule({
      notifications: [
        {
          id: notificationIdFor(order.externalOrderId),
          title,
          body,
          channelId: CHANNEL_ID,
          sound: "order_cling.wav",
          extra: { route: ORDERS_PATH },
        },
      ],
    });
  } catch (e) {
    console.warn("[OrderAlert] schedule failed:", e);
  }
}

function showWebToast(title: string, body: string) {
  if (typeof window === "undefined" || Capacitor.isNativePlatform()) return;
  window.dispatchEvent(
    new CustomEvent("velo-order-alert-toast", {
      detail: { title, body },
    })
  );
}

function formatOrderBody(order: ImportedWebsiteOrderSummary): string {
  const name = order.customerName.trim() || "Customer";
  const qty = order.quantity > 0 ? order.quantity : 1;
  return qty > 1 ? `${name} · ${qty} items` : name;
}

function formatBatchBody(orders: ImportedWebsiteOrderSummary[]): string {
  if (orders.length === 1) return formatOrderBody(orders[0]);
  const first = orders[0].customerName.trim() || "Customer";
  return `${first} +${orders.length - 1} more`;
}

function isRecentEnoughForSyncAlert(order: ImportedWebsiteOrderSummary): boolean {
  if (!order.createdAt) return false;
  const ts = new Date(order.createdAt).getTime();
  if (Number.isNaN(ts)) return false;
  return Date.now() - ts <= SYNC_ALERT_MAX_AGE_MS;
}

export async function notifyNewWebsiteOrders(
  orders: ImportedWebsiteOrderSummary[],
  options?: { fromPush?: boolean }
): Promise<void> {
  if (!readOrderAlertsEnabled()) return;
  if (!orders.length) return;

  const candidates = options?.fromPush
    ? orders
    : orders.filter(isRecentEnoughForSyncAlert);

  const fresh = candidates.filter(
    (o) => o.externalOrderId && !wasRecentlyNotified(o.externalOrderId)
  );
  if (!fresh.length) return;

  fresh.forEach((o) => markNotified(o.externalOrderId));

  const title =
    fresh.length === 1
      ? "New website order"
      : `${fresh.length} new website orders`;
  const body = formatBatchBody(fresh);

  await playOrderClingSound();

  if (Capacitor.isNativePlatform()) {
    const granted = await requestOrderAlertPermission();
    if (granted) {
      if (fresh.length === 1) {
        await showNativeNotification(fresh[0], title, body);
      } else {
        await showNativeNotification(fresh[0], title, body);
      }
    }
  } else {
    showWebToast(title, body);
  }

  window.dispatchEvent(
    new CustomEvent("velo-website-orders-alert", {
      detail: { count: fresh.length, orders: fresh },
    })
  );
}

export async function testOrderAlert(): Promise<void> {
  if (!readOrderAlertsEnabled()) return;
  await playOrderClingSound();
  if (Capacitor.isNativePlatform()) {
    const granted = await requestOrderAlertPermission();
    if (!granted) return;
    await ensureNativeChannel();
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    await LocalNotifications.schedule({
      notifications: [
        {
          id: 9_001_001,
          title: "Order alert test",
          body: "You will hear this sound when a website order arrives.",
          channelId: CHANNEL_ID,
          sound: "order_cling.wav",
        },
      ],
    });
  } else {
    showWebToast("Order alert test", "You will hear this sound when a website order arrives.");
  }
}

export function initOrderAlertService(): void {
  if (typeof window === "undefined" || initialized) return;
  initialized = true;

  initPromise = (async () => {
    await ensureNativeChannel();
    if (readOrderAlertsEnabled()) {
      await requestOrderAlertPermission();
    }
    if (!Capacitor.isNativePlatform()) return;

    try {
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      const tap = await LocalNotifications.addListener("localNotificationActionPerformed", (event) => {
        const route = (event.notification.extra as { route?: string } | undefined)?.route;
        if (route) window.location.href = `${window.location.origin}${route}`;
        else openOrdersPage();
      });
      listenerHandles.push(tap);
    } catch (e) {
      console.warn("[OrderAlert] listener setup failed:", e);
    }
  })();
}

export async function teardownOrderAlertService(): Promise<void> {
  await Promise.all(listenerHandles.map((h) => h.remove().catch(() => {})));
  listenerHandles = [];
  initialized = false;
  initPromise = null;
  if (audioCtx) {
    try {
      await audioCtx.close();
    } catch {
      /* ignore */
    }
    audioCtx = null;
  }
}

export function whenOrderAlertsReady(): Promise<void> {
  return initPromise ?? Promise.resolve();
}
