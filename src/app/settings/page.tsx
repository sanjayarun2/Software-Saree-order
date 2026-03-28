"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { ErrorBoundary } from "@/components/ErrorBoundary";

function PdfIconOutlined({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  );
}

function PrinterIconOutlined({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25V5.625A2.625 2.625 0 0110.125 3h3.75A2.625 2.625 0 0116.5 5.625V8.25m-9 0h9m-9 0A3.75 3.75 0 003.75 12v3A3.75 3.75 0 007.5 18.75h9A3.75 3.75 0 0020.25 15v-3a3.75 3.75 0 00-3.75-3.75m-9 9v1.125A2.625 2.625 0 0010.125 21h3.75a2.625 2.625 0 002.625-2.625V17.25m-9 0h9" />
    </svg>
  );
}

export default function SettingsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login/");
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <ErrorBoundary>
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-4 lg:px-10 lg:py-6">
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 lg:text-2xl">
          Settings
        </h1>

        <div className="overflow-hidden rounded-2xl border border-white/20 bg-white/80 px-4 py-3 text-sm shadow-[0_4px_20px_rgba(0,0,0,0.06)] dark:border-white/10 dark:bg-slate-800/60 dark:shadow-[0_4px_20px_rgba(0,0,0,0.2)]">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Account
          </p>
          <p className="mt-1 truncate text-base text-slate-900 dark:text-slate-100">{user.email}</p>
        </div>

        <div className="overflow-hidden rounded-2xl border border-white/20 bg-white/80 shadow-[0_4px_20px_rgba(0,0,0,0.06)] dark:border-white/10 dark:bg-slate-800/60 dark:shadow-[0_4px_20px_rgba(0,0,0,0.2)]">
          <Link
            href="/settings/admin"
            className="flex min-h-[56px] items-center gap-3 px-4 py-3 text-left text-slate-900 hover:bg-gray-50 active:bg-gray-100 dark:text-slate-100 dark:hover:bg-slate-700 dark:active:bg-slate-600"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-lg dark:bg-slate-700">
              👤
            </span>
            <span className="flex-1 text-base font-medium">Admin</span>
            <svg className="h-5 w-5 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </Link>
          <div className="border-t border-white/30 dark:border-white/10" />
          <Link
            href="/settings/pdf"
            className="flex min-h-[56px] items-center gap-3 px-4 py-3 text-left text-slate-900 hover:bg-gray-50 active:bg-gray-100 dark:text-slate-100 dark:hover:bg-slate-700 dark:active:bg-slate-600"
          >
            <PdfIconOutlined className="h-6 w-6 shrink-0 text-slate-600 dark:text-slate-400" />
            <span className="flex-1 text-base font-medium">PDF Settings</span>
            <svg className="h-5 w-5 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </Link>
          <div className="border-t border-white/30 dark:border-white/10" />
          <Link
            href="/settings/printer"
            className="flex min-h-[56px] items-center gap-3 px-4 py-3 text-left text-slate-900 hover:bg-gray-50 active:bg-gray-100 dark:text-slate-100 dark:hover:bg-slate-700 dark:active:bg-slate-600"
          >
            <PrinterIconOutlined className="h-6 w-6 shrink-0 text-slate-600 dark:text-slate-400" />
            <span className="flex-1 text-base font-medium">Printer Setup</span>
            <svg className="h-5 w-5 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </div>
    </ErrorBoundary>
  );
}
