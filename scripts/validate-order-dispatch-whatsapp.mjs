/**
 * Dispatch WhatsApp: address number 1 → 2 → picker if none valid.
 * Run: node scripts/validate-order-dispatch-whatsapp.mjs
 *
 * Note: apps cannot query “is this number on WhatsApp?” — we validate format
 * and open the first valid candidate, else wa.me without a phone.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildOrderDispatchWhatsAppUrl,
  collectOrderWhatsAppMobiles,
  pickWhatsAppChatDigits,
  resolveOrderDispatchWhatsAppUrl,
} from "../src/lib/order-dispatch-whatsapp.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function read(p) {
  return readFileSync(resolve(root, p), "utf8");
}

function check(label, fn) {
  fn();
  console.log(`OK: ${label}`);
}

check("address first number opens direct chat", () => {
  const order = {
    recipient_details: `Indhu\nSelaiyur\nCell: 9087011288\nPincode : 600073`,
    booked_mobile_no: "9999999999",
  };
  const mobiles = collectOrderWhatsAppMobiles(order);
  assert.deepEqual(mobiles, ["9087011288"]);
  const { url, chatDigits } = resolveOrderDispatchWhatsAppUrl(order, "Hello");
  assert.equal(chatDigits, "919087011288");
  assert.match(url, /^https:\/\/wa\.me\/919087011288\?text=/);
  assert.ok(!url.startsWith("https://wa.me/?text="));
});

check("two address numbers: first valid wins, second is candidate", () => {
  const order = {
    recipient_details: `Murugesan\nCell: 8220091932, 9994317183\nPin 623534`,
    booked_mobile_no: "",
  };
  const mobiles = collectOrderWhatsAppMobiles(order);
  assert.deepEqual(mobiles, ["8220091932", "9994317183"]);
  assert.equal(pickWhatsAppChatDigits(mobiles), "918220091932");
  assert.equal(pickWhatsAppChatDigits(["0000000000", "9994317183"]), "919994317183");
});

check("invalid first skips to second valid number", () => {
  // normalizeMobileDigits rejects numbers not starting 6–9
  const digits = pickWhatsAppChatDigits(["1234567890", "7084611612"]);
  assert.equal(digits, "917084611612");
});

check("no valid number → WhatsApp contact picker URL", () => {
  const order = {
    recipient_details: "Name only\nNo phone here",
    booked_mobile_no: "",
  };
  assert.deepEqual(collectOrderWhatsAppMobiles(order), []);
  const { url, chatDigits } = resolveOrderDispatchWhatsAppUrl(order, "Hi");
  assert.equal(chatDigits, null);
  assert.equal(url, buildOrderDispatchWhatsAppUrl("Hi", null));
  assert.match(url, /^https:\/\/wa\.me\/\?text=/);
});

check("booked mobile used only when address has none", () => {
  const withAddress = collectOrderWhatsAppMobiles({
    recipient_details: "A\n9876543210",
    booked_mobile_no: "9123456789",
  });
  assert.deepEqual(withAddress, ["9876543210"]);

  const bookedOnly = collectOrderWhatsAppMobiles({
    recipient_details: "A\nChennai",
    booked_mobile_no: "9123456789",
  });
  assert.deepEqual(bookedOnly, ["9123456789"]);
});

check("orders page wires resolveOrderDispatchWhatsAppUrl", () => {
  const page = read("src/app/orders/page.tsx");
  assert.match(page, /resolveOrderDispatchWhatsAppUrl/);
  assert.doesNotMatch(page, /wa\.me\/\?text=\$\{message\}/);
});

console.log("All order dispatch WhatsApp checks passed.");
