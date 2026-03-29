/** Month A=Jan … L=Dec + DD + last digit of year (encoding option 1). */

const MONTH_LETTERS = "ABCDEFGHIJKL";

export function parseYyyyMmDdToLocalDate(yyyyMmDd: string): Date {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0);
  return dt;
}

export function encodeDateSegment(d: Date): string {
  const monthIndex = d.getMonth();
  const day = d.getDate();
  const yLast = d.getFullYear() % 10;
  return MONTH_LETTERS[monthIndex] + String(day).padStart(2, "0") + String(yLast);
}

/** Sequence part: 2 digits up to 99, then 3, then 4+. */
export function formatSequence(n: number): string {
  if (n < 1) return "01";
  if (n <= 99) return String(n).padStart(2, "0");
  if (n <= 999) return String(n).padStart(3, "0");
  return String(n).padStart(4, "0");
}

export function buildProductCode(userPrefix: string, anchor: Date, seq: number): string {
  const p = userPrefix.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2).padEnd(2, "X");
  return p + encodeDateSegment(anchor) + formatSequence(seq);
}

export function buildCodeRange(prefix: string, anchor: Date, startSeq: number, count: number): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    codes.push(buildProductCode(prefix, anchor, startSeq + i));
  }
  return codes;
}
