/** Product code: [User 2][Smart date][Daily photo #] e.g. ST + C319 + 21 → STC31921 (Mar 19 → month letter C + 319 = 3×100+19). */

const MONTH_LETTERS = "ABCDEFGHIJKL";

export function parseYyyyMmDdToLocalDate(yyyyMmDd: string): Date {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0);
  return dt;
}

/**
 * Smart date: month letter (A=Jan … L=Dec) + (month×100 + day). Examples: Jan 5 → A105, Mar 19 → C319, Oct 9 → J1009.
 */
export function encodeSmartDate(d: Date): string {
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const letter = MONTH_LETTERS[month - 1] ?? "A";
  return letter + String(month * 100 + day);
}

/** Daily sequence: plain number, no leading zeros (1st photo today → "1", 21st → "21"). */
export function formatDailyPhotoNumber(n: number): string {
  const k = Math.max(1, Math.floor(n));
  return String(k);
}

export function buildProductCode(userPrefix: string, anchor: Date, seq: number): string {
  const p = userPrefix.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2).padEnd(2, "X");
  return p + encodeSmartDate(anchor) + formatDailyPhotoNumber(seq);
}

export function buildCodeRange(prefix: string, anchor: Date, startSeq: number, count: number): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    codes.push(buildProductCode(prefix, anchor, startSeq + i));
  }
  return codes;
}
