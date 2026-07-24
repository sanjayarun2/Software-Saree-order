import { setOrdersSyncUi } from "./order-sync-ui";

export const OPEN_ORDERS_NAV_EVENT = "saree-open-orders";

export type OpenOrdersNavDetail = {
  /** Pull website orders before/while showing the list (default true). */
  sync?: boolean;
  /** Bypass poll cooldown (notification / toast tap). Default true when syncing. */
  forceSync?: boolean;
  /** Website external order id to focus after sync. */
  externalOrderId?: string | null;
};

/** In-app navigation to Orders (no full page reload). Handled by OrderNotificationBridge. */
export function requestOpenOrdersPage(detail: OpenOrdersNavDetail = {}): void {
  if (typeof window === "undefined") return;
  const sync = detail.sync !== false;
  const forceSync = detail.forceSync !== false && sync;
  const externalOrderId = detail.externalOrderId?.trim() || null;

  if (sync) {
    setOrdersSyncUi({
      syncing: true,
      focusExternalOrderId: externalOrderId,
    });
  }

  window.dispatchEvent(
    new CustomEvent<OpenOrdersNavDetail>(OPEN_ORDERS_NAV_EVENT, {
      detail: { sync, forceSync, externalOrderId },
    })
  );
}

export function subscribeOpenOrdersNavigation(
  handler: (detail: OpenOrdersNavDetail) => void
): () => void {
  const listener = (event: Event) => {
    handler((event as CustomEvent<OpenOrdersNavDetail>).detail ?? {});
  };
  window.addEventListener(OPEN_ORDERS_NAV_EVENT, listener);
  return () => window.removeEventListener(OPEN_ORDERS_NAV_EVENT, listener);
}
