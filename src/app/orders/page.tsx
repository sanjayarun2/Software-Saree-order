"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { BentoCard } from "@/components/ui/BentoCard";
import { OrderListSkeleton } from "@/components/ui/SkeletonLoader";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import type { Order, OrderStatus } from "@/lib/db-types";

export default function OrdersPage() {
  const { user, loading: authLoading } = useAuth();
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
    setLoading(true);
    setError(null);
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
      setOrders((data as Order[]) ?? []);
    } catch (e) {
      setError((e as Error).message || "Failed to load orders");
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [user, status, allOrders, fromDate, toDate]);

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
      <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
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
                DESPATCHED
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium">
                  {status === "PENDING" ? "Booking From date" : "Despatch From date"}
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
                  {status === "PENDING" ? "Booking To date" : "Despatch To date"}
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
            {orders.length === 0 ? (
              <BentoCard>
                <p className="text-center text-slate-500">No orders found.</p>
              </BentoCard>
            ) : (
              orders.map((order, i) => (
                <BentoCard key={order.id} className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex min-w-0 flex-1 items-center gap-4">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-100 font-medium text-primary-600 dark:bg-primary-900 dark:text-primary-300">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">
                        Booking: {new Date(order.booking_date).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                      </p>
                      {order.status === "DESPATCHED" && order.despatch_date && (
                        <p className="text-xs text-slate-500">
                          Despatched: {new Date(order.despatch_date).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                        </p>
                      )}
                      <p className="truncate text-sm text-slate-500">TO: {order.recipient_details}</p>
                      <p className="truncate text-sm text-slate-500">FROM: {order.sender_details}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Link
                      href={`/edit-order/?id=${order.id}`}
                      className="flex min-h-touch min-w-touch items-center justify-center rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                      title="Edit order"
                    >
                      ✏️
                    </Link>
                    {order.status === "PENDING" && (
                      <button
                        onClick={() => handleMarkAsDespatched(order)}
                        className="flex min-h-touch items-center gap-1 rounded-bento bg-green-100 px-3 py-2 text-sm font-medium text-green-700 dark:bg-green-900/30 dark:text-green-300"
                        title="Mark as Despatched"
                      >
                        Despatch
                      </button>
                    )}
                    {order.status === "DESPATCHED" && (
                      <button
                        onClick={() => handleMoveToPending(order)}
                        className="flex min-h-touch items-center gap-1 rounded-bento bg-amber-100 px-3 py-2 text-sm font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                        title="Move back to Pending (undo despatch)"
                      >
                        Move to Pending
                      </button>
                    )}
                    <button
                      className="flex min-h-touch min-w-touch items-center justify-center rounded-full bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300"
                      title="View PDF"
                    >
                      PDF
                    </button>
                    <button
                      onClick={() => handleDelete(order.id)}
                      className="flex min-h-touch min-w-touch items-center justify-center rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                      title="Delete"
                    >
                      🗑
                    </button>
                  </div>
                </BentoCard>
              ))
            )}
          </div>
        )}

        <button
          className="fixed bottom-24 right-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary-500 text-white shadow-lg md:bottom-8 md:right-8"
          title="Export PDF"
        >
          PDF
        </button>
      </div>
    </ErrorBoundary>
  );
}
