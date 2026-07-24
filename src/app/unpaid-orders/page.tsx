"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/language-context";
import { BentoCard } from "@/components/ui/BentoCard";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { IconWhatsApp } from "@/components/ui/OrderIcons";
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
    <BentoCard className="overflow-hidden border-amber-200/80 bg-amber-50/50 p-0 dark:border-amber-800/50 dark:bg-amber-950/30">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-amber-100/40 dark:hover:bg-amber-900/20"
        aria-expanded={expanded}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-slate-900 dark:text-white">
              {order.customerName}
            </span>
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
              {t("Unpaid")}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {formatOrderDateTimeIst(order.createdAt)} · {order.shopLabel}
          </p>
          <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
            {formatMoneyAmount(order.amount, order.currency)}
            {itemCount > 0
              ? ` · ${itemCount} ${itemCount === 1 ? t("item") : t("items")}`
              : ""}
          </p>
        </div>
        <span
          className={`mt-1 shrink-0 text-slate-400 transition-transform ${
            expanded ? "rotate-180" : ""
          }`}
          aria-hidden
        >
          ▾
        </span>
      </button>

      <div className="mx-4 mb-3 flex flex-col gap-2 sm:flex-row">
        {tel ? (
          <a
            href={tel}
            onClick={(e) => e.stopPropagation()}
            className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 active:bg-emerald-800"
          >
            <span aria-hidden>📞</span>
            {t("Call")}
          </a>
        ) : (
          <p className="flex min-h-[44px] flex-1 items-center text-sm text-slate-500 dark:text-slate-400">
            {t("No mobile number on this checkout")}
          </p>
        )}
        <button
          type="button"
          disabled={!canWhatsApp}
          onClick={(e) => {
            e.stopPropagation();
            onWhatsApp();
          }}
          className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#1ebe57] disabled:cursor-not-allowed disabled:opacity-50"
          title={
            canWhatsApp
              ? t("WhatsApp cart offer")
              : t("No product IDs on this checkout — cannot build a cart link.")
          }
        >
          <IconWhatsApp className="h-5 w-5" />
          {t("WhatsApp")}
        </button>
      </div>

      {expanded && (
        <div className="space-y-3 border-t border-amber-200/70 px-4 py-3 dark:border-amber-800/40">
          {order.customerEmail ? (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {t("Email")}
              </p>
              <a
                href={`mailto:${order.customerEmail}`}
                className="text-sm text-primary-600 underline-offset-2 hover:underline dark:text-primary-400"
              >
                {order.customerEmail}
              </a>
            </div>
          ) : null}

          {order.customerMobile ? (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {t("Mobile")}
              </p>
              {tel ? (
                <a
                  href={tel}
                  className="text-sm font-medium text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400"
                >
                  {mobileLabel}
                </a>
              ) : (
                <p className="text-sm text-slate-800 dark:text-slate-200">
                  {mobileLabel}
                </p>
              )}
            </div>
          ) : null}

          {order.addressLines.length > 0 ? (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {t("Address")}
              </p>
              <p className="whitespace-pre-line text-sm text-slate-800 dark:text-slate-200">
                {order.addressLines.join("\n")}
              </p>
            </div>
          ) : null}

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
              {t("Cart items")}
            </p>
            {order.items.length === 0 ? (
              <p className="text-sm text-slate-500">{t("No cart items returned")}</p>
            ) : (
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
                        className="h-14 w-14 shrink-0 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-slate-200 text-xs text-slate-500 dark:bg-slate-700">
                        —
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-snug text-slate-900 dark:text-white">
                        {item.name}
                      </p>
                      {item.productCode ? (
                        <p className="text-xs text-slate-500">{item.productCode}</p>
                      ) : null}
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
            )}
          </div>

          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            {t("Web")} #{order.orderId.slice(0, 8)}…
          </p>
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
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [offerOrder, setOfferOrder] = useState<UnpaidWebsiteOrder | null>(null);

  const load = useCallback(
    async (force: boolean) => {
      if (!user) return;
      if (force) setRefreshing(true);
      else setLoading(true);
      setError(null);
      setWarning(null);
      try {
        if (!force) {
          const cached = peekUnpaidWebsiteOrdersCache(user.id);
          if (cached) {
            setOrders(cached.orders);
            setWarning(cached.warning);
            setLoading(false);
          }
        }
        const result = await fetchUnpaidWebsiteOrders(user.id, { force });
        setOrders(result.orders);
        setWarning(result.warning);
        if (result.error && result.orders.length === 0) {
          setError(result.error);
        }
      } catch (e) {
        setError((e as Error).message || t("Failed to load unpaid orders"));
        setOrders([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [user, t]
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
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">
              {t("Unpaid orders")}
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              {t(
                "Website checkouts that started but are not paid yet. Call or WhatsApp their cart."
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load(true)}
            disabled={refreshing || loading}
            className="shrink-0 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
          >
            {refreshing ? t("Loading") : t("Refresh")}
          </button>
        </div>

        <p className="rounded-xl bg-slate-100/80 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800/80 dark:text-slate-400">
          {t(
            "These are not added to your Orders list until payment succeeds."
          )}{" "}
          <Link
            href="/orders/"
            className="font-medium text-primary-600 underline-offset-2 hover:underline dark:text-primary-400"
          >
            {t("Orders")}
          </Link>
        </p>

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
          <BentoCard className="px-4 py-10 text-center">
            <p className="font-medium text-slate-800 dark:text-slate-200">
              {t("No unpaid website orders")}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {t("Showing the last 30 days from your connected shop.")}
            </p>
          </BentoCard>
        ) : (
          <ul className="space-y-3">
            {orders.map((order) => {
              const key = `${order.integrationId}:${order.orderId}`;
              return (
                <li key={key}>
                  <UnpaidOrderCard
                    order={order}
                    expanded={expandedId === key}
                    onToggle={() =>
                      setExpandedId((cur) => (cur === key ? null : key))
                    }
                    onWhatsApp={() =>
                      deferModalOpen(() => setOfferOrder(order))
                    }
                  />
                </li>
              );
            })}
          </ul>
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
