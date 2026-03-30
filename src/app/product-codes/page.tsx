"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { DashboardSkeleton } from "@/components/ui/DashboardSkeleton";
import { BentoCard } from "@/components/ui/BentoCard";
import { IconTrash } from "@/components/ui/OrderIcons";
import { Capacitor } from "@capacitor/core";
import type { DashboardDatePeriod } from "@/lib/dashboard-date-utils";
import { getDashboardDateRange } from "@/lib/dashboard-date-utils";
import { parseYyyyMmDdToLocalDate } from "@/lib/product-code-utils";
import { getProductCodeBatchImages, storedImageToBlob } from "@/lib/product-code-batch-images";
import { saveProductCodeImagesToGalleryOrDownloads } from "@/lib/product-code-gallery";
import {
  deleteProductCodeSourceDraft,
  putProductCodeSourceDraft,
} from "@/lib/product-code-source-draft";
import { safeFilename } from "@/lib/image-product-code";
import { deleteProductCodeBatch, getProductCodeBatches, type ProductCodeBatchRecord } from "@/lib/product-code-storage";
import { useProductCodesDraft } from "./product-codes-context";

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

const MAX_FILES_PER_BATCH = 100;

function batchQtyTotal(b: ProductCodeBatchRecord): number {
  const fromLines = b.lines?.reduce((s, l) => s + l.qty, 0);
  return fromLines != null && fromLines > 0 ? fromLines : b.count;
}

export default function ProductCodesPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { pickDraft, setPickDraft } = useProductCodesDraft();

  const [period, setPeriod] = useState<DashboardDatePeriod>("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [dateDropdownOpen, setDateDropdownOpen] = useState(false);
  const dateDropdownRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<File[]>([]);
  const [batches, setBatches] = useState<ProductCodeBatchRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [galleryBusyId, setGalleryBusyId] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);

  const customReady = period !== "custom" || (Boolean(customFrom) && Boolean(customTo));
  const selectedLabel = PERIOD_OPTIONS.find((o) => o.value === period)?.label ?? "Today";

  const range = useMemo(
    () => getDashboardDateRange(period, customFrom, customTo),
    [period, customFrom, customTo]
  );

  const filteredBatches = useMemo(() => {
    const fromT = parseYyyyMmDdToLocalDate(range.from).getTime();
    const toEnd = parseYyyyMmDdToLocalDate(range.to);
    toEnd.setHours(23, 59, 59, 999);
    const toT = toEnd.getTime();
    return batches.filter((b) => {
      const t = new Date(b.createdAt).getTime();
      return t >= fromT && t <= toT;
    });
  }, [batches, range.from, range.to]);

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
    if (next.length < list.length) setError("Non-image files were skipped.");
    else setError(null);
    setFiles((prev) => [...prev, ...next].slice(0, MAX_FILES_PER_BATCH));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const openPicker = () => {
    fileInputRef.current?.click();
  };

  const goGenerate = async () => {
    if (!customReady || files.length === 0 || preparing) return;
    setPreparing(true);
    setError(null);
    const draftId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `pc-draft-${Date.now()}`;
    try {
      if (pickDraft?.sourceDraftId) {
        await deleteProductCodeSourceDraft(pickDraft.sourceDraftId);
      }
      await putProductCodeSourceDraft(draftId, files);
      flushSync(() => {
        setPickDraft({
          sourceDraftId: draftId,
          fileNames: files.map((file) => file.name),
          period,
          customFrom,
          customTo,
        });
      });
      router.push("/product-codes/process/");
    } catch (err) {
      await deleteProductCodeSourceDraft(draftId);
      setError((err as Error).message || "Could not prepare selected photos.");
    } finally {
      setPreparing(false);
    }
  };

  const handleDeleteBatch = async (e: React.MouseEvent, batchId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user?.id) return;
    if (!window.confirm("Delete this batch?")) return;
    await deleteProductCodeBatch(user.id, batchId);
    await loadBatches();
  };

  const handleSaveBatchToGallery = async (e: React.MouseEvent, batchId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user?.id) return;
    setGalleryBusyId(batchId);
    setError(null);
    try {
      const imgs = await getProductCodeBatchImages(user.id, batchId);
      if (!imgs.length) {
        setError("No saved images for this batch.");
        return;
      }
      const items = imgs.map((entry) => {
        const blob = storedImageToBlob(entry);
        const ext = entry.mime.includes("png") ? "png" : "jpg";
        return { blob, filename: safeFilename(entry.code, ext) };
      });
      const nativeSaved = await saveProductCodeImagesToGalleryOrDownloads(items);
      if (nativeSaved && Capacitor.isNativePlatform()) {
        window.alert(
          `Saved ${items.length} image(s) to Documents → VeloProductCodes. Open your Files app to view or add to Photos.`
        );
      }
    } catch (err) {
      setError((err as Error).message || "Could not save images.");
    } finally {
      setGalleryBusyId(null);
    }
  };

  if (authLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-slate-50 dark:bg-slate-950">
      <div className="bg-slate-900 px-4 pb-6 pt-6 dark:bg-slate-950 lg:px-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-xl font-bold text-white">Product codes</h1>
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
                      <input
                        type="date"
                        value={customFrom}
                        onChange={(e) => setCustomFrom(e.target.value)}
                        className="mb-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                      />
                      <input
                        type="date"
                        value={customTo}
                        onChange={(e) => setCustomTo(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-6xl flex-1 space-y-4 px-4 pb-32 pt-6 lg:px-10 lg:pb-10 lg:pt-8">
        {filteredBatches.length > 0 ? (
          <div className="space-y-3">
            {filteredBatches.map((b, i) => {
              const qty = batchQtyTotal(b);
              return (
                <BentoCard key={b.id} className="flex items-center justify-between gap-3 py-3">
                  <Link
                    href={`/product-codes/batch/?id=${encodeURIComponent(b.id)}`}
                    className="flex min-w-0 flex-1 items-center gap-3 touch-manipulation"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-xs font-semibold text-primary-600 dark:bg-primary-900/50 dark:text-primary-300">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2 text-sm text-gray-500 dark:text-slate-400">
                        <p className="truncate font-mono text-[12px] text-gray-700 dark:text-slate-300">
                          {b.firstCode}
                          {b.count > 1 ? ` → ${b.lastCode}` : ""}
                        </p>
                        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                          Qty: {qty}
                        </span>
                      </div>
                    </div>
                  </Link>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={(e) => void handleSaveBatchToGallery(e, b.id)}
                      disabled={galleryBusyId === b.id}
                      className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-sky-100 text-sky-700 transition hover:bg-sky-200 disabled:opacity-50 dark:bg-sky-900/40 dark:text-sky-200 dark:hover:bg-sky-900/60"
                      title="Save to device / gallery"
                      aria-label="Save to device"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                        <path d="M12 3v11" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M8 10l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => void handleDeleteBatch(e, b.id)}
                      className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-red-50 text-red-600 transition hover:bg-red-100 dark:bg-red-900/30 dark:text-red-300 dark:hover:bg-red-900/50"
                      title="Delete batch"
                    >
                      <IconTrash className="h-4 w-4" />
                    </button>
                  </div>
                </BentoCard>
              );
            })}
          </div>
        ) : batches.length > 0 ? (
          <BentoCard>
            <p className="text-center text-sm text-gray-500 dark:text-slate-400">
              No batches in this period. Try another date range.
            </p>
          </BentoCard>
        ) : null}

        <BentoCard className="py-5">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => onPickFiles(e.target.files)}
          />

          <p className="mb-4 text-center text-base font-medium text-gray-900 dark:text-slate-100">
            {files.length === 0
              ? "No photos selected"
              : `${files.length} photo${files.length === 1 ? "" : "s"} selected`}
          </p>

          {error && (
            <p className="mb-3 rounded-bento bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
              {error}
            </p>
          )}

          <button
            type="button"
            disabled={!customReady || files.length === 0 || preparing}
            onClick={() => void goGenerate()}
            className="min-h-touch w-full rounded-bento bg-primary-500 px-4 py-3 text-base font-semibold text-white hover:bg-primary-600 disabled:opacity-50"
          >
            {preparing ? "Preparing..." : "Generate"}
          </button>
        </BentoCard>
      </div>

      <button
        type="button"
        onClick={openPicker}
        className="fixed right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary-500 text-3xl font-light leading-none text-white shadow-lg transition hover:bg-primary-600 active:scale-95 max-lg:bottom-[calc(7rem+env(safe-area-inset-bottom,0px))] lg:bottom-10"
        aria-label="Add photos"
      >
        +
      </button>
    </div>
  );
}
