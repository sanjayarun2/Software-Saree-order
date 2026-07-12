"use client";

import React, { useEffect, useRef, useState } from "react";
import type { OrderStatus } from "@/lib/db-types";
import {
  type OrderDatePreset,
  type OrderFilterState,
  ORDER_PERIOD_MENU,
  createFiltersForPreset,
  createRangeOrderFilters,
  localDateIso,
  resolveOrderFilters,
  validateOrderFilters,
} from "@/lib/order-filter-utils";
import { DdMmYyyyDateInput } from "./DdMmYyyyDateInput";
import { useBackdropDismissGuard } from "@/lib/use-backdrop-dismiss-guard";

export type OrdersFilterModalProps = {
  open: boolean;
  status: OrderStatus;
  initialFilters: OrderFilterState;
  onClose: () => void;
  onApply: (filters: OrderFilterState) => void;
  applying?: boolean;
  labels: {
    title: string;
    bookingFrom: string;
    bookingTo: string;
    dispatchFrom: string;
    dispatchTo: string;
    today: string;
    yesterday: string;
    thisWeek: string;
    thisMonth: string;
    all: string;
    custom: string;
    apply: string;
    cancel: string;
  };
};

function periodLabel(
  preset: Exclude<OrderDatePreset, "range">,
  labels: OrdersFilterModalProps["labels"]
): string {
  switch (preset) {
    case "today":
      return labels.today;
    case "yesterday":
      return labels.yesterday;
    case "this_week":
      return labels.thisWeek;
    case "this_month":
      return labels.thisMonth;
    case "all":
      return labels.all;
    default:
      return labels.today;
  }
}

export function OrdersFilterModal({
  open,
  status,
  initialFilters,
  onClose,
  onApply,
  applying = false,
  labels,
}: OrdersFilterModalProps) {
  const resolvedInitial = resolveOrderFilters(initialFilters);
  const [customMode, setCustomMode] = useState(resolvedInitial.datePreset === "range");
  const [fromDate, setFromDate] = useState(
    resolvedInitial.datePreset === "range" ? resolvedInitial.fromDate : localDateIso()
  );
  const [toDate, setToDate] = useState(
    resolvedInitial.datePreset === "range" ? resolvedInitial.toDate : localDateIso()
  );
  const [formError, setFormError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const shouldDismissBackdrop = useBackdropDismissGuard(open);

  useEffect(() => {
    if (!open) return;
    const resolved = resolveOrderFilters(initialFilters);
    const isCustom = resolved.datePreset === "range";
    setCustomMode(isCustom);
    setFromDate(isCustom ? resolved.fromDate : localDateIso());
    setToDate(isCustom ? resolved.toDate : localDateIso());
    setFormError(null);
  }, [open, initialFilters]);

  useEffect(() => {
    if (!open) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !applying) onClose();
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, applying, onClose]);

  const selectedPreset = resolveOrderFilters(initialFilters).datePreset;

  const handlePreset = (preset: Exclude<OrderDatePreset, "range">) => {
    if (applying) return;
    setCustomMode(false);
    setFormError(null);
    onApply(createFiltersForPreset(status, preset));
  };

  const handleCustomClick = () => {
    setCustomMode(true);
    setFormError(null);
    if (!fromDate) setFromDate(localDateIso());
    if (!toDate) setToDate(localDateIso());
  };

  const handleApplyCustom = () => {
    const merged = createRangeOrderFilters(status, fromDate, toDate);
    const err = validateOrderFilters(merged);
    if (err) {
      setFormError(err);
      return;
    }
    setFormError(null);
    onApply(merged);
  };

  if (!open) return null;

  const fromLabel = status === "PENDING" ? labels.bookingFrom : labels.dispatchFrom;
  const toLabel = status === "PENDING" ? labels.bookingTo : labels.dispatchTo;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/45 p-0 md:items-center md:px-4"
      role="presentation"
      onClick={(e) => {
        if (shouldDismissBackdrop(e.target, e.currentTarget) && !applying) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="orders-filter-title"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        className="flex max-h-[92dvh] w-full flex-col rounded-t-2xl border border-gray-200 bg-white shadow-xl dark:border-slate-600 dark:bg-slate-800 md:max-w-md md:rounded-2xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-slate-700">
          <h2
            id="orders-filter-title"
            className="text-lg font-bold text-slate-900 dark:text-slate-100"
          >
            {labels.title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={applying}
            className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-slate-700"
            aria-label={labels.cancel}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="space-y-2" role="listbox" aria-label={labels.title}>
            {ORDER_PERIOD_MENU.map(({ preset }) => {
              const active = !customMode && selectedPreset === preset;
              return (
                <button
                  key={preset}
                  type="button"
                  role="option"
                  aria-selected={active}
                  disabled={applying}
                  onClick={() => handlePreset(preset)}
                  className={`flex min-h-touch w-full items-center justify-between rounded-xl border px-4 text-left text-sm font-semibold transition disabled:opacity-50 ${
                    active
                      ? "border-primary-500 bg-primary-50 text-primary-700 dark:border-primary-400 dark:bg-primary-900/40 dark:text-primary-200"
                      : "border-gray-200 bg-white text-slate-800 hover:bg-gray-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600"
                  }`}
                >
                  <span>{periodLabel(preset, labels)}</span>
                  {active ? (
                    <svg className="h-5 w-5 text-primary-600 dark:text-primary-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  ) : null}
                </button>
              );
            })}

            <button
              type="button"
              role="option"
              aria-selected={customMode}
              disabled={applying}
              onClick={handleCustomClick}
              className={`flex min-h-touch w-full items-center justify-between rounded-xl border px-4 text-left text-sm font-semibold transition disabled:opacity-50 ${
                customMode
                  ? "border-primary-500 bg-primary-50 text-primary-700 dark:border-primary-400 dark:bg-primary-900/40 dark:text-primary-200"
                  : "border-gray-200 bg-white text-slate-800 hover:bg-gray-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600"
              }`}
            >
              <span>{labels.custom}</span>
              {customMode ? (
                <svg className="h-5 w-5 text-primary-600 dark:text-primary-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              ) : null}
            </button>
          </div>

          {customMode ? (
            <div className="mt-4 space-y-4 border-t border-gray-100 pt-4 dark:border-slate-700">
              <div className="grid gap-4 sm:grid-cols-2">
                <DdMmYyyyDateInput
                  label={fromLabel}
                  value={fromDate}
                  onChange={(v) => {
                    setFromDate(v);
                    setFormError(null);
                  }}
                />
                <DdMmYyyyDateInput
                  label={toLabel}
                  value={toDate}
                  onChange={(v) => {
                    setToDate(v);
                    setFormError(null);
                  }}
                />
              </div>

              {formError ? (
                <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300" role="alert">
                  {formError}
                </p>
              ) : null}

              <button
                type="button"
                onClick={handleApplyCustom}
                disabled={applying}
                className="min-h-touch w-full rounded-bento bg-primary-500 font-semibold text-white hover:bg-primary-600 disabled:opacity-50"
              >
                {applying ? "…" : labels.apply}
              </button>
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 gap-3 border-t border-gray-100 px-5 py-4 dark:border-slate-700">
          <button
            type="button"
            onClick={onClose}
            disabled={applying}
            className="min-h-touch w-full rounded-bento border border-gray-200 bg-white font-medium text-slate-700 hover:bg-gray-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
          >
            {labels.cancel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ordersFilterModalLabels(t: (key: string) => string) {
  return {
    title: t("Filter orders"),
    bookingFrom: t("Booking From date"),
    bookingTo: t("Booking To date"),
    dispatchFrom: t("Dispatch From date"),
    dispatchTo: t("Dispatch To date"),
    today: t("Today"),
    yesterday: t("Yesterday"),
    thisWeek: t("This Week"),
    thisMonth: t("This Month"),
    all: t("All"),
    custom: t("Custom"),
    apply: t("Filter"),
    cancel: t("Cancel"),
  };
}
