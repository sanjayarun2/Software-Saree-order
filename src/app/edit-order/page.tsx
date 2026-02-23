"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { BentoCard } from "@/components/ui/BentoCard";
import { InlineAutocompleteTextarea } from "@/components/ui/InlineAutocompleteTextarea";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { buildSuggestionsFromOrders, type OrderSuggestions } from "@/lib/order-suggestions";
import { usePersistentField } from "@/lib/usePersistentField";
import {
  getOrderById as svcGetOrderById,
  updateOrder as svcUpdateOrder,
  getSuggestions as svcGetSuggestions,
} from "@/lib/order-service";
import type { Order } from "@/lib/db-types";

const COURIERS = ["Professional", "DTDC", "Blue Dart", "Delhivery", "Other"];

function EditOrderContent() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderId = searchParams.get("id");

  const [recipient, setRecipient] = useState("");
  const [sender, setSender] = useState("");
  const [bookedBy, setBookedBy] = useState("");
  const [bookedMobile, setBookedMobile] = useState("");
  const [courier, setCourier] = useState("Professional");
  const [quantity, setQuantity] = useState<number | "">("");
  const [bookingDate, setBookingDate] = useState("");
  const [orderStatus, setOrderStatus] = useState<"PENDING" | "DESPATCHED">("PENDING");
  const [trackingNumber, setTrackingNumber] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [fetchLoading, setFetchLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<OrderSuggestions | null>(null);
  // Persist edit fields keyed by order id so text is not lost when switching apps/tabs
  const recipientField = usePersistentField(orderId ? `edit-order:${orderId}:recipient` : "edit-order:recipient", "");
  const senderField = usePersistentField(orderId ? `edit-order:${orderId}:sender` : "edit-order:sender", "");

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login/");
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!user || !orderId) {
      setFetchLoading(false);
      return;
    }
    const applyOrder = (o: Order | null) => {
      setFetchLoading(false);
      if (!o) {
        setError("Order not found");
        return;
      }
      const recipientFromDb = o.recipient_details ?? "";
      const senderFromDb = o.sender_details ?? "";
      setRecipient(recipientField.value || recipientFromDb);
      setSender(senderField.value || senderFromDb);
      setBookedBy(o.booked_by ?? "");
      setBookedMobile(o.booked_mobile_no ?? "");
      setCourier(o.courier_name ?? "Professional");
      setQuantity(o.quantity != null ? Number(o.quantity) || 1 : 1);
      setBookingDate(o.booking_date?.slice(0, 10) ?? "");
      setOrderStatus(o.status ?? "PENDING");
      setTrackingNumber((o.tracking_number ?? "").trim());
    };
    svcGetOrderById(user.id, orderId, (fresh) => {
      if (fresh) applyOrder(fresh);
    }).then(applyOrder);
  }, [user, orderId, recipientField.value, senderField.value]);

  useEffect(() => {
    if (!user) return;
    svcGetSuggestions(user.id, (fresh) => {
      setSuggestions(buildSuggestionsFromOrders(fresh as Order[]));
    }).then((cached) => {
      if (cached.length) setSuggestions(buildSuggestionsFromOrders(cached as Order[]));
    });
  }, [user]);

  const courierOptions = useMemo(() => {
    if (!suggestions?.couriers.length) return COURIERS;
    const recent = suggestions.couriers.filter((c) => COURIERS.includes(c));
    const rest = COURIERS.filter((c) => !recent.includes(c));
    return [...recent, ...rest];
  }, [suggestions]);

  const senderSuggestions = useMemo(() => {
    if (!suggestions) return [];
    const trimmed = recipient.trim();
    if (trimmed && suggestions.recipientSenderPairs.has(trimmed)) {
      return suggestions.recipientSenderPairs.get(trimmed) ?? suggestions.senders;
    }
    return suggestions.senders;
  }, [suggestions, recipient]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !orderId) return;
    setError(null);
    setLoading(true);
    try {
      await svcUpdateOrder(user.id, orderId, {
        recipient_details: recipient,
        sender_details: sender,
        booked_by: bookedBy,
        booked_mobile_no: bookedMobile,
        courier_name: courier,
        booking_date: bookingDate,
        quantity: quantity === "" ? null : Number(quantity),
        ...(orderStatus === "DESPATCHED" && { tracking_number: trackingNumber.trim() || null }),
      });
      // Clear cached draft on successful save
      recipientField.clear();
      senderField.clear();
      router.replace(orderStatus === "DESPATCHED" ? "/orders/?tab=dispatched" : "/orders/?tab=pending");
    } catch (e) {
      setError((e as Error).message || "Update failed");
    } finally {
      setLoading(false);
    }
  };

  if (authLoading || fetchLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  if (!orderId || error === "Order not found") {
    return (
      <div className="mx-auto max-w-2xl space-y-4 p-6">
        <p className="text-slate-600 dark:text-slate-400">Order not found.</p>
        <Link href="/orders/" className="text-primary-600 hover:underline">
          ← Back to Orders
        </Link>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="mx-auto max-w-2xl space-y-6 p-4 md:p-6">
        <header className="relative flex min-h-[44px] items-center justify-center pb-4">
          <Link
            href={orderStatus === "DESPATCHED" ? "/orders/?tab=dispatched" : "/orders/?tab=pending"}
            className="absolute left-0 flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-slate-700 hover:bg-gray-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            aria-label="Back to Orders"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            Edit Order
          </h1>
        </header>

        <BentoCard>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <p className="rounded-bento bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
                {error}
              </p>
            )}

            <div>
              <label className="mb-1 block text-sm font-medium">TO (Customer)</label>
              <InlineAutocompleteTextarea
                value={recipient}
                onChange={(v) => {
                  setRecipient(v);
                  recipientField.setValue(v);
                }}
                suggestions={suggestions?.recipients ?? []}
                placeholder="Recipient address and details"
                maxLength={800}
                rows={3}
                className="mt-1"
              />
              <p className="text-right text-xs text-slate-500 dark:text-slate-400">{recipient.length}/800</p>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">FROM (Sender)</label>
              <InlineAutocompleteTextarea
                value={sender}
                onChange={(v) => {
                  setSender(v);
                  senderField.setValue(v);
                }}
                suggestions={senderSuggestions}
                placeholder="Sender address and details"
                maxLength={800}
                rows={3}
                className="mt-1"
              />
              <p className="text-right text-xs text-slate-500 dark:text-slate-400">{sender.length}/800</p>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Qty (optional)</label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setQuantity((q) => (q === "" ? 0 : Math.max(0, q - 1)))}
                  className="flex h-10 w-10 items-center justify-center rounded-lg border text-gray-600 hover:bg-gray-50"
                >
                  −
                </button>
                <input
                  type="number"
                  min={0}
                  value={quantity}
                  onChange={(e) => {
                    const v = e.target.value;
                    setQuantity(v === "" ? "" : Math.max(0, parseInt(v, 10) || 0));
                  }}
                  className="h-10 w-16 rounded-lg border px-2 text-center [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <button
                  type="button"
                  onClick={() => setQuantity((q) => (q === "" ? 1 : q + 1))}
                  className="flex h-10 w-10 items-center justify-center rounded-lg border text-gray-600 hover:bg-gray-50"
                >
                  +
                </button>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Booked By</label>
              <input
                type="text"
                list="booked-by-list-edit"
                value={bookedBy}
                onChange={(e) => setBookedBy(e.target.value)}
                placeholder="Name"
                className="w-full rounded-bento border px-4 py-2 dark:border-slate-600 dark:bg-slate-800"
              />
              <datalist id="booked-by-list-edit">
                {(suggestions?.bookedBy ?? []).map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Booked Mobile No</label>
              <input
                type="tel"
                list="mobile-list-edit"
                value={bookedMobile}
                onChange={(e) => setBookedMobile(e.target.value)}
                placeholder="Mobile number"
                className="w-full rounded-bento border px-4 py-2 dark:border-slate-600 dark:bg-slate-800"
              />
              <datalist id="mobile-list-edit">
                {(suggestions?.bookedMobile ?? []).map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Courier Name</label>
              <select
                value={courier}
                onChange={(e) => setCourier(e.target.value)}
                className="w-full rounded-bento border px-4 py-2 dark:border-slate-600 dark:bg-slate-800"
              >
                {courierOptions.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Booking date</label>
              <input
                type="date"
                value={bookingDate}
                onChange={(e) => setBookingDate(e.target.value)}
                className="w-full rounded-bento border px-4 py-2 dark:border-slate-600 dark:bg-slate-800"
                required
              />
            </div>

            {orderStatus === "DESPATCHED" && (
              <div>
                <label className="mb-1 block text-sm font-medium">Consignment number</label>
                <input
                  type="text"
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                  className="w-full rounded-bento border px-4 py-2 dark:border-slate-600 dark:bg-slate-800"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-touch rounded-bento bg-primary-500 font-semibold text-white hover:bg-primary-600 disabled:opacity-50"
            >
              {loading ? "Updating…" : "Update Order"}
            </button>
          </form>
        </BentoCard>
      </div>
    </ErrorBoundary>
  );
}

export default function EditOrderPage() {
  return (
    <React.Suspense fallback={<div className="flex min-h-[60vh] items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" /></div>}>
      <EditOrderContent />
    </React.Suspense>
  );
}
