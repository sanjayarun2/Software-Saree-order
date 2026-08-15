/**
 * Overlay stamp is opt-in. Default off → bulk photos go straight to the website.
 * Run: node scripts/validate-product-code-overlay.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function read(p) {
  return readFileSync(resolve(root, p), "utf8");
}

function check(label, fn) {
  fn();
  console.log(`OK: ${label}`);
}

const settings = read("src/lib/product-code-settings.ts");
const stamp = read("src/lib/image-product-code.ts");
const upload = read("src/lib/bulk-product-batch-upload.ts");
const naming = read("src/lib/bulk-product-naming.ts");
const productsPage = read("src/app/products/page.tsx");
const settingsPage = read("src/app/settings/product-codes/page.tsx");

check("overlay defaults off and only true when explicitly stored", () => {
  assert.match(settings, /overlayEnabled:\s*false/);
  assert.match(settings, /parsed\.overlayEnabled === true/);
  assert.match(settings, /export function isProductCodeOverlayEnabled/);
});

check("stamp skips processing when overlay is off", () => {
  assert.match(stamp, /if \(!isProductCodeOverlayEnabled\(\)\) \{\s*return file;/);
});

check("direct bulk upload helper exists", () => {
  assert.match(upload, /export async function uploadBulkOriginalsDirectToWebsite/);
  assert.match(naming, /export function buildDirectBulkProductName/);
});

check("bulk tab uses overlay flag to choose generate vs website upload", () => {
  assert.match(productsPage, /isProductCodeOverlayEnabled/);
  assert.match(productsPage, /uploadBulkOriginalsDirectToWebsite/);
  assert.match(productsPage, /overlayOn \? goGenerate : \(\) => void uploadDirect\(\)/);
  assert.match(productsPage, /t\("Upload to website"\)/);
});

check("settings page has stamp toggle", () => {
  assert.match(settingsPage, /overlayEnabled: e\.target\.checked/);
  assert.match(settingsPage, /Stamp code on photos/);
  assert.match(settingsPage, /disabled=\{!settings\.overlayEnabled\}/);
});

console.log("All overlay default-off checks passed.");
