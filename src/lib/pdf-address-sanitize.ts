/**
 * PDF label + Velo TO address cleanup.
 * Applied on every label render and when building website order TO blocks.
 */

export type PdfAddressRole = "from" | "to";

export type SanitizePdfAddressOptions = {
  /**
   * Used ONLY when TO address text has no detectable mobile.
   * Never overrides a number pasted inside the address.
   */
  fallbackMobile?: string | null;
};

const REGISTERED_MARK_RE =
  /\u00AE|\u24C7|\(R\)|\(r\)|\s*Registered\s*(?:Trademark|Trade\s*Mark)?/gi;

const EMAIL_RE =
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

/** GSTIN line or inline GSTIN token (15-char Indian GSTIN). */
const GSTIN_LINE_RE =
  /^\s*(?:GST\s*(?:IN|No\.?|Number|#)?|GSTIN)\s*[:.\-]?\s*[0-9A-Z]{15}\s*$/i;
const GSTIN_INLINE_RE =
  /(?:GST\s*(?:IN|No\.?|Number|#)?|GSTIN)\s*[:.\-]?\s*[0-9A-Z]{15}/gi;

/** Indian mobile: optional +91 / 91 / 0, then 10 digits starting 6–9 (spaces/dashes on same line only). */
const MOBILE_RE =
  /(?:\+?91[ \t\-.]*)?0?([6-9](?:[ \t\-.]*\d){9})/g;

/** Labeled pincode: "Pincode : 641402" / "PIN-641402" / "Pin code 641402". */
const PINCODE_LABELED_RE =
  /\b(?:pin\s*code|pincode|pin)\s*[:.\-]?\s*([1-9]\d{5})\b/gi;

/** Bare Indian PIN (6 digits, not starting with 0). */
const PINCODE_BARE_RE = /\b([1-9]\d{5})\b/g;

/** Web order markers that must never appear on TO labels. */
const WEB_ORDER_LINE_RE =
  /^(?:web\s*#|web\s*order|website\s*order|order\s*#?\s*web)\b/i;

export function stripRegisteredSymbol(text: string): string {
  return String(text ?? "")
    .replace(REGISTERED_MARK_RE, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

/** Centre brand / custom text for PDF. */
export function sanitizePdfBrandText(text: string): string {
  return stripRegisteredSymbol(text)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n");
}

export function formatMobNoLine(digits10: string): string {
  const d = digits10.replace(/\D/g, "").slice(-10);
  return `Mob No : ${d}`;
}

export function formatPincodeLine(pin6: string): string {
  const d = String(pin6 ?? "").replace(/\D/g, "").slice(0, 6);
  return `Pincode : ${d}`;
}

export function normalizePincodeDigits(raw: string): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length === 6 && /^[1-9]\d{5}$/.test(digits)) return digits;
  return null;
}

export function normalizeMobileDigits(raw: string): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length === 10 && /^[6-9]/.test(digits)) return digits;
  if (digits.length === 12 && digits.startsWith("91") && /^[6-9]/.test(digits.slice(2))) {
    return digits.slice(2);
  }
  if (digits.length === 11 && digits.startsWith("0") && /^[6-9]/.test(digits.slice(1))) {
    return digits.slice(1);
  }
  return null;
}

/** Every mobile match in document order (duplicates kept). */
export function extractMobileOccurrences(text: string): string[] {
  const found: string[] = [];
  const re = new RegExp(MOBILE_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(String(text ?? ""))) !== null) {
    const digits = normalizeMobileDigits(m[1] ?? m[0]);
    if (digits) found.push(digits);
  }
  return found;
}

/** Unique mobiles, first-seen order. */
export function extractMobiles(text: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  for (const digits of extractMobileOccurrences(text)) {
    if (!seen.has(digits)) {
      seen.add(digits);
      found.push(digits);
    }
  }
  return found;
}

/**
 * Mobile for the TO `Mob No :` line.
 * Address text always wins (last occurrence — typically what was pasted).
 * Booked / fallback mobile is used only when the address has no number.
 */
export function resolveToMobileDigits(
  addressText: string,
  fallbackMobile?: string | null
): string | null {
  const fromAddress = extractMobileOccurrences(addressText);
  if (fromAddress.length > 0) {
    return fromAddress[fromAddress.length - 1] ?? null;
  }
  return normalizeMobileDigits(fallbackMobile ?? "");
}

/**
 * Pincode occurrences in document order.
 * Prefer labeled matches; also accept bare 6-digit PINs.
 * Last occurrence wins (same rule as mobile).
 */
export function extractPincodeOccurrences(text: string): string[] {
  const raw = String(text ?? "");
  // Strip mobiles first so a 10-digit phone never contributes false PIN fragments.
  const withoutMobile = raw.replace(new RegExp(MOBILE_RE.source, "g"), " ");
  const found: string[] = [];

  const labeled = new RegExp(PINCODE_LABELED_RE.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = labeled.exec(withoutMobile)) !== null) {
    const pin = normalizePincodeDigits(m[1] ?? "");
    if (pin) found.push(pin);
  }

  const bare = new RegExp(PINCODE_BARE_RE.source, "g");
  while ((m = bare.exec(withoutMobile)) !== null) {
    const pin = normalizePincodeDigits(m[1] ?? "");
    if (pin) found.push(pin);
  }

  return found;
}

/** Last pincode found in address text, or null. */
export function resolveToPincodeDigits(addressText: string): string | null {
  const all = extractPincodeOccurrences(addressText);
  return all.length ? all[all.length - 1]! : null;
}

function stripMobilesFromText(text: string): string {
  return text
    .replace(MOBILE_RE, " ")
    .replace(/\b(?:Mob(?:ile)?|Ph(?:one)?|Tel)\s*(?:No\.?|Number|#)?\s*[:.\-]?\s*/gi, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\(\s*\)/g, "")
    .trim();
}

/** Remove labeled/bare pincode tokens so we re-append a single `Pincode :` line. */
function stripPincodesFromText(text: string): string {
  return text
    .replace(PINCODE_LABELED_RE, " ")
    .replace(PINCODE_BARE_RE, " ")
    .replace(/\b(?:pin\s*code|pincode|pin)\s*[:.\-]*\s*$/gi, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/,\s*,/g, ",")
    .replace(/^[,\-\s]+|[,\-\s]+$/g, "")
    .trim();
}

function stripEmailsFromText(text: string): string {
  return text
    .replace(EMAIL_RE, " ")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function stripGstinFromText(text: string): string {
  return text
    .replace(GSTIN_INLINE_RE, " ")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** Expand country code IN → India (line-level; avoids INDIA / PIN / INN). */
export function expandCountryInToIndia(text: string): string {
  return text
    .replace(/,\s*IN\s*$/g, ", India")
    .replace(/,\s*IN\s+(?=\d{6}\b)/g, ", India ")
    .replace(/(^|[\s])IN\s+(?=\d{6}\b)/g, "$1India ")
    .replace(/(^|[\s])IN$/g, "$1India")
    .replace(/^IN$/g, "India");
}

function tidyLines(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trim().replace(/[ \t]{2,}/g, " "))
    .filter((l) => l.length > 0)
    .join("\n");
}

/** Drop Web # / website-order mention lines (and inline Web # tokens). */
export function stripWebOrderMentions(text: string): string {
  return tidyLines(
    String(text ?? "")
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map((line) =>
        line
          .replace(/\bWeb\s*#\s*\S+/gi, " ")
          .replace(/\b(?:web|website)\s+order\b/gi, " ")
          .replace(/[ \t]{2,}/g, " ")
          .trim()
      )
      .filter((line) => line.length > 0 && !WEB_ORDER_LINE_RE.test(line))
      .join("\n")
  );
}

/**
 * Sanitize FROM/TO address blocks for PDF labels / stored TO text.
 * - Both: strip ® / (R)
 * - FROM: remove GSTIN
 * - TO: remove email, Web #, IN → India;
 *   `Pincode : …` on its own line (before Mob No) when a PIN is present — no duplicate label;
 *   `Mob No : …` as the final line when a mobile is present.
 */
export function sanitizePdfAddress(
  text: string,
  role: PdfAddressRole,
  options?: SanitizePdfAddressOptions
): string {
  let raw = tidyLines(stripRegisteredSymbol(text));
  if (!raw && role === "from") return "";

  if (role === "from") {
    const lines = raw
      .split("\n")
      .map((line) => stripGstinFromText(line))
      .filter((line) => line.length > 0 && !GSTIN_LINE_RE.test(line));
    return tidyLines(lines.join("\n"));
  }

  // TO
  raw = stripWebOrderMentions(raw);
  const mobile = resolveToMobileDigits(raw, options?.fallbackMobile);
  const pincode = resolveToPincodeDigits(raw);

  const lines = raw
    .split("\n")
    .filter(Boolean)
    .map((line) => stripEmailsFromText(line))
    .map((line) => stripMobilesFromText(line))
    .map((line) => stripPincodesFromText(line))
    .map((line) => expandCountryInToIndia(line))
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const cleaned = lines.filter(
    (line) =>
      !/^(?:e-?mail|mob(?:ile)?|ph(?:one)?|tel|web\s*#?|pin(?:\s*code)?|pincode)\s*[:.\-]*$/i.test(
        line
      )
  );

  // Pincode line comes immediately before Mob No (never duplicate the phrase).
  if (pincode) {
    cleaned.push(formatPincodeLine(pincode));
  }
  if (mobile) {
    cleaned.push(formatMobNoLine(mobile));
  }

  return tidyLines(cleaned.join("\n"));
}

/**
 * Build a clean TO block for Velo/website imports:
 * name + address lines, no Web # / items; Pincode then Mob No as trailing lines when present.
 */
export function buildWebsiteToAddress(opts: {
  customerName?: string | null;
  addressText?: string | null;
  mobile?: string | null;
  maxLen?: number;
}): string {
  const parts: string[] = [];
  const name = opts.customerName?.trim();
  if (name) parts.push(name);
  const addr = opts.addressText?.trim();
  if (addr) {
    // Address may arrive as one comma-joined line — keep as provided lines.
    parts.push(...addr.split(/\n+/).map((l) => l.trim()).filter(Boolean));
  }
  const cleaned = sanitizePdfAddress(parts.join("\n"), "to", {
    fallbackMobile: opts.mobile,
  });
  const max = opts.maxLen ?? 600;
  return cleaned.slice(0, max);
}

/** True when text still has ® / GSTIN / email / Web # / bare country IN / unformatted phone/pin. */
export function pdfAddressNeedsCleanup(text: string, role: PdfAddressRole): boolean {
  const t = String(text ?? "");
  if (REGISTERED_MARK_RE.test(t)) return true;
  REGISTERED_MARK_RE.lastIndex = 0;
  if (role === "from") {
    GSTIN_INLINE_RE.lastIndex = 0;
    if (GSTIN_LINE_RE.test(t) || GSTIN_INLINE_RE.test(t)) return true;
    GSTIN_INLINE_RE.lastIndex = 0;
  }
  if (role === "to") {
    EMAIL_RE.lastIndex = 0;
    if (EMAIL_RE.test(t)) return true;
    EMAIL_RE.lastIndex = 0;
    if (/Web\s*#/i.test(t) || /\bwebsite\s+order\b/i.test(t)) return true;
    if (/,\s*IN\b|(?:^|[\s])IN(?:\s+\d{6}\b|$)/m.test(t)) return true;

    const expected = sanitizePdfAddress(t, "to");
    if (tidyLines(t) !== expected) return true;
  }
  return false;
}
