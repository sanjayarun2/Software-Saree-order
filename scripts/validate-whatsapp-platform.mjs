/**
 * Validates Chatwoot Platform API + stable host (no Meta popup).
 * Usage: node scripts/validate-whatsapp-platform.mjs
 * Env: CHATWOOT_BASE_URL, CHATWOOT_PLATFORM_TOKEN (or read from args)
 */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

function loadEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
}

loadEnvLocal();

const base = (
  process.env.CHATWOOT_BASE_URL ||
  process.env.NEXT_PUBLIC_CHATWOOT_BASE_URL ||
  ""
).replace(/\/+$/, "");
const token = (process.env.CHATWOOT_PLATFORM_TOKEN || "").trim();

if (!base) {
  console.error("MISSING CHATWOOT_BASE_URL / NEXT_PUBLIC_CHATWOOT_BASE_URL");
  process.exit(1);
}

console.log("Chatwoot host:", base);

const health = await fetch(base + "/");
console.log("HTTPS health:", health.status, health.ok ? "OK" : "FAIL");

if (!token) {
  console.log("CHATWOOT_PLATFORM_TOKEN not in env — skip Platform API check.");
  console.log("Set it from GCP /root/velo-wa-connect-secrets.env after deploy.");
  process.exit(health.ok ? 0 : 1);
}

const res = await fetch(`${base}/platform/api/v1/accounts`, {
  method: "POST",
  headers: {
    api_access_token: token,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ name: `Velo Validate ${Date.now()}` }),
});
const created = await res.json().catch(() => ({}));
console.log("Platform create account:", res.status, created?.id ?? created);
if (!res.ok || !created?.id) process.exit(1);

const del = await fetch(`${base}/platform/api/v1/accounts/${created.id}`, {
  method: "DELETE",
  headers: { api_access_token: token },
});
console.log("Platform delete account:", del.status, del.ok ? "OK" : await del.text());

console.log("Platform validation OK");
