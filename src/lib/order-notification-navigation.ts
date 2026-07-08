export const OPEN_ORDERS_NAV_EVENT = "saree-open-orders";

export type OpenOrdersNavDetail = {
  /** Pull website orders before showing the list (default true). */
  sync?: boolean;
};

/** In-app navigation to Orders (no full page reload). Handled by OrderNotificationBridge. */
export function requestOpenOrdersPage(detail: OpenOrdersNavDetail = {}): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<OpenOrdersNavDetail>(OPEN_ORDERS_NAV_EVENT, {
      detail: { sync: detail.sync !== false },
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
