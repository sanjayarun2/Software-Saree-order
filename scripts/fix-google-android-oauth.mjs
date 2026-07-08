/**
 * Ensures Firebase Android SHA + google-services.json include Android OAuth (type 1).
 * Run: node scripts/fix-google-android-oauth.mjs
 */
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const projectId = "helical-patrol-499311-d0";
const appId = "1:525751857875:android:09b1253930c58ff8f1da26";
const packageName = "com.sareeorder.app";
const sha1Colons = "94:A4:0D:44:AF:72:29:E4:37:A5:54:CD:83:9C:2F:4A:90:76:3D:F0";
const webClientId =
  "525751857875-fuo9efh2hiq7sqjscdrclmlq2c8jn81o.apps.googleusercontent.com";

function token() {
  return execSync("gcloud auth print-access-token", { encoding: "utf8" }).trim();
}

async function firebase(path, init = {}) {
  const res = await fetch(`https://firebase.googleapis.com/v1beta1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
      "x-goog-user-project": projectId,
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    throw new Error(`${path} ${res.status}: ${text}`);
  }
  return body;
}

async function identityToolkit(path, init = {}) {
  const res = await fetch(`https://identitytoolkit.googleapis.com/admin/v2${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
      "x-goog-user-project": projectId,
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

function parseConfig(body) {
  const raw = Buffer.from(body.configFileContents, "base64").toString("utf8");
  return { raw, parsed: JSON.parse(raw) };
}

function oauthSummary(parsed) {
  return (parsed.client?.[0]?.oauth_client ?? []).map((c) => ({
    client_id: c.client_id,
    client_type: c.client_type,
    package: c.android_info?.package_name ?? null,
    sha: c.android_info?.certificate_hash ?? null,
  }));
}

function hasAndroidOAuth(parsed) {
  return (parsed.client?.[0]?.oauth_client ?? []).some(
    (c) =>
      c.client_type === 1 &&
      c.android_info?.package_name === packageName &&
      (c.android_info?.certificate_hash ?? "").replace(/:/g, "").toLowerCase() ===
        sha1Colons.replace(/:/g, "").toLowerCase()
  );
}

async function ensureShaRegistered() {
  const list = await firebase(
    `/projects/${projectId}/androidApps/${appId}/sha`
  );
  const certs = list.certificates ?? [];
  const want = sha1Colons.replace(/:/g, "").toLowerCase();
  const match = certs.find(
    (c) =>
      c.certType === "SHA_1" &&
      (c.shaHash ?? "").replace(/:/g, "").toLowerCase() === want
  );
  if (match) {
    console.log("SHA-1 already registered:", match.shaHash);
    return;
  }
  for (const c of certs) {
    if (c.name) {
      console.log("Removing old SHA:", c.shaHash);
      await firebase(`/${c.name}`, { method: "DELETE" });
    }
  }
  const created = await firebase(
    `/projects/${projectId}/androidApps/${appId}/sha`,
    {
      method: "POST",
      body: JSON.stringify({ shaHash: sha1Colons, certType: "SHA_1" }),
    }
  );
  console.log("Registered SHA-1:", created.shaHash);
}

async function ensureWebApp() {
  const { apps = [] } = await firebase(`/projects/${projectId}/webApps`);
  if (apps.length) {
    console.log("Web app exists:", apps[0].displayName);
    return;
  }
  const op = await firebase(`/projects/${projectId}/webApps`, {
    method: "POST",
    body: JSON.stringify({ displayName: "Saree Order Web" }),
  });
  console.log("Creating web app operation:", op.name);
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const status = await firebase(`/${op.name}`);
    if (status.done) break;
  }
}

async function tryEnableGoogleAuth() {
  try {
    await identityToolkit(`/projects/${projectId}/config`);
    console.log("Identity Platform config present.");
  } catch (e) {
    console.log("Identity config note:", String(e).split("\n")[0]);
  }
  try {
    await identityToolkit(
      `/projects/${projectId}/defaultSupportedIdpConfigs/google.com`
    );
    console.log("Google IdP config exists.");
    await identityToolkit(
      `/projects/${projectId}/defaultSupportedIdpConfigs/google.com?updateMask=enabled`,
      {
        method: "PATCH",
        body: JSON.stringify({ enabled: true }),
      }
    );
    console.log("Google IdP enabled.");
  } catch {
    try {
      console.log("Creating Google IdP config...");
      await identityToolkit(
        `/projects/${projectId}/defaultSupportedIdpConfigs?idpId=google.com`,
        {
          method: "POST",
          body: JSON.stringify({
            enabled: true,
            clientId: webClientId,
            clientSecret: "unused-for-native-signin",
          }),
        }
      );
      console.log("Google IdP created.");
    } catch (e) {
      console.warn("Google IdP setup skipped:", String(e).split("\n")[0]);
    }
  }
}

async function downloadConfig() {
  const body = await firebase(
    `/projects/${projectId}/androidApps/${appId}/config`
  );
  const { raw, parsed } = parseConfig(body);
  const out = resolve(root, "android/app/google-services.json");
  writeFileSync(out, raw);
  console.log("Wrote", out);
  return parsed;
}

async function main() {
  console.log("=== Fix Google Android OAuth ===\n");
  await ensureWebApp();
  await tryEnableGoogleAuth();
  await ensureShaRegistered();

  for (let attempt = 1; attempt <= 6; attempt++) {
    console.log(`\nConfig fetch attempt ${attempt}/6...`);
    const parsed = await downloadConfig();
    const summary = oauthSummary(parsed);
    console.log(JSON.stringify(summary, null, 2));
    if (hasAndroidOAuth(parsed)) {
      console.log("\nOK: Android OAuth client (type 1) present in google-services.json");
      const b64 = Buffer.from(JSON.stringify(parsed)).toString("base64");
      console.log("\nGOOGLE_SERVICES_JSON_B64 length:", b64.length);
      console.log("Run: gh secret set GOOGLE_SERVICES_JSON_B64 --body \"<b64>\"");
      return;
    }
    if (attempt < 6) {
      console.log("Android OAuth (type 1) not yet in config; waiting 10s...");
      await new Promise((r) => setTimeout(r, 10_000));
    }
  }

  console.error(
    "\nFAIL: google-services.json still missing Android OAuth client (type 1).\n" +
      "Create manually in Google Cloud Console → Credentials → Android OAuth client:\n" +
      `  Package: ${packageName}\n  SHA-1:   ${sha1Colons}\n` +
      "Then re-run this script."
  );
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
