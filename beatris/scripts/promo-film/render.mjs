// تیزر و اینفوگرافیک بئاتریس — deterministic motion: every frame of teaser.html is seek(t), so a render is repeatable.
//   node scripts/promo-film/render.mjs teaser [fps=60]   → frames in ./frames, then encode with ffmpeg (see README.md)
//   node scripts/promo-film/render.mjs infographic        → public/media/promo/beatris-infographic.{png,pdf}
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const pw = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs').catch(() => import('playwright'));
const { chromium } = pw.default ?? pw;
const what = process.argv[2] ?? 'teaser';
const b = await chromium.launch();
if (what === 'infographic') {
  const p = await b.newPage({ viewport: { width: 1200, height: 1000 }, deviceScaleFactor: 2 });
  await p.goto(pathToFileURL(path.join(DIR, 'infographic.html')).href);
  await p.evaluate(() => document.fonts.ready);
  const out = path.join(DIR, '..', '..', 'public', 'media', 'promo');
  await p.screenshot({ path: path.join(out, 'beatris-infographic.png'), fullPage: true });
  const h = await p.evaluate(() => document.documentElement.scrollHeight);
  await p.pdf({ path: path.join(out, 'beatris-infographic.pdf'), width: '1200px', height: `${h + 2}px`, printBackground: true, pageRanges: '1' });
} else {
  const fps = Number(process.argv[3] ?? 60);
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  await p.goto(pathToFileURL(path.join(DIR, 'teaser.html')).href);
  await p.evaluate(() => document.fonts.ready);
  const frames = path.join(DIR, 'frames');
  rmSync(frames, { recursive: true, force: true });
  mkdirSync(frames, { recursive: true });
  const n = Math.round((await p.evaluate(() => window.DUR)) * fps);
  for (let i = 0; i < n; i++) {
    await p.evaluate((t) => window.seek(t), i / fps);
    await p.screenshot({ path: path.join(frames, `${String(i).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 94 });
  }
  console.log(`${n} frames in ${frames}`);
}
await b.close();
