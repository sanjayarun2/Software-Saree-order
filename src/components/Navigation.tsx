"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "@/lib/theme-context";
import { useLanguage } from "@/lib/language-context";
import { logReferralShare } from "@/lib/referral-service";
import { WHATSAPP_SUPPORT_GROUP_URL } from "@/lib/support-links";

const BOTTOM_NAV_ITEMS = [
  { href: "/dashboard", label: "Home", icon: "🏠" },
  { href: "/orders", label: "Orders", icon: "📋" },
  { href: "/add-order", label: "Add Order", icon: "➕" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
];

const NAV_ITEMS_DESKTOP = [
  { href: "/dashboard", label: "Home", icon: "🏠" },
  { href: "/orders", label: "Orders", icon: "📋" },
  { href: "/product-codes", label: "Product codes", icon: "🏷️" },
  { href: "/add-order", label: "Add Order", icon: "➕" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
  { href: "/reports", label: "Reports", icon: "📄" },
];

export function BottomNav({ isWeb = false }: { isWeb?: boolean }) {
  const pathname = usePathname();
  const { t } = useLanguage();

  return (
    <nav
      className={`fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around rounded-t-2xl border-t border-gray-200/80 bg-white/90 py-2 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] backdrop-blur-lg dark:border-slate-700/80 dark:bg-slate-900/95 dark:shadow-[0_-4px_20px_rgba(0,0,0,0.3)] ${isWeb ? "md:hidden" : "lg:hidden"}`}
      style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
      role="navigation"
      aria-label="Main navigation"
    >
      {BOTTOM_NAV_ITEMS.map((item) => {
        const active = pathname === item.href || pathname?.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href + "/"}
            className={`flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-0.5 rounded-lg px-3 py-2 transition-colors ${
              active ? "text-primary-500" : "text-gray-500 dark:text-gray-400"
            }`}
          >
            <span className="text-[22px] leading-none" aria-hidden>
              {item.icon}
            </span>
            <span className="text-[10px] font-medium">{t(item.label === "Home" ? "Dashboard" : item.label)}</span>
          </Link>
        );
      })}
    </nav>
  );
}

interface RailNavProps {
  userInitials?: string;
  userEmail?: string | null;
  userId?: string | null;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
  isWeb?: boolean;
  webCollapsed?: boolean;
  onWebToggle?: () => void;
  onWebMouseEnter?: () => void;
  onWebMouseLeave?: () => void;
}

export function RailNav({
  userInitials,
  userEmail,
  userId,
  mobileOpen = false,
  onMobileClose,
  isWeb = false,
  webCollapsed = false,
  onWebToggle,
  onWebMouseEnter,
  onWebMouseLeave,
}: RailNavProps) {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const { language, setLanguage, t } = useLanguage();

  const navItemActive =
    "bg-primary-100 text-primary-600 dark:bg-primary-900/50 dark:text-primary-300";
  const navItemInactive =
    "text-gray-700 dark:text-gray-300 font-normal";

  const showLabels = !isWeb || !webCollapsed;

  const sidebarContent = (isMobile: boolean) => {
    const sectionSpacing = isMobile ? "mb-4 pb-3" : "mb-6 pb-4";
    const sectionTopMargin = isMobile ? "mt-3" : "mt-4";

    const openWhatsAppGroup = () => {
      if (typeof window !== "undefined") {
        window.open(WHATSAPP_SUPPORT_GROUP_URL, "_blank", "noopener,noreferrer");
      }
      if (isMobile && onMobileClose) {
        onMobileClose();
      }
    };

    const openReferFriend = async () => {
      const driveLink =
        "https://drive.google.com/drive/u/0/folders/1Mgs7hD22Ei1lBzzLO1mJTgzXgazwO6ex";
      if (userId) {
        void logReferralShare({ userId, link: driveLink, channel: "whatsapp" });
      }
      const messageLines = [
        "Hi 👋",
        "I'm using Velo to manage orders.",
        "",
        "You can download / view it here:",
        driveLink,
      ];
      const text = encodeURIComponent(messageLines.join("\n"));
      if (typeof window !== "undefined") {
        window.open(`https://wa.me/?text=${text}`, "_blank", "noopener,noreferrer");
      }
      if (isMobile && onMobileClose) {
        onMobileClose();
      }
    };

    return (
      <>
      {/* User greeting */}
      <div className={`${sectionSpacing} border-b border-gray-200 dark:border-gray-600 ${!showLabels ? "flex justify-center" : ""}`}>
        <div className={`flex items-center gap-3 ${!showLabels ? "justify-center" : ""}`}>
          {userInitials && (
            <div className={`flex shrink-0 items-center justify-center rounded-full bg-primary-100 text-xl font-bold text-primary-600 dark:bg-primary-900 dark:text-primary-300 ${showLabels ? "h-14 w-14" : "h-10 w-10 text-base"}`}>
              {userInitials}
            </div>
          )}
          {showLabels && (
            <div className="min-w-0">
              <p className="text-lg font-bold text-gray-900 dark:text-white">{t("Hello,")}</p>
              <p className="truncate text-sm font-normal text-gray-600 dark:text-gray-400">
                {userEmail || "User"}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Theme toggle */}
      {showLabels && (
      <div className={`${sectionSpacing} border-b border-gray-200 dark:border-gray-600`}>
        <p className="mb-2 text-sm font-normal text-gray-700 dark:text-gray-300">{t("Theme")}</p>
        <div className="flex gap-1 rounded-lg bg-gray-100 p-1 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => setTheme("light")}
            className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-normal transition-colors ${
              theme === "light"
                ? "bg-primary-500 text-white shadow-sm dark:bg-primary-600"
                : "text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-300"
            }`}
          >
            <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            {t("Light")}
          </button>
          <button
            type="button"
            onClick={() => setTheme("dark")}
            className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-normal transition-colors ${
              theme === "dark"
                ? "bg-primary-500 text-white shadow-sm dark:bg-primary-600"
                : "text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-300"
            }`}
          >
            <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
            {t("Dark")}
          </button>
        </div>
      </div>
      )}

      {/* Language toggle */}
      {showLabels && (
      <div className={`${sectionSpacing} border-b border-gray-200 dark:border-gray-600`}>
        <p className="mb-2 text-sm font-normal text-gray-700 dark:text-gray-300">{t("Language")}</p>
        <div className="flex gap-1 rounded-lg bg-gray-100 p-1 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => setLanguage("en")}
            className={`flex flex-1 items-center justify-center rounded-md px-3 py-2 text-sm font-normal transition-colors ${
              language === "en"
                ? "bg-primary-500 text-white shadow-sm dark:bg-primary-600"
                : "text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-300"
            }`}
          >
            EN
          </button>
          <button
            type="button"
            onClick={() => setLanguage("ta")}
            className={`flex flex-1 items-center justify-center rounded-md px-3 py-2 text-sm font-normal transition-colors ${
              language === "ta"
                ? "bg-primary-500 text-white shadow-sm dark:bg-primary-600"
                : "text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-300"
            }`}
          >
            தமிழ்
          </button>
        </div>
      </div>
      )}

      {/* Nav links */}
      <div className="flex flex-1 flex-col gap-0.5">
        {NAV_ITEMS_DESKTOP.map((item) => {
          const active = pathname === item.href || pathname?.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href + (item.href === "/dashboard" ? "/" : "/")}
              onClick={onMobileClose}
              className={`flex items-center gap-3 rounded-lg px-3 py-3 text-base ${
                isMobile ? "min-h-[52px]" : "min-h-[50px]"
              } ${!showLabels ? "justify-center" : ""} ${active ? navItemActive : navItemInactive}`}
              title={t(item.label === "Home" ? "Dashboard" : item.label)}
            >
              <span className="text-xl shrink-0" aria-hidden>
                {item.icon}
              </span>
              {showLabels && (
                <span className="text-base font-normal whitespace-nowrap overflow-hidden">
                  {t(item.label === "Home" ? "Dashboard" : item.label)}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      {/* Bottom actions */}
      <div className={`${sectionTopMargin} flex flex-col gap-0.5 border-t border-gray-200 pt-3 dark:border-gray-600`}>
        <button
          type="button"
          onClick={openReferFriend}
          className={`flex items-center gap-3 rounded-lg px-3 py-3 text-base ${navItemInactive} ${
            isMobile ? "min-h-[52px]" : "min-h-[50px]"
          } ${!showLabels ? "justify-center" : ""}`}
          title={t("Refer a Friend")}
        >
          <span className="text-xl shrink-0" aria-hidden>🎁</span>
          {showLabels && (
            <span className="text-base font-normal whitespace-nowrap overflow-hidden">
              {t("Refer a Friend")}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={openWhatsAppGroup}
          className={`flex items-center gap-3 rounded-lg px-3 py-3 text-base ${navItemInactive} ${
            isMobile ? "min-h-[52px]" : "min-h-[50px]"
          } ${!showLabels ? "justify-center" : ""}`}
          title={t("Join WhatsApp")}
        >
          <span className="text-xl shrink-0" aria-hidden>
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
          </span>
          {showLabels && (
            <span className="text-base font-normal whitespace-nowrap overflow-hidden">
              {t("Join WhatsApp")}
            </span>
          )}
        </button>
      </div>
      <div className={`${sectionTopMargin} flex flex-col gap-0.5 border-t border-gray-200 pt-3 dark:border-gray-600`}>
        <Link
          href="/logout/"
          onClick={onMobileClose}
          className={`flex items-center gap-3 rounded-lg px-3 py-3 text-base ${navItemInactive} ${
            isMobile ? "min-h-[52px]" : "min-h-[50px]"
          } ${!showLabels ? "justify-center" : ""}`}
          title={t("Log out")}
        >
          <span className={`${isMobile ? "h-5 w-5 shrink-0" : "h-6 w-6 shrink-0"}`} aria-hidden>
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </span>
          {showLabels && (
            <span className="text-base font-normal whitespace-nowrap overflow-hidden">
              {t("Log out")}
            </span>
          )}
        </Link>
      </div>
    </>
  );
  };

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
        className={`fixed left-0 top-0 z-[60] flex h-full w-[min(288px,85%)] flex-col overflow-y-auto rounded-r-3xl bg-white py-5 pl-4 pr-4 shadow-[4px_0_24px_rgba(0,0,0,0.12)] dark:bg-slate-900 ${
          mobileOpen ? "flex lg:hidden" : "hidden"
        }`}
        role="navigation"
        aria-label="Side navigation"
      >
        {sidebarContent(true)}
      </aside>

      {/* Desktop sidebar */}
      {isWeb ? (
        <aside
          className="fixed left-0 top-0 z-40 hidden h-full flex-col overflow-y-auto overflow-x-hidden border-r border-gray-200 bg-white py-6 shadow-none transition-[width,padding] duration-200 ease-in-out dark:border-slate-700 dark:bg-slate-900 lg:flex"
          style={{ width: webCollapsed ? 72 : 280, paddingLeft: webCollapsed ? 10 : 18, paddingRight: webCollapsed ? 10 : 18 }}
          role="navigation"
          aria-label="Side navigation"
          onMouseEnter={onWebMouseEnter}
          onMouseLeave={onWebMouseLeave}
        >
          <button
            type="button"
            onClick={onWebToggle}
            className="mb-4 flex h-9 w-9 shrink-0 items-center justify-center self-end rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-slate-800"
            aria-label={webCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <svg className={`h-5 w-5 transition-transform duration-200 ${webCollapsed ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
          {sidebarContent(false)}
        </aside>
      ) : (
        <aside
          className="fixed left-0 top-0 z-40 hidden h-full w-64 flex-col overflow-y-auto rounded-none border-r border-gray-200 bg-white py-6 pl-4 pr-4 shadow-none dark:border-slate-700 dark:bg-slate-900 lg:flex"
          role="navigation"
          aria-label="Side navigation"
        >
          {sidebarContent(false)}
        </aside>
      )}
    </>
  );
}
