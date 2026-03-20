import { jsPDF } from "jspdf";
import { Capacitor } from "@capacitor/core";
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

// POS page sized to fit one rotated A4 section at 1:1 (no font distortion).
// POS width  = SECTION_H = 74.25mm (fits 80mm POS paper; A4 section's vertical
//              dimension becomes the narrow horizontal dimension of the strip)
// POS height = A4_W = 210mm (A4 section's full horizontal span becomes the
//              long vertical dimension of the strip)
const POS_PAGE_W = SECTION_H; // 74.25mm
const POS_PAGE_H = A4_W;      // 210mm

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
        const cacheBustUrl = `${url}${url.includes("?") ? "&" : "?"}v=${Date.now()}`;
        const res = await fetch(cacheBustUrl, { cache: "no-store" });
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
// GOAL: Take one A4 address block and rotate it 90° clockwise onto POS paper
// so when the strip is turned sideways, it reads: FROM | LOGO | TO
//
// A4 block (normal orientation):
//   ┌──────────────────────────────────────────────┐ ← sectionTop
//   │  FROM:        [LOGO]           TO:           │
//   │  addr...                       addr...       │
//   │  ...                           ...           │
//   └──────────────────────────────────────────────┘ ← sectionTop + 74.25
//   ↑ x=10                                    x=200↑
//
// POS strip (rotated 90° CW — what jsPDF actually draws):
//   ┌──74.25mm──┐
//   │  TO:      │ ← top of strip (was RIGHT side of A4)
//   │  addr...  │
//   │           │
//   │  [LOGO]   │ ← middle
//   │           │
//   │  FROM:    │
//   │  addr...  │ ← bottom of strip (was LEFT side of A4)
//   └───────────┘
//     210mm tall
//
// When you cut & rotate the strip 90° counter-clockwise to paste on parcel:
//   FROM | LOGO | TO  (reads left-to-right ✓)
//
// COORDINATE MAPPING:
//   A4 x (horizontal, 10→200) → POS y (vertical, 10→200, same direction)
//     But REVERSED because we want FROM at bottom, TO at top:
//     posY = POS_PAGE_H - a4X
//   A4 y (vertical, 0→74.25, top of section to bottom) → POS x (horizontal)
//     posX = a4Y  (same direction: A4 top → POS left)
//
// With jsPDF angle: 90, text at (posX, posY) renders characters going downward
// from the anchor point. The anchor is the text baseline, so characters extend
// ABOVE (to the left in POS-x). Each successive line should be at higher posX.

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

  // ── A4-space column X positions (horizontal in A4) ──
  const a4FromX = A4_MARGIN + ADDRESS_PADDING;                              // 14mm
  const a4CenterColStart = A4_MARGIN + COL_W + A4_MARGIN;                   // ≈76.67mm
  const a4CenterX = a4CenterColStart + COL_W / 2;                           // ≈105mm
  const a4ToX = A4_MARGIN + (COL_W + A4_MARGIN) * 2 + ADDRESS_PADDING;      // ≈147.33mm

  // ── A4-space vertical Y positions (top-to-bottom within section) ──
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

  let fromY = fromYBase;
  let toY = toYBase;

  // Vertical auto-shift
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

  // ── Coordinate transform ──
  // posY: A4 x → POS y, REVERSED so FROM (left in A4) is at bottom of strip
  //       and TO (right in A4) is at top of strip
  const posY = (a4X: number) => POS_PAGE_H - a4X;
  // posX: A4 y → POS x, same direction (A4 section-top → POS left edge)
  //       With angle:90, text flows downward from anchor. Each new address line
  //       is further "down" in A4 (higher a4Y), so posX increases → moves right.
  const posX = (a4Y: number) => a4Y;

  // ── Draw border ──
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.setLineDashPattern([], 0);
  // Left border at x=0
  doc.line(0, A4_MARGIN, 0, POS_PAGE_H - A4_MARGIN);
  // Top border
  doc.line(0, A4_MARGIN, POS_PAGE_W, A4_MARGIN);
  // Right border at x=SECTION_H
  doc.line(POS_PAGE_W, A4_MARGIN, POS_PAGE_W, POS_PAGE_H - A4_MARGIN);
  // Bottom dashed (cut line)
  doc.setLineDashPattern([2, 2], 0);
  doc.line(0, POS_PAGE_H - A4_MARGIN, POS_PAGE_W, POS_PAGE_H - A4_MARGIN);
  doc.setLineDashPattern([], 0);

  // ── FROM (left column in A4 → bottom of POS strip) ──
  const fromAnchorX = posX(fromY);
  const fromAnchorY = posY(a4FromX);

  doc.setFont(FONT_HEADING, textBold ? "bold" : "normal");
  doc.setFontSize(labelSize);
  doc.text("FROM:", fromAnchorX, fromAnchorY, { angle: 90 });

  doc.setFont(FONT_BODY, textBold ? "bold" : "normal");
  doc.setFontSize(addressSize);
  fromLines.forEach((line, i) => {
    doc.text(line, posX(fromY + labelToAddressGap + i * lineHeightMm), fromAnchorY, { angle: 90 });
  });

  // ── CENTRE (logo or text) ──
  const contentType = options.settings?.content_type ?? "logo";
  const customText = (options.settings?.custom_text ?? "").trim();
  const textSize = options.settings?.text_size ?? 15;

  const logoCenterPosY = posY(a4CenterX);

  if (contentType === "text" && customText) {
    doc.setFont(FONT_BODY, textBold ? "bold" : "normal");
    doc.setFontSize(textSize);
    const maxCenterW = COL_W - 8;
    const lines = doc.splitTextToSize(customText, maxCenterW);
    const lh = textSize * 0.4;
    const totalH = lines.length * lh;
    lines.forEach((line: string, i: number) => {
      const lineA4Y = thanksCenterA4Y - totalH / 2 + i * lh;
      doc.text(line, posX(lineA4Y), logoCenterPosY, { angle: 90, align: "center" });
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

    // Logo addImage doesn't rotate. In POS coordinates:
    // A4 logo horizontal center (a4CenterX) → POS vertical center (posY)
    // A4 logo vertical center (thanksCenterA4Y) → POS horizontal center (posX)
    // A4 logo width (horizontal span) maps to POS height (vertical span)
    // A4 logo height (vertical span) maps to POS width (horizontal span)
    const imgCenterPosX = posX(thanksCenterA4Y);
    const imgCenterPosY = logoCenterPosY;
    const imgX = imgCenterPosX - drawH / 2;
    const imgY = imgCenterPosY - drawW / 2;

    try {
      doc.addImage(options.logoBase64, "PNG", imgX, imgY, drawH, drawW);
    } catch {
      // Logo render failed; skip
    }
  }

  // ── TO (right column in A4 → top of POS strip) ──
  const toAnchorX = posX(toY);
  const toAnchorY = posY(a4ToX);

  doc.setFont(FONT_HEADING, textBold ? "bold" : "normal");
  doc.setFontSize(labelSize);
  doc.text("TO:", toAnchorX, toAnchorY, { angle: 90 });

  doc.setFont(FONT_BODY, textBold ? "bold" : "normal");
  doc.setFontSize(addressSize);
  toLines.forEach((line, i) => {
    doc.text(line, posX(toY + labelToAddressGap + i * lineHeightMm), toAnchorY, { angle: 90 });
  });
}

function renderOrdersToPosPdfDoc(orders: Order[], renderOptions: PdfRenderOptions): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: [POS_PAGE_W, POS_PAGE_H] });
  for (let i = 0; i < orders.length; i++) {
    if (i > 0) doc.addPage([POS_PAGE_W, POS_PAGE_H], "p");
    drawPosLabel(doc, orders[i], renderOptions);
  }
  return doc;
}

async function openNativePdfForPrint(uri: string, filename: string): Promise<void> {
  // Open with native app so user can print the exact same POS PDF.
  try {
    const { FileOpener } = await import("@capacitor-community/file-opener");
    await FileOpener.open({
      filePath: uri,
      contentType: "application/pdf",
      openWithDefault: true,
    });
    return;
  } catch {
    // continue to share fallback
  }
  try {
    const { Share } = await import("@capacitor/share");
    const canShare = await Share.canShare();
    if (canShare.value) {
      await Share.share({ title: filename, url: uri, dialogTitle: "Print POS PDF" });
      return;
    }
  } catch {
    // continue to final fallback
  }
  try {
    (window as any).open(uri, "_system");
  } catch {
    // nothing else to do
  }
}

function printPdfBlobInBrowser(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.src = url;
  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } finally {
      setTimeout(() => {
        URL.revokeObjectURL(url);
        iframe.remove();
      }, 1500);
    }
  };
  document.body.appendChild(iframe);
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
    const doc = renderOrdersToPosPdfDoc(orders, renderOptions);
    const filename = buildTimestampedFilename("SareeOrders_POS");
    const blob = doc.output("blob");
    await savePdfBlob(blob, filename);
  } catch (e) {
    console.error("[POS-PDF] downloadOrdersPosPdf failed:", e);
    throw e;
  }
}

export async function printOrdersPosPdf(orders: Order[]) {
  if (typeof window === "undefined") return;
  if (orders.length === 0) return;
  try {
    const userId = orders[0].user_id;
    const renderOptions = await fetchPosRenderOptions(userId);
    const doc = renderOrdersToPosPdfDoc(orders, renderOptions);
    const filename = buildTimestampedFilename("SareeOrders_POS_Print");
    const blob = doc.output("blob");

    if (Capacitor.isNativePlatform()) {
      const uri = await savePdfBlob(blob, filename);
      if (uri) {
        await openNativePdfForPrint(uri, filename);
      }
      return;
    }

    printPdfBlobInBrowser(blob);
  } catch (e) {
    console.error("[POS-PDF] printOrdersPosPdf failed:", e);
    throw e;
  }
}
