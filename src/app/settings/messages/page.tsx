"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/language-context";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { fetchIsListedWorker } from "@/lib/admin-workers-supabase";
import { listInboxes, testChatwootConnection, type InboxSummary } from "@/lib/chatwoot-api";
import {
  DEFAULT_CHATWOOT_BASE_URL,
  emptyChatwootSettings,
  getChatwootSettings,
  isChatwootConfigured,
  normalizeChatwootBaseUrl,
  upsertChatwootSettings,
} from "@/lib/chatwoot-settings-supabase";
import {
  disconnectWhatsAppConnect,
  getWhatsAppConnectStatus,
  completeWhatsAppConnect,
  healthCheckWhatsAppConnect,
  type WhatsAppConnectState,
} from "@/lib/whatsapp-connect-api";
import {
  getPublicMetaConfig,
  launchWhatsAppEmbeddedSignup,
  loadFacebookSdk,
  openEmbeddedSignupInSystemBrowser,
  shouldOpenEmbeddedSignupInSystemBrowser,
} from "@/lib/meta-embedded-signup";

export default function MessagesSettingsPage() {
  const { user, loading } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();

  const [checkingAccess, setCheckingAccess] = useState(true);
  const [loadingRow, setLoadingRow] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [enabled, setEnabled] = useState(false);
  const [baseUrl, setBaseUrl] = useState(DEFAULT_CHATWOOT_BASE_URL);
  const [accessToken, setAccessToken] = useState("");
  const [accountId, setAccountId] = useState("");
  const [inboxId, setInboxId] = useState("");

  const [waState, setWaState] = useState<WhatsAppConnectState | null>(null);
  const [inboxes, setInboxes] = useState<InboxSummary[]>([]);

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

  const refreshWa = useCallback(async () => {
    try {
      const status = await getWhatsAppConnectStatus();
      setWaState(status);
    } catch {
      setWaState({
        status: "disconnected",
        phone_number: "",
        phone_number_id: "",
        waba_id: "",
        chatwoot_inbox_id: "",
        last_error: "",
      });
    }
  }, []);

  const refreshInboxes = useCallback(async () => {
    try {
      const list = await listInboxes();
      setInboxes(list);
    } catch {
      setInboxes([]);
    }
  }, []);

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
    await refreshWa();
    if (isChatwootConfigured(row)) {
      await refreshInboxes();
    }
    setLoadingRow(false);
  }, [user, refreshWa, refreshInboxes]);

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

  const handleConnectWhatsApp = async () => {
    setError(null);
    setInfo(null);
    setConnecting(true);
    try {
      // Android WebView is https://localhost — Meta redirect there fails in Chrome.
      // Complete Connect on the live HTTPS site instead.
      if (shouldOpenEmbeddedSignupInSystemBrowser()) {
        await openEmbeddedSignupInSystemBrowser();
        setInfo(
          t(
            "Finish Connect WhatsApp in the browser (sign in to Velo if asked), then return to the app."
          )
        );
        return;
      }
      const pub = getPublicMetaConfig();
      const appId = pub.appId || waState?.config?.meta_app_id || "";
      const configId = pub.configId || waState?.config?.config_id || "";
      await loadFacebookSdk(appId);
      const session = await launchWhatsAppEmbeddedSignup(configId);
      const result = await completeWhatsAppConnect(session);
      setInfo(t("WhatsApp connected. Open the inbox to reply to customers."));
      await load();
      if (result.chatwoot_inbox_id) {
        setInboxId(result.chatwoot_inbox_id);
        setEnabled(true);
      }
    } catch (e) {
      setError((e as Error).message || t("Could not connect WhatsApp."));
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setError(null);
    setInfo(null);
    setDisconnecting(true);
    try {
      await disconnectWhatsAppConnect();
      setInfo(t("WhatsApp disconnected."));
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDisconnecting(false);
    }
  };

  const handleHealth = async () => {
    setError(null);
    setInfo(null);
    try {
      const result = await healthCheckWhatsAppConnect();
      if (result.ok) {
        setInfo(t("WhatsApp connection is healthy."));
      } else {
        setError(result.error || t("WhatsApp needs reconnect."));
      }
      await refreshWa();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (loading || checkingAccess) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  if (!user) return null;

  const waStatus = waState?.status ?? "disconnected";
  const waConnected = waStatus === "connected";
  const waNeedsReauth = waStatus === "needs_reauth";

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
            "Connect WhatsApp to receive and reply to customer chats inside Velo — like WhatsApp Business, in one inbox."
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
          <div className="space-y-4">
            {/* WhatsApp connect card */}
            <section className="space-y-3 rounded-2xl border border-white/20 bg-white/80 p-4 shadow-sm dark:border-white/10 dark:bg-slate-800/60">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    {t("WhatsApp")}
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    {waConnected
                      ? t("Connected — customer messages appear in Messages.")
                      : waNeedsReauth
                        ? t("Connection expired. Reconnect to keep receiving chats.")
                        : t("One-click connect with Meta. Your number moves to Cloud API.")}
                  </p>
                </div>
                <StatusPill
                  label={
                    waConnected
                      ? t("Connected")
                      : waNeedsReauth
                        ? t("Needs reconnect")
                        : t("Not connected")
                  }
                  tone={waConnected ? "ok" : waNeedsReauth ? "warn" : "muted"}
                />
              </div>

              {waState?.phone_number ? (
                <p className="text-sm text-slate-700 dark:text-slate-200">
                  {t("Number")}: <span className="font-medium">{waState.phone_number}</span>
                </p>
              ) : null}

              {waState?.last_error ? (
                <p className="text-xs text-amber-700 dark:text-amber-300">{waState.last_error}</p>
              ) : null}

              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t(
                  "The same number cannot stay fully on the WhatsApp Business app and Cloud API at the same time."
                )}
              </p>

              <div className="flex flex-wrap gap-2">
                {!waConnected ? (
                  <button
                    type="button"
                    disabled={connecting || disconnecting}
                    onClick={() => void handleConnectWhatsApp()}
                    className="min-h-[44px] flex-1 rounded-xl bg-[#1877F2] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#166fe5] disabled:opacity-50"
                  >
                    {connecting
                      ? t("Connecting…")
                      : waNeedsReauth
                        ? t("Reconnect WhatsApp")
                        : t("Connect WhatsApp")}
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={connecting}
                      onClick={() => void handleHealth()}
                      className="min-h-[44px] flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
                    >
                      {t("Check health")}
                    </button>
                    <button
                      type="button"
                      disabled={disconnecting}
                      onClick={() => void handleDisconnect()}
                      className="min-h-[44px] flex-1 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
                    >
                      {disconnecting ? t("Disconnecting…") : t("Disconnect")}
                    </button>
                  </>
                )}
              </div>

              <Link
                href="/messages/"
                className="block rounded-xl bg-primary-600 px-3 py-2.5 text-center text-sm font-semibold text-white hover:bg-primary-700"
              >
                {t("Open inbox")}
              </Link>
            </section>

            {/* Coming soon channels */}
            <section className="space-y-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 p-4 dark:border-slate-600 dark:bg-slate-900/40">
              <ChannelSoon name={t("Instagram")} />
              <ChannelSoon name={t("Facebook Messenger")} />
            </section>

            {inboxes.length > 0 ? (
              <section className="rounded-2xl border border-white/20 bg-white/80 p-4 text-sm dark:border-white/10 dark:bg-slate-800/60">
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                  {t("Server inboxes")}
                </h3>
                <ul className="space-y-1.5">
                  {inboxes.map((inbox) => (
                    <li
                      key={inbox.id}
                      className="flex items-center justify-between gap-2 text-slate-700 dark:text-slate-200"
                    >
                      <span>{inbox.name}</span>
                      <StatusPill
                        label={inbox.channel}
                        tone={inbox.channel === "whatsapp" ? "ok" : "muted"}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {/* Advanced manual Chatwoot fields */}
            <div>
              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                className="text-sm font-semibold text-slate-600 underline-offset-2 hover:underline dark:text-slate-300"
              >
                {showAdvanced ? t("Hide advanced") : t("Advanced (support)")}
              </button>
            </div>

            {showAdvanced ? (
              <div className="space-y-4 rounded-2xl border border-white/20 bg-white/80 p-4 shadow-sm dark:border-white/10 dark:bg-slate-800/60">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t(
                    "Support only. Shops should use Connect WhatsApp above. Manual server URL, token and account id."
                  )}
                </p>

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
              </div>
            ) : null}
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}

function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: "ok" | "warn" | "muted";
}) {
  const classes =
    tone === "ok"
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
      : tone === "warn"
        ? "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200"
        : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300";
  return (
    <span className={`shrink-0 rounded-lg px-2 py-1 text-[11px] font-semibold capitalize ${classes}`}>
      {label}
    </span>
  );
}

function ChannelSoon({ name }: { name: string }) {
  const { t } = useLanguage();
  return (
    <div className="flex items-center justify-between gap-2 text-sm text-slate-600 dark:text-slate-300">
      <span>{name}</span>
      <span className="text-xs font-medium text-slate-400">{t("Coming soon")}</span>
    </div>
  );
}
