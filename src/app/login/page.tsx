"use client";

import React, { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/language-context";
import { BentoCard } from "@/components/ui/BentoCard";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AppLogo } from "@/components/AppLogo";
import { AUTH_ERROR_DEVICE_LIMIT, consumeDeviceLimitRedirectFlag } from "@/lib/user-devices-supabase";
import { WHATSAPP_SUPPORT_GROUP_URL } from "@/lib/support-links";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { MobileNumberField } from "@/components/MobileNumberField";
import { getRecentMobiles } from "@/lib/mobile-storage";
import { consumeMobileRequiredRedirectFlag } from "@/lib/google-auth-mobile";
import { useGoogleSignIn } from "@/lib/use-google-sign-in";

export default function LoginPage() {
  const searchParams = useSearchParams();
  const resetSuccess = searchParams.get("reset") === "success";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mobile, setMobile] = useState("");
  const [recentMobiles, setRecentMobiles] = useState<string[]>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deviceLimit, setDeviceLimit] = useState(false);
  const [mobileRequired, setMobileRequired] = useState(false);
  const [loading, setLoading] = useState(false);
  const { signIn, user, loading: authLoading } = useAuth();
  const { googleLoading, startGoogleSignIn } = useGoogleSignIn();
  const { t } = useLanguage();
  const router = useRouter();

  useEffect(() => {
    setRecentMobiles(getRecentMobiles());
  }, []);

  React.useEffect(() => {
    if (!authLoading && user) router.replace("/dashboard/");
  }, [user, authLoading, router]);

  React.useEffect(() => {
    if (consumeDeviceLimitRedirectFlag() || searchParams.get("device_limit") === "1") {
      setDeviceLimit(true);
    }
    if (consumeMobileRequiredRedirectFlag() || searchParams.get("mobile_required") === "1") {
      setMobileRequired(true);
    }
  }, [searchParams]);

  const openWhatsAppSupport = () => {
    if (typeof window !== "undefined") {
      window.open(WHATSAPP_SUPPORT_GROUP_URL, "_blank", "noopener,noreferrer");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setDeviceLimit(false);
    setMobileRequired(false);
    setLoading(true);
    const { error: err } = await signIn(email, password);
    if (err) {
      setLoading(false);
      if (err.message === AUTH_ERROR_DEVICE_LIMIT) {
        setDeviceLimit(true);
        return;
      }
      setError(err.message || `${t("Login")} ${t("Failed")}.`);
      return;
    }
    setLoading(false);
    router.replace("/dashboard/");
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setDeviceLimit(false);
    setMobileRequired(false);
    const { error: err } = await startGoogleSignIn(mobile);
    if (err) setError(err);
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="flex min-h-screen flex-col items-center justify-center p-4 md:p-6">
        <div className="w-full max-w-md space-y-6">
          <div className="flex flex-col items-center gap-4 text-center">
            <AppLogo />
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                {t("Login")}
              </h1>
            </div>
          </div>

          <BentoCard>
            <form onSubmit={handleSubmit} className="space-y-4">
              {resetSuccess && (
                <p className="rounded-bento bg-green-50 p-3 text-sm text-green-800 dark:bg-green-900/30 dark:text-green-200">
                  {t("Password reset successfully. Sign in with your new password.")}
                </p>
              )}
              {deviceLimit && (
                <div className="rounded-bento bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                  <p className="font-medium">{t("This account is already signed in on the maximum number of devices.")}</p>
                  <p className="mt-1 text-amber-800/90 dark:text-amber-200/90">{t("Need another device? Contact us on WhatsApp.")}</p>
                  <button
                    type="button"
                    onClick={openWhatsAppSupport}
                    className="mt-3 w-full min-h-touch rounded-bento bg-[#25D366] px-4 py-2.5 font-semibold text-white hover:opacity-95"
                  >
                    WhatsApp
                  </button>
                </div>
              )}
              {mobileRequired && (
                <div className="rounded-bento bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                  <p className="font-medium">{t("Mobile number is required for Google sign-in.")}</p>
                  <p className="mt-1 text-amber-800/90 dark:text-amber-200/90">
                    {t("Add your mobile number below, then try Google sign-in again.")}
                  </p>
                </div>
              )}
              {error && (
                <p className="rounded-bento bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
                  {error}
                </p>
              )}

              <div>
                <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  {t("Email")}
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  placeholder={t("Email")}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  inputMode="email"
                  autoComplete="email"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  className="w-full rounded-bento border border-slate-300 px-4 py-3 text-slate-900 placeholder-slate-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              <div>
                <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  {t("Password")}
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder={t("Password")}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full rounded-bento border border-slate-300 px-4 py-3 pr-12 text-slate-900 placeholder-slate-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
                    aria-label={showPassword ? t("Hide password") : t("Show password")}
                  >
                    {showPassword ? "🙈" : "👁"}
                  </button>
                </div>
              </div>

              <Link
                href="/forgot-password/"
                className="block text-sm text-primary-600 hover:underline dark:text-primary-400"
              >
                {t("Forgot Password?")}
              </Link>

              <button
                type="submit"
                disabled={loading || googleLoading}
                className="w-full min-h-touch rounded-bento bg-primary-500 px-4 py-3 font-semibold text-white hover:bg-primary-600 disabled:opacity-50"
              >
                {loading ? t("Signing in…") : t("Login")}
              </button>

              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
                <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {t("or")}
                </span>
                <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
              </div>

              <MobileNumberField
                id="google-mobile"
                value={mobile}
                onChange={setMobile}
                recentMobiles={recentMobiles}
                requiredForGoogle
                disabled={loading || googleLoading}
              />

              <GoogleSignInButton
                onClick={handleGoogleSignIn}
                disabled={loading}
                loading={googleLoading}
              />
            </form>
          </BentoCard>

          <p className="text-center text-sm text-slate-600 dark:text-slate-400">
            {t("Don't have an account?")}{" "}
            <Link href="/register/" className="font-medium text-primary-600 hover:underline dark:text-primary-400">
              {t("Register")}
            </Link>
          </p>
        </div>
      </div>
    </ErrorBoundary>
  );
}
