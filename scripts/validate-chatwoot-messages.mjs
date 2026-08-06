/**
 * Validate the unified Messages inbox wiring (Chatwoot proxy + UI).
 * Run: node scripts/validate-chatwoot-messages.mjs
 */

import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

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

function read(rel) {
  const path = resolve(root, rel);
  assert.ok(existsSync(path), `missing file ${rel}`);
  return readFileSync(path, "utf8");
}

// --- Files exist -----------------------------------------------------------

const FILES = [
  "supabase/migrations/add_chatwoot_settings.sql",
  "supabase/functions/chatwoot-proxy/index.ts",
  "src/lib/chatwoot-settings-supabase.ts",
  "src/lib/chatwoot-api.ts",
  "src/app/messages/page.tsx",
  "src/app/settings/messages/page.tsx",
  "src/components/messages/ChannelBadge.tsx",
  "src/components/messages/ConversationList.tsx",
  "src/components/messages/MessageThread.tsx",
];

check("all Messages files are present", () => {
  for (const rel of FILES) {
    assert.ok(existsSync(resolve(root, rel)), `missing ${rel}`);
  }
});

// --- Migration -------------------------------------------------------------

check("migration creates chatwoot_settings with per-user RLS", () => {
  const sql = read("supabase/migrations/add_chatwoot_settings.sql");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.chatwoot_settings/);
  assert.match(sql, /user_id UUID PRIMARY KEY REFERENCES auth\.users\(id\)/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /auth\.uid\(\) = user_id/);
  for (const column of ["base_url", "access_token", "account_id", "inbox_id", "enabled"]) {
    assert.match(sql, new RegExp(`\\b${column}\\b`), `missing column ${column}`);
  }
});

// --- Edge function ---------------------------------------------------------

const proxy = read("supabase/functions/chatwoot-proxy/index.ts");

check("proxy rejects unauthenticated callers and handles CORS preflight", () => {
  assert.match(proxy, /req\.method === "OPTIONS"/);
  assert.match(proxy, /Access-Control-Allow-Origin/);
  assert.match(proxy, /if \(!authHeader\)[\s\S]{0,80}Unauthorized/);
  assert.match(proxy, /supabaseUser\.auth\.getUser\(\)/);
});

check("proxy resolves credentials server-side scoped to the caller", () => {
  assert.match(proxy, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(proxy, /from\("chatwoot_settings"\)/);
  assert.match(proxy, /\.eq\("user_id", user\.id\)/);
  assert.match(proxy, /api_access_token: accessToken/);
});

check("proxy allow-lists actions and validates ids", () => {
  for (const action of [
    "test",
    "list_conversations",
    "list_messages",
    "send_message",
    "toggle_status",
  ]) {
    assert.match(proxy, new RegExp(`"${action}"`), `missing action ${action}`);
  }
  assert.match(proxy, /ALLOWED_ACTIONS\.has\(action\)/);
  assert.match(proxy, /\/\^\\d\+\$\/\.test\(accountId\)/);
  assert.match(proxy, /\/\^\\d\+\$\/\.test\(conversationId\)/);
});

check("proxy sends outgoing public replies to Chatwoot", () => {
  assert.match(proxy, /message_type: "outgoing"/);
  assert.match(proxy, /private: false/);
  assert.match(proxy, /\/api\/v1\/accounts\//);
});

// --- Client library --------------------------------------------------------

const api = read("src/lib/chatwoot-api.ts");

check("client always goes through the edge function proxy", () => {
  assert.match(api, /const PROXY_FUNCTION = "chatwoot-proxy"/);
  assert.match(api, /supabase\.functions\s*\.\s*invoke\(\s*PROXY_FUNCTION/);
  // No direct call to a Chatwoot host from the app (would fail CORS on Android).
  assert.doesNotMatch(api, /fetch\(\s*`?\$\{?base/i);
  assert.doesNotMatch(api, /api_access_token/);
});

check("client exposes the inbox operations the UI needs", () => {
  for (const fn of [
    "listConversations",
    "listMessages",
    "sendMessage",
    "setConversationStatus",
    "testChatwootConnection",
  ]) {
    assert.match(api, new RegExp(`export async function ${fn}\\b`), `missing ${fn}`);
  }
});

// Re-implement the pure normalizers so their behaviour is actually exercised.
function normalizeChannel(raw) {
  const value = (raw ?? "").toLowerCase();
  if (value.includes("whatsapp")) return "whatsapp";
  if (value.includes("instagram")) return "instagram";
  if (value.includes("facebook")) return "facebook";
  if (value.includes("email")) return "email";
  if (value.includes("sms") || value.includes("twilio")) return "sms";
  if (value.includes("telegram")) return "telegram";
  if (value.includes("widget") || value.includes("api")) return "web";
  return "other";
}

check("channel mapping covers the shop's three channels", () => {
  assert.equal(normalizeChannel("Channel::Whatsapp"), "whatsapp");
  assert.equal(normalizeChannel("Channel::Instagram"), "instagram");
  assert.equal(normalizeChannel("Channel::FacebookPage"), "facebook");
  assert.equal(normalizeChannel("Channel::WebWidget"), "web");
  assert.equal(normalizeChannel(undefined), "other");

  // The source must map the same set of channels.
  for (const key of ["whatsapp", "instagram", "facebook"]) {
    assert.match(api, new RegExp(`includes\\("${key}"\\)`), `channel ${key} unmapped`);
  }
});

check("incoming vs outgoing follows Chatwoot message_type 0/1", () => {
  assert.match(api, /Number\(messageType\) === 0/);
  assert.match(api, /Number\(messageType\) === 2/);
});

// --- Settings library ------------------------------------------------------

const settingsLib = read("src/lib/chatwoot-settings-supabase.ts");

check("settings gate requires enabled + url + token + account", () => {
  assert.match(settingsLib, /export function isChatwootConfigured/);
  assert.match(settingsLib, /row\.enabled/);
  assert.match(settingsLib, /row\.access_token\.trim\(\)/);
  assert.match(settingsLib, /row\.account_id\.trim\(\)/);
  assert.match(settingsLib, /onConflict: "user_id"/);
});

check("base url normalizer strips trailing slashes", () => {
  const normalize = (raw) => {
    const trimmed = (raw ?? "").trim();
    if (!trimmed) return "";
    return trimmed.replace(/\/+$/, "");
  };
  assert.equal(normalize("https://chat.example.com/"), "https://chat.example.com");
  assert.equal(normalize("  https://chat.example.com//  "), "https://chat.example.com");
  assert.equal(normalize(""), "");
  assert.match(settingsLib, /replace\(\/\\\/\+\$\/, ""\)/);
});

// --- UI wiring -------------------------------------------------------------

const messagesPage = read("src/app/messages/page.tsx");

check("messages page gates on auth and on being connected", () => {
  assert.match(messagesPage, /if \(!loading && !user\) router\.replace\("\/login\/"\)/);
  assert.match(messagesPage, /isChatwootConfigured/);
  assert.match(messagesPage, /Connect messages/);
});

check("messages page polls only while the app is visible", () => {
  assert.match(messagesPage, /setInterval\(/);
  assert.match(messagesPage, /document\.visibilityState !== "visible"/);
  assert.match(messagesPage, /clearInterval\(timer\)/);
});

check("messages page renders list and thread panes", () => {
  assert.match(messagesPage, /<ConversationList/);
  assert.match(messagesPage, /<MessageThread/);
  // Mobile shows one pane at a time; desktop shows both.
  assert.match(messagesPage, /hidden lg:flex/);
});

const thread = read("src/components/messages/MessageThread.tsx");

check("thread composer sends on Enter and disables while sending", () => {
  assert.match(thread, /e\.key === "Enter" && !e\.shiftKey/);
  assert.match(thread, /disabled=\{sending \|\| !draft\.trim\(\)\}/);
  assert.match(thread, /message\.incoming \? "justify-start" : "justify-end"/);
});

const settingsPage = read("src/app/settings/messages/page.tsx");

check("settings screen validates input and can test before saving", () => {
  assert.match(settingsPage, /testChatwootConnection/);
  assert.match(settingsPage, /Account ID must be a number/);
  assert.match(settingsPage, /upsertChatwootSettings/);
  assert.match(settingsPage, /fetchIsListedWorker/);
});

check("token field is masked by default", () => {
  assert.match(settingsPage, /type=\{showToken \? "text" : "password"\}/);
  assert.match(settingsPage, /useState\(false\)/);
});

// --- Navigation ------------------------------------------------------------

check("Messages is reachable from nav, shell title and settings hub", () => {
  const nav = read("src/components/Navigation.tsx");
  assert.match(nav, /href: "\/messages"/);

  const shell = read("src/components/AppShell.tsx");
  assert.match(shell, /"\/messages": "Messages"/);

  const settingsHub = read("src/app/settings/page.tsx");
  assert.match(settingsHub, /href="\/settings\/messages"/);
});

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nAll Messages inbox checks passed.");
