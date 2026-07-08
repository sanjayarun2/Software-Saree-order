import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const projectRef = "rzwbpjjayarptlwjfpzm";
const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();

if (!token?.startsWith("sbp_")) {
  console.error("Set SUPABASE_ACCESS_TOKEN (sbp_...) from https://supabase.com/dashboard/account/tokens");
  process.exit(1);
}

const fcmJson = readFileSync(resolve(root, "scripts/fcm-service-account.json"), "utf8").trim();
const webhookSecret =
  process.env.VELO_PUSH_WEBHOOK_SECRET?.trim() ||
  "b36abebcb3c11dfa0cdf385204ca66392ad6ded96844f97451598286609746b4";

async function setSecrets(entries) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/secrets`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(entries.map(({ name, value }) => ({ name, value }))),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Secrets: ${res.status} ${text}`);
  }
  for (const { name } of entries) {
    console.log("Set secret:", name);
  }
}

await setSecrets([
  { name: "FCM_SERVICE_ACCOUNT_JSON", value: fcmJson },
  { name: "VELO_PUSH_WEBHOOK_SECRET", value: webhookSecret },
]);
console.log("Supabase edge secrets configured.");
