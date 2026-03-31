"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import {
  getProductCodeSettings,
  saveProductCodeSettings,
  resetProductCodeSettings,
  getDefaultProductCodeSettings,
  type TextPlacement,
  type ProductCodeSettings,
} from "@/lib/product-code-settings";

const PLACEMENTS: { value: TextPlacement; label: string }[] = [
  { value: "top-right", label: "Top Right" },
  { value: "top-left", label: "Top Left" },
  { value: "bottom-left", label: "Bottom Left" },
  { value: "bottom-right", label: "Bottom Right" },
];

const COLORS = [
  { value: "#dc2626", label: "Red" },
  { value: "#ffffff", label: "White" },
  { value: "#000000", label: "Black" },
  { value: "#16a34a", label: "Green" },
  { value: "#2563eb", label: "Blue" },
  { value: "#eab308", label: "Yellow" },
];

const MIN_OFFSET = -20;
const MAX_OFFSET = 40;

function clearProductCodeCaches(): void {
  try {
    const idbDelete = indexedDB.deleteDatabase("saree-pc-batch-img");
    idbDelete.onerror = () => {};
  } catch {
    // ignore
  }
}

export default function ProductCodeSettingsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [settings, setSettings] = useState<ProductCodeSettings>(getDefaultProductCodeSettings);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/login/");
  }, [user, loading, router]);

  useEffect(() => {
    setSettings(getProductCodeSettings());
  }, []);

  function update(partial: Partial<ProductCodeSettings>) {
    setSaved(false);
    setSettings((prev) => ({ ...prev, ...partial }));
  }

  function handleSave() {
    saveProductCodeSettings(settings);
    clearProductCodeCaches();
    setSaved(true);
  }

  function handleReset() {
    resetProductCodeSettings();
    clearProductCodeCaches();
    setSettings(getDefaultProductCodeSettings());
    setSaved(true);
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  if (!user) return null;

  const dynamicFontPx = 36 + settings.sizeOffset;

  return (
    <ErrorBoundary>
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-4 lg:px-10 lg:py-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link
            href="/settings"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-200 text-slate-700 dark:border-slate-600 dark:text-slate-200"
            aria-label="Back to Settings"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 lg:text-2xl">
            Product Code Settings
          </h1>
        </div>

        {/* Preview */}
        <div className="overflow-hidden rounded-2xl border border-white/20 bg-white/80 shadow-[0_4px_20px_rgba(0,0,0,0.06)] dark:border-white/10 dark:bg-slate-800/60 dark:shadow-[0_4px_20px_rgba(0,0,0,0.2)]">
          <div className="px-4 pt-3 pb-2">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Preview
            </p>
          </div>
          <div className="relative mx-4 mb-4 flex aspect-[4/3] items-center justify-center overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-900">
            <span className="text-sm text-slate-400 dark:text-slate-600">Sample Image</span>
            <span
              className="absolute font-bold"
              style={{
                fontSize: `${Math.max(12, dynamicFontPx * 0.55)}px`,
                color: settings.color,
                WebkitTextStroke: `1px rgba(0,0,0,0.6)`,
                ...(settings.placement === "top-right"
                  ? { top: "0.5rem", right: "0.75rem" }
                  : settings.placement === "top-left"
                    ? { top: "0.5rem", left: "0.75rem" }
                    : settings.placement === "bottom-left"
                      ? { bottom: "0.5rem", left: "0.75rem" }
                      : { bottom: "0.5rem", right: "0.75rem" }),
              }}
            >
              A12
            </span>
          </div>
        </div>

        {/* Placement */}
        <div className="overflow-hidden rounded-2xl border border-white/20 bg-white/80 px-4 py-3 shadow-[0_4px_20px_rgba(0,0,0,0.06)] dark:border-white/10 dark:bg-slate-800/60 dark:shadow-[0_4px_20px_rgba(0,0,0,0.2)]">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Text Placement
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {PLACEMENTS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => update({ placement: p.value })}
                className={`min-h-[44px] rounded-xl border px-3 py-2 text-sm font-medium transition ${
                  settings.placement === p.value
                    ? "border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300"
                    : "border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Text Size */}
        <div className="overflow-hidden rounded-2xl border border-white/20 bg-white/80 px-4 py-3 shadow-[0_4px_20px_rgba(0,0,0,0.06)] dark:border-white/10 dark:bg-slate-800/60 dark:shadow-[0_4px_20px_rgba(0,0,0,0.2)]">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Text Size
          </p>
          <div className="mt-3 flex items-center gap-4">
            <button
              type="button"
              disabled={settings.sizeOffset <= MIN_OFFSET}
              onClick={() => update({ sizeOffset: Math.max(MIN_OFFSET, settings.sizeOffset - 4) })}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-lg font-medium disabled:opacity-40 dark:border-slate-600"
              aria-label="Decrease text size"
            >
              −
            </button>
            <div className="flex-1 text-center">
              <span className="text-base font-semibold tabular-nums text-slate-800 dark:text-slate-200">
                {settings.sizeOffset === 0 ? "Default" : `${settings.sizeOffset > 0 ? "+" : ""}${settings.sizeOffset}`}
              </span>
            </div>
            <button
              type="button"
              disabled={settings.sizeOffset >= MAX_OFFSET}
              onClick={() => update({ sizeOffset: Math.min(MAX_OFFSET, settings.sizeOffset + 4) })}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-lg font-medium disabled:opacity-40 dark:border-slate-600"
              aria-label="Increase text size"
            >
              +
            </button>
          </div>
        </div>

        {/* Color */}
        <div className="overflow-hidden rounded-2xl border border-white/20 bg-white/80 px-4 py-3 shadow-[0_4px_20px_rgba(0,0,0,0.06)] dark:border-white/10 dark:bg-slate-800/60 dark:shadow-[0_4px_20px_rgba(0,0,0,0.2)]">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Text Color
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            {COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => update({ color: c.value })}
                className={`flex h-10 w-10 items-center justify-center rounded-full border-2 transition ${
                  settings.color === c.value
                    ? "border-primary-500 ring-2 ring-primary-300 dark:ring-primary-600"
                    : "border-slate-200 dark:border-slate-600"
                }`}
                aria-label={c.label}
              >
                <span
                  className="h-6 w-6 rounded-full"
                  style={{ backgroundColor: c.value, border: c.value === "#ffffff" ? "1px solid #d1d5db" : undefined }}
                />
              </button>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3 pb-8">
          <button
            type="button"
            onClick={handleSave}
            className="min-h-[48px] w-full rounded-xl bg-primary-500 px-4 py-3 text-center text-base font-semibold text-white hover:bg-primary-600 transition"
          >
            {saved ? "Saved!" : "Save & Apply"}
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="min-h-[44px] w-full rounded-xl border border-slate-200 px-4 py-2.5 text-center text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            Reset to Default
          </button>
        </div>
      </div>
    </ErrorBoundary>
  );
}
