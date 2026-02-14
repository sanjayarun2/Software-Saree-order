"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { BentoCard } from "@/components/ui/BentoCard";
import { ErrorBoundary } from "@/components/ErrorBoundary";

export default function SettingsPage() {
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
    <ErrorBoundary>
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-4 lg:px-10 lg:py-6">
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 lg:text-2xl">
          Settings
        </h1>
        <BentoCard>
          <p className="text-sm text-slate-600 dark:text-slate-400 lg:text-base">
            App settings (coming soon). Logged in as: {user?.email}
          </p>
        </BentoCard>
      </div>
    </ErrorBoundary>
  );
}
