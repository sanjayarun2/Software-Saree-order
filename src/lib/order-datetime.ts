/** Order date/time display in IST (Asia/Kolkata), 12-hour clock (not 24h/railway). */

export const ORDER_TZ_IST = "Asia/Kolkata";

function parseOrderInstant(iso: string): Date | null {
  const s = String(iso ?? "").trim();
  if (!s) return null;
  // Date-only (YYYY-MM-DD): noon IST so the calendar day stays stable.
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(`${s}T12:00:00+05:30`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function hasClockTime(iso: string): boolean {
  const s = String(iso ?? "").trim();
  return s.length > 10 && !/^\d{4}-\d{2}-\d{2}$/.test(s);
}

/** e.g. `13 Jul 26` */
export function formatOrderDateIst(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = parseOrderInstant(iso);
  if (!d) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
    timeZone: ORDER_TZ_IST,
  });
}

/**
 * Date + normal 12h time in IST when a timestamp is available.
 * e.g. `13 Jul 26, 11:09 pm`
 * Falls back to date-only when value is a bare calendar date.
 */
export function formatOrderDateTimeIst(iso: string | null | undefined): string {
  if (!iso) return "—";
  const raw = String(iso).trim();
  const d = parseOrderInstant(raw);
  if (!d) return "—";

  if (!hasClockTime(raw)) {
    return formatOrderDateIst(raw);
  }

  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: ORDER_TZ_IST,
  });
}

/** Prefer received instant for pending; despatched instant for dispatched. */
export function orderListTimestamp(order: {
  status?: string | null;
  created_at?: string | null;
  booking_date?: string | null;
  despatched_at?: string | null;
  despatch_date?: string | null;
  updated_at?: string | null;
}): string | null {
  if (order.status === "DESPATCHED") {
    return (
      order.despatched_at?.trim() ||
      order.updated_at?.trim() ||
      order.despatch_date?.trim() ||
      null
    );
  }
  return order.created_at?.trim() || order.booking_date?.trim() || null;
}
