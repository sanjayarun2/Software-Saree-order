"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useLanguage } from "@/lib/language-context";
import { useBackdropDismissGuard } from "@/lib/use-backdrop-dismiss-guard";
import {
  clampFixedOffer,
  clampPercentOffer,
  computeUnpaidOfferPreview,
  openUnpaidRecoveryWhatsApp,
  unpaidItemsToShareCartLines,
  type UnpaidOfferInput,
  type UnpaidOfferMode,
} from "@/lib/unpaid-offer";
import {
  formatMoneyAmount,
  type UnpaidWebsiteOrder,
} from "@/lib/unpaid-website-orders";

type UnpaidOfferModalProps = {
  order: UnpaidWebsiteOrder;
  open: boolean;
  onClose: () => void;
};

export function UnpaidOfferModal({
  order,
  open,
  onClose,
}: UnpaidOfferModalProps) {
  const { t } = useLanguage();
  const shouldDismissBackdrop = useBackdropDismissGuard(open);
  const [mode, setMode] = useState<UnpaidOfferMode>("none");
  const [percent, setPercent] = useState(5);
  const [fixedAmount, setFixedAmount] = useState(100);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setMode("none");
    setPercent(5);
    setFixedAmount(100);
    setSending(false);
    setError(null);
  }, [open, order.orderId]);

  const shareableCount = useMemo(
    () => unpaidItemsToShareCartLines(order.items).length,
    [order.items]
  );

  const offer: UnpaidOfferInput = useMemo(
    () => ({
      mode,
      percent: clampPercentOffer(percent),
      fixedAmount,
    }),
    [mode, percent, fixedAmount]
  );

  const preview = useMemo(
    () => computeUnpaidOfferPreview(order, offer),
    [order, offer]
  );

  if (!open) return null;

  const onSend = () => {
    setError(null);
    setSending(true);
    const result = openUnpaidRecoveryWhatsApp({ order, offer });
    setSending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 px-3 pb-6 pt-10 sm:items-center sm:p-4"
      role="presentation"
      onClick={(e) => {
        if (shouldDismissBackdrop(e.target, e.currentTarget)) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="unpaid-offer-title"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        className="max-h-[min(90dvh,640px)] w-full max-w-md overflow-y-auto rounded-2xl border border-gray-200 bg-white p-5 shadow-xl dark:border-slate-600 dark:bg-slate-800"
      >
        <h2
          id="unpaid-offer-title"
          className="text-lg font-bold text-slate-900 dark:text-slate-100"
        >
          {t("WhatsApp cart offer")}
        </h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {t(
            "Send their cart link. Optional offer is only in the message — shop prices stay unchanged."
          )}
        </p>

        <p className="mt-3 text-sm font-medium text-slate-800 dark:text-slate-200">
          {order.customerName}
        </p>
        <p className="text-xs text-slate-500">
          {shareableCount}{" "}
          {shareableCount === 1 ? t("item") : t("items")} · {order.shopLabel}
        </p>

        <fieldset className="mt-4 space-y-2">
          <legend className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {t("Offer")}
          </legend>
          {(
            [
              ["none", t("No offer")],
              ["percent", t("% off")],
              ["fixed", t("₹ off")],
            ] as const
          ).map(([value, label]) => (
            <label
              key={value}
              className={`flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm ${
                mode === value
                  ? "border-primary-400 bg-primary-50 dark:border-primary-600 dark:bg-primary-950/40"
                  : "border-gray-200 dark:border-slate-600"
              }`}
            >
              <input
                type="radio"
                name="unpaid-offer-mode"
                checked={mode === value}
                onChange={() => setMode(value)}
                className="h-4 w-4 accent-primary-600"
              />
              <span className="font-medium text-slate-800 dark:text-slate-200">
                {label}
              </span>
            </label>
          ))}
        </fieldset>

        {mode === "percent" && (
          <label className="mt-3 block text-sm">
            <span className="text-slate-600 dark:text-slate-300">
              {t("Discount percent")}
            </span>
            <input
              type="number"
              min={1}
              max={99}
              value={percent}
              onChange={(e) =>
                setPercent(clampPercentOffer(Number(e.target.value)))
              }
              className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 dark:border-slate-600 dark:bg-slate-900"
            />
          </label>
        )}

        {mode === "fixed" && (
          <label className="mt-3 block text-sm">
            <span className="text-slate-600 dark:text-slate-300">
              {t("Discount amount (₹)")}
            </span>
            <input
              type="number"
              min={1}
              value={fixedAmount}
              onChange={(e) =>
                setFixedAmount(
                  clampFixedOffer(
                    Number(e.target.value),
                    preview.originalTotal
                  )
                )
              }
              className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 dark:border-slate-600 dark:bg-slate-900"
            />
          </label>
        )}

        <div className="mt-4 rounded-xl bg-slate-50 px-3 py-3 dark:bg-slate-900/60">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {t("Price preview")}
          </p>
          {preview.originalTotal == null ? (
            <p className="mt-1 text-sm text-slate-500">
              {t("Total not available for this checkout")}
            </p>
          ) : mode === "none" ? (
            <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
              {formatMoneyAmount(preview.originalTotal, preview.currency)}
            </p>
          ) : (
            <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-base text-slate-400 line-through">
                {formatMoneyAmount(preview.originalTotal, preview.currency)}
              </span>
              <span className="text-lg font-bold text-emerald-700 dark:text-emerald-400">
                {formatMoneyAmount(
                  preview.discountedTotal,
                  preview.currency
                )}
              </span>
              {preview.label ? (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200">
                  {preview.label}
                </span>
              ) : null}
            </div>
          )}
          <p className="mt-2 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
            {t(
              "Checkout still shows shop prices. Honor this offer manually when they pay."
            )}
          </p>
        </div>

        {error && (
          <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </p>
        )}

        {shareableCount === 0 && (
          <p className="mt-3 text-sm text-amber-800 dark:text-amber-200">
            {t(
              "No product IDs on this checkout — cannot build a cart link."
            )}
          </p>
        )}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
          >
            {t("Cancel")}
          </button>
          <button
            type="button"
            onClick={onSend}
            disabled={sending || shareableCount === 0 || !order.customerMobile}
            className="min-h-[44px] flex-1 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {sending ? t("Loading") : t("Send WhatsApp")}
          </button>
        </div>
      </div>
    </div>
  );
}
