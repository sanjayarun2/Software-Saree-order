/**
 * Validate long TO addresses keep city/area text (no silent truncate).
 * Case: goregaon west, Mumbai was dropped after "m.g road," on labels.
 *
 * Run: npx tsx scripts/validate-pdf-to-address-fit.ts
 */

import assert from "node:assert/strict";
import { jsPDF } from "jspdf";
import {
  fitAddressLinesToColumn,
  maxAddressLinesForY,
  prepareAddressForPdf,
  resolveOrderLabelLayout,
  LABEL_TO_ADDRESS_GAP_MM,
} from "../src/lib/pdf-utils";
import type { Order } from "../src/lib/db-types";

const LONG_TO = `Srilatha Amit Tanda
33/254, motilal nagar 3, road no. 3, opp. Rahul gym entrance (towards azad maidan), m.g road, goregoan west, Mumbai 400104
Phone no. 7208574953`;

function makeOrder(to: string): Order {
  return {
    id: "validate-to-fit",
    user_id: "validate",
    sender_details: "Dove silks\nEllampillai - 637502\nPh: 8122864829",
    recipient_details: to,
    saree_count: 1,
    status: "PENDING",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as Order;
}

function assertKeepsCity(haystack: string) {
  const lower = haystack.toLowerCase();
  assert.match(lower, /gorego?an/, "must keep goregaon/goregoan");
  assert.match(lower, /mumbai/, "must keep Mumbai");
  assert.match(haystack, /400104/, "must keep pincode");
  assert.match(haystack, /7208574953/, "must keep mobile");
}

const prepared = prepareAddressForPdf(LONG_TO, false, "to");
assertKeepsCity(prepared);
console.log("OK prepareAddressForPdf keeps city/pin/mobile");

const doc = new jsPDF({ unit: "mm", format: "a4" });
doc.setFont("helvetica", "bold");
doc.setFontSize(12);

// Old bug: hard maxLines=7 truncated overflow to first wrapped chunk only.
const maxW = 55;
const fullWrap = doc.splitTextToSize(
  prepared
    .split("\n")
    .filter((l) => !/^Pincode/i.test(l) && !/^Mob No/i.test(l))
    .join(" "),
  maxW
);
assert.ok(fullWrap.length >= 4, "long street should wrap to several lines");

const fittedLoose = fitAddressLinesToColumn(doc, prepared, maxW, 7);
assertKeepsCity(fittedLoose.join("\n"));
console.log("OK fitAddressLinesToColumn(max 7) no longer drops city:", fittedLoose.length, "lines");

const atY8 = maxAddressLinesForY(8, 6, LABEL_TO_ADDRESS_GAP_MM);
const atTop = maxAddressLinesForY(4, 6, LABEL_TO_ADDRESS_GAP_MM);
assert.ok(atTop >= atY8, "top Y must allow at least as many lines as Y=8");
console.log("OK maxAddressLinesForY", { atY8, atTop });

const resolved = resolveOrderLabelLayout(doc as never, makeOrder(LONG_TO), {
  settings: {
    content_type: "text",
    placement: "bottom",
    text_size: 12,
    text_bold: true,
    custom_text: "Thank You",
    logo_zoom: 1,
    from_y_mm: 8,
    to_y_mm: 8,
    normalize_addresses: false,
  },
});

const joined = resolved.toLines.join("\n");
assertKeepsCity(joined);
assert.ok(resolved.addressSizePt >= 9, "font should stay at or above min");
console.log("OK resolveOrderLabelLayout", {
  lines: resolved.toLines.length,
  addressPt: resolved.addressSizePt,
  toY: resolved.toY,
  toLines: resolved.toLines,
});

console.log("\nAll PDF TO-address fit checks passed.");
