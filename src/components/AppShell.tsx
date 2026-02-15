"use client";

import React, { useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { BottomNav, RailNav } from "./Navigation";
import { ErrorBoundary } from "./ErrorBoundary";

const NO_NAV_ROUTES = ["/login", "/register", "/forgot-password"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const pathname = usePathname();
  const hideNav = NO_NAV_ROUTES.some((r) => pathname?.startsWith(r));
  const initials = user?.email?.slice(0, 2).toUpperCase() ?? "U";
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  if (hideNav) {
    return <main className="min-h-screen">{children}</main>;
  }

  return (
    <ErrorBoundary>
      <RailNav
        userInitials={initials}
        userEmail={user?.email}
        mobileOpen={mobileSidebarOpen}
        onMobileClose={() => setMobileSidebarOpen(false)}
      />
      <div className="lg:ml-64">
        <header className="sticky top-0 z-30 flex min-h-[56px] items-center border-b border-gray-200 bg-white px-4 dark:border-slate-700 dark:bg-slate-900 lg:hidden">
          <button
            type="button"
            onClick={() => setMobileSidebarOpen(true)}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-gray-700 active:bg-gray-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:active:bg-slate-700"
            aria-label="Open menu"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </header>
        <main className="min-h-screen pb-28 lg:pb-6">{children}</main>
      </div>
      <BottomNav />
    </ErrorBoundary>
  );
}
