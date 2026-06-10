/** Line in staff “share cart” before sending customer WhatsApp link. */
export type ShareCartLine = {
  productId: string;
  name: string;
  productCode: string | null;
  quantity: number;
};

export const SHARE_CART_MAX_LINES = 25;
export const SHARE_CART_MAX_QTY_PER_LINE = 99;
export const SHARE_CART_MIN_QTY = 1;

export function clampShareCartQty(qty: number): number {
  const n = Math.floor(Number(qty));
  if (!Number.isFinite(n) || n < SHARE_CART_MIN_QTY) return SHARE_CART_MIN_QTY;
  return Math.min(n, SHARE_CART_MAX_QTY_PER_LINE);
}
