"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

const inputCls =
  "mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-800";
const labelCls = "text-sm font-medium text-slate-700 dark:text-slate-300";

function orderKey(order: UnpaidWebsiteOrder): string {
  return `${order.integrationId}:${order.orderId}`;
}

function matchesUnpaidSearch(order: UnpaidWebsiteOrder, q: string): boolean {
  if (!q) return true;
  const hay = [
    order.customerName,
    order.customerMobile,
    order.customerEmail,
    order.orderId,
    order.shopLabel,
    ...order.addressLines,
    ...order.items.map((i) => i.name),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

function UnpaidOrderCard({
  order,
  expanded,
  onToggle,
  onWhatsApp,
}: {
  order: UnpaidWebsiteOrder;
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
    <BentoCard className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <button
          type="button"
          onClick={onToggle}
          className="min-w-0 flex-1 cursor-pointer text-left"
          aria-expanded={expanded}
        >
          <p className="font-semibold text-slate-900 dark:text-slate-100">
            {order.customerName}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {formatOrderDateTimeIst(order.createdAt)}
            {itemCount > 0 ? ` · ${t("Qty")}: ${itemCount}` : ""}
            {order.shopLabel ? ` · ${order.shopLabel}` : ""}
          </p>
          <p className="mt-1 text-sm font-medium text-slate-800 dark:text-slate-200">
            {formatMoneyAmount(order.amount, order.currency)}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
              {t("Unpaid")}
            </span>
            <span className="inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
              {t("Web")}
            </span>
          </div>
        </button>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {tel ? (
            <a
              href={tel}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-slate-700 dark:border-slate-600 dark:text-slate-200"
              title={mobileLabel}
              aria-label={t("Call")}
            >
              <IconPhone className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              {t("Call")}
            </a>
          ) : null}
          <button
            type="button"
            disabled={!canWhatsApp}
            onClick={(e) => {
              e.stopPropagation();
              onWhatsApp();
            }}
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 active:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            title={t("WhatsApp")}
            aria-label={t("WhatsApp")}
          >
            <IconWhatsApp className="h-4 w-4 shrink-0" />
            {t("WhatsApp")}
          </button>
        </div>
      </div>

      {expanded ? (
        <div className="mt-4 space-y-3 border-t border-slate-200/80 pt-3 dark:border-slate-700/80">
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
            <ul className="divide-y divide-slate-100 dark:divide-slate-700/60">
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
      ) : null}
    </BentoCard>
  );
}

export default function UnpaidOrdersPage() {
  const { user, loading: authLoading } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const searchBlockRef = useRef<HTMLDivElement>(null);

  const [orders, setOrders] = useState<UnpaidWebsiteOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [listUpdating, setListUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [offerOrder, setOfferOrder] = useState<UnpaidWebsiteOrder | null>(null);

  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [shopFilter, setShopFilter] = useState("all");
  const [searchFocused, setSearchFocused] = useState(false);

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

  const shopOptions = useMemo(() => {
    const labels = Array.from(
      new Set(
        orders
          .map((o) => o.shopLabel?.trim())
          .filter((v): v is string => Boolean(v))
      )
    ).sort((a, b) => a.localeCompare(b));
    return labels;
  }, [orders]);

  useEffect(() => {
    if (shopFilter !== "all" && !shopOptions.includes(shopFilter)) {
      setShopFilter("all");
    }
  }, [shopFilter, shopOptions]);

  const filteredOrders = useMemo(() => {
    const q = appliedSearch.trim().toLowerCase();
    return orders.filter((order) => {
      if (shopFilter !== "all" && order.shopLabel !== shopFilter) return false;
      return matchesUnpaidSearch(order, q);
    });
  }, [orders, appliedSearch, shopFilter]);

  const applySearchNow = () => {
    setAppliedSearch(searchInput.trim());
  };

  if (authLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <ErrorBoundary>
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-4 pb-28 lg:px-10 lg:py-6 lg:pb-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 lg:text-2xl">
            {t("Unpaid orders")}
          </h1>
        </div>

        {(error || warning) && (
          <div
            className={`rounded-xl border px-4 py-3 text-sm ${
              error
                ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
                : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
            }`}
          >
            {error || warning}
          </div>
        )}

        <div
          ref={searchBlockRef}
          className={searchFocused ? "sticky top-0 z-40" : undefined}
        >
          <BentoCard
            className={`p-4 ${
              searchFocused
                ? "shadow-md ring-1 ring-primary-200/60 dark:ring-primary-800/40"
                : ""
            }`}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className={labelCls}>{t("Search")}</span>
                <input
                  className={inputCls}
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onFocus={() => {
                    setSearchFocused(true);
                    requestAnimationFrame(() => {
                      searchBlockRef.current?.scrollIntoView({
                        block: "start",
                        behavior: "smooth",
                      });
                    });
                  }}
                  onBlur={() => {
                    window.setTimeout(() => setSearchFocused(false), 250);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") applySearchNow();
                  }}
                  placeholder={t("Name, mobile, or order id")}
                  autoComplete="off"
                />
              </label>
              <label className="block">
                <span className={labelCls}>{t("Shop")}</span>
                <select
                  className={inputCls}
                  value={shopFilter}
                  onChange={(e) => setShopFilter(e.target.value)}
                >
                  <option value="all">{t("All")}</option>
                  {shopOptions.map((shop) => (
                    <option key={shop} value={shop}>
                      {shop}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => applySearchNow()}
                className="min-h-[44px] rounded-xl bg-primary-500 px-4 text-sm font-semibold text-white"
              >
                {t("Search")}
              </button>
              <button
                type="button"
                onClick={() => void load(true)}
                disabled={refreshing || loading}
                className="min-h-[44px] rounded-xl border border-gray-200 px-4 text-sm font-medium disabled:opacity-50 dark:border-slate-600"
              >
                {refreshing ? t("Loading") : t("Refresh")}
              </button>
              {(listUpdating || refreshing) && orders.length > 0 ? (
                <span className="text-xs text-slate-500">{t("Updating…")}</span>
              ) : null}
            </div>
          </BentoCard>
        </div>

        {loading && orders.length === 0 ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
          </div>
        ) : filteredOrders.length === 0 ? (
          <BentoCard className="p-6 text-center text-sm text-slate-500">
            {orders.length === 0
              ? t("No unpaid orders")
              : t("No unpaid orders match your search.")}
          </BentoCard>
        ) : (
          <div className="space-y-3">
            {filteredOrders.map((order) => {
              const key = orderKey(order);
              return (
                <UnpaidOrderCard
                  key={key}
                  order={order}
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
