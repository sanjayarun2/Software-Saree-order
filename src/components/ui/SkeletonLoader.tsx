"use client";

import React from "react";

export function SkeletonLoader({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-[16px] bg-gray-200 ${className}`}
      aria-hidden
    />
  );
}

export function OrderListSkeleton() {
  return (
    <div className="space-y-4 p-6">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-4 rounded-[16px] border border-gray-100 bg-white p-4">
          <SkeletonLoader className="h-10 w-10 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <SkeletonLoader className="h-4 w-3/4" />
            <SkeletonLoader className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}
