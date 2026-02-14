"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { BentoCard } from "@/components/ui/BentoCard";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { getRecentMobiles, saveMobile } from "@/lib/mobile-storage";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mobile, setMobile] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [recentMobiles, setRecentMobiles] = useState<string[]>([]);
  const { signIn, user, loading: authLoading } = useAuth();

  useEffect(() => {
    setRecentMobiles(getRecentMobiles());
  }, []);
  const router = useRouter();

  React.useEffect(() => {
    if (!authLoading && user) router.replace("/dashboard/");
  }, [user, authLoading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: err } = await signIn(email, password);
    if (err) {
      setLoading(false);
      setError(err.message || "Login failed. Please try again.");
      return;
    }
    // Save mobile to user_profiles and localStorage (non-blocking)
    const trimmedMobile = mobile.trim();
    if (trimmedMobile) {
      saveMobile(trimmedMobile);
      try {
        const { supabase } = await import("@/lib/supabase");
        const { data: { user: signedInUser } } = await supabase.auth.getUser();
        if (signedInUser) {
          await supabase
            .from("user_profiles")
            .upsert(
              { user_id: signedInUser.id, mobile: trimmedMobile, updated_at: new Date().toISOString() },
              { onConflict: "user_id" }
            );
        }
      } catch {
        // Ignore - don't block redirect
      }
    }
    setLoading(false);
    router.replace("/dashboard/");
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
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              LOGIN
            </h1>
            <p className="mt-2 text-slate-600 dark:text-slate-400">
              Saree Order App
            </p>
          </div>

          <BentoCard>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <p className="rounded-bento bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
                  {error}
                </p>
              )}

              <div>
                <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  inputMode="email"
                  autoComplete="email"
                  className="w-full rounded-bento border border-slate-300 px-4 py-3 text-slate-900 placeholder-slate-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              <div>
                <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Password"
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
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? "🙈" : "👁"}
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="mobile" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Mobile Number
                </label>
                <input
                  id="mobile"
                  name="mobile"
                  type="tel"
                  list="mobile-suggestions"
                  placeholder="e.g. +91 9876543210 or 9876543210"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  inputMode="tel"
                  autoComplete="tel"
                  className="w-full rounded-bento border border-slate-300 px-4 py-3 text-slate-900 placeholder-slate-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                />
                <datalist id="mobile-suggestions">
                  {recentMobiles.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
                <p className="mt-1 text-xs text-slate-500">Optional. With or without country code.</p>
              </div>

              <Link
                href="/forgot-password/"
                className="block text-sm text-primary-600 hover:underline dark:text-primary-400"
              >
                Forgot Password?
              </Link>

              <button
                type="submit"
                disabled={loading}
                className="w-full min-h-touch rounded-bento bg-primary-500 px-4 py-3 font-semibold text-white hover:bg-primary-600 disabled:opacity-50"
              >
                {loading ? "Signing in…" : "Login"}
              </button>
            </form>
          </BentoCard>

          <p className="text-center text-sm text-slate-600 dark:text-slate-400">
            Don&apos;t have an account?{" "}
            <Link href="/register/" className="font-medium text-primary-600 hover:underline dark:text-primary-400">
              Register
            </Link>
          </p>
          <p className="text-center">
            <Link href="/check-connection/" className="text-xs text-slate-500 hover:underline">
              Check Supabase connection
            </Link>
          </p>
        </div>
      </div>
    </ErrorBoundary>
  );
}
