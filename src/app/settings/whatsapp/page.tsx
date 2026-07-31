"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/language-context";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { fetchIsListedWorker } from "@/lib/admin-workers-supabase";
import {
  DEFAULT_WHATSAPP_PHONE_NUMBER_ID,
  emptyWhatsAppSettings,
  getWhatsAppSettings,
  upsertWhatsAppSettings,
  type WhatsAppSendWhen,
} from "@/lib/whatsapp-settings-supabase";

export default function WhatsAppSettingsPage() {
  const { user, loading } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();

  const [checkingAccess, setCheckingAccess] = useState(true);
  const [loadingRow, setLoadingRow] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [enabled, setEnabled] = useState(false);
  const [accessToken, setAccessToken] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState(DEFAULT_WHATSAPP_PHONE_NUMBER_ID);
  const [templateName, setTemplateName] = useState("");
  const [templateLanguage, setTemplateLanguage] = useState("en");
  const [sendWhen, setSendWhen] = useState<WhatsAppSendWhen>("create");

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
    const row = (await getWhatsAppSettings(user.id)) ?? emptyWhatsAppSettings(user.id);
    setEnabled(row.enabled);
    setAccessToken(row.access_token);
    setPhoneNumberId(row.phone_number_id || DEFAULT_WHATSAPP_PHONE_NUMBER_ID);
    setTemplateName(row.template_name);
    setTemplateLanguage(row.template_language || "en");
    setSendWhen(row.send_when === "despatch" ? "despatch" : "create");
    setLoadingRow(false);
  }, [user]);

  useEffect(() => {
    if (!checkingAccess && user) void load();
  }, [checkingAccess, user, load]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    setError(null);
    setInfo(null);
    const { error: saveError } = await upsertWhatsAppSettings(user.id, {
      enabled,
      access_token: accessToken,
      phone_number_id: phoneNumberId,
      template_name: templateName,
      template_language: templateLanguage,
      send_when: sendWhen,
    });
    setSaving(false);
    if (saveError) {
      setError(t("Could not save WhatsApp settings."));
      return;
    }
    setInfo(t("WhatsApp settings saved."));
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
            {t("WhatsApp")}
          </h1>
        </div>

        <p className="text-sm text-slate-600 dark:text-slate-400">
          {t("Send order confirmation via WhatsApp Cloud API. Use an approved template.")}
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
                {t("Access token")}
              </label>
              <div className="flex gap-2">
                <input
                  type={showToken ? "text" : "password"}
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  autoComplete="off"
                  className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
                  placeholder="EAAG…"
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
                {t("Phone number ID")}
              </label>
              <input
                type="text"
                value={phoneNumberId}
                onChange={(e) => setPhoneNumberId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                {t("Template name")}
              </label>
              <input
                type="text"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
                placeholder="order_confirmed"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                {t("Language")}
              </label>
              <input
                type="text"
                value={templateLanguage}
                onChange={(e) => setTemplateLanguage(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
                placeholder="en"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                {t("Send when")}
              </label>
              <select
                value={sendWhen}
                onChange={(e) =>
                  setSendWhen(e.target.value === "despatch" ? "despatch" : "create")
                }
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
              >
                <option value="create">{t("Order created")}</option>
                <option value="despatch">{t("Despatched")}</option>
              </select>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t("Template must have one body variable {{1}} (order summary).")}
            </p>

            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSave()}
              className="w-full rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {saving ? t("Saving…") : t("Save")}
            </button>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}
