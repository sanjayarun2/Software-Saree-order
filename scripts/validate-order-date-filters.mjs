/**
 * Validate order date-filter helpers (default today, yesterday, no all-history default).
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

function createDayOrderFilters(status, dayIso, datePreset = "range") {
  return { status, fromDate: dayIso, toDate: dayIso, allOrders: false, datePreset };
}

function createTodayOrderFilters(status = "PENDING") {
  return createDayOrderFilters(status, localDateIso(), "today");
}

function createYesterdayOrderFilters(status = "PENDING") {
  return createDayOrderFilters(status, shiftLocalDateIso(localDateIso(), -1), "yesterday");
}

function createAllOrdersFilters(status = "PENDING") {
  return { status, fromDate: "", toDate: "", allOrders: true, datePreset: "all" };
}

function resolveOrderFilters(filters) {
  if (filters.datePreset === "today") return createTodayOrderFilters(filters.status);
  if (filters.datePreset === "yesterday") return createYesterdayOrderFilters(filters.status);
  if (filters.datePreset === "all" || filters.allOrders) return createAllOrdersFilters(filters.status);
  return { ...filters, allOrders: false, datePreset: "range" };
}

function orderFiltersFromTabParam(tab) {
  return createTodayOrderFilters(tab === "dispatched" ? "DESPATCHED" : "PENDING");
}

function isTodayFilter(filters) {
  return resolveOrderFilters(filters).datePreset === "today";
}

function isYesterdayFilter(filters) {
  return resolveOrderFilters(filters).datePreset === "yesterday";
}

function dateScopeFromFilters(filters) {
  const resolved = resolveOrderFilters(filters);
  if (resolved.allOrders) return { allOrders: true };
  return { allOrders: false, fromDate: resolved.fromDate, toDate: resolved.toDate };
}

function filterOrdersByDate(orders, filters) {
  const resolved = resolveOrderFilters(filters);
  let list = orders.slice();
  if (resolved.status) list = list.filter((o) => o.status === resolved.status);
  if (!resolved.allOrders && resolved.fromDate && resolved.toDate) {
    const dateColumn = resolved.status === "PENDING" ? "booking_date" : "despatch_date";
    list = list.filter((o) => {
      const d = o[dateColumn];
      if (!d) return false;
      const day = String(d).slice(0, 10);
      return day >= resolved.fromDate && day <= resolved.toDate;
    });
  } else if (!resolved.allOrders) {
    return [];
  }
  return list;
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

check("default tab opens on today (pending)", () => {
  const f = orderFiltersFromTabParam(null);
  assert.equal(f.status, "PENDING");
  assert.equal(f.allOrders, false);
  assert.equal(f.datePreset, "today");
  assert.equal(f.fromDate, today);
  assert.equal(isTodayFilter(f), true);
});

check("dispatched tab also defaults to today", () => {
  const f = orderFiltersFromTabParam("dispatched");
  assert.equal(f.status, "DESPATCHED");
  assert.equal(isTodayFilter(f), true);
});

check("yesterday preset is previous local day", () => {
  const f = createYesterdayOrderFilters("PENDING");
  assert.equal(f.fromDate, yesterday);
  assert.equal(isYesterdayFilter(f), true);
});

check("stale today preset resolves after midnight", () => {
  const stale = {
    status: "PENDING",
    fromDate: yesterday,
    toDate: yesterday,
    allOrders: false,
    datePreset: "today",
  };
  const resolved = resolveOrderFilters(stale);
  assert.equal(resolved.fromDate, today);
  assert.equal(resolved.datePreset, "today");
});

check("pending count scope follows selected day", () => {
  assert.deepEqual(dateScopeFromFilters(createTodayOrderFilters()), {
    allOrders: false,
    fromDate: today,
    toDate: today,
  });
  assert.deepEqual(dateScopeFromFilters(createYesterdayOrderFilters()), {
    allOrders: false,
    fromDate: yesterday,
    toDate: yesterday,
  });
});

check("list filter returns only matching day rows", () => {
  const orders = [
    { id: "1", status: "PENDING", booking_date: today, despatch_date: null },
    { id: "2", status: "PENDING", booking_date: yesterday, despatch_date: null },
    { id: "3", status: "PENDING", booking_date: shiftLocalDateIso(today, -2), despatch_date: null },
  ];
  assert.deepEqual(
    filterOrdersByDate(orders, createTodayOrderFilters("PENDING")).map((o) => o.id),
    ["1"]
  );
  assert.deepEqual(
    filterOrdersByDate(orders, createYesterdayOrderFilters("PENDING")).map((o) => o.id),
    ["2"]
  );
});

check("missing date bounds never returns all orders", () => {
  const orders = [
    { id: "1", status: "PENDING", booking_date: today, despatch_date: null },
  ];
  const empty = filterOrdersByDate(orders, {
    status: "PENDING",
    fromDate: "",
    toDate: "",
    allOrders: false,
    datePreset: "range",
  });
  assert.equal(empty.length, 0);
});

check("allOrders opt-in returns full status set", () => {
  const orders = [
    { id: "1", status: "PENDING", booking_date: today, despatch_date: null },
    { id: "2", status: "PENDING", booking_date: yesterday, despatch_date: null },
  ];
  assert.equal(filterOrdersByDate(orders, createAllOrdersFilters("PENDING")).length, 2);
});

check("status switch keeps date preset", () => {
  const pendingToday = createTodayOrderFilters("PENDING");
  const dispatchedSameDay = { ...pendingToday, status: "DESPATCHED" };
  assert.equal(dispatchedSameDay.datePreset, "today");
  assert.equal(resolveOrderFilters(dispatchedSameDay).fromDate, today);
});

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nAll order date-filter checks passed.");
