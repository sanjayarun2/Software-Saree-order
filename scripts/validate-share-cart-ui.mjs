/**
 * Static checks for mobile share-cart UI sizing / button order helpers.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const panel = readFileSync(join(root, "src/components/products/ShareCartPanel.tsx"), "utf8");
const products = readFileSync(join(root, "src/app/products/page.tsx"), "utf8");

assert.match(panel, /min-h-\[48px\]/, "collapsed cart controls should use 48px touch height");
assert.match(panel, /onExpandedChange/, "panel should report expand state for spacer");
assert.match(panel, /max-h-\[min\(40vh,220px\)\]/, "expanded list should allow taller scroll area");
assert.match(products, /onExpandedChange=\{setCartExpanded\}/, "products page wires expand spacer");
assert.match(products, /bg-emerald-600[\s\S]*\+[\s\S]*\{t\("Add"\)\}/, "+ Add should be solid emerald");

const addBtnIdx = products.indexOf('aria-label={t("Add to order cart")}');
const editIdx = products.indexOf("{t(\"Edit\")}", products.indexOf("flex flex-wrap items-center justify-end gap-2"));
const deleteIdx = products.indexOf("{t(\"Delete\")}", editIdx);
assert.ok(editIdx > 0 && deleteIdx > editIdx && addBtnIdx > deleteIdx, "+ Add must come after Edit and Delete");

console.log("validate-share-cart-ui: OK");
