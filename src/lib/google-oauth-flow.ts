import type { PluginListenerHandle } from "@capacitor/core";
import { Capacitor } from "@capacitor/core";
import { supabase } from "./supabase";
import { getAuthCallbackUrl } from "./auth-site-url";

/** Custom scheme registered in AndroidManifest (in-app OAuth return). */
export const NATIVE_OAUTH_CALLBACK = "sareeorder://auth/callback";

const OAUTH_TIMEOUT_MS = 5 * 60 * 1000;

export function getGoogleOAuthRedirectUrl(): string {
  if (Capacitor.isNativePlatform()) {
    return NATIVE_OAUTH_CALLBACK;
  }
  return getAuthCallbackUrl();
}

function extractOAuthCode(url: string): string | null {
  const match = url.match(/[?&#]code=([^&#]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function extractOAuthError(url: string): string | null {
  const match = url.match(/[?&#]error_description=([^&#]+)/) || url.match(/[?&#]error=([^&#]+)/);
  return match ? decodeURIComponent(match[1].replace(/\+/g, " ")) : null;
}

function isOAuthCallbackUrl(url: string, redirectTo: string): boolean {
  if (!url) return false;
  if (url.startsWith("sareeorder://")) {
    return url.includes("auth/callback") || /[?&#]code=/.test(url);
  }
  if (redirectTo.startsWith("http")) {
    try {
      const target = new URL(redirectTo);
      const incoming = new URL(url);
      return (
        incoming.origin === target.origin &&
        incoming.pathname.replace(/\/$/, "") === target.pathname.replace(/\/$/, "")
      );
    } catch {
      return false;
    }
  }
  return url.startsWith(redirectTo);
}

async function openNativeOAuth(authUrl: string, redirectTo: string): Promise<{ error: Error | null }> {
  const { Browser } = await import("@capacitor/browser");
  const { App } = await import("@capacitor/app");

  return new Promise((resolve) => {
    let settled = false;
    let listener: PluginListenerHandle | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const finish = async (error: Error | null) => {
      if (settled) return;
      settled = true;
      if (timeoutId != null) clearTimeout(timeoutId);
      try {
        await listener?.remove();
      } catch {
        /* ignore */
      }
      try {
        await Browser.close();
      } catch {
        /* ignore */
      }
      resolve({ error });
    };

    void App.addListener("appUrlOpen", async ({ url }) => {
      if (!isOAuthCallbackUrl(url, redirectTo)) return;

      const oauthError = extractOAuthError(url);
      if (oauthError) {
        await finish(new Error(oauthError));
        return;
      }

      const code = extractOAuthCode(url);
      if (!code) return;

      const { error } = await supabase.auth.exchangeCodeForSession(code);
      await finish(error ? new Error(error.message) : null);
    }).then((handle) => {
      listener = handle;
    });

    timeoutId = setTimeout(() => {
      void finish(new Error("Google sign-in timed out. Please try again."));
    }, OAUTH_TIMEOUT_MS);

    Browser.open({ url: authUrl, presentationStyle: "popover" }).catch((e) => {
      void finish(new Error((e as Error).message || "Could not open Google sign-in."));
    });
  });
}

/**
 * Industry-standard OAuth:
 * - Web: full redirect to /auth/callback/
 * - Native: in-app browser + deep link (sareeorder://) back to the app
 */
export async function startGoogleOAuth(redirectTo: string): Promise<{ error: Error | null }> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      skipBrowserRedirect: Capacitor.isNativePlatform(),
    },
  });

  if (error) {
    return { error: new Error(error.message) };
  }

  if (!Capacitor.isNativePlatform()) {
    return { error: null };
  }

  if (!data?.url) {
    return { error: new Error("Google sign-in URL missing.") };
  }

  return openNativeOAuth(data.url, redirectTo);
}
