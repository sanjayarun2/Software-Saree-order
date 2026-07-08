"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/language-context";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import {
  readOrderAlertsEnabled,
  writeOrderAlertsEnabled,
} from "@/lib/order-alert-preferences";
import { requestOrderAlertPermission, testOrderAlert } from "@/lib/order-alert-service";

export default function TestSoundSettingsPage() {
  const { user, loading } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const [orderAlertsEnabled, setOrderAlertsEnabled] = useState(true);
  const [testingAlert, setTestingAlert] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/login/");
  }, [user, loading, router]);

  useEffect(() => {
    setOrderAlertsEnabled(readOrderAlertsEnabled());
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <ErrorBoundary>
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-4 lg:px-10 lg:py-6">
        <div className="flex items-center gap-3">
          <Link
            href="/settings/"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-slate-600 hover:bg-gray-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            aria-label={t("Back")}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 lg:text-2xl">
            {t("Order alert sound")}
          </h1>
        </div>

        <div className="overflow-hidden rounded-2xl border border-white/20 bg-white/80 p-4 shadow-[0_4px_20px_rgba(0,0,0,0.06)] dark:border-white/10 dark:bg-slate-800/60 dark:shadow-[0_4px_20px_rgba(0,0,0,0.2)]">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {t("Sound and notification when a new customer order syncs from your website.")}
          </p>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            {t("Use test below to check volume and notification permission before relying on alerts.")}
          </p>
        </div>

        <div className="overflow-hidden rounded-2xl border border-white/20 bg-white/80 p-4 shadow-[0_4px_20px_rgba(0,0,0,0.06)] dark:border-white/10 dark:bg-slate-800/60 dark:shadow-[0_4px_20px_rgba(0,0,0,0.2)]">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {t("Website order alerts")}
          </h2>
          <label className="mt-4 flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={orderAlertsEnabled}
              onChange={async (e) => {
                const enabled = e.target.checked;
                setOrderAlertsEnabled(enabled);
                writeOrderAlertsEnabled(enabled);
                if (enabled) await requestOrderAlertPermission();
              }}
              className="h-5 w-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <span className="text-sm text-slate-700 dark:text-slate-300">
              {t("Enable order alerts")}
            </span>
          </label>
        </div>

        <div className="overflow-hidden rounded-2xl border border-white/20 bg-white/80 p-4 shadow-[0_4px_20px_rgba(0,0,0,0.06)] dark:border-white/10 dark:bg-slate-800/60 dark:shadow-[0_4px_20px_rgba(0,0,0,0.2)]">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {t("Test alert sound")}
          </h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {t("Plays the same sound used when a new website order arrives.")}
          </p>
          <button
            type="button"
            disabled={testingAlert}
            onClick={async () => {
              setTestingAlert(true);
              try {
                await testOrderAlert({ ignoreEnabled: true });
              } finally {
                setTestingAlert(false);
              }
            }}
            className="mt-4 min-h-[44px] w-full rounded-xl bg-primary-500 px-4 text-sm font-semibold text-white hover:bg-primary-600 disabled:opacity-50 sm:w-auto"
          >
            {testingAlert ? t("Working…") : t("Play test sound")}
          </button>
        </div>
      </div>
    </ErrorBoundary>
  );
}
