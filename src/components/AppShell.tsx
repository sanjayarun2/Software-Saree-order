"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useIsWeb } from "@/lib/useIsWeb";
import { BottomNav, RailNav } from "./Navigation";
import { ErrorBoundary } from "./ErrorBoundary";
import { DeviceSlotEvictionModal } from "./DeviceSlotEvictionModal";

const NO_NAV_ROUTES = ["/login", "/register", "/forgot-password", "/reset-password", "/update-password", "/verify-success"];

const AUTO_COLLAPSE_MS = 5000;

const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/orders": "Orders",
  "/add-order": "Add Order",
  "/edit-order": "Edit Order",
  "/product-codes": "Product Codes",
  "/settings": "Settings",
  "/reports": "Reports",
};

function getPageTitle(pathname: string | null): string {
  if (!pathname) return "";
  for (const [prefix, title] of Object.entries(PAGE_TITLES)) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) return title;
  }
  return "";
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const pathname = usePathname();
  const isWeb = useIsWeb();
  const hideNav = NO_NAV_ROUTES.some((r) => pathname?.startsWith(r));
  const initials = user?.email?.slice(0, 2).toUpperCase() ?? "U";
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // --- Web sidebar collapse state ---
  const [webCollapsed, setWebCollapsed] = useState(true);
  const collapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearCollapseTimer = useCallback(() => {
    if (collapseTimerRef.current) {
      clearTimeout(collapseTimerRef.current);
      collapseTimerRef.current = null;
    }
  }, []);

  const startCollapseTimer = useCallback(() => {
    clearCollapseTimer();
    collapseTimerRef.current = setTimeout(() => {
      setWebCollapsed(true);
    }, AUTO_COLLAPSE_MS);
  }, [clearCollapseTimer]);

  const handleWebToggle = useCallback(() => {
    setWebCollapsed((prev) => {
      const next = !prev;
      clearCollapseTimer();
      if (!next) startCollapseTimer();
      return next;
    });
  }, [clearCollapseTimer, startCollapseTimer]);

  const handleWebMouseEnter = useCallback(() => {
    clearCollapseTimer();
    setWebCollapsed(false);
  }, [clearCollapseTimer]);

  const handleWebMouseLeave = useCallback(() => {
    startCollapseTimer();
  }, [startCollapseTimer]);

  useEffect(() => clearCollapseTimer, [clearCollapseTimer]);

  // --- Web body class + sidebar width CSS variable ---
  useEffect(() => {
    if (!isWeb) return;
    document.body.classList.add("web-view");
    return () => {
      document.body.classList.remove("web-view");
    };
  }, [isWeb]);

  useEffect(() => {
    if (!isWeb) return;
    document.body.style.setProperty("--web-sidebar-w", `${webCollapsed ? 72 : 280}px`);
  }, [isWeb, webCollapsed]);

  if (hideNav) {
    return <main className="min-h-screen">{children}</main>;
  }

  const sidebarWidth = isWeb ? (webCollapsed ? 72 : 280) : 256;
  const pageTitle = getPageTitle(pathname);

  return (
    <ErrorBoundary>
      <RailNav
        userInitials={initials}
        userEmail={user?.email}
        userId={user?.id}
        mobileOpen={mobileSidebarOpen}
        onMobileClose={() => setMobileSidebarOpen(false)}
        isWeb={isWeb}
        webCollapsed={webCollapsed}
        onWebToggle={handleWebToggle}
        onWebMouseEnter={handleWebMouseEnter}
        onWebMouseLeave={handleWebMouseLeave}
      />

      <div
        className={isWeb ? "" : "lg:ml-64"}
        style={isWeb ? { marginLeft: undefined } : undefined}
      >
        {isWeb && (
          <style>{`@media(min-width:1024px){.web-main-shift{margin-left:${sidebarWidth}px;transition:margin-left 200ms ease-in-out}}`}</style>
        )}

        <div className={isWeb ? "web-main-shift" : ""}>
          {/* Mobile header (native + web < lg) */}
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

          {/* Web desktop top bar (lg+ only) */}
          {isWeb && (
            <header className="sticky top-0 z-30 hidden h-14 items-center justify-between border-b border-gray-200/60 bg-white/80 px-8 backdrop-blur-md dark:border-slate-700/60 dark:bg-slate-900/80 lg:flex">
              <h1 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
                {pageTitle}
              </h1>
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-sm font-bold text-primary-600 dark:bg-primary-900 dark:text-primary-300">
                  {initials}
                </div>
              </div>
            </header>
          )}

          <main className={`min-h-screen ${isWeb ? "pb-6 max-lg:pb-28" : "pb-28 lg:pb-6"}`}>
            {children}
          </main>
        </div>
      </div>

      <BottomNav isWeb={isWeb} />
      <DeviceSlotEvictionModal />
    </ErrorBoundary>
  );
}
