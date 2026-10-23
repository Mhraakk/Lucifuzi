// The coin showcase (spec 0041) for the promo pieces: the page and one coin's window, from a fresh demo server at twice
// the density, in the day skin.
//   node scripts/promo-film/showcase-shots.mjs [--out=shots-gram]   → scripts/promo-film/<out>/showcase*.jpg
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const arg = (k) => process.argv.map((a) => a.replace(/^--/, '')).find((a) => a.startsWith(`${k}=`))?.slice(k.length + 1);
const OUT = path.join(ROOT, 'scripts/promo-film', arg('out') ?? 'shots-gram');
mkdirSync(OUT, { recursive: true });
const pw = await import(process.env.PLAYWRIGHT ?? '/opt/node22/lib/node_modules/playwright/index.mjs');
const { chromium } = pw.default ?? pw;

const port = 6200 + Math.floor(Math.random() * 300);
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.mjs'], { cwd: ROOT, env: { ...process.env, BEATRIS_DEMO: 'true', BEATRIS_DATA_DIR: mkdtempSync(path.join(tmpdir(), 'cs-shots-')), PORT: String(port), NODE_ENV: 'test' }, stdio: ['ignore', 'ignore', 'inherit'] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 80 && !(await fetch(`${base}/api/health`).then((r) => r.ok).catch(() => false)); i++) await wait(250);

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2, colorScheme: 'light' });
  const page = await ctx.newPage();
  await page.goto(`${base}/login`);
  await page.fill('#ef input[name=email]', 'owner@demo.beatris.ir');
  await page.click('#ef button[type=submit]');
  await page.waitForSelector('.lg-dev');
  await page.click('.lg-dev');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15000 });
  await page.evaluate(() => localStorage.setItem('beatris.theme', 'day'));
  await page.emulateMedia({ reducedMotion: 'reduce' }); // a still ring: the first card rests in the middle
  await page.goto(`${base}/coins/showcase`);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(OUT, 'showcase.jpg'), type: 'jpeg', quality: 92 });
  console.log('shot showcase.jpg');
  // the middle card's window, tapped where the card is
  const at = await page.$eval('.cs-card[data-k="0"]', (c) => {
    const r = c.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await page.mouse.click(at.x, at.y);
  await page.waitForSelector('.cs-box[role=dialog]');
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, 'showcase-window.jpg'), type: 'jpeg', quality: 92 });
  console.log('shot showcase-window.jpg');
  await ctx.close();
} finally {
  await browser.close();
  server.kill();
}
