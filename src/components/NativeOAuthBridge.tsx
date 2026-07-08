"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import {
  ensureNativeOAuthListeners,
  subscribeNativeOAuthResume,
  waitForAuthSession,
  type NativeOAuthResult,
} from "@/lib/native-oauth-handler";
import { finishGoogleAuthSession } from "@/lib/google-auth-finish";

/**
 * App-level handler for Google OAuth deep links (warm return + cold start).
 * Login/register pages start the flow; this component finishes it reliably.
 */
export function NativeOAuthBridge() {
  const router = useRouter();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    void ensureNativeOAuthListeners();

    const finishFromOAuth = async (result: NativeOAuthResult) => {
      if (result.error) return;

      const session = result.session ?? (await waitForAuthSession(3000));
      if (!session?.user) return;

      const route = await finishGoogleAuthSession(session.user);
      if (!route.ok) {
        const q = route.query ? `?${route.query}` : "";
        router.replace(`${route.path}${q}`);
        return;
      }
      router.replace(route.path);
    };

    return subscribeNativeOAuthResume((result) => {
      void finishFromOAuth(result);
    });
  }, [router]);

  return null;
}
