/**
 * Smoke-check WhatsApp connect wiring (no Meta popup).
 * Usage: node scripts/validate-whatsapp-connect.mjs
 */
import { createClient } from "@supabase/supabase-js";
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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const appId = process.env.NEXT_PUBLIC_META_APP_ID || "";
const configId = process.env.NEXT_PUBLIC_WA_ES_CONFIG_ID || "";

const checks = [];
checks.push(["NEXT_PUBLIC_SUPABASE_URL", Boolean(url)]);
checks.push(["NEXT_PUBLIC_SUPABASE_ANON_KEY", Boolean(anon)]);
checks.push(["NEXT_PUBLIC_META_APP_ID", Boolean(appId)]);
checks.push(["NEXT_PUBLIC_WA_ES_CONFIG_ID", Boolean(configId)]);
checks.push(["NEXT_PUBLIC_CHATWOOT_BASE_URL", Boolean(process.env.NEXT_PUBLIC_CHATWOOT_BASE_URL)]);

console.log("Public config:");
for (const [name, ok] of checks) {
  console.log(`  ${ok ? "OK" : "MISSING"}  ${name}`);
}

if (!url || !anon) {
  console.error("Cannot probe Edge Functions without Supabase URL/anon key.");
  process.exit(1);
}

const supabase = createClient(url, anon);
const { data, error } = await supabase.functions.invoke("whatsapp-connect", {
  body: { action: "status" },
});

if (error) {
  // Unauthenticated is expected without a user session — proves the function exists.
  const msg = error.message || String(error);
  if (/unauthorized|jwt|sign in/i.test(msg)) {
    console.log("whatsapp-connect: reachable (auth required) — OK");
  } else if (/not found|404/i.test(msg)) {
    console.error("whatsapp-connect: NOT DEPLOYED");
    process.exit(1);
  } else {
    console.log("whatsapp-connect invoke:", msg);
    if (data) console.log("body:", data);
  }
} else if (data?.error && /sign in|unauthorized/i.test(String(data.error))) {
  console.log("whatsapp-connect: reachable (auth required) — OK");
} else {
  console.log("whatsapp-connect status response:", data);
}

if (!appId || !configId) {
  console.log(
    "\nSet NEXT_PUBLIC_META_APP_ID and NEXT_PUBLIC_WA_ES_CONFIG_ID after creating Meta Embedded Signup configuration."
  );
  console.log(
    "Set Edge secrets: META_APP_ID, META_APP_SECRET, CHATWOOT_BASE_URL, CHATWOOT_DEFAULT_ACCOUNT_ID, CHATWOOT_DEFAULT_ACCESS_TOKEN"
  );
}

console.log("\nDone.");
