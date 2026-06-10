"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLanguage } from "@/lib/language-context";
import {
  clearProductSyncLogs,
  listProductSyncLogs,
  type ProductSyncLogEntry,
} from "@/lib/product-sync-logs";

type ProductSyncLogsPanelProps = {
  onInfo?: (message: string) => void;
};

export function ProductSyncLogsPanel({ onInfo }: ProductSyncLogsPanelProps) {
  const { t } = useLanguage();
  const [logs, setLogs] = useState<ProductSyncLogEntry[]>([]);
  const [showAll, setShowAll] = useState(false);

  const refresh = useCallback(() => {
    setLogs(listProductSyncLogs());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const visibleLogs = useMemo(
    () => (showAll ? logs : logs.filter((log) => !log.ok)),
    [logs, showAll]
  );

  const failureCount = useMemo(() => logs.filter((log) => !log.ok).length, [logs]);

  return (
    <div className="overflow-hidden rounded-2xl border border-white/20 bg-white/80 shadow-[0_4px_20px_rgba(0,0,0,0.06)] dark:border-white/10 dark:bg-slate-800/60 dark:shadow-[0_4px_20px_rgba(0,0,0,0.2)]">
      <div className="border-b border-white/30 px-4 py-3 dark:border-white/10">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          {t("Product sync activity")}
        </h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {t("Recent product API calls on this device. For troubleshooting uploads only.")}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/30 px-4 py-2 dark:border-white/10">
        <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
          <input
            type="checkbox"
            checked={showAll}
            onChange={(e) => setShowAll(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          {t("Show successful calls")}
        </label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={refresh}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-gray-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            {t("Refresh")}
          </button>
          <button
            type="button"
            onClick={() => {
              clearProductSyncLogs();
              setLogs([]);
              onInfo?.(t("Sync logs cleared."));
            }}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-gray-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            {t("Clear logs")}
          </button>
        </div>
      </div>

      {logs.length === 0 ? (
        <p className="px-4 py-6 text-sm text-slate-500 dark:text-slate-400">{t("No sync logs yet.")}</p>
      ) : visibleLogs.length === 0 ? (
        <p className="px-4 py-6 text-sm text-slate-500 dark:text-slate-400">
          {t("No failed product syncs.")}
          {failureCount === 0 && logs.length > 0
            ? ` ${t("Enable \"Show successful calls\" to see recent activity.")}`
            : null}
        </p>
      ) : (
        <ul className="divide-y divide-white/30 dark:divide-white/10">
          {visibleLogs.map((log) => (
            <li key={log.id} className="px-4 py-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-slate-900 dark:text-slate-100">{log.action}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    log.ok
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                      : "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
                  }`}
                >
                  {log.ok ? t("OK") : t("Failed")}
                </span>
              </div>
              <p className="mt-1 text-slate-600 dark:text-slate-300">{log.message}</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {new Date(log.at).toLocaleString()} · {log.requestId.slice(0, 8)}
              </p>
              {log.details ? (
                <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">{log.details}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
