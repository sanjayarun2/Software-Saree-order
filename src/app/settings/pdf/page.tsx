"use client";

import React, { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import {
  getPdfSettings,
  upsertPdfSettings,
  uploadPdfLogo,
  uploadPdfLogoFromBlob,
  getPdfLogoPreviewUrl,
  PDF_SECTION_H_MM,
  type PdfContentType,
  type PdfPlacement,
} from "@/lib/pdf-settings-supabase";
import { normalizeAddressBlock } from "@/lib/pdf-utils";
import {
  pickLogoImageNative,
  useNativeLogoPicker,
  isLowResolutionForPrint,
} from "@/lib/pdf-logo-picker";

function getImageDimensionsFromFile(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ width: 0, height: 0 });
    };
    img.src = url;
  });
}

function clampNum(v: number | null | undefined, min: number, max: number, def: number): number {
  if (v == null || typeof v !== "number") return def;
  return Math.max(min, Math.min(max, v));
}

const A4_W_MM = 210;
const PDF_MARGIN_MM = 10;
const PDF_COL_W_MM = (A4_W_MM - PDF_MARGIN_MM * 4) / 3;
// 4mm margin from the section border on both left and right, matching PDF engine.
const PDF_ADDRESS_PADDING_MM = 4; // must match ADDRESS_PADDING in pdf-utils.ts
const PDF_EDGE_SAFE_GAP_MM = 4;   // must match EDGE_SAFE_GAP in pdf-utils.ts
const PDF_ADDRESS_MAX_W_MM = PDF_COL_W_MM - PDF_ADDRESS_PADDING_MM - PDF_EDGE_SAFE_GAP_MM;
const PDF_VERTICAL_OFFSET_MM = 4; // must match VERTICAL_OFFSET in pdf-utils.ts
const PDF_LOGO_BOX_MM = 25; // must match LOGO_MAX_W_MM / LOGO_MAX_H_MM in pdf-utils.ts
const PDF_MAX_TO_SHIFT_MM = 15; // max leftward shift for TO text (logo stays fixed)
const PDF_FROM_X_MM = PDF_MARGIN_MM + PDF_ADDRESS_PADDING_MM;
const PDF_TO_X_MM = PDF_MARGIN_MM + (PDF_COL_W_MM + PDF_MARGIN_MM) * 2 + PDF_ADDRESS_PADDING_MM;
const MM_PER_PT = 25.4 / 72;
const defaultContentType: PdfContentType = "logo";
const defaultPlacement: PdfPlacement = "bottom";
const defaultTextSize = 14;
const defaultCustomText = "";

type YTarget = "from" | "logo" | "to";

export type { PdfContentType, PdfPlacement };

export interface PdfSettings {
  contentType: PdfContentType;
  placement: PdfPlacement;
  textSize: number;
  customText: string;
}

type FileOrPickedLogo = File | { blob: Blob; mimeType: string; width: number; height: number };

export default function PdfSettingsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [contentType, setContentType] = useState<PdfContentType>(defaultContentType);
  const [placement, setPlacement] = useState<PdfPlacement>(defaultPlacement);
  const [textSize, setTextSize] = useState(defaultTextSize);
  const [textBold, setTextBold] = useState(true);
  const [customText, setCustomText] = useState(defaultCustomText);
  const [logoZoom, setLogoZoom] = useState(1.0);
  const [logoPath, setLogoPath] = useState<string | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lowResWarning, setLowResWarning] = useState<string | null>(null);
  const [logoYmm, setLogoYmm] = useState(40);
  const [fromYmm, setFromYmm] = useState(27);
  const [toYmm, setToYmm] = useState(8);
  const [normalizeAddresses, setNormalizeAddresses] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState<YTarget>("logo");
  const useNativePicker = useNativeLogoPicker();
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const [previewPxPerMm, setPreviewPxPerMm] = useState(1);
  const dragTargetRef = useRef<YTarget | null>(null);
  const dragStartYRef = useRef(0);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingYRef = useRef<{ logo?: number; from?: number; to?: number } | null>(null);

  // Sample addresses used in live preview; when "Formalize address" is ON we run them through
  // the same normalizeAddressBlock function that PDF generation uses so behaviour matches.
  const previewFromRaw = "Global Tech Solutions\n123   Innovation   Drive,\nSilicon  Valley ,  CA   94043.\nPh:   +1  555 123 4567";
  const previewToRaw =
    "Anthony   Raj,\nNo.  45, Park View   Apartments,\nChennai ,   Tamil  Nadu  600001.\nPh: +91   98765  43210";
  const previewFromText = normalizeAddresses ? normalizeAddressBlock(previewFromRaw) : previewFromRaw;
  const previewToText = normalizeAddresses ? normalizeAddressBlock(previewToRaw) : previewToRaw;

  useEffect(() => {
    if (!loading && !user) router.replace("/login/");
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoadingSettings(true);
      const row = await getPdfSettings(user.id);
      if (cancelled) return;
      if (row) {
        setContentType(row.content_type);
        setPlacement(row.placement === "top" || row.placement === "bottom" ? row.placement : "bottom");
        setTextSize(row.text_size);
        setTextBold(row.text_bold !== false);
        setCustomText(row.custom_text ?? "");
        setLogoZoom(row.logo_zoom ?? 1.0);
        setLogoYmm(clampNum(row.logo_y_mm, 0, PDF_SECTION_H_MM, 40));
        setFromYmm(clampNum(row.from_y_mm, 0, PDF_SECTION_H_MM, 27));
        setToYmm(clampNum(row.to_y_mm, 0, PDF_SECTION_H_MM, 8));
        const hasLocal =
          typeof window !== "undefined" &&
          window.localStorage.getItem("pdf_normalize_addresses") != null;
        if (!hasLocal) {
          setNormalizeAddresses(!!(row as any).normalize_addresses);
        }
        setLogoPath(row.logo_path);
        if (row.logo_path) {
          const url = await getPdfLogoPreviewUrl(user.id, row.logo_path);
          if (!cancelled) setLogoPreviewUrl(url ?? null);
        } else {
          setLogoPreviewUrl(null);
        }
      }
      setLoadingSettings(false);
    })();
    return () => { cancelled = true; };
  }, [user]);

  // Persist "Formalize address" toggle locally so it stays when user moves between tabs
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem("pdf_normalize_addresses");
      if (raw != null) {
        const v = raw === "true" || raw === "1" || raw === "yes";
        setNormalizeAddresses(v);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        "pdf_normalize_addresses",
        normalizeAddresses ? "true" : "false"
      );
    } catch {
      // ignore
    }
  }, [normalizeAddresses]);

  useEffect(() => {
    if (!user || !logoPath) return;
    let cancelled = false;
    getPdfLogoPreviewUrl(user.id, logoPath).then((url) => {
      if (!cancelled) setLogoPreviewUrl(url ?? null);
    });
    return () => { cancelled = true; };
  }, [user, logoPath]);

  useEffect(() => {
    const updatePreviewScale = () => {
      const rect = previewContainerRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0) return;
      setPreviewPxPerMm(rect.width / A4_W_MM);
    };
    updatePreviewScale();
    window.addEventListener("resize", updatePreviewScale);
    return () => window.removeEventListener("resize", updatePreviewScale);
  }, []);

  const validTypes = ["image/png", "image/jpeg", "image/webp"];

  const processAndUploadLogo = async (fileOrPicked: FileOrPickedLogo): Promise<void> => {
    if (!user) return;
    setSaveError(null);
    setLowResWarning(null);

    let blob: Blob;
    let mimeType: string;
    let width: number;
    let height: number;

    if (fileOrPicked instanceof File) {
      if (!validTypes.includes(fileOrPicked.type)) {
        setSaveError("Please choose a PNG, JPEG or WebP image.");
        return;
      }
      if (fileOrPicked.size > 2 * 1024 * 1024) {
        setSaveError("Image must be under 2MB.");
        return;
      }
      blob = fileOrPicked;
      mimeType = fileOrPicked.type;
      const dims = await getImageDimensionsFromFile(fileOrPicked);
      width = dims.width;
      height = dims.height;
    } else {
      blob = fileOrPicked.blob;
      mimeType = fileOrPicked.mimeType;
      width = fileOrPicked.width;
      height = fileOrPicked.height;
    }

    if (isLowResolutionForPrint(width, height)) {
      setLowResWarning("Low resolution: may look blurry when printed. For best quality use at least 300 px on the shorter side.");
    }

    setUploadingLogo(true);
    const { path, error } = await uploadPdfLogoFromBlob(user.id, blob, mimeType);
    setUploadingLogo(false);

    if (error) {
      setSaveError("Upload failed. Try again.");
      return;
    }
    if (path) {
      setLogoPath(path);
      setLogoPreviewUrl(null);
      const freshUrl = await getPdfLogoPreviewUrl(user.id, path);
      setLogoPreviewUrl(freshUrl ?? null);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    e.target.value = "";
    await processAndUploadLogo(file);
  };

  const handleChooseLogoClick = async () => {
    if (!user || uploadingLogo || loadingSettings) return;
    if (useNativePicker) {
      const picked = await pickLogoImageNative();
      if (picked) await processAndUploadLogo(picked);
    } else {
      fileInputRef.current?.click();
    }
  };

  const flushPendingY = () => {
    const pending = pendingYRef.current;
    pendingYRef.current = null;
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (pending) {
      requestAnimationFrame(() => {
        if (pending.logo != null) setLogoYmm((prev) => Math.max(0, Math.min(PDF_SECTION_H_MM, prev + pending.logo!)));
        if (pending.from != null) setFromYmm((prev) => Math.max(0, Math.min(PDF_SECTION_H_MM, prev + pending.from!)));
        if (pending.to != null) setToYmm((prev) => Math.max(0, Math.min(PDF_SECTION_H_MM, prev + pending.to!)));
      });
    }
  };

  const scheduleDebouncedY = (delta: { logo?: number; from?: number; to?: number }) => {
    if (!pendingYRef.current) pendingYRef.current = { };
    if (delta.logo != null) pendingYRef.current.logo = (pendingYRef.current.logo ?? 0) + delta.logo;
    if (delta.from != null) pendingYRef.current.from = (pendingYRef.current.from ?? 0) + delta.from;
    if (delta.to != null) pendingYRef.current.to = (pendingYRef.current.to ?? 0) + delta.to;
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      const pending = pendingYRef.current;
      pendingYRef.current = null;
      debounceTimerRef.current = null;
      if (pending) {
        requestAnimationFrame(() => {
          if (pending.logo != null) setLogoYmm((prev) => Math.max(0, Math.min(PDF_SECTION_H_MM, prev + pending.logo!)));
          if (pending.from != null) setFromYmm((prev) => Math.max(0, Math.min(PDF_SECTION_H_MM, prev + pending.from!)));
          if (pending.to != null) setToYmm((prev) => Math.max(0, Math.min(PDF_SECTION_H_MM, prev + pending.to!)));
        });
      }
    }, 250);
  };

  const dragPointerIdRef = useRef<number | null>(null);

  const handlePreviewPointerDown = (e: React.PointerEvent, target: YTarget) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedTarget(target);
    dragTargetRef.current = target;
    dragStartYRef.current = e.clientY;
    dragPointerIdRef.current = e.pointerId;
    const container = previewContainerRef.current;
    if (container) container.setPointerCapture(e.pointerId);
  };

  const handlePreviewPointerMove = (e: React.PointerEvent) => {
    if (dragTargetRef.current == null) return;
    const container = previewContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const deltaPx = e.clientY - dragStartYRef.current;
    const realMmPerPx = PDF_SECTION_H_MM / rect.height;
    const deltaMm = deltaPx * realMmPerPx;
    const d: { logo?: number; from?: number; to?: number } = {};
    d[dragTargetRef.current] = deltaMm;
    scheduleDebouncedY(d);
    dragStartYRef.current = e.clientY;
  };

  const handlePreviewPointerUp = () => {
    if (dragTargetRef.current) {
      flushPendingY();
      dragTargetRef.current = null;
      const container = previewContainerRef.current;
      if (container && dragPointerIdRef.current != null) {
        try { container.releasePointerCapture(dragPointerIdRef.current); } catch { /* already released */ }
      }
      dragPointerIdRef.current = null;
    }
  };

  const selectedValue = selectedTarget === "logo" ? logoYmm : selectedTarget === "from" ? fromYmm : toYmm;
  const setSelectedValue = selectedTarget === "logo" ? setLogoYmm : selectedTarget === "from" ? setFromYmm : setToYmm;
  const scaledFontPx = textSize * MM_PER_PT * previewPxPerMm;
  const scaledAddressLineHeightPx = textSize * 0.5 * previewPxPerMm;
  const LABEL_TO_ADDRESS_GAP_MM = 6;
  const scaledAddressGapPx = LABEL_TO_ADDRESS_GAP_MM * previewPxPerMm;
  const scaledCenterLineHeightPx = textSize * 0.4 * previewPxPerMm;
  const stepY = (dir: 1 | -1) => {
    setSelectedValue((v) => Math.max(0, Math.min(PDF_SECTION_H_MM, +(v + dir).toFixed(1))));
  };

  const handleReset = async () => {
    if (!user) return;
    // Restore UI controls to app defaults
    setContentType(defaultContentType);
    setPlacement(defaultPlacement);
    setTextSize(defaultTextSize);
    setTextBold(true);
    setCustomText(defaultCustomText);
    setLogoZoom(1.0);
    setLogoYmm(40);
    setFromYmm(27);
    setToYmm(8);
    setNormalizeAddresses(false);
    setLogoPath(null);
    setLogoPreviewUrl(null);
    setSelectedTarget("logo");
    setLowResWarning(null);
    setSaveError(null);
    setSaved(false);

    // Persist defaults immediately so PDF generation stays in sync
    const { error } = await upsertPdfSettings(user.id, {
      content_type: defaultContentType,
      placement: defaultPlacement,
      text_size: defaultTextSize,
      text_bold: true,
      custom_text: defaultCustomText,
      logo_path: null,
      logo_zoom: 1.0,
      logo_y_mm: 40,
      from_y_mm: 27,
      to_y_mm: 8,
      normalize_addresses: false,
    });

    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem("pdf_normalize_addresses", "false");
      }
    } catch {
      // ignore localStorage failures
    }

    if (error) {
      setSaveError("Failed to save. Try again.");
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleSave = async () => {
    if (!user) return;
    setSaveError(null);
    const { error } = await upsertPdfSettings(user.id, {
      content_type: contentType,
      placement,
      text_size: textSize,
      text_bold: textBold,
      custom_text: customText,
      logo_path: logoPath,
      logo_zoom: logoZoom,
      logo_y_mm: logoYmm,
      from_y_mm: fromYmm,
      to_y_mm: toYmm,
      normalize_addresses: normalizeAddresses,
    });
    if (error) {
      setSaveError("Failed to save. Try again.");
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="mx-auto max-w-2xl px-4 py-4 lg:px-10 lg:py-6">
        {/* Header: back (left), centered title - no X button */}
        <header className="relative flex min-h-[44px] items-center justify-center pb-4">
          <Link
            href="/settings"
            className="absolute left-0 flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-slate-700 hover:bg-gray-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            aria-label="Back"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            PDF Settings
          </h1>
        </header>

        {saveError && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
            <span className="flex-1">{saveError}</span>
            {saveError.includes("Upload failed") && (
              <button
                type="button"
                onClick={() => { setSaveError(null); handleChooseLogoClick(); }}
                className="rounded-lg border border-red-300 bg-white px-3 py-1.5 font-medium text-red-700 hover:bg-red-50 dark:border-red-700 dark:bg-slate-800 dark:text-red-300 dark:hover:bg-red-900/20"
              >
                Try again
              </button>
            )}
          </div>
        )}
        {lowResWarning && (
          <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
            {lowResWarning}
          </p>
        )}

        {/* Single card - app-consistent styling (matches dashboard cards) */}
        <div className="overflow-hidden rounded-2xl border border-white/20 bg-white/80 shadow-[0_4px_20px_rgba(0,0,0,0.06)] dark:border-white/10 dark:bg-slate-800/60 dark:shadow-[0_4px_20px_rgba(0,0,0,0.2)]">
          {/* Row 1: Content Type */}
          <div className="flex min-h-[56px] items-center gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-700/80">
            <svg className="h-6 w-6 shrink-0 text-slate-600 dark:text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
            <span className="flex-1 text-base font-medium text-slate-900 dark:text-slate-100">Content Type</span>
            <div className="flex rounded-full bg-gray-100 p-0.5 dark:bg-slate-700">
              <button
                type="button"
                onClick={() => setContentType("text")}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${contentType === "text" ? "bg-primary-500 text-white dark:bg-primary-500" : "text-slate-600 dark:text-slate-300"}`}
              >
                Text
              </button>
              <button
                type="button"
                onClick={() => setContentType("logo")}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${contentType === "logo" ? "bg-primary-500 text-white dark:bg-primary-500" : "text-slate-600 dark:text-slate-300"}`}
              >
                Logo
              </button>
            </div>
          </div>

          {/* Row 2: Y Position — [Label] [From|Logo|To] [ Up ] [ Value ] [ Down ]; Up = move up, Down = move down */}
          <div className="flex min-h-[52px] flex-nowrap items-center gap-3 border-b border-slate-100 px-4 py-2.5 dark:border-slate-700/80">
            <span className="shrink-0 text-sm font-medium text-slate-700 dark:text-slate-300">Y Position</span>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                title="From Address"
                onClick={() => setSelectedTarget("from")}
                className={`flex h-8 w-8 items-center justify-center rounded-lg border transition ${selectedTarget === "from" ? "border-primary-500 ring-2 ring-primary-500/30 dark:border-primary-400" : "border-gray-200 bg-gray-50 dark:border-slate-600 dark:bg-slate-700"}`}
                aria-label="Select From address"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={selectedTarget === "from" ? "text-primary-600 dark:text-primary-400" : "text-slate-500 dark:text-slate-400"}><path d="M17 10H3M21 6H3M17 14H3M21 18H3" /></svg>
              </button>
              <button
                type="button"
                title="Logo / Center"
                onClick={() => setSelectedTarget("logo")}
                className={`flex h-8 w-8 items-center justify-center rounded-lg border transition ${selectedTarget === "logo" ? "border-primary-500 ring-2 ring-primary-500/30 dark:border-primary-400" : "border-gray-200 bg-gray-50 dark:border-slate-600 dark:bg-slate-700"}`}
                aria-label="Select Logo"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={selectedTarget === "logo" ? "text-primary-600 dark:text-primary-400" : "text-slate-500 dark:text-slate-400"}><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="12" cy="10" r="3" /><path d="M7 21v-1a5 5 0 0110 0v1" /></svg>
              </button>
              <button
                type="button"
                title="To Address"
                onClick={() => setSelectedTarget("to")}
                className={`flex h-8 w-8 items-center justify-center rounded-lg border transition ${selectedTarget === "to" ? "border-primary-500 ring-2 ring-primary-500/30 dark:border-primary-400" : "border-gray-200 bg-gray-50 dark:border-slate-600 dark:bg-slate-700"}`}
                aria-label="Select To address"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={selectedTarget === "to" ? "text-primary-600 dark:text-primary-400" : "text-slate-500 dark:text-slate-400"}><path d="M21 10H7M21 6H3M21 14H7M21 18H3" /></svg>
              </button>
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => stepY(-1)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-slate-700 hover:bg-gray-100 active:bg-gray-200 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
                aria-label="Move up"
                title="Move up"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 15l-6-6-6 6" /></svg>
              </button>
              <input
                type="number"
                min={0}
                max={PDF_SECTION_H_MM}
                step={1}
                value={Math.round(selectedValue * 10) / 10}
                onChange={(e) => {
                  const n = parseFloat(e.target.value);
                  if (!Number.isNaN(n)) setSelectedValue(Math.max(0, Math.min(PDF_SECTION_H_MM, n)));
                }}
                className="w-14 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-center text-sm font-medium tabular-nums text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                aria-label={`${selectedTarget} Y mm`}
              />
              <button
                type="button"
                onClick={() => stepY(1)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-slate-700 hover:bg-gray-100 active:bg-gray-200 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
                aria-label="Move down"
                title="Move down"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
              </button>
              <span className="text-xs text-slate-500 dark:text-slate-400">mm</span>
            </div>
          </div>

          {/* Row 3: Text size — label + Bold (next to label), then [Up] [value] [Down] pt — same layout as Y Position */}
          <div className="flex min-h-[52px] flex-nowrap items-center gap-3 border-b border-slate-100 px-4 py-2.5 dark:border-slate-700/80">
            <span className="shrink-0 text-sm font-medium text-slate-700 dark:text-slate-300">Text size</span>
            <button
              type="button"
              title={textBold ? "Bold (on)" : "Not bold (off)"}
              onClick={() => setTextBold((b) => !b)}
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition ${textBold ? "border-primary-500 ring-2 ring-primary-500/30 dark:border-primary-400" : "border-gray-200 bg-gray-50 dark:border-slate-600 dark:bg-slate-700"}`}
              aria-label={textBold ? "Bold" : "Not bold"}
            >
              <span className={`text-sm font-bold ${textBold ? "text-primary-600 dark:text-primary-400" : "text-slate-500 dark:text-slate-400"}`}>B</span>
            </button>
            <div className="ml-auto mr-1 flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => setTextSize((s) => Math.max(10, Math.min(24, s + 1)))}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-slate-700 hover:bg-gray-100 active:bg-gray-200 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
                aria-label="Increase text size"
                title="Increase"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 15l-6-6-6 6" /></svg>
              </button>
              <input
                type="number"
                min={10}
                max={24}
                value={textSize}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (!Number.isNaN(n)) setTextSize(Math.max(10, Math.min(24, n)));
                }}
                className="w-14 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-center text-sm font-medium tabular-nums text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                aria-label="Text size"
              />
              <button
                type="button"
                onClick={() => setTextSize((s) => Math.max(10, Math.min(24, s - 1)))}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-slate-700 hover:bg-gray-100 active:bg-gray-200 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
                aria-label="Decrease text size"
                title="Decrease"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
              </button>
              <span className="text-xs text-slate-500 dark:text-slate-400">pt</span>
            </div>
          </div>

          {/* Row 4: Upload Logo / Enter Text */}
          <div
            className={
              "flex min-h-[56px] items-center gap-3 px-4 py-3" +
              (contentType === "logo" ? " border-b border-slate-100 dark:border-slate-700/80" : "")
            }
          >
            <svg className="h-6 w-6 shrink-0 text-slate-600 dark:text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
            </svg>
            <span className="flex-1 text-base font-medium text-slate-900 dark:text-slate-100">
              {contentType === "logo" ? "Upload Logo" : "Enter Text"}
            </span>
            {contentType === "text" ? (
              <input
                type="text"
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                placeholder="Thank you..."
                className="w-40 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:placeholder-slate-500"
              />
            ) : (
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={handleFileChange}
                  aria-label="Upload logo"
                />
                <button
                  type="button"
                  onClick={handleChooseLogoClick}
                  disabled={uploadingLogo || loadingSettings}
                  className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-gray-100 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
                >
                  {uploadingLogo ? "Uploading..." : logoPath ? "Change logo" : "Choose file"}
                </button>
                {logoPreviewUrl && (
                  <img src={logoPreviewUrl} alt="Logo preview" className="h-8 w-8 rounded-lg object-cover" />
                )}
              </div>
            )}
          </div>

          {/* Row 5: Logo Zoom - only visible when content type is logo */}
          {contentType === "logo" && (
            <div className="flex min-h-[56px] items-center gap-3 px-4 py-3">
              <svg className="h-6 w-6 shrink-0 text-slate-600 dark:text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM10.5 7.5v6m3-3h-6" />
              </svg>
              <span className="flex-1 text-base font-medium text-slate-900 dark:text-slate-100">Logo Zoom</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setLogoZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(1)))}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-lg font-bold text-slate-700 hover:bg-gray-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
                  aria-label="Zoom out"
                >
                  −
                </button>
                <input
                  type="range"
                  min={0.5}
                  max={2}
                  step={0.1}
                  value={logoZoom}
                  onChange={(e) => setLogoZoom(+Number(e.target.value).toFixed(1))}
                  className="h-2 w-20 appearance-none rounded-full bg-gray-200 dark:bg-slate-600 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary-500"
                  aria-label="Logo zoom level"
                />
                <button
                  type="button"
                  onClick={() => setLogoZoom((z) => Math.min(2, +(z + 0.1).toFixed(1)))}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-lg font-bold text-slate-700 hover:bg-gray-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
                  aria-label="Zoom in"
                >
                  +
                </button>
                <span className="w-10 text-right text-sm font-medium text-slate-700 dark:text-slate-300">{logoZoom.toFixed(1)}x</span>
              </div>
            </div>
          )}

          {/* Row 6: Address cleanup toggle (WhatsApp paste normalization for PDF only) */}
          <div className="flex min-h-[56px] items-center gap-3 border-t border-slate-100 px-4 py-3 dark:border-slate-700/80">
            <svg className="h-6 w-6 shrink-0 text-slate-600 dark:text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 4.5h15v3h-15zM4.5 10.5h9v3h-9zM4.5 16.5h6v3h-6z" />
            </svg>
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                Formalize address
              </p>
            </div>
            <button
              type="button"
              onClick={() => setNormalizeAddresses((v) => !v)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full border transition ${
                normalizeAddresses
                  ? "border-primary-500 bg-primary-500/90"
                  : "border-gray-300 bg-gray-200 dark:border-slate-600 dark:bg-slate-700"
              }`}
              aria-pressed={normalizeAddresses}
              aria-label="Toggle address cleanup for PDF"
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
                  normalizeAddresses ? "translate-x-5" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        </div>

        {/* Save / Reset - two equal-width buttons with even spacing to match app layout */}
        <div className="mt-8">
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleReset}
              disabled={loadingSettings}
              className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-3.5 text-base font-semibold text-slate-700 shadow-sm hover:bg-gray-50 active:bg-gray-100 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
            >
              Reset to defaults
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={loadingSettings}
              className="flex-1 rounded-xl bg-primary-500 px-4 py-3.5 text-base font-semibold text-white shadow-sm hover:bg-primary-600 active:bg-primary-700 disabled:opacity-50"
            >
              {saved ? "Saved" : "Save Changes"}
            </button>
          </div>
          <p className="mt-2 text-center text-xs text-slate-500 dark:text-slate-400">
            Live preview below reflects these settings and PDF generation.
          </p>
        </div>

        {/* ── Live Preview ── */}
        <div className="mt-6 w-full px-0">
          <h2 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">Live Preview</h2>
          <div
            ref={previewContainerRef}
            className="relative w-full overflow-hidden bg-white shadow-sm dark:bg-slate-800/50"
            style={{
              aspectRatio: `${A4_W_MM} / ${PDF_SECTION_H_MM}`,
              touchAction: "none",
            }}
            onPointerMove={handlePreviewPointerMove}
            onPointerUp={handlePreviewPointerUp}
            onPointerLeave={handlePreviewPointerUp}
          >
            {/* Inner section border inset by 10mm from full page width, to match PDF margins */}
            <div
              className="pointer-events-none absolute inset-y-0"
              style={{
                left: `${(PDF_MARGIN_MM / A4_W_MM) * 100}%`,
                right: `${(PDF_MARGIN_MM / A4_W_MM) * 100}%`,
                borderLeft: "1px solid rgb(200, 200, 200)",
                borderTop: "1px solid rgb(200, 200, 200)",
                borderRight: "1px solid rgb(200, 200, 200)",
                borderBottom: "1px dashed rgb(200, 200, 200)",
              }}
            />
            {(() => {
              const sectionH = PDF_SECTION_H_MM;
              const lineHeightMm = textSize * 0.5;
              const labelToAddressGapMm = LABEL_TO_ADDRESS_GAP_MM;
              const topPadding = PDF_VERTICAL_OFFSET_MM;
              const bottomPadding = PDF_VERTICAL_OFFSET_MM;

              const fromPreviewLines = previewFromText.split("\n");
              const toPreviewLines = previewToText.split("\n");
              const fromLinesCount = fromPreviewLines.length;
              const toLinesCount = toPreviewLines.length;

              // TO shifts left only when lines exceed available width (logo stays fixed at 50%)
              const toMaxWMm = (A4_W_MM - PDF_MARGIN_MM) - PDF_EDGE_SAFE_GAP_MM - PDF_TO_X_MM;
              const longestLineFraction = toLinesCount > 4 ? 1 : 0;
              const previewToShiftMm = longestLineFraction > 0
                ? Math.min(PDF_MAX_TO_SHIFT_MM, toMaxWMm * 0.15 + 2)
                : 0;
              const toLeftPct =
                ((PDF_TO_X_MM - previewToShiftMm) / A4_W_MM) * 100;
              const logoCenterPct = 50; // logo never moves

              let simFromY = fromYmm;
              let simToY = toYmm;
              let simLogoY = logoYmm;

              const labelYFromMm = simFromY;
              const addressStartYFromMm = simFromY + labelToAddressGapMm;
              const labelYToMm = simToY;
              const addressStartYToMm = simToY + labelToAddressGapMm;
              const fromBlockBottomMm =
                fromLinesCount > 0
                  ? addressStartYFromMm + (fromLinesCount - 1) * lineHeightMm
                  : labelYFromMm;
              const toBlockBottomMm =
                toLinesCount > 0
                  ? addressStartYToMm + (toLinesCount - 1) * lineHeightMm
                  : labelYToMm;
                  const logoBottomMm = simLogoY + PDF_LOGO_BOX_MM / 2;

              const sectionBottomLimitMm = sectionH - bottomPadding;
              const currentMaxBottomMm = Math.max(fromBlockBottomMm, toBlockBottomMm, logoBottomMm);

              if (currentMaxBottomMm > sectionBottomLimitMm) {
                const shiftUpMm = currentMaxBottomMm - sectionBottomLimitMm;
                simFromY -= shiftUpMm;
                simToY -= shiftUpMm;
                simLogoY -= shiftUpMm;
              }

              const fromTopPct = (simFromY / sectionH) * 100;
              const toTopPct = (simToY / sectionH) * 100;
              const logoTopPct = (simLogoY / sectionH) * 100;

              return (
                <>
                  {/* From Address (left): uses settings textSize + textBold so preview matches PDF */}
                  <div
                    role="button"
                    tabIndex={0}
                    data-target="from"
                    className={`absolute cursor-grab select-none text-left transition-shadow ${
                      selectedTarget === "from" ? "ring-2 ring-primary-500/60" : ""
                    }`}
                    style={{
                      top: `${fromTopPct}%`,
                      left: `${(PDF_FROM_X_MM / A4_W_MM) * 100}%`,
                      width: `${(PDF_ADDRESS_MAX_W_MM / A4_W_MM) * 100}%`,
                    }}
                    onPointerDown={(e) => handlePreviewPointerDown(e, "from")}
                  >
                    <p
                      className={`text-[#000] ${textBold ? "font-bold" : "font-normal"}`}
                      style={{ fontSize: `${scaledFontPx}px`, lineHeight: `${scaledAddressLineHeightPx}px` }}
                    >
                      FROM:
                    </p>
                    <p
                      className={`text-[#000] ${textBold ? "font-bold" : "font-normal"}`}
                      style={{
                        fontSize: `${scaledFontPx}px`,
                        lineHeight: `${scaledAddressLineHeightPx}px`,
                        marginTop: `${scaledAddressGapPx - scaledAddressLineHeightPx}px`,
                      }}
                    >
                      {previewFromText.split("\n").map((line, idx) => (
                        <span key={idx}>
                          {line}
                          {idx < previewFromText.split("\n").length - 1 && <br />}
                        </span>
                      ))}
                    </p>
                  </div>

                  {/* Center: Logo (same square box + zoom as PDF) or Custom text; shifts left when TO is long */}
                  <div
                    role="button"
                    tabIndex={0}
                    data-target="logo"
                    className={`absolute flex cursor-grab select-none items-center justify-center overflow-hidden transition-shadow ${
                      selectedTarget === "logo" ? "ring-2 ring-primary-500/60" : ""
                    }`}
                    style={{
                      top: `${logoTopPct}%`,
                      left: `${logoCenterPct}%`,
                      transform: "translate(-50%, -50%)",
                      width: `${(PDF_LOGO_BOX_MM / A4_W_MM) * 100}%`,
                      height: `${(PDF_LOGO_BOX_MM / PDF_SECTION_H_MM) * 100}%`,
                    }}
                    onPointerDown={(e) => handlePreviewPointerDown(e, "logo")}
                  >
                    {contentType === "text" ? (
                      <p
                        className={`max-w-[85%] text-center text-[#000] ${
                          textBold ? "font-bold" : "font-normal"
                        }`}
                        style={{ fontSize: `${scaledFontPx}px`, lineHeight: `${scaledCenterLineHeightPx}px` }}
                      >
                        {customText.trim() || "Thank you…"}
                      </p>
                    ) : (
                      <div
                        className="h-full w-full overflow-hidden"
                        style={{ transform: `scale(${logoZoom})` }}
                      >
                        <img
                          key={logoPath ?? "reference"}
                          src={logoPreviewUrl ?? "/logo2.png"}
                          alt=""
                          className="h-full w-full object-contain object-center"
                          draggable={false}
                        />
                      </div>
                    )}
                  </div>

                  {/* To Address (right side): shifts left when many lines, synced with PDF */}
                  <div
                    role="button"
                    tabIndex={0}
                    data-target="to"
                    className={`absolute cursor-grab select-none text-left transition-shadow ${
                      selectedTarget === "to" ? "ring-2 ring-primary-500/60" : ""
                    }`}
                    style={{
                      top: `${toTopPct}%`,
                      left: `${toLeftPct}%`,
                      width: `${((PDF_ADDRESS_MAX_W_MM + previewToShiftMm) / A4_W_MM) * 100}%`,
                    }}
                    onPointerDown={(e) => handlePreviewPointerDown(e, "to")}
                  >
                    <p
                      className={`text-[#000] ${textBold ? "font-bold" : "font-normal"}`}
                      style={{ fontSize: `${scaledFontPx}px`, lineHeight: `${scaledAddressLineHeightPx}px` }}
                    >
                      TO:
                    </p>
                    <p
                      className={`text-[#000] ${textBold ? "font-bold" : "font-normal"}`}
                      style={{
                        fontSize: `${scaledFontPx}px`,
                        lineHeight: `${scaledAddressLineHeightPx}px`,
                        marginTop: `${scaledAddressGapPx - scaledAddressLineHeightPx}px`,
                      }}
                    >
                      {previewToText.split("\n").map((line, idx) => (
                        <span key={idx}>
                          {line}
                          {idx < previewToText.split("\n").length - 1 && <br />}
                        </span>
                      ))}
                    </p>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
}
