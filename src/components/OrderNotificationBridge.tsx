"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { stagePendingNavigation } from "@/lib/pending-navigation";
import {
  subscribeOpenOrdersNavigation,
  type OpenOrdersNavDetail,
} from "@/lib/order-notification-navigation";
import { pollVeloWebsiteOrders, wasWebsitePollRecent } from "@/lib/velo-website-sync";

const ORDERS_PATH = "/orders/";

/**
 * Industry-standard notification deep link: client-side route + sync, no location.reload.
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

      if (detail.sync !== false && user?.id) {
        if (wasWebsitePollRecent()) {
          go();
        } else {
          void pollVeloWebsiteOrders(user.id).finally(go);
        }
      } else {
        go();
      }
    });
  }, [router, user?.id]);

  return null;
}
