"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { AppLogo } from "@/components/AppLogo";
import { supabase } from "@/lib/supabase";

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

function hasVerificationInHash(): boolean {
  if (typeof window === "undefined") return false;
  const hash = window.location.hash;
  return hash.includes("access_token") || hash.includes("type=email");
}

export default function VerifySuccessPage() {
  const [openAppUrl, setOpenAppUrl] = useState("/dashboard/");
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const showModal = useCallback(() => {
    setShowSuccessModal(true);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    setOpenAppUrl(getOpenAppUrl());

    // 1) Hash: handle browsers that don't trigger full reload (cache / frozen tab)
    if (hasVerificationInHash()) {
      showModal();
      return;
    }

    // 2) Auth state: Supabase may have already applied the session from the link
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) {
        showModal();
      }
    });

    return () => subscription.unsubscribe();
  }, [showModal]);

  // Re-check hash on focus (e.g. user returns to tab after opening link in same tab)
  useEffect(() => {
    const onFocus = () => {
      if (hasVerificationInHash()) showModal();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [showModal]);

  return (
    <>
      {/* Full-screen Verification Successful modal */}
      {showSuccessModal && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[var(--bento-bg)] p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="verification-success-title"
        >
          <div className="flex max-w-sm flex-col items-center gap-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40">
              <svg className="h-8 w-8 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 id="verification-success-title" className="text-xl font-bold text-gray-900 dark:text-gray-100">
              Verification Successful
            </h2>
            <p className="text-center text-sm text-gray-600 dark:text-gray-400">
              Your email is verified. You can now sign in to your account.
            </p>
            <div className="flex w-full flex-col gap-3">
              <a
                href={openAppUrl}
                className="w-full rounded-xl bg-primary-500 px-4 py-3 text-center font-semibold text-white hover:bg-primary-600"
              >
                Open App
              </a>
              <button
                type="button"
                onClick={() => setShowSuccessModal(false)}
                className="w-full rounded-xl border border-gray-300 bg-transparent px-4 py-3 font-medium text-gray-700 hover:bg-gray-50 dark:border-slate-600 dark:text-gray-300 dark:hover:bg-slate-800"
              >
                Continue in browser
              </button>
            </div>
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
