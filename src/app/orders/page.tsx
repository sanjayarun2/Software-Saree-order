"use client";

import React, { useEffect, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/language-context";
import { BentoCard } from "@/components/ui/BentoCard";
import { OrderListSkeleton } from "@/components/ui/SkeletonLoader";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { IconEdit, IconDispatch, IconUndo, IconPdf, IconPrint, IconTrash, IconWhatsApp } from "@/components/ui/OrderIcons";
import { BarcodeScannerModal } from "@/components/ui/BarcodeScannerModal";
import FormatSelectionModal from "@/components/ui/FormatSelectionModal";
import { downloadOrdersPdf, PdfAddressTooLongError } from "@/lib/pdf-utils";
import { downloadOrdersPosPdf, printOrdersPosPdf } from "@/lib/pos-pdf-utils";
import { useSearch } from "@/lib/search-context";
import {
  getOrders as svcGetOrders,
  deleteOrder as svcDeleteOrder,
  updateOrderStatus as svcUpdateOrderStatus,
} from "@/lib/order-service";
import type { Order, OrderStatus } from "@/lib/db-types";
import {
  isPaidWebsiteOrder,
  isVisibleInOrdersList,
  shouldShowPaymentBadge,
} from "@/lib/order-payment-status";
import {
  isOrderFilterActive,
  orderFiltersFromTabParam,
  type OrderFilterState,
} from "@/lib/order-filter-utils";
import {
  OrdersFilterModal,
  ordersFilterModalLabels,
} from "@/components/orders/OrdersFilterModal";
import {
  OrderDetailSheet,
  orderDetailSheetLabels,
} from "@/components/orders/OrderDetailSheet";

function getAddressSummary(text: string, maxLen = 45): string {
  const first = (text || "").split(/\r?\n/)[0]?.trim() || text?.trim() || "";
  return first.length > maxLen ? `${first.slice(0, maxLen)}…` : first;
}

function getAddressLine1(text: string): string {
  return (text || "").split(/\r?\n/)[0]?.trim() || text?.trim() || "—";
}

export default function OrdersPage() {
  const { user, loading: authLoading } = useAuth();
  const { t } = useLanguage();
  const { query, setQuery } = useSearch();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const [appliedFilters, setAppliedFilters] = useState<OrderFilterState>(() =>
    orderFiltersFromTabParam(tabParam)
  );
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterGenerating, setFilterGenerating] = useState(false);
  const [detailOrder, setDetailOrder] = useState<Order | null>(null);

  const status = appliedFilters.status;

  const appliedFiltersRef = useRef(appliedFilters);
  appliedFiltersRef.current = appliedFilters;

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [pdfFallbackUrl, setPdfFallbackUrl] = useState<string | null>(null);
  const [dispatchOrder, setDispatchOrder] = useState<Order | null>(null);
  const [trackingNumber, setTrackingNumber] = useState("");
  const [dispatching, setDispatching] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [showFormatModal, setShowFormatModal] = useState<"pdf" | "print" | null>(null);
  const [printing, setPrinting] = useState(false);
  const trackingInputRef = useRef<HTMLInputElement>(null);

  /** Pending tab only: long-press an order to enter multi-select; then tap rows to toggle. PDF/Print use selection when active. */
  const [pendingSelectionActive, setPendingSelectionActive] = useState(false);
  const [pendingSelectedIds, setPendingSelectedIds] = useState<Set<string>>(() => new Set());
  const pendingLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingIgnoreNextRowClickRef = useRef(false);
  /** True while a `history.pushState` dummy entry exists for pending multi-select (so Back exits selection, not the app). */
  const pendingSelectionHistoryPushedRef = useRef(false);
  const pendingSelectionActiveRef = useRef(false);
  pendingSelectionActiveRef.current = pendingSelectionActive;

  const clearPendingLongPressTimer = () => {
    if (pendingLongPressTimerRef.current != null) {
      clearTimeout(pendingLongPressTimerRef.current);
      pendingLongPressTimerRef.current = null;
    }
  };

  const schedulePendingLongPress = (orderId: string) => {
    clearPendingLongPressTimer();
    pendingLongPressTimerRef.current = setTimeout(() => {
      pendingLongPressTimerRef.current = null;
      setPendingSelectionActive(true);
      setPendingSelectedIds((prev) => new Set(prev).add(orderId));
      pendingIgnoreNextRowClickRef.current = true;
    }, 550);
  };

  const handlePendingOrderRowClick = (orderId: string) => {
    if (!pendingSelectionActive) return;
    if (pendingIgnoreNextRowClickRef.current) {
      pendingIgnoreNextRowClickRef.current = false;
      return;
    }
    setPendingSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  const handleOrderCardClick = (order: Order) => {
    if (status === "PENDING" && pendingSelectionActive) {
      handlePendingOrderRowClick(order.id);
      return;
    }
    if (pendingIgnoreNextRowClickRef.current) {
      pendingIgnoreNextRowClickRef.current = false;
      return;
    }
    setDetailOrder(order);
  };

  const openWhatsAppForOrder = (order: Order) => {
    if (typeof window === "undefined") return;
    const booking = new Date(order.booking_date).toLocaleDateString("en-GB");
    const despatch =
      order.despatch_date != null
        ? new Date(order.despatch_date).toLocaleDateString("en-GB")
        : "Not dispatched";
    const qty =
      order.quantity != null && Number(order.quantity) >= 1
        ? String(Number(order.quantity))
        : "1";

    const nameLine = (order.recipient_details || "").split(/\r?\n/)[0]?.trim() || "";
    const staffName = (order.booked_by || "").trim() || "-";

    const mobile = (order.booked_mobile_no || "").trim() || "-";

    const consignment = (order.tracking_number || "").trim();
    const courierName = (order.courier_name || "").trim();

    const COURIER_TRACKING_URLS: Record<string, string> = {
      "Professional": "https://www.tpcindia.com/",
      "ST Courier": "https://stcourier.com/track/shipment",
      "Blue Dart": "https://www.bluedart.com/tracking",
      "Delhivery": "https://www.delhivery.com/tracking",
      "India Post": "https://www.indiapost.gov.in/",
      "Trackon": "https://www.trackon.in/",
      "Shadowfox": "https://www.shadowfax.in/",
      "Xpressbees": "https://www.xpressbees.com/shipment/tracking",
      "Ekart Logistics": "https://www.ekartlogistics.com/",
      "DHL": "https://www.dhl.com/in-en/home/tracking.html",
    };

    const trackingUrl = COURIER_TRACKING_URLS[courierName] || "";

    const lines = [
      "Thanks for ordering with us",
      "Keep purchase with us",
      "",
      nameLine,
      `Booked by: ${staffName}`,
      `Quantity: ${qty}`,
      `Booked date: ${booking}`,
      `Booked mobile number: ${mobile}`,
      `Courier name: ${courierName || "N/A"}`,
      `Dispatched date: ${despatch}`,
    ];

    if (trackingUrl) {
      lines.push("", `Track here: ${trackingUrl}`);
    }

    if (consignment) {
      lines.push("", "Tracking number:", consignment);
    }

    const message = encodeURIComponent(lines.join("\n"));
    const url = `https://wa.me/?text=${message}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login/");
  }, [user, authLoading, router]);

  const fetchOrders = React.useCallback(
    async (filters: OrderFilterState) => {
      if (!user) return;
      setError(null);
      setLoading(true);
      try {
        const { status: st, fromDate, toDate, allOrders } = filters;
        const cached = await svcGetOrders(
          user.id,
          { status: st, fromDate, toDate, allOrders },
          (fresh) => {
            setOrders(fresh);
          }
        );
        setOrders(cached);
      } catch (e) {
        setError((e as Error).message || "Failed to load orders");
      } finally {
        setLoading(false);
      }
    },
    [user]
  );

  const handleApplyFilters = React.useCallback(
    async (filters: OrderFilterState) => {
      setFilterGenerating(true);
      try {
        setAppliedFilters(filters);
        appliedFiltersRef.current = filters;
        await fetchOrders(filters);
        setFilterOpen(false);
      } finally {
        setFilterGenerating(false);
      }
    },
    [fetchOrders]
  );

  const handleStatusChange = React.useCallback(
    (nextStatus: OrderStatus) => {
      if (nextStatus === appliedFiltersRef.current.status) return;
      const next: OrderFilterState = { ...appliedFiltersRef.current, status: nextStatus };
      setAppliedFilters(next);
      appliedFiltersRef.current = next;
      void fetchOrders(next);
      const tab = nextStatus === "DESPATCHED" ? "dispatched" : "pending";
      router.replace(`/orders/?tab=${tab}`, { scroll: false });
    },
    [fetchOrders, router]
  );

  const filterActive = isOrderFilterActive(appliedFilters);

  useEffect(() => {
    const onImported = () => {
      void fetchOrders(appliedFiltersRef.current);
    };
    window.addEventListener("velo-website-orders-imported", onImported);
    return () => window.removeEventListener("velo-website-orders-imported", onImported);
  }, [fetchOrders]);

  useEffect(() => {
    if (user) void fetchOrders(appliedFiltersRef.current);
  }, [user, fetchOrders]);

  // Sync status from URL when returning from edit-order or browser back; refetch list
  useEffect(() => {
    const urlStatus: OrderStatus = tabParam === "dispatched" ? "DESPATCHED" : "PENDING";
    setAppliedFilters((prev) => {
      if (prev.status === urlStatus) return prev;
      const next = { ...prev, status: urlStatus };
      appliedFiltersRef.current = next;
      if (user) void fetchOrders(next);
      return next;
    });
  }, [tabParam, user, fetchOrders]);

  const filteredOrders = React.useMemo(() => {
    let list = orders.filter((o) => o.status === status && isVisibleInOrdersList(o));
    const raw = query.trim();
    if (!raw) return list;
    const q = raw.toLowerCase();
    const digitsOnly = raw.replace(/\D/g, "");
    return list.filter((o) => {
      if (o.id && o.id.toLowerCase().includes(q)) return true;
      if (o.booked_by && (o.booked_by as string).toLowerCase().includes(q)) return true;
      if (o.recipient_details && (o.recipient_details as string).toLowerCase().includes(q)) return true;
      if (o.sender_details && (o.sender_details as string).toLowerCase().includes(q)) return true;
      if (digitsOnly.length >= 4 && o.booked_mobile_no) {
        const mobileDigits = (o.booked_mobile_no as string).replace(/\D/g, "");
        if (mobileDigits.includes(digitsOnly) || digitsOnly.includes(mobileDigits)) return true;
      }
      if (o.booked_mobile_no && (o.booked_mobile_no as string).toLowerCase().includes(q)) return true;
      return false;
    });
  }, [orders, query, status]);

  const pendingSelectedKey = React.useMemo(
    () => Array.from(pendingSelectedIds).sort().join(","),
    [pendingSelectedIds]
  );

  const ordersForPdfAndPrint = React.useMemo(() => {
    if (status !== "PENDING" || !pendingSelectionActive) {
      return filteredOrders;
    }
    return filteredOrders.filter((o) => pendingSelectedIds.has(o.id));
  }, [status, pendingSelectionActive, filteredOrders, pendingSelectedKey]);

  useEffect(() => {
    if (status === "PENDING" && pendingSelectionActive && !pendingSelectionHistoryPushedRef.current) {
      pendingSelectionHistoryPushedRef.current = true;
      window.history.pushState({ sareePendingSelection: true }, "");
    }
  }, [status, pendingSelectionActive]);

  useEffect(() => {
    const onPopState = () => {
      if (!pendingSelectionActiveRef.current) {
        pendingSelectionHistoryPushedRef.current = false;
        return;
      }
      setPendingSelectionActive(false);
      setPendingSelectedIds(new Set());
      pendingIgnoreNextRowClickRef.current = false;
      pendingSelectionHistoryPushedRef.current = false;
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (status !== "PENDING") {
      if (pendingSelectionHistoryPushedRef.current) {
        pendingSelectionHistoryPushedRef.current = false;
        window.history.back();
      }
      setPendingSelectionActive(false);
      setPendingSelectedIds(new Set());
    }
  }, [status]);

  const handleDelete = async (id: string) => {
    if (!user) return;
    if (!confirm("Delete this order?")) return;
    try {
      await svcDeleteOrder(user.id, id);
      setOrders((prev) => prev.filter((o) => o.id !== id));
    } catch (e) {
      setError((e as Error).message || "Delete failed");
    }
  };

  const handleMarkAsDespatched = (order: Order) => {
    if (!user || order.status !== "PENDING") return;
    setDispatchOrder(order);
    setTrackingNumber("");
    setTimeout(() => trackingInputRef.current?.focus(), 100);
  };

  const confirmDispatch = async () => {
    if (!user || !dispatchOrder) return;
    setDispatching(true);
    const today = new Date().toISOString().slice(0, 10);
    const tn = trackingNumber.trim() || null;
    try {
      await svcUpdateOrderStatus(user.id, dispatchOrder.id, "DESPATCHED", today, tn);
      setOrders((prev) => prev.filter((o) => o.id !== dispatchOrder.id));
      setDispatchOrder(null);
    } catch (e) {
      setError((e as Error).message || "Failed to mark as despatched");
    } finally {
      setDispatching(false);
    }
  };

  const handleMoveToPending = async (order: Order) => {
    if (!user || order.status !== "DESPATCHED") return;
    if (!confirm("Move this order back to Pending?")) return;
    try {
      await svcUpdateOrderStatus(user.id, order.id, "PENDING", null);
      setOrders((prev) => prev.filter((o) => o.id !== order.id));
    } catch (e) {
      setError((e as Error).message || "Failed to move to pending");
    }
  };

  if (authLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-4 lg:px-10 lg:py-6">
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 lg:text-2xl">
          {t("Orders")}
        </h1>

        <div className="flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900 md:gap-3 md:px-4 md:py-3">
            <svg className="h-4 w-4 shrink-0 text-gray-400 md:h-5 md:w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="search"
              placeholder={t("Search by mobile, name or consignment...")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="min-h-[44px] flex-1 rounded-xl border-0 bg-transparent px-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-0 dark:text-slate-100 dark:placeholder-slate-400 md:min-h-[48px] md:text-base"
              aria-label={t("Search orders by mobile, name or consignment")}
            />
            <button
              type="button"
              onClick={() => setFilterOpen(true)}
              className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition ${
                filterActive
                  ? "border-primary-500 bg-primary-50 text-primary-600 dark:border-primary-400 dark:bg-primary-900/40 dark:text-primary-300"
                  : "border-gray-200 bg-gray-50 text-slate-600 hover:bg-gray-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              }`}
              aria-label={t("Filter orders")}
              aria-expanded={filterOpen}
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
              </svg>
              {filterActive ? (
                <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary-500 ring-2 ring-white dark:ring-slate-900" aria-hidden />
              ) : null}
            </button>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => handleStatusChange("PENDING")}
            className={`min-h-touch flex-1 rounded-bento px-4 font-medium transition ${
              status === "PENDING"
                ? "bg-primary-500 text-white"
                : "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200"
            }`}
          >
            {t("Pending")}
          </button>
          <button
            type="button"
            onClick={() => handleStatusChange("DESPATCHED")}
            className={`min-h-touch flex-1 rounded-bento px-4 font-medium transition ${
              status === "DESPATCHED"
                ? "bg-primary-500 text-white"
                : "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200"
            }`}
          >
            {t("Dispatched")}
          </button>
        </div>

        <OrdersFilterModal
          open={filterOpen}
          status={status}
          initialFilters={appliedFilters}
          onClose={() => {
            if (!filterGenerating) setFilterOpen(false);
          }}
          onApply={(filters) => void handleApplyFilters(filters)}
          generating={filterGenerating || loading}
          labels={ordersFilterModalLabels(t)}
        />

        <OrderDetailSheet
          open={detailOrder != null}
          order={detailOrder}
          userId={user?.id ?? null}
          onClose={() => setDetailOrder(null)}
          onOrderUpdated={(updated) => {
            setOrders((prev) =>
              prev.map((o) => (o.id === updated.id ? { ...o, ...updated } : o))
            );
            setDetailOrder(updated);
          }}
          labels={orderDetailSheetLabels(t)}
        />

        {error && (
          <p className="rounded-bento bg-red-50 p-3 text-red-700 dark:bg-red-900/30 dark:text-red-300">
            {error}
          </p>
        )}

        {loading ? (
          <OrderListSkeleton />
        ) : (
          <div className="space-y-4">
            {filteredOrders.length === 0 ? (
              <BentoCard>
                <p className="text-center text-slate-500 dark:text-slate-400">
                  {orders.length === 0 ? "No orders found." : "No matching orders."}
                </p>
              </BentoCard>
            ) : (
              filteredOrders.map((order, i) => {
                const isWebsiteOrder = order.order_source === "website";
                const isPaidWeb = isPaidWebsiteOrder(order);
                return (
                <BentoCard
                  key={order.id}
                  className={`flex items-center justify-between gap-4 py-4 ${
                    isPaidWeb
                      ? "border-emerald-300/80 bg-emerald-50/80 dark:border-emerald-700/60 dark:bg-emerald-950/45"
                      : ""
                  }`}
                >
                  <div
                    className={`flex min-w-0 flex-1 cursor-pointer items-center gap-4 ${
                      status === "PENDING" ? "touch-manipulation select-none" : ""
                    }`}
                    style={
                      status === "PENDING"
                        ? ({ WebkitTouchCallout: "none" } as React.CSSProperties)
                        : undefined
                    }
                    onClick={() => handleOrderCardClick(order)}
                    onPointerDown={
                      status === "PENDING"
                        ? (e) => {
                            if (e.button === 0) schedulePendingLongPress(order.id);
                          }
                        : undefined
                    }
                    onPointerUp={status === "PENDING" ? clearPendingLongPressTimer : undefined}
                    onPointerLeave={status === "PENDING" ? clearPendingLongPressTimer : undefined}
                    onPointerCancel={status === "PENDING" ? clearPendingLongPressTimer : undefined}
                    onContextMenu={status === "PENDING" ? (e) => e.preventDefault() : undefined}
                  >
                    {status === "PENDING" && pendingSelectionActive ? (
                      <span
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 text-sm font-semibold ${
                          pendingSelectedIds.has(order.id)
                            ? "border-primary-500 bg-primary-500 text-white dark:border-primary-400 dark:bg-primary-500"
                            : "border-slate-300 bg-white text-transparent dark:border-slate-600 dark:bg-slate-800"
                        }`}
                        aria-hidden
                      >
                        {pendingSelectedIds.has(order.id) ? (
                          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <span className="h-5 w-5" />
                        )}
                      </span>
                    ) : (
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-sm font-semibold text-primary-600 dark:bg-primary-900/50 dark:text-primary-300">
                        {i + 1}
                      </span>
                    )}
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="truncate text-sm font-medium text-gray-900 dark:text-slate-100 lg:text-base">
                        {getAddressSummary(order.recipient_details)}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-gray-500 dark:text-slate-400">
                        {order.booked_by?.trim() ? (
                          <span>{t("Booked By")} ({order.booked_by.trim()})</span>
                        ) : null}
                        <span className="tabular-nums">
                          {new Date(order.booking_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" })}
                        </span>
                        {(order.quantity != null && Number(order.quantity) >= 1) && (
                          <span>{t("Qty")}: {Number(order.quantity)}</span>
                        )}
                        {isWebsiteOrder && (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300">
                            {t("Web")}
                          </span>
                        )}
                        {shouldShowPaymentBadge(order.order_source, order.payment_status) && (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                            {t("Paid")}
                          </span>
                        )}
                        {order.status === "DESPATCHED" && (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                            Dispatched
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Link
                      href={`/edit-order/?id=${order.id}`}
                      className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-gray-100 text-gray-600 transition hover:bg-primary-100 hover:text-primary-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-primary-900/50 dark:hover:text-primary-300"
                      title="Edit"
                    >
                      <IconEdit className="h-5 w-5" />
                    </Link>
                    {order.status === "PENDING" && (
                      <button
                        onClick={() => handleMarkAsDespatched(order)}
                        className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-emerald-100 text-emerald-600 transition hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:hover:bg-emerald-900/60"
                        title="Dispatch"
                      >
                        <IconDispatch className="h-5 w-5" />
                      </button>
                    )}
                    {order.status === "DESPATCHED" && (
                      <>
                        <button
                          onClick={() => handleMoveToPending(order)}
                          className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-amber-100 text-amber-600 transition hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:hover:bg-amber-900/60"
                          title="Move to Pending"
                        >
                          <IconUndo className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() => handleDelete(order.id)}
                          className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-red-50 text-red-600 transition hover:bg-red-100 dark:bg-red-900/30 dark:text-red-300 dark:hover:bg-red-900/50"
                          title="Delete"
                        >
                          <IconTrash className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() => openWhatsAppForOrder(order)}
                          className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-green-100 text-green-600 transition hover:bg-green-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:hover:bg-emerald-900/60"
                          title="Share via WhatsApp"
                        >
                          <IconWhatsApp className="h-5 w-5" />
                        </button>
                      </>
                    )}
                    {order.status !== "DESPATCHED" && (
                      <button
                        onClick={() => handleDelete(order.id)}
                        className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-red-50 text-red-600 transition hover:bg-red-100 dark:bg-red-900/30 dark:text-red-300 dark:hover:bg-red-900/50"
                        title="Delete"
                      >
                        <IconTrash className="h-5 w-5" />
                      </button>
                    )}
                  </div>
                </BentoCard>
                );
              })
            )}
          </div>
        )}

        {status === "PENDING" && (
        <div className="fixed bottom-24 right-4 z-50 flex flex-col items-end gap-2 md:bottom-8 md:right-8">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (filteredOrders.length === 0) return;
                setShowFormatModal("print");
              }}
              disabled={filteredOrders.length === 0 || printing}
              className="flex min-h-[48px] min-w-[48px] items-center gap-2 rounded-xl border border-primary-500 bg-white px-4 py-3 text-primary-600 shadow-lg transition active:bg-primary-50 hover:bg-primary-50 disabled:opacity-50 dark:border-primary-400 dark:bg-slate-800 dark:text-primary-300 dark:hover:bg-slate-700"
              title="Print labels"
            >
              <IconPrint className="h-5 w-5 shrink-0 md:h-6 md:w-6" />
              <span className="text-sm font-medium">
                {printing ? "Printing…" : "Print"}
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                if (filteredOrders.length === 0 || downloadingPdf) return;
                if (pendingSelectionActive && ordersForPdfAndPrint.length === 0) return;
                setShowFormatModal("pdf");
              }}
              disabled={
                filteredOrders.length === 0 ||
                downloadingPdf ||
                (pendingSelectionActive && ordersForPdfAndPrint.length === 0)
              }
              className="flex min-h-[48px] min-w-[48px] items-center gap-2 rounded-xl bg-primary-500 px-4 py-3 text-white shadow-lg transition active:bg-primary-600 hover:bg-primary-600 disabled:opacity-50"
              title="Download all as PDF"
            >
              <IconPdf className="h-5 w-5 shrink-0 md:h-6 md:w-6" />
              <span className="text-sm font-medium">
                {downloadingPdf ? "Generating…" : "PDF"}
              </span>
            </button>
          </div>
          {pdfFallbackUrl && (
            <a
              href={pdfFallbackUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-bento bg-white/90 px-3 py-1 text-xs font-medium text-primary-700 shadow-sm dark:bg-slate-800/90 dark:text-primary-300"
            >
              If download didn&apos;t start, tap here and long‑press to save.
            </a>
          )}
        </div>
        )}
      </div>

      {/* ── Dispatch confirmation modal ── */}
      {dispatchOrder && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-4"
          onClick={(e) => { if (e.target === e.currentTarget && !dispatching) setDispatchOrder(null); }}
        >
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-xl dark:border-slate-600 dark:bg-slate-800">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">{t("Move to Dispatch")}</h2>

            <div className="mt-3 rounded-xl bg-gray-50 px-4 py-3 dark:bg-slate-700">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{t("Recipient (To)")}</p>
              <p className="mt-1 text-sm font-medium text-slate-800 dark:text-slate-200">
                {getAddressLine1(dispatchOrder.recipient_details)}
              </p>
            </div>

            <div className="mt-4">
              <label htmlFor="tracking-number" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                {t("Tracking / Consignment / LR Number (optional)")} <span className="text-slate-400">(optional)</span>
              </label>
              <div className="flex items-stretch overflow-hidden rounded-xl border border-gray-200 bg-white focus-within:border-primary-500 focus-within:ring-1 focus-within:ring-primary-500 dark:border-slate-600 dark:bg-slate-800">
                <input
                  id="tracking-number"
                  ref={trackingInputRef}
                  type="text"
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                  placeholder="e.g. PRO123456789"
                  className="min-w-0 flex-1 border-0 bg-transparent px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-0 dark:text-slate-100 dark:placeholder-slate-500"
                  onKeyDown={(e) => { if (e.key === "Enter" && !dispatching) confirmDispatch(); }}
                />
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
                      stream.getTracks().forEach((t) => t.stop());
                    } catch {
                      // Permission denied or no device; modal will show error
                    }
                    setScannerOpen(true);
                  }}
                  className="flex h-10 w-10 shrink-0 items-center justify-center border-l border-gray-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100"
                  title="Scan barcode or QR code"
                  aria-label="Scan LR number"
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M2 4h1v16H2V4z M4 4h1v16H4V4z M6 4h1v16H6V4z M8 4h1v16H8V4z M10 4h1v16H10V4z M12 4h1v16H12V4z M14 4h1v16H14V4z M16 4h1v16H16V4z M18 4h1v16H18V4z M20 4h1v16H20V4z M22 4h1v16H22V4z" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setDispatchOrder(null)}
                disabled={dispatching}
                className="flex-1 min-h-[44px] rounded-xl border border-gray-200 bg-white font-medium text-slate-700 hover:bg-gray-50 active:bg-gray-100 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
              >
                {t("Cancel")}
              </button>
              <button
                type="button"
                onClick={confirmDispatch}
                disabled={dispatching}
                className="flex-1 min-h-[44px] rounded-xl bg-emerald-600 font-semibold text-white shadow-sm hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50"
              >
                {dispatching ? "Dispatching…" : "Dispatch"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Format selection modal (A4 / POS) ── */}
      {showFormatModal && (
        <FormatSelectionModal
          title={showFormatModal === "pdf" ? "Download PDF" : "Print Labels"}
          onSelectA4={async () => {
            if (showFormatModal === "pdf") {
              setPdfFallbackUrl(null);
              setDownloadingPdf(true);
              try {
                await downloadOrdersPdf(ordersForPdfAndPrint);
              } catch (e) {
                const errorMsg =
                  e instanceof PdfAddressTooLongError
                    ? e.message
                    : e instanceof Error
                      ? e.message
                      : "Unknown error";
                alert(
                  e instanceof PdfAddressTooLongError
                    ? errorMsg
                    : `Failed to generate PDF: ${errorMsg}`
                );
              } finally {
                setDownloadingPdf(false);
              }
            } else {
              setPdfFallbackUrl(null);
              setDownloadingPdf(true);
              try {
                await downloadOrdersPdf(ordersForPdfAndPrint);
              } catch (e) {
                const errorMsg =
                  e instanceof PdfAddressTooLongError
                    ? e.message
                    : e instanceof Error
                      ? e.message
                      : "Unknown error";
                alert(
                  e instanceof PdfAddressTooLongError
                    ? errorMsg
                    : `Failed to generate PDF: ${errorMsg}`
                );
              } finally {
                setDownloadingPdf(false);
              }
            }
          }}
          onSelectPOS={async () => {
            if (showFormatModal === "pdf") {
              setPdfFallbackUrl(null);
              setDownloadingPdf(true);
              try {
                await downloadOrdersPosPdf(ordersForPdfAndPrint);
              } catch (e) {
                const errorMsg =
                  e instanceof PdfAddressTooLongError
                    ? e.message
                    : e instanceof Error
                      ? e.message
                      : "Unknown error";
                alert(
                  e instanceof PdfAddressTooLongError
                    ? errorMsg
                    : `Failed to generate POS PDF: ${errorMsg}`
                );
              } finally {
                setDownloadingPdf(false);
              }
            } else {
              setPrinting(true);
              try {
                await printOrdersPosPdf(ordersForPdfAndPrint);
              } catch (e) {
                const errorMsg =
                  e instanceof PdfAddressTooLongError
                    ? e.message
                    : e instanceof Error
                      ? e.message
                      : "Unknown error";
                alert(
                  e instanceof PdfAddressTooLongError
                    ? errorMsg
                    : `Printing failed: ${errorMsg}`
                );
              } finally {
                setPrinting(false);
              }
            }
          }}
          onClose={() => setShowFormatModal(null)}
        />
      )}

      <BarcodeScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onResult={(text) => setTrackingNumber(text)}
      />
    </ErrorBoundary>
  );
}
