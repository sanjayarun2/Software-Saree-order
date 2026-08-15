/**
 * Tamil-capable fonts for jsPDF shipping labels.
 * Helvetica has no Tamil glyphs — use Noto Sans Tamil when text contains Tamil.
 */

import {
  NOTO_SANS_TAMIL_BOLD_BASE64,
  NOTO_SANS_TAMIL_REGULAR_BASE64,
} from "./pdf-tamil-font-data";

export const PDF_FONT_HELVETICA = "helvetica";
export const PDF_FONT_NOTO_TAMIL = "NotoSansTamil";

const TAMIL_RE = /[\u0B80-\u0BFF]/;

const VFS_REGULAR = "NotoSansTamil-Regular.ttf";
const VFS_BOLD = "NotoSansTamil-Bold.ttf";

type JsPdfFontDoc = {
  addFileToVFS?: (filename: string, filebase64: string) => void;
  addFont?: (
    postScriptName: string,
    fontName: string,
    fontStyle: string,
    encoding?: string
  ) => void;
  setFont?: (fontName: string, fontStyle: string) => void;
  getFontList?: () => Record<string, string[]>;
};

const registeredDocs = new WeakSet<object>();

/** True when text includes Tamil script characters. */
export function textHasTamil(text: string | null | undefined): boolean {
  return TAMIL_RE.test(String(text ?? ""));
}

/**
 * Register Noto Sans Tamil on this jsPDF instance (once per doc).
 * Safe to call repeatedly.
 */
export function ensurePdfFonts(doc: JsPdfFontDoc): void {
  if (!doc || registeredDocs.has(doc as object)) return;
  if (typeof doc.addFileToVFS !== "function" || typeof doc.addFont !== "function") {
    return;
  }

  try {
    const list = typeof doc.getFontList === "function" ? doc.getFontList() : null;
    const already = list && Object.keys(list).some((k) => /notosanstamil/i.test(k));
    if (!already) {
      doc.addFileToVFS(VFS_REGULAR, NOTO_SANS_TAMIL_REGULAR_BASE64);
      doc.addFont(VFS_REGULAR, PDF_FONT_NOTO_TAMIL, "normal", "Identity-H");
      doc.addFileToVFS(VFS_BOLD, NOTO_SANS_TAMIL_BOLD_BASE64);
      doc.addFont(VFS_BOLD, PDF_FONT_NOTO_TAMIL, "bold", "Identity-H");
    }
    registeredDocs.add(doc as object);
  } catch (e) {
    console.warn("[PDF] Failed to register Noto Sans Tamil:", e);
  }
}

/** Body font for a text block: Tamil → NotoSansTamil, else Helvetica. */
export function resolvePdfBodyFont(text: string | null | undefined): string {
  return textHasTamil(text) ? PDF_FONT_NOTO_TAMIL : PDF_FONT_HELVETICA;
}

/**
 * Set the address/body font for measuring or drawing.
 * Uses Tamil font when `text` contains Tamil script.
 */
export function setPdfAddressFont(
  doc: JsPdfFontDoc,
  text: string | null | undefined,
  preferBold = false
): void {
  ensurePdfFonts(doc);
  const font = resolvePdfBodyFont(text);
  const style = preferBold ? "bold" : "normal";
  if (typeof doc.setFont === "function") {
    try {
      doc.setFont(font, style);
    } catch {
      // Bold may be missing in edge cases — fall back to normal.
      try {
        doc.setFont(font, "normal");
      } catch {
        doc.setFont(PDF_FONT_HELVETICA, preferBold ? "bold" : "normal");
      }
    }
  }
}
