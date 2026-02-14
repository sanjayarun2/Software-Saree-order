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
    <div className="mx-auto max-w-6xl space-y-10 p-6 md:p-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">
          Dashboard
        </h1>
        <p className="text-base text-gray-600">
          Welcome back{user?.email ? `, ${user.email.split("@")[0]}` : ""}.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Link href="/orders/" className="block">
          <BentoCard className="flex min-h-[50px] cursor-pointer flex-col items-center justify-center gap-4 py-8 transition hover:shadow-md">
            <span className="text-4xl" aria-hidden>📋</span>
            <div className="text-center">
              <p className="text-lg font-semibold text-gray-900">Orders</p>
              <p className="text-base text-gray-500">View bookings</p>
            </div>
          </BentoCard>
        </Link>
        <Link href="/add-order/" className="block">
          <BentoCard className="flex min-h-[50px] cursor-pointer flex-col items-center justify-center gap-4 py-8 transition hover:shadow-md">
            <span className="text-4xl" aria-hidden>➕</span>
            <div className="text-center">
              <p className="text-lg font-semibold text-gray-900">Add Order</p>
              <p className="text-base text-gray-500">Create booking</p>
            </div>
          </BentoCard>
        </Link>
        <Link href="/reports/" className="block">
          <BentoCard className="flex min-h-[50px] cursor-pointer flex-col items-center justify-center gap-4 py-8 transition hover:shadow-md">
            <span className="text-4xl" aria-hidden>📄</span>
            <div className="text-center">
              <p className="text-lg font-semibold text-gray-900">Reports</p>
              <p className="text-base text-gray-500">Export PDF</p>
            </div>
          </BentoCard>
        </Link>
      </div>
    </div>
  );
}
