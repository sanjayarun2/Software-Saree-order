"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import {
  listAdminWorkers,
  addAdminWorker,
  removeAdminWorker,
  type AdminWorkerRow,
} from "@/lib/admin-workers-supabase";

export default function AdminSettingsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [workers, setWorkers] = useState<AdminWorkerRow[]>([]);
  const [workersLoading, setWorkersLoading] = useState(true);
  const [emailInput, setEmailInput] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    if (!user?.id) {
      setWorkers([]);
      setWorkersLoading(false);
      return;
    }
    setWorkersLoading(true);
    const { data, error } = await listAdminWorkers(user.id);
    if (!error) setWorkers(data);
    setWorkersLoading(false);
  }, [user?.id]);

  useEffect(() => {
    if (!loading && !user) router.replace("/login/");
  }, [user, loading, router]);

  useEffect(() => {
    if (user?.id) void refresh();
  }, [user?.id, refresh]);

  const adminEmail = user?.email?.trim().toLowerCase() ?? "";

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!user?.id) return;
    const next = emailInput.trim().toLowerCase();
    if (!next) {
      setFormError("Enter an email.");
      return;
    }
    if (next === adminEmail) {
      setFormError("Use a different email than your admin account.");
      return;
    }
    setSaving(true);
    const { error } = await addAdminWorker(user.id, next);
    setSaving(false);
    if (error) {
      setFormError(
        error.message.includes("duplicate") || error.message.includes("unique")
          ? "This email is already assigned as a worker."
          : error.message
      );
      return;
    }
    setEmailInput("");
    void refresh();
  };

  const handleRemove = async (row: AdminWorkerRow) => {
    setBusyId(row.id);
    setFormError(null);
    const { error } = await removeAdminWorker(row.id);
    setBusyId(null);
    if (error) {
      setFormError(error.message);
      return;
    }
    void refresh();
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <ErrorBoundary>
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-4 lg:px-10 lg:py-6">
        <div className="flex items-center gap-3">
          <Link
            href="/settings/"
            className="text-sm font-medium text-primary-600 hover:underline dark:text-primary-400"
          >
            ← Settings
          </Link>
        </div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 lg:text-2xl">Admin</h1>

        <div className="overflow-hidden rounded-2xl border border-white/20 bg-white/80 px-4 py-3 text-sm shadow-[0_4px_20px_rgba(0,0,0,0.06)] dark:border-white/10 dark:bg-slate-800/60 dark:shadow-[0_4px_20px_rgba(0,0,0,0.2)]">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Admin email
          </p>
          <p className="mt-1 truncate text-base text-slate-900 dark:text-slate-100">{user.email}</p>
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            In Supabase, open <strong className="text-slate-700 dark:text-slate-300">admin_workers</strong> to see
            which workers belong to which admin (<code className="rounded bg-slate-100 px-1 dark:bg-slate-700">admin_user_id</code>{" "}
            + <code className="rounded bg-slate-100 px-1 dark:bg-slate-700">worker_email</code>).
          </p>
        </div>

        <div className="overflow-hidden rounded-2xl border border-white/20 bg-white/80 p-4 shadow-[0_4px_20px_rgba(0,0,0,0.06)] dark:border-white/10 dark:bg-slate-800/60 dark:shadow-[0_4px_20px_rgba(0,0,0,0.2)]">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Workers</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Listed emails get <strong className="text-slate-700 dark:text-slate-300">single-device</strong> login (one
            phone per mail). Removing a worker restores the default of two devices for that account.
          </p>

          <form onSubmit={handleAdd} className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <label htmlFor="worker-email" className="sr-only">
                Worker email
              </label>
              <input
                id="worker-email"
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="worker@example.com"
                autoComplete="email"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900 placeholder-slate-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
            <button
              type="submit"
              disabled={saving}
              className="min-h-touch shrink-0 rounded-xl bg-primary-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-600 disabled:opacity-50"
            >
              {saving ? "Adding…" : "Add worker"}
            </button>
          </form>
          {formError ? (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">{formError}</p>
          ) : null}

          <ul className="mt-4 divide-y divide-slate-200 dark:divide-slate-600">
            {workersLoading ? (
              <li className="py-3 text-sm text-slate-500">Loading…</li>
            ) : workers.length === 0 ? (
              <li className="py-3 text-sm text-slate-500">No workers yet.</li>
            ) : (
              workers.map((w) => (
                <li
                  key={w.id}
                  className="flex items-center justify-between gap-2 py-3 text-sm text-slate-800 dark:text-slate-200"
                >
                  <span className="min-w-0 truncate">{w.worker_email}</span>
                  <button
                    type="button"
                    disabled={busyId === w.id}
                    onClick={() => void handleRemove(w)}
                    className="shrink-0 rounded-lg border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    {busyId === w.id ? "…" : "Remove"}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
    </ErrorBoundary>
  );
}
