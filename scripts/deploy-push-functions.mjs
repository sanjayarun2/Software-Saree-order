import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const root = join(__dirname, "..");
const projectRef = "rzwbpjjayarptlwjfpzm";
const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();

if (!token?.startsWith("sbp_")) {
  console.error("Set SUPABASE_ACCESS_TOKEN (sbp_...) from https://supabase.com/dashboard/account/tokens");
  process.exit(1);
}

function collectFiles(dir, base = dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...collectFiles(full, base));
    } else {
      out.push({
        name: relative(base, full).replace(/\\/g, "/"),
        content: readFileSync(full, "utf8"),
      });
    }
  }
  return out;
}

async function deploy(name, verifyJwt) {
  const fnDir = join(root, "supabase", "functions", name);
  const files = collectFiles(fnDir);
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/functions/deploy?slug=${name}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        slug: name,
        name,
        entrypoint_path: "index.ts",
        verify_jwt: verifyJwt,
        files,
      }),
    }
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`${name}: ${res.status} ${text}`);
  console.log("Deployed:", name, text.slice(0, 200));
}

await deploy("notify-velo-order-push", false);
await deploy("poll-velo-order-push", false);
console.log("Done.");
