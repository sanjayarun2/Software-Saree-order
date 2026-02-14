"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { BentoCard } from "@/components/ui/BentoCard";
import { OrderListSkeleton } from "@/components/ui/SkeletonLoader";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { IconEdit, IconDispatch, IconUndo, IconPdf, IconTrash } from "@/components/ui/OrderIcons";
import { downloadOrderPdf, downloadOrdersPdf } from "@/lib/pdf-utils";
import { useSearch } from "@/lib/search-context";
import { getCachedOrders, setCachedOrders } from "@/lib/orders-cache";
import type { Order, OrderStatus } from "@/lib/db-types";

function getAddressSummary(text: string, maxLen = 45): string {
  const first = (text || "").split(/\r?\n/)[0]?.trim() || text?.trim() || "";
  return first.length > maxLen ? `${first.slice(0, maxLen)}…` : first;
}

export default function OrdersPage() {
  const { user, loading: authLoading } = useAuth();
  const { query } = useSearch();
  const router = useRouter();
  const [status, setStatus] = useState<OrderStatus>("PENDING");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [allOrders, setAllOrders] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    // Ensure only orders matching current tab (PENDING/DISPATCHED) are shown
    let list = orders.filter((o) => o.status === status);
    if (!query.trim()) return list;
    const q = query.trim().toLowerCase();
    return list.filter(
      (o) =>
        (o.recipient_details || "").toLowerCase().includes(q) ||
        (o.sender_details || "").toLowerCase().includes(q)
    );
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

        <BentoCard>
          <div className="space-y-4">
            <div className="flex gap-2">
              <button
                onClick={() => setStatus("PENDING")}
                className={`min-h-touch flex-1 rounded-bento px-4 font-medium ${
                  status === "PENDING" ? "bg-primary-500 text-white" : "bg-slate-100 dark:bg-slate-700"
                }`}
              >
                PENDING
              </button>
              <button
                onClick={() => setStatus("DESPATCHED")}
                className={`min-h-touch flex-1 rounded-bento px-4 font-medium ${
                  status === "DESPATCHED" ? "bg-primary-500 text-white" : "bg-slate-100 dark:bg-slate-700"
                }`}
              >
                DISPATCHED
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium">
                  {status === "PENDING" ? "Booking From date" : "Dispatch From date"}
                </label>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="w-full rounded-bento border px-4 py-2 dark:border-slate-600 dark:bg-slate-800"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">
                  {status === "PENDING" ? "Booking To date" : "Dispatch To date"}
                </label>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="w-full rounded-bento border px-4 py-2 dark:border-slate-600 dark:bg-slate-800"
                />
              </div>
            </div>

            <label className="flex min-h-touch items-center gap-2">
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
                <p className="text-center text-slate-500">
                  {orders.length === 0 ? "No orders found." : "No matching orders."}
                </p>
              </BentoCard>
            ) : (
              filteredOrders.map((order, i) => (
                <BentoCard key={order.id} className="flex items-center justify-between gap-4 py-4">
                  <div className="flex min-w-0 flex-1 items-center gap-4">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-sm font-semibold text-primary-600">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="truncate text-sm font-medium text-gray-900 lg:text-base">
                        {getAddressSummary(order.recipient_details)}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-gray-500">
                        <span className="tabular-nums">
                          {new Date(order.booking_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" })}
                        </span>
                        {(order.quantity != null && Number(order.quantity) >= 1) && (
                          <span>Qty: {Number(order.quantity)}</span>
                        )}
                        {order.status === "DESPATCHED" && (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                            Dispatched
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Link
                      href={`/edit-order/?id=${order.id}`}
                      className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-gray-100 text-gray-600 transition hover:bg-primary-100 hover:text-primary-600"
                      title="Edit"
                    >
                      <IconEdit className="h-5 w-5" />
                    </Link>
                    {order.status === "PENDING" && (
                      <button
                        onClick={() => handleMarkAsDespatched(order)}
                        className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-emerald-100 text-emerald-600 transition hover:bg-emerald-200"
                        title="Dispatch"
                      >
                        <IconDispatch className="h-5 w-5" />
                      </button>
                    )}
                    {order.status === "DESPATCHED" && (
                      <button
                        onClick={() => handleMoveToPending(order)}
                        className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-amber-100 text-amber-600 transition hover:bg-amber-200"
                        title="Move to Pending"
                      >
                        <IconUndo className="h-5 w-5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => downloadOrderPdf(order)}
                      className="flex h-10 min-w-[44px] items-center justify-center gap-1.5 rounded-[12px] bg-gray-100 px-2 text-gray-600 transition hover:bg-gray-200"
                      title="Download PDF"
                    >
                      <IconPdf className="h-5 w-5 shrink-0" />
                      <span className="text-xs font-medium">PDF</span>
                    </button>
                    <button
                      onClick={() => handleDelete(order.id)}
                      className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-red-50 text-red-600 transition hover:bg-red-100"
                      title="Delete"
                    >
                      <IconTrash className="h-5 w-5" />
                    </button>
                  </div>
                </BentoCard>
              ))
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => downloadOrdersPdf(filteredOrders)}
          disabled={filteredOrders.length === 0}
          className="fixed bottom-24 right-4 z-50 flex min-h-[48px] min-w-[48px] items-center gap-2 rounded-xl bg-primary-500 px-4 py-3 text-white shadow-lg transition active:bg-primary-600 hover:bg-primary-600 disabled:opacity-50 md:bottom-8 md:right-8"
          title="Download all as PDF"
        >
          <IconPdf className="h-5 w-5 shrink-0 md:h-6 md:w-6" />
          <span className="text-sm font-medium">PDF</span>
        </button>
      </div>
    </ErrorBoundary>
  );
}
