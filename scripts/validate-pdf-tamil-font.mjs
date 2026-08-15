/**
 * Validate Tamil PDF font registration and wiring.
 * Run: node scripts/validate-pdf-tamil-font.mjs
 */

import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { jsPDF } from "jspdf";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const require = createRequire(import.meta.url);

let failed = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`OK  ${name}`);
  } catch (e) {
    failed += 1;
    console.error(`FAIL ${name}:`, e.message);
  }
}

const TAMIL_RE = /[\u0B80-\u0BFF]/;
function textHasTamil(text) {
  return TAMIL_RE.test(String(text ?? ""));
}
function resolvePdfBodyFont(text) {
  return textHasTamil(text) ? "NotoSansTamil" : "helvetica";
}

check("Tamil detector recognizes Tamil sample", () => {
  assert.equal(textHasTamil("சுகுமார்"), true);
  assert.equal(textHasTamil("S / o ராமசாமி"), true);
  assert.equal(textHasTamil("Lola Keerthi\nBangalore"), false);
  assert.equal(resolvePdfBodyFont("சுகுமார்"), "NotoSansTamil");
  assert.equal(resolvePdfBodyFont("Hello"), "helvetica");
});

check("font TTF assets exist in public/fonts", () => {
  assert.ok(
    existsSync(resolve(root, "public/fonts/NotoSansTamil-Regular.ttf")),
    "missing Regular TTF"
  );
  assert.ok(
    existsSync(resolve(root, "public/fonts/NotoSansTamil-Bold.ttf")),
    "missing Bold TTF"
  );
});

check("pdf-tamil-font-data exports base64 blobs", () => {
  const src = readFileSync(resolve(root, "src/lib/pdf-tamil-font-data.ts"), "utf8");
  assert.ok(src.includes("NOTO_SANS_TAMIL_REGULAR_BASE64"));
  assert.ok(src.includes("NOTO_SANS_TAMIL_BOLD_BASE64"));
  assert.ok(src.length > 50_000, "base64 data looks too small");
});

check("pdf-tamil-font.ts exports ensure/resolve helpers", () => {
  const src = readFileSync(resolve(root, "src/lib/pdf-tamil-font.ts"), "utf8");
  for (const name of [
    "export function textHasTamil",
    "export function ensurePdfFonts",
    "export function resolvePdfBodyFont",
    "export function setPdfAddressFont",
    "PDF_FONT_NOTO_TAMIL",
    'Identity-H',
  ]) {
    assert.ok(src.includes(name), `missing ${name}`);
  }
});

check("jsPDF embeds NotoSansTamil for Tamil text", () => {
  const regular = readFileSync(
    resolve(root, "public/fonts/NotoSansTamil-Regular.ttf")
  ).toString("base64");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  doc.addFileToVFS("NotoSansTamil-Regular.ttf", regular);
  doc.addFont("NotoSansTamil-Regular.ttf", "NotoSansTamil", "normal", "Identity-H");
  doc.setFont("NotoSansTamil", "normal");
  doc.setFontSize(12);
  doc.text("சுகுமார்", 10, 20);
  const latin = Buffer.from(doc.output("arraybuffer")).toString("latin1");
  assert.ok(/NotoSansTamil/i.test(latin), "PDF must embed NotoSansTamil");
  assert.ok(
    Object.keys(doc.getFontList()).some((k) => /notosanstamil/i.test(k)),
    "font list must include NotoSansTamil"
  );
});

check("English-only path resolves to helvetica", () => {
  assert.equal(resolvePdfBodyFont("FROM address\nDelhi 110001"), "helvetica");
});

check("pdf-utils and pos-pdf-utils wire Tamil font helper", () => {
  const pdfUtils = readFileSync(resolve(root, "src/lib/pdf-utils.ts"), "utf8");
  const posUtils = readFileSync(resolve(root, "src/lib/pos-pdf-utils.ts"), "utf8");
  assert.ok(pdfUtils.includes('from "./pdf-tamil-font"'));
  assert.ok(pdfUtils.includes("ensurePdfFonts"));
  assert.ok(pdfUtils.includes("setPdfAddressFont"));
  assert.ok(posUtils.includes('from "./pdf-tamil-font"'));
  assert.ok(posUtils.includes("ensurePdfFonts"));
  assert.ok(posUtils.includes("setPdfAddressFont"));
});

check("source helper matches runtime detector", () => {
  // Keep script detector aligned with src (spot-check pattern).
  const src = readFileSync(resolve(root, "src/lib/pdf-tamil-font.ts"), "utf8");
  assert.ok(src.includes("\\u0B80-\\u0BFF") || src.includes("\u0B80-\u0BFF"));
});

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nAll Tamil PDF font checks passed.");
