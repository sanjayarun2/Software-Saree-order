/**
 * Validate PDF + Velo TO address sanitization (Web # removed, Mob No last line).
 * Run: node scripts/validate-pdf-address-sanitize.mjs
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REGISTERED_MARK_RE =
  /\u00AE|\u24C7|\(R\)|\(r\)|\s*Registered\s*(?:Trademark|Trade\s*Mark)?/gi;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const GSTIN_LINE_RE =
  /^\s*(?:GST\s*(?:IN|No\.?|Number|#)?|GSTIN)\s*[:.\-]?\s*[0-9A-Z]{15}\s*$/i;
const GSTIN_INLINE_RE =
  /(?:GST\s*(?:IN|No\.?|Number|#)?|GSTIN)\s*[:.\-]?\s*[0-9A-Z]{15}/gi;
const MOBILE_RE = /(?:\+?91[\s\-.]*)?0?([6-9](?:[\s\-.]*\d){9})/g;
const WEB_ORDER_LINE_RE =
  /^(?:web\s*#|web\s*order|website\s*order|order\s*#?\s*web)\b/i;

function stripRegisteredSymbol(text) {
  return String(text ?? "")
    .replace(REGISTERED_MARK_RE, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function sanitizePdfBrandText(text) {
  return stripRegisteredSymbol(text)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n");
}

function formatMobNoLine(digits10) {
  const d = digits10.replace(/\D/g, "").slice(-10);
  return `(Mob No : ${d})`;
}

function normalizeMobileDigits(raw) {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length === 10 && /^[6-9]/.test(digits)) return digits;
  if (digits.length === 12 && digits.startsWith("91") && /^[6-9]/.test(digits.slice(2))) {
    return digits.slice(2);
  }
  if (digits.length === 11 && digits.startsWith("0") && /^[6-9]/.test(digits.slice(1))) {
    return digits.slice(1);
  }
  return null;
}

function extractMobiles(text) {
  const found = [];
  const seen = new Set();
  const re = new RegExp(MOBILE_RE.source, "g");
  let m;
  while ((m = re.exec(text)) !== null) {
    const digits = normalizeMobileDigits(m[1] ?? m[0]);
    if (digits && !seen.has(digits)) {
      seen.add(digits);
      found.push(digits);
    }
  }
  return found;
}

function stripMobilesFromText(text) {
  return text
    .replace(MOBILE_RE, " ")
    .replace(/\b(?:Mob(?:ile)?|Ph(?:one)?|Tel)\s*(?:No\.?|Number|#)?\s*[:.\-]?\s*/gi, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\(\s*\)/g, "")
    .trim();
}

function stripEmailsFromText(text) {
  return text.replace(EMAIL_RE, " ").replace(/[ \t]{2,}/g, " ").trim();
}

function stripGstinFromText(text) {
  return text.replace(GSTIN_INLINE_RE, " ").replace(/[ \t]{2,}/g, " ").trim();
}

function expandCountryInToIndia(text) {
  return text
    .replace(/,\s*IN\s*$/g, ", India")
    .replace(/,\s*IN\s+(?=\d{6}\b)/g, ", India ")
    .replace(/(^|[\s])IN\s+(?=\d{6}\b)/g, "$1India ")
    .replace(/(^|[\s])IN$/g, "$1India")
    .replace(/^IN$/g, "India");
}

function tidyLines(text) {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trim().replace(/[ \t]{2,}/g, " "))
    .filter((l) => l.length > 0)
    .join("\n");
}

function stripWebOrderMentions(text) {
  return tidyLines(
    String(text ?? "")
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map((line) =>
        line
          .replace(/\bWeb\s*#\s*\S+/gi, " ")
          .replace(/\b(?:web|website)\s+order\b/gi, " ")
          .replace(/[ \t]{2,}/g, " ")
          .trim()
      )
      .filter((line) => line.length > 0 && !WEB_ORDER_LINE_RE.test(line))
      .join("\n")
  );
}

function sanitizePdfAddress(text, role, options = {}) {
  let raw = tidyLines(stripRegisteredSymbol(text));
  if (!raw && role === "from") return "";

  if (role === "from") {
    const lines = raw
      .split("\n")
      .map((line) => stripGstinFromText(line))
      .filter((line) => line.length > 0 && !GSTIN_LINE_RE.test(line));
    return tidyLines(lines.join("\n"));
  }

  raw = stripWebOrderMentions(raw);
  const mobilesFromText = extractMobiles(raw);
  const fallback = normalizeMobileDigits(options.fallbackMobile ?? "");
  const mobile = mobilesFromText[0] ?? fallback ?? null;

  const lines = raw
    .split("\n")
    .filter(Boolean)
    .map((line) => stripEmailsFromText(line))
    .map((line) => stripMobilesFromText(line))
    .map((line) => expandCountryInToIndia(line))
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const cleaned = lines.filter(
    (line) => !/^(?:e-?mail|mob(?:ile)?|ph(?:one)?|tel|web\s*#?)\s*[:.\-]*$/i.test(line)
  );

  if (mobile) cleaned.push(formatMobNoLine(mobile));
  return tidyLines(cleaned.join("\n"));
}

function buildWebsiteToAddress(opts) {
  const parts = [];
  if (opts.customerName?.trim()) parts.push(opts.customerName.trim());
  if (opts.addressText?.trim()) {
    parts.push(...opts.addressText.split(/\n+/).map((l) => l.trim()).filter(Boolean));
  }
  return sanitizePdfAddress(parts.join("\n"), "to", {
    fallbackMobile: opts.mobile,
  }).slice(0, opts.maxLen ?? 600);
}

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

check("brand strips ® and (R)", () => {
  assert.equal(sanitizePdfBrandText("Sakthi Textiles®"), "Sakthi Textiles");
});

check("FROM removes GSTIN", () => {
  const out = sanitizePdfAddress(
    "Sakthi Textiles®\n12 Main Road\nGSTIN: 33AAAAA0000A1Z5\nCoimbatore",
    "from"
  );
  assert.ok(!/GSTIN/i.test(out));
  assert.ok(!/®/.test(out));
});

check("TO removes email and Web #", () => {
  const out = sanitizePdfAddress(
    "Anita\nChennai\nemail: anita@shop.com\nWeb # ABC123\n9876543210",
    "to"
  );
  assert.ok(!/@/.test(out));
  assert.ok(!/Web\s*#/i.test(out));
  assert.equal(out.split("\n").pop(), "(Mob No : 9876543210)");
});

check("TO uses fallback mobile when address has none", () => {
  const out = sanitizePdfAddress("Anita\nChennai, Tamil Nadu, IN", "to", {
    fallbackMobile: "+91 98765 43210",
  });
  assert.ok(!/Web\s*#/i.test(out));
  assert.match(out, /India/);
  assert.equal(out.split("\n").pop(), "(Mob No : 9876543210)");
});

check("Velo TO builder has no Web # / Items and ends with Mob No", () => {
  const out = buildWebsiteToAddress({
    customerName: "Anita",
    addressText: "12 Street, Chennai, IN 600001",
    mobile: "9876543210",
  });
  assert.ok(!/Web\s*#/i.test(out));
  assert.ok(!/Items:/i.test(out));
  assert.ok(out.startsWith("Anita"));
  assert.equal(out.split("\n").pop(), "(Mob No : 9876543210)");
});

check("idempotent sanitize", () => {
  const once = sanitizePdfAddress(
    "Anita\nChennai, IN\nWeb # X\nanita@x.com\n+91-9876543210",
    "to"
  );
  const twice = sanitizePdfAddress(once, "to");
  assert.equal(once, twice);
});

check("source exports Web/Velo helpers", () => {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(
    resolve(__dirname, "../src/lib/pdf-address-sanitize.ts"),
    "utf8"
  );
  for (const name of [
    "sanitizePdfAddress",
    "buildWebsiteToAddress",
    "stripWebOrderMentions",
    "formatMobNoLine",
  ]) {
    assert.ok(src.includes(`export function ${name}`), `missing ${name}`);
  }
  const velo = readFileSync(
    resolve(__dirname, "../src/lib/velo-website-sync.ts"),
    "utf8"
  );
  assert.ok(velo.includes("buildWebsiteToAddress"));
  assert.ok(!/parts\.push\(`Web #/.test(velo));
});

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nAll PDF/Velo TO sanitize checks passed.");
