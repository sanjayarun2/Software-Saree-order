import { execSync } from "node:child_process";

const project = "helical-patrol-499311-d0";
const token = execSync("gcloud auth print-access-token", { encoding: "utf8" }).trim();

const urls = [
  `https://googleauthplatform.googleapis.com/v1/projects/${project}/locations/global/clients`,
  `https://cloudresourcemanager.googleapis.com/v1/projects/${project}`,
];

for (const url of urls) {
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const text = await res.text();
    console.log("\n===", url, res.status, "===");
    console.log(text.slice(0, 2000));
  } catch (e) {
    console.log(url, e.message);
  }
}
