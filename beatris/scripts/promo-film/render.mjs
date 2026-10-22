// تیزر و اینفوگرافیک بئاتریس — deterministic motion: every frame of teaser.html is seek(t), so a render is repeatable.
//   node scripts/promo-film/render.mjs teaser [fps=60]   → frames in ./frames, then encode with ffmpeg (see README.md)
//   node scripts/promo-film/render.mjs prism [fps=60] [from] [to] → «منشور» frames in ./frames-prism (served over http so
//                                                         the app's own modules — Elliott engine, thinking orb — load)
//   node scripts/promo-film/render.mjs anatomy [fps=60]    → «کالبد یک دفتر طلا» (spec 0031) frames in ./frames-anatomy;
//   node scripts/promo-film/render.mjs anatomy --check     → the same frame rendered twice must be the same PNG
//   node scripts/promo-film/render.mjs anatomy --stills=3.5,7,26.5 [--out=dir] → PNG stills for a review round
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { serveRoot } from './serve.mjs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const pw = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs').catch(() => import('playwright'));
const { chromium } = pw.default ?? pw;
const what = process.argv[2] ?? 'teaser';
const b = await chromium.launch();
if (what === 'prism') {
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
} else if (what === 'anatomy') {
  const srv = await serveRoot();
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  p.on('pageerror', (e) => console.error('page error:', e.message));
  await p.goto(`${srv.url}/scripts/promo-film/anatomy.html`);
  await p.waitForFunction(() => window.READY === true, null, { timeout: 60000 });
  if (process.argv.includes('--check')) {
    // the clock is the only clock: a frame reached from anywhere is the same picture
    const shot = async (t) => (await p.evaluate((x) => window.seek(x), t), await p.screenshot({ type: 'png' }));
    const pairs = [];
    for (const t of [3.1, 9.0, 15.2, 19.0, 23.9, 28.9]) {
      const a = await shot(t);
      await shot(t > 10 ? 1.7 : 26.3);
      pairs.push([t, a.equals(await shot(t))]);
    }
    console.log(pairs.map(([t, same]) => `${t}s ${same ? 'same' : 'DIFFERENT'}`).join(' · '));
    if (!pairs.every(([, same]) => same)) process.exitCode = 1;
  } else if (process.argv.some((a) => a.startsWith('--stills='))) {
    // stills for a review round: --stills=3.5,7,26.5 [--out=dir] writes one PNG per time
    const opt = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
    const out = path.resolve(opt('out') ?? path.join(DIR, 'stills-anatomy'));
    mkdirSync(out, { recursive: true });
    for (const t of opt('stills').split(',').map(Number)) {
      await p.evaluate((x) => window.seek(x), t);
      await p.screenshot({ path: path.join(out, `t${t.toFixed(2)}.png`), type: 'png' });
    }
    console.log(`stills in ${out}`);
  } else {
    const fps = Number(process.argv[3] ?? 60);
    const frames = path.join(DIR, 'frames-anatomy');
    rmSync(frames, { recursive: true, force: true });
    mkdirSync(frames, { recursive: true });
    const dur = await p.evaluate(() => window.DUR);
    for (let i = 0; i < Math.round(dur * fps); i++) {
      await p.evaluate((t) => window.seek(t), i / fps);
      await p.screenshot({ path: path.join(frames, `${String(i).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 95 });
    }
    writeFileSync(path.join(frames, 'sfx.json'), JSON.stringify(await p.evaluate(() => window.SFX)));
    console.log(`${Math.round(dur * fps)} frames in ${frames}`);
  }
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
