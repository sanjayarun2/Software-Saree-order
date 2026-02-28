"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { BentoCard } from "@/components/ui/BentoCard";
import { InlineAutocompleteTextarea } from "@/components/ui/InlineAutocompleteTextarea";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useToast } from "@/lib/toast-context";
import { buildSuggestionsFromOrders, type OrderSuggestions } from "@/lib/order-suggestions";
import { usePersistentField } from "@/lib/usePersistentField";
import { createOrder as svcCreateOrder, getSuggestions as svcGetSuggestions } from "@/lib/order-service";
import type { OrderInsert, Order } from "@/lib/db-types";

const COURIERS = ["Professional", "DTDC", "Blue Dart", "Delhivery", "Other"];

export default function AddOrderPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  // Persist important text fields so they survive app/tab switches
  const recipientField = usePersistentField("add-order:recipient", "");
  const senderField = usePersistentField("add-order:sender", "");
  const bookedByField = usePersistentField("add-order:bookedBy", "");
  const bookedMobileField = usePersistentField("add-order:bookedMobile", "");
  const [recipient, setRecipient] = useState("");
  const [sender, setSender] = useState("");
  const [bookedBy, setBookedBy] = useState("");
  const [bookedMobile, setBookedMobile] = useState("");
  const [courier, setCourier] = useState("Professional");
  const [quantity, setQuantity] = useState<number | "">(1);
  const [bookingDate, setBookingDate] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<OrderSuggestions | null>(null);
  const defaultSenderSet = React.useRef(false);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login/");
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!user) return;
    svcGetSuggestions(user.id, (fresh) => {
      const s = buildSuggestionsFromOrders(fresh as Order[]);
      setSuggestions(s);
      if (!defaultSenderSet.current && s.senders.length > 0) {
        defaultSenderSet.current = true;
        setSender(s.senders[0]);
      }
    }).then((cached) => {
      if (cached.length) {
        const s = buildSuggestionsFromOrders(cached as Order[]);
        setSuggestions(s);
        if (!defaultSenderSet.current && s.senders.length > 0) {
          defaultSenderSet.current = true;
          setSender(s.senders[0]);
        }
      }
    });
  }, [user]);

  // Sync local persistent values into state after hooks are initialised
  useEffect(() => {
    setRecipient(recipientField.value);
  }, [recipientField.value]);

  useEffect(() => {
    setSender(senderField.value);
  }, [senderField.value]);

  useEffect(() => {
    setBookedBy(bookedByField.value);
  }, [bookedByField.value]);

  useEffect(() => {
    setBookedMobile(bookedMobileField.value);
  }, [bookedMobileField.value]);

  // Recently used couriers first, then the rest of COURIERS in fixed order.
  const courierOptions = useMemo(() => {
    const recent = (suggestions?.couriers ?? []).filter((c) => COURIERS.includes(c));
    const rest = COURIERS.filter((c) => !recent.includes(c));
    return [...recent, ...rest];
  }, [suggestions?.couriers]);

  const senderSuggestions = useMemo(() => {
    if (!suggestions) return [];
    const trimmed = recipient.trim();
    if (trimmed && suggestions.recipientSenderPairs.has(trimmed)) {
      const paired = suggestions.recipientSenderPairs.get(trimmed) ?? [];
      const rest = suggestions.senders.filter((s) => !paired.includes(s));
      return [...paired, ...rest];
    }
    return suggestions.senders;
  }, [suggestions, recipient]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setError(null);
    setLoading(true);
    try {
      const insert: OrderInsert = {
        recipient_details: recipient,
        sender_details: sender,
        booked_by: bookedBy,
        booked_mobile_no: bookedMobile,
        courier_name: courier,
        booking_date: bookingDate,
        status: "PENDING",
        user_id: user.id,
        quantity: quantity === "" ? 1 : Number(quantity),
      };
      await svcCreateOrder(user.id, insert);
      toast("Order saved");
      // Clear cached draft on successful save
      recipientField.clear();
      senderField.clear();
      bookedByField.clear();
      bookedMobileField.clear();
      router.replace("/orders/");
    } catch (e) {
      setError((e as Error).message || "Save failed");
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-8 p-6 md:p-8">
        <div className="h-8 w-64 animate-pulse rounded-[16px] bg-gray-200" />
        <div className="space-y-6 rounded-[16px] border border-gray-100 bg-white p-8">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="space-y-2">
              <div className="h-5 w-32 animate-pulse rounded bg-gray-200" />
              <div className="h-14 w-full animate-pulse rounded-[16px] bg-gray-100" />
            </div>
          ))}
          <div className="h-14 w-full animate-pulse rounded-[16px] bg-gray-200" />
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="mx-auto max-w-2xl space-y-6 px-4 py-4 lg:space-y-8 lg:px-10 lg:py-8">
        <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-gray-100 lg:text-2xl">
          Add New Order
        </h1>

        <BentoCard className="p-4 md:p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <p className="rounded-[16px] border border-red-100 bg-red-50 p-4 text-base text-red-700">
                {error}
              </p>
            )}

            <div>
              <label className="mb-1 block text-base font-medium text-gray-900 dark:text-gray-100">TO (customer address)</label>
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
                className="mt-1 min-h-[44px] rounded-xl border-gray-200 bg-white text-gray-900 dark:bg-slate-800 dark:text-gray-100 md:min-h-[50px] md:rounded-[16px]"
                id="recipient"
              />
              <p className="mt-1 text-right text-base text-gray-500 dark:text-gray-400">{recipient.length}/800</p>
            </div>

            <div>
              <label className="mb-1 block text-base font-medium text-gray-900 dark:text-gray-100">FROM (our address)</label>
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
                className="mt-1 min-h-[44px] rounded-xl border-gray-200 bg-white text-gray-900 dark:bg-slate-800 dark:text-gray-100 md:min-h-[50px] md:rounded-[16px]"
                id="sender"
              />
              <p className="mt-1 text-right text-base text-gray-500 dark:text-gray-400">{sender.length}/800</p>
            </div>

            <div>
              <label className="mb-1 block text-base font-medium text-gray-900 dark:text-gray-100">Product Details</label>
              <div className="flex items-center gap-2">
                <label className="text-base text-gray-600 dark:text-gray-400">Qty</label>
                <div className="flex items-center rounded-[16px] border border-gray-200 bg-white dark:border-slate-600 dark:bg-slate-800">
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => (q === "" ? 0 : Math.max(0, q - 1)))}
                    className="flex h-10 w-10 items-center justify-center text-gray-600 hover:bg-gray-50"
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
                    className="h-10 w-16 border-0 bg-transparent text-center text-base text-gray-900 dark:text-gray-100 [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  />
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => (q === "" ? 1 : q + 1))}
                    className="flex h-10 w-10 items-center justify-center text-gray-600 hover:bg-gray-50"
                  >
                    +
                  </button>
                </div>
                <span className="text-base text-gray-500 dark:text-gray-400">(optional)</span>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-base font-medium text-gray-900 dark:text-gray-100">Booked By</label>
              <input
                type="text"
                list="booked-by-list"
                value={bookedBy}
                onChange={(e) => {
                  setBookedBy(e.target.value);
                  bookedByField.setValue(e.target.value);
                }}
                placeholder="Name"
                className="min-h-[44px] w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-base text-gray-900 dark:border-slate-600 dark:bg-slate-800 dark:text-gray-100 md:min-h-[50px] md:rounded-[16px] md:px-4 md:py-3"
              />
              <datalist id="booked-by-list">
                {(suggestions?.bookedBy ?? []).map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="mb-1 block text-base font-medium text-gray-900 dark:text-gray-100">Booked Mobile No</label>
              <input
                type="tel"
                list="mobile-list"
                value={bookedMobile}
                onChange={(e) => {
                  setBookedMobile(e.target.value);
                  bookedMobileField.setValue(e.target.value);
                }}
                placeholder="Mobile number"
                className="min-h-[44px] w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-base text-gray-900 dark:border-slate-600 dark:bg-slate-800 dark:text-gray-100 md:min-h-[50px] md:rounded-[16px] md:px-4 md:py-3"
              />
              <datalist id="mobile-list">
                {(suggestions?.bookedMobile ?? []).map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="mb-1 block text-base font-medium text-gray-900 dark:text-gray-100">Courier Name</label>
              <select
                value={courier}
                onChange={(e) => setCourier(e.target.value)}
                className="min-h-[44px] w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-base text-gray-900 dark:border-slate-600 dark:bg-slate-800 dark:text-gray-100 md:min-h-[50px] md:rounded-[16px] md:px-4 md:py-3"
              >
                {courierOptions.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-base font-medium text-gray-900 dark:text-gray-100">Booking date</label>
              <input
                type="date"
                value={bookingDate}
                onChange={(e) => setBookingDate(e.target.value)}
                className="min-h-[44px] w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-base text-gray-900 dark:border-slate-600 dark:bg-slate-800 dark:text-gray-100 md:min-h-[50px] md:rounded-[16px] md:px-4 md:py-3"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="min-h-[44px] w-full rounded-xl bg-primary-500 px-4 py-3 text-base font-semibold text-white hover:bg-primary-600 disabled:opacity-50 md:min-h-[50px] md:rounded-[16px]"
            >
              {loading ? "Saving…" : "Save"}
            </button>
          </form>
        </BentoCard>
      </div>
    </ErrorBoundary>
  );
}
