"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Order, WebsiteOrderLineItem } from "@/lib/db-types";
import {
  formatAddressBlock,
  parseRecipientDetails,
} from "@/lib/order-recipient-parser";
import { isPaidWebsiteOrder } from "@/lib/order-payment-status";
import {
  mergeWebsiteLineItems,
  normalizeWebsiteLineItems,
} from "@/lib/website-order-line-items";
import {
  enrichLineItemsWithProductImages,
  lineItemsMissingImages,
  rememberLoadedProductImage,
} from "@/lib/product-image-cache";
import {
  fetchWebsiteOrderDetailSnapshot,
} from "@/lib/website-order-detail-fetch";
import { updateOrder } from "@/lib/order-service";
import { useBackdropDismissGuard } from "@/lib/use-backdrop-dismiss-guard";

export type OrderDetailSheetProps = {
  open: boolean;
  order: Order | null;
  userId: string | null;
  onClose: () => void;
  onOrderUpdated?: (order: Order) => void;
  labels: {
    title: string;
    close: string;
    edit: string;
    packItems: string;
    customer: string;
    mobile: string;
    address: string;
    sender: string;
    bookingDate: string;
    courier: string;
    tracking: string;
    quantity: string;
    loading: string;
    webOrder: string;
    paid: string;
    noImage: string;
    noItems: string;
  };
};

function formatBookingDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function LineItemRow({
  item,
  userId,
  noImageLabel,
}: {
  item: WebsiteOrderLineItem;
  userId: string | null;
  noImageLabel: string;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const showImage = Boolean(item.imageUrl?.trim()) && !imgFailed;

  return (
    <li className="flex gap-3 rounded-xl border border-gray-100 bg-white p-3 dark:border-slate-700 dark:bg-slate-900/60">
      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-gray-100 dark:bg-slate-800">
        {showImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.imageUrl!}
            alt={item.name}
            className="h-full w-full object-cover"
            loading="lazy"
            onError={() => setImgFailed(true)}
            onLoad={() => {
              if (userId) {
                void rememberLoadedProductImage(userId, item);
              }
            }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center px-1 text-center text-[10px] font-medium leading-tight text-slate-400">
            {noImageLabel}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {item.name}
        </p>
        {item.productCode ? (
          <p className="mt-0.5 font-mono text-xs text-slate-500 dark:text-slate-400">
            {item.productCode}
          </p>
        ) : null}
        <p className="mt-2 text-sm font-medium text-primary-600 dark:text-primary-400">
          × {item.quantity}
        </p>
      </div>
    </li>
  );
}

export function OrderDetailSheet({
  open,
  order,
  userId,
  onClose,
  onOrderUpdated,
  labels,
}: OrderDetailSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onOrderUpdatedRef = useRef(onOrderUpdated);
  onOrderUpdatedRef.current = onOrderUpdated;
  const shouldDismissBackdrop = useBackdropDismissGuard(open);
  const [loadingItems, setLoadingItems] = useState(false);
  const [lineItems, setLineItems] = useState<WebsiteOrderLineItem[]>([]);
  const [extraAddressLines, setExtraAddressLines] = useState<string[]>([]);
  const [extraCustomerName, setExtraCustomerName] = useState("");
  const [extraMobile, setExtraMobile] = useState("");

  const parsed = useMemo(
    () => parseRecipientDetails(order?.recipient_details ?? ""),
    [order?.recipient_details]
  );

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !order) {
      setLineItems([]);
      setExtraAddressLines([]);
      setExtraCustomerName("");
      setExtraMobile("");
      return;
    }

    let cancelled = false;
    const stored = normalizeWebsiteLineItems(order.website_line_items);
    const orderId = order.id;
    const externalId = order.external_order_id?.trim() || "";
    const isWebsite = order.order_source === "website";

    async function persistItems(items: WebsiteOrderLineItem[]) {
      if (!userId || !orderId || !items.length) return;
      try {
        await updateOrder(userId, orderId, {
          website_line_items: items,
        });
        onOrderUpdatedRef.current?.({
          ...order!,
          website_line_items: items,
        });
      } catch {
        /* keep UI state even if persist fails */
      }
    }

    async function resolveImages(items: WebsiteOrderLineItem[]) {
      if (!userId || !items.length || !lineItemsMissingImages(items)) {
        return items;
      }

      let next = items;

      // 1) Refresh from shop order detail when images are missing.
      if (isWebsite && externalId) {
        try {
          const snapshot = await fetchWebsiteOrderDetailSnapshot(
            userId,
            externalId
          );
          if (snapshot?.lineItems?.length) {
            next = mergeWebsiteLineItems(next, snapshot.lineItems);
            if (!cancelled) {
              setExtraAddressLines(snapshot.addressLines);
              setExtraCustomerName(snapshot.customerName);
              setExtraMobile(snapshot.customerMobile);
            }
          }
        } catch {
          /* fall through to product catalog */
        }
      }

      // 2) Fill remaining gaps from product catalog + local image cache.
      if (lineItemsMissingImages(next)) {
        const enriched = await enrichLineItemsWithProductImages(userId, next);
        next = enriched.items;
      }

      return next;
    }

    if (stored.length > 0) {
      setLineItems(stored);
      setLoadingItems(lineItemsMissingImages(stored));

      void (async () => {
        const resolved = await resolveImages(stored);
        if (cancelled) return;
        setLineItems(resolved);
        setLoadingItems(false);
        if (
          lineItemsMissingImages(stored) &&
          !lineItemsMissingImages(resolved)
        ) {
          await persistItems(resolved);
        } else if (
          resolved.some(
            (row, i) =>
              (row.imageUrl ?? null) !== (stored[i]?.imageUrl ?? null) ||
              (row.productCode ?? null) !== (stored[i]?.productCode ?? null)
          )
        ) {
          await persistItems(resolved);
        }
      })();
      return () => {
        cancelled = true;
      };
    }

    if (!isWebsite || !externalId || !userId) {
      setLineItems(
        parsed.itemLines.map((line) => {
          const match = line.match(/^(.+?)\s+x(\d+)$/i);
          return {
            name: match ? match[1].trim() : line,
            quantity: match ? Math.max(1, Number(match[2]) || 1) : 1,
          };
        })
      );
      return;
    }

    setLoadingItems(true);
    void (async () => {
      try {
        const snapshot = await fetchWebsiteOrderDetailSnapshot(
          userId,
          externalId
        );
        if (cancelled) return;
        if (!snapshot) {
          setLineItems([]);
          return;
        }
        setExtraAddressLines(snapshot.addressLines);
        setExtraCustomerName(snapshot.customerName);
        setExtraMobile(snapshot.customerMobile);

        const resolved = await resolveImages(snapshot.lineItems);
        if (cancelled) return;
        setLineItems(resolved);
        if (resolved.length > 0) await persistItems(resolved);
      } finally {
        if (!cancelled) setLoadingItems(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, order, userId, parsed.itemLines]);

  if (!open || !order) return null;

  const isWeb = order.order_source === "website";
  const isPaidWeb = isPaidWebsiteOrder(order);
  const customerName =
    extraCustomerName ||
    order.booked_by?.trim() ||
    parsed.customerName ||
    "—";
  const mobile = extraMobile || order.booked_mobile_no?.trim() || "—";
  const addressLines =
    extraAddressLines.length > 0 ? extraAddressLines : parsed.addressLines;
  const addressText =
    addressLines.length > 0
      ? formatAddressBlock(addressLines)
      : parsed.addressLines.length === 0
        ? (order.recipient_details || "").split(/\r?\n/).slice(1).join("\n").trim()
        : "";

  return (
    <div
      className="fixed inset-0 z-[110] flex items-end justify-center bg-black/45 md:items-center md:px-4"
      role="presentation"
      onClick={(e) => {
        if (shouldDismissBackdrop(e.target, e.currentTarget)) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-detail-title"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        className="flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-2xl border border-gray-200 bg-gray-50 shadow-xl dark:border-slate-600 dark:bg-slate-900 md:rounded-2xl"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-200 bg-white px-5 py-4 dark:border-slate-700 dark:bg-slate-800">
          <div className="min-w-0">
            <h2
              id="order-detail-title"
              className="text-lg font-bold text-slate-900 dark:text-slate-100"
            >
              {labels.title}
            </h2>
            <div className="mt-1 flex flex-wrap gap-2">
              {isWeb ? (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300">
                  {labels.webOrder}
                </span>
              ) : null}
              {isPaidWeb ? (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                  {labels.paid}
                </span>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
            aria-label={labels.close}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="space-y-4">
            <section className="rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    {labels.customer}
                  </dt>
                  <dd className="mt-1 font-medium text-slate-900 dark:text-slate-100">
                    {customerName}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    {labels.mobile}
                  </dt>
                  <dd className="mt-1 text-slate-800 dark:text-slate-200">{mobile}</dd>
                </div>
                {addressText ? (
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      {labels.address}
                    </dt>
                    <dd className="mt-1 whitespace-pre-wrap text-slate-800 dark:text-slate-200">
                      {addressText}
                    </dd>
                  </div>
                ) : null}
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      {labels.bookingDate}
                    </dt>
                    <dd className="mt-1 text-slate-800 dark:text-slate-200">
                      {formatBookingDate(order.booking_date)}
                    </dd>
                  </div>
                  {order.quantity != null && Number(order.quantity) >= 1 ? (
                    <div>
                      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        {labels.quantity}
                      </dt>
                      <dd className="mt-1 text-slate-800 dark:text-slate-200">
                        {Number(order.quantity)}
                      </dd>
                    </div>
                  ) : null}
                </div>
                {order.courier_name ? (
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      {labels.courier}
                    </dt>
                    <dd className="mt-1 text-slate-800 dark:text-slate-200">
                      {order.courier_name}
                    </dd>
                  </div>
                ) : null}
                {order.tracking_number ? (
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      {labels.tracking}
                    </dt>
                    <dd className="mt-1 font-mono text-slate-800 dark:text-slate-200">
                      {order.tracking_number}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </section>

            <section>
              <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
                {labels.packItems}
              </h3>
              {loadingItems && lineItems.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">{labels.loading}</p>
              ) : lineItems.length === 0 ? (
                <p className="rounded-xl border border-dashed border-gray-200 bg-white px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                  {labels.noItems}
                </p>
              ) : (
                <ul className="space-y-3">
                  {lineItems.map((item, idx) => (
                    <LineItemRow
                      key={`${item.productId ?? item.name}-${idx}`}
                      item={item}
                      userId={userId}
                      noImageLabel={labels.noImage}
                    />
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>

        <div className="flex shrink-0 gap-3 border-t border-gray-200 bg-white px-5 py-4 dark:border-slate-700 dark:bg-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="min-h-touch flex-1 rounded-bento border border-gray-200 bg-white font-medium text-slate-700 hover:bg-gray-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
          >
            {labels.close}
          </button>
          <Link
            href={`/edit-order/?id=${order.id}`}
            onClick={onClose}
            className="min-h-touch flex flex-1 items-center justify-center rounded-bento bg-primary-500 font-semibold text-white hover:bg-primary-600"
          >
            {labels.edit}
          </Link>
        </div>
      </div>
    </div>
  );
}

export function orderDetailSheetLabels(t: (key: string) => string) {
  return {
    title: t("Order details"),
    close: t("Close"),
    edit: t("Edit Order"),
    packItems: t("Pack these items"),
    customer: t("Customer"),
    mobile: t("Mobile number"),
    address: t("TO (customer address)"),
    sender: t("FROM (our address)"),
    bookingDate: t("Booking date"),
    courier: t("Courier Name"),
    tracking: t("Tracking number"),
    quantity: t("Qty"),
    loading: t("Loading items…"),
    webOrder: t("Web"),
    paid: t("Paid"),
    noImage: t("No photo"),
    noItems: t("No items listed for this order."),
  };
}
