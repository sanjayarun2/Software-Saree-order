"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { useAuth } from "@/lib/auth-context";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import {
  clearSavedPosPrinter,
  getSavedPosPrinter,
  listBluetoothPrinters,
  savePosPrinter,
  testSavedPosPrinter,
  type SavedPosPrinter,
} from "@/lib/pos-bluetooth-print";

export default function PrinterSetupPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [saved, setSaved] = useState<SavedPosPrinter | null>(null);
  const [printers, setPrinters] = useState<SavedPosPrinter[]>([]);
  const [scanning, setScanning] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/login/");
  }, [user, loading, router]);

  useEffect(() => {
    setSaved(getSavedPosPrinter());
  }, []);

  const isAndroidNative = useMemo(
    () => typeof window !== "undefined" && Capacitor.isNativePlatform(),
    []
  );

  const scanPrinters = async () => {
    setError(null);
    setInfo(null);
    setScanning(true);
    const result = await listBluetoothPrinters();
    setScanning(false);
    if (!result.success) {
      setError(result.error ?? "Unable to scan printers.");
      return;
    }
    setPrinters(result.printers);
    setInfo(result.printers.length ? `Found ${result.printers.length} printer(s).` : "No paired printers found.");
  };

  const handleSave = async (printer: SavedPosPrinter) => {
    setSavingId(printer.id);
    setError(null);
    setInfo(null);
    try {
      const withDriver: SavedPosPrinter = { ...printer, driver: "escpos" };
      savePosPrinter(withDriver);
      setSaved(withDriver);
      setInfo(`Saved printer: ${withDriver.name || withDriver.address || withDriver.id}`);
    } catch {
      setError("Could not save printer preference.");
    } finally {
      setSavingId(null);
    }
  };

  const handleTest = async () => {
    setError(null);
    setInfo(null);
    setTesting(true);
    const result = await testSavedPosPrinter();
    setTesting(false);
    if (!result.success) {
      setError(result.error ?? "Test print failed.");
      return;
    }
    setInfo("Test print sent successfully.");
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-4 lg:px-10 lg:py-6">
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 lg:text-2xl">
          Printer Setup
        </h1>

        <div className="overflow-hidden rounded-2xl border border-white/20 bg-white/80 p-4 shadow-[0_4px_20px_rgba(0,0,0,0.06)] dark:border-white/10 dark:bg-slate-800/60 dark:shadow-[0_4px_20px_rgba(0,0,0,0.2)]">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Save your preferred POS printer once. Print will auto-use this printer for stable connectivity.
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Driver: ESC/POS (same as RawBT driver selection)
          </p>

          {!isAndroidNative ? (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800/50 dark:bg-amber-900/20 dark:text-amber-300">
              Printer setup is available in the Android app.
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={scanPrinters}
              disabled={!isAndroidNative || scanning}
              className="min-h-[44px] rounded-xl bg-primary-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-600 active:bg-primary-700 disabled:opacity-50"
            >
              {scanning ? "Scanning..." : "Scan Printers"}
            </button>
            {saved ? (
              <button
                type="button"
                onClick={handleTest}
                disabled={!isAndroidNative || testing}
                className="min-h-[44px] rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-gray-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
              >
                {testing ? "Testing..." : "Test Printer"}
              </button>
            ) : null}
            {saved ? (
              <button
                type="button"
                onClick={() => {
                  clearSavedPosPrinter();
                  setSaved(null);
                  setInfo("Saved printer cleared.");
                }}
                className="min-h-[44px] rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-gray-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
              >
                Clear Saved Printer
              </button>
            ) : null}
          </div>

          {saved ? (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-800/40 dark:bg-emerald-900/20 dark:text-emerald-300">
              Current saved printer: <span className="font-semibold">{saved.name || saved.address || saved.id}</span> ({saved.driver ?? "escpos"})
            </div>
          ) : null}

          {error ? (
            <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800/40 dark:bg-red-900/20 dark:text-red-300">
              {error}
            </div>
          ) : null}

          {info ? (
            <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700 dark:border-blue-800/40 dark:bg-blue-900/20 dark:text-blue-300">
              {info}
            </div>
          ) : null}
        </div>

        {printers.length > 0 ? (
          <div className="overflow-hidden rounded-2xl border border-white/20 bg-white/80 shadow-[0_4px_20px_rgba(0,0,0,0.06)] dark:border-white/10 dark:bg-slate-800/60 dark:shadow-[0_4px_20px_rgba(0,0,0,0.2)]">
            {printers.map((p, idx) => (
              <div
                key={p.id}
                className={`flex items-center gap-3 px-4 py-3 ${idx !== printers.length - 1 ? "border-b border-white/30 dark:border-white/10" : ""}`}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {p.name || "Unnamed printer"}
                  </p>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                    {p.address || p.id}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleSave(p)}
                  disabled={savingId === p.id}
                  className="min-h-[40px] rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-gray-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
                >
                  {savingId === p.id ? "Saving..." : "Use this"}
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </ErrorBoundary>
  );
}

