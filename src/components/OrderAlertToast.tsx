"use client";

import { useEffect, useState } from "react";
import { requestOpenOrdersPage } from "@/lib/order-notification-navigation";

type ToastState = { title: string; body: string } | null;

export function OrderAlertToast() {
  const [toast, setToast] = useState<ToastState>(null);

  useEffect(() => {
    const onToast = (event: Event) => {
      const detail = (event as CustomEvent<{ title: string; body: string }>).detail;
      if (!detail?.title) return;
      setToast({ title: detail.title, body: detail.body });
      window.setTimeout(() => setToast(null), 6000);
    };
    window.addEventListener("velo-order-alert-toast", onToast);
    return () => window.removeEventListener("velo-order-alert-toast", onToast);
  }, []);

  if (!toast) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[100] flex justify-center px-4">
      <button
        type="button"
        onClick={() => requestOpenOrdersPage({ sync: true, forceSync: true })}
        className="pointer-events-auto max-w-md rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-left shadow-lg dark:border-emerald-900/50 dark:bg-emerald-950/90"
      >
        <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">{toast.title}</p>
        <p className="mt-0.5 text-sm text-emerald-800 dark:text-emerald-200">{toast.body}</p>
        <p className="mt-1 text-xs text-emerald-700/80 dark:text-emerald-300/80">Tap to open orders</p>
      </button>
    </div>
  );
}
