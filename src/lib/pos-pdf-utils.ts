import { jsPDF } from "jspdf";
import type { Order } from "./db-types";
import {
  savePdfBlob,
  resolveOrderLabelLayout,
  type PdfRenderOptions,
  type ResolvedLabelLayout,
} from "./pdf-utils";
import { sanitizePdfBrandText } from "./pdf-address-sanitize";
import { printPdfBase64ViaBluetooth } from "./pos-bluetooth-print";
import { addPrinterLog } from "./printer-debug-log";

// ─── Constants mirrored exactly from A4 pdf-utils.ts ────────────────────────
const FONT_HEADING = "helvetica";
const FONT_BODY = "helvetica";
const SIZE_LABEL = 14;
const SIZE_ADDRESS = 12;
const ADDRESS_PADDING = 4;
const EDGE_SAFE_GAP = 4;
const VERTICAL_OFFSET = 4;

// A4 section geometry (read-only reference)
const A4_W = 210;
const A4_MARGIN = 10;
const SECTION_H = 74.25; // 297 / 4
const BASE_COL_W = (A4_W - A4_MARGIN * 4) / 3;
const COL_SIDE_GAIN_MM = 5;
const LOGO_BOX_REDUCE_MM = 6;
const LEFT_COL_W = BASE_COL_W + COL_SIDE_GAIN_MM + LOGO_BOX_REDUCE_MM / 2;
const RIGHT_COL_W = BASE_COL_W + COL_SIDE_GAIN_MM + LOGO_BOX_REDUCE_MM / 2;
const CENTER_COL_W = BASE_COL_W - COL_SIDE_GAIN_MM * 2 - LOGO_BOX_REDUCE_MM;
const LOGO_MAX_W_MM = CENTER_COL_W;
const LOGO_MAX_H_MM = CENTER_COL_W;
const leftColStart = A4_MARGIN;
const centerColStart = leftColStart + LEFT_COL_W + A4_MARGIN;
const rightColStart = centerColStart + CENTER_COL_W + A4_MARGIN;
const centerX = centerColStart + CENTER_COL_W / 2;

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

async function fetchPosRenderOptions(userId: string): Promise<PdfRenderOptions> {
  try {
    const { getPdfSettings, getPdfLogoBase64 } = await import("./pdf-settings-supabase");
    const settings = await getPdfSettings(userId);
    let logoBase64: string | null = await loadDefaultLogo();
    if (settings?.content_type === "logo") {
      if (settings.logo_path) {
        const cached = getUserLogoCache(userId);
        if (cached && cached.updatedAt === settings.updated_at) {
          logoBase64 = cached.data;
        } else {
          // Keep bundled default as guaranteed fallback; only override when server logo loads.
          const serverLogo = await getPdfLogoBase64(userId, settings.logo_path);
          if (serverLogo) {
            logoBase64 = serverLogo;
            setUserLogoCache(userId, settings.updated_at, serverLogo);
          } else if (cached?.data) {
            // Network failure fallback: use last known uploaded logo.
            logoBase64 = cached.data;
          }
        }
      }
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
let defaultLogoCache: string | null | undefined;
const USER_LOGO_CACHE_PREFIX = "saree_pdf_logo_cache:";
type UserLogoCache = { updatedAt: string; data: string };

function getUserLogoCache(userId: string): UserLogoCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`${USER_LOGO_CACHE_PREFIX}${userId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UserLogoCache;
    if (!parsed?.updatedAt || !parsed?.data) return null;
    return parsed;
  } catch {
    return null;
  }
}

function setUserLogoCache(userId: string, updatedAt: string, data: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      `${USER_LOGO_CACHE_PREFIX}${userId}`,
      JSON.stringify({ updatedAt, data } as UserLogoCache),
    );
  } catch {
    // ignore storage failures
  }
}

async function loadDefaultLogo(): Promise<string | null> {
  if (defaultLogoCache !== undefined) return defaultLogoCache;
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
        if (result) {
          defaultLogoCache = result;
          return result;
        }
      } catch { /* skip */ }
    }
  }
  defaultLogoCache = null;
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
  options: PdfRenderOptions,
  resolved: ResolvedLabelLayout
) {
  const labelSize = resolved.labelSizePt;
  const addressSize = resolved.addressSizePt;
  const textBold = options.settings?.text_bold !== false;
  const lineHeightMm = resolved.addressSizePt * 0.5;
  const labelToAddressGap = 6;

  const fromLines = resolved.fromLines;
  const toLines = resolved.toLines;
  const fromY = resolved.fromY;
  const toY = resolved.toY;
  const thanksCenterA4Y = resolved.logoCenterYRel;

  // ── A4-space column X positions (horizontal in A4) ──
  const a4FromX = A4_MARGIN + ADDRESS_PADDING;
  const a4CenterX = centerX;
  const a4ToX = rightColStart - resolved.toShiftMm + ADDRESS_PADDING;

  const contentType = options.settings?.content_type ?? "logo";
  const customText = sanitizePdfBrandText(options.settings?.custom_text ?? "");
  const textSize = resolved.centerTextSizePt;

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
  const logoCenterPosY = posY(a4CenterX);

  if (contentType === "text" && customText) {
    doc.setFont(FONT_BODY, textBold ? "bold" : "normal");
    doc.setFontSize(textSize);
    const maxCenterW = CENTER_COL_W - 8;
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
  const d = doc as unknown as Parameters<typeof resolveOrderLabelLayout>[0];
  for (let i = 0; i < orders.length; i++) {
    if (i > 0) doc.addPage([POS_PAGE_W, POS_PAGE_H], "p");
    const resolved = resolveOrderLabelLayout(d, orders[i], renderOptions);
    drawPosLabel(doc, orders[i], renderOptions, resolved);
  }
  return doc;
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
    const d = doc as unknown as Parameters<typeof resolveOrderLabelLayout>[0];
    const resolved = resolveOrderLabelLayout(d, order, renderOptions);
    drawPosLabel(doc, order, renderOptions, resolved);
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
    const blob = doc.output("blob");
    const base64 = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onloadend = () => {
        const result = typeof r.result === "string" ? r.result : "";
        const onlyBase64 = result.includes(",") ? result.split(",", 2)[1] : result;
        if (!onlyBase64) {
          reject(new Error("Failed to encode POS PDF for printer."));
          return;
        }
        resolve(onlyBase64);
      };
      r.onerror = () => reject(new Error("Failed to read POS PDF blob."));
      r.readAsDataURL(blob);
    });

    const directResult = await printPdfBase64ViaBluetooth(base64);
    if (!directResult.success) {
      addPrinterLog("orders.print", "PDF direct print failed", directResult.error, "error");
      throw new Error(directResult.error ?? "POS printer not connected");
    }
    addPrinterLog("orders.print", "PDF direct print sent");
  } catch (e) {
    console.error("[POS-PDF] printOrdersPosPdf failed:", e);
    throw e;
  }
}
