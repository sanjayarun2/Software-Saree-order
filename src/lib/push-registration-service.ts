import type { PluginListenerHandle } from "@capacitor/core";
import { Capacitor } from "@capacitor/core";
import { getOrCreateDeviceId } from "./device-id";
import {
  removePushDeviceToken,
  upsertPushDeviceToken,
  type PushPlatform,
} from "./push-device-tokens-supabase";
import {
  notifyNewWebsiteOrders,
  type ImportedWebsiteOrderSummary,
} from "./order-alert-service";
import { readOrderAlertsEnabled } from "./order-alert-preferences";

const ORDERS_PATH = "/orders/";
let initialized = false;
let currentUserId: string | null = null;
let currentToken: string | null = null;
let listenerHandles: PluginListenerHandle[] = [];

function pushPlatform(): PushPlatform {
  const p = Capacitor.getPlatform();
  if (p === "ios") return "ios";
  if (p === "web") return "web";
  return "android";
}

function openOrdersPage() {
  if (typeof window === "undefined") return;
  const target = `${window.location.origin}${ORDERS_PATH}`;
  if (window.location.pathname !== ORDERS_PATH) {
    window.location.href = target;
  }
}

function orderFromPushData(data: Record<string, unknown>): ImportedWebsiteOrderSummary | null {
  const externalOrderId = String(data.externalOrderId ?? data.orderId ?? "").trim();
  if (!externalOrderId) return null;
  const customerName = String(data.customerName ?? "Customer").trim() || "Customer";
  const qtyRaw = Number(data.quantity ?? 1);
  const quantity = Number.isFinite(qtyRaw) && qtyRaw >= 1 ? Math.floor(qtyRaw) : 1;
  return { externalOrderId, customerName, quantity };
}

async function persistToken(userId: string, token: string): Promise<void> {
  currentToken = token;
  await upsertPushDeviceToken(userId, token, pushPlatform(), getOrCreateDeviceId());
}

export async function initPushRegistration(userId: string): Promise<void> {
  if (!Capacitor.isNativePlatform() || initialized) {
    currentUserId = userId;
    return;
  }

  initialized = true;
  currentUserId = userId;

  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");

    const perm = await PushNotifications.checkPermissions();
    if (perm.receive === "prompt") {
      await PushNotifications.requestPermissions();
    }

    const regListener = await PushNotifications.addListener(
      "registration",
      async (event) => {
        const token = event.value?.trim();
        if (token && currentUserId) {
          await persistToken(currentUserId, token);
        }
      }
    );

    const regErrorListener = await PushNotifications.addListener(
      "registrationError",
      (err) => {
        console.warn("[Push] registration error:", err);
      }
    );

    const receivedListener = await PushNotifications.addListener(
      "pushNotificationReceived",
      (notification) => {
        if (!readOrderAlertsEnabled()) return;
        const data = (notification.data ?? {}) as Record<string, unknown>;
        const order = orderFromPushData(data);
        if (order) {
          void notifyNewWebsiteOrders([order], { fromPush: true });
        }
      }
    );

    const actionListener = await PushNotifications.addListener(
      "pushNotificationActionPerformed",
      (action) => {
        const data = (action.notification.data ?? {}) as Record<string, unknown>;
        const route = String(data.route ?? ORDERS_PATH);
        if (typeof window !== "undefined") {
          window.location.href = `${window.location.origin}${route.startsWith("/") ? route : `/${route}`}`;
        } else {
          openOrdersPage();
        }
      }
    );

    listenerHandles.push(
      regListener,
      regErrorListener,
      receivedListener,
      actionListener
    );

    await PushNotifications.register();
  } catch (e) {
    console.warn("[Push] init failed (google-services.json may be missing):", e);
    initialized = false;
  }
}

export async function teardownPushRegistration(): Promise<void> {
  if (currentUserId && currentToken) {
    await removePushDeviceToken(currentUserId, currentToken);
  }

  await Promise.all(listenerHandles.map((h) => h.remove().catch(() => {})));
  listenerHandles = [];
  initialized = false;
  currentUserId = null;
  currentToken = null;
}
