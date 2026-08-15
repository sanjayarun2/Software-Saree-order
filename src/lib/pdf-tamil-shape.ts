/**
 * jsPDF draws each Unicode code point as a glyph. It does not run OpenType GSUB,
 * so Tamil looks like random / misspelled letters (ெ ே ை stay after the consonant).
 *
 * Standard (Uniscribe / HarfBuzz / Unicode Tamil): move left matras before the
 * consonant cluster, and split two-part vowels ொ ோ ௌ into left + right parts.
 * Apply once before wrap/draw. Browser/WhatsApp already do this; PDF must too.
 */

const TAMIL_RE = /[\u0B80-\u0BFF]/;
const PULLI = "\u0BCD";
const AA = "\u0BBE";
const AU_LENGTH = "\u0BD7";

const TWO_PART: Record<string, { left: string; right: string }> = {
  "\u0BCA": { left: "\u0BC6", right: AA },
  "\u0BCB": { left: "\u0BC7", right: AA },
  "\u0BCC": { left: "\u0BC6", right: AU_LENGTH },
};

function isTamilConsonant(ch: string | undefined): boolean {
  if (!ch) return false;
  const c = ch.charCodeAt(0);
  return c >= 0x0b95 && c <= 0x0bb9;
}

function isLeftMatra(ch: string): boolean {
  return ch === "\u0BC6" || ch === "\u0BC7" || ch === "\u0BC8";
}

function isMatra(ch: string | undefined): boolean {
  if (!ch) return false;
  const c = ch.charCodeAt(0);
  return (c >= 0x0bbe && c <= 0x0bcc) || c === 0x0bd7;
}

function readConsonantCluster(
  s: string,
  i: number
): { cluster: string; end: number } | null {
  if (!isTamilConsonant(s[i])) return null;
  let j = i + 1;
  while (j + 1 < s.length && s[j] === PULLI && isTamilConsonant(s[j + 1])) {
    j += 2;
  }
  if (s[j] === PULLI) j += 1;
  return { cluster: s.slice(i, j), end: j };
}

/** True when a string still has a left matra sitting after its consonant (unshaped). */
export function tamilNeedsPdfShaping(text: string): boolean {
  const s = String(text ?? "");
  for (let i = 0; i < s.length; i++) {
    const cluster = readConsonantCluster(s, i);
    if (!cluster) continue;
    const matra = s[cluster.end];
    if (matra && (isLeftMatra(matra) || TWO_PART[matra])) return true;
    i = cluster.end - 1;
  }
  return false;
}

/**
 * Convert logical Tamil (WhatsApp/Unicode) into visual order for jsPDF.
 * Call once on the original address text — do not run again on already-shaped lines.
 */
export function shapeTamilForPdf(text: string): string {
  const raw = String(text ?? "");
  if (!raw || !TAMIL_RE.test(raw)) return raw;
  const s = raw.normalize("NFC");
  let out = "";
  let i = 0;
  while (i < s.length) {
    const cluster = readConsonantCluster(s, i);
    if (!cluster) {
      out += s[i];
      i += 1;
      continue;
    }
    i = cluster.end;
    const matra = s[i];
    if (matra && isMatra(matra)) {
      i += 1;
      if (isLeftMatra(matra)) {
        out += matra + cluster.cluster;
      } else if (TWO_PART[matra]) {
        const parts = TWO_PART[matra]!;
        out += parts.left + cluster.cluster + parts.right;
      } else {
        out += cluster.cluster + matra;
      }
      continue;
    }
    out += cluster.cluster;
  }
  return out;
}
