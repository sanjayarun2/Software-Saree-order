"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useLanguage } from "@/lib/language-context";
import { getOrCreateDeviceId } from "@/lib/device-id";
import {
  resolveDeviceForSession,
  markSessionEndedForDeviceLimit,
  AUTH_ERROR_DEVICE_LIMIT,
} from "@/lib/user-devices-supabase";
import { clearSession } from "@/lib/capacitor-storage";
import { clearLastSyncTimestamp } from "@/lib/local-store";

export default function AuthCallbackPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const finish = async () => {
      const params = new URLSearchParams(window.location.search);
      const authError = params.get("error_description") || params.get("error");
      if (authError) {
        if (!cancelled) setError(authError);
        return;
      }

      let { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        if (!cancelled) setError(sessionError.message);
        return;
      }

      if (!session?.user && window.location.search.includes("code=")) {
        const { data: exchangeData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(
          window.location.href
        );
        if (exchangeError) {
          if (!cancelled) setError(exchangeError.message || t("Google sign-in failed."));
          return;
        }
        session = exchangeData.session;
      }

      const user = session?.user;
      if (!user) {
        if (!cancelled) setError(t("Google sign-in failed."));
        return;
      }

      const deviceId = getOrCreateDeviceId();
      if (deviceId) {
        const r = await resolveDeviceForSession(user.id, deviceId);
        if (!r.ok) {
          markSessionEndedForDeviceLimit();
          await supabase.auth.signOut();
          await clearSession();
          if (!cancelled) router.replace("/login/?device_limit=1");
          return;
        }
      }

      void clearLastSyncTimestamp(user.id).catch(() => {});
      if (!cancelled) router.replace("/dashboard/");
    };

    void finish();

    return () => {
      cancelled = true;
    };
  }, [router, t]);

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
        <p className="max-w-md rounded-bento bg-red-50 p-4 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
          {error === AUTH_ERROR_DEVICE_LIMIT
            ? t("This account is already signed in on the maximum number of devices.")
            : error}
        </p>
        <a href="/login/" className="mt-4 text-sm font-medium text-primary-600 hover:underline dark:text-primary-400">
          {t("Back to Login")}
        </a>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
        <p className="text-sm text-slate-600 dark:text-slate-400">{t("Completing sign-in…")}</p>
      </div>
    </div>
  );
}
