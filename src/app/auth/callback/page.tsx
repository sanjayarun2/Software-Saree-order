"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { useLanguage } from "@/lib/language-context";
import { getOrCreateDeviceId } from "@/lib/device-id";
import {
  resolveDeviceForSession,
  markSessionEndedForDeviceLimit,
} from "@/lib/user-devices-supabase";
import { clearSession } from "@/lib/capacitor-storage";
import { clearLastSyncTimestamp } from "@/lib/local-store";

function readAuthError(): string | null {
  const query = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const raw =
    query.get("error_description") ||
    query.get("error") ||
    hash.get("error_description") ||
    hash.get("error");
  if (!raw) return null;
  try {
    return decodeURIComponent(raw.replace(/\+/g, " "));
  } catch {
    return raw;
  }
}

async function resolveOAuthSession(): Promise<{ session: Session | null; error: string | null }> {
  const code = new URLSearchParams(window.location.search).get("code");
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return { session: null, error: error.message };
    return { session: data.session, error: null };
  }

  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) return { session: null, error: error.message };
  if (session) return { session, error: null };

  return { session: null, error: null };
}

export default function AuthCallbackPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fail = (message: string) => {
      if (!cancelled) setError(message);
    };

    const finish = async (user: User) => {
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

    const run = async () => {
      const authError = readAuthError();
      if (authError) {
        fail(authError);
        return;
      }

      const { session, error: sessionError } = await resolveOAuthSession();
      if (sessionError) {
        fail(sessionError);
        return;
      }

      if (session?.user) {
        await finish(session.user);
        return;
      }

      fail(t("Google sign-in failed. Please try again."));
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [router, t]);

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
        <p className="max-w-md rounded-bento bg-red-50 p-4 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
          {error}
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
