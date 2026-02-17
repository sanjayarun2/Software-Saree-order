import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { Order } from "./db-types";

/** Force direct download to device: hidden <a download> with Blob URL (web & mobile browsers). */
function forceDownloadPdf(blob: Blob, filename: string): void {
  if (typeof window === "undefined") return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  // Use a direct click in the same user-gesture to avoid popup blockers.
  a.click();
  document.body.removeChild(a);
  // Delay revocation slightly so mobile browsers have time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

export async function savePdfBlob(blob: Blob, filename: string): Promise<void> {
  if (typeof window === "undefined") return;
  // Single, robust path for all environments (web, mobile browsers, and WebView):
  // let the browser / WebView handle the download via <a download>.
  // If that fails for any reason, fall back to navigating to the blob URL (preview),
  // so the user can still share/save from the viewer.
  try {
    forceDownloadPdf(blob, filename);
  } catch {
    const fallbackUrl = URL.createObjectURL(blob);
    window.location.href = fallbackUrl;
    // We do not revoke the URL immediately here; the browser will handle it
    // when the page is unloaded.
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
const SIZE_LABEL = 12;       // TO / FROM labels
const SIZE_ADDRESS = 11;     // address lines (large for parcel)
const SIZE_THANKS_TITLE = 13;
const SIZE_THANKS_SUB = 10;
const LINE_HEIGHT_ADDRESS = 5.5;
const MAX_ADDRESS_LINES = 7;

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

function drawOrderLabel(
  doc: { setFont: (f: string, s: string) => void; setFontSize: (n: number) => void; text: (s: string, x: number, y: number, o?: { align?: string }) => void; splitTextToSize: (s: string, w: number) => string[] },
  order: Order,
  sectionTop: number
) {
  const leftX = MARGIN;
  const centerColStart = MARGIN + COL_W + MARGIN;
  const centerX = centerColStart + COL_W / 2;
  const rightX = MARGIN + (COL_W + MARGIN) * 2;
  const maxW = COL_W - 4;
  const labelY = sectionTop + 8;
  const addressStartY = sectionTop + 14;

  // TO (Recipient) — larger text, aligned for parcel
  doc.setFont(FONT_HEADING, "bold");
  doc.setFontSize(SIZE_LABEL);
  doc.text("TO (Recipient)", leftX, labelY);
  doc.setFont(FONT_BODY, "normal");
  doc.setFontSize(SIZE_ADDRESS);
  const toLines = getAddressLines(doc, order.recipient_details ?? "", maxW);
  toLines.slice(0, MAX_ADDRESS_LINES).forEach((line, i) => {
    doc.text(line, leftX, addressStartY + i * LINE_HEIGHT_ADDRESS);
  });

  // Thanks for purchasing — modern, centred, professional
  const thanksCenterY = sectionTop + SECTION_H / 2;
  doc.setFont(FONT_HEADING, "bold");
  doc.setFontSize(SIZE_THANKS_TITLE);
  doc.text("Thanks for purchasing", centerX, thanksCenterY - 6, { align: "center" });
  doc.setFont(FONT_BODY, "normal");
  doc.setFontSize(SIZE_THANKS_SUB);
  doc.text("We appreciate your trust.", centerX, thanksCenterY + 6, { align: "center" });

  // FROM (Ours) — same large alignment as TO
  doc.setFont(FONT_HEADING, "bold");
  doc.setFontSize(SIZE_LABEL);
  doc.text("FROM (Ours)", rightX, labelY);
  doc.setFont(FONT_BODY, "normal");
  doc.setFontSize(SIZE_ADDRESS);
  const fromLines = getAddressLines(doc, order.sender_details ?? "", maxW);
  fromLines.slice(0, MAX_ADDRESS_LINES).forEach((line, i) => {
    doc.text(line, rightX, addressStartY + i * LINE_HEIGHT_ADDRESS);
  });
}

function drawSectionBorder(
  doc: { setDrawColor: (r: number, g?: number, b?: number) => void; setLineWidth: (w: number) => void; rect: (x: number, y: number, w: number, h: number) => void },
  sectionTop: number
) {
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.rect(MARGIN, sectionTop, A4_W - MARGIN * 2, SECTION_H);
}

export async function downloadOrderPdf(order: Order) {
  if (typeof window === "undefined") return;
  try {
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const d = doc as Parameters<typeof drawOrderLabel>[0] & Parameters<typeof drawSectionBorder>[0];
    for (let i = 0; i < SECTIONS_PER_PAGE; i++) {
      drawSectionBorder(d, i * SECTION_H);
      drawOrderLabel(d, order, i * SECTION_H);
    }
    const filename = `saree-order-${new Date(order.booking_date).toISOString().slice(0, 10)}.pdf`;
    const blob = doc.output("blob");
    savePdfBlob(blob, filename);
  } catch (e) {
    console.error("PDF download failed:", e);
  }
}

export async function downloadOrdersPdf(orders: Order[]) {
  if (typeof window === "undefined" || orders.length === 0) return;
  try {
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const d = doc as Parameters<typeof drawOrderLabel>[0] & Parameters<typeof drawSectionBorder>[0];
    let page = 0;
    let slot = 0;

    for (let i = 0; i < orders.length; i++) {
      if (slot === 0 && page > 0) doc.addPage([A4_W, A4_H], "p");
      const sectionTop = slot * SECTION_H;
      drawSectionBorder(d, sectionTop);
      drawOrderLabel(d, orders[i], sectionTop);
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

    const filename = `saree-orders-${new Date().toISOString().slice(0, 10)}.pdf`;
    const blob = doc.output("blob");
    savePdfBlob(blob, filename);
  } catch (e) {
    console.error("PDF download failed:", e);
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
