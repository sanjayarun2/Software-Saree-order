"use client";

import React from "react";

export function DashboardSkeleton() {
  return (
    <div className="min-h-screen">
      <div className="bg-slate-900 px-4 pb-8 pt-6 dark:bg-slate-950 lg:px-10">
        <div className="mx-auto flex max-w-6xl items-start justify-between gap-4">
          <div className="flex flex-1 flex-col gap-2">
            <div className="h-8 w-40 animate-pulse rounded bg-slate-700" />
            <div className="flex items-center gap-3 rounded-xl border border-slate-700/80 bg-slate-800/50 px-4 py-3">
              <div className="space-y-2">
                <div className="h-3 w-16 animate-pulse rounded bg-slate-600" />
                <div className="h-4 w-24 animate-pulse rounded bg-slate-600" />
                <div className="h-10 w-12 animate-pulse rounded bg-slate-600" />
                <div className="h-3 w-28 animate-pulse rounded bg-slate-600" />
              </div>
              <div className="h-8 w-8 shrink-0 animate-pulse rounded-lg bg-slate-600" />
            </div>
          </div>
          <div className="h-12 w-12 animate-pulse rounded-full bg-slate-700" />
        </div>
      </div>
      <div className="mx-auto max-w-6xl px-4 pb-8 pt-6 lg:px-10 lg:pt-8">
        <div className="grid gap-5 sm:grid-cols-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className={`rounded-[18px] border border-gray-100 bg-white p-5 shadow-[0_4px_20px_rgba(0,0,0,0.06)] dark:border-slate-700 dark:bg-slate-800 dark:shadow-[0_4px_20px_rgba(0,0,0,0.2)] ${i === 3 ? "sm:col-span-2" : ""}`}
            >
              <div className="flex items-start justify-between">
                <div className="h-4 w-24 animate-pulse rounded bg-slate-200 dark:bg-slate-600" />
                <div className="h-10 w-10 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-600" />
              </div>
              <div className="mt-2 h-9 w-20 animate-pulse rounded bg-slate-200 dark:bg-slate-600" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
