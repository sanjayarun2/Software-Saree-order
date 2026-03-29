"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { DashboardSkeleton } from "@/components/ui/DashboardSkeleton";
import {
  getDashboardDateRange,
  type DashboardDatePeriod,
} from "@/lib/dashboard-date-utils";
import { parseYyyyMmDdToLocalDate } from "@/lib/product-code-utils";
import { ensureProductCodePrefix } from "@/lib/product-code-prefix-supabase";
import {
  getProductCodeBatches,
  prependProductCodeBatch,
  reserveCodesForDay,
  type ProductCodeBatchRecord,
} from "@/lib/product-code-storage";
import {
  compressImageFile,
  downloadBlob,
  extensionForBlob,
  safeFilename,
  stampProductCodeOnBlob,
} from "@/lib/image-product-code";

const PERIOD_OPTIONS: { value: DashboardDatePeriod; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "this_week", label: "This Week" },
  { value: "last_week", label: "Last Week" },
  { value: "month", label: "This Month" },
  { value: "last_month", label: "Last Month" },
  { value: "quarter", label: "Quarter" },
  { value: "year", label: "Year" },
  { value: "custom", label: "Custom" },
];

function localYyyyMmDd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const MAX_FILES_PER_BATCH = 40;

export default function ProductCodesPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [period, setPeriod] = useState<DashboardDatePeriod>("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [dateDropdownOpen, setDateDropdownOpen] = useState(false);
  const dateDropdownRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<File[]>([]);
  const [batches, setBatches] = useState<ProductCodeBatchRecord[]>([]);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prefixHint, setPrefixHint] = useState<string | null>(null);

  const range = useMemo(
    () => getDashboardDateRange(period, customFrom, customTo),
    [period, customFrom, customTo]
  );
  const anchorDate = useMemo(() => parseYyyyMmDdToLocalDate(range.from), [range.from]);
  const customReady = period !== "custom" || (Boolean(customFrom) && Boolean(customTo));
  const selectedLabel = PERIOD_OPTIONS.find((o) => o.value === period)?.label ?? "Today";

  const previewUrls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => {
    return () => previewUrls.forEach((u) => URL.revokeObjectURL(u));
  }, [previewUrls]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dateDropdownRef.current && !dateDropdownRef.current.contains(e.target as Node)) {
        setDateDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const loadBatches = useCallback(async () => {
    if (!user?.id) return;
    const list = await getProductCodeBatches(user.id);
    setBatches(list);
  }, [user?.id]);

  useEffect(() => {
    if (user?.id) void loadBatches();
  }, [user?.id, loadBatches]);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login/");
  }, [user, authLoading, router]);

  const onPickFiles = (list: FileList | null) => {
    if (!list?.length) return;
    const next = Array.from(list).filter((f) => f.type.startsWith("image/"));
    if (next.length < list.length) {
      setError("Some files were skipped (images only).");
    } else {
      setError(null);
    }
    setFiles((prev) => [...prev, ...next].slice(0, MAX_FILES_PER_BATCH));
  };

  const startNewBatch = () => {
    setFiles([]);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    fileInputRef.current?.click();
  };

  const generateAndDownload = async () => {
    if (!user?.id || !customReady || files.length === 0 || processing) return;
    setProcessing(true);
    setError(null);
    setPrefixHint(null);

    try {
      const prefix = await ensureProductCodePrefix();
      setPrefixHint(prefix);
      const dayKey = localYyyyMmDd(new Date());
      const { codes, startSeq } = await reserveCodesForDay(
        user.id,
        dayKey,
        prefix,
        anchorDate,
        files.length
      );

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const code = codes[i];
        const compressed = await compressImageFile(file);
        const stamped = await stampProductCodeOnBlob(compressed, code);
        const ext = extensionForBlob(file, stamped);
        downloadBlob(stamped, safeFilename(code, ext));
        await new Promise((r) => setTimeout(r, 120));
      }

      const batch: ProductCodeBatchRecord = {
        id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${startSeq}`,
        firstCode: codes[0]!,
        lastCode: codes[codes.length - 1]!,
        count: codes.length,
        createdAt: new Date().toISOString(),
      };
      await prependProductCodeBatch(user.id, batch);
      await loadBatches();
      setFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (e) {
      setError((e as Error).message || "Something went wrong");
    } finally {
      setProcessing(false);
    }
  };

  if (authLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-slate-50 dark:bg-slate-950">
      <div className="bg-slate-900 px-4 pb-8 pt-6 dark:bg-slate-950 lg:px-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-3">
          <h1 className="text-xl font-bold text-white">Product codes</h1>
          <p className="text-sm text-slate-300">
            Codes use the date from your selected period (same as dashboard). Sequence advances per calendar day on this device.
          </p>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Anchor date</p>
              <p className="text-lg font-semibold text-white">
                {anchorDate.toLocaleDateString("en-GB", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </p>
            </div>
            <div ref={dateDropdownRef} className="relative shrink-0">
              <button
                type="button"
                onClick={() => setDateDropdownOpen((o) => !o)}
                className="flex min-h-[44px] items-center gap-2 rounded-full border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-200 shadow-sm transition hover:bg-slate-700 active:bg-slate-600"
              >
                {selectedLabel}
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`transition-transform ${dateDropdownOpen ? "rotate-180" : ""}`}
                  aria-hidden
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>

              {dateDropdownOpen && (
                <div className="absolute right-0 top-full z-50 mt-2 w-52 origin-top-right overflow-hidden rounded-2xl border border-slate-200 bg-white py-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-800">
                  {PERIOD_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        setPeriod(opt.value);
                        if (opt.value !== "custom") setDateDropdownOpen(false);
                      }}
                      className={`flex w-full items-center px-4 py-2.5 text-sm font-medium transition ${
                        period === opt.value
                          ? "bg-primary-50 text-primary-700 dark:bg-primary-500/20 dark:text-primary-300"
                          : "text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}

                  {period === "custom" && (
                    <div className="border-t border-slate-100 px-4 py-3 dark:border-slate-700">
                      <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">From</label>
                      <input
                        type="date"
                        value={customFrom}
                        onChange={(e) => setCustomFrom(e.target.value)}
                        className="mb-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                      />
                      <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">To</label>
                      <input
                        type="date"
                        value={customTo}
                        onChange={(e) => setCustomTo(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          {prefixHint && (
            <p className="text-xs text-slate-400">
              Your prefix: <span className="font-mono text-slate-200">{prefixHint}</span>
            </p>
          )}
        </div>
      </div>

      <div className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-4 pb-32 pt-6 lg:px-10 lg:pb-10 lg:pt-8">
        {batches.length > 0 && (
          <section>
            <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Recent batches</h2>
            <ul className="flex flex-col gap-2">
              {batches.map((b) => (
                <li
                  key={b.id}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm dark:border-slate-700 dark:bg-slate-800/80"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-mono text-xs text-slate-900 dark:text-slate-100">
                      {b.firstCode}
                      {b.count > 1 ? ` → ${b.lastCode}` : ""}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {b.count} image{b.count === 1 ? "" : "s"} ·{" "}
                      {new Date(b.createdAt).toLocaleString("en-GB", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800/60">
          <h2 className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-200">Current batch</h2>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => onPickFiles(e.target.files)}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="mb-4 w-full rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-sm font-medium text-slate-600 transition hover:border-primary-400 hover:bg-primary-50/50 dark:border-slate-600 dark:bg-slate-900/40 dark:text-slate-300 dark:hover:border-primary-500"
          >
            Tap to add photos (max {MAX_FILES_PER_BATCH} per batch)
          </button>

          {files.length > 0 && (
            <div className="mb-4 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
              {files.map((f, i) => (
                <div key={`${f.name}-${i}`} className="relative aspect-square overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-900">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={previewUrls[i]} alt="" className="h-full w-full object-cover" />
                </div>
              ))}
            </div>
          )}

          {error && (
            <p className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
              {error}
            </p>
          )}

          <button
            type="button"
            disabled={!customReady || files.length === 0 || processing}
            onClick={() => void generateAndDownload()}
            className="min-h-[48px] w-full rounded-xl bg-primary-500 px-4 py-3 text-base font-semibold text-white hover:bg-primary-600 disabled:opacity-50"
          >
            {processing ? "Working…" : "Generate & download"}
          </button>
          {!customReady && period === "custom" && (
            <p className="mt-2 text-xs text-slate-500">Choose both dates for a custom range.</p>
          )}
        </section>
      </div>

      <button
        type="button"
        onClick={startNewBatch}
        className="fixed right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary-500 text-3xl font-light leading-none text-white shadow-lg transition hover:bg-primary-600 active:scale-95 max-lg:bottom-[calc(7rem+env(safe-area-inset-bottom,0px))] lg:bottom-10"
        aria-label="Start new batch"
      >
        +
      </button>
    </div>
  );
}
