"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { BentoCard } from "@/components/ui/BentoCard";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AppLogo } from "@/components/AppLogo";

const APP_SCHEME = "sareeorder://";
const APP_PACKAGE = "com.sareeorder.app";
const SITE_URL = "https://software-saree-order.vercel.app";
const MIN_PASSWORD_LENGTH = 6;

function getOpenAppUrl(): string {
  if (typeof window === "undefined") return "/dashboard/";
  const appUrl = window.location.origin || process.env.NEXT_PUBLIC_SITE_URL || SITE_URL;
  const isAndroid = /Android/i.test(navigator.userAgent);
  if (isAndroid) {
    const fallback = encodeURIComponent(appUrl);
    return `intent://open#Intent;scheme=sareeorder;package=${APP_PACKAGE};S.browser_fallback_url=${fallback};end`;
  }
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (isIOS) return APP_SCHEME;
  return "/dashboard/";
}

function hasRecoveryInHash(): boolean {
  if (typeof window === "undefined") return false;
  const hash = window.location.hash;
  return hash.includes("type=recovery") || hash.includes("access_token");
}

export default function UpdatePasswordPage() {
  const [openAppUrl, setOpenAppUrl] = useState("/dashboard/");
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [checking, setChecking] = useState(true);

  const allowForm = useCallback(() => {
    setRecoveryReady(true);
    setChecking(false);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    setOpenAppUrl(getOpenAppUrl());

    function applyRecoveryReady() {
      setRecoveryReady(true);
      setChecking(false);
    }

    if (hasRecoveryInHash()) {
      allowForm();
      setChecking(false);
    } else {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) applyRecoveryReady();
        setChecking(false);
      });
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        allowForm();
      }
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (session) applyRecoveryReady();
        });
      }
    });

    return () => subscription.unsubscribe();
  }, [allowForm]);

  useEffect(() => {
    const onFocus = () => {
      if (hasRecoveryInHash()) allowForm();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [allowForm]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) throw err;
      await supabase.auth.signOut();
      setShowSuccessModal(true);
    } catch (e) {
      setError((e as Error).message || "Failed to update password. The link may have expired.");
    } finally {
      setLoading(false);
    }
  };

  if (checking && !recoveryReady) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  if (!recoveryReady) {
    return (
      <ErrorBoundary>
        <div className="flex min-h-screen flex-col items-center justify-center p-4 md:p-6">
          <div className="w-full max-w-md space-y-6 text-center">
            <BentoCard>
              <p className="text-slate-700 dark:text-slate-300">
                Invalid or expired reset link. Request a new one.
              </p>
              <Link
                href="/forgot-password/"
                className="mt-4 inline-block font-medium text-primary-600 underline dark:text-primary-400"
              >
                Forgot Password
              </Link>
            </BentoCard>
            <Link href="/login/" className="text-sm text-primary-600 underline dark:text-primary-400">
              Back to Login
            </Link>
          </div>
        </div>
      </ErrorBoundary>
    );
  }

  return (
    <>
      {/* Password Changed! full-screen modal with Open App */}
      {showSuccessModal && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[var(--bento-bg)] p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="password-changed-title"
        >
          <div className="flex max-w-sm flex-col items-center gap-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40">
              <svg className="h-8 w-8 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 id="password-changed-title" className="text-xl font-bold text-gray-900 dark:text-gray-100">
              Password Changed!
            </h2>
            <p className="text-center text-sm text-gray-600 dark:text-gray-400">
              Your password has been updated. Sign in with your new password.
            </p>
            <div className="flex w-full flex-col gap-3">
              <a
                href={openAppUrl}
                className="w-full rounded-xl bg-primary-500 px-4 py-3 text-center font-semibold text-white hover:bg-primary-600"
              >
                Open App
              </a>
              <Link
                href="/login/"
                className="w-full rounded-xl border border-gray-300 bg-transparent px-4 py-3 text-center font-medium text-gray-700 hover:bg-gray-50 dark:border-slate-600 dark:text-gray-300 dark:hover:bg-slate-800"
              >
                Back to Login
              </Link>
            </div>
          </div>
        </div>
      )}

      <ErrorBoundary>
        <div className="flex min-h-screen flex-col items-center justify-center p-4 md:p-6">
          <div className="w-full max-w-md space-y-6">
            <div className="flex flex-col items-center gap-4 text-center">
              <AppLogo />
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                  Set New Password
                </h1>
                <p className="mt-2 text-slate-600 dark:text-slate-400">
                  Enter your new password below.
                </p>
              </div>
            </div>

            <BentoCard>
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <p className="rounded-bento bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
                    {error}
                  </p>
                )}

                <div>
                  <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    New password
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={MIN_PASSWORD_LENGTH}
                      autoComplete="new-password"
                      className="w-full rounded-bento border border-slate-300 px-4 py-3 pr-12 text-slate-900 placeholder-slate-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? "🙈" : "👁"}
                    </button>
                  </div>
                </div>

                <div>
                  <label htmlFor="confirmPassword" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Confirm password
                  </label>
                  <input
                    id="confirmPassword"
                    type={showPassword ? "text" : "password"}
                    placeholder="Confirm new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={MIN_PASSWORD_LENGTH}
                    autoComplete="new-password"
                    className="w-full rounded-bento border border-slate-300 px-4 py-3 text-slate-900 placeholder-slate-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full min-h-touch rounded-bento bg-primary-500 px-4 py-3 font-semibold text-white hover:bg-primary-600 disabled:opacity-50"
                >
                  {loading ? "Updating…" : "Reset Password"}
                </button>
              </form>
            </BentoCard>

            <p className="text-center text-sm text-slate-600 dark:text-slate-400">
              <Link href="/login/" className="font-medium text-primary-600 hover:underline dark:text-primary-400">
                Back to Login
              </Link>
            </p>
          </div>
        </div>
      </ErrorBoundary>
    </>
  );
}
