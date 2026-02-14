import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { Order } from "./db-types";

async function savePdfNative(blob: Blob, filename: string): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return false;
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const { Share } = await import("@capacitor/share");
    const reader = new FileReader();
    const base64 = await new Promise<string>((res, rej) => {
      reader.onload = () => {
        const data = (reader.result as string) || "";
        res(data.includes(",") ? data.split(",")[1] ?? "" : data);
      };
      reader.onerror = rej;
      reader.readAsDataURL(blob);
    });
    const path = `saree-pdf-${Date.now()}.pdf`;
    await Filesystem.writeFile({
      path,
      data: base64,
      directory: Directory.Cache,
    });
    const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache });
    await Share.share({
      title: filename.replace(/\.pdf$/i, ""),
      text: "Saree order PDF",
      url: uri,
      dialogTitle: "Share PDF",
    });
    try {
      await Filesystem.deleteFile({ path, directory: Directory.Cache });
    } catch {
      /* ignore */
    }
    return true;
  } catch {
    return false;
  }
}

function savePdfWeb(doc: jsPDF, filename: string): void {
  doc.save(filename);
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

// A4: 210mm x 297mm. Divide height into 4 sections for pasting labels.
const A4_W = 210;
const A4_H = 297;
const SECTIONS_PER_PAGE = 4;
const SECTION_H = A4_H / SECTIONS_PER_PAGE;
const MARGIN = 8;
const COL_W = (A4_W - MARGIN * 4) / 3; // 3 columns: TO | Thanks | FROM

function drawOrderLabel(
  doc: { setFont: (f: string, s: string) => void; setFontSize: (n: number) => void; text: (s: string, x: number, y: number, o?: { align?: string }) => void; splitTextToSize: (s: string, w: number) => string[] },
  order: Order,
  sectionTop: number
) {
  const leftX = MARGIN;
  const centerX = MARGIN + COL_W + MARGIN;
  const rightX = MARGIN + (COL_W + MARGIN) * 2;
  const maxW = COL_W - 4;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("TO (Recipient)", leftX, sectionTop + 6);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  const toLines = doc.splitTextToSize(order.recipient_details || "-", maxW);
  toLines.slice(0, 6).forEach((line, i) => doc.text(line, leftX, sectionTop + 12 + i * 4));

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Thanks for your order!", centerX + COL_W / 2, sectionTop + SECTION_H / 2 - 4, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("We appreciate your trust.", centerX + COL_W / 2, sectionTop + SECTION_H / 2 + 4, { align: "center" });
  doc.text(`Date: ${new Date(order.booking_date).toLocaleDateString("en-GB")}`, centerX + COL_W / 2, sectionTop + SECTION_H / 2 + 12, { align: "center" });
  if (order.quantity != null) {
    doc.text(`Qty: ${order.quantity}`, centerX + COL_W / 2, sectionTop + SECTION_H / 2 + 20, { align: "center" });
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("FROM (Ours)", rightX, sectionTop + 6);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  const fromLines = doc.splitTextToSize(order.sender_details || "-", maxW);
  fromLines.slice(0, 6).forEach((line, i) => doc.text(line, rightX, sectionTop + 12 + i * 4));
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
    const shared = await savePdfNative(blob, filename);
    if (!shared) savePdfWeb(doc, filename);
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
    const shared = await savePdfNative(blob, filename);
    if (!shared) savePdfWeb(doc, filename);
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
    const shared = await savePdfNative(blob, filename);
    if (!shared) savePdfWeb(doc, filename);
  } catch (e) {
    console.error("PDF download failed:", e);
  }
}

// Make downloadBusinessReportPdf async (was sync, callers must await)
