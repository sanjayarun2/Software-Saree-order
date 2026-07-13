/**
 * Validate order line-item image extraction / merge / ST-code helpers.
 * Run: node scripts/validate-order-product-images.mjs
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function extractImageUrlFromUnknown(raw) {
  if (raw == null) return null;
  if (typeof raw === "string") {
    const s = raw.trim();
    return /^https?:\/\//i.test(s) || s.startsWith("data:image/") ? s : null;
  }
  if (typeof raw !== "object") return null;
  const o = raw;

  for (const key of [
    "imageUrl",
    "image_url",
    "thumbnailUrl",
    "thumbnail_url",
    "featuredImageUrl",
    "featured_image_url",
    "photoUrl",
    "photo_url",
    "mediaUrl",
    "media_url",
    "url",
    "src",
  ]) {
    const hit = extractImageUrlFromUnknown(o[key]);
    if (hit) return hit;
  }

  for (const key of [
    "image",
    "thumbnail",
    "featuredImage",
    "featured_image",
    "photo",
    "media",
  ]) {
    const hit = extractImageUrlFromUnknown(o[key]);
    if (hit) return hit;
  }

  if (Array.isArray(o.images) && o.images.length) {
    const hit = extractImageUrlFromUnknown(o.images[0]);
    if (hit) return hit;
  }

  return null;
}

function extractProductCodeFromText(text) {
  if (!text) return null;
  const match = String(text).match(/\b(ST\d{3,})\b/i);
  return match ? match[1].toUpperCase() : null;
}

function normalizeWebsiteLineItems(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const name = String(row.name ?? row.productName ?? "").trim();
    if (!name) continue;
    const qtyRaw = Number(row.quantity ?? 1);
    const quantity =
      Number.isFinite(qtyRaw) && qtyRaw >= 1 ? Math.floor(qtyRaw) : 1;
    const productCodeRaw =
      typeof row.productCode === "string" ? row.productCode.trim() : "";
    out.push({
      productId:
        typeof row.productId === "string" ? row.productId.trim() || null : null,
      name,
      productCode: productCodeRaw || extractProductCodeFromText(name) || null,
      quantity,
      imageUrl: extractImageUrlFromUnknown(row),
      unitPrice:
        typeof row.unitPrice === "number" && Number.isFinite(row.unitPrice)
          ? row.unitPrice
          : null,
    });
  }
  return out;
}

function lineItemsFromVeloApiItems(items) {
  if (!Array.isArray(items)) return [];
  return normalizeWebsiteLineItems(
    items.map((row) => {
      if (!row || typeof row !== "object") return row;
      return {
        productId: row.productId,
        name: row.productName ?? row.name,
        productCode: row.productCode,
        quantity: row.quantity,
        imageUrl: extractImageUrlFromUnknown(row),
        unitPrice: row.unitPrice,
        image: row.image,
        thumbnail: row.thumbnail,
        featuredImage: row.featuredImage,
        images: row.images,
      };
    })
  );
}

function mergeWebsiteLineItems(base, fresh) {
  if (!fresh.length) return base;
  if (!base.length) return fresh;
  return base.map((item) => {
    const match =
      fresh.find(
        (f) =>
          (item.productId && f.productId && item.productId === f.productId) ||
          (item.productCode &&
            f.productCode &&
            item.productCode === f.productCode)
      ) ??
      fresh.find(
        (f) => f.name.trim().toLowerCase() === item.name.trim().toLowerCase()
      );
    if (!match) return item;
    return {
      ...item,
      productId: item.productId || match.productId,
      productCode: item.productCode || match.productCode,
      imageUrl: item.imageUrl || match.imageUrl,
      unitPrice: item.unitPrice ?? match.unitPrice,
      quantity: item.quantity || match.quantity,
    };
  });
}

function lineItemsMissingImages(items) {
  return items.some((item) => !item.imageUrl?.trim());
}

// --- tests ---

assert.equal(
  extractProductCodeFromText("Soft silk CLEARCE SALE ST000225"),
  "ST000225"
);
assert.equal(extractProductCodeFromText("no code here"), null);

assert.equal(
  extractImageUrlFromUnknown({ imageUrl: "https://cdn.example/a.webp" }),
  "https://cdn.example/a.webp"
);
assert.equal(
  extractImageUrlFromUnknown({
    image: { url: "https://cdn.example/nested.webp" },
  }),
  "https://cdn.example/nested.webp"
);
assert.equal(extractImageUrlFromUnknown({ imageUrl: null }), null);

const fromApi = lineItemsFromVeloApiItems([
  {
    productId: "p1",
    productName: "Soft silks sarees aadi offer CLEARCE SALE ST000225",
    productCode: null,
    quantity: 1,
    unitPrice: 450,
    imageUrl: "https://cdn.example/st225.webp",
  },
]);
assert.equal(fromApi.length, 1);
assert.equal(fromApi[0].productCode, "ST000225");
assert.equal(fromApi[0].imageUrl, "https://cdn.example/st225.webp");

const storedNull = normalizeWebsiteLineItems([
  {
    name: "Soft silks sarees aadi offer CLEARCE SALE ST000225",
    imageUrl: null,
    quantity: 1,
    productId: "old-id",
    unitPrice: 450,
    productCode: null,
  },
]);
assert.equal(storedNull[0].productCode, "ST000225");
assert.equal(lineItemsMissingImages(storedNull), true);

const merged = mergeWebsiteLineItems(storedNull, fromApi);
assert.equal(merged[0].imageUrl, "https://cdn.example/st225.webp");
assert.equal(merged[0].productCode, "ST000225");
assert.equal(lineItemsMissingImages(merged), false);

// Match by ST code when productId differs (catalog vs order line id).
const byCode = mergeWebsiteLineItems(
  [{ name: "Sale ST000225", productId: "a", productCode: "ST000225", quantity: 1, imageUrl: null }],
  [
    {
      name: "UPPADA ST000225",
      productId: "b",
      productCode: "ST000225",
      quantity: 1,
      imageUrl: "https://cdn.example/from-catalog.webp",
    },
  ]
);
assert.equal(byCode[0].imageUrl, "https://cdn.example/from-catalog.webp");

// Source guards: draft/archived resolve + lightbox
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const detailSheet = readFileSync(
  resolve(root, "src/components/orders/OrderDetailSheet.tsx"),
  "utf8"
);
assert.ok(detailSheet.includes("PhotoLightbox"), "packing photo lightbox missing");
assert.ok(detailSheet.includes("onExpandPhoto"), "tap-to-expand photo missing");
assert.ok(detailSheet.includes("expandPhoto"), "expand photo label missing");

const imageCache = readFileSync(
  resolve(root, "src/lib/product-image-cache.ts"),
  "utf8"
);
assert.ok(
  imageCache.includes('draft: "all"'),
  "product image enrich must include drafts"
);
assert.ok(
  imageCache.includes("item.productId"),
  "product image enrich must search by productId"
);

console.log("validate-order-product-images: OK");
