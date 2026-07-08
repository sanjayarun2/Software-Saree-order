"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/language-context";
import { AppLogo } from "@/components/AppLogo";
import { BentoCard } from "@/components/ui/BentoCard";
import { MobileNumberField } from "@/components/MobileNumberField";
import { getRecentMobiles } from "@/lib/mobile-storage";
import {
  hasPendingMobileCompletion,
  clearPendingMobileCompletion,
} from "@/lib/mobile-completion-gate";
import { saveMobileToUserProfile, userProfileHasMobile } from "@/lib/google-auth-mobile";

export default function CompleteMobilePage() {
  const { user, loading: authLoading } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const [mobile, setMobile] = useState("");
  const [recentMobiles, setRecentMobiles] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(true);
  const backListenerRef = useRef<{ remove: () => Promise<void> } | null>(null);

  useEffect(() => {
    setRecentMobiles(getRecentMobiles());
  }, []);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      router.replace("/login/");
      return;
    }

    void userProfileHasMobile(user.id).then((hasMobile) => {
      if (hasMobile) {
        clearPendingMobileCompletion();
        router.replace("/dashboard/");
        return;
      }
      if (!hasPendingMobileCompletion()) {
        router.replace("/dashboard/");
        return;
      }
      setChecking(false);
    });
  }, [user, authLoading, router]);

  useEffect(() => {
    if (checking || !user) return;

    const blockBack = () => {
      history.pushState(null, "", window.location.href);
    };
    blockBack();
    window.addEventListener("popstate", blockBack);

    if (Capacitor.isNativePlatform()) {
      void import("@capacitor/app").then(({ App }) => {
        void App.addListener("backButton", () => {
          blockBack();
        }).then((handle) => {
          backListenerRef.current = handle;
        });
      });
    }

    return () => {
      window.removeEventListener("popstate", blockBack);
      void backListenerRef.current?.remove();
      backListenerRef.current = null;
    };
  }, [checking, user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setError(null);
    setSaving(true);
    const result = await saveMobileToUserProfile(user.id, mobile, user.email);
    setSaving(false);
    if (!result.ok) {
      setError(
        result.message === "MOBILE_INVALID"
          ? t("Enter a valid mobile number (at least 10 digits).")
          : result.message
      );
      return;
    }
    clearPendingMobileCompletion();
    router.replace("/dashboard/");
  };

  if (authLoading || checking) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[120] flex min-h-dvh flex-col items-center justify-center bg-[var(--bento-bg)] p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-4 text-center">
          <AppLogo />
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              {t("Add your mobile number")}
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              {t("Required to complete signup. You can continue once your number is saved.")}
            </p>
          </div>
        </div>

        <BentoCard>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error ? (
              <p className="rounded-bento bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
                {error}
              </p>
            ) : null}

            <MobileNumberField
              id="complete-mobile"
              value={mobile}
              onChange={setMobile}
              recentMobiles={recentMobiles}
              required
              disabled={saving}
            />

            <button
              type="submit"
              disabled={saving || !mobile.trim()}
              className="w-full min-h-touch rounded-bento bg-primary-500 px-4 py-3 font-semibold text-white hover:bg-primary-600 disabled:opacity-50"
            >
              {saving ? t("Saving…") : t("Continue")}
            </button>
          </form>
        </BentoCard>
      </div>
    </div>
  );
}
