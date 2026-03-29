/**
 * Product code: [User 2][Year letters][Month+day][Daily photo #]
 * Example: STA31921 = ST + A + 319 + 21 (user ST, year A = epoch 2026, Mar 19, 21st photo that day).
 *
 * Year letters: same as Excel columns — 1→A … 26→Z, 27→AA, 28→AB, … (after Z comes AA).
 * Ordinal for a calendar year = (year - YEAR_CODE_EPOCH) + 1, so 2026 → 1 → A.
 */

/** First calendar year that encodes as a single "A". */
const YEAR_CODE_EPOCH_YEAR = 2026;

export function parseYyyyMmDdToLocalDate(yyyyMmDd: string): Date {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0);
  return dt;
}

/**
 * 1-based index → A, B, … Z, AA, AB, … (Excel column style).
 */
export function indexToYearLetters(ordinal: number): string {
  let n = Math.max(1, Math.floor(ordinal));
  let s = "";
  while (n > 0) {
    n--;
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26);
  }
  return s;
}

/** Encode calendar year (e.g. 2026 → A, 2051 → Z, 2052 → AA). */
export function encodeYearCodeLetters(year: number): string {
  const ordinal = year - YEAR_CODE_EPOCH_YEAR + 1;
  return indexToYearLetters(ordinal < 1 ? 1 : ordinal);
}

/** Month (1–12) + day (01–31), no separator: Mar 19 → "319", Jan 7 → "107". */
export function encodeMonthDayCompact(d: Date): string {
  const month = d.getMonth() + 1;
  const day = d.getDate();
  return String(month) + String(day).padStart(2, "0");
}

/** Daily sequence: plain number (1, 2, … 21, …). */
export function formatDailyPhotoNumber(n: number): string {
  const k = Math.max(1, Math.floor(n));
  return String(k);
}

/** Normalize stored prefix (A–Z and 0–9 only). Single char pads with X. */
export function normalizeProductCodeUserPrefix(raw: string): string {
  const s = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (s.length >= 2) return s;
  if (s.length === 1) return `${s}X`;
  return "XX";
}

export function buildProductCode(userPrefix: string, anchor: Date, seq: number): string {
  const p = normalizeProductCodeUserPrefix(userPrefix);
  const y = anchor.getFullYear();
  return p + encodeYearCodeLetters(y) + encodeMonthDayCompact(anchor) + formatDailyPhotoNumber(seq);
}

export function buildCodeRange(prefix: string, anchor: Date, startSeq: number, count: number): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    codes.push(buildProductCode(prefix, anchor, startSeq + i));
  }
  return codes;
}
