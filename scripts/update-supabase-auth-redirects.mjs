/**
 * Adds native OAuth redirect URL to Supabase Auth allow list.
 * Run: node scripts/update-supabase-auth-redirects.mjs
 */
const projectRef = "rzwbpjjayarptlwjfpzm";
const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
const nativeRedirect = "sareeorder://auth/callback";

if (!token?.startsWith("sbp_")) {
  console.error("Set SUPABASE_ACCESS_TOKEN (sbp_...) from https://supabase.com/dashboard/account/tokens");
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
};

const getRes = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/config/auth`, {
  headers,
});
const text = await getRes.text();
if (!getRes.ok) {
  console.error("GET auth config failed:", getRes.status, text);
  process.exit(1);
}

const current = JSON.parse(text);
const existing = (current.uri_allow_list ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const required = [
  "https://software-saree-order.vercel.app/**",
  "https://software-saree-order.vercel.app/verify-success/**",
  "https://software-saree-order.vercel.app/auth/callback/",
  nativeRedirect,
  `${nativeRedirect}/`,
];

const merged = [...existing];
let added = 0;
for (const url of required) {
  if (!merged.includes(url)) {
    merged.push(url);
    added++;
  }
}

if (added === 0) {
  console.log("Supabase redirect URLs already include native OAuth callback.");
  process.exit(0);
}

const patchRes = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/config/auth`, {
  method: "PATCH",
  headers,
  body: JSON.stringify({ uri_allow_list: merged.join(",") }),
});
const patchText = await patchRes.text();
if (!patchRes.ok) {
  console.error("PATCH auth config failed:", patchRes.status, patchText);
  process.exit(1);
}

console.log("Updated Supabase uri_allow_list. Added:", added);
for (const url of required) {
  if (existing.includes(url)) continue;
  console.log(" +", url);
}
