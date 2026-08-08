/**
 * Meta JS SDK + WhatsApp Embedded Signup helpers for the browser.
 * Secrets stay server-side; only App ID + Configuration ID are public.
 *
 * Robust flow:
 * 1) Prefer FB.login popup (Meta docs) — no redirect_uri (that forces full-page redirect).
 * 2) Persist WA_EMBEDDED_SIGNUP asset IDs in sessionStorage.
 * 3) If Meta falls back to redirect, resume from ?code= on return and complete server-side.
 */

import { Capacitor } from "@capacitor/core";

declare global {
  interface Window {
    FB?: {
      init: (opts: Record<string, unknown>) => void;
      login: (
        cb: (response: { authResponse?: { code?: string } }) => void,
        opts: Record<string, unknown>
      ) => void;
    };
    fbAsyncInit?: () => void;
  }
}

export type EmbeddedSignupSession = {
  code: string;
  waba_id: string;
  phone_number_id: string;
  phone_number?: string;
  /** Empty when popup auth; set when Meta used redirect fallback. */
  redirect_uri: string;
};

type SessionPartial = {
  code?: string;
  waba_id?: string;
  phone_number_id?: string;
  phone_number?: string;
};

const PENDING_ASSETS_KEY = "velo_wa_es_assets_v1";
const PENDING_FLOW_KEY = "velo_wa_es_pending_v1";

let sdkPromise: Promise<void> | null = null;
let globalMessageHooked = false;

/** Public Meta IDs (safe in the browser; not secrets). */
const DEFAULT_META_APP_ID = "2190934024783640";
const DEFAULT_WA_ES_CONFIG_ID = "1610415194046053";
/** Exact URI registered in Meta → Facebook Login → Valid OAuth Redirect URIs. */
export const CANONICAL_ES_REDIRECT_URI =
  "https://software-saree-order.vercel.app/settings/messages/";
const GRAPH_SDK_VERSION = "v26.0";
const PENDING_REDIRECT_KEY = "velo_wa_es_redirect_v1";

export function getPublicMetaConfig(): { appId: string; configId: string } {
  return {
    appId: (process.env.NEXT_PUBLIC_META_APP_ID ?? DEFAULT_META_APP_ID).trim(),
    configId: (process.env.NEXT_PUBLIC_WA_ES_CONFIG_ID ?? DEFAULT_WA_ES_CONFIG_ID).trim(),
  };
}

/**
 * Always the same HTTPS URI for FB.login fallback + token exchange.
 * Must match Meta Valid OAuth Redirect URIs exactly (trailing slash included).
 */
export function getEmbeddedSignupRedirectUri(): string {
  return CANONICAL_ES_REDIRECT_URI;
}

/** True only in Capacitor native WebView (https://localhost) — not on the live website. */
export function shouldOpenEmbeddedSignupInSystemBrowser(): boolean {
  if (typeof window === "undefined") return false;
  if (Capacitor.isNativePlatform()) return true;
  const host = window.location.hostname;
  // Dev localhost browser: also send to production HTTPS for Meta JS SDK domains.
  return host === "localhost" || host === "127.0.0.1";
}

/**
 * Opens production Settings → Messages so Connect runs on an allowed Meta domain.
 */
export async function openEmbeddedSignupInSystemBrowser(): Promise<void> {
  const url = `${getEmbeddedSignupRedirectUri()}?wa_connect=1`;
  if (Capacitor.isNativePlatform()) {
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url });
    return;
  }
  window.location.assign(url);
}

function readPendingAssets(): SessionPartial {
  try {
    const raw = sessionStorage.getItem(PENDING_ASSETS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as SessionPartial;
  } catch {
    return {};
  }
}

function writePendingAssets(partial: SessionPartial): void {
  try {
    const prev = readPendingAssets();
    const next = { ...prev, ...partial };
    sessionStorage.setItem(PENDING_ASSETS_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

function clearPendingAssets(): void {
  try {
    sessionStorage.removeItem(PENDING_ASSETS_KEY);
    sessionStorage.removeItem(PENDING_FLOW_KEY);
    sessionStorage.removeItem(PENDING_REDIRECT_KEY);
  } catch {
    /* ignore */
  }
}

function markFlowPending(redirectUri: string): void {
  try {
    sessionStorage.setItem(PENDING_FLOW_KEY, String(Date.now()));
    sessionStorage.setItem(PENDING_REDIRECT_KEY, redirectUri);
  } catch {
    /* ignore */
  }
}

function readPendingRedirectUri(): string {
  try {
    return (sessionStorage.getItem(PENDING_REDIRECT_KEY) || CANONICAL_ES_REDIRECT_URI).trim();
  } catch {
    return CANONICAL_ES_REDIRECT_URI;
  }
}

function applyEmbeddedSignupPayload(partial: SessionPartial, raw: unknown): void {
  if (!raw || typeof raw !== "object") return;
  const root = raw as Record<string, unknown>;
  if (root.type && root.type !== "WA_EMBEDDED_SIGNUP") return;

  const eventName = String(root.event ?? "").toUpperCase();
  if (eventName === "CANCEL" || eventName === "ERROR") return;

  const payload =
    root.data && typeof root.data === "object"
      ? (root.data as Record<string, unknown>)
      : root;

  const pick = (...keys: string[]) => {
    for (const key of keys) {
      const v = payload[key];
      if (v != null && String(v).trim()) return String(v).trim();
    }
    return "";
  };

  const waba =
    pick("waba_id", "wabaId", "sharedWabaId") ||
    (Array.isArray(payload.waba_ids) && payload.waba_ids[0]
      ? String(payload.waba_ids[0])
      : "");
  const phoneId = pick("phone_number_id", "phoneNumberId", "phone_id");
  const phone = pick("phone_number", "display_phone_number", "phone");

  if (waba) partial.waba_id = waba;
  if (phoneId) partial.phone_number_id = phoneId;
  if (phone) partial.phone_number = phone;
  writePendingAssets(partial);
}

/** Keep a process-wide listener so asset IDs survive popup/redirect races. */
export function ensureEmbeddedSignupMessageHook(): void {
  if (typeof window === "undefined" || globalMessageHooked) return;
  globalMessageHooked = true;
  window.addEventListener("message", (event: MessageEvent) => {
    if (!isMetaOrigin(event.origin)) return;
    try {
      const data =
        typeof event.data === "string" ? JSON.parse(event.data) : event.data;
      applyEmbeddedSignupPayload({}, data);
    } catch {
      /* ignore */
    }
  });
}

export function loadFacebookSdk(appId: string): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Facebook SDK requires a browser."));
  }
  if (!appId) {
    return Promise.reject(
      new Error("NEXT_PUBLIC_META_APP_ID is not set. Ask an admin to configure Meta Embedded Signup.")
    );
  }
  ensureEmbeddedSignupMessageHook();
  if (window.FB) return Promise.resolve();
  if (sdkPromise) return sdkPromise;

  const initOpts = {
    appId,
    autoLogAppEvents: true,
    cookie: true,
    xfbml: false,
    version: GRAPH_SDK_VERSION,
  };

  sdkPromise = new Promise((resolve, reject) => {
    window.fbAsyncInit = () => {
      try {
        window.FB?.init(initOpts);
        resolve();
      } catch (e) {
        reject(e);
      }
    };

    if (document.getElementById("facebook-jssdk")) {
      const started = Date.now();
      const wait = () => {
        if (window.FB) {
          window.FB.init(initOpts);
          resolve();
          return;
        }
        if (Date.now() - started > 15000) {
          reject(new Error("Facebook SDK failed to load."));
          return;
        }
        window.setTimeout(wait, 100);
      };
      wait();
      return;
    }

    const script = document.createElement("script");
    script.id = "facebook-jssdk";
    script.async = true;
    script.defer = true;
    script.crossOrigin = "anonymous";
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.onerror = () => reject(new Error("Could not load Facebook SDK."));
    document.body.appendChild(script);
  });

  return sdkPromise;
}

function extractCodeFromLocation(): { code: string; usedRedirect: boolean } | null {
  if (typeof window === "undefined") return null;
  const fromSearch = new URLSearchParams(window.location.search).get("code");
  if (fromSearch) return { code: fromSearch, usedRedirect: true };

  const hash = window.location.hash.replace(/^#/, "");
  if (hash.includes("code=")) {
    const params = new URLSearchParams(hash.startsWith("?") ? hash.slice(1) : hash);
    const code = params.get("code");
    if (code) return { code, usedRedirect: true };
  }
  return null;
}

/** Strip OAuth params from the URL after we consume them. */
export function clearOAuthParamsFromUrl(): void {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete("code");
    url.searchParams.delete("state");
    url.searchParams.delete("error");
    url.searchParams.delete("error_reason");
    url.searchParams.delete("error_description");
    url.hash = "";
    window.history.replaceState({}, "", url.pathname + url.search);
  } catch {
    /* ignore */
  }
}

/**
 * If Meta redirected back with ?code=, build a session (merge sessionStorage asset IDs).
 * Returns null when this page load is not an OAuth return.
 */
export function consumeEmbeddedSignupReturn(): EmbeddedSignupSession | null {
  ensureEmbeddedSignupMessageHook();
  const extracted = extractCodeFromLocation();
  if (!extracted) return null;

  const assets = readPendingAssets();
  const redirectUri = readPendingRedirectUri() || CANONICAL_ES_REDIRECT_URI;
  clearOAuthParamsFromUrl();

  return {
    code: extracted.code,
    waba_id: assets.waba_id ?? "",
    phone_number_id: assets.phone_number_id ?? "",
    phone_number: assets.phone_number,
    redirect_uri: redirectUri,
  };
}

export function wantsAutoConnectFromQuery(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("wa_connect") === "1";
}

export function clearAutoConnectQuery(): void {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("wa_connect")) return;
    url.searchParams.delete("wa_connect");
    window.history.replaceState({}, "", url.pathname + url.search);
  } catch {
    /* ignore */
  }
}

/**
 * Launches Embedded Signup via popup (preferred). Asset IDs via postMessage;
 * server can resolve IDs from the code if postMessage is missing.
 */
export function launchWhatsAppEmbeddedSignup(
  configId: string
): Promise<EmbeddedSignupSession> {
  if (!configId) {
    return Promise.reject(
      new Error(
        "NEXT_PUBLIC_WA_ES_CONFIG_ID is not set. Create a WhatsApp Embedded Signup configuration in Meta and add the Configuration ID."
      )
    );
  }
  const FB = window.FB;
  if (!FB) {
    return Promise.reject(new Error("Facebook SDK is not ready."));
  }

  ensureEmbeddedSignupMessageHook();
  const redirectUri = getEmbeddedSignupRedirectUri();
  markFlowPending(redirectUri);

  return new Promise((resolve, reject) => {
    const partial: SessionPartial = { ...readPendingAssets() };
    let settled = false;

    const finishIfReady = (allowCodeOnly = false) => {
      if (settled) return;
      if (!partial.code) return;
      if (!allowCodeOnly && (!partial.waba_id || !partial.phone_number_id)) return;
      settled = true;
      window.removeEventListener("message", onMessage);
      writePendingAssets(partial);
      resolve({
        code: partial.code,
        waba_id: partial.waba_id ?? "",
        phone_number_id: partial.phone_number_id ?? "",
        phone_number: partial.phone_number,
        // Must match fallback_redirect_uri used in FB.login (Meta binds the code to it).
        redirect_uri: redirectUri,
      });
    };

    const onMessage = (event: MessageEvent) => {
      if (!isMetaOrigin(event.origin)) return;
      try {
        const data =
          typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        applyEmbeddedSignupPayload(partial, data);
        finishIfReady(false);
      } catch {
        /* ignore */
      }
    };

    window.addEventListener("message", onMessage);

    window.setTimeout(() => {
      if (settled) return;
      settled = true;
      window.removeEventListener("message", onMessage);
      reject(
        new Error("WhatsApp signup timed out. Complete the Meta popup, then try again.")
      );
    }, 5 * 60 * 1000);

    FB.login(
      (response) => {
        const code = response.authResponse?.code;
        if (!code) {
          if (!settled) {
            settled = true;
            window.removeEventListener("message", onMessage);
            reject(new Error("WhatsApp signup was cancelled or failed."));
          }
          return;
        }
        partial.code = code;
        writePendingAssets(partial);
        finishIfReady(false);
        window.setTimeout(() => finishIfReady(true), 3000);
      },
      {
        config_id: configId,
        response_type: "code",
        override_default_response_type: true,
        // Only fallback (keeps popup). Same URI must be used in token exchange.
        fallback_redirect_uri: redirectUri,
        extras: {
          setup: {},
          sessionInfoVersion: "3",
        },
      }
    );
  });
}

export function clearEmbeddedSignupPending(): void {
  clearPendingAssets();
}

function isMetaOrigin(origin: string): boolean {
  return (
    origin === "https://www.facebook.com" ||
    origin === "https://web.facebook.com" ||
    origin.endsWith(".facebook.com") ||
    origin === "https://www.instagram.com"
  );
}
