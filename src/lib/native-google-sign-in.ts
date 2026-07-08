import { Capacitor } from "@capacitor/core";
import type { Session } from "@supabase/supabase-js";
import {
  SocialLogin,
  type GoogleLoginResponseOnline,
} from "@capgo/capacitor-social-login";
import { supabase } from "./supabase";
import { requireGoogleWebClientId } from "./google-client-config";

let initialized = false;

function getUrlSafeNonce(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(message: string): Promise<string> {
  const data = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function getNoncePair(): Promise<{ rawNonce: string; nonceDigest: string }> {
  const rawNonce = getUrlSafeNonce();
  const nonceDigest = await sha256Hex(rawNonce);
  return { rawNonce, nonceDigest };
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const base64Url = token.split(".")[1];
    if (!base64Url) return null;
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => `%${`00${c.charCodeAt(0).toString(16)}`.slice(-2)}`)
        .join("")
    );
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function isUserCancelled(message: string): boolean {
  return /cancel|cancelled|canceled|12501|user abort|user denied|dismiss/i.test(message);
}

function isGoogleReauthFailed(message: string): boolean {
  return /\[16\]|account reauth failed|reauth.*failed/i.test(message);
}

function normalizeGoogleSignInError(message: string): string {
  if (/cannot use scopes without modifying the main activity/i.test(message)) {
    return "Google sign-in is not configured for this app build. Please install the latest update.";
  }
  if (isGoogleReauthFailed(message)) {
    return "Google could not verify this app with your account. Update the app, wait a minute, then try again.";
  }
  if (/28444|developer console is not set up correctly/i.test(message)) {
    return "Google sign-in is not set up for this app. Contact support if this continues.";
  }
  if (/client id is not set|webclientid/i.test(message)) {
    return "Google sign-in is not configured. Missing Web Client ID.";
  }
  return message;
}

type GoogleLoginOptions = {
  nonce?: string;
  forcePrompt?: boolean;
};

/** Login options for Credential Manager / Google Sign-In. */
function buildGoogleLoginOptions(nonceDigest?: string): GoogleLoginOptions {
  const options: GoogleLoginOptions = {};
  if (nonceDigest) {
    options.nonce = nonceDigest;
  }
  // Do not pass `scopes` on Android: the plugin already requests openid + email + profile.
  // Custom scopes require ModifiedMainActivityForSocialLoginPlugin (see MainActivity.java).
  if (Capacitor.getPlatform() === "ios") {
    options.forcePrompt = true;
  }
  return options;
}

export async function ensureNativeGoogleAuthInitialized(): Promise<void> {
  if (!Capacitor.isNativePlatform() || initialized) return;

  const webClientId = requireGoogleWebClientId();
  const platform = Capacitor.getPlatform();
  const iOSClientId = process.env.NEXT_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim();

  await SocialLogin.initialize({
    google: {
      webClientId,
      mode: "online",
      ...(platform === "ios" && iOSClientId ? { iOSClientId } : {}),
    },
  });

  initialized = true;
}

/**
 * Native Google account picker → ID token → Supabase session (no browser).
 */
export async function signInWithNativeGoogle(
  retry = false,
  useNonce = true
): Promise<{ error: Error | null; session: Session | null }> {
  if (!Capacitor.isNativePlatform()) {
    return {
      error: new Error("Native Google Sign-In is only available in the mobile app."),
      session: null,
    };
  }

  try {
    await ensureNativeGoogleAuthInitialized();
    const noncePair = useNonce ? await getNoncePair() : null;

    const response = await SocialLogin.login({
      provider: "google",
      options: buildGoogleLoginOptions(noncePair?.nonceDigest),
    });

    if (response.provider !== "google") {
      return { error: new Error("Unexpected Google sign-in response."), session: null };
    }

    const result = response.result;
    if (result.responseType !== "online") {
      return { error: new Error("Google offline mode is not supported for Supabase login."), session: null };
    }

    const online = result as GoogleLoginResponseOnline;
    if (!online.idToken) {
      return { error: new Error("Google did not return an ID token."), session: null };
    }

    const signInOptions: { provider: "google"; token: string; nonce?: string } = {
      provider: "google",
      token: online.idToken,
    };

    const payload = decodeJwtPayload(online.idToken);
    if (noncePair && payload?.nonce) {
      signInOptions.nonce = noncePair.rawNonce;
    }

    const { data, error } = await supabase.auth.signInWithIdToken(signInOptions);
    if (error) {
      if (!retry && /nonce/i.test(error.message)) {
        try {
          await SocialLogin.logout({ provider: "google" });
        } catch {
          /* ignore */
        }
        return signInWithNativeGoogle(true, useNonce);
      }
      return { error: new Error(error.message), session: null };
    }

    return { error: null, session: data.session };
  } catch (e) {
    const raw = (e as Error).message || "Google sign-in failed.";
    if (!retry && isGoogleReauthFailed(raw)) {
      try {
        await SocialLogin.logout({ provider: "google" });
      } catch {
        /* ignore */
      }
      return signInWithNativeGoogle(true, false);
    }
    const message = normalizeGoogleSignInError(raw);
    if (isUserCancelled(message) || isUserCancelled(raw)) {
      return { error: new Error("Google sign-in was cancelled."), session: null };
    }
    return { error: new Error(message), session: null };
  }
}
