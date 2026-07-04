import type { OrderStatus } from "./db-types";

export type OrderFilterState = {
  status: OrderStatus;
  fromDate: string;
  toDate: string;
  allOrders: boolean;
};

export const DEFAULT_ORDER_FILTERS: OrderFilterState = {
  status: "PENDING",
  fromDate: "",
  toDate: "",
  allOrders: true,
};

/** ISO yyyy-mm-dd from URL tab param. */
export function orderFiltersFromTabParam(tab: string | null): OrderFilterState {
  return {
    ...DEFAULT_ORDER_FILTERS,
    status: tab === "dispatched" ? "DESPATCHED" : "PENDING",
  };
}

const DD_MM_YYYY = /^(\d{2})-(\d{2})-(\d{4})$/;

export function formatIsoToDdMmYyyy(iso: string): string {
  const trimmed = iso.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return "";
  const [y, m, d] = trimmed.split("-");
  return `${d}-${m}-${y}`;
}

export function parseDdMmYyyyToIso(text: string): string | null {
  const raw = text.trim();
  if (!raw) return "";
  const m = raw.match(DD_MM_YYYY);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > 2100) {
    return null;
  }
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (
    dt.getUTCFullYear() !== year ||
    dt.getUTCMonth() !== month - 1 ||
    dt.getUTCDate() !== day
  ) {
    return null;
  }
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

export function validateOrderFilters(filters: OrderFilterState): string | null {
  if (filters.allOrders) return null;

  if (!filters.fromDate.trim() || !filters.toDate.trim()) {
    return "Select both From and To dates, or enable All Orders.";
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(filters.fromDate)) {
    return "Invalid From date.";
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(filters.toDate)) {
    return "Invalid To date.";
  }
  if (filters.fromDate > filters.toDate) {
    return "From date must be on or before To date.";
  }

  return null;
}

export function isOrderFilterActive(filters: OrderFilterState): boolean {
  return !filters.allOrders && Boolean(filters.fromDate && filters.toDate);
}

export function describeDateFilters(
  filters: OrderFilterState,
  labels: { allOrders: string }
): string {
  if (filters.allOrders) {
    return labels.allOrders;
  }

  const from = formatIsoToDdMmYyyy(filters.fromDate);
  const to = formatIsoToDdMmYyyy(filters.toDate);
  if (from && to) {
    return `${from} – ${to}`;
  }
  return labels.allOrders;
}

export function orderFiltersEqual(a: OrderFilterState, b: OrderFilterState): boolean {
  return (
    a.status === b.status &&
    a.fromDate === b.fromDate &&
    a.toDate === b.toDate &&
    a.allOrders === b.allOrders
  );
}
