import { jsPDF } from "jspdf";
import type { Order } from "./db-types";
import { savePdfBlob, normalizeAddressBlock, type PdfRenderOptions } from "./pdf-utils";

// ─── Constants mirrored exactly from A4 pdf-utils.ts ────────────────────────
const FONT_HEADING = "helvetica";
const FONT_BODY = "helvetica";
const SIZE_LABEL = 14;
const SIZE_ADDRESS = 12;
const MAX_ADDRESS_LINES = 7;
const ADDRESS_PADDING = 4;
const EDGE_SAFE_GAP = 4;
const LOGO_MAX_W_MM = 25;
const LOGO_MAX_H_MM = 25;
const VERTICAL_OFFSET = 4;

// A4 section geometry (read-only reference)
const A4_W = 210;
const A4_MARGIN = 10;
const SECTION_H = 74.25; // 297 / 4
const COL_W = (A4_W - A4_MARGIN * 4) / 3; // ≈56.67mm

// POS page: rotated A4 section at 1:1 scale (no distortion).
// Width  = A4 section height (74.25mm) → fits within 80mm POS paper
// Height = A4 section content width (190mm) + top/bottom margins
const POS_PAGE_W = SECTION_H; // 74.25mm — the "vertical" dimension of an A4 block
const POS_PAGE_H = A4_W - 2 * A4_MARGIN + 2 * A4_MARGIN; // 210mm — room for 190mm content + margins

// ─── Helpers ────────────────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function buildTimestampedFilename(prefix: string): string {
  const now = new Date();
  const YYYY = now.getFullYear();
  const MM = String(now.getMonth() + 1).padStart(2, "0");
  const DD = String(now.getDate()).padStart(2, "0");
  const HH = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const SS = String(now.getSeconds()).padStart(2, "0");
  return `${prefix}_${YYYY}${MM}${DD}_${HH}${mm}${SS}.pdf`;
}

function getAddressLines(
  doc: { splitTextToSize: (s: string, w: number) => string[] },
  text: string,
  maxW: number
): string[] {
  const raw = text || "-";
  const paragraphs = raw.split(/\r?\n/);
  const lines: string[] = [];
  for (const p of paragraphs) {
    const wrapped = doc.splitTextToSize(p.trim() || " ", maxW);
    lines.push(...wrapped);
  }
  return lines;
}

async function fetchPosRenderOptions(userId: string): Promise<PdfRenderOptions> {
  try {
    const { getPdfSettings, getPdfLogoBase64 } = await import("./pdf-settings-supabase");
    const settings = await getPdfSettings(userId);
    let logoBase64: string | null = null;
    if (settings?.content_type === "logo") {
      if (settings.logo_path) {
        logoBase64 = await getPdfLogoBase64(userId, settings.logo_path);
      }
      if (!logoBase64) logoBase64 = await loadDefaultLogo();
    }
    const logoAspectRatio = logoBase64 ? await getImageAspectRatio(logoBase64) : null;
    return { settings, logoBase64, logoAspectRatio };
  } catch {
    const logoBase64 = await loadDefaultLogo();
    const logoAspectRatio = logoBase64 ? await getImageAspectRatio(logoBase64) : null;
    return { settings: null, logoBase64, logoAspectRatio };
  }
}

const DEFAULT_LOGO_PATHS = ["/logo2.png", "/logo.png"];

async function loadDefaultLogo(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const origin = window.location.origin ?? "";
  for (const p of DEFAULT_LOGO_PATHS) {
    for (const url of [p, origin ? origin + p : ""]) {
      if (!url) continue;
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const blob = await res.blob();
        const result = await new Promise<string | null>((resolve) => {
          const r = new FileReader();
          r.onloadend = () => resolve(typeof r.result === "string" ? r.result : null);
          r.onerror = () => resolve(null);
          r.readAsDataURL(blob);
        });
        if (result) return result;
      } catch { /* skip */ }
    }
  }
  return null;
}

async function getImageAspectRatio(base64: string): Promise<number | null> {
  if (typeof window === "undefined") return null;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth / (img.naturalHeight || 1));
    img.onerror = () => resolve(null);
    img.src = base64;
  });
}

// ─── POS label drawing ──────────────────────────────────────────────────────
//
// Strategy: use a 1:1 coordinate mapping (no scaling) so fonts/spacing are
// identical to A4. The POS page is sized to exactly fit one rotated A4 section.
//
// In A4, each section is drawn with:
//   • X-axis = horizontal (left→right): FROM col | Center col | TO col
//   • Y-axis = vertical (top→bottom):   label → address lines
//
// On POS paper (rotated 90° clockwise for horizontal pasting):
//   • POS Y-axis (top→bottom) = A4 X-axis (FROM→Center→TO)
//   • POS X-axis (left→right) = A4 Y-axis INVERTED (A4 bottom→top)
//
// So to rotate: posX = pageW - a4Y,  posY = a4X
// With jsPDF angle:90, text at (posX, posY) flows downward = reads left-to-right
// when the strip is turned sideways.

function drawPosLabel(
  doc: jsPDF,
  order: Order,
  options: PdfRenderOptions
) {
  // ── Settings (identical to A4 drawOrderLabel) ──
  const shouldNormalize = options.settings?.normalize_addresses === true;
  const rawFrom = order.sender_details ?? "";
  const rawTo = order.recipient_details ?? "";
  const fromSource = shouldNormalize ? normalizeAddressBlock(rawFrom) : rawFrom;
  const toSource = shouldNormalize ? normalizeAddressBlock(rawTo) : rawTo;

  const labelSize = options.settings?.text_size ?? SIZE_LABEL;
  const addressSize = options.settings?.text_size ?? SIZE_ADDRESS;
  const textBold = options.settings?.text_bold !== false;
  const lineHeightMm = (options.settings?.text_size ?? SIZE_ADDRESS) * 0.5;
  const labelToAddressGap = 6;

  const maxWFrom = COL_W - ADDRESS_PADDING - EDGE_SAFE_GAP;
  const maxWTo = COL_W - ADDRESS_PADDING - EDGE_SAFE_GAP;

  const fromLines = getAddressLines(doc as any, fromSource, maxWFrom).slice(0, MAX_ADDRESS_LINES);
  const toLines = getAddressLines(doc as any, toSource, maxWTo).slice(0, MAX_ADDRESS_LINES);

  // ── A4-space positions (exactly as in drawOrderLabel) ──
  // Horizontal column positions (A4 X-axis):
  const a4LeftX = A4_MARGIN + ADDRESS_PADDING;                    // FROM text start = 14mm
  const a4CenterColStart = A4_MARGIN + COL_W + A4_MARGIN;         // center column left edge
  const a4CenterX = a4CenterColStart + COL_W / 2;                 // logo center ≈105mm
  const a4RightX = A4_MARGIN + (COL_W + A4_MARGIN) * 2 + ADDRESS_PADDING; // TO text start

  // Vertical positions (A4 Y-axis, relative to section top = 0):
  const fromYBase = options.settings?.from_y_mm != null
    ? clamp(options.settings.from_y_mm, 0, SECTION_H) : 27;
  const toYBase = options.settings?.to_y_mm != null
    ? clamp(options.settings.to_y_mm, 0, SECTION_H) : 8;

  const logoYSetting = options.settings?.logo_y_mm != null
    ? clamp(options.settings.logo_y_mm, 0, SECTION_H) : null;
  const placement = options.settings?.placement ?? "bottom";
  let thanksCenterA4Y = logoYSetting != null
    ? logoYSetting
    : placement === "top" ? 28 : SECTION_H - 28;

  // Vertical auto-shift (same as A4)
  let fromY = fromYBase;
  let toY = toYBase;

  const fromBlockBottom = fromY + labelToAddressGap + (fromLines.length > 0 ? (fromLines.length - 1) * lineHeightMm : 0);
  const toBlockBottom = toY + labelToAddressGap + (toLines.length > 0 ? (toLines.length - 1) * lineHeightMm : 0);
  const logoBottom = thanksCenterA4Y + LOGO_MAX_H_MM / 2;
  const sectionBottomLimit = SECTION_H - VERTICAL_OFFSET;
  const currentMaxBottom = Math.max(fromBlockBottom, toBlockBottom, logoBottom);

  if (currentMaxBottom > sectionBottomLimit) {
    const shiftUp = currentMaxBottom - sectionBottomLimit;
    fromY = fromYBase - shiftUp;
    toY = toYBase - shiftUp;
    thanksCenterA4Y -= shiftUp;
  }

  // ── Coordinate transform: A4 → POS (1:1, no scaling) ──
  // posX = POS_PAGE_W - a4Y   (A4 vertical flipped to POS horizontal)
  // posY = a4X                 (A4 horizontal to POS vertical)
  // The A4 section left border is at A4_MARGIN (10mm). We map that to posY = A4_MARGIN.
  const px = (a4Y: number) => POS_PAGE_W - a4Y;
  const py = (a4X: number) => a4X;

  // ── Draw border ──
  const borderL = 0;
  const borderR = POS_PAGE_W;
  const borderT = A4_MARGIN;
  const borderB = POS_PAGE_H - A4_MARGIN;

  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.setLineDashPattern([], 0);
  doc.line(borderL, borderT, borderL, borderB);
  doc.line(borderL, borderT, borderR, borderT);
  doc.line(borderR, borderT, borderR, borderB);
  doc.setLineDashPattern([2, 2], 0);
  doc.line(borderL, borderB, borderR, borderB);
  doc.setLineDashPattern([], 0);

  // ── FROM ──
  doc.setFont(FONT_HEADING, textBold ? "bold" : "normal");
  doc.setFontSize(labelSize);
  doc.text("FROM:", px(fromY), py(a4LeftX), { angle: 90 });

  doc.setFont(FONT_BODY, textBold ? "bold" : "normal");
  doc.setFontSize(addressSize);
  fromLines.forEach((line, i) => {
    doc.text(line, px(fromY + labelToAddressGap + i * lineHeightMm), py(a4LeftX), { angle: 90 });
  });

  // ── CENTRE (logo or text) ──
  const contentType = options.settings?.content_type ?? "logo";
  const customText = (options.settings?.custom_text ?? "").trim();
  const textSize = options.settings?.text_size ?? 15;

  if (contentType === "text" && customText) {
    doc.setFont(FONT_BODY, textBold ? "bold" : "normal");
    doc.setFontSize(textSize);
    const maxCenterW = COL_W - 8;
    const lines = doc.splitTextToSize(customText, maxCenterW);
    const lh = textSize * 0.4;
    const totalH = lines.length * lh;
    lines.forEach((line: string, i: number) => {
      const lineA4Y = thanksCenterA4Y - totalH / 2 + i * lh;
      doc.text(line, px(lineA4Y), py(a4CenterX), { angle: 90, align: "center" });
    });
  } else if (options.logoBase64) {
    const zoom = Math.max(0.5, Math.min(options.settings?.logo_zoom ?? 1, 2));
    const ar = options.logoAspectRatio ?? 1;
    let fitW = LOGO_MAX_W_MM;
    let fitH = fitW / ar;
    if (fitH > LOGO_MAX_H_MM) {
      fitH = LOGO_MAX_H_MM;
      fitW = fitH * ar;
    }
    const drawW = fitW * zoom;
    const drawH = fitH * zoom;

    // In A4 space the logo is centered at (a4CenterX, thanksCenterA4Y).
    // In POS space (rotated 90° CW):
    //   The logo image needs to appear correctly when the strip is turned sideways.
    //   addImage doesn't rotate, so we place it in POS coordinates where:
    //   - POS X maps to A4 Y (inverted): logo center at px(thanksCenterA4Y)
    //   - POS Y maps to A4 X: logo center at py(a4CenterX)
    //   The A4 "width" of the logo (horizontal) becomes POS "height" (vertical)
    //   The A4 "height" of the logo (vertical) becomes POS "width" (horizontal)
    const imgPosX = px(thanksCenterA4Y) - drawH / 2;
    const imgPosY = py(a4CenterX) - drawW / 2;

    try {
      doc.addImage(options.logoBase64, "PNG", imgPosX, imgPosY, drawH, drawW);
    } catch {
      // Logo render failed; skip
    }
  }

  // ── TO ──
  doc.setFont(FONT_HEADING, textBold ? "bold" : "normal");
  doc.setFontSize(labelSize);
  doc.text("TO:", px(toY), py(a4RightX), { angle: 90 });

  doc.setFont(FONT_BODY, textBold ? "bold" : "normal");
  doc.setFontSize(addressSize);
  toLines.forEach((line, i) => {
    doc.text(line, px(toY + labelToAddressGap + i * lineHeightMm), py(a4RightX), { angle: 90 });
  });
}

// ─── Public API ─────────────────────────────────────────────────────────────

export async function downloadOrderPosPdf(order: Order) {
  if (typeof window === "undefined") return;
  try {
    const renderOptions = await fetchPosRenderOptions(order.user_id);
    const doc = new jsPDF({ unit: "mm", format: [POS_PAGE_W, POS_PAGE_H] });
    drawPosLabel(doc, order, renderOptions);
    const filename = buildTimestampedFilename("SareeOrder_POS");
    const blob = doc.output("blob");
    await savePdfBlob(blob, filename);
  } catch (e) {
    console.error("[POS-PDF] downloadOrderPosPdf failed:", e);
    throw e;
  }
}

export async function downloadOrdersPosPdf(orders: Order[]) {
  if (typeof window === "undefined") return;
  if (orders.length === 0) return;
  try {
    const userId = orders[0].user_id;
    const renderOptions = await fetchPosRenderOptions(userId);
    const doc = new jsPDF({ unit: "mm", format: [POS_PAGE_W, POS_PAGE_H] });

    for (let i = 0; i < orders.length; i++) {
      if (i > 0) doc.addPage([POS_PAGE_W, POS_PAGE_H], "p");
      drawPosLabel(doc, orders[i], renderOptions);
    }

    const filename = buildTimestampedFilename("SareeOrders_POS");
    const blob = doc.output("blob");
    await savePdfBlob(blob, filename);
  } catch (e) {
    console.error("[POS-PDF] downloadOrdersPosPdf failed:", e);
    throw e;
  }
}
