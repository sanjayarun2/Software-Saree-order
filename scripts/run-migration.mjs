import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_DB_PASSWORD ||
  process.env.SUPABASE_ACCESS_TOKEN;

if (!url) {
  console.error("Missing SUPABASE_URL");
  process.exit(1);
}
if (!key) {
  console.error(
    "Missing admin credential. Set one of: SUPABASE_SERVICE_ROLE_KEY, SUPABASE_SECRET_KEY, SUPABASE_ACCESS_TOKEN, or SUPABASE_DB_PASSWORD"
  );
  process.exit(1);
}

const migrationName = process.argv[2] || "add_website_api_and_order_source";
const sqlPath = resolve(root, "supabase", "migrations", `${migrationName}.sql`);
const query = readFileSync(sqlPath, "utf8");

// Management API (personal access token sbp_...)
if (key.startsWith("sbp_")) {
  const projectRef = url.replace("https://", "").split(".")[0];
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  const body = await res.text();
  if (!res.ok) {
    console.error("Management API failed:", res.status, body);
    process.exit(1);
  }
  console.log("Migration applied via Management API:", migrationName);
  console.log(body);
  process.exit(0);
}

// Direct Postgres connection string
if (key.startsWith("postgres://") || key.startsWith("postgresql://")) {
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: key });
  await client.connect();
  try {
    await client.query(query);
    console.log("Migration applied via postgres:", migrationName);
  } finally {
    await client.end();
  }
  process.exit(0);
}

// Database password only (build pooler URL)
if (!key.startsWith("eyJ") && !key.startsWith("sb_")) {
  const projectRef = url.replace("https://", "").split(".")[0];
  const connectionString = `postgresql://postgres.${projectRef}:${encodeURIComponent(key)}@aws-0-ap-south-1.pooler.supabase.com:6543/postgres`;
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(query);
    console.log("Migration applied via pooler:", migrationName);
  } finally {
    await client.end();
  }
  process.exit(0);
}

console.error("Unsupported credential format for automated migration.");
process.exit(1);
