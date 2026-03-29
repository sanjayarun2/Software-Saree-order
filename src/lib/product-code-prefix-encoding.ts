/**
 * Global sequential product_code_prefix from a central DB index.
 * Order per first letter: L0–L9, then LA–LZ; then next letter (A0… after ZZ comes A00).
 *
 * Index 0 → A0, … 9 → A9, 10 → AA, … 35 → AZ, 36 → B0, … 935 → ZZ,
 * 936 → A00, … 2635 → Z99, 2636 → A000, … (L + 3 digits), then L + 4 digits, …
 */

const PER_LETTER_PAIR = 36; // 10 digits + 26 letter pairs (AA–AZ style second char)
const TWO_CHAR_TOTAL = 26 * PER_LETTER_PAIR; // 936

const THREE_SUFFIX = 100; // 00–99
const THREE_CHAR_TOTAL = 26 * THREE_SUFFIX; // 2600

/** Map global index (from DB) to prefix string; must stay in sync with any server-side docs. */
export function indexToGlobalProductPrefix(index: number): string {
  let n = Math.max(0, Math.floor(index));

  if (n < TWO_CHAR_TOTAL) {
    const li = Math.floor(n / PER_LETTER_PAIR);
    const r = n % PER_LETTER_PAIR;
    const L = String.fromCharCode(65 + li);
    if (r < 10) return L + String(r);
    return L + String.fromCharCode(65 + (r - 10));
  }

  n -= TWO_CHAR_TOTAL;
  if (n < THREE_CHAR_TOTAL) {
    const li = Math.floor(n / THREE_SUFFIX);
    const num = n % THREE_SUFFIX;
    return String.fromCharCode(65 + li) + String(num).padStart(2, "0");
  }

  n -= THREE_CHAR_TOTAL;
  let digitWidth = 3;
  while (true) {
    const bucket = 26 * 10 ** digitWidth;
    if (n < bucket) {
      const li = Math.floor(n / 10 ** digitWidth);
      const num = n % 10 ** digitWidth;
      return String.fromCharCode(65 + li) + String(num).padStart(digitWidth, "0");
    }
    n -= bucket;
    digitWidth += 1;
    if (digitWidth > 12) {
      throw new Error("Product prefix index out of supported range.");
    }
  }
}
