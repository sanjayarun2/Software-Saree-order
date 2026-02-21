"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { ErrorBoundary } from "@/components/ErrorBoundary";

const PDF_SETTINGS_KEY = "saree_pdf_settings";

export type PdfContentType = "text" | "logo";
export type PdfPlacement = "left" | "center" | "right";

export interface PdfSettings {
  contentType: PdfContentType;
  placement: PdfPlacement;
  textSize: number;
  customText: string;
}

const defaultSettings: PdfSettings = {
  contentType: "logo",
  placement: "center",
  textSize: 15,
  customText: "",
};

function loadStoredSettings(): PdfSettings {
  if (typeof window === "undefined") return defaultSettings;
  try {
    const raw = localStorage.getItem(PDF_SETTINGS_KEY);
    if (!raw) return defaultSettings;
    const parsed = JSON.parse(raw) as Partial<PdfSettings>;
    return { ...defaultSettings, ...parsed };
  } catch {
    return defaultSettings;
  }
}

function saveSettings(settings: PdfSettings): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PDF_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}

export default function PdfSettingsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [contentType, setContentType] = useState<PdfContentType>("logo");
  const [placement, setPlacement] = useState<PdfPlacement>("center");
  const [textSize, setTextSize] = useState(15);
  const [customText, setCustomText] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/login/");
  }, [user, loading, router]);

  useEffect(() => {
    const stored = loadStoredSettings();
    setContentType(stored.contentType);
    setPlacement(stored.placement);
    setTextSize(stored.textSize);
    setCustomText(stored.customText);
  }, []);

  const handleSave = () => {
    const settings: PdfSettings = {
      contentType,
      placement,
      textSize,
      customText,
    };
    saveSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#1A1A1A] border-t-transparent" />
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="mx-auto max-w-2xl px-4 py-4 lg:px-10 lg:py-6">
        {/* Header: circular back (left), centered title, circular X (right) */}
        <header className="relative flex min-h-[44px] items-center justify-center pb-4">
          <Link
            href="/settings"
            className="absolute left-0 flex h-10 w-10 items-center justify-center rounded-full border border-[#1A1A1A]/20 bg-[#FFFFFF] text-[#1A1A1A] hover:bg-[#F4F4F4] dark:border-white/20 dark:bg-[#1A1A1A] dark:text-white dark:hover:bg-white/10"
            aria-label="Back"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-xl font-bold text-[#1A1A1A] dark:text-white">
            PDF Settings
          </h1>
          <button
            type="button"
            onClick={() => router.back()}
            className="absolute right-0 flex h-10 w-10 items-center justify-center rounded-full border border-[#1A1A1A]/20 bg-[#FFFFFF] text-[#1A1A1A] hover:bg-[#F4F4F4] dark:border-white/20 dark:bg-[#1A1A1A] dark:text-white dark:hover:bg-white/10"
            aria-label="Close"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </header>

        {/* Single white card, 24px radius */}
        <div className="overflow-hidden rounded-[24px] bg-[#FFFFFF] shadow-sm dark:bg-[#1A1A1A]">
          {/* Row 1: Content Type — Toggle Text / Logo */}
          <div className="flex min-h-[56px] items-center gap-3 border-b border-[#F4F4F4] px-4 py-3 dark:border-white/10">
            <svg className="h-6 w-6 shrink-0 text-[#1A1A1A] dark:text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
            <span className="flex-1 text-base font-medium text-[#1A1A1A] dark:text-white">Content Type</span>
            <div className="flex rounded-full bg-[#F4F4F4] p-0.5 dark:bg-white/10">
              <button
                type="button"
                onClick={() => setContentType("text")}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${contentType === "text" ? "bg-[#1A1A1A] text-white dark:bg-white dark:text-[#1A1A1A]" : "text-[#1A1A1A] dark:text-white"}`}
              >
                Text
              </button>
              <button
                type="button"
                onClick={() => setContentType("logo")}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${contentType === "logo" ? "bg-[#1A1A1A] text-white dark:bg-white dark:text-[#1A1A1A]" : "text-[#1A1A1A] dark:text-white"}`}
              >
                Logo
              </button>
            </div>
          </div>

          {/* Row 2: Placement — Left, Center, Right */}
          <div className="flex min-h-[56px] items-center gap-3 border-b border-[#F4F4F4] px-4 py-3 dark:border-white/10">
            <svg className="h-6 w-6 shrink-0 text-[#1A1A1A] dark:text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
            </svg>
            <span className="flex-1 text-base font-medium text-[#1A1A1A] dark:text-white">Placement</span>
            <div className="flex gap-1">
              {(["left", "center", "right"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPlacement(p)}
                  className={`rounded-lg px-2.5 py-1.5 text-sm font-medium capitalize ${placement === p ? "bg-[#1A1A1A] text-white dark:bg-white dark:text-[#1A1A1A]" : "bg-[#F4F4F4] text-[#1A1A1A] dark:bg-white/10 dark:text-white"}`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Row 3: Text Size */}
          <div className="flex min-h-[56px] items-center gap-3 border-b border-[#F4F4F4] px-4 py-3 dark:border-white/10">
            <svg className="h-6 w-6 shrink-0 text-[#1A1A1A] dark:text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" />
            </svg>
            <span className="flex-1 text-base font-medium text-[#1A1A1A] dark:text-white">Text Size</span>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={10}
                max={24}
                value={textSize}
                onChange={(e) => setTextSize(Number(e.target.value))}
                className="h-2 w-24 appearance-none rounded-full bg-[#F4F4F4] dark:bg-white/20 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#1A1A1A] dark:[&::-webkit-slider-thumb]:bg-white"
                aria-label="Text size"
              />
              <span className="w-8 text-right text-sm font-medium text-[#1A1A1A] dark:text-white">{textSize}</span>
            </div>
          </div>

          {/* Row 4: Upload Logo / Enter Text */}
          <div className="flex min-h-[56px] items-center gap-3 px-4 py-3">
            <svg className="h-6 w-6 shrink-0 text-[#1A1A1A] dark:text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
            </svg>
            <span className="flex-1 text-base font-medium text-[#1A1A1A] dark:text-white">
              {contentType === "logo" ? "Upload Logo" : "Enter Text"}
            </span>
            {contentType === "text" ? (
              <input
                type="text"
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                placeholder="Thank you..."
                className="w-40 rounded-lg border border-[#1A1A1A]/20 bg-[#F4F4F4] px-3 py-2 text-sm text-[#1A1A1A] placeholder-[#1A1A1A]/50 focus:border-[#1A1A1A] focus:outline-none dark:border-white/20 dark:bg-white/10 dark:text-white dark:placeholder-white/50 dark:focus:border-white"
              />
            ) : (
              <button
                type="button"
                className="rounded-lg border border-[#1A1A1A]/20 bg-[#F4F4F4] px-3 py-2 text-sm font-medium text-[#1A1A1A] hover:bg-[#1A1A1A]/10 dark:border-white/20 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
              >
                Choose file
              </button>
            )}
          </div>
        </div>

        {/* Save Changes button */}
        <div className="mt-8">
          <button
            type="button"
            onClick={handleSave}
            className="w-full rounded-[24px] bg-[#1A1A1A] py-3.5 text-base font-semibold text-white hover:opacity-90 active:opacity-95 dark:bg-white dark:text-[#1A1A1A] dark:hover:opacity-90"
          >
            {saved ? "Saved" : "Save Changes"}
          </button>
        </div>
      </div>
    </ErrorBoundary>
  );
}
