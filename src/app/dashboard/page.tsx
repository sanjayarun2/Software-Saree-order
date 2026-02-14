"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { BentoCard } from "@/components/ui/BentoCard";

export default function DashboardPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login/");
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
        Dashboard
      </h1>
      <p className="text-slate-600 dark:text-slate-400">
        Welcome back{user?.email ? `, ${user.email.split("@")[0]}` : ""}.
      </p>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Link href="/orders/">
          <BentoCard className="min-h-touch cursor-pointer transition hover:shadow-md">
            <div className="flex flex-col items-center gap-2">
              <span className="text-3xl" aria-hidden>📋</span>
              <span className="font-medium">Orders</span>
              <span className="text-sm text-slate-500">View bookings</span>
            </div>
          </BentoCard>
        </Link>
        <Link href="/add-order/">
          <BentoCard className="min-h-touch cursor-pointer transition hover:shadow-md">
            <div className="flex flex-col items-center gap-2">
              <span className="text-3xl" aria-hidden>➕</span>
              <span className="font-medium">Add Order</span>
              <span className="text-sm text-slate-500">Create booking</span>
            </div>
          </BentoCard>
        </Link>
        <Link href="/reports/">
          <BentoCard className="min-h-touch cursor-pointer transition hover:shadow-md">
            <div className="flex flex-col items-center gap-2">
              <span className="text-3xl" aria-hidden>📄</span>
              <span className="font-medium">Reports</span>
              <span className="text-sm text-slate-500">Export PDF</span>
            </div>
          </BentoCard>
        </Link>
      </div>
    </div>
  );
}
