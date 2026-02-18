"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { BentoCard } from "@/components/ui/BentoCard";
import { DashboardSkeleton } from "@/components/ui/DashboardSkeleton";
import {
  getDashboardDateRange,
  type DashboardDatePeriod,
} from "@/lib/dashboard-date-utils";

const PERIOD_OPTIONS: { value: DashboardDatePeriod; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "this_week", label: "This Week" },
  { value: "last_week", label: "Last Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
  { value: "custom", label: "Custom" },
];

interface DashboardStats {
  total: number;
  dispatched: number;
  pending: number;
}

function getPreviousRange(from: string, to: string): { from: string; to: string } {
  const fromDate = new Date(from);
  const toDate = new Date(to);
  const diffMs = toDate.getTime() - fromDate.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24)) + 1;

  const prevTo = new Date(fromDate);
  prevTo.setDate(prevTo.getDate() - 1);

  const prevFrom = new Date(prevTo);
  prevFrom.setDate(prevFrom.getDate() - diffDays + 1);

  return {
    from: prevFrom.toISOString().slice(0, 10),
    to: prevTo.toISOString().slice(0, 10),
  };
}

export default function DashboardPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [period, setPeriod] = useState<DashboardDatePeriod>("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [stats, setStats] = useState<DashboardStats>({ total: 0, dispatched: 0, pending: 0 });
  const [prevStats, setPrevStats] = useState<DashboardStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const range = getDashboardDateRange(period, customFrom, customTo);
  const prevRange = period !== "custom" ? getPreviousRange(range.from, range.to) : null;

  const fetchStats = useCallback(async () => {
    if (!user) return;
    if (period === "custom" && (!customFrom || !customTo)) {
      setLoadingStats(false);
      return;
    }

    setLoadingStats(true);
    setError(null);

    try {
      const [
        { count: totalCount, error: totalErr },
        { count: dispatchedCount, error: dispatchedErr },
        { count: pendingCount, error: pendingErr },
        prevTotal,
        prevDisp,
        prevPend,
      ] = await Promise.all([
        supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .gte("booking_date", range.from)
          .lte("booking_date", range.to),
        supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("status", "DESPATCHED")
          .not("despatch_date", "is", null)
          .gte("despatch_date", range.from)
          .lte("despatch_date", range.to),
        supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("status", "PENDING")
          .gte("booking_date", range.from)
          .lte("booking_date", range.to),
        prevRange
          ? supabase
              .from("orders")
              .select("id", { count: "exact", head: true })
              .eq("user_id", user.id)
              .gte("booking_date", prevRange.from)
              .lte("booking_date", prevRange.to)
          : Promise.resolve({ count: 0, error: null }),
        prevRange
          ? supabase
              .from("orders")
              .select("id", { count: "exact", head: true })
              .eq("user_id", user.id)
              .eq("status", "DESPATCHED")
              .not("despatch_date", "is", null)
              .gte("despatch_date", prevRange.from)
              .lte("despatch_date", prevRange.to)
          : Promise.resolve({ count: 0, error: null }),
        prevRange
          ? supabase
              .from("orders")
              .select("id", { count: "exact", head: true })
              .eq("user_id", user.id)
              .eq("status", "PENDING")
              .gte("booking_date", prevRange.from)
              .lte("booking_date", prevRange.to)
          : Promise.resolve({ count: 0, error: null }),
      ]);

      if (totalErr) throw totalErr;
      if (dispatchedErr) throw dispatchedErr;
      if (pendingErr) throw pendingErr;

      setStats({
        total: totalCount ?? 0,
        dispatched: dispatchedCount ?? 0,
        pending: pendingCount ?? 0,
      });

      if (prevRange) {
        setPrevStats({
          total: prevTotal?.count ?? 0,
          dispatched: prevDisp?.count ?? 0,
          pending: prevPend?.count ?? 0,
        });
      } else {
        setPrevStats(null);
      }
    } catch (e) {
      setError((e as Error).message || "Failed to load stats");
      setStats({ total: 0, dispatched: 0, pending: 0 });
      setPrevStats(null);
    } finally {
      setLoadingStats(false);
    }
  }, [user, range.from, range.to, period, customFrom, customTo]);

  useEffect(() => {
    if (!loading && !user) router.replace("/login/");
  }, [user, loading, router]);

  useEffect(() => {
    if (user && (period !== "custom" || (customFrom && customTo))) {
      fetchStats();
    } else if (period === "custom" && (!customFrom || !customTo)) {
      setLoadingStats(false);
      setStats({ total: 0, dispatched: 0, pending: 0 });
      setPrevStats(null);
    }
  }, [user, period, customFrom, customTo, fetchStats]);

  function pctChange(current: number, prev: number): number | null {
    if (prev === 0) return current > 0 ? 100 : null;
    return Math.round(((current - prev) / prev) * 1000) / 10;
  }

  const displayDate = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  if (loading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-4 lg:space-y-8 lg:px-10 lg:py-8">
      {/* Header with date and Add Order */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
          {displayDate}
        </p>
        <Link
          href="/add-order/"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-500 text-white shadow-md transition hover:bg-primary-600 active:bg-primary-700"
          aria-label="Add Order"
        >
          <span className="text-xl leading-none">+</span>
        </Link>
      </div>

      {/* Date range selector */}
      <div className="space-y-3">
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
          Date range
        </label>
        <div className="flex flex-wrap gap-2">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setPeriod(opt.value)}
              className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${
                period === opt.value
                  ? "border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300"
                  : "border-gray-200 bg-white text-slate-600 hover:bg-gray-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {period === "custom" && (
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="rounded-xl border border-gray-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
            />
            <span className="text-slate-500">–</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="rounded-xl border border-gray-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
            />
          </div>
        )}
        <p className="text-xs text-slate-500 dark:text-slate-400">{range.label}</p>
      </div>

      {error && (
        <p className="rounded-bento bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
          {error}
        </p>
      )}

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <BentoCard className="flex flex-col gap-3 p-5 shadow-sm">
          <div className="flex items-start justify-between">
            <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
              Total Orders
            </p>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-100 dark:bg-primary-900/40">
              <span className="text-lg" aria-hidden>📋</span>
            </div>
          </div>
          {loadingStats ? (
            <div className="h-9 w-16 animate-pulse rounded bg-gray-200 dark:bg-slate-600" />
          ) : (
            <>
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                {stats.total.toLocaleString()}
              </p>
              {prevStats != null && (
                <PctChange value={pctChange(stats.total, prevStats.total)} />
              )}
            </>
          )}
        </BentoCard>

        <BentoCard className="flex flex-col gap-3 p-5 shadow-sm">
          <div className="flex items-start justify-between">
            <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
              Dispatched Orders
            </p>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-100 dark:bg-primary-900/40">
              <span className="text-lg" aria-hidden>✓</span>
            </div>
          </div>
          {loadingStats ? (
            <div className="h-9 w-16 animate-pulse rounded bg-gray-200 dark:bg-slate-600" />
          ) : (
            <>
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                {stats.dispatched.toLocaleString()}
              </p>
              {prevStats != null && (
                <PctChange value={pctChange(stats.dispatched, prevStats.dispatched)} />
              )}
            </>
          )}
        </BentoCard>

        <BentoCard className="flex flex-col gap-3 p-5 shadow-sm sm:col-span-2 lg:col-span-1">
          <div className="flex items-start justify-between">
            <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
              Pending Orders
            </p>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-100 dark:bg-primary-900/40">
              <span className="text-lg" aria-hidden>⏳</span>
            </div>
          </div>
          {loadingStats ? (
            <div className="h-9 w-16 animate-pulse rounded bg-gray-200 dark:bg-slate-600" />
          ) : (
            <>
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                {stats.pending.toLocaleString()}
              </p>
              {prevStats != null && (
                <PctChange value={pctChange(stats.pending, prevStats.pending)} />
              )}
            </>
          )}
        </BentoCard>
      </div>

      {/* Quick links */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link href="/orders/" className="block">
          <BentoCard className="flex min-h-[44px] cursor-pointer flex-col items-center justify-center gap-2 py-5 transition hover:shadow-md md:min-h-[50px] md:gap-4 md:py-8">
            <span className="text-3xl md:text-4xl" aria-hidden>📋</span>
            <div className="text-center">
              <p className="text-base font-semibold text-gray-900 dark:text-slate-100 md:text-lg">
                Orders
              </p>
              <p className="text-sm text-gray-500 dark:text-slate-400 md:text-base">
                View bookings
              </p>
            </div>
          </BentoCard>
        </Link>
        <Link href="/add-order/" className="block">
          <BentoCard className="flex min-h-[44px] cursor-pointer flex-col items-center justify-center gap-2 py-5 transition hover:shadow-md md:min-h-[50px] md:gap-4 md:py-8">
            <span className="text-3xl md:text-4xl" aria-hidden>➕</span>
            <div className="text-center">
              <p className="text-base font-semibold text-gray-900 dark:text-slate-100 md:text-lg">
                Add Order
              </p>
              <p className="text-sm text-gray-500 dark:text-slate-400 md:text-base">
                Create booking
              </p>
            </div>
          </BentoCard>
        </Link>
        <Link href="/reports/" className="block">
          <BentoCard className="flex min-h-[44px] cursor-pointer flex-col items-center justify-center gap-2 py-5 transition hover:shadow-md md:min-h-[50px] md:gap-4 md:py-8">
            <span className="text-3xl md:text-4xl" aria-hidden>📄</span>
            <div className="text-center">
              <p className="text-base font-semibold text-gray-900 dark:text-slate-100 md:text-lg">
                Reports
              </p>
              <p className="text-sm text-gray-500 dark:text-slate-400 md:text-base">
                Export PDF
              </p>
            </div>
          </BentoCard>
        </Link>
      </div>
    </div>
  );
}

function PctChange({ value }: { value: number | null }) {
  if (value == null) return null;
  const isPositive = value >= 0;
  return (
    <p
      className={`text-sm font-medium ${
        isPositive ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
      }`}
    >
      {isPositive ? "+" : ""}
      {value}%
    </p>
  );
}
