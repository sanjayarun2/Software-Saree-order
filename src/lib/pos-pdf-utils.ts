import { jsPDF } from "jspdf";
import type { Order } from "./db-types";
import { savePdfBlob, normalizeAddressBlock, type PdfRenderOptions } from "./pdf-utils";

// ─── Constants mirrored from A4 pdf-utils.ts ───────────────────────────────
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

// A4 section geometry (read-only reference — never touches pdf-utils.ts)
const A4_W = 210;
const A4_MARGIN = 10;
const SECTION_H = 74.25; // 297 / 4
const COL_W = (A4_W - A4_MARGIN * 4) / 3; // ≈56.67mm
const SECTION_CONTENT_W = A4_W - 2 * A4_MARGIN; // 190mm

// POS page dimensions
// Width  = maps to A4 section height (74.25) + some breathing room → 80mm
// Height = maps to A4 section width  (190) + margins → 210mm
const POS_WIDTH = 80;
const POS_HEIGHT = 210;
const POS_BORDER_MARGIN = 5; // margin from paper edge to border rectangle

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

// ─── POS label drawing (rotated 90° for horizontal pasting on parcels) ──────
//
// COORDINATE MAPPING (A4 → POS rotated 90° clockwise):
//
//   A4 layout (normal):            POS layout (on paper):
//   ┌──────────────────────┐       ┌──80mm──┐
//   │ FROM:  LOGO   TO:    │       │        │ ← top
//   │ addr   img    addr   │       │ text   │
//   │ ...    ...    ...    │       │ runs   │
//   └──────────────────────┘       │ down   │
//     190mm wide, 74.25mm tall     │ rotated│
//                                  │ 90°    │
//                                  │        │
//                                  └────────┘ ← bottom (~210mm)
//
//   When you cut the POS strip and turn it sideways (rotate 90° counter-clockwise),
//   it reads exactly like the A4 block: FROM | LOGO | TO left-to-right.
//
// The mapping:
//   A4 X-position (horizontal, 0→190) → POS Y-position (vertical, top→bottom)
//   A4 Y-position (vertical, 0→74.25) → POS X-position (horizontal, right→left)
//
// For jsPDF with angle:90, text at (posX, posY) with angle:90 prints the text
// going downward from that point. So:
//   posY = borderTop + (a4_x - A4_MARGIN)  [maps A4 horizontal to POS vertical]
//   posX = borderRight - (a4_y)            [maps A4 vertical to POS horizontal, flipped]

function drawPosLabel(
  doc: jsPDF,
  order: Order,
  options: PdfRenderOptions
) {
  // Border rectangle on the POS page
  const bL = POS_BORDER_MARGIN;                    // border left
  const bR = POS_WIDTH - POS_BORDER_MARGIN;         // border right
  const bT = POS_BORDER_MARGIN;                     // border top
  const bB = POS_HEIGHT - POS_BORDER_MARGIN;        // border bottom
  const borderW = bR - bL;                          // usable width  ≈ 70mm (maps to A4 74.25mm section height)
  const borderH = bB - bT;                          // usable height ≈ 200mm (maps to A4 190mm section width)

  // Scale factor: map A4 section dimensions into the POS border rectangle
  const scaleX = borderH / SECTION_CONTENT_W;       // A4 horizontal → POS vertical
  const scaleY = borderW / SECTION_H;               // A4 vertical   → POS horizontal

  // Helper: convert A4 section-local coordinates to POS page coordinates
  // a4x = distance from left border in A4 section (0 = left border, 190 = right border)
  // a4y = distance from top border in A4 section (0 = top border, 74.25 = bottom border)
  const mapY = (a4x: number) => bT + a4x * scaleX;  // A4 x → POS y (top-to-bottom)
  const mapX = (a4y: number) => bR - a4y * scaleY;   // A4 y → POS x (right-to-left)

  // ── Draw border (same style as A4: solid L/T/R, dashed bottom) ──
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.setLineDashPattern([], 0);
  doc.line(bL, bT, bL, bB);  // left
  doc.line(bL, bT, bR, bT);  // top
  doc.line(bR, bT, bR, bB);  // right
  doc.setLineDashPattern([2, 2], 0);
  doc.line(bL, bB, bR, bB);  // bottom (cut line)
  doc.setLineDashPattern([], 0);

  // ── Read settings ──
  const shouldNormalize = options.settings?.normalize_addresses === true;
  const rawFrom = order.sender_details ?? "";
  const rawTo = order.recipient_details ?? "";
  const fromSource = shouldNormalize ? normalizeAddressBlock(rawFrom) : rawFrom;
  const toSource = shouldNormalize ? normalizeAddressBlock(rawTo) : rawTo;

  const addressSize = options.settings?.text_size ?? SIZE_ADDRESS;
  const labelSize = options.settings?.text_size ?? SIZE_LABEL;
  const textBold = options.settings?.text_bold !== false;
  const lineHeightMm = (options.settings?.text_size ?? SIZE_ADDRESS) * 0.5;
  const labelToAddressGap = 6;

  // Max text width (same as A4)
  const maxWFrom = COL_W - ADDRESS_PADDING - EDGE_SAFE_GAP;
  const maxWTo = COL_W - ADDRESS_PADDING - EDGE_SAFE_GAP;

  const fromLines = getAddressLines(doc as any, fromSource, maxWFrom).slice(0, MAX_ADDRESS_LINES);
  const toLines = getAddressLines(doc as any, toSource, maxWTo).slice(0, MAX_ADDRESS_LINES);

  // ── A4-space column positions ──
  // In A4: FROM column starts at x=ADDRESS_PADDING from left border
  //        Center column starts at x = COL_W + A4_MARGIN
  //        TO column starts at x = (COL_W + A4_MARGIN) * 2
  const fromColA4X = ADDRESS_PADDING;
  const centerColA4X = COL_W + A4_MARGIN;
  const toColA4X = (COL_W + A4_MARGIN) * 2;

  // ── A4-space vertical positions ──
  const fromYBase = options.settings?.from_y_mm != null
    ? clamp(options.settings.from_y_mm, 0, SECTION_H) : 27;
  const toYBase = options.settings?.to_y_mm != null
    ? clamp(options.settings.to_y_mm, 0, SECTION_H) : 8;

  // Vertical auto-shift (same logic as A4)
  const logoYSetting = options.settings?.logo_y_mm != null
    ? clamp(options.settings.logo_y_mm, 0, SECTION_H) : 40;
  const placement = options.settings?.placement ?? "bottom";
  let thanksCenterA4Y = logoYSetting != null
    ? logoYSetting
    : placement === "top" ? 28 : SECTION_H - 28;

  let fromY = fromYBase;
  let toY = toYBase;

  const fromBlockBottom = fromY + labelToAddressGap + (fromLines.length - 1) * lineHeightMm;
  const toBlockBottom = toY + labelToAddressGap + (toLines.length - 1) * lineHeightMm;
  const logoBottom = thanksCenterA4Y + LOGO_MAX_H_MM / 2;
  const sectionBottomLimit = SECTION_H - VERTICAL_OFFSET;
  const currentMaxBottom = Math.max(fromBlockBottom, toBlockBottom, logoBottom);

  if (currentMaxBottom > sectionBottomLimit) {
    const shiftUp = currentMaxBottom - sectionBottomLimit;
    fromY = fromYBase - shiftUp;
    toY = toYBase - shiftUp;
    thanksCenterA4Y -= shiftUp;
  }

  // ── FROM (left column in A4 → first section going down in POS) ──
  const fromLabelPosX = mapX(fromY);
  const fromLabelPosY = mapY(fromColA4X);

  doc.setFont(FONT_HEADING, textBold ? "bold" : "normal");
  doc.setFontSize(labelSize);
  doc.text("FROM:", fromLabelPosX, fromLabelPosY, { angle: 90 });

  doc.setFont(FONT_BODY, textBold ? "bold" : "normal");
  doc.setFontSize(addressSize);
  fromLines.forEach((line, i) => {
    const posX = mapX(fromY + labelToAddressGap + i * lineHeightMm);
    doc.text(line, posX, fromLabelPosY, { angle: 90 });
  });

  // ── CENTRE (logo or text) ──
  const contentType = options.settings?.content_type ?? "logo";
  const customText = (options.settings?.custom_text ?? "").trim();
  const textSize = options.settings?.text_size ?? 15;

  const logoCenterA4X = centerColA4X + COL_W / 2;
  const logoCenterPosX = mapX(thanksCenterA4Y);
  const logoCenterPosY = mapY(logoCenterA4X);

  if (contentType === "text" && customText) {
    doc.setFont(FONT_BODY, textBold ? "bold" : "normal");
    doc.setFontSize(textSize);
    const maxCenterW = COL_W - 8;
    const lines = doc.splitTextToSize(customText, maxCenterW);
    const lh = textSize * 0.4;
    const startY = logoCenterPosY - (lines.length * lh) / 2;
    lines.forEach((line: string, i: number) => {
      doc.text(line, logoCenterPosX, startY + i * lh, { angle: 90, align: "center" });
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

    // The logo image itself needs to be drawn rotated 90° so it appears upright
    // when the POS strip is turned sideways. jsPDF addImage doesn't support rotation,
    // so we draw it in the rotated coordinate space:
    // In POS space: logo "width" (A4 horizontal) maps to POS Y-axis,
    //               logo "height" (A4 vertical) maps to POS X-axis
    const imgPosX = logoCenterPosX - drawH * scaleY / 2;
    const imgPosY = logoCenterPosY - drawW * scaleX / 2;
    const imgDrawW = drawH * scaleY; // in POS X-direction (A4 height → POS width)
    const imgDrawH = drawW * scaleX; // in POS Y-direction (A4 width → POS height)

    try {
      doc.addImage(options.logoBase64, "PNG", imgPosX, imgPosY, imgDrawW, imgDrawH);
    } catch {
      // Logo render failed; skip silently
    }
  }

  // ── TO (right column in A4 → last section going down in POS) ──
  const toLabelPosX = mapX(toY);
  const toLabelPosY = mapY(toColA4X);

  doc.setFont(FONT_HEADING, textBold ? "bold" : "normal");
  doc.setFontSize(labelSize);
  doc.text("TO:", toLabelPosX, toLabelPosY, { angle: 90 });

  doc.setFont(FONT_BODY, textBold ? "bold" : "normal");
  doc.setFontSize(addressSize);
  toLines.forEach((line, i) => {
    const posX = mapX(toY + labelToAddressGap + i * lineHeightMm);
    doc.text(line, posX, toLabelPosY, { angle: 90 });
  });
}

// ─── Public API ─────────────────────────────────────────────────────────────

export async function downloadOrderPosPdf(order: Order) {
  if (typeof window === "undefined") return;
  try {
    const renderOptions = await fetchPosRenderOptions(order.user_id);
    const doc = new jsPDF({ unit: "mm", format: [POS_WIDTH, POS_HEIGHT] });
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
    const doc = new jsPDF({ unit: "mm", format: [POS_WIDTH, POS_HEIGHT] });

    for (let i = 0; i < orders.length; i++) {
      if (i > 0) doc.addPage([POS_WIDTH, POS_HEIGHT], "p");
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
