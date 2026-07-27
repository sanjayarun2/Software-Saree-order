"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/language-context";
import { useToast } from "@/lib/toast-context";
import { createOrder } from "@/lib/order-service";
import {
  hydrateDefaultFromAddress,
  readDefaultFromAddress,
} from "@/lib/default-from-address";
import {
  ShareAddress,
  consumeSharedAddress,
  peekSharedAddress,
  stashSharedAddress,
} from "@/lib/share-address";
import { SnipAddress, readFloatSnipEnabled } from "@/lib/snip-address";
import {
  customerNameFromAddress,
  extractMobileFromAddress,
  isProperAddressText,
  trimAddressText,
} from "@/lib/share-address-parse";
import type { OrderInsert } from "@/lib/db-types";

/**
 * Share text OR float-snip OCR → qty popup → create & save order.
 */
export function ShareAddressBridge() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { toast } = useToast();
  const router = useRouter();

  const [address, setAddress] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openWithAddress = useCallback(
    (raw: string, opts?: { requireProper?: boolean }) => {
      const text = trimAddressText(raw);
      if (!text) return;
      if (opts?.requireProper) {
        const quality = isProperAddressText(text);
        if (!quality.ok) {
          toast(t("Could not read a proper address. Snip the full address and try again."));
          return;
        }
      }
      stashSharedAddress(text);
      setQty(1);
      setError(null);
      setAddress(text);
    },
    [t, toast]
  );

  // Restore floating bubble if user left it enabled
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !user) return;
    if (!readFloatSnipEnabled()) return;
    void (async () => {
      try {
        const { granted } = await SnipAddress.hasOverlayPermission();
        if (!granted) return;
        const { running } = await SnipAddress.isOverlayRunning();
        if (!running) await SnipAddress.startOverlay();
      } catch {
        /* ignore */
      }
    })();
  }, [user]);

  // Native share + snip listeners
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let cancelled = false;
    let shareHandle: { remove: () => Promise<void> } | null = null;
    let snipHandle: { remove: () => Promise<void> } | null = null;

    void (async () => {
      try {
        const pendingShare = await ShareAddress.getPending();
        if (!cancelled && pendingShare?.text?.trim()) {
          openWithAddress(pendingShare.text);
        }
      } catch {
        /* older APK */
      }

      try {
        const pendingSnip = await SnipAddress.getPending();
        if (!cancelled && pendingSnip?.text?.trim()) {
          openWithAddress(pendingSnip.text, { requireProper: true });
        }
      } catch {
        /* older APK */
      }

      try {
        shareHandle = await ShareAddress.addListener("shareAddress", (event) => {
          if (cancelled) return;
          openWithAddress(event?.text ?? "");
        });
      } catch {
        /* ignore */
      }

      try {
        snipHandle = await SnipAddress.addListener("snipAddress", (event) => {
          if (cancelled) return;
          openWithAddress(event?.text ?? "", { requireProper: true });
        });
      } catch {
        /* ignore */
      }
    })();

    return () => {
      cancelled = true;
      void shareHandle?.remove();
      void snipHandle?.remove();
    };
  }, [openWithAddress]);

  // After login: show popup if address was shared/snipped while logged out
  useEffect(() => {
    if (!user || address) return;
    const pending = peekSharedAddress();
    if (pending) {
      setQty(1);
      setError(null);
      setAddress(pending);
    }
  }, [user, address]);

  const handleCancel = () => {
    consumeSharedAddress();
    setAddress(null);
    setError(null);
    setSaving(false);
  };

  const handleCreate = async () => {
    if (!user || !address?.trim()) return;
    const trimmed = trimAddressText(address);
    const quality = isProperAddressText(trimmed);
    if (!quality.ok) {
      setError(t("Could not read a proper address. Snip the full address and try again."));
      return;
    }
    const quantity = Math.max(1, Math.floor(Number(qty) || 1));
    setSaving(true);
    setError(null);
    try {
      let sender = readDefaultFromAddress(user.id);
      if (!sender) {
        sender = await hydrateDefaultFromAddress(user.id);
      }
      if (!sender.trim()) sender = "Shop Address";

      const insert: OrderInsert = {
        recipient_details: trimmed,
        sender_details: sender,
        booked_by: customerNameFromAddress(trimmed),
        booked_mobile_no: extractMobileFromAddress(trimmed),
        courier_name: "Professional",
        booking_date: new Date().toISOString().slice(0, 10),
        status: "PENDING",
        user_id: user.id,
        quantity,
        order_source: "manual",
      };

      await createOrder(user.id, insert);
      consumeSharedAddress();
      setAddress(null);
      toast(t("Order saved"));
      router.push("/orders/");
    } catch (e) {
      setError((e as Error).message || t("Save failed"));
    } finally {
      setSaving(false);
    }
  };

  if (!address) return null;

  if (!user) {
    return null;
  }

  const preview =
    address.length > 180 ? `${address.slice(0, 180).trim()}…` : address;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-order-title"
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900">
        <h2
          id="share-order-title"
          className="text-lg font-bold text-slate-900 dark:text-slate-100"
        >
          {t("Create order")}
        </h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {t("Shared address — set quantity and save.")}
        </p>

        <div className="mt-3 max-h-36 overflow-y-auto rounded-xl bg-slate-50 p-3 text-sm whitespace-pre-wrap text-slate-800 dark:bg-slate-800 dark:text-slate-100">
          {preview}
        </div>

        <label className="mt-4 block text-sm font-medium text-slate-800 dark:text-slate-100">
          {t("Quantity")}
          <input
            type="number"
            min={1}
            step={1}
            value={qty}
            onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-base dark:border-slate-600 dark:bg-slate-950"
            inputMode="numeric"
            autoFocus
          />
        </label>

        {error ? (
          <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={handleCancel}
            className="flex-1 rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-100"
          >
            {t("Cancel")}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleCreate()}
            className="flex-1 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {saving ? t("Saving…") : t("Save order")}
          </button>
        </div>
      </div>
    </div>
  );
}
