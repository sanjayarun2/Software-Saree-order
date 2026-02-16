"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { AppLogo } from "@/components/AppLogo";
import { getGmailDeepLinkUrl, openGmailApp } from "@/lib/gmail-deep-link";

const APP_SCHEME = "sareeorder://";
const APP_PACKAGE = "com.sareeorder.app";
const SITE_URL = "https://software-saree-order.vercel.app";

function getOpenAppUrl(): string {
  if (typeof window === "undefined") return "/dashboard/";
  const appUrl = window.location.origin || process.env.NEXT_PUBLIC_SITE_URL || SITE_URL;
  const isAndroid = /Android/i.test(navigator.userAgent);
  if (isAndroid) {
    const fallback = encodeURIComponent(appUrl);
    return `intent://open#Intent;scheme=sareeorder;package=${APP_PACKAGE};S.browser_fallback_url=${fallback};end`;
  }
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (isIOS) return APP_SCHEME;
  return "/dashboard/";
}

export default function VerifySuccessPage() {
  const [openAppUrl, setOpenAppUrl] = useState("/dashboard/");
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  useEffect(() => {
    setOpenAppUrl(getOpenAppUrl());
    // Check for access_token in URL hash (Supabase email verification)
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    const hasAccessToken = hash.includes("access_token") || hash.includes("type=email");
    if (hasAccessToken) {
      setShowSuccessModal(true);
      // Clear hash after detecting
      if (typeof window !== "undefined") {
        window.history.replaceState(null, "", window.location.pathname);
      }
    }
  }, []);

  return (
    <>
      {/* Success Modal/Popup */}
      {showSuccessModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowSuccessModal(false)}>
          <div className="flex max-w-sm flex-col items-center gap-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40">
              <svg className="h-8 w-8 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Your email is now verified!</h2>
            <p className="text-center text-sm text-gray-600 dark:text-gray-400">
              You can now sign in to your account.
            </p>
            <button
              onClick={() => setShowSuccessModal(false)}
              className="w-full rounded-xl bg-primary-500 px-4 py-3 font-semibold text-white hover:bg-primary-600"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--bento-bg)] px-6">
        <div className="flex max-w-sm flex-col items-center gap-6 rounded-2xl border border-gray-200 bg-white p-8 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <AppLogo />
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40">
            <svg className="h-8 w-8 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Verified</h1>
          <p className="text-center text-sm text-gray-600 dark:text-gray-400">
            Your email has been verified. You can now sign in to the app.
          </p>
          <a
            href={openAppUrl}
            className="block w-full rounded-xl bg-primary-500 px-4 py-3 text-center font-semibold text-white hover:bg-primary-600"
          >
            Open App
          </a>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              openGmailApp();
            }}
            className="block w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-center font-semibold text-gray-700 hover:bg-gray-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            Open Gmail
          </button>
          <Link
            href="/login/"
            className="text-sm text-primary-600 hover:underline dark:text-primary-400"
          >
            Or continue in browser
          </Link>
        </div>
      </div>
    </>
  );
}
