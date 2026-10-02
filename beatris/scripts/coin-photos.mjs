// Rebuild the built-in real-coin reference set (public/coins/photos/) from the source photographs in
// assets/coin-photos/, using exactly the same browser pipeline the managers' uploader uses
// (public/js/coinphoto.mjs): coin detection, upright crop, 4096/2048 faces, relief map.
//
//   node scripts/coin-photos.mjs            # needs Playwright (same as npm run e2e)
//
// Each source is a photograph showing both faces side by side. Credits are written into the manifest
// and shown next to the coin in the lab and on every exported image.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'assets', 'coin-photos');
const OUT = path.join(ROOT, 'public', 'coins', 'photos');
const commons = (file) => `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file.replace(/ /g, '_'))}`;

// obv / rev = index of the detected coin, left to right
export const ITEMS = [
  {
    id: 'bahar1358',
    coin: 'bahar',
    label: 'تمام بهار آزادی (طرح قدیم) — نخستین ضرب ۱۳۵۸',
    file: 'bahar-1358.jpg',
    obv: 1, // front (جلو) of the old design = the bank emblem, shown on the right of the source photo
    rev: 0,
    faces: { obv: 'جلو: نشان و نوشته «بانک ملی ایران»', rev: 'پشت: گنبد و مناره‌ها، «اولین بهار آزادی» و سال ضرب' },
    credit: { author: 'M.samei', license: 'CC BY-SA 4.0', url: commons('نخستین سکه بهار آزادی طرح قدیم.jpg') },
  },
  {
    id: 'emami1370',
    coin: 'emami',
    label: 'تمام امامی (طرح جدید) — نخستین ضرب ۱۳۷۰',
    file: 'emami-1370.jpg',
    obv: 0,
    rev: 1,
    faces: { obv: 'جلو: نیم‌رخ و سال ضرب', rev: 'پشت: گنبد، «بانک مرکزی جمهوری اسلامی ایران» و «بهار آزادی»' },
    credit: { author: 'M.samei', license: 'CC BY-SA 4.0', url: commons('نخستین سکه بهار آزادی طرح جدید.jpg') },
  },
  {
    id: 'halfold1358',
    coin: 'halfOld',
    label: 'نیم سکه بهار آزادی (طرح قدیم) — ۱۳۵۸',
    file: 'half-1358.jpg',
    obv: 1,
    rev: 0,
    faces: { obv: 'جلو: نشان و نوشته «بانک ملی ایران»', rev: 'پشت: گنبد و مناره‌ها، «اولین بهار آزادی» و سال ضرب' },
    credit: { author: 'M.samei', license: 'CC BY-SA 4.0', url: commons('Half Azadi gold coin 1358.jpg') },
  },
  {
    id: 'quarterold1370',
    coin: 'quarterOld',
    label: 'ربع سکه بهار آزادی (طرح قدیم) — ۱۳۷۰',
    file: 'quarterold-1370.jpg',
    obv: 1,
    rev: 0,
    faces: { obv: 'جلو: نشان و نوشته «بانک ملی ایران»', rev: 'پشت: گنبد و مناره‌ها، «بهار آزادی» و سال ضرب' },
    credit: { author: 'M.samei', license: 'CC BY-SA 4.0', url: commons('Qurter Azadi gold coin 1370.jpg') },
  },
];

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const pw = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs').catch(() => import('playwright'));
  const { chromium } = pw.default ?? pw;
  const dataDir = mkdtempSync(path.join(tmpdir(), 'beatris-photos-'));
  const port = 4900 + Math.floor(Math.random() * 90);
  const server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.mjs'], { cwd: ROOT, env: { ...process.env, BEATRIS_DATA_DIR: dataDir, PORT: String(port) }, stdio: 'ignore' });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 60 && !(await fetch(`${base}/api/health`).then((r) => r.ok).catch(() => false)); i++) await new Promise((r) => setTimeout(r, 250));
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('pageerror:', e.message));
  await page.goto(`${base}/login`);
  mkdirSync(OUT, { recursive: true });
  for (const f of readdirSync(OUT)) if (/\.(webp|jpg|png)$/.test(f)) unlinkSync(path.join(OUT, f));
  const manifest = [];
  try {
    for (const it of ITEMS) {
      const b64 = readFileSync(path.join(SRC, it.file)).toString('base64');
      const res = await page.evaluate(
        async ([b64, it]) => {
          const P = await import('/js/coinphoto.mjs');
          const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
          const src = await P.loadSource(new Blob([bin], { type: 'image/jpeg' }));
          const circles = P.detectCoins(src);
          if (circles.length < 2) return { error: `found ${circles.length} coins` };
          const out = {};
          for (const side of ['obv', 'rev']) {
            const s = P.buildSide(src, circles[it[side]]);
            out[side] = { c4: s.c4.toDataURL('image/webp', 0.92), c2: s.c2.toDataURL('image/webp', 0.9), h: s.height.toDataURL('image/webp', 0.95), px: s.sourcePx, inverted: s.inverted };
          }
          return { out, circles };
        },
        [b64, it],
      );
      if (res.error) throw new Error(`${it.file}: ${res.error}`);
      const sides = {};
      for (const side of ['obv', 'rev']) {
        sides[side] = { px: res.out[side].px, label: it.faces[side] };
        for (const k of ['c4', 'c2', 'h']) {
          const name = `${it.id}-${side}-${k}.webp`;
          writeFileSync(path.join(OUT, name), Buffer.from(res.out[side][k].split(',')[1], 'base64'));
          sides[side][k] = `/coins/photos/${name}`;
        }
      }
      manifest.push({ id: it.id, coin: it.coin, label: it.label, credit: { ...it.credit, text: `عکس: ${it.credit.author} · ${it.credit.license} · ویکی‌مدیا کامنز` }, sides });
      console.log(`${it.id}: ${res.circles.map((c) => `r=${c.r.toFixed(1)}`).join(' ')} · source ${res.out.obv.px}/${res.out.rev.px}px · relief inverted ${res.out.obv.inverted}/${res.out.rev.inverted}`);
    }
    writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ note: 'Generated by scripts/coin-photos.mjs — do not edit by hand.', items: manifest }, null, 1) + '\n');
  } finally {
    await browser.close();
    server.kill();
    rmSync(dataDir, { recursive: true, force: true });
  }
}
