/**
 * Tamil PDF: visual shaping vs WhatsApp/Unicode (jsPDF has no GSUB).
 * Run: npx tsx scripts/validate-pdf-tamil-shape.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { shapeTamilForPdf, tamilNeedsPdfShaping } from "../src/lib/pdf-tamil-shape";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function read(p: string) {
  return readFileSync(resolve(root, p), "utf8");
}

function check(label: string, fn: () => void) {
  fn();
  console.log(`OK: ${label}`);
}

const WHATSAPP_TO = `K தங்கராஜ்
S/o கந்தசாமி
2/4 சர்க்கார் கிணறு வீதி
தென்சங்கம்பாளையம்
வேடசெந்தூர் (po)
ஆனைமலை(tk)
Pin - 642007
Cell - 6381269838, 9994317183, 7094611612`;

check("left matra ெ moves before consonant (தென் → ெதன்)", () => {
  assert.equal(shapeTamilForPdf("தென்"), "ெதன்");
  assert.equal(tamilNeedsPdfShaping("தென்"), true);
  assert.equal(tamilNeedsPdfShaping("ெதன்"), false);
});

check("ே and ை reorder; ொ splits to ெ + ா", () => {
  assert.equal(shapeTamilForPdf("வே"), "ேவ");
  assert.equal(shapeTamilForPdf("கை"), "ைக");
  assert.equal(shapeTamilForPdf("கொ"), "ெகா");
  assert.equal(shapeTamilForPdf("கோ"), "ேகா");
});

check("village spelling uses visual order, not sliced random letters", () => {
  const logical = "தென்சங்கம்பாளையம்";
  const visual = shapeTamilForPdf(logical);
  assert.ok(visual.startsWith("ெத"), `expected ெத… got ${visual}`);
  assert.ok(visual.includes("ைள"), `ளை must become ைள, got ${visual}`);
  assert.notEqual(visual, logical);
  assert.equal(shapeTamilForPdf(visual), visual);
});

check("WhatsApp Then-Sangampalayam address shapes PO/taluk words", () => {
  const shaped = shapeTamilForPdf(WHATSAPP_TO);
  assert.ok(shaped.includes("ெதன்சங்கம்பாைளயம்"), `village visual: ${shaped}`);
  assert.ok(shaped.includes("ேவடெசந்தூர்"));
  assert.ok(shaped.includes("ஆைனமைல"));
  assert.ok(shaped.includes("(po)"));
  assert.ok(shaped.includes("(tk)"));
  assert.ok(shaped.includes("642007"));
  assert.ok(shaped.includes("6381269838"));
});

check("English-only text is unchanged", () => {
  const en = "GeethaGovind collections\n9043327671";
  assert.equal(shapeTamilForPdf(en), en);
});

check("pdf-utils wraps after shaping and does not slice Tamil tokens", () => {
  const utils = read("src/lib/pdf-utils.ts");
  assert.match(utils, /shapeTamilForPdf\(p\.trim\(\)\)/);
  assert.match(utils, /if \(textHasTamil\(part\)\) return part/);
});

check("Noto Tamil is registered with Identity-H", () => {
  const font = read("src/lib/pdf-tamil-font.ts");
  assert.match(font, /addFont\(VFS_REGULAR, PDF_FONT_NOTO_TAMIL, "normal", "Identity-H"\)/);
  assert.match(font, /addFont\(VFS_BOLD, PDF_FONT_NOTO_TAMIL, "bold", "Identity-H"\)/);
});

console.log("All Tamil PDF shaping checks passed.");
