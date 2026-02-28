"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
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
  { value: "month", label: "This Month" },
  { value: "last_month", label: "Last Month" },
  { value: "quarter", label: "Quarter" },
  { value: "year", label: "Year" },
  { value: "custom", label: "Custom" },
];

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
        <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Today</span>
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

  if (period === "month" || period === "last_month") {
    const periodLabel = period === "month" ? "This Month" : "Last Month";
    return (
      <div className="flex flex-col items-start gap-0.5">
        <span className="text-xs font-medium uppercase tracking-wider text-slate-400">{periodLabel}</span>
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

  if (period === "quarter") {
    const qMonth = Math.floor(fromD.getMonth() / 3) * 3;
    const qNum = Math.floor(qMonth / 3) + 1;
    return (
      <div className="flex flex-col items-start gap-0.5">
        <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Quarter</span>
        <span className="text-3xl font-bold tracking-tight text-white md:text-4xl">
          Q{qNum}
        </span>
        <span className="text-sm font-medium text-slate-400">{fromD.getFullYear()}</span>
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

  const rangeLabel =
    from === to
      ? fromD.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
      : `${fromD.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${toD.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
  const periodLabel =
    period === "this_week"
      ? "This Week"
      : period === "last_week"
        ? "Last Week"
        : "Custom Range";

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

function pctChange(current: number, prev: number): number | null {
  if (prev === 0) return current > 0 ? 100 : null;
  return Math.round(((current - prev) / prev) * 1000) / 10;
}

function ChangeBadge({ current, prev }: { current: number; prev: number | undefined }) {
  if (prev == null) return null;
  const pct = pctChange(current, prev);
  if (pct == null) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500 dark:bg-slate-700 dark:text-slate-400">
        —
      </span>
    );
  }
  const isUp = pct >= 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
        isUp
          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
          : "bg-red-50 text-red-700 dark:bg-red-900/40 dark:text-red-300"
      }`}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {isUp ? <path d="M18 15l-6-6-6 6" /> : <path d="M6 9l6 6 6-6" />}
      </svg>
      {Math.abs(pct)}%
    </span>
  );
}

const CARD_CONFIGS = [
  {
    key: "total" as const,
    label: "Total Orders",
    iconBg: "bg-primary-50 dark:bg-primary-500/20",
    iconColor: "text-primary-600 dark:text-primary-400",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
        <line x1="12" y1="22.08" x2="12" y2="12" />
      </svg>
    ),
  },
  {
    key: "dispatched" as const,
    label: "Dispatched",
    iconBg: "bg-emerald-50 dark:bg-emerald-500/20",
    iconColor: "text-emerald-600 dark:text-emerald-400",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="3" width="15" height="13" rx="2" />
        <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
        <circle cx="5.5" cy="18.5" r="2.5" />
        <circle cx="18.5" cy="18.5" r="2.5" />
      </svg>
    ),
  },
  {
    key: "pending" as const,
    label: "Pending",
    iconBg: "bg-amber-50 dark:bg-amber-500/20",
    iconColor: "text-amber-600 dark:text-amber-400",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
  },
];

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
      const cachedStats = await getStatsFromCache(user.id, range.from, range.to);
      setStats(cachedStats);
      if (prevRange) {
        const cachedPrev = await getStatsFromCache(user.id, prevRange.from, prevRange.to);
        setPrevStats(cachedPrev);
      }
      setLoadingStats(false);

      syncOrders(user.id).then(async () => {
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

  if (loading) {
    return <DashboardSkeleton />;
  }

  const selectedLabel = PERIOD_OPTIONS.find((o) => o.value === period)?.label ?? "Today";

  return (
    <div className="flex min-h-screen flex-col overflow-hidden bg-slate-50 dark:bg-slate-950">
      {/* Header */}
      <div className="bg-slate-900 px-4 pb-8 pt-6 dark:bg-slate-950 lg:px-10">
        <div className="mx-auto flex max-w-6xl items-start justify-between gap-4">
          {/* Left: title + date widget */}
          <div className="flex flex-1 flex-col gap-3">
            <h1 className="text-xl font-bold text-white">Dashboard</h1>
            <div className="flex items-center gap-3">
              <DateWidgetDisplay period={period} from={range.from} to={range.to} />
              {/* Period selector dropdown */}
              <div ref={dateDropdownRef} className="relative ml-auto shrink-0">
                <button
                  type="button"
                  onClick={() => setDateDropdownOpen((o) => !o)}
                  className="flex min-h-[44px] items-center gap-2 rounded-full border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-200 shadow-sm transition hover:bg-slate-700 active:bg-slate-600"
                >
                  {selectedLabel}
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${dateDropdownOpen ? "rotate-180" : ""}`} aria-hidden>
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>

                {dateDropdownOpen && (
                  <div className="absolute right-0 top-full z-50 mt-2 w-52 origin-top-right animate-in fade-in slide-in-from-top-2 overflow-hidden rounded-2xl border border-slate-200 bg-white py-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-800">
                    {PERIOD_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          setPeriod(opt.value);
                          if (opt.value !== "custom") setDateDropdownOpen(false);
                        }}
                        className={`flex w-full items-center px-4 py-2.5 text-sm font-medium transition ${
                          period === opt.value
                            ? "bg-primary-50 text-primary-700 dark:bg-primary-500/20 dark:text-primary-300"
                            : "text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700"
                        }`}
                      >
                        {opt.label}
                        {period === opt.value && (
                          <svg className="ml-auto h-4 w-4 text-primary-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </button>
                    ))}

                    {period === "custom" && (
                      <div className="border-t border-slate-100 px-4 py-3 dark:border-slate-700">
                        <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">From</label>
                        <input
                          type="date"
                          value={customFrom}
                          onChange={(e) => setCustomFrom(e.target.value)}
                          className="mb-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                        />
                        <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">To</label>
                        <input
                          type="date"
                          value={customTo}
                          onChange={(e) => setCustomTo(e.target.value)}
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto w-full max-w-6xl flex-1 px-4 pb-8 pt-6 lg:px-10 lg:pt-8">
        {error && (
          <p className="mb-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
            {error}
          </p>
        )}

        {/* Stat Cards */}
        <div className="flex flex-col gap-4">
          {CARD_CONFIGS.map((card) => {
            const value = stats[card.key];
            const prev = prevStats?.[card.key];
            return (
              <div
                key={card.key}
                className="flex items-center gap-4 rounded-2xl border border-white/20 bg-white/80 p-5 shadow-[0_4px_20px_rgba(0,0,0,0.06)] backdrop-blur-sm transition dark:border-white/10 dark:bg-slate-800/60 dark:shadow-[0_4px_20px_rgba(0,0,0,0.2)]"
              >
                {/* Icon */}
                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${card.iconBg}`}>
                  <span className={card.iconColor}>{card.icon}</span>
                </div>

                {/* Label + value */}
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{card.label}</p>
                  <p className="text-3xl font-bold tabular-nums text-slate-900 dark:text-white">
                    {loadingStats ? (
                      <span className="inline-block h-8 w-16 animate-pulse rounded bg-slate-200 dark:bg-slate-600" />
                    ) : (
                      value.toLocaleString()
                    )}
                  </p>
                </div>

                {/* Change badge */}
                {!loadingStats && prevStats && (
                  <ChangeBadge current={value} prev={prev} />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
