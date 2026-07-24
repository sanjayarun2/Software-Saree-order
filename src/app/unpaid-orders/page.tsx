"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/language-context";
import { BentoCard } from "@/components/ui/BentoCard";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { IconPhone, IconWhatsApp } from "@/components/ui/OrderIcons";
import { UnpaidOfferModal } from "@/components/unpaid/UnpaidOfferModal";
import { formatOrderDateTimeIst } from "@/lib/order-datetime";
import { deferModalOpen } from "@/lib/use-backdrop-dismiss-guard";
import { unpaidItemsToShareCartLines } from "@/lib/unpaid-offer";
import {
  fetchUnpaidWebsiteOrders,
  formatMobileDisplay,
  formatMoneyAmount,
  mobileToTelHref,
  peekUnpaidWebsiteOrdersCache,
  type UnpaidWebsiteOrder,
} from "@/lib/unpaid-website-orders";

function UnpaidOrderCard({
  order,
  index,
  expanded,
  onToggle,
  onWhatsApp,
}: {
  order: UnpaidWebsiteOrder;
  index: number;
  expanded: boolean;
  onToggle: () => void;
  onWhatsApp: () => void;
}) {
  const { t } = useLanguage();
  const tel = mobileToTelHref(order.customerMobile);
  const mobileLabel = formatMobileDisplay(order.customerMobile) || t("No mobile");
  const itemCount = order.items.reduce((sum, i) => sum + (i.quantity || 0), 0);
  const canWhatsApp =
    Boolean(order.customerMobile?.trim()) &&
    unpaidItemsToShareCartLines(order.items).length > 0;

  return (
    <BentoCard className="flex flex-col gap-0 overflow-hidden border-amber-300/80 bg-amber-50/80 p-0 dark:border-amber-700/60 dark:bg-amber-950/45">
      <div className="flex items-center justify-between gap-3 px-4 py-4">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-4 text-left"
          aria-expanded={expanded}
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-sm font-semibold text-primary-600 dark:bg-primary-900/50 dark:text-primary-300">
            {index + 1}
          </span>
          <div className="min-w-0 flex-1 space-y-1">
            <p className="truncate text-sm font-medium text-gray-900 dark:text-slate-100 lg:text-base">
              {order.customerName}
            </p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-gray-500 dark:text-slate-400">
              <span className="tabular-nums whitespace-nowrap">
                {formatOrderDateTimeIst(order.createdAt)}
              </span>
              {itemCount > 0 ? (
                <span>
                  {t("Qty")}: {itemCount}
                </span>
              ) : null}
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
                {t("Unpaid")}
              </span>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300">
                {t("Web")}
              </span>
            </div>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              {formatMoneyAmount(order.amount, order.currency)}
              <span className="ml-2 font-normal text-slate-500">
                · {order.shopLabel}
              </span>
            </p>
          </div>
        </button>

        <div className="flex shrink-0 items-center gap-1">
          {tel ? (
            <a
              href={tel}
              onClick={(e) => e.stopPropagation()}
              className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-emerald-100 text-emerald-700 transition hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:hover:bg-emerald-900/60"
              title={mobileLabel}
              aria-label={t("Call")}
            >
              <IconPhone className="h-5 w-5" />
            </a>
          ) : null}
          <button
            type="button"
            disabled={!canWhatsApp}
            onClick={(e) => {
              e.stopPropagation();
              onWhatsApp();
            }}
            className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-green-100 text-green-600 transition hover:bg-green-200 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-emerald-900/40 dark:text-emerald-300 dark:hover:bg-emerald-900/60"
            title={t("WhatsApp")}
            aria-label={t("WhatsApp")}
          >
            <IconWhatsApp className="h-5 w-5" />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="space-y-3 border-t border-amber-200/70 px-4 py-3 dark:border-amber-800/40">
          {order.customerMobile ? (
            <p className="text-sm text-slate-700 dark:text-slate-300">
              <span className="text-slate-500">{t("Mobile")}: </span>
              {tel ? (
                <a
                  href={tel}
                  className="font-medium text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400"
                >
                  {mobileLabel}
                </a>
              ) : (
                mobileLabel
              )}
            </p>
          ) : null}

          {order.addressLines.length > 0 ? (
            <p className="whitespace-pre-line text-sm text-slate-800 dark:text-slate-200">
              {order.addressLines.join("\n")}
            </p>
          ) : null}

          {order.items.length > 0 ? (
            <ul className="divide-y divide-amber-100 dark:divide-amber-900/40">
              {order.items.map((item, idx) => (
                <li
                  key={`${order.orderId}-${item.productId || item.name}-${idx}`}
                  className="flex gap-3 py-2.5 first:pt-0 last:pb-0"
                >
                  {item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.imageUrl}
                      alt=""
                      className="h-12 w-12 shrink-0 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-slate-200 text-xs text-slate-500 dark:bg-slate-700">
                      —
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-snug text-slate-900 dark:text-white">
                      {item.name}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
                      {t("Qty")}: {item.quantity}
                      {item.unitPrice != null
                        ? ` · ${formatMoneyAmount(item.unitPrice, order.currency)}`
                        : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">{t("No cart items")}</p>
          )}
        </div>
      )}
    </BentoCard>
  );
}

export default function UnpaidOrdersPage() {
  const { user, loading: authLoading } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const [orders, setOrders] = useState<UnpaidWebsiteOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [listUpdating, setListUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [offerOrder, setOfferOrder] = useState<UnpaidWebsiteOrder | null>(null);

  const applyResult = useCallback(
    (result: {
      orders: UnpaidWebsiteOrder[];
      error: string | null;
      warning: string | null;
    }) => {
      setOrders(result.orders);
      setWarning(result.warning);
      if (result.error && result.orders.length === 0) {
        setError(result.error);
      } else {
        setError(null);
      }
    },
    []
  );

  const load = useCallback(
    async (force: boolean) => {
      if (!user) return;
      setError(null);

      if (force) {
        setRefreshing(true);
        setListUpdating(false);
      } else {
        const cached = peekUnpaidWebsiteOrdersCache(user.id);
        if (cached) {
          setOrders(cached.orders);
          setWarning(cached.warning);
          setLoading(false);
          setListUpdating(cached.isStale);
        } else {
          setLoading(true);
        }
      }

      try {
        const result = await fetchUnpaidWebsiteOrders(user.id, {
          force,
          onFresh: (fresh) => {
            applyResult(fresh);
            setListUpdating(false);
            setRefreshing(false);
          },
        });
        applyResult(result);
        if (result.revalidating) {
          setListUpdating(true);
        } else {
          setListUpdating(false);
          setRefreshing(false);
        }
      } catch (e) {
        setError((e as Error).message || t("Failed to load unpaid orders"));
        setListUpdating(false);
        setRefreshing(false);
      } finally {
        setLoading(false);
      }
    },
    [user, t, applyResult]
  );

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login/");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (user) void load(false);
  }, [user, load]);

  return (
    <ErrorBoundary>
      <div className="mx-auto max-w-2xl space-y-4 px-1 pb-8">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">
            {t("Unpaid orders")}
          </h1>
          <button
            type="button"
            onClick={() => void load(true)}
            disabled={refreshing || loading}
            className="shrink-0 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
          >
            {refreshing ? t("Loading") : t("Refresh")}
          </button>
        </div>

        {listUpdating && (
          <div
            className="flex items-center gap-2 rounded-xl border border-primary-200 bg-primary-50 px-3 py-2 text-sm text-primary-800 dark:border-primary-900/50 dark:bg-primary-950/40 dark:text-primary-200"
            role="status"
            aria-live="polite"
          >
            <span
              className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-300 border-t-primary-600 dark:border-primary-700 dark:border-t-primary-300"
              aria-hidden
            />
            <span>{t("Updating…")}</span>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        )}

        {warning && !error && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            {warning}
          </div>
        )}

        {loading && orders.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-500">
            {t("Loading")}…
          </p>
        ) : orders.length === 0 ? (
          <BentoCard>
            <p className="text-center text-slate-500 dark:text-slate-400">
              {t("No unpaid orders")}
            </p>
          </BentoCard>
        ) : (
          <div className="space-y-4">
            {orders.map((order, i) => {
              const key = `${order.integrationId}:${order.orderId}`;
              return (
                <UnpaidOrderCard
                  key={key}
                  order={order}
                  index={i}
                  expanded={expandedId === key}
                  onToggle={() =>
                    setExpandedId((cur) => (cur === key ? null : key))
                  }
                  onWhatsApp={() =>
                    deferModalOpen(() => setOfferOrder(order))
                  }
                />
              );
            })}
          </div>
        )}
      </div>

      {offerOrder ? (
        <UnpaidOfferModal
          order={offerOrder}
          open
          onClose={() => setOfferOrder(null)}
        />
      ) : null}
    </ErrorBoundary>
  );
}
