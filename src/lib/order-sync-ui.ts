/** Shared UI signal: orders/dashboard showing cached data while sync runs. */

export const ORDERS_SYNC_UI_EVENT = "velo-orders-sync-ui";

export type OrdersSyncUiDetail = {
  syncing: boolean;
  /** When set, Orders page should focus this website order after refresh. */
  focusExternalOrderId?: string | null;
};

let syncing = false;
let focusExternalOrderId: string | null = null;

export function getOrdersSyncUi(): OrdersSyncUiDetail {
  return { syncing, focusExternalOrderId };
}

export function setOrdersSyncUi(detail: OrdersSyncUiDetail): void {
  syncing = detail.syncing;
  if (detail.focusExternalOrderId !== undefined) {
    focusExternalOrderId = detail.focusExternalOrderId?.trim() || null;
  }
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<OrdersSyncUiDetail>(ORDERS_SYNC_UI_EVENT, {
      detail: { syncing, focusExternalOrderId },
    })
  );
}

export function consumeFocusExternalOrderId(): string | null {
  const id = focusExternalOrderId;
  focusExternalOrderId = null;
  return id;
}

export function subscribeOrdersSyncUi(
  handler: (detail: OrdersSyncUiDetail) => void
): () => void {
  const listener = (event: Event) => {
    handler((event as CustomEvent<OrdersSyncUiDetail>).detail ?? getOrdersSyncUi());
  };
  window.addEventListener(ORDERS_SYNC_UI_EVENT, listener);
  return () => window.removeEventListener(ORDERS_SYNC_UI_EVENT, listener);
}
