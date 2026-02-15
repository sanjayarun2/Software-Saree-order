"use client";

import React, { useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { BentoCard } from "@/components/ui/BentoCard";
import { ErrorBoundary } from "@/components/ErrorBoundary";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const siteUrl = typeof window !== "undefined"
        ? (window.location.origin || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000")
        : (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000");
      const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${siteUrl}/login/`,
      });
      if (err) throw err;
      setSent(true);
    } catch (e) {
      setError((e as Error).message || "Failed to send reset email");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ErrorBoundary>
      <div className="flex min-h-screen flex-col items-center justify-center p-4 md:p-6">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Forgot Password?
            </h1>
            <p className="mt-2 text-slate-600 dark:text-slate-400">
              Enter your email to receive a reset link.
            </p>
          </div>

          <BentoCard>
            {sent ? (
              <p className="text-green-700 dark:text-green-300">
                Check your email for the reset link.
              </p>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <p className="rounded-bento bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
                    {error}
                  </p>
                )}
                <input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full rounded-bento border px-4 py-3"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full min-h-touch rounded-bento bg-primary-500 font-semibold text-white hover:bg-primary-600 disabled:opacity-50"
                >
                  {loading ? "Sending…" : "Send Reset Link"}
                </button>
              </form>
            )}
          </BentoCard>

          <p className="text-center text-sm">
            <Link href="/login/" className="text-primary-600 hover:underline dark:text-primary-400">
              Back to Login
            </Link>
          </p>
        </div>
      </div>
    </ErrorBoundary>
  );
}
