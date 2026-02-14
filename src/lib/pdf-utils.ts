import type { Order } from "./db-types";

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

export function downloadOrderPdf(order: Order) {
  if (typeof window === "undefined") return;
  import("jspdf").then(({ default: jsPDF }) => {
    const doc = new jsPDF();
    const yStart = 20;
    let y = yStart;

    doc.setFontSize(18);
    doc.text("Order Details", 20, y);
    y += 12;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Booking: ${new Date(order.booking_date).toLocaleDateString("en-GB")}`, 20, y);
    y += 7;
    if (order.status === "DESPATCHED" && order.despatch_date) {
      doc.text(`Dispatched: ${new Date(order.despatch_date).toLocaleDateString("en-GB")}`, 20, y);
      y += 7;
    }
    if (order.quantity != null) {
      doc.text(`Qty: ${order.quantity}`, 20, y);
      y += 7;
    }
    y += 3;

    doc.setFont("helvetica", "bold");
    doc.text("TO (Recipient):", 20, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    const toLines = doc.splitTextToSize(order.recipient_details || "-", 170);
    doc.text(toLines, 20, y);
    y += toLines.length * 5 + 5;

    doc.setFont("helvetica", "bold");
    doc.text("FROM (Sender):", 20, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    const fromLines = doc.splitTextToSize(order.sender_details || "-", 170);
    doc.text(fromLines, 20, y);
    y += fromLines.length * 5 + 5;

    doc.text(`Booked By: ${order.booked_by || "-"}`, 20, y);
    y += 6;
    doc.text(`Mobile: ${order.booked_mobile_no || "-"}`, 20, y);
    y += 6;
    doc.text(`Courier: ${order.courier_name || "-"}`, 20, y);

    doc.save(`order-${new Date(order.booking_date).toISOString().slice(0, 10)}.pdf`);
  });
}

export function downloadOrdersPdf(orders: Order[]) {
  if (typeof window === "undefined" || orders.length === 0) return;
  import("jspdf").then(({ default: jsPDF }) => {
    const doc = new jsPDF();
    let y = 20;

    doc.setFontSize(16);
    doc.text("Orders Report", 20, y);
    y += 10;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");

    for (let i = 0; i < orders.length; i++) {
      const o = orders[i];
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
      doc.setFont("helvetica", "bold");
      doc.text(`${i + 1}. ${getAddressSummary(o.recipient_details)}`, 20, y);
      y += 6;
      doc.setFont("helvetica", "normal");
      doc.text(`   Booking: ${new Date(o.booking_date).toLocaleDateString("en-GB")} | ${o.status} | Courier: ${o.courier_name}`, 20, y);
      y += 8;
    }

    doc.save(`orders-report-${new Date().toISOString().slice(0, 10)}.pdf`);
  });
}

export function downloadBusinessReportPdf(
  orders: Order[],
  stats: ReportStats,
  userEmail?: string
) {
  if (typeof window === "undefined") return;
  Promise.all([import("jspdf"), import("jspdf-autotable")]).then(([{ default: jsPDF }, { autoTable }]) => {
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
      o.quantity != null && o.quantity !== "" ? String(Number(o.quantity) || 1) : "-",
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
    doc.save(filename);
  });
}
