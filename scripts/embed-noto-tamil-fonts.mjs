/**
 * Generate src/lib/pdf-tamil-font-data.ts from public/fonts/*.ttf
 * Run: node scripts/embed-noto-tamil-fonts.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const regular = readFileSync(
  resolve(root, "public/fonts/NotoSansTamil-Regular.ttf")
).toString("base64");
const bold = readFileSync(
  resolve(root, "public/fonts/NotoSansTamil-Bold.ttf")
).toString("base64");

const out = `/** Auto-generated from public/fonts — Noto Sans Tamil for jsPDF. Run: node scripts/embed-noto-tamil-fonts.mjs */
export const NOTO_SANS_TAMIL_REGULAR_BASE64 = ${JSON.stringify(regular)};
export const NOTO_SANS_TAMIL_BOLD_BASE64 = ${JSON.stringify(bold)};
`;

const target = resolve(root, "src/lib/pdf-tamil-font-data.ts");
writeFileSync(target, out);
console.log(
  `Wrote ${target} (regular ${regular.length} chars, bold ${bold.length} chars)`
);
