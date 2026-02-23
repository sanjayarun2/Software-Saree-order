import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Capacitor } from "@capacitor/core";
import type { Order } from "./db-types";

/** Options passed from fetchPdfSettingsForRendering; used for centre block and vertical position. */
export type PdfRenderOptions = {
  settings: {
    content_type: "text" | "logo";
    placement: "top" | "bottom";
    text_size: number;
    text_bold?: boolean;
    custom_text: string;
    logo_zoom: number;
    /** Vertical positions in mm from section top (0–74.25). When set, used by PDF engine. */
    logo_y_mm?: number;
    from_y_mm?: number;
    to_y_mm?: number;
  } | null;
  logoBase64: string | null;
  /** Natural width / height of the logo image (for aspect-ratio-aware scaling). */
  logoAspectRatio: number | null;
};

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** Build a unique timestamped filename: Prefix_YYYYMMDD_HHMMSS.pdf */
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

/**
 * Open the saved PDF after generation.
 *
 * Strategy (in order):
 *  1. @capacitor-community/file-opener  – opens the file via a native Intent
 *     (ACTION_VIEW + FileProvider on Android, UIDocumentInteractionController
 *     on iOS). Works with Scoped Storage on Android 11+.
 *  2. @capacitor/share                  – opens the system share sheet so the
 *     user can pick a file manager or PDF viewer.
 *  3. window.open(uri, "_system")       – last-resort fallback.
 */
async function openPdfFile(uri: string, filename: string): Promise<void> {
  // 1. Try the file-opener plugin (opens directly in the default viewer / file manager)
  try {
    const { FileOpener } = await import("@capacitor-community/file-opener");
    await FileOpener.open({
      filePath: uri,
      contentType: "application/pdf",
      openWithDefault: true,
    });
    console.log("[PDF] File opened via file-opener plugin");
    return;
  } catch (openerErr) {
    console.warn("[PDF] file-opener plugin failed, trying share fallback:", openerErr);
  }

  // 2. Fallback: native share sheet
  try {
    const { Share } = await import("@capacitor/share");
    const canShare = await Share.canShare();
    if (canShare.value) {
      await Share.share({ title: filename, url: uri, dialogTitle: "Open PDF" });
      console.log("[PDF] File shared via Share plugin");
      return;
    }
  } catch (shareErr) {
    console.warn("[PDF] Share plugin failed:", shareErr);
  }

  // 3. Last resort: open the URI directly
  try {
    (window as any).open(uri, "_system");
  } catch {
    /* nothing more we can do */
  }
}

/**
 * Show a non-blocking DOM toast confirming the save, with a "View Folder" button.
 * Pure DOM — no React dependency — so it works from a utility module.
 */
function showPdfSavedToast(uri: string, filename: string): void {
  if (typeof document === "undefined") return;

  // Inject keyframes once
  if (!document.getElementById("_pdf-toast-style")) {
    const style = document.createElement("style");
    style.id = "_pdf-toast-style";
    style.textContent = `
      @keyframes _pdfToastIn  { from { opacity:0; transform:translateX(-50%) translateY(24px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }
      @keyframes _pdfToastOut { from { opacity:1; } to { opacity:0; } }
    `;
    document.head.appendChild(style);
  }

  // Remove any previous toast
  document.getElementById("_pdf-save-toast")?.remove();

  const toast = document.createElement("div");
  toast.id = "_pdf-save-toast";
  Object.assign(toast.style, {
    position: "fixed",
    bottom: "88px",
    left: "50%",
    transform: "translateX(-50%)",
    background: "#1e293b",
    color: "#f8fafc",
    borderRadius: "16px",
    padding: "14px 18px",
    boxShadow: "0 8px 32px rgba(0,0,0,0.40)",
    zIndex: "99999",
    maxWidth: "360px",
    width: "calc(100% - 32px)",
    fontFamily: "system-ui, -apple-system, sans-serif",
    fontSize: "14px",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    animation: "_pdfToastIn 0.28s ease",
  });

  // Message row
  const msgRow = document.createElement("div");
  Object.assign(msgRow.style, { display: "flex", alignItems: "flex-start", gap: "10px" });
  msgRow.innerHTML = `
    <span style="font-size:22px;flex-shrink:0;line-height:1.2">✅</span>
    <div>
      <div style="font-weight:700;font-size:14px;margin-bottom:3px">PDF Saved!</div>
      <div style="color:#94a3b8;font-size:12.5px;line-height:1.5">
        Saved to <strong style="color:#cbd5e1">Documents/Saree_Orders</strong> folder on your device.
      </div>
    </div>
  `;

  // Action buttons row
  const actions = document.createElement("div");
  Object.assign(actions.style, { display: "flex", gap: "8px", justifyContent: "flex-end" });

  const btnBase = `
    border-radius:8px; cursor:pointer; font-size:13px; font-weight:600;
    padding:7px 16px; border:none; outline:none;
  `;

  const dismissBtn = document.createElement("button");
  dismissBtn.textContent = "Dismiss";
  dismissBtn.setAttribute("style", `${btnBase} background:transparent; border:1px solid #475569; color:#94a3b8;`);

  const viewBtn = document.createElement("button");
  viewBtn.textContent = "View Folder";
  viewBtn.setAttribute("style", `${btnBase} background:#6366f1; color:#fff;`);

  const dismiss = () => {
    toast.style.animation = "_pdfToastOut 0.22s ease forwards";
    setTimeout(() => toast.remove(), 240);
  };

  dismissBtn.addEventListener("click", dismiss);
  viewBtn.addEventListener("click", async () => {
    dismiss();
    await openPdfFile(uri, filename);
  });

  actions.appendChild(dismissBtn);
  actions.appendChild(viewBtn);
  toast.appendChild(msgRow);
  toast.appendChild(actions);
  document.body.appendChild(toast);

  // Auto-dismiss after 8 seconds
  setTimeout(dismiss, 8000);
}

/**
 * Show toast when user clicks PDF again with no change: "Already downloaded. View again?"
 */
function showAlreadyDownloadedToast(uri: string, filename: string): void {
  if (typeof document === "undefined") return;
  document.getElementById("_pdf-save-toast")?.remove();
  if (!document.getElementById("_pdf-toast-style")) {
    const style = document.createElement("style");
    style.id = "_pdf-toast-style";
    style.textContent = `
      @keyframes _pdfToastIn  { from { opacity:0; transform:translateX(-50%) translateY(24px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }
      @keyframes _pdfToastOut { from { opacity:1; } to { opacity:0; } }
    `;
    document.head.appendChild(style);
  }
  const toast = document.createElement("div");
  toast.id = "_pdf-save-toast";
  Object.assign(toast.style, {
    position: "fixed",
    bottom: "88px",
    left: "50%",
    transform: "translateX(-50%)",
    background: "#1e293b",
    color: "#f8fafc",
    borderRadius: "16px",
    padding: "14px 18px",
    boxShadow: "0 8px 32px rgba(0,0,0,0.40)",
    zIndex: "99999",
    maxWidth: "360px",
    width: "calc(100% - 32px)",
    fontFamily: "system-ui, -apple-system, sans-serif",
    fontSize: "14px",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    animation: "_pdfToastIn 0.28s ease",
  });
  const msgRow = document.createElement("div");
  Object.assign(msgRow.style, { display: "flex", alignItems: "flex-start", gap: "10px" });
  msgRow.innerHTML = `
    <span style="font-size:22px;flex-shrink:0">📄</span>
    <div>
      <div style="font-weight:700;font-size:14px;margin-bottom:3px">Already downloaded</div>
      <div style="color:#94a3b8;font-size:12.5px;line-height:1.5">No change — open or download again?</div>
    </div>
  `;
  const actions = document.createElement("div");
  Object.assign(actions.style, { display: "flex", gap: "8px", justifyContent: "flex-end" });
  const btnBase = "border-radius:8px; cursor:pointer; font-size:13px; font-weight:600; padding:7px 16px; border:none; outline:none;";
  const dismissBtn = document.createElement("button");
  dismissBtn.textContent = "Dismiss";
  dismissBtn.setAttribute("style", `${btnBase} background:transparent; border:1px solid #475569; color:#94a3b8;`);
  const viewBtn = document.createElement("button");
  viewBtn.textContent = "View";
  viewBtn.setAttribute("style", `${btnBase} background:#6366f1; color:#fff;`);
  const dismiss = () => {
    toast.style.animation = "_pdfToastOut 0.22s ease forwards";
    setTimeout(() => toast.remove(), 240);
  };
  dismissBtn.addEventListener("click", dismiss);
  viewBtn.addEventListener("click", async () => {
    dismiss();
    await openPdfFile(uri, filename);
  });
  actions.appendChild(dismissBtn);
  actions.appendChild(viewBtn);
  toast.appendChild(msgRow);
  toast.appendChild(actions);
  document.body.appendChild(toast);
  setTimeout(dismiss, 8000);
}

/**
 * After writing a file via Filesystem.writeFile, call getUri + stat so that
 * Android's MediaStore / content-resolver acknowledges the file.  This makes
 * it appear in "Recent files", Documents notification history, and the system
 * file manager's Saree_Orders folder.  Non-fatal — failures are logged and
 * swallowed so they never block the save flow.
 *
 * Returns the resolved native URI (preferred over the raw writeFile result).
 */
async function registerFileWithSystem(path: string): Promise<string | null> {
  try {
    const { uri } = await Filesystem.getUri({ path, directory: Directory.Documents });
    console.log("[PDF] registerFile: resolved URI:", uri);

    const info = await Filesystem.stat({ path, directory: Directory.Documents });
    console.log(`[PDF] registerFile: stat OK – ${info.size} bytes, mtime ${info.mtime}`);

    return uri;
  } catch (err) {
    console.warn("[PDF] registerFile: non-fatal error:", err);
    return null;
  }
}

/** Load default thank-you logo from public folder; returns base64 data URL or null. */
async function loadDefaultLogoBase64(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  try {
    const res = await fetch("/thank-you-purchase-logo.png");
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const r = new FileReader();
      r.onloadend = () => resolve(typeof r.result === "string" ? r.result : null);
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** Returns width/height ratio of a base64 image (browser only). */
async function getImageAspectRatio(base64: string): Promise<number | null> {
  if (typeof window === "undefined") return null;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth / (img.naturalHeight || 1));
    img.onerror = () => resolve(null);
    img.src = base64;
  });
}

/** Fetches PDF settings and logo from Supabase (no cache) so generation always uses latest. */
async function fetchPdfSettingsForRendering(userId: string): Promise<PdfRenderOptions> {
  try {
    const { getPdfSettings, getPdfLogoBase64 } = await import("./pdf-settings-supabase");
    const settings = await getPdfSettings(userId);
    let logoBase64: string | null = null;
    if (settings?.content_type === "logo") {
      if (settings.logo_path) {
        logoBase64 = await getPdfLogoBase64(userId, settings.logo_path);
      }
      if (!logoBase64) logoBase64 = await loadDefaultLogoBase64();
    }
    const logoAspectRatio = logoBase64 ? await getImageAspectRatio(logoBase64) : null;
    return { settings, logoBase64, logoAspectRatio };
  } catch (e) {
    console.warn("[PDF] fetchPdfSettingsForRendering failed:", e);
    const logoBase64 = await loadDefaultLogoBase64();
    const logoAspectRatio = logoBase64 ? await getImageAspectRatio(logoBase64) : null;
    return { settings: null, logoBase64, logoAspectRatio };
  }
}

/** Force direct download to device: hidden <a download> with Blob URL (web & mobile browsers). */
function forceDownloadPdf(blob: Blob, filename: string): void {
  if (typeof window === "undefined") return;
  console.log(`[PDF] Starting download: ${filename}, size: ${blob.size} bytes`);
  const url = URL.createObjectURL(blob);
  console.log(`[PDF] Blob URL created: ${url.substring(0, 50)}...`);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  console.log(`[PDF] Anchor element created and appended, triggering click...`);
  // Use a direct click in the same user-gesture to avoid popup blockers.
  a.click();
  document.body.removeChild(a);
  console.log(`[PDF] Download triggered successfully`);
  // Delay revocation slightly so mobile browsers have time to start the download.
  setTimeout(() => {
    URL.revokeObjectURL(url);
    console.log(`[PDF] Blob URL revoked`);
  }, 500);
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result === "string") {
        // result is like "data:application/pdf;base64,AAAA..."
        const base64 = result.split(",", 2)[1] ?? "";
        resolve(base64);
      } else {
        reject(new Error("Failed to convert blob to base64"));
      }
    };
    reader.onerror = (e) => reject(e);
    reader.readAsDataURL(blob);
  });
}

/** Last single-order PDF: used to show "Already downloaded" when user clicks again with no change. */
let lastPdfOrderId: string | null = null;
let lastPdfUri: string | null = null;
let lastPdfFilename: string | null = null;

export async function savePdfBlob(blob: Blob, filename: string): Promise<string | null> {
  if (typeof window === "undefined") {
    console.warn("[PDF] savePdfBlob called in SSR context, skipping");
    return null;
  }
  console.log(`[PDF] savePdfBlob called: ${filename}, blob size: ${blob.size} bytes`);

  // Check if running in Capacitor native app (Android/iOS) or web
  const isNative = Capacitor.isNativePlatform();
  console.log(`[PDF] Platform: ${isNative ? 'Native (Capacitor)' : 'Web'}`);

  // One-time in-app consent (industry-style "allow download" prompt)
  const consentKey = "saree_pdf_download_consent";
  try {
    const hasStorage = typeof window !== "undefined" && (window as any).localStorage;
    const existingConsent =
      hasStorage && (window as any).localStorage.getItem(consentKey as string);

    if (!existingConsent || existingConsent !== "yes") {
      const message =
        "Allow this app to download PDF files to your device?\n\n" +
        "You can view them later from your Downloads folder.";
      const ok = window.confirm(message);
      if (!ok) {
        console.log("[PDF] User declined download consent, aborting download");
        return null;
      }
      if (hasStorage) {
        (window as any).localStorage.setItem(consentKey as string, "yes");
      }
      console.log("[PDF] User granted download consent");
    }
  } catch (consentError) {
    console.warn("[PDF] Consent check failed, continuing with download anyway:", consentError);
  }

  // On native:
  //   1) First, try browser-style download so Android/Chrome DownloadManager can
  //      show a status-bar notification when supported.
  //   2) Then, save via Capacitor Filesystem into Documents/SareeOrders so there
  //      is always a reliable local copy with a clear alert.
  // On web:
  //   - Only use browser-style download.
  try {
    if (isNative) {
      console.log("[PDF] Native platform detected, starting with browser-style download for notification...");

      // Step 1: best-effort browser-style download for notification.
      try {
        forceDownloadPdf(blob, filename);
        console.log("[PDF] Browser-style download (notification) triggered on native.");
      } catch (anchorErr) {
        console.warn("[PDF] Browser-style download failed on native, continuing to filesystem save:", anchorErr);
      }

      // Step 2: reliable native save into Documents/Saree_Orders.
      console.log("[PDF] Now trying Capacitor Filesystem save to Documents/Saree_Orders...");
      try {
        const base64Data = await blobToBase64(blob);
        console.log("[PDF] Blob converted to base64, length:", base64Data.length);
        const path = `Saree_Orders/${filename}`;
        const result = await Filesystem.writeFile({
          path,
          data: base64Data,
          directory: Directory.Documents,
          recursive: true,
        });
        console.log("[PDF] Native save success. URI:", result.uri ?? "<no-uri>");

        // Register file with the Android media index so it appears in
        // system notifications / recent-files / Documents browser.
        const resolvedUri = await registerFileWithSystem(path);
        showPdfSavedToast(resolvedUri ?? result.uri ?? path, filename);
        return resolvedUri ?? result.uri ?? path;
      } catch (nativeErr) {
        console.error("[PDF] Native Filesystem save failed, falling back to browser-style download:", nativeErr);
      }
      console.log("[PDF] Falling back to WebView/browser download on native platform");
    }
    forceDownloadPdf(blob, filename);
    console.log("[PDF] Download method (anchor/blob) completed successfully");
    return null;
  } catch (error) {
    console.error("[PDF] Download failed, using fallback:", error);
    const fallbackUrl = URL.createObjectURL(blob);
    console.log("[PDF] Fallback: navigating to blob URL");
    window.location.href = fallbackUrl;
    return null;
  }
}

export interface ReportStats {
  periodLabel: string;
  from: string;
  to: string;
  totalOrders: number;
  totalSarees: number;
  prevTotalOrders: number;
  prevTotalSarees: number;
  ordersChangePercent: number;
  sareesChangePercent: number;
}

function getAddressSummary(text: string, maxLen = 60): string {
  const first = (text || "").split(/\r?\n/)[0]?.trim() || text?.trim() || "";
  return first.length > maxLen ? `${first.slice(0, maxLen)}…` : first;
}

// A4: 210mm x 297mm. Four sections per page for parcel labels. Fixed values = same output on all devices.
const A4_W = 210;
const A4_H = 297;
const SECTIONS_PER_PAGE = 4;
const SECTION_H = A4_H / SECTIONS_PER_PAGE;
const MARGIN = 10;
const COL_W = (A4_W - MARGIN * 4) / 3;

// Typography (Helvetica only = identical on Mobile, Android, Web)
const FONT_HEADING = "helvetica";
const FONT_BODY = "helvetica";
const SIZE_LABEL = 14;       // TO / FROM labels — larger than address for emphasis
const SIZE_ADDRESS = 12;     // address lines — larger and bold for print visibility
const SIZE_THANKS_TITLE = 10;  // reduced for better balance
const SIZE_THANKS_SUB = 10;
const LINE_HEIGHT_ADDRESS = 6; // matches SIZE_ADDRESS for clean print
const MAX_ADDRESS_LINES = 7;

// Layout spacing
const ADDRESS_PADDING = 3;   // horizontal padding so text doesn't touch borders
const VERTICAL_OFFSET = 4;   // shift address blocks downward for balance
const THANKS_LINE_GAP = 3;   // slightly increased gap between center lines

/** Split address by user newlines first, then wrap long lines to fit width. Preserves formatting. */
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

const LOGO_MAX_W_MM = 40;   // fixed logo container width (mm)
const LOGO_MAX_H_MM = 20;   // fixed logo container height (mm)

function drawOrderLabel(
  doc: {
    setFont: (f: string, s: string) => void;
    setFontSize: (n: number) => void;
    text: (s: string, x: number, y: number, o?: { align?: string }) => void;
    splitTextToSize: (s: string, w: number) => string[];
    setDrawColor: (r: number, g?: number, b?: number) => void;
    setFillColor: (r: number, g?: number, b?: number) => void;
    setTextColor: (r: number, g?: number, b?: number) => void;
    circle: (x: number, y: number, radius: number, style?: string) => void;
    addImage?: (imageData: string, format: string, x: number, y: number, w: number, h: number) => void;
    internal?: { write: (s: string) => void; scaleFactor: number };
  },
  order: Order,
  sectionTop: number,
  options: PdfRenderOptions
) {
  const leftX = MARGIN + ADDRESS_PADDING;
  const centerColStart = MARGIN + COL_W + MARGIN;
  const centerX = centerColStart + COL_W / 2;
  const rightColStart = MARGIN + (COL_W + MARGIN) * 2;
  const rightX = rightColStart + ADDRESS_PADDING;
  const maxW = COL_W - 4 - 2 * ADDRESS_PADDING;

  const sectionH = SECTION_H;
  const toY = options.settings?.to_y_mm != null ? clamp(options.settings.to_y_mm, 0, sectionH) : 8;
  const fromY = options.settings?.from_y_mm != null ? clamp(options.settings.from_y_mm, 0, sectionH) : 27;
  const labelSize = options.settings?.text_size ?? SIZE_LABEL;
  const addressSize = options.settings?.text_size ?? SIZE_ADDRESS;
  const textBold = options.settings?.text_bold !== false;
  const lineHeightMm = (options.settings?.text_size ?? SIZE_ADDRESS) * 0.5;
  const labelToAddressGap = (options.settings?.text_size ?? SIZE_ADDRESS) * 0.4;
  const labelYTo = sectionTop + toY;
  const addressStartYTo = sectionTop + toY + labelToAddressGap;
  const labelYFrom = sectionTop + fromY;
  const addressStartYFrom = sectionTop + fromY + labelToAddressGap;

  // FROM — left column (uses settings: text_size, text_bold)
  doc.setFont(FONT_HEADING, textBold ? "bold" : "normal");
  doc.setFontSize(labelSize);
  doc.text("FROM:", leftX, labelYFrom);
  doc.setFont(FONT_BODY, textBold ? "bold" : "normal");
  doc.setFontSize(addressSize);
  const fromLines = getAddressLines(doc, order.sender_details ?? "", maxW);
  fromLines.slice(0, MAX_ADDRESS_LINES).forEach((line, i) => {
    doc.text(line, leftX, addressStartYFrom + i * lineHeightMm);
  });

  // Centre: vertical position from settings (logo_y_mm) or placement fallback
  const logoY = options.settings?.logo_y_mm != null ? clamp(options.settings.logo_y_mm, 0, sectionH) : null;
  const placement = options.settings?.placement ?? "bottom";
  const thanksCenterY =
    logoY != null ? sectionTop + logoY : (placement === "top" ? sectionTop + 28 : sectionTop + SECTION_H - 28);
  const contentType = options.settings?.content_type ?? "logo";
  const customText = (options.settings?.custom_text ?? "").trim();
  const textSize = options.settings?.text_size ?? 15;

  if (contentType === "text" && customText && doc.splitTextToSize) {
    const textBold = options.settings?.text_bold !== false;
    doc.setFont(FONT_BODY, textBold ? "bold" : "normal");
    doc.setFontSize(textSize);
    const maxCenterW = COL_W - 8;
    const lines = doc.splitTextToSize(customText, maxCenterW);
    const lineHeight = textSize * 0.4;
    const startY = thanksCenterY - (lines.length * lineHeight) / 2;
    lines.forEach((line, i) => {
      doc.text(line, centerX, startY + i * lineHeight, { align: "center" });
    });
  } else if (options.logoBase64 && doc.addImage) {
    const zoom = Math.max(0.5, Math.min(options.settings?.logo_zoom ?? 1, 2));
    const ar = options.logoAspectRatio ?? 1;

    // Scale logo to fit within the fixed container, preserving aspect ratio
    let fitW = LOGO_MAX_W_MM;
    let fitH = fitW / ar;
    if (fitH > LOGO_MAX_H_MM) {
      fitH = LOGO_MAX_H_MM;
      fitW = fitH * ar;
    }

    // Apply zoom (expand/shrink from centre point)
    const drawW = fitW * zoom;
    const drawH = fitH * zoom;

    // Slot rectangle for clipping (fixed container centred on thanksCenterY)
    const slotX = centerX - LOGO_MAX_W_MM / 2;
    const slotY = thanksCenterY - LOGO_MAX_H_MM / 2;
    const drawX = centerX - drawW / 2;
    const drawY = thanksCenterY - drawH / 2;

    const needsClip =
      drawW > LOGO_MAX_W_MM || drawH > LOGO_MAX_H_MM;

    if (needsClip && doc.internal) {
      const k = doc.internal.scaleFactor;
      doc.internal.write("q");
      const rx = slotX * k;
      const ry = (A4_H - slotY - LOGO_MAX_H_MM) * k;
      const rw = LOGO_MAX_W_MM * k;
      const rh = LOGO_MAX_H_MM * k;
      doc.internal.write(
        `${rx.toFixed(2)} ${ry.toFixed(2)} ${rw.toFixed(2)} ${rh.toFixed(2)} re W n`
      );
    }

    doc.addImage(options.logoBase64, "PNG", drawX, drawY, drawW, drawH);

    if (needsClip && doc.internal) {
      doc.internal.write("Q");
    }
  }

  // TO — right column, higher so it’s the first focus (delivery address)
  doc.setFont(FONT_HEADING, textBold ? "bold" : "normal");
  doc.setFontSize(labelSize);
  doc.text("TO:", rightX, labelYTo);
  doc.setFont(FONT_BODY, textBold ? "bold" : "normal");
  doc.setFontSize(addressSize);
  const toLines = getAddressLines(doc, order.recipient_details ?? "", maxW);
  toLines.slice(0, MAX_ADDRESS_LINES).forEach((line, i) => {
    doc.text(line, rightX, addressStartYTo + i * lineHeightMm);
  });
}

function drawSectionBorder(
  doc: {
    setDrawColor: (r: number, g?: number, b?: number) => void;
    setLineWidth: (w: number) => void;
    setLineDashPattern: (dashArray: number[], dashPhase: number) => void;
    line: (x1: number, y1: number, x2: number, y2: number, style?: string) => void;
  },
  sectionTop: number
) {
  const left = MARGIN;
  const right = A4_W - MARGIN;
  const bottom = sectionTop + SECTION_H;

  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);

  // Solid left, top, right borders
  doc.setLineDashPattern([], 0);
  doc.line(left, sectionTop, left, bottom);
  doc.line(left, sectionTop, right, sectionTop);
  doc.line(right, sectionTop, right, bottom);

  // Dotted bottom line — "cut here" guide between orders
  doc.setLineDashPattern([2, 2], 0);
  doc.line(left, bottom, right, bottom);
  doc.setLineDashPattern([], 0); // restore solid for subsequent drawings
}

export async function downloadOrderPdf(order: Order) {
  if (typeof window === "undefined") {
    console.warn("[PDF] downloadOrderPdf called in SSR context");
    return;
  }
  console.log(`[PDF] downloadOrderPdf called for order: ${order.id}`);
  // If same order already downloaded, show "Already downloaded" and offer to view again
  if (lastPdfOrderId === order.id && lastPdfUri && lastPdfFilename) {
    showAlreadyDownloadedToast(lastPdfUri, lastPdfFilename);
    return;
  }
  try {
    const renderOptions = await fetchPdfSettingsForRendering(order.user_id);
    console.log(`[PDF] Creating jsPDF document...`);
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const d = doc as unknown as Parameters<typeof drawOrderLabel>[0] & Parameters<typeof drawSectionBorder>[0];
    console.log(`[PDF] Drawing ${SECTIONS_PER_PAGE} sections...`);
    for (let i = 0; i < SECTIONS_PER_PAGE; i++) {
      drawSectionBorder(d, i * SECTION_H);
      drawOrderLabel(d, order, i * SECTION_H, renderOptions);
    }
    const filename = buildTimestampedFilename("SareeOrder");
    console.log(`[PDF] Generating blob for filename: ${filename}`);
    const blob = doc.output("blob");
    console.log(`[PDF] Blob generated, size: ${blob.size} bytes`);
    const uri = await savePdfBlob(blob, filename);
    if (uri) {
      lastPdfOrderId = order.id;
      lastPdfUri = uri;
      lastPdfFilename = filename;
    }
  } catch (e) {
    console.error("[PDF] downloadOrderPdf failed:", e);
    throw e; // Re-throw so caller can handle
  }
}

export async function downloadOrdersPdf(orders: Order[]) {
  if (typeof window === "undefined") {
    console.warn("[PDF] downloadOrdersPdf called in SSR context");
    return;
  }
  if (orders.length === 0) {
    console.warn("[PDF] downloadOrdersPdf called with empty orders array");
    return;
  }
  console.log(`[PDF] downloadOrdersPdf called for ${orders.length} orders`);
  try {
    console.log(`[PDF] Creating jsPDF document...`);
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const d = doc as unknown as Parameters<typeof drawOrderLabel>[0] & Parameters<typeof drawSectionBorder>[0];
    let page = 0;
    let slot = 0;

    const userId = orders[0].user_id;
    const renderOptions = await fetchPdfSettingsForRendering(userId);
    console.log(`[PDF] Drawing ${orders.length} orders...`);
    for (let i = 0; i < orders.length; i++) {
      if (slot === 0 && page > 0) {
        console.log(`[PDF] Adding page ${page + 1}...`);
        doc.addPage([A4_W, A4_H], "p");
      }
      const sectionTop = slot * SECTION_H;
      drawSectionBorder(d, sectionTop);
      drawOrderLabel(d, orders[i], sectionTop, renderOptions);
      slot++;
      if (slot >= SECTIONS_PER_PAGE) {
        slot = 0;
        page++;
      }
    }

    while (slot > 0 && slot < SECTIONS_PER_PAGE) {
      drawSectionBorder(d, slot * SECTION_H);
      slot++;
    }

    const filename = buildTimestampedFilename("SareeOrders");
    console.log(`[PDF] Generating blob for filename: ${filename}`);
    const blob = doc.output("blob");
    console.log(`[PDF] Blob generated, size: ${blob.size} bytes, pages: ${page + 1}`);
    await savePdfBlob(blob, filename);
  } catch (e) {
    console.error("[PDF] downloadOrdersPdf failed:", e);
    throw e; // Re-throw so caller can handle
  }
}

export async function downloadBusinessReportPdf(
  orders: Order[],
  stats: ReportStats,
  userEmail?: string
) {
  if (typeof window === "undefined") return;
  try {
    const doc = new jsPDF();
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 20;
    let y = 20;

    // Header
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.text("Saree Order Sales Report", margin, y);
    y += 10;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Report Period: ${stats.periodLabel}`, margin, y);
    y += 6;
    doc.text(`From: ${new Date(stats.from).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}  |  To: ${new Date(stats.to).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`, margin, y);
    y += 6;
    doc.text(`Generated: ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}`, margin, y);
    if (userEmail) {
      y += 6;
      doc.text(`Account: ${userEmail}`, margin, y);
    }
    y += 12;

    // Summary section
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Executive Summary", margin, y);
    y += 8;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Total Orders (Booked): ${stats.totalOrders}`, margin, y);
    y += 6;
    doc.text(`Total Sarees Dispatched: ${stats.totalSarees}`, margin, y);
    y += 8;

    const ordersTrend = stats.ordersChangePercent >= 0 ? "increased" : "decreased";
    const sareesTrend = stats.sareesChangePercent >= 0 ? "increased" : "decreased";
    doc.text(`Compared to previous period: Orders ${ordersTrend} by ${Math.abs(stats.ordersChangePercent).toFixed(1)}%`, margin, y);
    y += 6;
    doc.text(`Sarees ${sareesTrend} by ${Math.abs(stats.sareesChangePercent).toFixed(1)}%`, margin, y);
    y += 14;

    // Order details table
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Order Details", margin, y);
    y += 4;

    const tableData = orders.map((o, i) => [
      String(i + 1),
      new Date(o.booking_date).toLocaleDateString("en-GB"),
      getAddressSummary(o.recipient_details, 35),
      getAddressSummary(o.sender_details, 35),
      o.quantity != null ? String(Number(o.quantity) || 1) : "-",
      o.courier_name || "-",
      o.status === "DESPATCHED" ? "Dispatched" : "Pending",
    ]);

    autoTable(doc, {
      startY: y,
      head: [["#", "Date", "Recipient", "Sender", "Qty", "Courier", "Status"]],
      body: tableData,
      theme: "grid",
      headStyles: { fillColor: [79, 70, 229], fontSize: 9 },
      bodyStyles: { fontSize: 8 },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      margin: { left: margin },
      tableLineColor: [200, 200, 200],
    });

    const d = doc as { lastAutoTable?: { finalY: number } };
    y = d.lastAutoTable?.finalY ?? y;
    y += 12;

    // Footer
    if (y > 260) {
      doc.addPage();
      y = 20;
    }
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.text("This is a computer-generated report for business records and audit purposes.", margin, y);
    y += 5;
    doc.text("Use for IT filing, GST records, or submission to auditor as supporting document.", margin, y);

    const filename = `saree-sales-report-${stats.from}-to-${stats.to}.pdf`;
    const blob = doc.output("blob");
    savePdfBlob(blob, filename);
  } catch (e) {
    console.error("PDF download failed:", e);
  }
}

// Make downloadBusinessReportPdf async (was sync, callers must await)
