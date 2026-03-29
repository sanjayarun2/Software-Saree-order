"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { DashboardSkeleton } from "@/components/ui/DashboardSkeleton";
import { getDashboardDateRange } from "@/lib/dashboard-date-utils";
import { parseYyyyMmDdToLocalDate } from "@/lib/product-code-utils";
import { ensureProductCodePrefix } from "@/lib/product-code-prefix-supabase";
import {
  blobToBase64Payload,
  deleteProductCodeBatchImages,
  putProductCodeBatchImages,
} from "@/lib/product-code-batch-images";
import { prependProductCodeBatch, reserveCodesForDay } from "@/lib/product-code-storage";
import {
  downloadBlob,
  extensionForBlob,
  generateValidatedStampedImage,
  safeFilename,
} from "@/lib/image-product-code";
import { useProductCodesDraft } from "../product-codes-context";

function localYyyyMmDd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function ProductCodesProcessPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { pickDraft, setPickDraft } = useProductCodesDraft();

  const [status, setStatus] = useState<"generating" | "ready" | "error">("generating");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[]>([]);
  const [stampedBlobs, setStampedBlobs] = useState<Blob[]>([]);
  const [originals, setOriginals] = useState<File[]>([]);
  const [quantities, setQuantities] = useState<number[]>([]);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);

  const previewUrls = useMemo(
    () => stampedBlobs.map((b) => URL.createObjectURL(b)),
    [stampedBlobs]
  );

  useEffect(() => {
    return () => previewUrls.forEach((u) => URL.revokeObjectURL(u));
  }, [previewUrls]);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login/");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (authLoading) return;
    if (!pickDraft?.files.length) {
      router.replace("/product-codes/");
    }
  }, [authLoading, pickDraft, router]);

  const filesKey = useMemo(
    () =>
      pickDraft?.files.length
        ? pickDraft.files.map((f) => `${f.name}-${f.size}-${f.lastModified}`).join("|")
        : "",
    [pickDraft]
  );

  const genEpochRef = useRef(0);
  const pickDraftRef = useRef(pickDraft);
  pickDraftRef.current = pickDraft;

  const userId = user?.id;

  useEffect(() => {
    const draft = pickDraftRef.current;
    if (!filesKey || authLoading || !userId || !draft?.files.length) return;

    const files = draft.files;
    const period = draft.period;
    const customFrom = draft.customFrom;
    const customTo = draft.customTo;
    const uid = userId;

    const myEpoch = ++genEpochRef.current;
    let cancelled = false;

    const t = window.setTimeout(() => {
      if (myEpoch !== genEpochRef.current) return;

      void (async () => {
        setStatus("generating");
        setProgress(0);
        setError(null);

        try {
          const range = getDashboardDateRange(period, customFrom, customTo);
          const anchorDate = parseYyyyMmDdToLocalDate(range.from);
          const prefix = await ensureProductCodePrefix();
          if (cancelled || myEpoch !== genEpochRef.current) return;
          const dayKey = localYyyyMmDd(new Date());
          const { codes: reserved } = await reserveCodesForDay(
            uid,
            dayKey,
            prefix,
            anchorDate,
            files.length
          );
          if (cancelled || myEpoch !== genEpochRef.current) return;

          const blobs: Blob[] = [];
          for (let i = 0; i < files.length; i++) {
            if (cancelled || myEpoch !== genEpochRef.current) return;
            const stamped = await generateValidatedStampedImage(files[i]!, reserved[i]!);
            blobs.push(stamped);
            setProgress(Math.round(((i + 1) / files.length) * 100));
          }

          if (cancelled || myEpoch !== genEpochRef.current) return;
          setCodes(reserved);
          setStampedBlobs(blobs);
          setOriginals(files);
          setQuantities(files.map(() => 1));
          setStatus("ready");
        } catch (e) {
          if (cancelled || myEpoch !== genEpochRef.current) return;
          const msg = e instanceof Error ? e.message : String(e);
          console.error("[product-codes/process]", e);
          setError(msg || "Something went wrong");
          setStatus("error");
        }
      })();
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [filesKey, authLoading, userId]);

  useEffect(() => {
    if (saved || status !== "ready") return;
    const onBeforeUnload = (ev: BeforeUnloadEvent) => {
      ev.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [saved, status]);

  const adjustQty = useCallback((index: number, delta: number) => {
    setQuantities((prev) =>
      prev.map((q, i) => {
        if (i !== index) return q;
        const next = Math.min(999, Math.max(1, q + delta));
        return next;
      })
    );
  }, []);

  const handleSave = useCallback(async () => {
    if (!user?.id || saved || status !== "ready" || codes.length === 0) return;
    setSaving(true);
    const batchId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${codes[0]}`;
    try {
      const lines = codes.map((code, i) => ({ code, qty: quantities[i] ?? 1 }));

      const imageRows = [];
      for (let i = 0; i < stampedBlobs.length; i++) {
        const payload = await blobToBase64Payload(stampedBlobs[i]!);
        imageRows.push({
          code: codes[i]!,
          mime: payload.mime,
          dataBase64: payload.dataBase64,
        });
      }
      await putProductCodeBatchImages(user.id, batchId, imageRows);

      try {
        await prependProductCodeBatch(user.id, {
          id: batchId,
          firstCode: codes[0]!,
          lastCode: codes[codes.length - 1]!,
          count: codes.length,
          createdAt: new Date().toISOString(),
          lines,
        });
      } catch (batchErr) {
        await deleteProductCodeBatchImages(user.id, batchId);
        throw batchErr;
      }

      for (let i = 0; i < stampedBlobs.length; i++) {
        const file = originals[i]!;
        const blob = stampedBlobs[i]!;
        const code = codes[i]!;
        const ext = extensionForBlob(file, blob);
        downloadBlob(blob, safeFilename(code, ext));
        await new Promise((r) => setTimeout(r, 120));
      }

      setSaved(true);
      flushSync(() => setPickDraft(null));
      router.push("/product-codes/");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[product-codes/save]", e);
      setError(msg || "Save failed");
    } finally {
      setSaving(false);
      setLeaveOpen(false);
    }
  }, [user?.id, saved, status, codes, quantities, stampedBlobs, originals, setPickDraft, router]);

  const goBack = useCallback(() => {
    if (saved) {
      router.push("/product-codes/");
      return;
    }
    if (status === "generating") {
      if (window.confirm("Leave? Generation is not finished.")) {
        setPickDraft(null);
        router.push("/product-codes/");
      }
      return;
    }
    if (status === "ready") {
      setLeaveOpen(true);
      return;
    }
    setPickDraft(null);
    router.push("/product-codes/");
  }, [saved, status, setPickDraft, router]);

  const discardAndLeave = useCallback(() => {
    setLeaveOpen(false);
    setPickDraft(null);
    router.push("/product-codes/");
  }, [setPickDraft, router]);

  if (authLoading || !user) {
    return <DashboardSkeleton />;
  }

  if (!pickDraft?.files.length && status === "generating") {
    return <DashboardSkeleton />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 dark:bg-slate-950">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
        <button
          type="button"
          onClick={goBack}
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-200 text-slate-700 dark:border-slate-600 dark:text-slate-200"
          aria-label="Back"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1 className="text-lg font-semibold text-slate-900 dark:text-white">
          {status === "generating" ? "Generating" : status === "ready" ? "Review" : "Error"}
        </h1>
      </header>

      <div className="mx-auto w-full max-w-lg flex-1 px-4 py-6 pb-32">
        {status === "generating" && (
          <div className="space-y-4">
            <p className="text-center text-sm font-medium text-slate-600 dark:text-slate-300">
              Generating product codes… {progress}%
            </p>
            <div className="h-3 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
              <div
                className="h-full rounded-full bg-primary-500 transition-[width] duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {status === "error" && error && (
          <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
            {error}
          </p>
        )}

        {status === "ready" && (
          <ul className="flex flex-col gap-4">
            {codes.map((code, i) => (
              <li
                key={`${code}-${i}`}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800/80"
              >
                <div className="aspect-[4/3] w-full bg-slate-100 dark:bg-slate-900">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={previewUrls[i]} alt="" className="h-full w-full object-contain" />
                </div>
                <div className="flex flex-col gap-3 p-4">
                  <p className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">{code}</p>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-slate-600 dark:text-slate-400">Qty</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => adjustQty(i, -1)}
                        className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-lg font-medium dark:border-slate-600"
                        aria-label="Decrease quantity"
                      >
                        −
                      </button>
                      <span className="min-w-[2rem] text-center text-base font-semibold tabular-nums">
                        {quantities[i] ?? 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => adjustQty(i, 1)}
                        className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-lg font-medium dark:border-slate-600"
                        aria-label="Increase quantity"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {error && status === "ready" && (
          <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
            {error}
          </p>
        )}
      </div>

      {status === "ready" && !saved && (
        <div
          className="fixed left-0 right-0 z-30 border-t border-slate-200 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] dark:border-slate-700 dark:bg-slate-900 max-lg:bottom-[calc(4.25rem+env(safe-area-inset-bottom,0px))] lg:bottom-0 lg:left-64"
        >
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSave()}
            className="min-h-[48px] w-full max-w-lg mx-auto flex rounded-xl bg-primary-500 px-4 py-3 text-base font-semibold text-white hover:bg-primary-600 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      )}

      {leaveOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="leave-title"
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-800"
          >
            <h2 id="leave-title" className="text-lg font-semibold text-slate-900 dark:text-white">
              Save batch?
            </h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              You have not saved this batch. Save before leaving, or discard and go back.
            </p>
            <div className="mt-6 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving}
                className="min-h-[44px] rounded-xl bg-primary-500 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                Save
              </button>
              <button
                type="button"
                onClick={discardAndLeave}
                className="min-h-[44px] rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-800 dark:border-slate-600 dark:text-slate-200"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={() => setLeaveOpen(false)}
                className="min-h-[44px] rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-400"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
