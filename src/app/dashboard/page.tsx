"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { BentoCard } from "@/components/ui/BentoCard";
import { DashboardSkeleton } from "@/components/ui/DashboardSkeleton";

export default function DashboardPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login/");
  }, [user, loading, router]);

  if (loading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-4 lg:space-y-10 lg:px-10 lg:py-8">
      <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-slate-100 md:text-2xl">
        Dashboard
      </h1>

      <div className="grid gap-4 md:grid-cols-2 md:gap-6 lg:grid-cols-3">
        <Link href="/orders/" className="block">
          <BentoCard className="flex min-h-[44px] cursor-pointer flex-col items-center justify-center gap-2 py-5 transition hover:shadow-md md:min-h-[50px] md:gap-4 md:py-8">
            <span className="text-3xl md:text-4xl" aria-hidden>📋</span>
            <div className="text-center">
              <p className="text-base font-semibold text-gray-900 dark:text-slate-100 md:text-lg">Orders</p>
              <p className="text-sm text-gray-500 dark:text-slate-400 md:text-base">View bookings</p>
            </div>
          </BentoCard>
        </Link>
        <Link href="/add-order/" className="block">
          <BentoCard className="flex min-h-[44px] cursor-pointer flex-col items-center justify-center gap-2 py-5 transition hover:shadow-md md:min-h-[50px] md:gap-4 md:py-8">
            <span className="text-3xl md:text-4xl" aria-hidden>➕</span>
            <div className="text-center">
              <p className="text-base font-semibold text-gray-900 dark:text-slate-100 md:text-lg">Add Order</p>
              <p className="text-sm text-gray-500 dark:text-slate-400 md:text-base">Create booking</p>
            </div>
          </BentoCard>
        </Link>
        <Link href="/reports/" className="block">
          <BentoCard className="flex min-h-[44px] cursor-pointer flex-col items-center justify-center gap-2 py-5 transition hover:shadow-md md:min-h-[50px] md:gap-4 md:py-8">
            <span className="text-3xl md:text-4xl" aria-hidden>📄</span>
            <div className="text-center">
              <p className="text-base font-semibold text-gray-900 dark:text-slate-100 md:text-lg">Reports</p>
              <p className="text-sm text-gray-500 dark:text-slate-400 md:text-base">Export PDF</p>
            </div>
          </BentoCard>
        </Link>
      </div>
    </div>
  );
}
