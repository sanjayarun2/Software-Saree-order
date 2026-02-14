"use client";

import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function CheckConnectionPage() {
  const [status, setStatus] = useState<{
    url: string;
    connected: boolean;
    authError: string | null;
    dbError: string | null;
    message: string;
  }>({ url: "", connected: false, authError: null, dbError: null, message: "Checking..." });

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
    const keySet = key.length > 20 && !key.includes("your-anon");

    if (!url || url.includes("your-project") || !keySet) {
      setStatus({
        url,
        connected: false,
        authError: null,
        dbError: null,
        message: "❌ Supabase URL or key not configured. Update .env.local with your real values.",
      });
      return;
    }

    const check = async () => {
      try {
        const { data: { session }, error: authErr } = await supabase.auth.getSession();
        const authError = authErr?.message || null;

        let dbError: string | null = null;
        try {
          const { error: dbErr } = await supabase.from("orders").select("id").limit(1);
          if (dbErr) dbError = dbErr.message;
        } catch {
          dbError = "orders table not found. Run supabase/schema.sql in Supabase SQL Editor.";
        }

        const connected = !authError;
        setStatus({
          url: url.replace(/https?:\/\/([^.]+).*/, "https://$1.supabase.co"),
          connected,
          authError,
          dbError,
          message: connected
            ? "✅ Connected to Supabase"
            : "❌ Connection problem",
        });
      } catch (e) {
        setStatus({
          url,
          connected: false,
          authError: (e as Error).message,
          dbError: null,
          message: "❌ Failed to connect",
        });
      }
    };

    check();
  }, []);

  return (
    <div className="mx-auto max-w-xl space-y-6 p-6">
      <h1 className="text-xl font-bold">Supabase Connection Check</h1>
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
        <p className="mb-2 font-medium">{status.message}</p>
        <p className="text-sm text-slate-600 dark:text-slate-400">Project URL: {status.url || "(not set)"}</p>
        {status.authError && (
          <p className="mt-2 text-sm text-red-600">Auth: {status.authError}</p>
        )}
        {status.dbError && (
          <p className="mt-2 text-sm text-amber-600">DB: {status.dbError}</p>
        )}
      </div>
      <p className="text-sm text-slate-600">
        Make sure this URL matches your Supabase project. Go to supabase.com → your project → Project Settings → API to verify.
      </p>
      <a href="/login/" className="text-primary-600 hover:underline">← Back to Login</a>
    </div>
  );
}
