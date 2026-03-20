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

// POS roll: 80mm wide. Usable print area ~72mm (4mm margin each side).
const POS_WIDTH = 80;
const POS_MARGIN = 4;

// A4 section dimensions used for the rotated layout
const A4_SECTION_W = 190; // ~210 - 2*10 margin
const A4_SECTION_H = 74.25; // 297 / 4
const A4_MARGIN = 10;
const A4_COL_W = (210 - A4_MARGIN * 4) / 3;

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

// ─── POS label drawing (rotated 90° for horizontal pasting) ─────────────────
//
// The POS page is 80mm wide x ~A4_SECTION_W tall.
// Text is drawn rotated 90° clockwise so when the printed strip is turned
// sideways, the layout mirrors the A4 label: FROM | logo | TO left-to-right.
//
// jsPDF coordinate system: origin top-left, x→right, y→down.
// With angle: 90 the text baseline rotates clockwise, so we position text
// using the "column" dimension along the Y-axis and "row" along the X-axis.

function drawPosLabel(
  doc: jsPDF,
  order: Order,
  pageTop: number,
  options: PdfRenderOptions
) {
  const sectionH = A4_SECTION_H;
  const usableHeight = POS_WIDTH - 2 * POS_MARGIN;

  const shouldNormalize = options.settings?.normalize_addresses === true;
  const rawFrom = order.sender_details ?? "";
  const rawTo = order.recipient_details ?? "";
  const fromSource = shouldNormalize ? normalizeAddressBlock(rawFrom) : rawFrom;
  const toSource = shouldNormalize ? normalizeAddressBlock(rawTo) : rawTo;

  const addressSize = options.settings?.text_size ?? SIZE_ADDRESS;
  const labelSize = options.settings?.text_size ?? SIZE_LABEL;
  const textBold = options.settings?.text_bold !== false;
  const lineHeightMm = addressSize * 0.5;
  const labelToAddressGap = 6;

  // Column widths match A4 layout
  const colW = A4_COL_W;
  const maxWFrom = colW - ADDRESS_PADDING - EDGE_SAFE_GAP;
  const maxWTo = colW - ADDRESS_PADDING - EDGE_SAFE_GAP;

  const fromLines = getAddressLines(doc as any, fromSource, maxWFrom).slice(0, MAX_ADDRESS_LINES);
  const toLines = getAddressLines(doc as any, toSource, maxWTo).slice(0, MAX_ADDRESS_LINES);

  // Rotated 90° clockwise: what was "x" in A4 becomes "y" (distance from top of page),
  // and what was "y" in A4 becomes "x" (distance from left = bottom of rotated view).
  // jsPDF angle:90 rotates text so we draw at (xPos, yPos) where:
  //   yPos = distance from top = maps to horizontal position in A4
  //   xPos = distance from left = maps to vertical position in A4 (inverted)

  // Border around the label
  const borderLeft = POS_MARGIN;
  const borderRight = POS_WIDTH - POS_MARGIN;
  const borderTop = pageTop + POS_MARGIN;
  const borderBottom = pageTop + A4_SECTION_W - POS_MARGIN;

  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.setLineDashPattern([], 0);
  doc.line(borderLeft, borderTop, borderLeft, borderBottom);    // left
  doc.line(borderLeft, borderTop, borderRight, borderTop);      // top
  doc.line(borderRight, borderTop, borderRight, borderBottom);  // right
  doc.setLineDashPattern([2, 2], 0);
  doc.line(borderLeft, borderBottom, borderRight, borderBottom); // bottom (cut)
  doc.setLineDashPattern([], 0);

  // Vertical center of usable area (for text x-position when rotated)
  const centerX = POS_WIDTH / 2;

  // Column start positions (along Y-axis = page top-to-bottom = A4 left-to-right)
  const fromColY = borderTop + ADDRESS_PADDING;
  const centerColY = borderTop + colW + A4_MARGIN;
  const toColY = borderTop + (colW + A4_MARGIN) * 2;

  // FROM
  const fromTextX = borderRight - ADDRESS_PADDING;
  const fromYBase = options.settings?.from_y_mm != null
    ? clamp(options.settings.from_y_mm, 0, sectionH)
    : 27;
  const fromTextStartX = borderRight - fromYBase;

  doc.setFont(FONT_HEADING, textBold ? "bold" : "normal");
  doc.setFontSize(labelSize);
  doc.text("FROM:", fromTextStartX, fromColY, { angle: 90 });

  doc.setFont(FONT_BODY, textBold ? "bold" : "normal");
  doc.setFontSize(addressSize);
  fromLines.forEach((line, i) => {
    doc.text(line, fromTextStartX - labelToAddressGap - i * lineHeightMm, fromColY, { angle: 90 });
  });

  // CENTRE (logo or text)
  const contentType = options.settings?.content_type ?? "logo";
  const customText = (options.settings?.custom_text ?? "").trim();
  const textSize = options.settings?.text_size ?? 15;
  const logoYSetting = options.settings?.logo_y_mm != null
    ? clamp(options.settings.logo_y_mm, 0, sectionH)
    : 40;
  const logoCenterX = borderRight - logoYSetting;
  const logoCenterY = centerColY + colW / 2;

  if (contentType === "text" && customText) {
    doc.setFont(FONT_BODY, textBold ? "bold" : "normal");
    doc.setFontSize(textSize);
    const maxCenterW = colW - 8;
    const lines = doc.splitTextToSize(customText, maxCenterW);
    const lineHeight = textSize * 0.45;
    const startY = logoCenterY - (lines.length * lineHeight) / 2;
    lines.forEach((line: string, i: number) => {
      doc.text(line, logoCenterX, startY + i * lineHeight, { angle: 90, align: "center" });
    });
  } else if (options.logoBase64 && doc.addImage) {
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
    // When rotated: logo "width" maps to Y-axis, "height" maps to X-axis
    const imgX = logoCenterX - drawH / 2;
    const imgY = logoCenterY - drawW / 2;
    try {
      doc.addImage(options.logoBase64, "PNG", imgX, imgY, drawH, drawW);
    } catch {
      // Logo render failed; skip silently
    }
  }

  // TO
  const toYBase = options.settings?.to_y_mm != null
    ? clamp(options.settings.to_y_mm, 0, sectionH)
    : 8;
  const toTextStartX = borderRight - toYBase;

  doc.setFont(FONT_HEADING, textBold ? "bold" : "normal");
  doc.setFontSize(labelSize);
  doc.text("TO:", toTextStartX, toColY, { angle: 90 });

  doc.setFont(FONT_BODY, textBold ? "bold" : "normal");
  doc.setFontSize(addressSize);
  toLines.forEach((line, i) => {
    doc.text(line, toTextStartX - labelToAddressGap - i * lineHeightMm, toColY, { angle: 90 });
  });
}

// ─── Public API ─────────────────────────────────────────────────────────────

const POS_PAGE_HEIGHT = A4_SECTION_W; // one A4 section width = POS page length

export async function downloadOrderPosPdf(order: Order) {
  if (typeof window === "undefined") return;
  try {
    const renderOptions = await fetchPosRenderOptions(order.user_id);
    const doc = new jsPDF({ unit: "mm", format: [POS_WIDTH, POS_PAGE_HEIGHT] });
    drawPosLabel(doc, order, 0, renderOptions);
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
    const doc = new jsPDF({ unit: "mm", format: [POS_WIDTH, POS_PAGE_HEIGHT] });

    for (let i = 0; i < orders.length; i++) {
      if (i > 0) doc.addPage([POS_WIDTH, POS_PAGE_HEIGHT], "p");
      drawPosLabel(doc, orders[i], 0, renderOptions);
    }

    const filename = buildTimestampedFilename("SareeOrders_POS");
    const blob = doc.output("blob");
    await savePdfBlob(blob, filename);
  } catch (e) {
    console.error("[POS-PDF] downloadOrdersPosPdf failed:", e);
    throw e;
  }
}
