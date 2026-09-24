#!/usr/bin/env node
/**
 * Static export for PWA / CDN hosting (no Capacitor sync).
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
  console.log("\n✓ PWA static site ready in /out\n");
} finally {
  if (fs.existsSync(parkDir)) {
    if (fs.existsSync(apiDir)) fs.rmSync(apiDir, { recursive: true, force: true });
    fs.renameSync(parkDir, apiDir);
  }
}
