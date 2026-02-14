"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Home", icon: "🏠" },
  { href: "/orders", label: "Orders", icon: "📋" },
  { href: "/add-order", label: "Add Order", icon: "➕" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
];

const NAV_ITEMS_DESKTOP = [
  ...NAV_ITEMS,
  { href: "/reports", label: "Reports", icon: "📄" },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around rounded-t-2xl border-t border-white/20 bg-white/80 py-2 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] backdrop-blur-lg lg:hidden"
      style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
      role="navigation"
      aria-label="Main navigation"
    >
      {NAV_ITEMS.map((item) => {
        const active = pathname === item.href || pathname?.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href + "/"}
            className={`flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-0.5 rounded-lg px-3 py-2 ${
              active ? "text-primary-500" : "text-gray-500"
            }`}
          >
            <span className="text-[22px] leading-none" aria-hidden>
              {item.icon}
            </span>
            <span className="text-[10px] font-medium">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

interface RailNavProps {
  userInitials?: string;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function RailNav({ userInitials, mobileOpen = false, onMobileClose }: RailNavProps) {
  const pathname = usePathname();

  const navItemActive =
    "bg-primary-100 text-primary-600 dark:bg-primary-900/50 dark:text-primary-300";
  const navItemInactive =
    "text-gray-700 dark:text-gray-300 font-normal";

  const sidebarContent = (isMobile: boolean) => (
    <>
      {userInitials && (
        <div className="mb-6 pb-4 border-b border-gray-200 dark:border-gray-600">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary-100 text-xl font-bold text-primary-600 dark:bg-primary-900 dark:text-primary-300">
            {userInitials}
          </div>
        </div>
      )}
      <div className="flex flex-1 flex-col gap-0.5">
        {NAV_ITEMS_DESKTOP.map((item) => {
          const active = pathname === item.href || pathname?.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href + (item.href === "/dashboard" ? "/" : "/")}
              onClick={onMobileClose}
              className={`flex items-center gap-3 rounded-lg px-3 py-3 text-base ${
                isMobile ? "min-h-[52px]" : "min-h-[50px] min-w-[50px] flex-col justify-center gap-1 px-2 py-2"
              } ${active ? navItemActive : navItemInactive}`}
              title={item.label}
            >
              <span className={`${isMobile ? "text-xl" : "text-2xl"}`} aria-hidden>
                {item.icon}
              </span>
              <span className={isMobile ? "text-base font-normal" : "text-xs font-medium"}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
        <Link
          href="/logout/"
          onClick={onMobileClose}
          className={`flex items-center gap-3 rounded-lg px-3 py-3 text-base ${navItemInactive} ${
            isMobile ? "min-h-[52px]" : "min-h-[50px] min-w-[50px] flex-col justify-center gap-1 px-2 py-2"
          }`}
          title="Log out"
        >
          <span className={`${isMobile ? "text-xl" : "text-2xl"}`} aria-hidden>
            🚪
          </span>
          <span className={isMobile ? "text-base font-normal" : "text-xs font-medium"}>
            Log out
          </span>
        </Link>
      </div>
    </>
  );

  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          onClick={onMobileClose}
          className="fixed inset-0 z-[60] bg-black/50 lg:hidden"
          aria-label="Close menu"
        />
      )}
      {/* Mobile sidebar: flush left, rounded right, wider, floating shadow */}
      <aside
        className={`fixed left-0 top-0 z-[60] flex h-full w-[min(288px,85%)] flex-col rounded-r-3xl bg-white py-6 pl-4 pr-6 shadow-[4px_0_24px_rgba(0,0,0,0.12)] dark:bg-slate-900 ${
          mobileOpen ? "flex lg:hidden" : "hidden"
        }`}
        role="navigation"
        aria-label="Side navigation"
      >
        {sidebarContent(true)}
      </aside>
      {/* Desktop sidebar: floating panel with margins */}
      <aside
        className={`fixed left-4 top-4 z-40 hidden h-[calc(100vh-2rem)] w-20 flex-col items-center rounded-2xl bg-white py-6 shadow-[0_8px_32px_rgba(0,0,0,0.12)] dark:bg-slate-900 lg:flex`}
        role="navigation"
        aria-label="Side navigation"
      >
        {sidebarContent(false)}
      </aside>
    </>
  );
}
