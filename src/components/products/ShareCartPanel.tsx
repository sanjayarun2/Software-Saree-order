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

  const shareBtnCompact = (
    <button
      type="button"
      disabled={sharing}
      onClick={() => void handleShare()}
      className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-[#25D366] px-3 text-xs font-semibold text-white disabled:opacity-50"
      aria-label={t("Share on WhatsApp")}
    >
      <IconWhatsApp className="h-4 w-4" />
      <span>{sharing ? "…" : "WhatsApp"}</span>
    </button>
  );

  const shareBtnFull = (
    <button
      type="button"
      disabled={sharing}
      onClick={() => void handleShare()}
      className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#25D366] text-sm font-semibold text-white disabled:opacity-50"
    >
      <IconWhatsApp className="h-5 w-5 shrink-0" />
      <span>{sharing ? t("Working…") : t("Share on WhatsApp")}</span>
    </button>
  );

  if (compact) {
    return (
      <div
        className="fixed inset-x-0 z-[55] border-t border-emerald-200 bg-white/95 backdrop-blur dark:border-emerald-900 dark:bg-slate-900/95 max-lg:bottom-[calc(4.75rem+env(safe-area-inset-bottom))] lg:bottom-0"
        style={{ paddingBottom: "max(0.25rem, env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 px-3 py-1.5">
          <p className="min-w-0 truncate text-xs font-medium text-emerald-900 dark:text-emerald-100">
            {t("Order cart")} · {lines.length} · {totalUnits} {t("qty total")}
          </p>
          {shareBtnCompact}
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-x-0 z-[55] border-t border-emerald-200 bg-white shadow-[0_-8px_24px_rgba(0,0,0,0.1)] dark:border-emerald-900 dark:bg-slate-900 max-lg:bottom-[calc(4.75rem+env(safe-area-inset-bottom))] lg:bottom-0"
      style={{ paddingBottom: "max(0.25rem, env(safe-area-inset-bottom))" }}
    >
      <div className="mx-auto max-w-3xl px-2 pt-1.5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex min-w-0 flex-1 items-center justify-between gap-1 py-0.5 text-left text-xs font-semibold text-emerald-900 dark:text-emerald-100"
          >
            <span className="truncate">
              {t("Order cart")} · {lines.length} · {totalUnits} {t("qty total")}
            </span>
            <span className="shrink-0 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
              {expanded ? t("Hide") : t("Show")}
            </span>
          </button>
          {!expanded ? shareBtnCompact : null}
        </div>

        {expanded ? (
          <>
            <ul
              ref={listRef}
              className="mt-1 max-h-[140px] space-y-1 overflow-y-auto overscroll-contain"
            >
              {lines.map((line, index) => (
                <li
                  key={line.productId}
                  className="flex items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50/50 px-2 py-1.5 dark:border-emerald-900/50 dark:bg-emerald-950/20"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-slate-900 dark:text-slate-100">
                      <span className="text-emerald-700 dark:text-emerald-400">#{index + 1}</span>{" "}
                      {line.name}
                      {line.productCode ? (
                        <span className="font-normal text-slate-500"> · {line.productCode}</span>
                      ) : null}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      aria-label={t("Decrease quantity")}
                      className="flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 bg-white text-sm dark:border-slate-600 dark:bg-slate-800"
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
                      className="h-7 w-9 rounded-md border border-gray-200 bg-white text-center text-xs font-semibold dark:border-slate-600 dark:bg-slate-800"
                      aria-label={t("Quantity")}
                    />
                    <button
                      type="button"
                      aria-label={t("Increase quantity")}
                      className="flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 bg-white text-sm dark:border-slate-600 dark:bg-slate-800"
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
                      className="flex h-7 w-7 items-center justify-center text-red-600"
                      onClick={() => onRemoveLine(line.productId)}
                    >
                      ×
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-1.5 space-y-1 border-t border-emerald-100 pt-1.5 pb-0.5 dark:border-emerald-900/50">
              {shareBtnFull}
              <button
                type="button"
                onClick={onClear}
                className="h-8 w-full rounded-lg border border-gray-200 text-xs text-slate-600 dark:border-slate-600 dark:text-slate-300"
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
  if (opts.compact) return "calc(2.75rem + env(safe-area-inset-bottom))";
  if (opts.expanded) return "calc(11rem + 4.75rem + env(safe-area-inset-bottom))";
  return "calc(3.5rem + 4.75rem + env(safe-area-inset-bottom))";
}
