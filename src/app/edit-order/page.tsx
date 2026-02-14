"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { BentoCard } from "@/components/ui/BentoCard";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { buildSuggestionsFromOrders, type OrderSuggestions } from "@/lib/order-suggestions";
import type { Order } from "@/lib/db-types";

const COURIERS = ["Professional", "DTDC", "Blue Dart", "Delhivery", "Other"];

function SuggestionChips({
  items,
  onSelect,
  label,
}: {
  items: string[];
  onSelect: (v: string) => void;
  label: string;
}) {
  if (items.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      <span className="text-xs text-slate-500">{label}</span>
      {items.map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => onSelect(item)}
          className="rounded-full bg-primary-100 px-2 py-0.5 text-xs font-medium text-primary-700 hover:bg-primary-200 dark:bg-primary-900/30 dark:text-primary-300 dark:hover:bg-primary-800/50"
        >
          {item.length > 40 ? `${item.slice(0, 40)}…` : item}
        </button>
      ))}
    </div>
  );
}

export default function EditOrderPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderId = searchParams.get("id");

  const [recipient, setRecipient] = useState("");
  const [sender, setSender] = useState("");
  const [bookedBy, setBookedBy] = useState("");
  const [bookedMobile, setBookedMobile] = useState("");
  const [courier, setCourier] = useState("Professional");
  const [bookingDate, setBookingDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetchLoading, setFetchLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<OrderSuggestions | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login/");
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!user || !orderId) {
      setFetchLoading(false);
      return;
    }
    supabase
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .eq("user_id", user.id)
      .single()
      .then(({ data, error: err }) => {
        setFetchLoading(false);
        if (err || !data) {
          setError("Order not found");
          return;
        }
        const o = data as Order;
        setRecipient(o.recipient_details ?? "");
        setSender(o.sender_details ?? "");
        setBookedBy(o.booked_by ?? "");
        setBookedMobile(o.booked_mobile_no ?? "");
        setCourier(o.courier_name ?? "Professional");
        setBookingDate(o.booking_date?.slice(0, 10) ?? "");
      });
  }, [user, orderId]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("orders")
      .select("recipient_details,sender_details,booked_by,booked_mobile_no,courier_name")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data }) => {
        if (data) setSuggestions(buildSuggestionsFromOrders(data as Order[]));
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
      const { error: err } = await supabase
        .from("orders")
        .update({
          recipient_details: recipient,
          sender_details: sender,
          booked_by: bookedBy,
          booked_mobile_no: bookedMobile,
          courier_name: courier,
          booking_date: bookingDate,
          updated_at: new Date().toISOString(),
        })
        .eq("id", orderId)
        .eq("user_id", user.id);
      if (err) throw err;
      router.replace("/orders/");
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
        <div className="flex items-center gap-4">
          <Link href="/orders/" className="min-h-touch min-w-touch flex items-center justify-center">
            ←
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            Edit Order
          </h1>
        </div>

        <BentoCard>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <p className="rounded-bento bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
                {error}
              </p>
            )}

            <div>
              <label className="mb-1 block text-sm font-medium">TO (Recipient)</label>
              <SuggestionChips
                items={suggestions?.recipients ?? []}
                label="Recent:"
                onSelect={setRecipient}
              />
              <textarea
                value={recipient}
                onChange={(e) => setRecipient(e.target.value.slice(0, 600))}
                maxLength={600}
                rows={3}
                placeholder="Recipient address and details"
                className="mt-1 w-full rounded-bento border px-4 py-2 dark:border-slate-600 dark:bg-slate-800"
                required
              />
              <p className="text-right text-xs text-slate-500">{recipient.length}/600</p>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">FROM (Sender)</label>
              <SuggestionChips
                items={senderSuggestions}
                label={recipient.trim() ? "Used with this recipient:" : "Recent:"}
                onSelect={setSender}
              />
              <textarea
                value={sender}
                onChange={(e) => setSender(e.target.value.slice(0, 600))}
                maxLength={600}
                rows={3}
                placeholder="Sender address and details"
                className="mt-1 w-full rounded-bento border px-4 py-2 dark:border-slate-600 dark:bg-slate-800"
                required
              />
              <p className="text-right text-xs text-slate-500">{sender.length}/600</p>
            </div>

            <details className="rounded-bento border p-4">
              <summary className="cursor-pointer font-medium">Product Images</summary>
              <p className="mt-2 text-sm text-slate-500">Add Product Images | View order Images (coming soon)</p>
            </details>

            <div>
              <label className="mb-1 block text-sm font-medium">Booked By</label>
              <input
                type="text"
                list="booked-by-list-edit"
                value={bookedBy}
                onChange={(e) => setBookedBy(e.target.value)}
                placeholder="Name (tap for suggestions)"
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
                placeholder="Mobile number (tap for suggestions)"
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
