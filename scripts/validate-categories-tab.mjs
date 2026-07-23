/**
 * Static validation for Categories tab + shop upsertCollection wiring.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const shopRoots = [
  path.resolve(root, "..", "ssr-tex-shop"),
  path.resolve(root, "..", "sakthi-textiles-shop"),
];

function mustInclude(file, needle, label) {
  const src = fs.readFileSync(file, "utf8");
  if (!src.includes(needle)) {
    throw new Error(`FAIL: ${label} — missing ${JSON.stringify(needle)} in ${path.relative(root, file)}`);
  }
  console.log(`OK: ${label}`);
}

const page = path.join(root, "src", "app", "products", "page.tsx");
const tab = path.join(root, "src", "components", "products", "CategoriesTab.tsx");
const api = path.join(root, "src", "lib", "velo-products-api.ts");
const types = path.join(root, "src", "lib", "velo-products-types.ts");

mustInclude(page, 'id: "categories"', "Products page has Categories tab");
mustInclude(page, "CategoriesTab", "Products page renders CategoriesTab");
mustInclude(tab, "upsertVeloCollection", "CategoriesTab calls upsert API");
mustInclude(tab, "Category name", "CategoriesTab has name field");
mustInclude(tab, "Category image", "CategoriesTab has image field");
mustInclude(api, '"upsertCollection"', "Velo client supports upsertCollection");
mustInclude(types, "upsertCollection", "Types include upsertCollection");
mustInclude(types, "imageUrl", "Collection type includes imageUrl");

for (const shop of shopRoots) {
  const handler = path.join(shop, "src", "lib", "integrations", "velo-products-handler.ts");
  if (!fs.existsSync(handler)) {
    console.warn(`SKIP: shop handler missing at ${handler}`);
    continue;
  }
  const name = path.basename(shop);
  mustInclude(handler, '"upsertCollection"', `${name} exposes upsertCollection`);
  mustInclude(handler, "handleUpsertCollection", `${name} implements handleUpsertCollection`);
  mustInclude(handler, "description: collections.description", `${name} meta returns description`);
  mustInclude(handler, "imageUrl:", `${name} meta/create returns imageUrl`);
}

console.log("\nAll category wiring checks passed.");
