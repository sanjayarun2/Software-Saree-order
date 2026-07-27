/** Shared parsing for share / snip address → order fields. */

export function trimAddressText(raw: string | null | undefined): string {
  return String(raw ?? "").replace(/\r\n/g, "\n").trim();
}

export function extractMobileFromAddress(address: string): string {
  const m = address.match(/\b[6-9]\d{9}\b/);
  return m?.[0] ?? "";
}

export function customerNameFromAddress(address: string): string {
  const line = address.split(/\n/)[0]?.trim() || "";
  return line || "Customer";
}

export type AddressQuality =
  | { ok: true }
  | { ok: false; reason: "too_short" | "not_enough_letters" | "garbage" | "not_address_like" };

/**
 * Reject OCR noise / half-crops. Proper address-like text only.
 * Share can skip this; snip OCR must pass.
 */
export function isProperAddressText(raw: string | null | undefined): AddressQuality {
  const text = trimAddressText(raw);
  if (text.length < 15) return { ok: false, reason: "too_short" };

  // Latin + Tamil + Devanagari letters
  const letters = (text.match(/[A-Za-z\u0B80-\u0BFF\u0900-\u097F]/g) || []).length;
  if (letters < 8) return { ok: false, reason: "not_enough_letters" };

  const weird = (text.match(/[|_=•·□■◆◇~`^￼�]/g) || []).length;
  if (weird > Math.max(3, text.length * 0.12)) {
    return { ok: false, reason: "garbage" };
  }

  const hasMobile = /\b[6-9]\d{9}\b/.test(text);
  const hasPin = /\b\d{6}\b/.test(text);
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);

  if (hasMobile || hasPin) return { ok: true };
  if (lines.length >= 2 && letters >= 12) return { ok: true };
  if (text.length >= 40 && letters >= 20) return { ok: true };

  return { ok: false, reason: "not_address_like" };
}
