"use client";

import React, { useEffect } from "react";
import { useLanguage } from "@/lib/language-context";

type UploadProgressOverlayProps = {
  open: boolean;
  label: string;
  progress: number;
};

export function startUploadProgressTicker(
  setProgress: (value: number) => void,
  from: number,
  to: number,
  durationMs: number
) {
  const start = Date.now();
  const timer = window.setInterval(() => {
    const elapsed = Date.now() - start;
    const ratio = Math.min(1, elapsed / durationMs);
    setProgress(Math.round(from + (to - from) * ratio));
    if (ratio >= 1) window.clearInterval(timer);
  }, 80);
  return () => window.clearInterval(timer);
}

export function UploadProgressOverlay({ open, label, progress }: UploadProgressOverlayProps) {
  const { t } = useLanguage();
  const clamped = Math.max(0, Math.min(100, Math.round(progress)));

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
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/45 px-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-busy="true"
      aria-label={label}
    >
      <div className="bento-card w-full max-w-sm rounded-2xl border border-white/20 bg-white/95 p-6 text-center shadow-xl dark:border-white/10 dark:bg-slate-900/95">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary-500/10">
          <svg
            className="h-7 w-7 animate-spin text-primary-500"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        </div>

        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{label}</p>
        <p className="mt-2 text-3xl font-bold tabular-nums text-primary-600 dark:text-primary-400">
          {clamped}%
        </p>

        <div className="relative mx-auto mt-4 h-3 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
          <div
            className="h-full rounded-full bg-primary-500 transition-[width] duration-300 ease-out"
            style={{ width: `${clamped}%` }}
          />
          <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-full">
            <div
              className="h-full animate-shimmer bg-gradient-to-r from-transparent via-white/35 to-transparent"
              style={{ width: "200%", marginLeft: "-50%" }}
            />
          </div>
        </div>

        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{t("Please wait…")}</p>
      </div>
    </div>
  );
}
