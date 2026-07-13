/**
 * Validate IST order date/time formatting (12-hour, not railway 24h).
 * Run: node scripts/validate-order-datetime.mjs
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ORDER_TZ_IST = "Asia/Kolkata";

function parseOrderInstant(iso) {
  const s = String(iso ?? "").trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(`${s}T12:00:00+05:30`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function hasClockTime(iso) {
  const s = String(iso ?? "").trim();
  return s.length > 10 && !/^\d{4}-\d{2}-\d{2}$/.test(s);
}

function formatOrderDateIst(iso) {
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

function formatOrderDateTimeIst(iso) {
  if (!iso) return "—";
  const raw = String(iso).trim();
  const d = parseOrderInstant(raw);
  if (!d) return "—";
  if (!hasClockTime(raw)) return formatOrderDateIst(raw);
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

function orderListTimestamp(order) {
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

// 2026-07-13 17:39:17 UTC = 11:09 pm IST
const pending = formatOrderDateTimeIst("2026-07-13T17:39:17.465Z");
assert.match(pending, /Jul/i);
assert.match(pending, /\b(am|pm)\b/i);
assert.ok(!/\b1[3-9]:|\b2[0-3]:/.test(pending), "must not use 24h railway time");

const dateOnly = formatOrderDateTimeIst("2026-07-13");
assert.equal(dateOnly, formatOrderDateIst("2026-07-13"));
assert.ok(!/\b(am|pm)\b/i.test(dateOnly), "date-only should not invent a clock time");

assert.equal(
  orderListTimestamp({
    status: "PENDING",
    created_at: "2026-07-13T17:39:17.465Z",
    booking_date: "2026-07-13",
  }),
  "2026-07-13T17:39:17.465Z"
);
assert.equal(
  orderListTimestamp({
    status: "DESPATCHED",
    despatched_at: "2026-07-13T18:00:00.000Z",
    despatch_date: "2026-07-13",
  }),
  "2026-07-13T18:00:00.000Z"
);

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const page = readFileSync(resolve(root, "src/app/orders/page.tsx"), "utf8");
assert.ok(page.includes("formatOrderDateTimeIst"));
assert.ok(page.includes("orderListTimestamp"));
const svc = readFileSync(resolve(root, "src/lib/order-service.ts"), "utf8");
assert.ok(svc.includes("despatched_at"));

console.log("validate-order-datetime: OK");
console.log(" sample pending IST:", pending);
