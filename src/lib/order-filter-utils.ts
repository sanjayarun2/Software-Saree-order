import type { OrderStatus } from "./db-types";

/** Relative presets stay correct across midnight; range/all are absolute. */
export type OrderDatePreset =
  | "today"
  | "yesterday"
  | "this_week"
  | "this_month"
  | "range"
  | "all";

export type OrderFilterState = {
  status: OrderStatus;
  fromDate: string;
  toDate: string;
  allOrders: boolean;
  datePreset: OrderDatePreset;
};

/** Local calendar date as YYYY-MM-DD (not UTC). */
export function localDateIso(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Shift a YYYY-MM-DD local calendar day by `days` (can be negative). */
export function shiftLocalDateIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return localDateIso(dt);
}

/** Monday-start week containing today → today. */
export function thisWeekRangeIso(now: Date = new Date()): { from: string; to: string } {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const day = today.getDay();
  const monOffset = day === 0 ? -6 : 1 - day;
  const from = new Date(today);
  from.setDate(today.getDate() + monOffset);
  return { from: localDateIso(from), to: localDateIso(today) };
}

/** First day of current month → today. */
export function thisMonthRangeIso(now: Date = new Date()): { from: string; to: string } {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const from = new Date(today.getFullYear(), today.getMonth(), 1);
  return { from: localDateIso(from), to: localDateIso(today) };
}

export function createDayOrderFilters(
  status: OrderStatus,
  dayIso: string,
  datePreset: OrderDatePreset = "range"
): OrderFilterState {
  return {
    status,
    fromDate: dayIso,
    toDate: dayIso,
    allOrders: false,
    datePreset,
  };
}

export function createTodayOrderFilters(status: OrderStatus = "PENDING"): OrderFilterState {
  return createDayOrderFilters(status, localDateIso(), "today");
}

export function createYesterdayOrderFilters(
  status: OrderStatus = "PENDING"
): OrderFilterState {
  return createDayOrderFilters(status, shiftLocalDateIso(localDateIso(), -1), "yesterday");
}

export function createThisWeekOrderFilters(status: OrderStatus = "PENDING"): OrderFilterState {
  const { from, to } = thisWeekRangeIso();
  return {
    status,
    fromDate: from,
    toDate: to,
    allOrders: false,
    datePreset: "this_week",
  };
}

export function createThisMonthOrderFilters(status: OrderStatus = "PENDING"): OrderFilterState {
  const { from, to } = thisMonthRangeIso();
  return {
    status,
    fromDate: from,
    toDate: to,
    allOrders: false,
    datePreset: "this_month",
  };
}

export function createAllOrdersFilters(status: OrderStatus = "PENDING"): OrderFilterState {
  return {
    status,
    fromDate: "",
    toDate: "",
    allOrders: true,
    datePreset: "all",
  };
}

export function createRangeOrderFilters(
  status: OrderStatus,
  fromDate: string,
  toDate: string
): OrderFilterState {
  return {
    status,
    fromDate,
    toDate,
    allOrders: false,
    datePreset: "range",
  };
}

/** Resolve relative presets to the current calendar bounds before fetch/display. */
export function resolveOrderFilters(filters: OrderFilterState): OrderFilterState {
  switch (filters.datePreset) {
    case "today":
      return createTodayOrderFilters(filters.status);
    case "yesterday":
      return createYesterdayOrderFilters(filters.status);
    case "this_week":
      return createThisWeekOrderFilters(filters.status);
    case "this_month":
      return createThisMonthOrderFilters(filters.status);
    case "all":
      return createAllOrdersFilters(filters.status);
    default:
      if (filters.allOrders) return createAllOrdersFilters(filters.status);
      return {
        ...filters,
        allOrders: false,
        datePreset: "range",
      };
  }
}

/** Default: today only — never load the full history on open. */
export const DEFAULT_ORDER_FILTERS: OrderFilterState = createTodayOrderFilters("PENDING");

/** Always defaults date range to today. */
export function orderFiltersFromTabParam(tab: string | null): OrderFilterState {
  return createTodayOrderFilters(tab === "dispatched" ? "DESPATCHED" : "PENDING");
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
  const resolved = resolveOrderFilters(filters);
  if (resolved.allOrders) return null;

  if (!resolved.fromDate.trim() || !resolved.toDate.trim()) {
    return "Select both From and To dates, or enable All Orders.";
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(resolved.fromDate)) {
    return "Invalid From date.";
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(resolved.toDate)) {
    return "Invalid To date.";
  }
  if (resolved.fromDate > resolved.toDate) {
    return "From date must be on or before To date.";
  }

  return null;
}

/** True when a bounded date range is applied (not All Orders). */
export function isOrderFilterActive(filters: OrderFilterState): boolean {
  const resolved = resolveOrderFilters(filters);
  return !resolved.allOrders && Boolean(resolved.fromDate && resolved.toDate);
}

export function isSingleDayFilter(filters: OrderFilterState): boolean {
  const resolved = resolveOrderFilters(filters);
  return (
    !resolved.allOrders &&
    Boolean(resolved.fromDate && resolved.toDate) &&
    resolved.fromDate === resolved.toDate
  );
}

export function isTodayFilter(filters: OrderFilterState): boolean {
  return resolveOrderFilters(filters).datePreset === "today";
}

export function isYesterdayFilter(filters: OrderFilterState): boolean {
  return resolveOrderFilters(filters).datePreset === "yesterday";
}

export function describeDateFilters(
  filters: OrderFilterState,
  labels: {
    allOrders: string;
    today?: string;
    yesterday?: string;
    thisWeek?: string;
    thisMonth?: string;
  }
): string {
  const resolved = resolveOrderFilters(filters);
  if (resolved.allOrders || resolved.datePreset === "all") {
    return labels.allOrders;
  }

  if (labels.today && resolved.datePreset === "today") return labels.today;
  if (labels.yesterday && resolved.datePreset === "yesterday") return labels.yesterday;
  if (labels.thisWeek && resolved.datePreset === "this_week") return labels.thisWeek;
  if (labels.thisMonth && resolved.datePreset === "this_month") return labels.thisMonth;

  const from = formatIsoToDdMmYyyy(resolved.fromDate);
  const to = formatIsoToDdMmYyyy(resolved.toDate);
  if (from && to) {
    return from === to ? from : `${from} – ${to}`;
  }
  return labels.allOrders;
}

/** Date fields used when counting pending for the same window as the list. */
export function dateScopeFromFilters(filters: OrderFilterState): {
  fromDate?: string;
  toDate?: string;
  allOrders: boolean;
} {
  const resolved = resolveOrderFilters(filters);
  if (resolved.allOrders) {
    return { allOrders: true };
  }
  return {
    allOrders: false,
    fromDate: resolved.fromDate,
    toDate: resolved.toDate,
  };
}

export function orderFiltersEqual(a: OrderFilterState, b: OrderFilterState): boolean {
  const ra = resolveOrderFilters(a);
  const rb = resolveOrderFilters(b);
  return (
    ra.status === rb.status &&
    ra.fromDate === rb.fromDate &&
    ra.toDate === rb.toDate &&
    ra.allOrders === rb.allOrders &&
    ra.datePreset === rb.datePreset
  );
}

/** Quick-select periods shown in the filter menu (Custom opens date fields). */
export const ORDER_PERIOD_MENU: {
  preset: Exclude<OrderDatePreset, "range">;
  labelKey: string;
}[] = [
  { preset: "today", labelKey: "Today" },
  { preset: "yesterday", labelKey: "Yesterday" },
  { preset: "this_week", labelKey: "This Week" },
  { preset: "this_month", labelKey: "This Month" },
  { preset: "all", labelKey: "All" },
];

export function createFiltersForPreset(
  status: OrderStatus,
  preset: OrderDatePreset
): OrderFilterState {
  switch (preset) {
    case "today":
      return createTodayOrderFilters(status);
    case "yesterday":
      return createYesterdayOrderFilters(status);
    case "this_week":
      return createThisWeekOrderFilters(status);
    case "this_month":
      return createThisMonthOrderFilters(status);
    case "all":
      return createAllOrdersFilters(status);
    default:
      return createTodayOrderFilters(status);
  }
}
