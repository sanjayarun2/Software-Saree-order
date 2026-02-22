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
  type PdfContentType,
  type PdfPlacement,
} from "@/lib/pdf-settings-supabase";
import {
  pickLogoImageNative,
  useNativeLogoPicker,
  isLowResolutionForPrint,
} from "@/lib/pdf-logo-picker";

const defaultContentType: PdfContentType = "logo";
const defaultPlacement: PdfPlacement = "bottom";
const defaultTextSize = 15;
const defaultCustomText = "";

export type { PdfContentType, PdfPlacement };

export interface PdfSettings {
  contentType: PdfContentType;
  placement: PdfPlacement;
  textSize: number;
  customText: string;
}

export default function PdfSettingsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [contentType, setContentType] = useState<PdfContentType>(defaultContentType);
  const [placement, setPlacement] = useState<PdfPlacement>(defaultPlacement);
  const [textSize, setTextSize] = useState(defaultTextSize);
  const [customText, setCustomText] = useState(defaultCustomText);
  const [logoZoom, setLogoZoom] = useState(1.0);
  const [logoPath, setLogoPath] = useState<string | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lowResWarning, setLowResWarning] = useState<string | null>(null);
  const useNativePicker = useNativeLogoPicker();

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
        setCustomText(row.custom_text ?? "");
        setLogoZoom(row.logo_zoom ?? 1.0);
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
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!user || !logoPath) return;
    let cancelled = false;
    getPdfLogoPreviewUrl(user.id, logoPath).then((url) => {
      if (!cancelled) setLogoPreviewUrl(url ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [user, logoPath]);

  const validTypes = ["image/png", "image/jpeg", "image/webp"];

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

  async function processAndUploadLogo(
    fileOrPicked: File | { blob: Blob; mimeType: string; width: number; height: number }
  ): Promise<void> {
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
    // Upload runs asynchronously so the UI stays responsive (no freeze on low-end devices).
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
  }

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

  const handleSave = async () => {
    if (!user) return;
    setSaveError(null);
    const { error } = await upsertPdfSettings(user.id, {
      content_type: contentType,
      placement,
      text_size: textSize,
      custom_text: customText,
      logo_path: logoPath,
      logo_zoom: logoZoom,
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
        {/* Header: back (left), centered title — no X button */}
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

        {/* Single card — app-consistent styling */}
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-slate-600 dark:bg-slate-800">
          {/* Row 1: Content Type */}
          <div className="flex min-h-[56px] items-center gap-3 border-b border-gray-100 px-4 py-3 dark:border-slate-700">
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

          {/* Row 2: Vertical position — Top / Bottom only (horizontal locked to center) */}
          <div className="flex min-h-[56px] items-center gap-3 border-b border-gray-100 px-4 py-3 dark:border-slate-700">
            <svg className="h-6 w-6 shrink-0 text-slate-600 dark:text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 8.689c0-.864.933-1.406 1.683-.977l7.108 4.061a1.125 1.125 0 001.138 0l7.108-4.061A1.125 1.125 0 0021 8.689v8.622c0 .864-.933 1.406-1.683.977l-7.108-4.061a1.125 1.125 0 00-1.138 0l-7.108 4.061A1.125 1.125 0 013 17.311V8.69z" />
            </svg>
            <span className="flex-1 text-base font-medium text-slate-900 dark:text-slate-100">Vertical position</span>
            <div className="flex gap-1">
              {(["top", "bottom"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPlacement(p)}
                  className={`rounded-xl px-3 py-1.5 text-sm font-medium capitalize ${placement === p ? "bg-primary-500 text-white" : "bg-gray-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"}`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Row 3: Text Size */}
          <div className="flex min-h-[56px] items-center gap-3 border-b border-gray-100 px-4 py-3 dark:border-slate-700">
            <svg className="h-6 w-6 shrink-0 text-slate-600 dark:text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" />
            </svg>
            <span className="flex-1 text-base font-medium text-slate-900 dark:text-slate-100">Text Size</span>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={10}
                max={24}
                value={textSize}
                onChange={(e) => setTextSize(Number(e.target.value))}
                className="h-2 w-24 appearance-none rounded-full bg-gray-200 dark:bg-slate-600 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary-500"
                aria-label="Text size"
              />
              <span className="w-8 text-right text-sm font-medium text-slate-700 dark:text-slate-300">{textSize}</span>
            </div>
          </div>

          {/* Row 4: Upload Logo / Enter Text */}
          <div className={`flex min-h-[56px] items-center gap-3 px-4 py-3${contentType === "logo" ? " border-b border-gray-100 dark:border-slate-700" : ""}`}
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
                  {uploadingLogo ? "Uploading…" : logoPath ? "Change logo" : "Choose file"}
                </button>
                {logoPreviewUrl && (
                  <img src={logoPreviewUrl} alt="Logo preview" className="h-8 w-8 rounded-lg object-cover" />
                )}
              </div>
            )}
          </div>

          {/* Row 5: Logo Zoom — only visible when content type is logo */}
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
        </div>

        {/* Save Changes — app primary button */}
        <div className="mt-8">
          <button
            type="button"
            onClick={handleSave}
            disabled={loadingSettings}
            className="w-full rounded-xl bg-primary-500 py-3.5 text-base font-semibold text-white shadow-sm hover:bg-primary-600 active:bg-primary-700 disabled:opacity-50"
          >
            {saved ? "Saved" : "Save Changes"}
          </button>
        </div>
      </div>
    </ErrorBoundary>
  );
}
