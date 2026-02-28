"use client";

import React from "react";

export function DashboardSkeleton() {
  return (
    <div className="flex min-h-screen flex-col overflow-hidden bg-slate-50 dark:bg-slate-950">
      {/* Header skeleton */}
      <div className="bg-slate-900 px-4 pb-8 pt-6 dark:bg-slate-950 lg:px-10">
        <div className="mx-auto flex max-w-6xl items-start justify-between gap-4">
          <div className="flex flex-1 flex-col gap-3">
            <div className="h-7 w-32 animate-pulse rounded bg-slate-700" />
            <div className="flex items-center gap-3">
              <div className="flex flex-col gap-1.5">
                <div className="h-3 w-16 animate-pulse rounded bg-slate-600" />
                <div className="h-5 w-28 animate-pulse rounded bg-slate-600" />
                <div className="h-10 w-14 animate-pulse rounded bg-slate-600" />
                <div className="h-4 w-32 animate-pulse rounded bg-slate-600" />
              </div>
              <div className="ml-auto h-11 w-28 animate-pulse rounded-full bg-slate-700" />
            </div>
          </div>
        </div>
      </div>

      {/* Cards skeleton */}
      <div className="mx-auto w-full max-w-6xl flex-1 px-4 pb-8 pt-6 lg:px-10 lg:pt-8">
        <div className="flex flex-col gap-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="flex items-center gap-4 rounded-2xl border border-white/20 bg-white/80 p-5 shadow-[0_4px_20px_rgba(0,0,0,0.06)] dark:border-white/10 dark:bg-slate-800/60 dark:shadow-[0_4px_20px_rgba(0,0,0,0.2)]"
            >
              <div className="h-12 w-12 shrink-0 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-600" />
              <div className="flex-1">
                <div className="mb-2 h-4 w-24 animate-pulse rounded bg-slate-200 dark:bg-slate-600" />
                <div className="h-8 w-16 animate-pulse rounded bg-slate-200 dark:bg-slate-600" />
              </div>
              <div className="h-6 w-14 animate-pulse rounded-full bg-slate-200 dark:bg-slate-600" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
