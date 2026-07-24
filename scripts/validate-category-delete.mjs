/**
 * Validate Velo category delete matches website admin batch delete wiring.
 * Run: node scripts/validate-category-delete.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const shopRoots = [
  resolve(root, "..", "ssr-tex-shop"),
  resolve(root, "..", "sakthi-textiles-shop"),
];

function read(p) {
  return readFileSync(p, "utf8");
}

function check(label, fn) {
  fn();
  console.log(`OK: ${label}`);
}

const api = read(resolve(root, "src/lib/velo-products-api.ts"));
const types = read(resolve(root, "src/lib/velo-products-types.ts"));
const tab = read(resolve(root, "src/components/products/CategoriesTab.tsx"));

check("Velo client has deleteVeloCollection loop", () => {
  assert.match(api, /export async function deleteVeloCollection/);
  assert.match(api, /"deleteCollection"/);
  assert.match(api, /batchSize: 3/);
  assert.match(api, /guard < 200/);
});

check("Types include deleteCollection", () => {
  assert.match(types, /deleteCollection/);
  assert.match(types, /collectionDeleted/);
});

check("CategoriesTab has Delete with confirm", () => {
  assert.match(tab, /onDelete/);
  assert.match(tab, /deleteVeloCollection/);
  assert.match(tab, /window\.confirm/);
  assert.match(tab, /t\("Delete"\)/);
});

for (const shop of shopRoots) {
  const name = shop.split(/[/\\]/).pop();
  const handler = resolve(shop, "src/lib/integrations/velo-products-handler.ts");
  const src = read(handler);
  check(`${name} exposes deleteCollection`, () => {
    assert.match(src, /"deleteCollection"/);
    assert.match(src, /handleDeleteCollection/);
    assert.match(src, /done:/);
    assert.match(src, /remaining:/);
  });
}

console.log("\nAll category delete wiring checks passed.");
