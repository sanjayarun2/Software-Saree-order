"use client";

import React, { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/lib/language-context";

export type AddProductFabLift = "nav" | "cart" | "cart-compact" | "cart-expanded";

const LIFT_CLASS: Record<AddProductFabLift, string> = {
  nav: "bottom-24 right-4 md:bottom-8 md:right-8",
  cart: "bottom-[calc(11.5rem+env(safe-area-inset-bottom,0px))] right-4 md:bottom-28 md:right-8",
  "cart-compact":
    "bottom-[calc(10rem+env(safe-area-inset-bottom,0px))] right-4 md:bottom-24 md:right-8",
  "cart-expanded":
    "bottom-[calc(22rem+env(safe-area-inset-bottom,0px))] right-4 md:bottom-[22rem] md:right-8",
};

type AddProductFabProps = {
  onAddSingle: () => void;
  onAddBulk: () => void;
  lift?: AddProductFabLift;
};

/**
 * Bottom-right + speed dial (same corner as orders PDF).
 * Opens Single / Bulk; closes on outside tap, Escape, or a choice.
 */
export function AddProductFab({
  onAddSingle,
  onAddBulk,
  lift = "nav",
}: AddProductFabProps) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onPointer = (e: PointerEvent) => {
      const el = rootRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  const choose = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  return (
    <div
      ref={rootRef}
      className={`pointer-events-none fixed z-40 flex flex-col items-end gap-2 ${LIFT_CLASS[lift]}`}
    >
      {open ? (
        <div className="pointer-events-auto mb-1 flex flex-col items-end gap-2">
          <button
            type="button"
            onClick={() => choose(onAddSingle)}
            className="flex min-h-[48px] items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-lg dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          >
            {t("Add Single Product")}
          </button>
          <button
            type="button"
            onClick={() => choose(onAddBulk)}
            className="flex min-h-[48px] items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-lg dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          >
            {t("Add Bulk Products")}
          </button>
        </div>
      ) : null}
      <button
        type="button"
        aria-label={t("Add product")}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
        className="pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary-500 text-3xl font-light leading-none text-white shadow-lg transition hover:bg-primary-600 active:scale-95"
      >
        <span aria-hidden className={open ? "rotate-45 transition-transform" : "transition-transform"}>
          +
        </span>
      </button>
    </div>
  );
}

export function addProductFabLiftFromCart(opts: {
  lineCount: number;
  compact?: boolean;
  expanded?: boolean;
}): AddProductFabLift {
  if (opts.lineCount <= 0) return "nav";
  if (opts.compact) return "cart-compact";
  if (opts.expanded) return "cart-expanded";
  return "cart";
}
