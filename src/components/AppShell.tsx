"use client";

import React from "react";
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

  if (hideNav) {
    return <main className="min-h-screen">{children}</main>;
  }

  return (
    <ErrorBoundary>
      <RailNav userInitials={initials} />
      <div className="lg:ml-24">
        <main className="min-h-screen pb-28 lg:pb-6">{children}</main>
      </div>
      <BottomNav />
    </ErrorBoundary>
  );
}
