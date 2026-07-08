"use client";

import React, { useEffect, useRef, useState } from "react";
import type { OrderStatus } from "@/lib/db-types";
import {
  type OrderFilterState,
  validateOrderFilters,
} from "@/lib/order-filter-utils";
import { DdMmYyyyDateInput } from "./DdMmYyyyDateInput";
import { useBackdropDismissGuard } from "@/lib/use-backdrop-dismiss-guard";

export type OrderDateFilterDraft = Pick<
  OrderFilterState,
  "fromDate" | "toDate" | "allOrders"
>;

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
    allOrders: string;
    apply: string;
    cancel: string;
    clearDates: string;
  };
};

export function OrdersFilterModal({
  open,
  status,
  initialFilters,
  onClose,
  onApply,
  applying = false,
  labels,
}: OrdersFilterModalProps) {
  const [draft, setDraft] = useState<OrderDateFilterDraft>({
    fromDate: initialFilters.fromDate,
    toDate: initialFilters.toDate,
    allOrders: initialFilters.allOrders,
  });
  const [formError, setFormError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const applyRef = useRef<HTMLButtonElement>(null);
  const shouldDismissBackdrop = useBackdropDismissGuard(open);

  useEffect(() => {
    if (open) {
      setDraft({
        fromDate: initialFilters.fromDate,
        toDate: initialFilters.toDate,
        allOrders: initialFilters.allOrders,
      });
      setFormError(null);
    }
  }, [open, initialFilters]);

  useEffect(() => {
    if (!open) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !applying) onClose();
    };
    window.addEventListener("keydown", onKeyDown);

    const t = window.setTimeout(() => applyRef.current?.focus(), 50);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
      window.clearTimeout(t);
    };
  }, [open, applying, onClose]);

  const enableDateFilter = () => {
    setDraft((prev) => (prev.allOrders ? { ...prev, allOrders: false } : prev));
    setFormError(null);
  };

  const handleApply = () => {
    const merged: OrderFilterState = { status, ...draft };
    const err = validateOrderFilters(merged);
    if (err) {
      setFormError(err);
      return;
    }
    setFormError(null);
    onApply(merged);
  };

  const handleResetDates = () => {
    setDraft({ fromDate: "", toDate: "", allOrders: true });
    setFormError(null);
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
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <DdMmYyyyDateInput
                label={fromLabel}
                value={draft.fromDate}
                onInteract={enableDateFilter}
                onChange={(fromDate) => {
                  setDraft((prev) => ({ ...prev, fromDate, allOrders: false }));
                  setFormError(null);
                }}
              />
              <DdMmYyyyDateInput
                label={toLabel}
                value={draft.toDate}
                onInteract={enableDateFilter}
                onChange={(toDate) => {
                  setDraft((prev) => ({ ...prev, toDate, allOrders: false }));
                  setFormError(null);
                }}
              />
            </div>

            <label className="flex min-h-touch cursor-pointer items-center gap-3 text-gray-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={draft.allOrders}
                onChange={(e) => {
                  const allOrders = e.target.checked;
                  setDraft((prev) => ({
                    ...prev,
                    allOrders,
                    ...(allOrders ? { fromDate: "", toDate: "" } : {}),
                  }));
                  setFormError(null);
                }}
                className="h-5 w-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm font-medium">{labels.allOrders}</span>
            </label>

            {!draft.allOrders ? (
              <button
                type="button"
                onClick={handleResetDates}
                className="text-sm font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400"
              >
                {labels.clearDates}
              </button>
            ) : null}

            {formError ? (
              <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300" role="alert">
                {formError}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 gap-3 border-t border-gray-100 px-5 py-4 dark:border-slate-700">
          <button
            type="button"
            onClick={onClose}
            disabled={applying}
            className="min-h-touch flex-1 rounded-bento border border-gray-200 bg-white font-medium text-slate-700 hover:bg-gray-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
          >
            {labels.cancel}
          </button>
          <button
            ref={applyRef}
            type="button"
            onClick={handleApply}
            disabled={applying}
            className="min-h-touch flex-1 rounded-bento bg-primary-500 font-semibold text-white hover:bg-primary-600 disabled:opacity-50"
          >
            {applying ? "…" : labels.apply}
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
    allOrders: t("All Orders"),
    apply: t("Filter"),
    cancel: t("Cancel"),
    clearDates: t("Clear dates"),
  };
}
