// The web app's install screenshots (manifest «screenshots», spec 0025): wide at 2× (2560×1440), narrow at 3×
// (1170×2532), so the install sheet shows the app as sharp as the screen it is installed on.
//   node scripts/pwa-shots.mjs              # boots a throw-away demo server
//   BASE=http://127.0.0.1:3000 node scripts/pwa-shots.mjs
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pw = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs').catch(() => import('playwright'));
const { chromium } = pw.default ?? pw;

let base = process.env.BASE;
let server, dataDir;
if (!base) {
  dataDir = mkdtempSync(path.join(tmpdir(), 'beatris-pwa-'));
  const port = 4900 + Math.floor(Math.random() * 90);
  server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.mjs'], { cwd: ROOT, env: { ...process.env, BEATRIS_DEMO: 'true', BEATRIS_DATA_DIR: dataDir, PORT: String(port) }, stdio: 'ignore' });
  base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 80; i++) {
    if (await fetch(`${base}/api/health`).then((r) => r.ok).catch(() => false)) break;
    await new Promise((r) => setTimeout(r, 250));
  }
}

const SHOTS = [
  { file: 'wide-elliott.jpg', path: '/books/elliott', wide: true },
  { file: 'wide-market.jpg', path: '/market', wide: true },
  { file: 'narrow-desk.jpg', path: '/books/desk', wide: false },
  { file: 'narrow-elliott.jpg', path: '/books/elliott', wide: false },
];

const browser = await chromium.launch();
try {
  for (const wide of [true, false]) {
    const ctx = await browser.newContext(wide ? { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2, colorScheme: 'dark' } : { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, colorScheme: 'dark' });
    const page = await ctx.newPage();
    await page.goto(base + '/login');
    await page.fill('#ef input[name=email]', 'owner@demo.beatris.ir'); // the demo owner
    await page.click('#ef button[type=submit]');
    await page.waitForSelector('.lg-dev', { timeout: 20000 });
    await page.click('.lg-dev');
    await Promise.race([page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20000 }), page.waitForSelector('.lg-shops [data-act=pick]', { timeout: 20000 }).then((b) => b.click())]);
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20000 });
    for (const s of SHOTS.filter((x) => x.wide === wide)) {
      await page.goto(base + s.path);
      await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(3500);
      const out = path.join(ROOT, 'public/pwa', s.file);
      await page.screenshot({ path: out, type: 'jpeg', quality: 88 });
      const vp = page.viewportSize();
      const dsf = wide ? 2 : 3;
      console.log(`${s.file}: ${vp.width * dsf}x${vp.height * dsf}, ${Math.round(statSync(out).size / 1024)} KB`);
    }
    await ctx.close();
  }
} finally {
  await browser.close();
  server?.kill();
  if (dataDir) rmSync(dataDir, { recursive: true, force: true });
}
