"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { BentoCard } from "@/components/ui/BentoCard";
import { IconTrash, IconWhatsApp } from "@/components/ui/OrderIcons";
import { UploadProgressOverlay } from "@/components/products/UploadProgressOverlay";
import {
  getBulkProductBatchImages,
  storedImageToBlob,
} from "@/lib/bulk-product-batch-images";
import { prepareBulkBatchForUpload } from "@/lib/bulk-product-batch-prep";
import {
  batchQtyTotal,
  deleteBulkProductBatch,
  getBulkProductBatches,
  type BulkProductBatchRecord,
} from "@/lib/bulk-product-batch-storage";
import {
  buildBulkBatchShareText,
  uploadBulkProductBatchToWebsite,
} from "@/lib/bulk-product-batch-upload";
import {
  isBatchDownloaded,
  markBatchDownloaded,
  saveProductCodeImagesToGalleryOrDownloads,
  unmarkBatchDownloaded,
} from "@/lib/product-code-gallery";
import { safeFilename } from "@/lib/image-product-code";
import { shareProductCodeImagesAsFiles } from "@/lib/product-code-share";
import { useLanguage } from "@/lib/language-context";

function prepStatusLabel(
  batch: BulkProductBatchRecord,
  t: (k: string) => string
): string | null {
  if (batch.uploadStatus === "done" || batch.lines?.every((l) => l.websiteCode)) {
    return null;
  }
  switch (batch.prepStatus) {
    case "preparing":
      return t("Preparing upload");
    case "ready":
      return t("Ready to upload");
    case "failed":
      return t("Prep failed");
    default:
      return t("Waiting to prepare");
  }
}

function prepStatusClass(prepStatus: BulkProductBatchRecord["prepStatus"]): string {
  switch (prepStatus) {
    case "ready":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200";
    case "preparing":
      return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200";
    case "failed":
      return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200";
    default:
      return "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300";
  }
}

function uploadStatusLabel(
  status: BulkProductBatchRecord["uploadStatus"],
  t: (k: string) => string
): string {
  switch (status) {
    case "done":
      return t("Uploaded");
    case "partial":
      return t("Partial upload");
    case "failed":
      return t("Upload failed");
    case "uploading":
      return t("Uploading");
    default:
      return t("Ready to upload");
  }
}

function uploadStatusClass(status: BulkProductBatchRecord["uploadStatus"]): string {
  switch (status) {
    case "done":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200";
    case "partial":
      return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200";
    case "failed":
      return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200";
    case "uploading":
      return "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200";
    default:
      return "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200";
  }
}

export function BulkBatchList({
  userId,
  setError,
  setInfo,
  onUploaded,
  refreshKey = 0,
}: {
  userId: string;
  setError: (v: string | null) => void;
  setInfo: (v: string | null) => void;
  onUploaded: () => void;
  refreshKey?: number;
}) {
  const { t } = useLanguage();
  const [batches, setBatches] = useState<BulkProductBatchRecord[]>([]);
  const [phase, setPhase] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [galleryBusyId, setGalleryBusyId] = useState<string | null>(null);
  const [shareBusyId, setShareBusyId] = useState<string | null>(null);
  const [uploadBusyId, setUploadBusyId] = useState<string | null>(null);
  const [prepBusyId, setPrepBusyId] = useState<string | null>(null);
  const prepStartedRef = useRef(new Set<string>());

  const loadBatches = useCallback(async () => {
    const list = await getBulkProductBatches(userId);
    setBatches(list);
  }, [userId]);

  const runPrepForBatch = useCallback(
    async (batchId: string) => {
      setPrepBusyId(batchId);
      try {
        await prepareBulkBatchForUpload(userId, batchId);
        await loadBatches();
      } catch {
        prepStartedRef.current.delete(batchId);
        await loadBatches();
      } finally {
        setPrepBusyId(null);
      }
    },
    [userId, loadBatches]
  );

  useEffect(() => {
    void loadBatches();
  }, [loadBatches, refreshKey]);

  useEffect(() => {
    for (const b of batches) {
      if (b.uploadStatus === "done" || b.lines?.every((l) => l.websiteCode)) continue;
      if (b.prepStatus === "ready" || b.prepStatus === "preparing") continue;
      if (prepStartedRef.current.has(b.id)) continue;
      prepStartedRef.current.add(b.id);
      void runPrepForBatch(b.id);
    }
  }, [batches, runPrepForBatch]);

  const handleDeleteBatch = async (batchId: string) => {
    if (!window.confirm(t("Delete this batch?"))) return;
    await deleteBulkProductBatch(userId, batchId);
    unmarkBatchDownloaded(batchId);
    await loadBatches();
  };

  const handleDownloadBatch = async (batch: BulkProductBatchRecord) => {
    if (isBatchDownloaded(batch.id)) {
      const again = window.confirm(t("This batch was already downloaded. Download again?"));
      if (!again) return;
    }
    setGalleryBusyId(batch.id);
    setError(null);
    try {
      const imgs = await getBulkProductBatchImages(userId, batch.id);
      if (!imgs.length) {
        setError(t("No saved images for this batch."));
        return;
      }
      const items = imgs.map((entry) => {
        const blob = storedImageToBlob(entry);
        const ext = entry.mime.includes("png") ? "png" : "jpg";
        return { blob, filename: safeFilename(entry.code, ext) };
      });
      const nativeSaved = await saveProductCodeImagesToGalleryOrDownloads(items, {
        folderName: "VeloBulkProducts",
      });
      markBatchDownloaded(batch.id);
      if (nativeSaved && Capacitor.isNativePlatform()) {
        window.alert(
          t("Saved {count} image(s) to VeloBulkProducts.").replace("{count}", String(items.length))
        );
      }
    } catch (err) {
      setError((err as Error).message || t("Could not save images."));
    } finally {
      setGalleryBusyId(null);
    }
  };

  const handleShareBatch = async (batch: BulkProductBatchRecord) => {
    setShareBusyId(batch.id);
    setError(null);
    try {
      const imgs = await getBulkProductBatchImages(userId, batch.id);
      if (!imgs.length) {
        setError(t("No saved images for this batch."));
        return;
      }
      const items = imgs.map((entry) => {
        const blob = storedImageToBlob(entry);
        const ext = entry.mime.includes("png") ? "png" : "jpg";
        return { blob, filename: safeFilename(entry.code, ext) };
      });
      await shareProductCodeImagesAsFiles(items, {
        title: batch.form.namePrefix.trim() || t("Bulk products"),
        text: buildBulkBatchShareText(batch),
      });
    } catch (err) {
      setError((err as Error).message || t("Could not share."));
    } finally {
      setShareBusyId(null);
    }
  };

  const handleUploadBatch = async (batch: BulkProductBatchRecord) => {
    if (batch.uploadStatus === "uploading") return;
    setUploadBusyId(batch.id);
    setBusy(true);
    setError(null);
    setInfo(null);
    setProgress(5);

    try {
      let activeBatch = batch;
      if (activeBatch.prepStatus !== "ready") {
        setPhase(t("Preparing upload"));
        await prepareBulkBatchForUpload(userId, activeBatch.id);
        const refreshed = (await getBulkProductBatches(userId)).find((b) => b.id === batch.id);
        if (refreshed) activeBatch = refreshed;
      }

      const imgs = await getBulkProductBatchImages(userId, activeBatch.id);
      if (!imgs.length) {
        setError(t("No saved images for this batch."));
        return;
      }

      setPhase(t("Uploading"));
      const result = await uploadBulkProductBatchToWebsite(userId, activeBatch, imgs, {
        onProgress: (p) => {
          setPhase(p.label);
          setProgress(p.percent);
        },
      });

      await loadBatches();
      setPhase(t("Upload complete"));
      setProgress(100);
      const codePreview =
        result.websiteCodes.length > 0
          ? ` ${result.websiteCodes.slice(0, 5).join(", ")}${result.websiteCodes.length > 5 ? "…" : ""}`
          : "";
      setInfo(
        t("Uploaded {count} product(s) to website.").replace("{count}", String(result.uploadedCount)) +
          codePreview
      );
      if (result.failures.length > 0) {
        setError(result.failures.slice(0, 3).join(" "));
      }
      onUploaded();
    } catch (e) {
      setError((e as Error).message);
      await loadBatches();
    } finally {
      setUploadBusyId(null);
      setBusy(false);
      setPhase(null);
      setProgress(0);
    }
  };

  if (batches.length === 0) return null;

  return (
    <>
      <UploadProgressOverlay open={busy} label={phase ?? t("Working…")} progress={progress} />
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">{t("Bulk batches")}</h2>
        {batches.map((b, i) => {
          const qty = batchQtyTotal(b);
          const isUploading = uploadBusyId === b.id;
          const isPreparing = prepBusyId === b.id || b.prepStatus === "preparing";
          const prepLabel = prepStatusLabel(b, t);
          const uploadDone = b.uploadStatus === "done" || b.lines?.every((l) => l.websiteCode);
          return (
            <BentoCard key={b.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-xs font-semibold text-primary-600 dark:bg-primary-900/50 dark:text-primary-300">
                    {i + 1}
                  </span>
                  <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                    {b.form.namePrefix.trim()}
                  </p>
                  {prepLabel ? (
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${prepStatusClass(b.prepStatus)}`}
                    >
                      {isPreparing && b.prepReadyCount
                        ? `${prepLabel} (${b.prepReadyCount}/${b.count})`
                        : prepLabel}
                    </span>
                  ) : null}
                  {!uploadDone ? (
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${uploadStatusClass(b.uploadStatus)}`}
                    >
                      {uploadStatusLabel(b.uploadStatus, t)}
                    </span>
                  ) : (
                    <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
                      {t("Uploaded")}
                    </span>
                  )}
                </div>
                <p className="mt-1 truncate font-mono text-[12px] text-slate-600 dark:text-slate-400">
                  {b.firstCode}
                  {b.count > 1 ? ` → ${b.lastCode}` : ""}
                  <span className="ml-2 text-slate-500">
                    {t("Qty")}: {qty}
                  </span>
                </p>
                {b.form.description.trim() ? (
                  <p className="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">
                    {b.form.description.trim()}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-1">
                <button
                  type="button"
                  onClick={() => void handleDownloadBatch(b)}
                  disabled={galleryBusyId === b.id || isUploading || isPreparing}
                  className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-sky-100 text-sky-700 transition hover:bg-sky-200 disabled:opacity-50 dark:bg-sky-900/40 dark:text-sky-200"
                  title={t("Download")}
                  aria-label={t("Download")}
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <path d="M12 3v11" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M8 10l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => void handleShareBatch(b)}
                  disabled={shareBusyId === b.id || isUploading || isPreparing}
                  className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-emerald-100 text-emerald-700 transition hover:bg-emerald-200 disabled:opacity-50 dark:bg-emerald-900/40 dark:text-emerald-200"
                  title={t("Share stamped images")}
                  aria-label={t("Share stamped images")}
                >
                  <IconWhatsApp className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={() => void handleUploadBatch(b)}
                  disabled={isUploading || isPreparing || uploadDone}
                  className="min-h-[40px] rounded-[12px] bg-primary-500 px-3 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {isUploading
                    ? t("Uploading")
                    : isPreparing
                      ? t("Preparing upload")
                      : uploadDone
                        ? t("Uploaded")
                        : b.prepStatus === "ready"
                          ? t("Upload")
                          : b.uploadStatus === "partial"
                            ? t("Retry upload")
                            : t("Upload")}
                </button>
                <button
                  type="button"
                  onClick={() => void handleDeleteBatch(b.id)}
                  disabled={isUploading}
                  className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-red-50 text-red-600 transition hover:bg-red-100 disabled:opacity-50 dark:bg-red-900/30 dark:text-red-300"
                  title={t("Delete")}
                >
                  <IconTrash className="h-4 w-4" />
                </button>
              </div>
            </BentoCard>
          );
        })}
      </div>
    </>
  );
}
