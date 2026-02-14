"use client";

import React from "react";

export function DashboardSkeleton() {
  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6 md:p-8">
      <div className="space-y-2">
        <div className="h-8 w-48 animate-pulse rounded-[16px] bg-gray-200" />
        <div className="h-5 w-64 animate-pulse rounded-[16px] bg-gray-100" />
      </div>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-[16px] border border-gray-100 bg-white p-8"
          >
            <div className="flex flex-col items-center gap-4">
              <div className="h-14 w-14 animate-pulse rounded-[16px] bg-gray-200" />
              <div className="h-5 w-24 animate-pulse rounded bg-gray-200" />
              <div className="h-4 w-32 animate-pulse rounded bg-gray-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
