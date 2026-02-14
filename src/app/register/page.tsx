"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { BentoCard } from "@/components/ui/BentoCard";
import { ErrorBoundary } from "@/components/ErrorBoundary";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const { signUp } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: err } = await signUp(email, password);
    setLoading(false);
    if (err) {
      setError(err.message || "Registration failed. Please try again.");
      return;
    }
    setSuccess(true);
  };

  return (
    <ErrorBoundary>
      <div className="flex min-h-screen flex-col items-center justify-center p-4 md:p-6">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              REGISTER
            </h1>
            <p className="mt-2 text-slate-600 dark:text-slate-400">
              Create your account
            </p>
          </div>

          <BentoCard>
            {success ? (
              <p className="rounded-bento bg-green-50 p-4 text-green-800 dark:bg-green-900/30 dark:text-green-200">
                Check your email to confirm your account.
              </p>
            ) : (
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
                      minLength={6}
                      className="w-full rounded-bento border border-slate-300 px-4 py-3 pr-12 text-slate-900 placeholder-slate-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                      autoComplete="new-password"
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

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full min-h-touch rounded-bento bg-primary-500 px-4 py-3 font-semibold text-white hover:bg-primary-600 disabled:opacity-50"
                >
                  {loading ? "Creating account…" : "Register"}
                </button>
              </form>
            )}
          </BentoCard>

          <p className="text-center text-sm text-slate-600 dark:text-slate-400">
            Already have an account?{" "}
            <Link href="/login/" className="font-medium text-primary-600 hover:underline dark:text-primary-400">
              Login
            </Link>
          </p>
        </div>
      </div>
    </ErrorBoundary>
  );
}
