"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { BentoCard } from "@/components/ui/BentoCard";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import {
  getDateRange,
  getPreviousPeriodRange,
  type ReportPeriod,
} from "@/lib/report-utils";
import { downloadBusinessReportPdf, type ReportStats } from "@/lib/pdf-utils";
import type { Order } from "@/lib/db-types";

const PERIOD_OPTIONS: { value: ReportPeriod; label: string }[] = [
  { value: "this_week", label: "This Week" },
  { value: "last_week", label: "Last Week" },
  { value: "this_month", label: "This Month" },
  { value: "last_month", label: "Last Month" },
  { value: "this_quarter", label: "This Quarter" },
  { value: "last_quarter", label: "Last Quarter" },
  { value: "this_year", label: "This Year" },
  { value: "last_year", label: "Last Year" },
  { value: "custom", label: "Custom Range" },
];

export default function ReportsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [period, setPeriod] = useState<ReportPeriod>("this_month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [prevOrders, setPrevOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const range = getDateRange(period, customFrom, customTo);
  const prevRange = getPreviousPeriodRange(range);

  const fetchOrders = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const [currentRes, prevRes] = await Promise.all([
        supabase
          .from("orders")
          .select("*")
          .eq("user_id", user.id)
          .eq("status", "DESPATCHED")
          .not("despatch_date", "is", null)
          .gte("despatch_date", range.from)
          .lte("despatch_date", range.to)
          .order("despatch_date", { ascending: true }),
        supabase
          .from("orders")
          .select("*")
          .eq("user_id", user.id)
          .eq("status", "DESPATCHED")
          .not("despatch_date", "is", null)
          .gte("despatch_date", prevRange.from)
          .lte("despatch_date", prevRange.to)
          .order("despatch_date", { ascending: true }),
      ]);
      if (currentRes.error) throw currentRes.error;
      if (prevRes.error) throw prevRes.error;
      setOrders((currentRes.data as Order[]) ?? []);
      setPrevOrders((prevRes.data as Order[]) ?? []);
    } catch (e) {
      setError((e as Error).message || "Failed to load data");
      setOrders([]);
      setPrevOrders([]);
    } finally {
      setLoading(false);
    }
  }, [user, range.from, range.to, prevRange.from, prevRange.to]);

  useEffect(() => {
    if (user && (period !== "custom" || (customFrom && customTo))) {
      fetchOrders();
    } else if (period === "custom" && (!customFrom || !customTo)) {
      setLoading(false);
      setOrders([]);
      setPrevOrders([]);
    }
  }, [user, period, customFrom, customTo, fetchOrders]);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login/");
  }, [user, authLoading, router]);

  const getOrderQty = (o: Order): number => {
    const q = o.quantity;
    if (q == null || q === "") return 1;
    const n = Number(q);
    return isNaN(n) || n < 1 ? 1 : n;
  };

  const totalOrders = orders.length;
  const totalSarees = orders.reduce((sum, o) => sum + getOrderQty(o), 0);
  const prevTotalOrders = prevOrders.length;
  const prevTotalSarees = prevOrders.reduce((sum, o) => sum + getOrderQty(o), 0);

  const ordersChangePercent =
    prevTotalOrders > 0
      ? ((totalOrders - prevTotalOrders) / prevTotalOrders) * 100
      : totalOrders > 0
        ? 100
        : 0;
  const sareesChangePercent =
    prevTotalSarees > 0
      ? ((totalSarees - prevTotalSarees) / prevTotalSarees) * 100
      : totalSarees > 0
        ? 100
        : 0;

  const stats: ReportStats = {
    periodLabel: range.label,
    from: range.from,
    to: range.to,
    totalOrders,
    totalSarees,
    prevTotalOrders,
    prevTotalSarees,
    ordersChangePercent,
    sareesChangePercent,
  };

  const handleDownloadPdf = () => {
    downloadBusinessReportPdf(orders, stats, user?.email ?? undefined);
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
      <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          Sales Reports
        </h1>
        <p className="text-slate-600 dark:text-slate-400">
          Dispatched orders only, by dispatch date. View analytics and download PDF for auditors or IT filing.
        </p>

        <BentoCard className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Select Report Period
            </label>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as ReportPeriod)}
              className="w-full rounded-[16px] border border-gray-200 px-4 py-3 text-base text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            >
              {PERIOD_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {period === "custom" && (
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium">
                  From Date
                </label>
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="w-full rounded-[16px] border border-gray-200 px-4 py-3 dark:border-slate-600 dark:bg-slate-800"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">To Date</label>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="w-full rounded-[16px] border border-gray-200 px-4 py-3 dark:border-slate-600 dark:bg-slate-800"
                />
              </div>
            </div>
          )}

          {error && (
            <p className="rounded-[16px] bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
              {error}
            </p>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
            </div>
          ) : (
            <>
              <div className="border-t border-gray-100 pt-4 dark:border-slate-700">
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                  {range.label}
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-[16px] bg-primary-50 p-4 dark:bg-primary-900/20">
                  <p className="text-sm font-medium text-primary-600 dark:text-primary-400">
                    Dispatched Orders
                  </p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                    {totalOrders}
                  </p>
                  {prevTotalOrders > 0 && (
                    <p
                      className={`mt-1 text-sm ${
                        ordersChangePercent >= 0
                          ? "text-emerald-600"
                          : "text-red-600"
                      }`}
                    >
                      {ordersChangePercent >= 0 ? "↑" : "↓"}{" "}
                      {Math.abs(ordersChangePercent).toFixed(1)}% vs previous
                      period
                    </p>
                  )}
                </div>
                <div className="rounded-[16px] bg-primary-50 p-4 dark:bg-primary-900/20">
                  <p className="text-sm font-medium text-primary-600 dark:text-primary-400">
                    Total Sarees (from qty)
                  </p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                    {totalSarees}
                  </p>
                  {prevTotalSarees > 0 && (
                    <p
                      className={`mt-1 text-sm ${
                        sareesChangePercent >= 0
                          ? "text-emerald-600"
                          : "text-red-600"
                      }`}
                    >
                      {sareesChangePercent >= 0 ? "↑" : "↓"}{" "}
                      {Math.abs(sareesChangePercent).toFixed(1)}% vs previous
                      period
                    </p>
                  )}
                </div>
              </div>

              <div className="rounded-[16px] border border-gray-100 bg-gray-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {ordersChangePercent >= 0 ? (
                    <>
                      <span className="font-medium text-emerald-600">
                        Sales increased
                      </span>{" "}
                      by {Math.abs(ordersChangePercent).toFixed(1)}% in orders
                      and {Math.abs(sareesChangePercent).toFixed(1)}% in sarees
                      compared to the previous period.
                    </>
                  ) : ordersChangePercent < 0 ? (
                    <>
                      <span className="font-medium text-red-600">
                        Sales decreased
                      </span>{" "}
                      by {Math.abs(ordersChangePercent).toFixed(1)}% in orders
                      and {Math.abs(sareesChangePercent).toFixed(1)}% in sarees
                      compared to the previous period.
                    </>
                  ) : (
                    <>No change from the previous period.</>
                  )}
                </p>
              </div>

              <button
                onClick={handleDownloadPdf}
                disabled={orders.length === 0}
                className="w-full rounded-[16px] bg-primary-500 px-4 py-3 font-semibold text-white hover:bg-primary-600 disabled:opacity-50"
              >
                Download PDF Report (Auditor / IT Filing)
              </button>

              <p className="text-center text-xs text-slate-500">
                PDF includes summary, comparison with previous period, and
                detailed order table. Suitable for auditors and tax filing.
              </p>
            </>
          )}
        </BentoCard>
      </div>
    </ErrorBoundary>
  );
}
