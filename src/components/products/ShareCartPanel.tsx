"use client";

import React, { useEffect, useRef, useState } from "react";
import { IconWhatsApp } from "@/components/ui/OrderIcons";
import { useLanguage } from "@/lib/language-context";
import { shareCustomerShopCart } from "@/lib/shop-product-share";
import {
  clampShareCartQty,
  SHARE_CART_MAX_QTY_PER_LINE,
  type ShareCartLine,
} from "@/lib/share-cart-types";

type ShareCartPanelProps = {
  lines: ShareCartLine[];
  shopBaseUrl: string;
  totalUnits: number;
  onSetQuantity: (productId: string, quantity: number) => void;
  onRemoveLine: (productId: string) => void;
  onClear: () => void;
  setError: (msg: string | null) => void;
  setInfo: (msg: string | null) => void;
};

export function ShareCartPanel({
  lines,
  shopBaseUrl,
  totalUnits,
  onSetQuantity,
  onRemoveLine,
  onClear,
  setError,
  setInfo,
}: ShareCartPanelProps) {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(true);
  const [sharing, setSharing] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);
  const prevCountRef = useRef(lines.length);

  useEffect(() => {
    if (lines.length > prevCountRef.current) {
      listRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    }
    prevCountRef.current = lines.length;
  }, [lines.length]);

  if (lines.length === 0) return null;

  const handleQtyDown = (line: ShareCartLine) => {
    if (line.quantity <= 1) {
      onRemoveLine(line.productId);
      return;
    }
    onSetQuantity(line.productId, line.quantity - 1);
  };

  const handleShare = async () => {
    setSharing(true);
    setError(null);
    try {
      const result = await shareCustomerShopCart({
        lines,
        shopBaseUrl,
        orderHeading: t("Your order:"),
        courierNote: t("Courier charges are included in the final price shown at checkout."),
        cartLinkLabel: t("Open cart:"),
      });
      if (result.copied) {
        setInfo(t("Share text copied. Paste into WhatsApp."));
      }
    } catch (e) {
      setError((e as Error).message || t("Could not share."));
    } finally {
      setSharing(false);
    }
  };

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-30 border-t border-emerald-200 bg-white shadow-[0_-12px_32px_rgba(0,0,0,0.12)] dark:border-emerald-900 dark:bg-slate-900"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      <div className="mx-auto max-w-3xl px-3 pt-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center justify-between gap-2 py-1 text-left text-sm font-semibold text-emerald-900 dark:text-emerald-100"
        >
          <span>
            {t("Order cart")} · {lines.length} {t("products")} · {totalUnits}{" "}
            {t("qty total")}
          </span>
          <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
            {expanded ? t("Hide") : t("Show")}
          </span>
        </button>

        {expanded ? (
          <>
            <ul
              ref={listRef}
              className="mt-1 max-h-[min(42vh,280px)] space-y-2 overflow-y-auto overscroll-contain scroll-pb-2 scroll-pt-1 pr-0.5"
            >
              {lines.map((line, index) => (
                <li
                  key={line.productId}
                  className="flex flex-col gap-2 rounded-xl border border-emerald-100 bg-emerald-50/60 p-3 text-sm dark:border-emerald-900/60 dark:bg-emerald-950/20 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-emerald-800 dark:text-emerald-300">
                      #{index + 1}
                    </p>
                    <p className="break-words font-medium text-slate-900 dark:text-slate-100">
                      {line.name}
                    </p>
                    {line.productCode ? (
                      <p className="text-xs text-slate-500">{line.productCode}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center justify-end gap-1">
                    <button
                      type="button"
                      aria-label={t("Decrease quantity")}
                      className="flex h-11 w-11 items-center justify-center rounded-xl border border-gray-200 bg-white text-lg dark:border-slate-600 dark:bg-slate-800"
                      onClick={() => handleQtyDown(line)}
                    >
                      −
                    </button>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={SHARE_CART_MAX_QTY_PER_LINE}
                      value={line.quantity}
                      onChange={(e) =>
                        onSetQuantity(
                          line.productId,
                          clampShareCartQty(Number(e.target.value))
                        )
                      }
                      className="h-11 w-14 rounded-xl border border-gray-200 bg-white text-center text-base font-semibold dark:border-slate-600 dark:bg-slate-800"
                      aria-label={t("Quantity")}
                    />
                    <button
                      type="button"
                      aria-label={t("Increase quantity")}
                      className="flex h-11 w-11 items-center justify-center rounded-xl border border-gray-200 bg-white text-lg dark:border-slate-600 dark:bg-slate-800"
                      onClick={() =>
                        onSetQuantity(
                          line.productId,
                          clampShareCartQty(line.quantity + 1)
                        )
                      }
                    >
                      +
                    </button>
                    <button
                      type="button"
                      aria-label={t("Remove")}
                      className="ml-1 flex h-11 w-11 items-center justify-center rounded-xl text-red-600"
                      onClick={() => onRemoveLine(line.productId)}
                    >
                      ×
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-3 flex gap-2 pb-1">
              <button
                type="button"
                onClick={onClear}
                className="min-h-[48px] flex-1 rounded-xl border border-gray-200 text-sm font-medium dark:border-slate-600"
              >
                {t("Clear")}
              </button>
              <button
                type="button"
                disabled={sharing || !shopBaseUrl}
                onClick={() => void handleShare()}
                className="flex min-h-[48px] flex-[2] items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white disabled:opacity-50"
              >
                <IconWhatsApp className="h-5 w-5 shrink-0" />
                <span className="truncate">
                  {sharing ? t("Working…") : t("Share cart on WhatsApp")}
                </span>
              </button>
            </div>
          </>
        ) : (
          <div className="mt-2 pb-1">
            <button
              type="button"
              disabled={sharing || !shopBaseUrl}
              onClick={() => void handleShare()}
              className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              <IconWhatsApp className="h-5 w-5" />
              {sharing ? t("Working…") : t("Share cart on WhatsApp")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
