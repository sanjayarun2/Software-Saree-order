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
      className="fixed bottom-3 left-3 right-3 z-50 flex items-center justify-around rounded-2xl border border-white/20 bg-white/80 py-2 shadow-lg backdrop-blur-lg lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 20px)" }}
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

export function RailNav({ userInitials }: { userInitials?: string }) {
  const pathname = usePathname();

  return (
    <aside
      className="fixed left-4 top-4 z-40 hidden h-[calc(100vh-2rem)] w-20 flex-col items-center rounded-2xl bg-white py-6 shadow-xl dark:bg-slate-900 lg:flex"
      role="navigation"
      aria-label="Side navigation"
    >
      {userInitials && (
        <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-primary-100 text-sm font-semibold text-primary-600 dark:bg-primary-900 dark:text-primary-300">
          {userInitials}
        </div>
      )}
      <div className="flex flex-1 flex-col gap-2">
        {NAV_ITEMS_DESKTOP.map((item) => {
          const active = pathname === item.href || pathname?.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href + (item.href === "/dashboard" ? "/" : "/")}
              className={`flex min-h-[50px] min-w-[50px] flex-col items-center justify-center gap-1 rounded-lg px-2 py-2 ${
                active
                  ? "bg-gradient-to-r from-primary-500/15 to-primary-500/5 text-primary-600"
                  : "text-gray-500"
              }`}
              title={item.label}
            >
              <span className="text-2xl" aria-hidden>
                {item.icon}
              </span>
              <span className="text-xs font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
      <Link
        href="/logout/"
        className="mt-auto flex min-h-[50px] min-w-[50px] flex-col items-center justify-center gap-1 rounded-lg px-2 py-2 text-gray-500"
        title="Log out"
      >
        <span className="text-2xl" aria-hidden>
          🚪
        </span>
        <span className="text-xs font-medium">Log out</span>
      </Link>
    </aside>
  );
}
