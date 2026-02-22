"use client";

import React, { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { BentoCard } from "@/components/ui/BentoCard";
import { OrderListSkeleton } from "@/components/ui/SkeletonLoader";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { IconEdit, IconDispatch, IconUndo, IconPdf, IconTrash, IconWhatsApp } from "@/components/ui/OrderIcons";
import { downloadOrdersPdf } from "@/lib/pdf-utils";
import { useSearch } from "@/lib/search-context";
import {
  getOrders as svcGetOrders,
  deleteOrder as svcDeleteOrder,
  updateOrderStatus as svcUpdateOrderStatus,
} from "@/lib/order-service";
import type { Order, OrderStatus } from "@/lib/db-types";

function getAddressSummary(text: string, maxLen = 45): string {
  const first = (text || "").split(/\r?\n/)[0]?.trim() || text?.trim() || "";
  return first.length > maxLen ? `${first.slice(0, maxLen)}…` : first;
}

function getAddressLine1(text: string): string {
  return (text || "").split(/\r?\n/)[0]?.trim() || text?.trim() || "—";
}

export default function OrdersPage() {
  const { user, loading: authLoading } = useAuth();
  const { query, setQuery } = useSearch();
  const router = useRouter();
  const [status, setStatus] = useState<OrderStatus>("PENDING");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [allOrders, setAllOrders] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [pdfFallbackUrl, setPdfFallbackUrl] = useState<string | null>(null);
  const [dispatchOrder, setDispatchOrder] = useState<Order | null>(null);
  const [trackingNumber, setTrackingNumber] = useState("");
  const [dispatching, setDispatching] = useState(false);
  const trackingInputRef = useRef<HTMLInputElement>(null);

  const openWhatsAppForOrder = (order: Order) => {
    if (typeof window === "undefined") return;
    const booking = new Date(order.booking_date).toLocaleDateString("en-GB");
    const despatch =
      order.despatch_date != null
        ? new Date(order.despatch_date).toLocaleDateString("en-GB")
        : "Not dispatched";
    const qty =
      order.quantity != null && Number(order.quantity) >= 1
        ? String(Number(order.quantity))
        : "1";

    const nameLine = (order.recipient_details || "").split(/\r?\n/)[0]?.trim() || "";
    const staffName = (order.booked_by || "").trim() || "-";

    const mobile = (order.booked_mobile_no || "").trim() || "-";

    const lines = [
      "Thanks for ordering with us",
      "Keep purchase with us",
      "",
      nameLine,
      "",
      `Booked by: ${staffName}`,
      `Quantity: ${qty}`,
      `Booked date: ${booking}`,
      `Booked mobile number: ${mobile}`,
      `Courier name: ${order.courier_name || "N/A"}`,
      `Dispatched date: ${despatch}`,
    ];

    const message = encodeURIComponent(lines.join("\n"));
    const url = `https://wa.me/?text=${message}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login/");
  }, [user, authLoading, router]);

  const fetchOrders = React.useCallback(async () => {
    if (!user) return;
    setError(null);
    setLoading(true);
    try {
      const filters = { status, fromDate, toDate, allOrders };
      const cached = await svcGetOrders(user.id, filters, (fresh) => {
        setOrders(fresh);
      });
      setOrders(cached);
    } catch (e) {
      setError((e as Error).message || "Failed to load orders");
    } finally {
      setLoading(false);
    }
  }, [user, status, allOrders, fromDate, toDate]);

  const filteredOrders = React.useMemo(() => {
    let list = orders.filter((o) => o.status === status);
    const raw = query.trim();
    if (!raw) return list;
    const q = raw.toLowerCase();
    const digitsOnly = raw.replace(/\D/g, "");
    return list.filter((o) => {
      if (o.id && o.id.toLowerCase().includes(q)) return true;
      if (o.booked_by && (o.booked_by as string).toLowerCase().includes(q)) return true;
      if (o.recipient_details && (o.recipient_details as string).toLowerCase().includes(q)) return true;
      if (o.sender_details && (o.sender_details as string).toLowerCase().includes(q)) return true;
      if (digitsOnly.length >= 4 && o.booked_mobile_no) {
        const mobileDigits = (o.booked_mobile_no as string).replace(/\D/g, "");
        if (mobileDigits.includes(digitsOnly) || digitsOnly.includes(mobileDigits)) return true;
      }
      if (o.booked_mobile_no && (o.booked_mobile_no as string).toLowerCase().includes(q)) return true;
      return false;
    });
  }, [orders, query, status]);

  useEffect(() => {
    if (user) fetchOrders();
  }, [user, fetchOrders]);

  const handleDelete = async (id: string) => {
    if (!user) return;
    if (!confirm("Delete this order?")) return;
    try {
      await svcDeleteOrder(user.id, id);
      setOrders((prev) => prev.filter((o) => o.id !== id));
    } catch (e) {
      setError((e as Error).message || "Delete failed");
    }
  };

  const handleMarkAsDespatched = (order: Order) => {
    if (!user || order.status !== "PENDING") return;
    setDispatchOrder(order);
    setTrackingNumber("");
    setTimeout(() => trackingInputRef.current?.focus(), 100);
  };

  const confirmDispatch = async () => {
    if (!user || !dispatchOrder) return;
    setDispatching(true);
    const today = new Date().toISOString().slice(0, 10);
    const tn = trackingNumber.trim() || null;
    try {
      await svcUpdateOrderStatus(user.id, dispatchOrder.id, "DESPATCHED", today, tn);
      setOrders((prev) => prev.filter((o) => o.id !== dispatchOrder.id));
      setDispatchOrder(null);
    } catch (e) {
      setError((e as Error).message || "Failed to mark as despatched");
    } finally {
      setDispatching(false);
    }
  };

  const handleMoveToPending = async (order: Order) => {
    if (!user || order.status !== "DESPATCHED") return;
    if (!confirm("Move this order back to Pending?")) return;
    try {
      await svcUpdateOrderStatus(user.id, order.id, "PENDING", null);
      setOrders((prev) => prev.filter((o) => o.id !== order.id));
    } catch (e) {
      setError((e as Error).message || "Failed to move to pending");
    }
  };

  if (authLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-4 lg:px-10 lg:py-6">
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 lg:text-2xl">
          Booking Details
        </h1>

        <div className="flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900 md:gap-3 md:px-4 md:py-3">
          <svg className="h-4 w-4 shrink-0 text-gray-400 md:h-5 md:w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="search"
            placeholder="Search by mobile, name or consignment..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="min-h-[44px] flex-1 rounded-xl border-0 bg-transparent px-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-0 dark:text-slate-100 dark:placeholder-slate-400 md:min-h-[48px] md:text-base"
            aria-label="Search orders by mobile, name or consignment"
          />
        </div>

        <BentoCard>
          <div className="space-y-4">
            <div className="flex gap-2">
              <button
                onClick={() => setStatus("PENDING")}
                className={`min-h-touch flex-1 rounded-bento px-4 font-medium ${
                  status === "PENDING" ? "bg-primary-500 text-white" : "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200"
                }`}
              >
                PENDING
              </button>
              <button
                onClick={() => setStatus("DESPATCHED")}
                className={`min-h-touch flex-1 rounded-bento px-4 font-medium ${
                  status === "DESPATCHED" ? "bg-primary-500 text-white" : "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200"
                }`}
              >
                DISPATCHED
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-300">
                  {status === "PENDING" ? "Booking From date" : "Dispatch From date"}
                </label>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="w-full rounded-bento border border-gray-300 px-4 py-2 text-gray-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-300">
                  {status === "PENDING" ? "Booking To date" : "Dispatch To date"}
                </label>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="w-full rounded-bento border border-gray-300 px-4 py-2 text-gray-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
            </div>

            <label className="flex min-h-touch items-center gap-2 text-gray-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={allOrders}
                onChange={(e) => setAllOrders(e.target.checked)}
                className="h-5 w-5 rounded"
              />
              <span>All Orders</span>
            </label>

            <button
              onClick={fetchOrders}
              className="w-full min-h-touch rounded-bento bg-primary-500 font-semibold text-white hover:bg-primary-600"
            >
              Show Result
            </button>
          </div>
        </BentoCard>

        {error && (
          <p className="rounded-bento bg-red-50 p-3 text-red-700 dark:bg-red-900/30 dark:text-red-300">
            {error}
          </p>
        )}

        {loading ? (
          <OrderListSkeleton />
        ) : (
          <div className="space-y-4">
            {filteredOrders.length === 0 ? (
              <BentoCard>
                <p className="text-center text-slate-500 dark:text-slate-400">
                  {orders.length === 0 ? "No orders found." : "No matching orders."}
                </p>
              </BentoCard>
            ) : (
              filteredOrders.map((order, i) => (
                <BentoCard key={order.id} className="flex items-center justify-between gap-4 py-4">
                  <div className="flex min-w-0 flex-1 items-center gap-4">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-sm font-semibold text-primary-600 dark:bg-primary-900/50 dark:text-primary-300">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="truncate text-sm font-medium text-gray-900 dark:text-slate-100 lg:text-base">
                        {getAddressSummary(order.recipient_details)}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-gray-500 dark:text-slate-400">
                        {order.booked_by?.trim() ? (
                          <span>Booked By ({order.booked_by.trim()})</span>
                        ) : null}
                        <span className="tabular-nums">
                          {new Date(order.booking_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" })}
                        </span>
                        {(order.quantity != null && Number(order.quantity) >= 1) && (
                          <span>Qty: {Number(order.quantity)}</span>
                        )}
                        {order.status === "DESPATCHED" && (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                            Dispatched
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Link
                      href={`/edit-order/?id=${order.id}`}
                      className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-gray-100 text-gray-600 transition hover:bg-primary-100 hover:text-primary-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-primary-900/50 dark:hover:text-primary-300"
                      title="Edit"
                    >
                      <IconEdit className="h-5 w-5" />
                    </Link>
                    {order.status === "PENDING" && (
                      <button
                        onClick={() => handleMarkAsDespatched(order)}
                        className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-emerald-100 text-emerald-600 transition hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:hover:bg-emerald-900/60"
                        title="Dispatch"
                      >
                        <IconDispatch className="h-5 w-5" />
                      </button>
                    )}
                    {order.status === "DESPATCHED" && (
                      <>
                        <button
                          onClick={() => handleMoveToPending(order)}
                          className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-amber-100 text-amber-600 transition hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:hover:bg-amber-900/60"
                          title="Move to Pending"
                        >
                          <IconUndo className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() => handleDelete(order.id)}
                          className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-red-50 text-red-600 transition hover:bg-red-100 dark:bg-red-900/30 dark:text-red-300 dark:hover:bg-red-900/50"
                          title="Delete"
                        >
                          <IconTrash className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() => openWhatsAppForOrder(order)}
                          className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-green-100 text-green-600 transition hover:bg-green-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:hover:bg-emerald-900/60"
                          title="Share via WhatsApp"
                        >
                          <IconWhatsApp className="h-5 w-5" />
                        </button>
                      </>
                    )}
                    {order.status !== "DESPATCHED" && (
                      <button
                        onClick={() => handleDelete(order.id)}
                        className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-red-50 text-red-600 transition hover:bg-red-100 dark:bg-red-900/30 dark:text-red-300 dark:hover:bg-red-900/50"
                        title="Delete"
                      >
                        <IconTrash className="h-5 w-5" />
                      </button>
                    )}
                  </div>
                </BentoCard>
              ))
            )}
          </div>
        )}

        <div className="fixed bottom-24 right-4 z-50 flex flex-col items-end gap-2 md:bottom-8 md:right-8">
          <button
            type="button"
            onClick={async () => {
              if (filteredOrders.length === 0 || downloadingPdf) {
                console.log("[Orders] PDF button clicked but disabled (no orders or already downloading)");
                return;
              }
              console.log(`[Orders] PDF button clicked, generating PDF for ${filteredOrders.length} orders`);
              setPdfFallbackUrl(null);
              setDownloadingPdf(true);
              try {
                console.log("[Orders] Calling downloadOrdersPdf...");
                await downloadOrdersPdf(filteredOrders);
                console.log("[Orders] PDF download completed successfully");
              } catch (e) {
                console.error("[Orders] PDF download failed:", e);
                const errorMsg = e instanceof Error ? e.message : "Unknown error";
                alert(`Failed to generate PDF: ${errorMsg}\n\nCheck browser console for details.`);
              } finally {
                setDownloadingPdf(false);
                console.log("[Orders] PDF download state reset");
              }
            }}
            disabled={filteredOrders.length === 0 || downloadingPdf}
            className="flex min-h-[48px] min-w-[48px] items-center gap-2 rounded-xl bg-primary-500 px-4 py-3 text-white shadow-lg transition active:bg-primary-600 hover:bg-primary-600 disabled:opacity-50"
            title="Download all as PDF"
          >
            <IconPdf className="h-5 w-5 shrink-0 md:h-6 md:w-6" />
            <span className="text-sm font-medium">
              {downloadingPdf ? "Generating…" : "PDF"}
            </span>
          </button>
          {pdfFallbackUrl && (
            <a
              href={pdfFallbackUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-bento bg-white/90 px-3 py-1 text-xs font-medium text-primary-700 shadow-sm dark:bg-slate-800/90 dark:text-primary-300"
            >
              If download didn&apos;t start, tap here and long‑press to save.
            </a>
          )}
        </div>
      </div>

      {/* ── Dispatch confirmation modal ── */}
      {dispatchOrder && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-4"
          onClick={(e) => { if (e.target === e.currentTarget && !dispatching) setDispatchOrder(null); }}
        >
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-xl dark:border-slate-600 dark:bg-slate-800">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Move to Dispatch</h2>

            <div className="mt-3 rounded-xl bg-gray-50 px-4 py-3 dark:bg-slate-700">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Recipient (To)</p>
              <p className="mt-1 text-sm font-medium text-slate-800 dark:text-slate-200">
                {getAddressLine1(dispatchOrder.recipient_details)}
              </p>
            </div>

            <div className="mt-4">
              <label htmlFor="tracking-number" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                Tracking / Consignment / LR Number <span className="text-slate-400">(optional)</span>
              </label>
              <input
                id="tracking-number"
                ref={trackingInputRef}
                type="text"
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
                placeholder="e.g. PRO123456789"
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:placeholder-slate-500"
                onKeyDown={(e) => { if (e.key === "Enter" && !dispatching) confirmDispatch(); }}
              />
            </div>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setDispatchOrder(null)}
                disabled={dispatching}
                className="flex-1 min-h-[44px] rounded-xl border border-gray-200 bg-white font-medium text-slate-700 hover:bg-gray-50 active:bg-gray-100 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDispatch}
                disabled={dispatching}
                className="flex-1 min-h-[44px] rounded-xl bg-emerald-600 font-semibold text-white shadow-sm hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50"
              >
                {dispatching ? "Dispatching…" : "Dispatch"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ErrorBoundary>
  );
}
