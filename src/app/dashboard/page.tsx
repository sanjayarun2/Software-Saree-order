"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
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

function formatDateRangeLabel(period: DashboardDatePeriod, from: string, to: string): string {
  if (period === "today") {
    const d = new Date(from);
    return `Today is ${d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`;
  }
  if (period === "yesterday") {
    const d = new Date(from);
    return `Yesterday - ${d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`;
  }
  const fromD = new Date(from);
  const toD = new Date(to);
  if (from === to) {
    return fromD.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  }
  return `${fromD.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${toD.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
}

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
  const [dateDropdownOpen, setDateDropdownOpen] = useState(false);
  const dateDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dateDropdownRef.current && !dateDropdownRef.current.contains(e.target as Node)) {
        setDateDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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

  const dateDisplayLabel = formatDateRangeLabel(period, range.from, range.to);

  if (loading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="min-h-screen">
      {/* Dark header: title, date dropdown, FAB */}
      <div className="relative bg-slate-900 px-4 pb-8 pt-6 dark:bg-slate-950 lg:px-10">
        <div className="mx-auto flex max-w-6xl items-start justify-between gap-4">
          <div className="flex-1 space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-white md:text-[28px]">
              Dashboard
            </h1>
            <div className="relative" ref={dateDropdownRef}>
              <button
                type="button"
                onClick={() => setDateDropdownOpen((o) => !o)}
                className="flex items-center gap-1.5 text-base font-medium text-slate-300 hover:text-white md:text-lg"
              >
                {dateDisplayLabel}
                <span className="text-slate-400" aria-hidden>⌄</span>
              </button>
              {dateDropdownOpen && (
                <div className="absolute left-0 top-full z-20 mt-2 min-w-[200px] rounded-2xl border border-slate-700 bg-white py-2 shadow-xl dark:border-slate-600 dark:bg-slate-800">
                  {PERIOD_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        setPeriod(opt.value);
                        if (opt.value === "custom" && !customFrom && !customTo) {
                          const today = new Date().toISOString().slice(0, 10);
                          setCustomFrom(today);
                          setCustomTo(today);
                        }
                        setDateDropdownOpen(false);
                      }}
                      className={`block w-full px-4 py-2.5 text-left text-sm font-medium ${
                        period === opt.value
                          ? "bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300"
                          : "text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                  {period === "custom" && (
                    <div className="border-t border-slate-200 px-4 py-3 dark:border-slate-600">
                      <p className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">Select range</p>
                      <div className="flex items-center gap-2">
                        <input
                          type="date"
                          value={customFrom}
                          onChange={(e) => setCustomFrom(e.target.value)}
                          className="rounded-xl border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700"
                        />
                        <span className="text-slate-400">–</span>
                        <input
                          type="date"
                          value={customTo}
                          onChange={(e) => setCustomTo(e.target.value)}
                          className="rounded-xl border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          <Link
            href="/add-order/"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary-500 text-white shadow-lg transition hover:bg-primary-600 active:bg-primary-700"
            aria-label="Add Order"
          >
            <span className="text-2xl leading-none">+</span>
          </Link>
        </div>
      </div>

      {/* Content: cards (negative margin to overlap header) */}
      <div className="mx-auto max-w-6xl space-y-6 px-4 pb-8 lg:px-10" style={{ marginTop: "-24px" }}>
      {error && (
        <p className="rounded-bento bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
          {error}
        </p>
      )}

      {/* KPI Cards: 2x2 grid, reference anatomy (label top-left, icon top-right, value + trend bottom) */}
      <div className="grid gap-5 sm:grid-cols-2">
        <BentoCard className="flex flex-col gap-4 rounded-[18px] p-5 shadow-[0_4px_20px_rgba(0,0,0,0.06)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.2)]">
          <div className="flex items-start justify-between">
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
              Total Orders
            </p>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-100 dark:bg-primary-900/40">
              <span className="text-lg" aria-hidden>📋</span>
            </div>
          </div>
          {loadingStats ? (
            <div className="h-9 w-20 animate-pulse rounded bg-slate-200 dark:bg-slate-600" />
          ) : (
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 md:text-3xl">
                {stats.total.toLocaleString()}
              </p>
              {prevStats != null && (
                <PctChange value={pctChange(stats.total, prevStats.total)} />
              )}
            </div>
          )}
        </BentoCard>

        <BentoCard className="flex flex-col gap-4 rounded-[18px] p-5 shadow-[0_4px_20px_rgba(0,0,0,0.06)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.2)]">
          <div className="flex items-start justify-between">
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
              Dispatched Orders
            </p>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-100 dark:bg-primary-900/40">
              <span className="text-lg" aria-hidden>✓</span>
            </div>
          </div>
          {loadingStats ? (
            <div className="h-9 w-20 animate-pulse rounded bg-slate-200 dark:bg-slate-600" />
          ) : (
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 md:text-3xl">
                {stats.dispatched.toLocaleString()}
              </p>
              {prevStats != null && (
                <PctChange value={pctChange(stats.dispatched, prevStats.dispatched)} />
              )}
            </div>
          )}
        </BentoCard>

        <BentoCard className="flex flex-col gap-4 rounded-[18px] p-5 shadow-[0_4px_20px_rgba(0,0,0,0.06)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.2)] sm:col-span-2">
          <div className="flex items-start justify-between">
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
              Pending Orders
            </p>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-100 dark:bg-primary-900/40">
              <span className="text-lg" aria-hidden>⏳</span>
            </div>
          </div>
          {loadingStats ? (
            <div className="h-9 w-20 animate-pulse rounded bg-slate-200 dark:bg-slate-600" />
          ) : (
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 md:text-3xl">
                {stats.pending.toLocaleString()}
              </p>
              {prevStats != null && (
                <PctChange value={pctChange(stats.pending, prevStats.pending)} />
              )}
            </div>
          )}
        </BentoCard>
      </div>
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
      {isPositive ? "▲ +" : "▼ "}
      {Math.abs(value)}%
    </p>
  );
}
