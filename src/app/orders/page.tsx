"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { BentoCard } from "@/components/ui/BentoCard";
import { OrderListSkeleton } from "@/components/ui/SkeletonLoader";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { IconEdit, IconDispatch, IconUndo, IconPdf, IconTrash, IconWhatsApp } from "@/components/ui/OrderIcons";
import { downloadOrdersPdf } from "@/lib/pdf-utils";
import { useSearch } from "@/lib/search-context";
import { getCachedOrders, setCachedOrders } from "@/lib/orders-cache";
import type { Order, OrderStatus } from "@/lib/db-types";

function getAddressSummary(text: string, maxLen = 45): string {
  const first = (text || "").split(/\r?\n/)[0]?.trim() || text?.trim() || "";
  return first.length > maxLen ? `${first.slice(0, maxLen)}…` : first;
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

    const lines = [
      "Thanks for order, keep purhcase with us",
      nameLine,
      `Booked by: ${staffName}, ${booking}`,
      `Courier name: ${order.courier_name || "N/A"}`,
      `Qty: ${qty}`,
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
    // Cache-first: load from cache immediately
    let cached: Order[] | null = null;
    try {
      cached = getCachedOrders(user.id, status, fromDate, toDate, allOrders) as Order[] | null;
      if (cached && Array.isArray(cached)) {
        setOrders(cached);
      }
    } catch {
      // Ignore cache errors
    }
    setLoading(true);
    try {
      const dateColumn = status === "PENDING" ? "booking_date" : "despatch_date";
      let query = supabase
        .from("orders")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", status)
        .order("created_at", { ascending: false });

      if (!allOrders && fromDate && toDate) {
        query = query
          .gte(dateColumn, fromDate)
          .lte(dateColumn, toDate);
      }

      const { data, error: err } = await query;
      if (err) throw err;
      const list = (data as Order[]) ?? [];
      setOrders(list);
      setCachedOrders(user.id, status, fromDate, toDate, allOrders, list);
    } catch (e) {
      setError((e as Error).message || "Failed to load orders");
      if (!cached?.length) setOrders([]);
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
    if (!confirm("Delete this order?")) return;
    try {
      const { error: err } = await supabase.from("orders").delete().eq("id", id);
      if (err) throw err;
      setOrders((prev) => prev.filter((o) => o.id !== id));
    } catch (e) {
      setError((e as Error).message || "Delete failed");
    }
  };

  const handleMarkAsDespatched = async (order: Order) => {
    if (order.status !== "PENDING") return;
    const today = new Date().toISOString().slice(0, 10);
    try {
      const { error: err } = await supabase
        .from("orders")
        .update({ status: "DESPATCHED", despatch_date: today, updated_at: new Date().toISOString() })
        .eq("id", order.id);
      if (err) throw err;
      setOrders((prev) => prev.filter((o) => o.id !== order.id));
    } catch (e) {
      setError((e as Error).message || "Failed to mark as despatched");
    }
  };

  const handleMoveToPending = async (order: Order) => {
    if (order.status !== "DESPATCHED") return;
    if (!confirm("Move this order back to Pending?")) return;
    try {
      const { error: err } = await supabase
        .from("orders")
        .update({ status: "PENDING", despatch_date: null, updated_at: new Date().toISOString() })
        .eq("id", order.id);
      if (err) throw err;
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

        <button
          type="button"
          onClick={async () => {
            if (filteredOrders.length === 0 || downloadingPdf) return;
            setDownloadingPdf(true);
            try {
              await downloadOrdersPdf(filteredOrders);
            } catch (e) {
              console.error("PDF download failed:", e);
              alert("Failed to generate PDF. Please try again.");
            } finally {
              setDownloadingPdf(false);
            }
          }}
          disabled={filteredOrders.length === 0 || downloadingPdf}
          className="fixed bottom-24 right-4 z-50 flex min-h-[48px] min-w-[48px] items-center gap-2 rounded-xl bg-primary-500 px-4 py-3 text-white shadow-lg transition active:bg-primary-600 hover:bg-primary-600 disabled:opacity-50 md:bottom-8 md:right-8"
          title="Download all as PDF"
        >
          <IconPdf className="h-5 w-5 shrink-0 md:h-6 md:w-6" />
          <span className="text-sm font-medium">
            {downloadingPdf ? "Generating…" : "PDF"}
          </span>
        </button>
      </div>
    </ErrorBoundary>
  );
}
