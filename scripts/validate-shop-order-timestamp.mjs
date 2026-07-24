/**
 * Validate shop order instant helpers (industry: show shop paid/placed time).
 * Run: node scripts/validate-shop-order-timestamp.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ORDER_TZ_IST = "Asia/Kolkata";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function resolveShopOrderInstant(fields) {
  for (const raw of [
    fields.paidAt,
    fields.createdAt,
    fields.orderDate,
    fields.bookedAt,
  ]) {
    const s = String(raw ?? "").trim();
    if (!s) continue;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const d = new Date(`${s}T00:00:00+05:30`);
      if (!Number.isNaN(d.getTime())) return d.toISOString();
      continue;
    }
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return null;
}

function shopInstantToBookingDate(iso) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ORDER_TZ_IST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
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

function formatOrderDateTimeIst(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
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

function check(label, fn) {
  fn();
  console.log(`OK: ${label}`);
}

check("prefers paidAt over createdAt", () => {
  const iso = resolveShopOrderInstant({
    paidAt: "2026-07-20T10:30:00+05:30",
    createdAt: "2026-07-20T09:00:00+05:30",
  });
  assert.ok(iso);
  assert.equal(
    new Date(iso).toISOString(),
    new Date("2026-07-20T10:30:00+05:30").toISOString()
  );
});

check("falls back to shop createdAt", () => {
  const iso = resolveShopOrderInstant({
    createdAt: "2026-07-21T15:45:00.000Z",
  });
  assert.equal(iso, "2026-07-21T15:45:00.000Z");
});

check("booking_date is IST calendar day", () => {
  const booking = shopInstantToBookingDate("2026-07-21T23:30:00.000Z");
  assert.equal(booking, "2026-07-22");
});

check("pending list uses shop created_at, not sync now", () => {
  const shop = "2026-07-20T05:00:00.000Z";
  const syncNow = "2026-07-24T05:00:00.000Z";
  const ts = orderListTimestamp({
    status: "PENDING",
    created_at: shop,
    booking_date: "2026-07-20",
    updated_at: syncNow,
  });
  assert.equal(ts, shop);
  const shown = formatOrderDateTimeIst(ts);
  assert.match(shown, /20 Jul 26/i);
  assert.doesNotMatch(shown, /24 Jul 26/i);
});

const syncSrc = readFileSync(
  resolve(root, "src/lib/velo-website-sync.ts"),
  "utf8"
);
const orderSvc = readFileSync(resolve(root, "src/lib/order-service.ts"), "utf8");
const dtSrc = readFileSync(resolve(root, "src/lib/order-datetime.ts"), "utf8");

check("sync maps shop instant into created_at", () => {
  assert.match(syncSrc, /resolveShopOrderInstant/);
  assert.match(syncSrc, /created_at: shopInstant/);
  assert.match(syncSrc, /patches\.created_at = shopInstant/);
});

check("createOrder keeps insert.created_at (shop time)", () => {
  assert.match(orderSvc, /insert\.created_at\?\.trim\(\) \|\| now/);
});

check("order-datetime exports resolveShopOrderInstant", () => {
  assert.match(dtSrc, /export function resolveShopOrderInstant/);
});

console.log("\nAll shop order timestamp checks passed.");
