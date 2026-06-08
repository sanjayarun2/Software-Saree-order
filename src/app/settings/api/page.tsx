"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/language-context";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import {
  DEFAULT_VELO_WEBSITE_BASE_URL,
  deleteApiIntegration,
  listApiIntegrations,
  upsertApiIntegration,
  type ApiIntegrationRow,
} from "@/lib/api-settings-supabase";
import { pollVeloWebsiteOrders, testVeloWebsiteConnection } from "@/lib/velo-website-sync";

function formatSyncTime(iso: string | null): string {
  if (!iso) return "—";
  return `${new Date(iso).toLocaleDateString("en-GB")} ${new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

export default function ApiSettingsPage() {
  const { user, loading } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();

  const [integrations, setIntegrations] = useState<ApiIntegrationRow[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [label, setLabel] = useState("Velo Website");
  const [apiKey, setApiKey] = useState("");
  const [apiBaseUrl, setApiBaseUrl] = useState(DEFAULT_VELO_WEBSITE_BASE_URL);
  const [enabled, setEnabled] = useState(true);
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const loadIntegrations = useCallback(async () => {
    if (!user) return;
    setLoadingList(true);
    const rows = await listApiIntegrations(user.id);
    setIntegrations(rows);
    setLoadingList(false);
  }, [user]);

  useEffect(() => {
    if (!loading && !user) router.replace("/login/");
  }, [user, loading, router]);

  useEffect(() => {
    void loadIntegrations();
  }, [loadIntegrations]);

  const resetForm = () => {
    setEditingId(null);
    setLabel("Velo Website");
    setApiKey("");
    setApiBaseUrl(DEFAULT_VELO_WEBSITE_BASE_URL);
    setEnabled(true);
    setShowKey(false);
  };

  const startEdit = (row: ApiIntegrationRow) => {
    setEditingId(row.id);
    setLabel(row.label);
    setApiKey(row.api_key);
    setApiBaseUrl(row.api_base_url || DEFAULT_VELO_WEBSITE_BASE_URL);
    setEnabled(row.enabled);
    setError(null);
    setInfo(null);
  };

  const handleSave = async () => {
    if (!user) return;
    setError(null);
    setInfo(null);

    const key = apiKey.trim();
    if (!key) {
      setError(t("API key is required."));
      return;
    }

    setSaving(true);
    const { data, error: saveErr } = await upsertApiIntegration(user.id, {
      id: editingId ?? undefined,
      label,
      api_key: key,
      api_base_url: apiBaseUrl,
      enabled,
    });
    setSaving(false);

    if (saveErr || !data) {
      setError(t("Could not save API settings."));
      return;
    }

    setInfo(t("API settings saved."));
    resetForm();
    await loadIntegrations();
  };

  const handleTest = async () => {
    setError(null);
    setInfo(null);
    const key = apiKey.trim();
    if (!key) {
      setError(t("API key is required."));
      return;
    }
    setTesting(true);
    const result = await testVeloWebsiteConnection(key, apiBaseUrl);
    setTesting(false);
    if (!result.ok) {
      setError(result.error ?? t("Connection failed."));
      return;
    }
    setInfo(t("Connection successful."));
  };

  const handleSyncNow = async () => {
    if (!user) return;
    setError(null);
    setInfo(null);
    setSyncing(true);
    const result = await pollVeloWebsiteOrders(user.id);
    setSyncing(false);
    await loadIntegrations();

    if (result.errors.length) {
      setError(result.errors.join(" "));
    }
    if (result.imported > 0 || result.updated > 0) {
      const parts: string[] = [];
      if (result.imported > 0) {
        parts.push(t("Imported {count} website order(s).").replace("{count}", String(result.imported)));
      }
      if (result.updated > 0) {
        parts.push(t("Updated {count} order payment status.").replace("{count}", String(result.updated)));
      }
      setInfo(parts.join(" "));
    } else if (!result.errors.length) {
      setInfo(
        result.skipped > 0
          ? t("No new orders. {count} already imported.").replace("{count}", String(result.skipped))
          : t("No new website orders.")
      );
    }
  };

  const handleDelete = async (id: string) => {
    if (!user) return;
    if (!window.confirm(t("Delete this API connection?"))) return;
    setError(null);
    setInfo(null);
    const { error: delErr } = await deleteApiIntegration(user.id, id);
    if (delErr) {
      setError(t("Could not delete API connection."));
      return;
    }
    if (editingId === id) resetForm();
    await loadIntegrations();
    setInfo(t("API connection removed."));
  };

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
            {t("API Settings")}
          </h1>
        </div>

        <div className="overflow-hidden rounded-2xl border border-white/20 bg-white/80 p-4 shadow-[0_4px_20px_rgba(0,0,0,0.06)] dark:border-white/10 dark:bg-slate-800/60 dark:shadow-[0_4px_20px_rgba(0,0,0,0.2)]">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {t("Connect your Velo website to import orders automatically every 15 seconds while the app is open.")}
          </p>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            {t("Duplicate orders are skipped using the website order ID.")}
          </p>
        </div>

        <div className="overflow-hidden rounded-2xl border border-white/20 bg-white/80 p-4 shadow-[0_4px_20px_rgba(0,0,0,0.06)] dark:border-white/10 dark:bg-slate-800/60 dark:shadow-[0_4px_20px_rgba(0,0,0,0.2)]">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {editingId ? t("Edit API Connection") : t("Add API Connection")}
          </h2>

          <div className="mt-4 space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{t("Label")}</span>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                placeholder="Velo Website"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{t("Velo API Key")}</span>
              <div className="mt-1 flex overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-slate-600 dark:bg-slate-800">
                <input
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="min-w-0 flex-1 border-0 bg-transparent px-4 py-2.5 text-sm text-slate-900 focus:outline-none dark:text-slate-100"
                  placeholder="x-velo-key"
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  className="border-l border-gray-200 px-3 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  {showKey ? t("Hide") : t("Show")}
                </button>
              </div>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{t("API Base URL")}</span>
              <input
                type="url"
                value={apiBaseUrl}
                onChange={(e) => setApiBaseUrl(e.target.value)}
                className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              />
            </label>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm text-slate-700 dark:text-slate-300">{t("Enable automatic sync")}</span>
            </label>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="min-h-[44px] rounded-xl bg-primary-500 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-600 disabled:opacity-50"
            >
              {saving ? t("Saving…") : t("Save")}
            </button>
            <button
              type="button"
              onClick={handleTest}
              disabled={testing}
              className="min-h-[44px] rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-gray-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
            >
              {testing ? t("Testing…") : t("Test Connection")}
            </button>
            <button
              type="button"
              onClick={handleSyncNow}
              disabled={syncing}
              className="min-h-[44px] rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-medium text-sky-800 hover:bg-sky-100 disabled:opacity-50 dark:border-sky-800/50 dark:bg-sky-900/30 dark:text-sky-200 dark:hover:bg-sky-900/50"
            >
              {syncing ? t("Syncing...") : t("Sync Website Orders")}
            </button>
            {editingId ? (
              <button
                type="button"
                onClick={resetForm}
                className="min-h-[44px] rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-gray-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
              >
                {t("Cancel")}
              </button>
            ) : null}
          </div>

          {error ? (
            <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800/40 dark:bg-red-900/20 dark:text-red-300">
              {error}
            </div>
          ) : null}
          {info ? (
            <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-800/40 dark:bg-emerald-900/20 dark:text-emerald-300">
              {info}
            </div>
          ) : null}
        </div>

        <div className="overflow-hidden rounded-2xl border border-white/20 bg-white/80 shadow-[0_4px_20px_rgba(0,0,0,0.06)] dark:border-white/10 dark:bg-slate-800/60 dark:shadow-[0_4px_20px_rgba(0,0,0,0.2)]">
          <div className="border-b border-white/30 px-4 py-3 dark:border-white/10">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{t("Saved Connections")}</h2>
          </div>
          {loadingList ? (
            <p className="px-4 py-6 text-sm text-slate-500 dark:text-slate-400">{t("Loading")}…</p>
          ) : integrations.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-500 dark:text-slate-400">{t("No API connections yet.")}</p>
          ) : (
            <ul className="divide-y divide-white/30 dark:divide-white/10">
              {integrations.map((row) => (
                <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-900 dark:text-slate-100">{row.label}</p>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">{row.api_base_url}</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {t("Last synced")}: {formatSyncTime(row.last_sync_at)}
                      {row.last_error ? (
                        <span className="ml-2 text-red-600 dark:text-red-400">— {row.last_error}</span>
                      ) : null}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        row.enabled
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                          : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                      }`}
                    >
                      {row.enabled ? t("Enabled") : t("Disabled")}
                    </span>
                    <button
                      type="button"
                      onClick={() => startEdit(row)}
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-gray-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
                    >
                      {t("Edit")}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(row.id)}
                      className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-800/40 dark:text-red-300 dark:hover:bg-red-900/30"
                    >
                      {t("Delete")}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
}
