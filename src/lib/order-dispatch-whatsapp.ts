/**
 * Dispatch-tab WhatsApp share.
 *
 * Plan (validated vs WhatsApp client limits):
 * - Prefer phone numbers from the TO address, in the order they appear.
 * - Use the first valid Indian mobile for wa.me/91… chat.
 * - If the first is not a valid number, try the second (and so on).
 * - If none are valid, open wa.me/?text= so the user picks a contact.
 *
 * We cannot ask WhatsApp “is this number registered?” from the app — only
 * format validation + ordered fallback is reliable on device.
 */

import { extractMobiles, normalizeMobileDigits } from "./pdf-address-sanitize";
import { mobileToWhatsAppDigits } from "./unpaid-offer";

export type OrderWhatsAppNumberSource = {
  recipient_details?: string | null;
  booked_mobile_no?: string | null;
};

/**
 * Address mobiles first (document order, unique).
 * Booked mobile is used only when the address has no valid number.
 */
export function collectOrderWhatsAppMobiles(
  order: OrderWhatsAppNumberSource
): string[] {
  const fromAddress = extractMobiles(order.recipient_details ?? "");
  if (fromAddress.length > 0) return fromAddress;

  const booked = normalizeMobileDigits(order.booked_mobile_no ?? "");
  return booked ? [booked] : [];
}

/** First wa.me path digits (91XXXXXXXXXX), or null → contact picker. */
export function pickWhatsAppChatDigits(mobiles10: string[]): string | null {
  for (const m of mobiles10) {
    const normalized = normalizeMobileDigits(m);
    if (!normalized) continue;
    const wa = mobileToWhatsAppDigits(normalized);
    if (wa) return wa;
  }
  return null;
}

export function buildOrderDispatchWhatsAppUrl(
  message: string,
  chatDigits: string | null
): string {
  const text = encodeURIComponent(message);
  if (chatDigits) return `https://wa.me/${chatDigits}?text=${text}`;
  return `https://wa.me/?text=${text}`;
}

export function resolveOrderDispatchWhatsAppUrl(
  order: OrderWhatsAppNumberSource,
  message: string
): { url: string; chatDigits: string | null; candidates: string[] } {
  const candidates = collectOrderWhatsAppMobiles(order);
  const chatDigits = pickWhatsAppChatDigits(candidates);
  return {
    url: buildOrderDispatchWhatsAppUrl(message, chatDigits),
    chatDigits,
    candidates,
  };
}
