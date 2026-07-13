"use client";

import React, { useEffect, useRef, useState } from "react";
import { IconWhatsApp } from "@/components/ui/OrderIcons";
import { useLanguage } from "@/lib/language-context";
import { getVeloShopBaseUrl } from "@/lib/shop-base-url";
import { shareCustomerShopCart } from "@/lib/shop-product-share";
import {
  clampShareCartQty,
  SHARE_CART_MAX_QTY_PER_LINE,
  type ShareCartLine,
} from "@/lib/share-cart-types";

type ShareCartPanelProps = {
  userId: string;
  lines: ShareCartLine[];
  shopBaseUrl: string;
  totalUnits: number;
  /** When true (search keyboard open), collapse to a slim bar so search stays visible. */
  compact?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  onSetQuantity: (productId: string, quantity: number) => void;
  onRemoveLine: (productId: string) => void;
  onClear: () => void;
  setError: (msg: string | null) => void;
  setInfo: (msg: string | null) => void;
};

export function ShareCartPanel({
  userId,
  lines,
  shopBaseUrl,
  totalUnits,
  compact = false,
  onExpandedChange,
  onSetQuantity,
  onRemoveLine,
  onClear,
  setError,
  setInfo,
}: ShareCartPanelProps) {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  const [sharing, setSharing] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);
  const prevCountRef = useRef(lines.length);

  useEffect(() => {
    if (compact) setExpanded(false);
  }, [compact]);

  useEffect(() => {
    onExpandedChange?.(expanded);
  }, [expanded, onExpandedChange]);

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
      const base = shopBaseUrl || (await getVeloShopBaseUrl(userId, { force: true }));
      const result = await shareCustomerShopCart({
        lines,
        shopBaseUrl: base,
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

  const summaryLabel = `${t("Order cart")} · ${lines.length} · ${totalUnits} ${t("qty total")}`;

  const shareBtnCollapsed = (
    <button
      type="button"
      disabled={sharing}
      onClick={() => void handleShare()}
      className="flex min-h-[48px] shrink-0 items-center gap-2 rounded-xl bg-[#25D366] px-4 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
      aria-label={t("Share on WhatsApp")}
    >
      <IconWhatsApp className="h-5 w-5" />
      <span>{sharing ? "…" : "WhatsApp"}</span>
    </button>
  );

  const shareBtnFull = (
    <button
      type="button"
      disabled={sharing}
      onClick={() => void handleShare()}
      className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] text-base font-semibold text-white shadow-sm disabled:opacity-50"
    >
      <IconWhatsApp className="h-5 w-5 shrink-0" />
      <span>{sharing ? t("Working…") : t("Share on WhatsApp")}</span>
    </button>
  );

  if (compact) {
    return (
      <div
        className="fixed inset-x-0 z-[55] border-t border-emerald-200 bg-white/95 backdrop-blur dark:border-emerald-900 dark:bg-slate-900/95 max-lg:bottom-[calc(4.75rem+env(safe-area-inset-bottom))] lg:bottom-0"
        style={{ paddingBottom: "max(0.35rem, env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-3 py-2">
          <p className="min-w-0 truncate text-sm font-semibold text-emerald-900 dark:text-emerald-100">
            {summaryLabel}
          </p>
          {shareBtnCollapsed}
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-x-0 z-[55] border-t border-emerald-200 bg-white shadow-[0_-8px_24px_rgba(0,0,0,0.12)] dark:border-emerald-900 dark:bg-slate-900 max-lg:bottom-[calc(4.75rem+env(safe-area-inset-bottom))] lg:bottom-0"
      style={{ paddingBottom: "max(0.35rem, env(safe-area-inset-bottom))" }}
    >
      <div className="mx-auto max-w-3xl px-3 pt-2">
        <div className="flex items-stretch gap-2">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="flex min-h-[48px] min-w-0 flex-1 items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-left dark:border-emerald-800 dark:bg-emerald-950/40"
          >
            <span className="min-w-0 truncate text-sm font-semibold text-emerald-900 dark:text-emerald-100">
              {summaryLabel}
            </span>
            <span className="shrink-0 rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-emerald-700 shadow-sm dark:bg-slate-800 dark:text-emerald-300">
              {expanded ? t("Hide") : t("Show")}
            </span>
          </button>
          {!expanded ? shareBtnCollapsed : null}
        </div>

        {expanded ? (
          <>
            <ul
              ref={listRef}
              className="mt-2 max-h-[min(40vh,220px)] space-y-2 overflow-y-auto overscroll-contain"
            >
              {lines.map((line, index) => (
                <li
                  key={line.productId}
                  className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-2 dark:border-emerald-900/50 dark:bg-emerald-950/25"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                      <span className="text-emerald-700 dark:text-emerald-400">#{index + 1}</span>{" "}
                      {line.name}
                      {line.productCode ? (
                        <span className="font-normal text-slate-500"> · {line.productCode}</span>
                      ) : null}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      aria-label={t("Decrease quantity")}
                      className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-lg font-semibold dark:border-slate-600 dark:bg-slate-800"
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
                      className="h-10 w-11 rounded-xl border border-gray-200 bg-white text-center text-sm font-semibold dark:border-slate-600 dark:bg-slate-800"
                      aria-label={t("Quantity")}
                    />
                    <button
                      type="button"
                      aria-label={t("Increase quantity")}
                      className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-lg font-semibold dark:border-slate-600 dark:bg-slate-800"
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
                      className="flex h-10 w-10 items-center justify-center rounded-xl text-xl font-semibold text-red-600"
                      onClick={() => onRemoveLine(line.productId)}
                    >
                      ×
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-2 space-y-2 border-t border-emerald-100 pt-2 pb-1 dark:border-emerald-900/50">
              {shareBtnFull}
              <button
                type="button"
                onClick={onClear}
                className="flex min-h-[44px] w-full items-center justify-center rounded-xl border border-gray-200 text-sm font-medium text-slate-600 dark:border-slate-600 dark:text-slate-300"
              >
                {t("Clear cart")}
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

/** Bottom spacer height so list content is not hidden behind the fixed panel. */
export function shareCartSpacerHeight(
  lineCount: number,
  opts: { compact?: boolean; expanded?: boolean }
): string {
  if (lineCount === 0) return "0px";
  if (opts.compact) return "calc(4rem + env(safe-area-inset-bottom))";
  if (opts.expanded) return "calc(16rem + 4.75rem + env(safe-area-inset-bottom))";
  return "calc(4.75rem + 4.75rem + env(safe-area-inset-bottom))";
}
