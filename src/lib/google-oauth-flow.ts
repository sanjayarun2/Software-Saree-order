import { Capacitor } from "@capacitor/core";
import { supabase } from "./supabase";
import { getAuthCallbackUrl } from "./auth-site-url";
import {
  NATIVE_OAUTH_CALLBACK,
  runNativeOAuthBrowserFlow,
} from "./native-oauth-handler";

export { NATIVE_OAUTH_CALLBACK };

export function getGoogleOAuthRedirectUrl(): string {
  if (Capacitor.isNativePlatform()) {
    return NATIVE_OAUTH_CALLBACK;
  }
  return getAuthCallbackUrl();
}

/**
 * Industry-standard OAuth:
 * - Web: full redirect to /auth/callback/
 * - Native: in-app browser + deep link (sareeorder://auth/callback) back to the app
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

  const { error: nativeError } = await runNativeOAuthBrowserFlow(data.url, redirectTo);
  return { error: nativeError };
}
