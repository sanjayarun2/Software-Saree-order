"use client";

import React from "react";
import Link from "next/link";

const APP_SCHEME = "sareeorder://";

export default function VerifySuccessPage() {
  const handleOpenApp = () => {
    if (typeof window === "undefined") return;
    const appUrl = window.location.origin || process.env.NEXT_PUBLIC_SITE_URL || "https://software-saree-order.vercel.app";
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isMobile) {
      window.location.href = APP_SCHEME;
      setTimeout(() => {
        window.location.href = appUrl;
      }, 500);
    } else {
      window.location.href = appUrl;
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--bento-bg)] px-6">
      <div className="flex max-w-sm flex-col items-center gap-6 rounded-2xl border border-gray-200 bg-white p-8 shadow-lg dark:border-slate-700 dark:bg-slate-900">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40">
          <svg className="h-8 w-8 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Verified</h1>
        <p className="text-center text-sm text-gray-600 dark:text-gray-400">
          Your email has been verified. You can now sign in to the app.
        </p>
        <button
          type="button"
          onClick={handleOpenApp}
          className="w-full rounded-xl bg-primary-500 px-4 py-3 font-semibold text-white hover:bg-primary-600"
        >
          Open App
        </button>
        <Link
          href="/login/"
          className="text-sm text-primary-600 hover:underline dark:text-primary-400"
        >
          Or continue in browser
        </Link>
      </div>
    </div>
  );
}
