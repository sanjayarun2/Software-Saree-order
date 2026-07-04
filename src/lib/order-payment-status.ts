import type { OrderPaymentStatus } from "./db-types";

const PAID_VALUES = new Set(["paid", "success", "captured"]);

export function normalizeWebsitePaymentStatus(
  raw: string | null | undefined
): OrderPaymentStatus {
  const v = (raw ?? "").trim().toLowerCase();
  return PAID_VALUES.has(v) ? "paid" : "unpaid";
}

export function isPaidOrderPayment(
  status: OrderPaymentStatus | null | undefined
): boolean {
  return status === "paid";
}

export function shouldShowPaymentBadge(
  orderSource: string | null | undefined,
  paymentStatus: OrderPaymentStatus | null | undefined
): boolean {
  return (
    orderSource === "website" &&
    paymentStatus != null &&
    isPaidOrderPayment(paymentStatus)
  );
}

/** Website orders list only when paid (or legacy rows without payment_status). */
export function isVisibleInOrdersList(order: {
  order_source?: string | null;
  payment_status?: OrderPaymentStatus | null;
}): boolean {
  if (order.order_source !== "website") return true;
  if (order.payment_status == null) return true;
  return isPaidOrderPayment(order.payment_status);
}

export function isPaidWebsiteOrder(order: {
  order_source?: string | null;
  payment_status?: OrderPaymentStatus | null;
}): boolean {
  return (
    order.order_source === "website" &&
    (order.payment_status == null || isPaidOrderPayment(order.payment_status))
  );
}
