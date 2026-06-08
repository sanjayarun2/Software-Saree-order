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
  return orderSource === "website" && paymentStatus != null;
}
