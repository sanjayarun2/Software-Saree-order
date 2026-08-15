/**
 * Product page: list/categories tabs; single/bulk via bottom-right + FAB.
 * Run: node scripts/validate-products-add-fab.mjs
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

const page = read("src/app/products/page.tsx");
const fab = read("src/components/products/AddProductFab.tsx");

check("top tabs are only Product List and Categories", () => {
  const tabsBlock = page.slice(page.indexOf("const TABS"), page.indexOf("];", page.indexOf("const TABS")) + 2);
  assert.match(tabsBlock, /Product List/);
  assert.match(tabsBlock, /Categories/);
  assert.doesNotMatch(tabsBlock, /Add Single Product/);
  assert.doesNotMatch(tabsBlock, /Add Bulk Products/);
});

check("URL still accepts single and bulk tabs", () => {
  assert.match(page, /rawTab === "single"/);
  assert.match(page, /rawTab === "bulk"/);
  assert.match(page, /setTab\("single"\)/);
  assert.match(page, /setTab\("bulk"\)/);
});

check("FAB is used from the product list with cart lift", () => {
  assert.match(page, /import \{ AddProductFab, addProductFabLiftFromCart \}/);
  assert.match(page, /<AddProductFab/);
  assert.match(page, /onAddSingle=\{onAddSingle\}/);
  assert.match(page, /onAddBulk=\{onAddBulk\}/);
  assert.match(page, /addProductFabLiftFromCart/);
  assert.match(page, /searchFocused \? null/);
});

check("list/categories tabs hide while adding a product", () => {
  assert.match(page, /tab === "list" \|\| tab === "categories"/);
});

check("single/bulk forms have a back control to the list", () => {
  assert.match(page, /tab === "single" \|\| tab === "bulk"/);
  assert.match(page, /setTab\("list"\)/);
});

check("FAB matches orders PDF corner and speed-dial behavior", () => {
  assert.match(fab, /bottom-24 right-4 md:bottom-8 md:right-8/);
  assert.match(fab, /aria-expanded/);
  assert.match(fab, /Escape/);
  assert.match(fab, /pointerdown/);
  assert.match(fab, /Add Single Product/);
  assert.match(fab, /Add Bulk Products/);
  assert.match(fab, /export function addProductFabLiftFromCart/);
  assert.match(fab, /cart-expanded/);
});

console.log("All product add-FAB checks passed.");
