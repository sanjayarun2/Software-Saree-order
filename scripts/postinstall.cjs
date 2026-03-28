/**
 * Vercel web builds do not use patched Android native code; patch-package often fails there
 * when line endings or install layout differ. Skip on VERCEL=1. Local/Capacitor keeps patches.
 */
const { execSync } = require("child_process");

if (process.env.VERCEL === "1") {
  console.log(
    "[postinstall] Skipping patch-package on Vercel (Android-only patches; run `npm install` locally for APK builds)."
  );
  process.exit(0);
}

try {
  execSync("npx patch-package", { stdio: "inherit", env: process.env });
} catch {
  console.error("[postinstall] patch-package failed. Fix or regenerate patches/patches/*.patch");
  process.exit(1);
}
