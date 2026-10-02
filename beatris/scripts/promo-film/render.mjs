// تیزر و اینفوگرافیک بئاتریس — deterministic motion: every frame of teaser.html is seek(t), so a render is repeatable.
//   node scripts/promo-film/render.mjs teaser [fps=60]   → frames in ./frames, then encode with ffmpeg (see README.md)
//   node scripts/promo-film/render.mjs infographic        → public/media/promo/beatris-infographic.{png,pdf}
//   node scripts/promo-film/render.mjs prism [fps=60] [from] [to] → «منشور» frames in ./frames-prism (served over http so
//                                                         the app's own modules — Elliott engine, thinking orb — load)
import { mkdirSync, rmSync } from 'node:fs';
import { serveRoot } from './serve.mjs';
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
} else if (what === 'prism') {
  const srv = await serveRoot();
  const fps = Number(process.argv[3] ?? 60);
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  p.on('pageerror', (e) => console.error('page error:', e.message));
  await p.goto(`${srv.url}/scripts/promo-film/prism.html`);
  await p.waitForFunction(() => window.READY === true);
  const frames = path.join(DIR, 'frames-prism');
  const dur = await p.evaluate(() => window.DUR);
  const from = Number(process.argv[4] ?? 0), to = Number(process.argv[5] ?? dur);
  if (!process.argv[4]) rmSync(frames, { recursive: true, force: true });
  mkdirSync(frames, { recursive: true });
  for (let i = Math.round(from * fps); i < Math.round(to * fps); i++) {
    await p.evaluate((t) => window.seek(t), i / fps);
    await p.screenshot({ path: path.join(frames, `${String(i).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 94 });
  }
  console.log(`frames ${from}–${to}s in ${frames}`);
  srv.close();
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
