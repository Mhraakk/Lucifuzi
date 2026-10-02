// Tutorial films (the business-motion-film way): each recorded chapter gets a deterministic opening card (the beam,
// the gem, the spectrum, the chapter), a spectral wipe into the screen recording, and an end card that names the next
// chapter. Chapter 18 also gets the Elliott + Fibonacci explainer from the «منشور» teaser. The sound is mixed and
// mastered here: the nocturne, a soft whoosh on every cut and a shimmer under each card, then gentle compression and
// loudness normalisation, so every chapter plays at the same level.
//   FFMPEG=… MUSIC=…/nocturne.mp3 KIT=…/kit node scripts/tutorial-film.mjs [--only=3,18]
// Inputs: public/media/tutorial/NN.mp4 as scripts/tutorial.mjs recorded it (picture only). The plain recording is kept
// in RAW (default /tmp/beatris-tutorial-raw) so the film can be rebuilt without recording again.
// KIT holds whoosh.wav and shimmer.wav from `python3 scripts/promo-film/sfx.py --kit KIT`.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveRoot } from './promo-film/serve.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'media', 'tutorial');
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const MUSIC = process.env.MUSIC;
const KIT = process.env.KIT;
const RAW = process.env.RAW || '/tmp/beatris-tutorial-raw';
const PRISM = path.join(ROOT, 'scripts', 'promo-film', 'frames-prism'); // 60 fps frames of the teaser, if rendered
const only = (process.argv.find((a) => a.startsWith('--only='))?.slice(7) ?? '').split(',').filter(Boolean).map(Number);
if (!MUSIC || !KIT) throw new Error('MUSIC=…/nocturne.mp3 and KIT=…/kit are required');

const FPS = 25, XF = 0.5; // crossfade length at every cut (the wipe is inside the card)
const ff = (...a) => execFileSync(FFMPEG, ['-y', '-loglevel', 'error', ...a]);
const duration = (file) => {
  let out = '';
  try {
    execFileSync(FFMPEG, ['-i', file], { stdio: ['ignore', 'ignore', 'pipe'] });
  } catch (e) {
    out = String(e.stderr);
  }
  const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(out);
  return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : 0;
};
const size = (file) => {
  let out = '';
  try {
    execFileSync(FFMPEG, ['-i', file], { stdio: ['ignore', 'ignore', 'pipe'] });
  } catch (e) {
    out = String(e.stderr);
  }
  const m = /Video:.*?(\d{3,4})x(\d{3,4})/.exec(out);
  return { w: +m[1], h: +m[2] };
};

const pw = await import(process.env.PLAYWRIGHT ?? '/opt/node22/lib/node_modules/playwright/index.mjs');
const { chromium } = pw.default ?? pw;
const listFile = path.join(OUT, 'chapters.json');
const list = JSON.parse(readFileSync(listFile, 'utf8'));
const srv = await serveRoot();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const tmp = path.join(RAW, 'work');
mkdirSync(tmp, { recursive: true });

/** Render card.html (open or end) to an mp4 the size of the chapter (a phone chapter gets the card letterboxed). */
async function card(params, file, { w, h }) {
  const vertical = w < h; // a phone chapter gets the standing card, filled to its frame
  await page.setViewportSize(vertical ? { width: 720, height: 1558 } : { width: 1280, height: 720 });
  await page.goto(`${srv.url}/scripts/promo-film/card.html?${new URLSearchParams({ ...params, ...(vertical ? { v: '1' } : {}) })}`);
  await page.waitForFunction(() => window.READY === true);
  const dur = await page.evaluate(() => window.DUR);
  const dir = path.join(tmp, 'card');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (let i = 0; i < Math.round(dur * FPS); i++) {
    await page.evaluate((t) => window.seek(t), i / FPS);
    await page.screenshot({ path: path.join(dir, `${String(i).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 92 });
  }
  const fit = vertical ? `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}` : `scale=${w}:${h}`;
  ff('-framerate', String(FPS), '-i', path.join(dir, '%04d.jpg'), '-vf', `${fit},format=yuv420p`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-r', String(FPS), file);
  return dur;
}

/** The Elliott + Fibonacci explainer: the teaser's analysis beat (5.6 s → 16.4 s), at the chapter's size and rate. */
function explainer(file, { w, h }) {
  if (!existsSync(path.join(PRISM, '00336.jpg'))) throw new Error('render the teaser first: node scripts/promo-film/render.mjs prism 60');
  ff('-framerate', '60', '-start_number', '336', '-i', path.join(PRISM, '%05d.jpg'), '-frames:v', String(Math.round((16.4 - 5.6) * 60)), '-vf', `fps=${FPS},scale=${w}:${h},format=yuv420p`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', file);
  return 16.4 - 5.6;
}

for (const ch of list.chapters) {
  if (only.length && !only.includes(ch.n)) continue;
  const nn = String(ch.n).padStart(2, '0');
  const mp4 = path.join(OUT, `${nn}.mp4`);
  const raw = path.join(RAW, `${nn}.mp4`);
  // keep the plain recording the first time (or when the recorder made a newer one)
  if (!ch.film || !existsSync(raw)) copyFileSync(mp4, raw);
  const dim = size(raw);
  const next = list.chapters.find((c) => c.n === ch.n + 1);
  const parts = [];
  parts.push({ file: path.join(tmp, 'open.mp4'), dur: await card({ kind: 'open', n: ch.n, title: ch.title, sub: ch.sub }, path.join(tmp, 'open.mp4'), dim) });
  if (ch.slug === 'elliott') parts.push({ file: path.join(tmp, 'explain.mp4'), dur: explainer(path.join(tmp, 'explain.mp4'), dim), shimmer: true });
  // the recording, re-timed to 25 fps and without its old audio
  ff('-i', raw, '-an', '-vf', `fps=${FPS},format=yuv420p`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', path.join(tmp, 'rec.mp4'));
  parts.push({ file: path.join(tmp, 'rec.mp4'), dur: duration(path.join(tmp, 'rec.mp4')) });
  parts.push({ file: path.join(tmp, 'end.mp4'), dur: await card({ kind: 'end', n: ch.n, next: next?.title ?? '' }, path.join(tmp, 'end.mp4'), dim) });

  // picture: crossfade every cut
  const inputs = parts.flatMap((p) => ['-i', p.file]);
  let chain = '', last = '[0:v]', t = 0;
  const cuts = [];
  for (let k = 1; k < parts.length; k++) {
    t += parts[k - 1].dur - XF;
    cuts.push(t);
    const out = k === parts.length - 1 ? '[v]' : `[x${k}]`;
    chain += `${last}[${k}:v]xfade=transition=fade:duration=${XF}:offset=${t.toFixed(3)}${out};`;
    last = out;
  }
  const total = t + parts.at(-1).dur;
  // sound: the nocturne, a whoosh on each cut, a shimmer as each card opens; then the master chain
  const n = parts.length;
  const sfx = [`[${n}:a]volume=-15dB,afade=t=in:st=0:d=1.2,afade=t=out:st=${(total - 3).toFixed(2)}:d=3[m]`];
  const mixIn = ['[m]'];
  const add = (idx, at, gain, label) => {
    sfx.push(`[${idx}:a]adelay=${Math.round(at * 1000)}|${Math.round(at * 1000)},volume=${gain}[${label}]`);
    mixIn.push(`[${label}]`);
  };
  const audio = ['-stream_loop', '-1', '-i', MUSIC];
  const kit = (f) => audio.push('-i', path.join(KIT, f));
  kit('shimmer.wav'); add(n + 1, 0.85, 0.5, 's0');
  cuts.forEach((c, k) => { kit('whoosh.wav'); add(n + 2 + k, Math.max(0, c - 0.35), 0.45, `w${k}`); });
  kit('shimmer.wav'); add(n + 2 + cuts.length, cuts.at(-1) + 0.6, 0.35, 's1');
  const master = `${mixIn.join('')}amix=inputs=${mixIn.length}:normalize=0,highpass=f=40,acompressor=threshold=-24dB:ratio=2.5:attack=20:release=250:makeup=2,loudnorm=I=-18:TP=-1.5:LRA=9,aresample=48000[a]`;
  const film = path.join(tmp, 'film.mp4');
  ff(...inputs, ...audio, '-filter_complex', `${chain}${sfx.join(';')};${master}`, '-map', '[v]', '-map', '[a]', '-t', total.toFixed(2), '-c:v', 'libx264', '-preset', 'slow', '-crf', dim.w < dim.h ? '28' : '24', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', film);
  copyFileSync(film, mp4);
  ff('-i', mp4, '-c:v', 'libvpx-vp9', '-crf', '40', '-b:v', '0', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '4', '-c:a', 'libopus', '-b:a', '96k', mp4.replace(/\.mp4$/, '.webm'));
  ff('-ss', '2.6', '-i', mp4, '-frames:v', '1', '-q:v', '4', path.join(OUT, `${nn}.jpg`)); // the poster is the opening card
  Object.assign(ch, { seconds: Math.round(total), bytes: statSync(mp4).size, film: true });
  writeFileSync(listFile, JSON.stringify({ ...list, made: new Date().toISOString() }, null, 1));
  console.log(`film ${nn} ${ch.title}: ${total.toFixed(1)} s`);
}
await browser.close();
srv.close();
rmSync(tmp, { recursive: true, force: true });
