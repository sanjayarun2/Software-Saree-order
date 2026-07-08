"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import type { GoogleAuthIntent } from "@/lib/google-auth-intent";
import { stageGoogleAuthIntent } from "@/lib/google-auth-intent";
import { startGoogleOAuth } from "@/lib/google-oauth-flow";
import { finishGoogleAuthSession } from "@/lib/google-auth-finish";
import { waitForAuthSession } from "@/lib/native-oauth-handler";
import { useLanguage } from "@/lib/language-context";

export function useGoogleSignIn() {
  const { t } = useLanguage();
  const router = useRouter();
  const [googleLoading, setGoogleLoading] = useState(false);

  const startGoogleSignIn = useCallback(
    async (intent: GoogleAuthIntent): Promise<{ error: string | null }> => {
      stageGoogleAuthIntent(intent);
      if (typeof window !== "undefined") {
        localStorage.setItem("saree_app_returning", "1");
      }

      setGoogleLoading(true);
      try {
        const { error: oauthError, session } = await startGoogleOAuth("");
        if (oauthError) {
          return { error: oauthError.message || t("Google sign-in failed.") };
        }

        if (!Capacitor.isNativePlatform()) {
          return { error: null };
        }

        const activeSession = session ?? (await waitForAuthSession(3000));
        if (!activeSession?.user) {
          return { error: t("Google sign-in failed. Please try again.") };
        }

        const route = await finishGoogleAuthSession(activeSession.user);
        if (!route.ok) {
          const q = route.query ? `?${route.query}` : "";
          router.replace(`${route.path}${q}`);
          return { error: null };
        }
        router.replace(route.path);
        return { error: null };
      } finally {
        setGoogleLoading(false);
      }
    },
    [router, t]
  );

  return { googleLoading, startGoogleSignIn };
}
