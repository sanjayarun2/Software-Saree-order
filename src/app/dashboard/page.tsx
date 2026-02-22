"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { BentoCard } from "@/components/ui/BentoCard";
import { getStatsFromCache, syncOrders } from "@/lib/order-service";
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

/** Stacked date display: header, day-of-week, large date number, month/year */
function DateWidgetDisplay({
  period,
  from,
  to,
}: {
  period: DashboardDatePeriod;
  from: string;
  to: string;
}) {
  const fromD = new Date(from);
  const toD = new Date(to);

  if (period === "today") {
    return (
      <div className="flex flex-col items-start gap-0.5">
        <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Today is</span>
        <span className="text-base font-medium text-slate-200">
          {fromD.toLocaleDateString("en-GB", { weekday: "long" })}
        </span>
        <span className="text-4xl font-bold tabular-nums tracking-tight text-white md:text-5xl">
          {fromD.getDate()}
        </span>
        <span className="text-sm font-medium text-slate-400">
          {fromD.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
        </span>
      </div>
    );
  }

  if (period === "yesterday") {
    return (
      <div className="flex flex-col items-start gap-0.5">
        <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Yesterday</span>
        <span className="text-base font-medium text-slate-200">
          {fromD.toLocaleDateString("en-GB", { weekday: "long" })}
        </span>
        <span className="text-4xl font-bold tabular-nums tracking-tight text-white md:text-5xl">
          {fromD.getDate()}
        </span>
        <span className="text-sm font-medium text-slate-400">
          {fromD.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
        </span>
      </div>
    );
  }

  if (period === "month") {
    return (
      <div className="flex flex-col items-start gap-0.5">
        <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Month</span>
        <span className="text-3xl font-bold tracking-tight text-white md:text-4xl">
          {fromD.toLocaleDateString("en-GB", { month: "long" })}
        </span>
        <span className="text-sm font-medium text-slate-400">{fromD.getFullYear()}</span>
      </div>
    );
  }

  if (period === "year") {
    return (
      <div className="flex flex-col items-start gap-0.5">
        <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Year</span>
        <span className="text-4xl font-bold tabular-nums tracking-tight text-white md:text-5xl">
          {fromD.getFullYear()}
        </span>
      </div>
    );
  }

  if (period === "custom" && from === to) {
    return (
      <div className="flex flex-col items-start gap-0.5">
        <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Custom</span>
        <span className="text-base font-medium text-slate-200">
          {fromD.toLocaleDateString("en-GB", { weekday: "long" })}
        </span>
        <span className="text-4xl font-bold tabular-nums tracking-tight text-white md:text-5xl">
          {fromD.getDate()}
        </span>
        <span className="text-sm font-medium text-slate-400">
          {fromD.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
        </span>
      </div>
    );
  }

  // this_week, last_week, or custom range
  const rangeLabel =
    from === to
      ? fromD.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
      : `${fromD.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${toD.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
  const periodLabel =
    period === "this_week"
      ? "This Week"
      : period === "last_week"
        ? "Last Week"
        : "Custom range";

  return (
    <div className="flex flex-col items-start gap-0.5">
      <span className="text-xs font-medium uppercase tracking-wider text-slate-400">{periodLabel}</span>
      <span className="text-2xl font-bold tracking-tight text-white md:text-3xl">{rangeLabel}</span>
    </div>
  );
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
      // Instant: show stats from local IndexedDB cache
      const cachedStats = await getStatsFromCache(user.id, range.from, range.to);
      setStats(cachedStats);
      if (prevRange) {
        const cachedPrev = await getStatsFromCache(user.id, prevRange.from, prevRange.to);
        setPrevStats(cachedPrev);
      }
      setLoadingStats(false);

      // Revalidate: fetch exact counts from Supabase in background
      syncOrders(user.id).then(async (changed) => {
        // After sync, recompute from cache (now up-to-date)
        const fresh = await getStatsFromCache(user.id, range.from, range.to);
        setStats(fresh);
        if (prevRange) {
          const freshPrev = await getStatsFromCache(user.id, prevRange.from, prevRange.to);
          setPrevStats(freshPrev);
        } else {
          setPrevStats(null);
        }
      });
    } catch (e) {
      setError((e as Error).message || "Failed to load stats");
      setStats({ total: 0, dispatched: 0, pending: 0 });
      setPrevStats(null);
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

  if (loading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="min-h-screen">
      {/* Dark header: title, date dropdown, FAB - title size/place matches other page headings */}
      <div className="relative bg-slate-900 px-4 pb-8 pt-4 dark:bg-slate-950 lg:px-10 lg:pt-6">
        <div className="mx-auto flex max-w-6xl items-start justify-between gap-4">
          <div className="flex-1 space-y-2">
            <h1 className="text-xl font-bold leading-tight text-white lg:text-2xl">
              Dashboard
            </h1>
            <div className="relative" ref={dateDropdownRef}>
              <button
                type="button"
                onClick={() => setDateDropdownOpen((o) => !o)}
                className="group flex w-full items-center justify-between gap-3 rounded-xl border border-slate-700/80 bg-slate-800/50 px-4 py-3 text-left transition hover:border-slate-600 hover:bg-slate-800/80 focus:outline-none focus:ring-2 focus:ring-primary-500/50 md:min-w-[200px]"
                aria-expanded={dateDropdownOpen}
                aria-haspopup="listbox"
                aria-label="Select date range"
              >
                <DateWidgetDisplay period={period} from={range.from} to={range.to} />
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition group-hover:bg-slate-700/50 group-hover:text-white ${
                    dateDropdownOpen ? "rotate-180 bg-slate-700/50" : ""
                  }`}
                  aria-hidden
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 6l4 4 4-4" />
                  </svg>
                </span>
              </button>
              {dateDropdownOpen && (
                <div
                  className="absolute left-0 top-full z-20 mt-2 min-w-[220px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-600 dark:bg-slate-800"
                  role="listbox"
                >
                  <div className="border-b border-slate-100 px-3 py-2 dark:border-slate-700">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Date range
                    </p>
                  </div>
                  <div className="max-h-[280px] overflow-y-auto py-1">
                    {PERIOD_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        role="option"
                        aria-selected={period === opt.value}
                        onClick={() => {
                          setPeriod(opt.value);
                          if (opt.value === "custom" && !customFrom && !customTo) {
                            const today = new Date().toISOString().slice(0, 10);
                            setCustomFrom(today);
                            setCustomTo(today);
                          }
                          setDateDropdownOpen(false);
                        }}
                        className={`flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium transition ${
                          period === opt.value
                            ? "bg-primary-50 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300"
                            : "text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700/50"
                        }`}
                      >
                        <span
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs ${
                            period === opt.value
                              ? "bg-primary-100 text-primary-600 dark:bg-primary-800/50 dark:text-primary-400"
                              : "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400"
                          }`}
                          aria-hidden
                        >
                          {opt.value === "today" && "📅"}
                          {opt.value === "yesterday" && "◀"}
                          {opt.value === "this_week" && "📆"}
                          {opt.value === "last_week" && "⏪"}
                          {opt.value === "month" && "🗓"}
                          {opt.value === "year" && "📅"}
                          {opt.value === "custom" && "✎"}
                        </span>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  {period === "custom" && (
                    <div className="border-t border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-600 dark:bg-slate-800/80">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Select range
                      </p>
                      <div className="flex items-center gap-2">
                        <input
                          type="date"
                          value={customFrom}
                          onChange={(e) => setCustomFrom(e.target.value)}
                          className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                        />
                        <span className="text-slate-400">–</span>
                        <input
                          type="date"
                          value={customTo}
                          onChange={(e) => setCustomTo(e.target.value)}
                          className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
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

      {/* Content: cards with clear spacing below header */}
      <div className="mx-auto max-w-6xl space-y-6 px-4 pb-8 pt-6 lg:px-10 lg:pt-8">
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
            <div className="flex flex-wrap items-baseline gap-3">
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
            <div className="flex flex-wrap items-baseline gap-3">
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
            <div className="flex flex-wrap items-baseline gap-3">
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
