import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const projectId = "helical-patrol-499311-d0";
const packageName = "com.sareeorder.app";

function token() {
  return execSync("gcloud auth print-access-token", { encoding: "utf8" }).trim();
}

async function api(path, init = {}) {
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

async function main() {
  console.log("Enabling Firebase on project", projectId);
  try {
    await api(`/projects/${projectId}:addFirebase`, { method: "POST", body: "{}" });
    console.log("Firebase add requested.");
  } catch (e) {
    const msg = String(e);
    if (/already|ALREADY_EXISTS|409/i.test(msg)) {
      console.log("Firebase already enabled.");
    } else {
      throw e;
    }
  }

  for (let i = 0; i < 20; i++) {
    try {
      await api(`/projects/${projectId}`);
      console.log("Firebase project ready.");
      break;
    } catch (e) {
      if (i === 19) throw e;
      await new Promise((r) => setTimeout(r, 3000));
    }
  }

  const apps = await api(`/projects/${projectId}/androidApps`);
  let app = (apps.apps ?? []).find((a) => a.packageName === packageName);

  if (!app) {
    console.log("Creating Android app", packageName);
    const op = await api(`/projects/${projectId}/androidApps`, {
      method: "POST",
      body: JSON.stringify({
        packageName,
        displayName: "Saree Order App",
      }),
    });
    const opName = op.name;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const status = await api(`/${opName}`);
      if (status.done) {
        app = status.response;
        break;
      }
    }
    if (!app?.name) throw new Error("Android app creation timed out");
  } else {
    console.log("Android app exists:", app.name);
  }

  const appId = app.name.split("/").pop();
  const config = await api(`/projects/${projectId}/androidApps/${appId}/config`);
  const outPath = resolve(root, "android/app/google-services.json");
  writeFileSync(outPath, config.configFilename ? JSON.stringify(config, null, 2) : config);
  if (config.configFileContents) {
    writeFileSync(outPath, Buffer.from(config.configFileContents, "base64").toString("utf8"));
    console.log("Wrote", outPath);
  } else {
    console.log("Config response keys:", Object.keys(config));
    writeFileSync(outPath, JSON.stringify(config, null, 2));
    console.log("Wrote raw config to", outPath);
  }

  const webhookSecret = randomBytes(32).toString("hex");
  console.log("\nVELO_PUSH_WEBHOOK_SECRET=", webhookSecret);
  console.log("Set in Supabase Edge Function secrets + shop Vercel env.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
