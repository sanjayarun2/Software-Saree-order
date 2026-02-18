"use client";

import React from "react";

export function DashboardSkeleton() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-4 lg:space-y-8 lg:px-10 lg:py-8">
      <div className="flex justify-between">
        <div className="h-5 w-40 animate-pulse rounded bg-gray-200 dark:bg-slate-600" />
        <div className="h-11 w-11 animate-pulse rounded-full bg-gray-200 dark:bg-slate-600" />
      </div>
      <div className="space-y-2">
        <div className="h-4 w-20 animate-pulse rounded bg-gray-100 dark:bg-slate-700" />
        <div className="flex gap-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-9 w-20 animate-pulse rounded-xl bg-gray-200 dark:bg-slate-600" />
          ))}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-[16px] border border-gray-100 bg-white p-5 dark:border-slate-700 dark:bg-slate-800"
          >
            <div className="flex items-start justify-between">
              <div className="h-4 w-24 animate-pulse rounded bg-gray-200 dark:bg-slate-600" />
              <div className="h-10 w-10 animate-pulse rounded-xl bg-gray-100 dark:bg-slate-600" />
            </div>
            <div className="mt-3 h-9 w-16 animate-pulse rounded bg-gray-200 dark:bg-slate-600" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex min-h-[120px] flex-col items-center justify-center gap-4 rounded-[16px] border border-gray-100 bg-white p-8 dark:border-slate-700 dark:bg-slate-800"
          >
            <div className="h-12 w-12 animate-pulse rounded-[16px] bg-gray-200 dark:bg-slate-600" />
            <div className="h-5 w-24 animate-pulse rounded bg-gray-200 dark:bg-slate-600" />
          </div>
        ))}
      </div>
    </div>
  );
}
