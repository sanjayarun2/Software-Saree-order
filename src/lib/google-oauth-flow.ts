import { Capacitor } from "@capacitor/core";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { getAuthCallbackUrl } from "./auth-site-url";
import {
  NATIVE_OAUTH_CALLBACK,
  runNativeOAuthBrowserFlow,
} from "./native-oauth-handler";
import { signInWithNativeGoogle, isGoogleReauthFailed } from "./native-google-sign-in";
import { isNativeGoogleSignInConfigured } from "./google-client-config";

export { NATIVE_OAUTH_CALLBACK };

export function getGoogleOAuthRedirectUrl(): string {
  if (Capacitor.isNativePlatform()) {
    return NATIVE_OAUTH_CALLBACK;
  }
  return getAuthCallbackUrl();
}

export type GoogleOAuthResult = { error: Error | null; session: Session | null };

async function startNativeGoogleBrowserOAuth(): Promise<GoogleOAuthResult> {
  const redirectTo = NATIVE_OAUTH_CALLBACK;
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      skipBrowserRedirect: true,
    },
  });

  if (error || !data?.url) {
    return {
      error: new Error(error?.message || "Could not open Google sign-in."),
      session: null,
    };
  }

  return runNativeOAuthBrowserFlow(data.url, redirectTo);
}

/**
 * Google Sign-In:
 * - Native (APK): account picker + signInWithIdToken (no browser)
 * - Native fallback: browser OAuth when Google rejects APK verification ([16])
 * - Web: Supabase OAuth redirect to /auth/callback/
 */
export async function startGoogleOAuth(_redirectTo: string): Promise<GoogleOAuthResult> {
  if (Capacitor.isNativePlatform()) {
    if (!isNativeGoogleSignInConfigured()) {
      return {
        error: new Error(
          "Native Google Sign-In is not configured. Add NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID and rebuild the APK."
        ),
        session: null,
      };
    }

    const nativeResult = await signInWithNativeGoogle();
    if (!nativeResult.error) {
      return nativeResult;
    }

    const message = nativeResult.error.message;
    if (isGoogleReauthFailed(message) || /could not verify this app/i.test(message)) {
      const browserResult = await startNativeGoogleBrowserOAuth();
      if (!browserResult.error) {
        return browserResult;
      }
      return {
        error: new Error(
          browserResult.error.message ||
            "Google sign-in failed. Ensure sareeorder://auth/callback is allowed in Supabase Auth redirect URLs."
        ),
        session: null,
      };
    }

    return nativeResult;
  }

  const redirectTo = getAuthCallbackUrl();
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo },
  });

  return { error: error ? new Error(error.message) : null, session: null };
}
