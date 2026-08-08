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

export function getPublicMetaConfig(): { appId: string; configId: string } {
  return {
    appId: (process.env.NEXT_PUBLIC_META_APP_ID ?? DEFAULT_META_APP_ID).trim(),
    configId: (process.env.NEXT_PUBLIC_WA_ES_CONFIG_ID ?? DEFAULT_WA_ES_CONFIG_ID).trim(),
  };
}

/** HTTPS page Meta should return to when the JS SDK falls back from a popup. */
export function getEmbeddedSignupRedirectUri(): string {
  const site = (
    process.env.NEXT_PUBLIC_SITE_URL ||
    PRODUCTION_SITE
  )
    .trim()
    .replace(/\/$/, "");
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

  sdkPromise = new Promise((resolve, reject) => {
    window.fbAsyncInit = () => {
      try {
        window.FB?.init({
          appId,
          cookie: true,
          xfbml: false,
          version: "v25.0",
        });
        resolve();
      } catch (e) {
        reject(e);
      }
    };

    if (document.getElementById("facebook-jssdk")) {
      // Script tag exists; fbAsyncInit may have already run or will soon.
      const started = Date.now();
      const wait = () => {
        if (window.FB) {
          window.FB.init({
            appId,
            cookie: true,
            xfbml: false,
            version: "v25.0",
          });
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
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.onerror = () => reject(new Error("Could not load Facebook SDK."));
    document.body.appendChild(script);
  });

  return sdkPromise;
}

/**
 * Launches Embedded Signup and resolves with code + WABA/phone ids.
 * Meta may deliver ids via postMessage and the auth code via FB.login callback.
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

    const finishIfReady = () => {
      if (settled) return;
      if (partial.code && partial.waba_id && partial.phone_number_id) {
        settled = true;
        window.removeEventListener("message", onMessage);
        resolve({
          code: partial.code,
          waba_id: partial.waba_id,
          phone_number_id: partial.phone_number_id,
          phone_number: partial.phone_number,
        });
      }
    };

    const onMessage = (event: MessageEvent) => {
      if (!isMetaOrigin(event.origin)) return;
      try {
        const data =
          typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (!data || data.type !== "WA_EMBEDDED_SIGNUP") return;
        const payload = data.data ?? data;
        if (payload?.waba_id) partial.waba_id = String(payload.waba_id);
        if (payload?.phone_number_id) {
          partial.phone_number_id = String(payload.phone_number_id);
        }
        if (payload?.phone_number) {
          partial.phone_number = String(payload.phone_number);
        }
        // Some payloads nest under event/data
        const nested = payload?.data ?? payload?.event;
        if (nested?.waba_id) partial.waba_id = String(nested.waba_id);
        if (nested?.phone_number_id) {
          partial.phone_number_id = String(nested.phone_number_id);
        }
        finishIfReady();
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
        new Error(
          "WhatsApp signup timed out. Complete the Meta popup, then try again."
        )
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
        finishIfReady();
        // If message event already arrived, finishIfReady resolved.
        // If not, wait a bit for WA_EMBEDDED_SIGNUP postMessage.
        window.setTimeout(() => {
          if (settled) return;
          if (!partial.waba_id || !partial.phone_number_id) {
            settled = true;
            window.removeEventListener("message", onMessage);
            reject(
              new Error(
                "Meta did not return WhatsApp account ids. Ensure Embedded Signup is configured and try again."
              )
            );
          }
        }, 8000);
      },
      {
        config_id: configId,
        response_type: "code",
        override_default_response_type: true,
        // When Meta falls back from popup → full-page redirect (common on Android),
        // never land on Capacitor https://localhost (ERR_CONNECTION_REFUSED).
        fallback_redirect_uri: getEmbeddedSignupRedirectUri(),
        extras: {
          setup: {},
          featureType: "",
          sessionInfoVersion: "3",
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

// redeploy trigger 2026-08-07T23:47:01.0130953+05:30
