"use client";

import React, { useState } from "react";
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

  if (lines.length === 0) return null;

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
    <div className="sticky bottom-0 z-20 -mx-1 border-t border-emerald-200 bg-white/95 px-1 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_rgba(0,0,0,0.08)] backdrop-blur dark:border-emerald-900 dark:bg-slate-900/95">
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-3 dark:border-emerald-900 dark:bg-emerald-950/30">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-left text-sm font-semibold text-emerald-900 dark:text-emerald-100"
          >
            {t("Order cart")} · {lines.length} {t("products")} · {totalUnits}{" "}
            {t("qty total")}
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClear}
              className="min-h-[40px] rounded-xl border border-gray-200 px-3 text-xs font-medium dark:border-slate-600"
            >
              {t("Clear")}
            </button>
            <button
              type="button"
              disabled={sharing || !shopBaseUrl}
              onClick={() => void handleShare()}
              className="flex min-h-[40px] items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              <IconWhatsApp className="h-5 w-5" />
              {sharing ? t("Working…") : t("Share cart on WhatsApp")}
            </button>
          </div>
        </div>

        {expanded ? (
          <ul className="mt-3 max-h-48 space-y-2 overflow-y-auto">
            {lines.map((line) => (
              <li
                key={line.productId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 text-sm dark:bg-slate-800"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-900 dark:text-slate-100">
                    {line.name}
                  </p>
                  {line.productCode ? (
                    <p className="text-xs text-slate-500">{line.productCode}</p>
                  ) : null}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label={t("Decrease quantity")}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 dark:border-slate-600"
                    onClick={() =>
                      onSetQuantity(
                        line.productId,
                        clampShareCartQty(line.quantity - 1)
                      )
                    }
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={SHARE_CART_MAX_QTY_PER_LINE}
                    value={line.quantity}
                    onChange={(e) =>
                      onSetQuantity(line.productId, clampShareCartQty(Number(e.target.value)))
                    }
                    className="h-9 w-12 rounded-lg border border-gray-200 text-center text-sm dark:border-slate-600 dark:bg-slate-900"
                    aria-label={t("Quantity")}
                  />
                  <button
                    type="button"
                    aria-label={t("Increase quantity")}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 dark:border-slate-600"
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
                    className="ml-1 flex h-9 w-9 items-center justify-center rounded-lg text-red-600"
                    onClick={() => onRemoveLine(line.productId)}
                  >
                    ×
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
