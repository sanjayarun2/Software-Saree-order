"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { BentoCard } from "@/components/ui/BentoCard";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AppLogo } from "@/components/AppLogo";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [validSession, setValidSession] = useState<boolean | null>(null);

  useEffect(() => {
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    const hasRecovery = hash.includes("type=recovery") || hash.includes("access_token");
    if (!hasRecovery) {
      setValidSession(false);
      return;
    }
    const checkSession = () => {
      supabase.auth.getSession().then(({ data: { session } }) => {
        setValidSession(!!session);
      });
    };
    checkSession();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") checkSession();
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
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
      setSuccess(true);
      await supabase.auth.signOut();
      setTimeout(() => {
        router.replace("/login/?reset=success");
      }, 1500);
    } catch (e) {
      setError((e as Error).message || "Failed to update password. The link may have expired.");
      setLoading(false);
    }
  };

  if (validSession === null) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  if (validSession === false) {
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

  if (success) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-4 md:p-6">
        <BentoCard>
          <p className="text-center font-medium text-green-700 dark:text-green-300">
            Password updated. Redirecting to login…
          </p>
        </BentoCard>
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
                Set new password
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
                    placeholder="At least 6 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
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
                  minLength={6}
                  autoComplete="new-password"
                  className="w-full rounded-bento border border-slate-300 px-4 py-3 text-slate-900 placeholder-slate-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full min-h-touch rounded-bento bg-primary-500 px-4 py-3 font-semibold text-white hover:bg-primary-600 disabled:opacity-50"
              >
                {loading ? "Updating…" : "Update password"}
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
  );
}
