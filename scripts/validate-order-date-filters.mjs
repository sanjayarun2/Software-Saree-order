/**
 * Validate order date-filter period menu presets.
 * Run: node scripts/validate-order-date-filters.mjs
 */

import assert from "node:assert/strict";

function localDateIso(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function shiftLocalDateIso(iso, days) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return localDateIso(dt);
}

function thisWeekRangeIso(now = new Date()) {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const day = today.getDay();
  const monOffset = day === 0 ? -6 : 1 - day;
  const from = new Date(today);
  from.setDate(today.getDate() + monOffset);
  return { from: localDateIso(from), to: localDateIso(today) };
}

function thisMonthRangeIso(now = new Date()) {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const from = new Date(today.getFullYear(), today.getMonth(), 1);
  return { from: localDateIso(from), to: localDateIso(today) };
}

function createTodayOrderFilters(status = "PENDING") {
  const day = localDateIso();
  return { status, fromDate: day, toDate: day, allOrders: false, datePreset: "today" };
}

function createYesterdayOrderFilters(status = "PENDING") {
  const day = shiftLocalDateIso(localDateIso(), -1);
  return { status, fromDate: day, toDate: day, allOrders: false, datePreset: "yesterday" };
}

function createThisWeekOrderFilters(status = "PENDING") {
  const { from, to } = thisWeekRangeIso();
  return { status, fromDate: from, toDate: to, allOrders: false, datePreset: "this_week" };
}

function createThisMonthOrderFilters(status = "PENDING") {
  const { from, to } = thisMonthRangeIso();
  return { status, fromDate: from, toDate: to, allOrders: false, datePreset: "this_month" };
}

function createAllOrdersFilters(status = "PENDING") {
  return { status, fromDate: "", toDate: "", allOrders: true, datePreset: "all" };
}

function resolveOrderFilters(filters) {
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
      return { ...filters, allOrders: false, datePreset: "range" };
  }
}

function createFiltersForPreset(status, preset) {
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

let failed = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`OK  ${name}`);
  } catch (e) {
    failed += 1;
    console.error(`FAIL ${name}:`, e.message);
  }
}

const today = localDateIso();
const yesterday = shiftLocalDateIso(today, -1);
const week = thisWeekRangeIso();
const month = thisMonthRangeIso();

check("default is today", () => {
  const f = createTodayOrderFilters();
  assert.equal(f.datePreset, "today");
  assert.equal(f.fromDate, today);
  assert.equal(f.allOrders, false);
});

check("yesterday preset", () => {
  const f = createYesterdayOrderFilters();
  assert.equal(f.fromDate, yesterday);
  assert.equal(f.datePreset, "yesterday");
});

check("this week is Mon→today", () => {
  const f = createThisWeekOrderFilters();
  assert.equal(f.fromDate, week.from);
  assert.equal(f.toDate, week.to);
  assert.ok(f.fromDate <= f.toDate);
});

check("this month is 1st→today", () => {
  const f = createThisMonthOrderFilters();
  assert.equal(f.fromDate, month.from);
  assert.equal(f.toDate, month.to);
});

check("all orders unbounded", () => {
  const f = createAllOrdersFilters();
  assert.equal(f.allOrders, true);
  assert.equal(f.datePreset, "all");
});

check("menu presets map correctly", () => {
  for (const preset of ["today", "yesterday", "this_week", "this_month", "all"]) {
    const f = createFiltersForPreset("PENDING", preset);
    assert.equal(resolveOrderFilters(f).datePreset, preset);
  }
});

check("stale this_week resolves to live bounds", () => {
  const stale = {
    status: "PENDING",
    fromDate: "2000-01-01",
    toDate: "2000-01-02",
    allOrders: false,
    datePreset: "this_week",
  };
  const resolved = resolveOrderFilters(stale);
  assert.equal(resolved.fromDate, week.from);
  assert.equal(resolved.toDate, week.to);
});

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nAll order period-menu filter checks passed.");
