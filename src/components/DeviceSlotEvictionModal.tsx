"use client";

import React, { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { consumeDeviceSlotEvicted } from "@/lib/user-devices-supabase";
import { WHATSAPP_SUPPORT_GROUP_URL } from "@/lib/support-links";

/**
 * One-time notice after LRU device slot rotation (max_devices ≥ 2).
 */
export function DeviceSlotEvictionModal() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [maxDevices, setMaxDevices] = useState(2);

  useEffect(() => {
    if (!user?.id) return;
    const c = consumeDeviceSlotEvicted();
    if (c) {
      setMaxDevices(c.maxDevices);
      setOpen(true);
    }
  }, [user?.id]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="device-slot-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-white/20 bg-white p-5 shadow-xl dark:border-white/10 dark:bg-slate-800">
        <h2 id="device-slot-title" className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Device limit
        </h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Only {maxDevices} device{maxDevices === 1 ? "" : "s"} can stay signed in for this account. An older
          device was removed so this one could sign in.
        </p>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Need another device? Contact us on WhatsApp.
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() =>
              window.open(WHATSAPP_SUPPORT_GROUP_URL, "_blank", "noopener,noreferrer")
            }
            className="min-h-touch rounded-xl bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-95"
          >
            WhatsApp
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="min-h-touch rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-700"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
