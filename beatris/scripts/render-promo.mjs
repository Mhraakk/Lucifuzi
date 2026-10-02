// Renders the product page's imagery with the app's own 3D engine (original work, no stock photos):
// jewellery from the studio in dramatic light on rich backdrops, and a real-photograph coin from the lab.
//   node scripts/render-promo.mjs   → public/promo/*.webp
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'promo');
const pw = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs').catch(() => import('playwright'));
const { chromium } = pw.default ?? pw;

// [file, piece type, alloy, environment, backdrop, bloom]
const SHOTS = [
  ['solitaire', 'solitaire', 'au18y', 'studio', 'ink', true],
  ['halo', 'halo', 'au18r', 'sunset', 'wine', true],
  ['eternity', 'eternity', 'au18y', 'studio', 'lapis', true],
  ['bangle', 'bangle', 'au18y', 'studio', 'velvet', false],
  ['pendant', 'pendant', 'au18y', 'studio', 'wine', true],
  ['name', 'name', 'au18y', 'studio', 'velvet', false],
  ['signet', 'signet', 'au18r', 'studio', 'wine', false],
  ['bar', 'bar', 'au24', 'studio', 'lapis', false],
];

const dataDir = mkdtempSync(path.join(tmpdir(), 'beatris-promo-'));
const port = 4900 + Math.floor(Math.random() * 90);
const server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.mjs'], { cwd: ROOT, env: { ...process.env, BEATRIS_DEMO: 'true', BEATRIS_DATA_DIR: dataDir, PORT: String(port), NODE_ENV: 'test' }, stdio: 'ignore' });
const base = `http://127.0.0.1:${port}`;
for (let i = 0; i < 60 && !(await fetch(`${base}/api/health`).then((r) => r.ok).catch(() => false)); i++) await new Promise((r) => setTimeout(r, 250));

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 }, acceptDownloads: true });
const page = await ctx.newPage();
await page.goto(`${base}/login`);
await page.fill('input[name=phone]', '09120000002');
await page.fill('input[name=pin]', '1234');
await page.click('button[type=submit]');
await page.waitForURL((u) => !u.pathname.startsWith('/login'));
mkdirSync(OUT, { recursive: true });

// re-encode a downloaded JPEG as WebP at a web size, inside the page (no image libraries needed)
async function toWebp(file, size = 1600, q = 0.84) {
  const b64 = (await import('node:fs')).readFileSync(file).toString('base64');
  const out = await page.evaluate(
    async ([b64, size, q]) => {
      const img = new Image();
      img.src = `data:image/jpeg;base64,${b64}`;
      await img.decode();
      const c = document.createElement('canvas');
      const k = size / Math.max(img.width, img.height);
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL('image/webp', q).split(',')[1];
    },
    [b64, size, q],
  );
  return Buffer.from(out, 'base64');
}

await page.evaluate(() => localStorage.removeItem('beatris.studio.v1'));
await page.goto(`${base}/studio`);
await page.waitForTimeout(7000);
for (const [name, type, alloy, env, bg, bloom] of SHOTS) {
  await page.click(`.piece-grid [data-type="${type}"]`);
  await page.waitForTimeout(type === 'chain' ? 6000 : 3500);
  await page.click(`[data-alloy="${alloy}"]`).catch(() => {});
  await page.click(`[data-env="${env}"]`).catch(() => {});
  await page.click(`[data-bg="${bg}"]`).catch(() => {});
  const on = await page.$eval('[data-toggle="bloom"]', (b) => b.getAttribute('aria-pressed') === 'true').catch(() => bloom);
  if (on !== bloom) await page.click('[data-toggle="bloom"]').catch(() => {});
  await page.waitForTimeout(2500);
  await page.click('.toolbar [data-act="export"]');
  await page.waitForTimeout(400);
  await page.click('[data-res="2k"]');
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), page.click('[data-x="jpg"]')]);
  const webp = await toWebp(await dl.path());
  writeFileSync(path.join(OUT, `${name}.webp`), webp);
  console.log(`${name}.webp`, webp.length);
  await page.keyboard.press('Escape');
  await page.$eval('.modal', (m) => m.remove()).catch(() => {});
}

// the real-photograph emami coin from the coin lab, 4K still
await page.goto(`${base}/coins?mode=real`);
await page.waitForTimeout(15000);
const [shot] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), page.click('[data-act="shot"]')]);
const p = await shot.path();
const buf = (await import('node:fs')).readFileSync(p);
const isPng = buf[0] === 0x89;
const coin = await page.evaluate(
  async ([b64, mime]) => {
    const img = new Image();
    img.src = `data:${mime};base64,${b64}`;
    await img.decode();
    // the coin sits in the middle of the still: keep the central square around it
    const side = Math.min(img.width, img.height) * 0.62;
    const c = document.createElement('canvas');
    c.width = c.height = 1400;
    c.getContext('2d').drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, 1400, 1400);
    return c.toDataURL('image/webp', 0.86).split(',')[1];
  },
  [buf.toString('base64'), isPng ? 'image/png' : 'image/jpeg'],
);
writeFileSync(path.join(OUT, 'coin.webp'), Buffer.from(coin, 'base64'));
console.log('coin.webp');

await browser.close();
server.kill();
rmSync(dataDir, { recursive: true, force: true });
