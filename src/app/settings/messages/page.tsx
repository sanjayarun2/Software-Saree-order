"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/language-context";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { fetchIsListedWorker } from "@/lib/admin-workers-supabase";
import { testChatwootConnection } from "@/lib/chatwoot-api";
import {
  DEFAULT_CHATWOOT_BASE_URL,
  emptyChatwootSettings,
  getChatwootSettings,
  normalizeChatwootBaseUrl,
  upsertChatwootSettings,
} from "@/lib/chatwoot-settings-supabase";

export default function MessagesSettingsPage() {
  const { user, loading } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();

  const [checkingAccess, setCheckingAccess] = useState(true);
  const [loadingRow, setLoadingRow] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [enabled, setEnabled] = useState(false);
  const [baseUrl, setBaseUrl] = useState(DEFAULT_CHATWOOT_BASE_URL);
  const [accessToken, setAccessToken] = useState("");
  const [accountId, setAccountId] = useState("");
  const [inboxId, setInboxId] = useState("");

  useEffect(() => {
    if (!loading && !user) router.replace("/login/");
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
      const { isWorker } = await fetchIsListedWorker();
      if (cancelled) return;
      if (isWorker) {
        router.replace("/settings/");
        return;
      }
      setCheckingAccess(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, router]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoadingRow(true);
    setError(null);
    const row = (await getChatwootSettings(user.id)) ?? emptyChatwootSettings(user.id);
    setEnabled(row.enabled);
    setBaseUrl(row.base_url || DEFAULT_CHATWOOT_BASE_URL);
    setAccessToken(row.access_token);
    setAccountId(row.account_id);
    setInboxId(row.inbox_id);
    setLoadingRow(false);
  }, [user]);

  useEffect(() => {
    if (!checkingAccess && user) void load();
  }, [checkingAccess, user, load]);

  const validate = (): string | null => {
    if (!normalizeChatwootBaseUrl(baseUrl)) return t("Enter your messaging server URL.");
    if (!accessToken.trim()) return t("Enter your access token.");
    if (!/^\d+$/.test(accountId.trim())) return t("Account ID must be a number.");
    if (inboxId.trim() && !/^\d+$/.test(inboxId.trim())) {
      return t("Inbox ID must be a number.");
    }
    return null;
  };

  const handleTest = async () => {
    const validationError = validate();
    setInfo(null);
    if (validationError) {
      setError(validationError);
      return;
    }
    setTesting(true);
    setError(null);
    const result = await testChatwootConnection({
      base_url: normalizeChatwootBaseUrl(baseUrl),
      access_token: accessToken.trim(),
      account_id: accountId.trim(),
      inbox_id: inboxId.trim(),
    });
    setTesting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setInfo(t("Connected successfully."));
  };

  const handleSave = async () => {
    if (!user) return;
    const validationError = enabled ? validate() : null;
    setInfo(null);
    if (validationError) {
      setError(validationError);
      return;
    }
    setSaving(true);
    setError(null);
    const { error: saveError } = await upsertChatwootSettings(user.id, {
      enabled,
      base_url: baseUrl,
      access_token: accessToken,
      account_id: accountId,
      inbox_id: inboxId,
    });
    setSaving(false);
    if (saveError) {
      setError(t("Could not save message settings."));
      return;
    }
    setInfo(t("Message settings saved."));
  };

  if (loading || checkingAccess) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <ErrorBoundary>
      <div className="mx-auto max-w-lg space-y-6 px-4 py-4">
        <div className="flex items-center gap-3">
          <Link
            href="/settings/"
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            aria-label={t("Back")}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            {t("Messages")}
          </h1>
        </div>

        <p className="text-sm text-slate-600 dark:text-slate-400">
          {t(
            "Connect your messaging server to read and reply to WhatsApp, Instagram and Facebook chats inside Velo. Each shop uses its own account ID and access token."
          )}
        </p>

        {error ? (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </p>
        ) : null}
        {info ? (
          <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
            {info}
          </p>
        ) : null}

        {loadingRow ? (
          <div className="flex justify-center py-10">
            <div className="h-7 w-7 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
          </div>
        ) : (
          <div className="space-y-4 rounded-2xl border border-white/20 bg-white/80 p-4 shadow-sm dark:border-white/10 dark:bg-slate-800/60">
            <label className="flex items-center justify-between gap-3 text-sm font-medium text-slate-800 dark:text-slate-100">
              <span>{t("Enable")}</span>
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="h-5 w-5 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
              />
            </label>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                {t("Server URL")}
              </label>
              <input
                type="url"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                autoComplete="off"
                inputMode="url"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
                placeholder="https://chat.yourdomain.com"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                {t("Access token")}
              </label>
              <div className="flex gap-2">
                <input
                  type={showToken ? "text" : "password"}
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  autoComplete="off"
                  className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowToken((v) => !v)}
                  className="shrink-0 rounded-xl bg-slate-100 px-3 text-xs font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-200"
                >
                  {showToken ? t("Hide") : t("Show")}
                </button>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                {t("Account ID")}
              </label>
              <input
                type="text"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                inputMode="numeric"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
                placeholder="1"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                {t("Inbox ID (optional)")}
              </label>
              <input
                type="text"
                value={inboxId}
                onChange={(e) => setInboxId(e.target.value)}
                inputMode="numeric"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
                placeholder={t("Leave empty to show all channels")}
              />
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t(
                "Your WhatsApp, Instagram and Facebook accounts are connected on the messaging server, not here."
              )}
            </p>

            <div className="flex gap-2">
              <button
                type="button"
                disabled={testing || saving}
                onClick={() => void handleTest()}
                className="min-h-[44px] flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
              >
                {testing ? t("Testing…") : t("Test connection")}
              </button>
              <button
                type="button"
                disabled={saving || testing}
                onClick={() => void handleSave()}
                className="min-h-[44px] flex-1 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
              >
                {saving ? t("Saving…") : t("Save")}
              </button>
            </div>

            <Link
              href="/messages/"
              className="block rounded-xl bg-slate-100 px-3 py-2.5 text-center text-sm font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-200"
            >
              {t("Open inbox")}
            </Link>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}
