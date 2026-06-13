"use client";

import { useCallback, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/language-context";
import { stageMobileForGoogleAuth } from "@/lib/google-auth-mobile";

export function useGoogleSignIn() {
  const { signInWithGoogle } = useAuth();
  const { t } = useLanguage();
  const [googleLoading, setGoogleLoading] = useState(false);

  const resolveStageError = useCallback(
    (code: string): string => {
      if (code === "MOBILE_INVALID") {
        return t("Enter a valid mobile number (at least 10 digits).");
      }
      return t("Please add your mobile number before continuing with Google.");
    },
    [t]
  );

  const startGoogleSignIn = useCallback(
    async (mobile: string): Promise<{ error: string | null }> => {
      const staged = stageMobileForGoogleAuth(mobile);
      if (!staged.ok) {
        return { error: resolveStageError(staged.message) };
      }

      setGoogleLoading(true);
      const { error } = await signInWithGoogle();
      if (error) {
        setGoogleLoading(false);
        return { error: error.message || t("Google sign-in failed.") };
      }
      return { error: null };
    },
    [resolveStageError, signInWithGoogle, t]
  );

  return { googleLoading, startGoogleSignIn };
}
