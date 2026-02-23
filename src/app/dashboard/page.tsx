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
  const kpiCardsWrapperRef = useRef<HTMLDivElement>(null);

  // #region agent log
  useEffect(() => {
    const measure = () => {
      const innerW = typeof window !== "undefined" ? window.innerWidth : 0;
      const clientW = typeof document !== "undefined" ? document.documentElement.clientWidth : 0;
      const wrap = kpiCardsWrapperRef.current;
      const wrapRect = wrap?.getBoundingClientRect();
      const firstCard = wrap?.firstElementChild as HTMLElement | null;
      const cardRect = firstCard?.getBoundingClientRect();
      const wrapStyle = wrap ? window.getComputedStyle(wrap) : null;
      const gapLeft = cardRect ? cardRect.left : null;
      const gapRight = cardRect && innerW ? innerW - cardRect.right : null;
      const payload = {
        sessionId: "9bc241",
        hypothesisId: "H1-H5",
        location: "dashboard/page.tsx:measure",
        message: "KPI cards left vs right gap",
        data: {
          innerWidth: innerW,
          clientWidth: clientW,
          wrapperLeft: wrapRect?.left,
          wrapperRight: wrapRect?.right,
          wrapperWidth: wrapRect?.width,
          cardLeft: cardRect?.left,
          cardRight: cardRect?.right,
          cardWidth: cardRect?.width,
          paddingLeft: wrapStyle?.paddingLeft,
          paddingRight: wrapStyle?.paddingRight,
          gapFromViewportLeft: gapLeft,
          gapFromViewportRight: gapRight,
          gapDiff: gapLeft != null && gapRight != null ? Math.round((gapRight - gapLeft) * 10) / 10 : null,
        },
        timestamp: Date.now(),
      };
      fetch("http://127.0.0.1:7242/ingest/e5ff1efb-b536-4696-aa4a-e6f88c1f3cf2", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "9bc241" },
        body: JSON.stringify(payload),
      }).catch(() => {});
    };
    const t = setTimeout(measure, 500);
    window.addEventListener("resize", measure);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", measure);
    };
  }, []);
  // #endregion

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

  // TEMP: extremely simplified layout while we debug the JSX parse issue.
  // We'll reintroduce the full header + KPI layout after we isolate the problematic snippet.
  return (
    <div className="flex min-h-screen flex-col overflow-hidden bg-slate-50">
      <div className="p-4">
        <h1 className="text-xl font-bold">Dashboard</h1>
        {error && (
          <p className="mt-2 rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
            {error}
          </p>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <div ref={kpiCardsWrapperRef} className="flex flex-col gap-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            Total Orders: {stats.total.toLocaleString()}
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            Dispatched: {stats.dispatched.toLocaleString()}
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            Pending: {stats.pending.toLocaleString()}
          </div>
        </div>
      </div>
    </div>
  );
}
