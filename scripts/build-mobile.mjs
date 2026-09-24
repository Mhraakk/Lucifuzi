#!/usr/bin/env node
/**
 * Static export for Capacitor iOS / TestFlight packaging.
 * Temporarily parks API routes (unsupported by `output: 'export'`).
 */
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const apiDir = path.join(root, "app", "api");
const parkDir = path.join(root, ".api-park");

function run(cmd) {
  console.log(`\n> ${cmd}\n`);
  execSync(cmd, {
    stdio: "inherit",
    cwd: root,
    env: { ...process.env, BUILD_TARGET: "capacitor" },
  });
}

try {
  if (fs.existsSync(apiDir)) {
    if (fs.existsSync(parkDir)) fs.rmSync(parkDir, { recursive: true, force: true });
    fs.renameSync(apiDir, parkDir);
  }

  run("npx next build");
  run("npx cap sync ios");
  console.log("\n✓ Mobile web bundle ready in /out and synced to ios/\n");
  console.log("Next on your Mac: npm run cap:open → Archive → TestFlight\n");
  console.log("See docs/TESTFLIGHT.md\n");
} finally {
  if (fs.existsSync(parkDir)) {
    if (fs.existsSync(apiDir)) fs.rmSync(apiDir, { recursive: true, force: true });
    fs.renameSync(parkDir, apiDir);
  }
}
