/**
 * PDF label + Velo TO address cleanup.
 * Applied on every label render and when building website order TO blocks.
 */

export type PdfAddressRole = "from" | "to";

export type SanitizePdfAddressOptions = {
  /** Used when TO text has no mobile (e.g. order.booked_mobile_no from Velo). */
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

/** Indian mobile: optional +91 / 91 / 0, then 10 digits starting 6–9 (spaces/dashes allowed). */
const MOBILE_RE =
  /(?:\+?91[\s\-.]*)?0?([6-9](?:[\s\-.]*\d){9})/g;

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

export function extractMobiles(text: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  const re = new RegExp(MOBILE_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const digits = normalizeMobileDigits(m[1] ?? m[0]);
    if (digits && !seen.has(digits)) {
      seen.add(digits);
      found.push(digits);
    }
  }
  return found;
}

function stripMobilesFromText(text: string): string {
  return text
    .replace(MOBILE_RE, " ")
    .replace(/\b(?:Mob(?:ile)?|Ph(?:one)?|Tel)\s*(?:No\.?|Number|#)?\s*[:.\-]?\s*/gi, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\(\s*\)/g, "")
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
 * - TO: remove email, Web #, IN → India, phone last line as `Mob No : …`
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
  const mobilesFromText = extractMobiles(raw);
  const fallback = normalizeMobileDigits(options?.fallbackMobile ?? "");
  const mobile = mobilesFromText[0] ?? fallback ?? null;

  const lines = raw
    .split("\n")
    .filter(Boolean)
    .map((line) => stripEmailsFromText(line))
    .map((line) => stripMobilesFromText(line))
    .map((line) => expandCountryInToIndia(line))
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const cleaned = lines.filter(
    (line) => !/^(?:e-?mail|mob(?:ile)?|ph(?:one)?|tel|web\s*#?)\s*[:.\-]*$/i.test(line)
  );

  // Mob No is mandatory on TO when any mobile is available (text or fallback).
  if (mobile) {
    cleaned.push(formatMobNoLine(mobile));
  }

  return tidyLines(cleaned.join("\n"));
}

/**
 * Build a clean TO block for Velo/website imports:
 * name + address lines, no Web # / items, mandatory Mob No last line when mobile exists.
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

/** True when text still has ® / GSTIN / email / Web # / bare country IN / unformatted phone. */
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
    const mobiles = extractMobiles(t);
    if (mobiles.length) {
      const currentLast = tidyLines(t).split("\n").pop() ?? "";
      if (currentLast !== formatMobNoLine(mobiles[0])) return true;
    }
  }
  return false;
}
