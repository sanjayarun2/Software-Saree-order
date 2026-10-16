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
const MOBILE_RE = /(?:\+?91[ \t\-.]*)?0?([6-9](?:[ \t\-.]*\d){9})/g;
const PINCODE_LABELED_RE =
  /\b(?:pin\s*code|pincode|pin)\s*[:.\-]?\s*([1-9]\d{5})\b/gi;
const PINCODE_BARE_RE = /\b([1-9]\d{5})\b/g;
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

function formatMobNoLine(digits10, index = 1, total = 1) {
  const d = digits10.replace(/\D/g, "").slice(-10);
  const n = Math.max(1, Math.floor(index));
  const count = Math.max(1, Math.floor(total));
  if (count <= 1) return `Mob No : ${d}`;
  return `Mob No${n} : ${d}`;
}

function formatPincodeLine(pin6) {
  const d = String(pin6 ?? "").replace(/\D/g, "").slice(0, 6);
  return `Pincode : ${d}`;
}

function normalizePincodeDigits(raw) {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length === 6 && /^[1-9]\d{5}$/.test(digits)) return digits;
  return null;
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

function extractMobileOccurrences(text) {
  const found = [];
  const re = new RegExp(MOBILE_RE.source, "g");
  let m;
  while ((m = re.exec(String(text ?? ""))) !== null) {
    const digits = normalizeMobileDigits(m[1] ?? m[0]);
    if (digits) found.push(digits);
  }
  return found;
}

function extractMobiles(text) {
  const found = [];
  const seen = new Set();
  for (const digits of extractMobileOccurrences(text)) {
    if (!seen.has(digits)) {
      seen.add(digits);
      found.push(digits);
    }
  }
  return found;
}

/** Address mobiles in order; booked/fallback only if address has none. */
function resolveToMobileDigitsList(addressText, fallbackMobile) {
  const fromAddress = extractMobiles(addressText);
  if (fromAddress.length > 0) return fromAddress;
  const fallback = normalizeMobileDigits(fallbackMobile ?? "");
  return fallback ? [fallback] : [];
}

function resolveToMobileDigits(addressText, fallbackMobile) {
  const all = resolveToMobileDigitsList(addressText, fallbackMobile);
  return all.length ? all[all.length - 1] : null;
}

function extractPincodeOccurrences(text) {
  const withoutMobile = String(text ?? "").replace(new RegExp(MOBILE_RE.source, "g"), " ");
  const found = [];
  const labeled = new RegExp(PINCODE_LABELED_RE.source, "gi");
  let m;
  while ((m = labeled.exec(withoutMobile)) !== null) {
    const pin = normalizePincodeDigits(m[1] ?? "");
    if (pin) found.push(pin);
  }
  const bare = new RegExp(PINCODE_BARE_RE.source, "g");
  while ((m = bare.exec(withoutMobile)) !== null) {
    const pin = normalizePincodeDigits(m[1] ?? "");
    if (pin) found.push(pin);
  }
  return found;
}

function resolveToPincodeDigits(addressText) {
  const all = extractPincodeOccurrences(addressText);
  return all.length ? all[all.length - 1] : null;
}

function stripMobilesFromText(text) {
  return text
    .replace(MOBILE_RE, " ")
    .replace(
      /\b(?:Mob(?:ile)?|Ph(?:one)?|Tel|Cell)\s*(?:No\.?\d*|Number|#)?\s*[:.\-]?\s*/gi,
      " "
    )
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\(\s*\)/g, "")
    .trim();
}

function stripPincodesFromText(text) {
  return text
    .replace(PINCODE_LABELED_RE, " ")
    .replace(PINCODE_BARE_RE, " ")
    .replace(/\b(?:pin\s*code|pincode|pin)\s*[:.\-]*\s*$/gi, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/,\s*,/g, ",")
    .replace(/^[,\-\s]+|[,\-\s]+$/g, "")
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
  const mobiles = resolveToMobileDigitsList(raw, options.fallbackMobile);
  const pincode = resolveToPincodeDigits(raw);

  const lines = raw
    .split("\n")
    .filter(Boolean)
    .map((line) => stripEmailsFromText(line))
    .map((line) => stripMobilesFromText(line))
    .map((line) => stripPincodesFromText(line))
    .map((line) => expandCountryInToIndia(line))
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const cleaned = lines.filter(
    (line) =>
      !/^(?:e-?mail|mob(?:ile)?(?:\s*no\.?\d*)?|ph(?:one)?|tel|cell|web\s*#?|pin(?:\s*code)?|pincode)\s*[:.\-]*$/i.test(
        line
      )
  );

  if (pincode) cleaned.push(formatPincodeLine(pincode));
  mobiles.forEach((mobile, i) =>
    cleaned.push(formatMobNoLine(mobile, i + 1, mobiles.length))
  );
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
  assert.equal(out.split("\n").pop(), "Mob No : 9876543210");
});

check("TO uses fallback mobile when address has none", () => {
  const out = sanitizePdfAddress("Anita\nChennai, Tamil Nadu, IN", "to", {
    fallbackMobile: "+91 98765 43210",
  });
  assert.ok(!/Web\s*#/i.test(out));
  assert.match(out, /India/);
  assert.equal(out.split("\n").pop(), "Mob No : 9876543210");
});

check("pasted address mobile wins over booked/fallback", () => {
  const out = sanitizePdfAddress(
    "Anita\n12 Street, Chennai\n9999911111",
    "to",
    { fallbackMobile: "8888822222" }
  );
  assert.equal(out.split("\n").pop(), "Mob No : 9999911111");
  assert.ok(!/8888822222/.test(out));
});

check("two mobiles labeled Mob No1 and Mob No2", () => {
  const out = sanitizePdfAddress(
    "Anita\nChennai\nCell: 8888822222, 9999911111\n600001",
    "to",
    { fallbackMobile: "7777733333" }
  );
  const lines = out.split("\n");
  const mobLines = lines.filter((l) => /^Mob No\d*\s*:/i.test(l));
  assert.deepEqual(mobLines, ["Mob No1 : 8888822222", "Mob No2 : 9999911111"]);
  assert.equal(lines[lines.length - 3], "Pincode : 600001");
  assert.ok(!/7777733333/.test(out));
});

check("old Mob No + new number becomes Mob No1 and Mob No2", () => {
  const out = sanitizePdfAddress(
    "Anita\nChennai\nMob No : 8888822222\n9999911111",
    "to",
    { fallbackMobile: "7777733333" }
  );
  const mobLines = out.split("\n").filter((l) => /^Mob No\d*\s*:/i.test(l));
  assert.deepEqual(mobLines, ["Mob No1 : 8888822222", "Mob No2 : 9999911111"]);
});

check("Cell: number moves to Mob No and empty Cell title is dropped", () => {
  const out = sanitizePdfAddress(
    `Indhu
40, S1 golden flats,
Sundaram colony 2nd
Street
Selaiyur
Chennai
Cell: 9087011288
600073`,
    "to"
  );
  const lines = out.split("\n");
  assert.ok(!lines.some((l) => /^Cell\s*:?\s*$/i.test(l)), `leftover Cell title: ${out}`);
  assert.ok(!/\bCell\b/i.test(out), `Cell label must not remain: ${out}`);
  assert.equal(lines[lines.length - 1], "Mob No : 9087011288");
  assert.equal(lines[lines.length - 2], "Pincode : 600073");
  assert.ok(out.includes("Indhu"));
  assert.ok(out.includes("Selaiyur"));
});

check("Murugesan Cell: does not leave blank Cell: on label", () => {
  const out = sanitizePdfAddress(
    `Murugesan , 247,
street , rettaiyurani ,
Ramanathapuram ,
tamilnadu
Cell: 8220091932
623534`,
    "to"
  );
  assert.ok(!/^Cell\s*:?\s*$/im.test(out), `empty Cell remains:\n${out}`);
  assert.ok(!/\bCell\b/i.test(out));
  assert.equal(out.split("\n").pop(), "Mob No : 8220091932");
  assert.ok(out.includes("Pincode : 623534"));
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
  const lines = out.split("\n");
  assert.equal(lines[lines.length - 1], "Mob No : 9876543210");
  assert.equal(lines[lines.length - 2], "Pincode : 600001");
});

check("bare pincode becomes Pincode line before Mob No", () => {
  const out = sanitizePdfAddress(
    "Anita\n12 Street, Coimbatore 641402\n9876543210",
    "to"
  );
  const lines = out.split("\n");
  assert.equal(lines[lines.length - 1], "Mob No : 9876543210");
  assert.equal(lines[lines.length - 2], "Pincode : 641402");
  assert.ok(!/641402/.test(lines.slice(0, -2).join("\n")));
});

check("existing Pincode : phrase is not duplicated", () => {
  const out = sanitizePdfAddress(
    "Anita\nChennai\nPincode : 600001\nPincode : 600001\n9876543210",
    "to"
  );
  const lines = out.split("\n");
  const pinLines = lines.filter((l) => /^Pincode\s*:/i.test(l));
  assert.equal(pinLines.length, 1);
  assert.equal(pinLines[0], "Pincode : 600001");
  assert.equal(lines[lines.length - 1], "Mob No : 9876543210");
  assert.equal(lines[lines.length - 2], "Pincode : 600001");
});

check("idempotent sanitize", () => {
  const once = sanitizePdfAddress(
    "Anita\nChennai, IN 600001\nWeb # X\nanita@x.com\n+91-9876543210",
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
    "formatPincodeLine",
  ]) {
    assert.ok(src.includes(`export function ${name}`), `missing ${name}`);
  }
  assert.ok(src.includes("Tel|Cell"), "source must strip Cell labels with Mob/Phone/Tel");
  assert.ok(src.includes("tel|cell|web"), "source must drop empty Cell: title lines");
  assert.ok(src.includes("resolveToMobileDigitsList"), "must export multi-mobile helper");
  assert.ok(
    src.includes("formatMobNoLine(mobile, i + 1, mobiles.length)"),
    "sanitize must pass mobile count for Mob No vs Mob No1/2"
  );
  assert.ok(src.includes("count <= 1"), "single mobile stays Mob No without number");
  const velo = readFileSync(
    resolve(__dirname, "../src/lib/velo-website-sync.ts"),
    "utf8"
  );
  assert.ok(velo.includes("buildWebsiteToAddress"));
  assert.ok(!/parts\.push\(`Web #/.test(velo));
});

check("PDF fit keeps Pincode + Mob No footer when over cap", () => {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const pdfSrc = readFileSync(resolve(__dirname, "../src/lib/pdf-utils.ts"), "utf8");
  assert.ok(pdfSrc.includes("isMobNoLine"), "fit must detect Mob No footer");
  assert.ok(pdfSrc.includes("isPincodeLine"), "fit must detect Pincode footer");
  assert.ok(
    pdfSrc.includes("LABEL_TO_ADDRESS_GAP_MM = 9"),
    "FROM/TO label gap should be 9mm"
  );
  assert.ok(
    pdfSrc.includes("export function fitAddressLinesToColumn"),
    "fitAddressLinesToColumn should be exported"
  );
  assert.ok(
    pdfSrc.includes("maxAddressLinesForY") &&
      pdfSrc.includes("Never drops characters"),
    "TO fit should expand vertically / shrink font without dropping address text"
  );

  function softBreakLongRuns(text, chunkSize = 14) {
    return text
      .split(/(\s+)/)
      .map((part) => {
        if (part.trim().length === 0 || part.length <= chunkSize) return part;
        const chunks = [];
        for (let i = 0; i < part.length; i += chunkSize) chunks.push(part.slice(i, i + chunkSize));
        return chunks.join(" ");
      })
      .join("");
  }
  function fit(wrapped, maxLines, maxW = 80) {
    if (wrapped.length <= maxLines) return wrapped;
    const isMob = (l) => /^\(?\s*Mob No\d*\s*:/i.test(String(l ?? "").trim());
    const isPin = (l) => /^\(?\s*Pincode\s*:/i.test(String(l ?? "").trim());
    const footer = [];
    const body = [...wrapped];
    while (body.length && isMob(body[body.length - 1])) footer.unshift(body.pop());
    if (body.length && isPin(body[body.length - 1])) footer.unshift(body.pop());
    const split = (s) => {
      const out = [];
      let cur = "";
      for (const word of softBreakLongRuns(s).split(/\s+/)) {
        const next = cur ? `${cur} ${word}` : word;
        if (next.length > maxW && cur) {
          out.push(cur);
          cur = word;
        } else cur = next;
      }
      if (cur) out.push(cur);
      return out.length ? out : [s];
    };
    if (footer.length && maxLines > footer.length) {
      const fittedFooter = footer.map((l) => split(l.trim())[0] ?? l.trim());
      const bodyMax = maxLines - fittedFooter.length;
      if (body.length <= bodyMax) return [...body, ...fittedFooter];
      const head = body.slice(0, bodyMax - 1);
      const overflowFirst = split(body.slice(bodyMax - 1).join(" "))[0];
      return [...head, overflowFirst, ...fittedFooter];
    }
    return wrapped.slice(0, maxLines);
  }

  assert.ok(
    pdfSrc.includes("while (body.length && isMobNoLine"),
    "fit must peel every trailing Mob No line"
  );
  assert.ok(
    pdfSrc.includes("Mob No\\d*") || pdfSrc.includes("Mob No\\d*\\s*:"),
    "fit must recognize Mob No1 / Mob No2"
  );

  const longTo = [
    "A. Priyanga",
    "AMEYA FOOD COMPANY,",
    "37, Amaravathy Nagar, 1st Street,",
    "Chinna Thottipalayam, Coimbatore, Tamil",
    "Nadu, India",
    "Extra area line that forces overflow",
    "Another overflow line",
    "Pincode : 641402",
    "Mob No1 : 9876543210",
    "Mob No2 : 9087011288",
  ];
  const fitted = fit(longTo, 8);
  assert.equal(fitted.length, 8);
  assert.equal(fitted[fitted.length - 1], "Mob No2 : 9087011288");
  assert.equal(fitted[fitted.length - 2], "Mob No1 : 9876543210");
  assert.equal(fitted[fitted.length - 3], "Pincode : 641402");
  assert.ok(!fitted.some((l) => /\(Mob$/.test(l) || /^Mob$/.test(l)), "must not truncate mid Mob");
  assert.ok(
    !fitted.some((l) => /India\s*\(?\s*Mob/.test(l)),
    "must not glue India + Mob on one truncated line"
  );
});

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nAll PDF/Velo TO sanitize checks passed.");
