import { Capacitor } from "@capacitor/core";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { getAuthCallbackUrl } from "./auth-site-url";
import { NATIVE_OAUTH_CALLBACK } from "./native-oauth-handler";
import { signInWithNativeGoogle } from "./native-google-sign-in";
import { isNativeGoogleSignInConfigured } from "./google-client-config";

export { NATIVE_OAUTH_CALLBACK };

export function getGoogleOAuthRedirectUrl(): string {
  if (Capacitor.isNativePlatform()) {
    return NATIVE_OAUTH_CALLBACK;
  }
  return getAuthCallbackUrl();
}

export type GoogleOAuthResult = { error: Error | null; session: Session | null };

/**
 * Google Sign-In:
 * - Native (APK): account picker + signInWithIdToken (no browser)
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
    return signInWithNativeGoogle();
  }

  const redirectTo = getAuthCallbackUrl();
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo },
  });

  return { error: error ? new Error(error.message) : null, session: null };
}
