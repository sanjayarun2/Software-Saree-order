"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { BentoCard } from "@/components/ui/BentoCard";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { getRecentMobiles, saveMobile } from "@/lib/mobile-storage";

const GMAIL_APP_SCHEME = "googlegmail://";
const GMAIL_WEB_URL = "https://mail.google.com";

function getOpenGmailUrl(): string {
  if (typeof window === "undefined") return GMAIL_WEB_URL;
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  return isMobile ? GMAIL_APP_SCHEME : GMAIL_WEB_URL;
}

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mobile, setMobile] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [recentMobiles, setRecentMobiles] = useState<string[]>([]);
  const [openGmailUrl, setOpenGmailUrl] = useState(GMAIL_WEB_URL);
  const { signUp } = useAuth();

  useEffect(() => {
    setRecentMobiles(getRecentMobiles());
  }, []);

  useEffect(() => {
    setOpenGmailUrl(getOpenGmailUrl());
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const trimmedMobile = mobile.trim();
    const { error: err, user: newUser } = await signUp(email, password, trimmedMobile ? { mobile: trimmedMobile } : undefined);
    setLoading(false);
    if (err) {
      const msg = err.message || "";
      const isAlreadyRegistered =
        /already\s+(registered|exists?)/i.test(msg) ||
        /user\s+already\s+registered/i.test(msg) ||
        (newUser?.identities && newUser.identities.length === 0);
      if (isAlreadyRegistered) {
        setError("EMAIL_EXISTS");
        return;
      }
      setError(msg || "Registration failed. Please try again.");
      return;
    }
    if (newUser?.identities && newUser.identities.length === 0) {
      setError("EMAIL_EXISTS");
      return;
    }
    if (trimmedMobile) {
      saveMobile(trimmedMobile);
      if (typeof window !== "undefined") {
        localStorage.setItem("saree_pending_mobile", trimmedMobile);
      }
    }
    if (typeof window !== "undefined") localStorage.setItem("saree_app_returning", "1");
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
              <div className="space-y-4">
                <p className="rounded-bento bg-green-50 p-4 text-green-800 dark:bg-green-900/30 dark:text-green-200">
                  Check your inbox! We sent a verification link to <strong>{email}</strong>. If you don&apos;t see it, please check your Spam folder.
                </p>
                <a
                  href={openGmailUrl}
                  target={openGmailUrl.startsWith("http") ? "_blank" : undefined}
                  rel={openGmailUrl.startsWith("http") ? "noopener noreferrer" : undefined}
                  className="block w-full rounded-bento border border-gray-300 bg-white px-4 py-3 text-center font-semibold text-gray-700 hover:bg-gray-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  Open Gmail
                </a>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="rounded-bento bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
                    {error === "EMAIL_EXISTS" ? (
                      <>
                        <p className="font-medium">This email is already registered.</p>
                        <p className="mt-1">
                          <Link href="/login/" className="underline">Login</Link>
                          {" or "}
                          <Link href="/forgot-password/" className="underline">Forgot password</Link>
                          {" to reset."}
                        </p>
                      </>
                    ) : (
                      <p>{error}</p>
                    )}
                  </div>
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
                      className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
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
                    placeholder="Mobile number"
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
