/**
 * Meta JS SDK + WhatsApp Embedded Signup helpers for the browser.
 * Secrets stay server-side; only App ID + Configuration ID are public.
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
};

type SessionPartial = {
  code?: string;
  waba_id?: string;
  phone_number_id?: string;
  phone_number?: string;
};

let sdkPromise: Promise<void> | null = null;

/** Public Meta IDs (safe in the browser; not secrets). */
const DEFAULT_META_APP_ID = "2190934024783640";
const DEFAULT_WA_ES_CONFIG_ID = "1610415194046053";
/** Capacitor WebView origin is https://localhost — Meta must not redirect there. */
const PRODUCTION_SITE = "https://software-saree-order.vercel.app";
const EMBEDDED_SIGNUP_RETURN_PATH = "/settings/messages/";
const GRAPH_SDK_VERSION = "v26.0";

export function getPublicMetaConfig(): { appId: string; configId: string } {
  return {
    appId: (process.env.NEXT_PUBLIC_META_APP_ID ?? DEFAULT_META_APP_ID).trim(),
    configId: (process.env.NEXT_PUBLIC_WA_ES_CONFIG_ID ?? DEFAULT_WA_ES_CONFIG_ID).trim(),
  };
}

/** HTTPS page Meta should return to when the JS SDK falls back from a popup. */
export function getEmbeddedSignupRedirectUri(): string {
  const site = (process.env.NEXT_PUBLIC_SITE_URL || PRODUCTION_SITE).trim().replace(/\/$/, "");
  return `${site}${EMBEDDED_SIGNUP_RETURN_PATH}`;
}

/** True when Embedded Signup cannot safely run in this WebView (Capacitor localhost). */
export function shouldOpenEmbeddedSignupInSystemBrowser(): boolean {
  if (typeof window === "undefined") return false;
  if (Capacitor.isNativePlatform()) return true;
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1";
}

/**
 * Opens production Settings → Messages in the system browser so Meta OAuth
 * returns to a real HTTPS domain instead of Capacitor's https://localhost.
 */
export async function openEmbeddedSignupInSystemBrowser(): Promise<void> {
  const url = getEmbeddedSignupRedirectUri();
  if (Capacitor.isNativePlatform()) {
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url });
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
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

function applyEmbeddedSignupPayload(partial: SessionPartial, raw: unknown): void {
  if (!raw || typeof raw !== "object") return;
  const root = raw as Record<string, unknown>;
  if (root.type && root.type !== "WA_EMBEDDED_SIGNUP") return;

  const eventName = String(root.event ?? "").toUpperCase();
  if (eventName === "CANCEL" || eventName === "ERROR") {
    return;
  }

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
}

/**
 * Launches Embedded Signup and resolves with code + WABA/phone ids when available.
 * IDs come from WA_EMBEDDED_SIGNUP postMessage; if missing, server can resolve from the code.
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

  return new Promise((resolve, reject) => {
    const partial: SessionPartial = {};
    let settled = false;

    const finishIfReady = (allowCodeOnly = false) => {
      if (settled) return;
      if (!partial.code) return;
      if (!allowCodeOnly && (!partial.waba_id || !partial.phone_number_id)) return;
      settled = true;
      window.removeEventListener("message", onMessage);
      resolve({
        code: partial.code,
        waba_id: partial.waba_id ?? "",
        phone_number_id: partial.phone_number_id ?? "",
        phone_number: partial.phone_number,
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
        /* ignore non-JSON */
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
        finishIfReady(false);
        // postMessage often arrives slightly after the login callback.
        window.setTimeout(() => finishIfReady(true), 2500);
      },
      {
        config_id: configId,
        response_type: "code",
        override_default_response_type: true,
        fallback_redirect_uri: getEmbeddedSignupRedirectUri(),
        // Match Meta Embedded Signup docs (v4): extras.setup only.
        extras: {
          setup: {},
        },
      }
    );
  });
}

function isMetaOrigin(origin: string): boolean {
  return (
    origin === "https://www.facebook.com" ||
    origin === "https://web.facebook.com" ||
    origin.endsWith(".facebook.com") ||
    origin === "https://www.instagram.com"
  );
}
