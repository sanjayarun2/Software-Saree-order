import type { PluginListenerHandle } from "@capacitor/core";
import type { Session } from "@supabase/supabase-js";
import { Capacitor } from "@capacitor/core";
import { supabase } from "./supabase";

/** Custom scheme registered in AndroidManifest (in-app OAuth return). */
export const NATIVE_OAUTH_CALLBACK = "sareeorder://auth/callback";

const OAUTH_TIMEOUT_MS = 5 * 60 * 1000;
const EXCHANGE_TIMEOUT_MS = 15_000;
const NATIVE_OAUTH_PENDING_KEY = "saree_native_oauth_pending";
const NATIVE_OAUTH_RESUME_EVENT = "saree-native-oauth-resume";

export type NativeOAuthResult = {
  error: Error | null;
  session: Session | null;
};

type OAuthWaiter = {
  redirectTo: string;
  resolve: (result: NativeOAuthResult) => void;
  timeoutId: number;
};

let listenersReady: Promise<void> | null = null;
let waiter: OAuthWaiter | null = null;
let lastHandledUrl = "";
let lastHandledAt = 0;
let launchUrlConsumed = false;

async function consumeLaunchUrlOnce(): Promise<string | null> {
  if (launchUrlConsumed) return null;
  const { App } = await import("@capacitor/app");
  const launch = await App.getLaunchUrl();
  if (!launch?.url) return null;
  launchUrlConsumed = true;
  return launch.url;
}

export function markNativeOAuthInFlight(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(NATIVE_OAUTH_PENDING_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

export function clearNativeOAuthInFlight(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(NATIVE_OAUTH_PENDING_KEY);
  } catch {
    /* ignore */
  }
}

export function isNativeOAuthInFlight(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(NATIVE_OAUTH_PENDING_KEY);
    if (!raw) return false;
    const started = Number(raw);
    if (!Number.isFinite(started) || Date.now() - started > OAUTH_TIMEOUT_MS) {
      clearNativeOAuthInFlight();
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** Fix Go/Supabase bare-scheme redirect corruption (sareeorder:?code=…). */
export function normalizeOAuthCallbackUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith("sareeorder:") && !url.startsWith("sareeorder://")) {
    const rest = url.slice("sareeorder:".length);
    if (rest.startsWith("?") || rest.startsWith("#")) {
      return `${NATIVE_OAUTH_CALLBACK}${rest}`;
    }
    if (rest.startsWith("/")) {
      return `sareeorder:/${rest}`;
    }
  }
  return url;
}

export function extractOAuthCode(url: string): string | null {
  const match = url.match(/[?&#]code=([^&#]+)/);
  if (!match) return null;
  let code = decodeURIComponent(match[1]);
  code = code.replace(/%23$/i, "").replace(/#$/, "");
  return code || null;
}

export function extractOAuthError(url: string): string | null {
  const match =
    url.match(/[?&#]error_description=([^&#]+)/) || url.match(/[?&#]error=([^&#]+)/);
  return match ? decodeURIComponent(match[1].replace(/\+/g, " ")) : null;
}

export function isOAuthCallbackUrl(url: string, redirectTo: string): boolean {
  const normalized = normalizeOAuthCallbackUrl(url);
  if (!normalized) return false;

  if (normalized.startsWith("sareeorder:")) {
    return (
      normalized.includes("auth/callback") ||
      /[?&#]code=/.test(normalized) ||
      /[?&#]error/.test(normalized)
    );
  }

  if (redirectTo.startsWith("http")) {
    try {
      const target = new URL(redirectTo);
      const incoming = new URL(normalized);
      return (
        incoming.origin === target.origin &&
        incoming.pathname.replace(/\/$/, "") === target.pathname.replace(/\/$/, "")
      );
    } catch {
      return false;
    }
  }

  return normalized.startsWith(redirectTo);
}

async function exchangeCodeForSessionWithTimeout(code: string): Promise<NativeOAuthResult> {
  const exchange = supabase.auth.exchangeCodeForSession(code);
  const timeout = new Promise<NativeOAuthResult>((resolve) => {
    window.setTimeout(
      () => resolve({ error: new Error("Sign-in exchange timed out. Please try again."), session: null }),
      EXCHANGE_TIMEOUT_MS
    );
  });

  const result = await Promise.race([
    exchange.then(({ data, error }) => ({
      error: error ? new Error(error.message) : null,
      session: data.session,
    })),
    timeout,
  ]);

  if (result.session?.user) {
    return result;
  }

  const session = await waitForAuthSession(2000);
  if (session) {
    return { error: null, session };
  }

  return result;
}

export async function waitForAuthSession(maxMs = 3000): Promise<Session | null> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (!error && session?.user) return session;
    await new Promise((r) => window.setTimeout(r, 100));
  }
  return null;
}

async function closeOAuthBrowser(delayMs = 350): Promise<void> {
  await new Promise((r) => window.setTimeout(r, delayMs));
  try {
    const { Browser } = await import("@capacitor/browser");
    await Browser.close();
  } catch {
    /* ignore */
  }
}

async function completeOAuthFromUrl(url: string): Promise<NativeOAuthResult> {
  const normalized = normalizeOAuthCallbackUrl(url);

  if (normalized === lastHandledUrl && Date.now() - lastHandledAt < 8000) {
    const session = await waitForAuthSession(500);
    return { error: null, session };
  }

  const oauthError = extractOAuthError(normalized);
  if (oauthError) {
    return { error: new Error(oauthError), session: null };
  }

  const code = extractOAuthCode(normalized);
  if (!code) {
    return { error: new Error("Google sign-in did not return an authorization code."), session: null };
  }

  const result = await exchangeCodeForSessionWithTimeout(code);
  if (!result.error) {
    lastHandledUrl = normalized;
    lastHandledAt = Date.now();
  }
  return result;
}

function settleWaiter(result: NativeOAuthResult): void {
  const active = waiter;
  if (!active) return;
  waiter = null;
  window.clearTimeout(active.timeoutId);
  active.resolve(result);
}

async function handleOAuthCallbackUrl(url: string, redirectTo: string): Promise<void> {
  const normalized = normalizeOAuthCallbackUrl(url);
  if (!isOAuthCallbackUrl(normalized, redirectTo)) return;

  const result = await completeOAuthFromUrl(normalized);
  clearNativeOAuthInFlight();
  void closeOAuthBrowser();

  if (waiter) {
    settleWaiter(result);
    return;
  }

  if (result.session?.user || result.error) {
    window.dispatchEvent(
      new CustomEvent<NativeOAuthResult>(NATIVE_OAUTH_RESUME_EVENT, { detail: result })
    );
  }
}

export function subscribeNativeOAuthResume(
  handler: (result: NativeOAuthResult) => void
): () => void {
  const listener = (event: Event) => {
    handler((event as CustomEvent<NativeOAuthResult>).detail);
  };
  window.addEventListener(NATIVE_OAUTH_RESUME_EVENT, listener);
  return () => window.removeEventListener(NATIVE_OAUTH_RESUME_EVENT, listener);
}

let appUrlListener: PluginListenerHandle | null = null;

/** Singleton deep-link listener — survives WebView reload after OAuth return. */
export async function ensureNativeOAuthListeners(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  if (listenersReady) return listenersReady;

  listenersReady = (async () => {
    const { App } = await import("@capacitor/app");

    if (!appUrlListener) {
      appUrlListener = await App.addListener("appUrlOpen", ({ url }) => {
        const redirectTo = NATIVE_OAUTH_CALLBACK;
        void handleOAuthCallbackUrl(url, redirectTo);
      });
    }

    const launchUrl = await consumeLaunchUrlOnce();
    if (launchUrl) {
      await handleOAuthCallbackUrl(launchUrl, NATIVE_OAUTH_CALLBACK);
    }
  })();

  return listenersReady;
}

export async function runNativeOAuthBrowserFlow(
  authUrl: string,
  redirectTo: string
): Promise<NativeOAuthResult> {
  await ensureNativeOAuthListeners();
  markNativeOAuthInFlight();

  const launchUrl = await consumeLaunchUrlOnce();
  if (launchUrl && isOAuthCallbackUrl(launchUrl, redirectTo)) {
    const result = await completeOAuthFromUrl(launchUrl);
    clearNativeOAuthInFlight();
    return result;
  }

  return new Promise((resolve) => {
    const timeoutId = window.setTimeout(() => {
      if (!waiter) return;
      waiter = null;
      clearNativeOAuthInFlight();
      resolve({ error: new Error("Google sign-in timed out. Please try again."), session: null });
    }, OAUTH_TIMEOUT_MS);

    waiter = { redirectTo, resolve, timeoutId };

    void import("@capacitor/browser")
      .then(({ Browser }) => {
        const platform = Capacitor.getPlatform();
        return Browser.open({
          url: authUrl,
          ...(platform === "ios" ? { presentationStyle: "popover" as const } : {}),
        });
      })
      .catch((e) => {
        settleWaiter({
          error: new Error((e as Error).message || "Could not open Google sign-in."),
          session: null,
        });
        clearNativeOAuthInFlight();
      });
  });
}
