"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: "📊" },
  { href: "/orders", label: "Orders", icon: "📋" },
  { href: "/add-order", label: "Add Order", icon: "➕" },
  { href: "/reports", label: "Reports", icon: "📄" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around border-t border-slate-200 bg-white py-2 dark:border-slate-700 dark:bg-slate-900 md:hidden"
      role="navigation"
      aria-label="Main navigation"
    >
      {NAV_ITEMS.slice(0, 4).map((item) => {
        const active = pathname === item.href || pathname?.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex min-h-touch min-w-touch flex-col items-center justify-center gap-0.5 rounded-bento px-3 py-2 ${
              active ? "text-primary-500" : "text-slate-500"
            }`}
          >
            <span className="text-xl" aria-hidden>
              {item.icon}
            </span>
            <span className="text-xs font-medium">{item.label}</span>
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
      className="fixed left-0 top-0 z-40 hidden h-full w-20 flex-col items-center border-r border-slate-200 bg-white py-6 dark:border-slate-700 dark:bg-slate-900 md:flex"
      role="navigation"
      aria-label="Side navigation"
    >
      {userInitials && (
        <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-primary-100 text-sm font-semibold text-primary-600 dark:bg-primary-900 dark:text-primary-300">
          {userInitials}
        </div>
      )}
      <div className="flex flex-1 flex-col gap-2">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname?.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-h-touch min-w-touch flex-col items-center justify-center gap-0.5 rounded-bento px-2 py-2 ${
                active ? "text-primary-500" : "text-slate-500"
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
        href="/logout"
        className="mt-auto flex min-h-touch min-w-touch flex-col items-center justify-center gap-0.5 rounded-bento px-2 py-2 text-slate-500"
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
