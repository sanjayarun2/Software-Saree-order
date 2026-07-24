/**
 * Validate notification → orders sync UX wiring.
 * Run: node scripts/validate-orders-sync-ui.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return readFileSync(resolve(root, rel), "utf8");
}

function check(label, fn) {
  fn();
  console.log(`OK: ${label}`);
}

const bridge = read("src/components/OrderNotificationBridge.tsx");
const nav = read("src/lib/order-notification-navigation.ts");
const syncUi = read("src/lib/order-sync-ui.ts");
const orders = read("src/app/orders/page.tsx");
const dash = read("src/app/dashboard/page.tsx");

check("nav sets syncing UI before open", () => {
  assert.match(nav, /setOrdersSyncUi/);
  assert.match(nav, /forceSync/);
  assert.match(nav, /externalOrderId/);
});

check("bridge navigates first then force-syncs (no cooldown skip)", () => {
  assert.match(bridge, /go\(\)/);
  assert.match(bridge, /pollVeloWebsiteOrders/);
  assert.match(bridge, /syncOrders/);
  assert.doesNotMatch(bridge, /wasWebsitePollRecent/);
});

check("orders page shows Updating banner", () => {
  assert.match(orders, /listUpdating/);
  assert.match(orders, /Updating orders…/);
  assert.match(orders, /consumeFocusExternalOrderId/);
});

check("dashboard shows Updating banner and polls website", () => {
  assert.match(dash, /refreshingStats/);
  assert.match(dash, /Updating orders…/);
  assert.match(dash, /pollVeloWebsiteOrders/);
  assert.match(dash, /subscribeOrdersSyncUi/);
});

check("sync UI module exists", () => {
  assert.match(syncUi, /ORDERS_SYNC_UI_EVENT/);
  assert.match(syncUi, /setOrdersSyncUi/);
});

console.log("\nAll orders sync UI checks passed.");
