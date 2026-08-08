/**
 * Set WhatsApp Connect Edge secrets from GCP secrets file or env.
 * Usage:
 *   $env:SUPABASE_ACCESS_TOKEN="sbp_..."
 *   node scripts/set-whatsapp-connect-secrets.mjs
 * Optional: VELO_WA_SECRETS_FILE pointing at velo-wa-connect-secrets.env
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const projectRef = "rzwbpjjayarptlwjfpzm";
const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
if (!token?.startsWith("sbp_")) {
  console.error("Set SUPABASE_ACCESS_TOKEN (sbp_...)");
  process.exit(1);
}

function loadKvFile(path) {
  const out = {};
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    out[m[1]] = m[2];
  }
  return out;
}

const filePath =
  process.env.VELO_WA_SECRETS_FILE ||
  resolve(process.env.TEMP || "/tmp", "velo-wa-connect-secrets.env");
const fromFile = loadKvFile(filePath);

const required = [
  "META_APP_ID",
  "META_APP_SECRET",
  "CHATWOOT_BASE_URL",
  "CHATWOOT_PLATFORM_TOKEN",
];

const entries = [];
for (const name of [
  ...required,
  "CHATWOOT_DEFAULT_ACCOUNT_ID",
  "CHATWOOT_DEFAULT_ACCESS_TOKEN",
  "WA_ES_CONFIG_ID",
  "WA_WEBHOOK_VERIFY_TOKEN",
  "WHATSAPP_CONFIGURATION_ID",
]) {
  const value = (process.env[name] || fromFile[name] || "").trim();
  if (!value && required.includes(name)) {
    console.error(`Missing required secret: ${name}`);
    process.exit(1);
  }
  if (value) entries.push({ name, value });
}

// Always set WhatsApp verify token used by Meta app webhook
if (!entries.some((e) => e.name === "WA_WEBHOOK_VERIFY_TOKEN")) {
  entries.push({
    name: "WA_WEBHOOK_VERIFY_TOKEN",
    value: "2ef952bdcaaa3fcee36ea96c5bc8fe60",
  });
}

const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/secrets`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(entries),
});
const text = await res.text();
if (!res.ok) {
  console.error(res.status, text);
  process.exit(1);
}
for (const { name } of entries) console.log("Set secret:", name);
console.log("Done. Redeploy whatsapp-connect after setting WA_ES_CONFIG_ID.");
