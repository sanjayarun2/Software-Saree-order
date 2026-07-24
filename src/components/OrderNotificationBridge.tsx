"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { stagePendingNavigation } from "@/lib/pending-navigation";
import {
  subscribeOpenOrdersNavigation,
  type OpenOrdersNavDetail,
} from "@/lib/order-notification-navigation";
import { setOrdersSyncUi } from "@/lib/order-sync-ui";
import { syncOrders } from "@/lib/order-service";
import { pollVeloWebsiteOrders } from "@/lib/velo-website-sync";

const ORDERS_PATH = "/orders/";

/**
 * Notification / alert deep link: open Orders immediately (cached list),
 * force website+DB sync in parallel, show updating UI until done.
 */
export function OrderNotificationBridge() {
  const router = useRouter();
  const { user } = useAuth();

  useEffect(() => {
    return subscribeOpenOrdersNavigation((detail: OpenOrdersNavDetail) => {
      stagePendingNavigation(ORDERS_PATH);

      const go = () => {
        if (typeof window !== "undefined" && window.location.pathname !== ORDERS_PATH) {
          router.push(ORDERS_PATH);
        }
      };

      // Navigate first — industry standard: never block on network.
      go();

      const shouldSync = detail.sync !== false && Boolean(user?.id);
      if (!shouldSync) {
        setOrdersSyncUi({ syncing: false });
        return;
      }

      const externalOrderId = detail.externalOrderId?.trim() || null;
      setOrdersSyncUi({ syncing: true, focusExternalOrderId: externalOrderId });

      void (async () => {
        try {
          // Always poll on notification path (ignore cooldown).
          await pollVeloWebsiteOrders(user!.id);
          await syncOrders(user!.id);
        } catch (e) {
          console.warn("[OrderNotificationBridge] sync failed:", e);
        } finally {
          setOrdersSyncUi({ syncing: false, focusExternalOrderId: externalOrderId });
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("velo-website-orders-imported"));
          }
        }
      })();
    });
  }, [router, user?.id]);

  return null;
}
