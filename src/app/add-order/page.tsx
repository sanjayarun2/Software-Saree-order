"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { BentoCard } from "@/components/ui/BentoCard";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import type { OrderInsert } from "@/lib/db-types";

const COURIERS = ["Professional", "DTDC", "Blue Dart", "Delhivery", "Other"];

export default function AddOrderPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [recipient, setRecipient] = useState("");
  const [sender, setSender] = useState("");
  const [bookedBy, setBookedBy] = useState("");
  const [bookedMobile, setBookedMobile] = useState("");
  const [courier, setCourier] = useState("Professional");
  const [bookingDate, setBookingDate] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login/");
  }, [user, authLoading, router]);

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
      };
      const { error: err } = await supabase.from("orders").insert(insert);
      if (err) throw err;
      router.replace("/orders/");
    } catch (e) {
      setError((e as Error).message || "Save failed");
    } finally {
      setLoading(false);
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
      <div className="mx-auto max-w-2xl space-y-6 p-4 md:p-6">
        <div className="flex items-center gap-4">
          <Link href="/orders/" className="min-h-touch min-w-touch flex items-center justify-center">
            ←
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            Add New Order
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
              <textarea
                value={recipient}
                onChange={(e) => setRecipient(e.target.value.slice(0, 600))}
                maxLength={600}
                rows={3}
                placeholder="Recipient details"
                className="w-full rounded-bento border px-4 py-2"
                required
              />
              <p className="text-right text-xs text-slate-500">{recipient.length}/600</p>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">FROM (Sender)</label>
              <textarea
                value={sender}
                onChange={(e) => setSender(e.target.value.slice(0, 600))}
                maxLength={600}
                rows={3}
                placeholder="Sender details"
                className="w-full rounded-bento border px-4 py-2"
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
                value={bookedBy}
                onChange={(e) => setBookedBy(e.target.value)}
                placeholder="Name"
                className="w-full rounded-bento border px-4 py-2"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Booked Mobile No</label>
              <input
                type="tel"
                value={bookedMobile}
                onChange={(e) => setBookedMobile(e.target.value)}
                placeholder="Mobile number"
                className="w-full rounded-bento border px-4 py-2"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Courier Name</label>
              <select
                value={courier}
                onChange={(e) => setCourier(e.target.value)}
                className="w-full rounded-bento border px-4 py-2"
              >
                {COURIERS.map((c) => (
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
                className="w-full rounded-bento border px-4 py-2"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-touch rounded-bento bg-primary-500 font-semibold text-white hover:bg-primary-600 disabled:opacity-50"
            >
              {loading ? "Saving…" : "Save"}
            </button>
          </form>
        </BentoCard>
      </div>
    </ErrorBoundary>
  );
}
