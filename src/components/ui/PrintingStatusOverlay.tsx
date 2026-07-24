"use client";

import React, { useEffect } from "react";
import { useLanguage } from "@/lib/language-context";

type PrintingStatusOverlayProps = {
  open: boolean;
  label?: string;
};

/** Centered blocking status while POS/Bluetooth print is in progress. */
export function PrintingStatusOverlay({
  open,
  label,
}: PrintingStatusOverlayProps) {
  const { t } = useLanguage();
  const title = label || t("Printing…");

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/45 px-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-busy="true"
      aria-live="polite"
      aria-label={title}
    >
      <div className="bento-card w-full max-w-sm rounded-2xl border border-white/20 bg-white/95 p-6 text-center shadow-xl dark:border-white/10 dark:bg-slate-900/95">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary-500/10">
          <svg
            className="h-7 w-7 animate-spin text-primary-500"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        </div>

        <p className="text-base font-semibold text-slate-800 dark:text-slate-100">
          {title}
        </p>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          {t("Sending to printer. Please wait…")}
        </p>
      </div>
    </div>
  );
}
