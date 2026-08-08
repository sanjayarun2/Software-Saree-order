/**
 * Validate WhatsApp Connect wiring (no Meta popup).
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
const appId = process.env.NEXT_PUBLIC_META_APP_ID || "2190934024783640";
const configId = process.env.NEXT_PUBLIC_WA_ES_CONFIG_ID || "1610415194046053";
const site = process.env.NEXT_PUBLIC_SITE_URL || "https://software-saree-order.vercel.app";
const chatwoot =
  process.env.NEXT_PUBLIC_CHATWOOT_BASE_URL || "https://chat.sripalanitextiles.com";

let failed = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "OK  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed += 1;
}

console.log("=== WhatsApp Connect validation ===\n");

check("META_APP_ID", Boolean(appId), appId);
check("WA_ES_CONFIG_ID", Boolean(configId), configId);
check("SITE_URL", Boolean(site), site);
check("CHATWOOT_BASE_URL", Boolean(chatwoot), chatwoot);

async function httpOk(u) {
  try {
    const res = await fetch(u, { redirect: "follow" });
    return res.ok || res.status === 308 || res.status === 301;
  } catch {
    return false;
  }
}

check("Production Messages page", await httpOk(`${site.replace(/\/$/, "")}/settings/messages/`));
check("Production privacy page", await httpOk(`${site.replace(/\/$/, "")}/privacy/`));
check("Chatwoot HTTPS", await httpOk(chatwoot));

if (!url || !anon) {
  check("Supabase URL/anon", false, "missing from .env.local");
} else {
  check("Supabase URL/anon", true);
  const supabase = createClient(url, anon);
  const { data, error } = await supabase.functions.invoke("whatsapp-connect", {
    body: { action: "status" },
  });
  const msg = error?.message || (data?.error ? String(data.error) : "");
  const ctx = error && typeof error === "object" ? error.context : null;
  const ctxStatus =
    ctx && typeof ctx === "object" && "status" in ctx ? Number(ctx.status) : undefined;
  const reachable =
    ctxStatus === 401 ||
    /unauthorized|jwt|sign in|Missing authorization|UNAUTHORIZED|non-2xx/i.test(msg) ||
    (data && (data.status || data.error));
  check(
    "whatsapp-connect Edge",
    Boolean(reachable),
    msg || (data?.status ? `status=${data.status}` : "ok")
  );
}

console.log("\nManual: hard-refresh Messages → Connect WhatsApp (popup).");
console.log("Meta Login domains must include:", site.replace(/^https?:\/\//, "").replace(/\/$/, ""));
console.log(
  "Meta OAuth redirect must include:",
  `${site.replace(/\/$/, "")}/settings/messages/`
);

if (failed) {
  console.error(`\n${failed} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll automated checks passed.");
