// spec 0055: brings the owner's Higgsfield results into the film. The clips stay outside the repository; this writes
// their frames, the windows each shot reads and the bar's cut-out to scripts/promo-film/stories/gold-ai/ (not committed).
//   node scripts/promo-film/stories/gold-prep.mjs --hook=<block1.mp4> --payoff=<block3.mp4> --bar=<bar.png>
// Each block clip was generated with its cuts on a 2 s grid. The model's cuts are measured (ffmpeg scene scores) and each
// shot reads the stretch between two cuts, a few frames clear of them; when the cuts are not where the prompt asked, the
// shot falls back to its own 2 s of the clip and the report says so, for a look before the render.
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'gold-ai');
const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const SHOTS = { hook: 5, payoff: 2 };
const SCENE = Number(arg('scene') ?? 0.3);

const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 256 << 20 });
  if (r.status) throw new Error(`${cmd}: ${r.stderr.slice(-2000)}`);
  return r;
};
const probe = (file) => {
  const j = JSON.parse(run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate,nb_frames:format=duration', '-of', 'json', file]).stdout);
  const s = j.streams[0];
  const [n, d] = s.r_frame_rate.split('/').map(Number);
  return { w: s.width, h: s.height, fps: n / d, dur: Number(j.format.duration) };
};
const cutsOf = (file) => {
  const e = run('ffmpeg', ['-hide_banner', '-nostdin', '-i', file, '-vf', `select='gt(scene,${SCENE})',showinfo`, '-f', 'null', '-']).stderr;
  return [...e.matchAll(/pts_time:([\d.]+)/g)].map((m) => Number(m[1]));
};

const manifest = { clips: {}, bar: null, made: new Date().toISOString() };
mkdirSync(OUT, { recursive: true });
for (const [name, n] of Object.entries(SHOTS)) {
  const file = arg(name);
  if (!file) continue;
  const p = probe(file);
  const cuts = cutsOf(file);
  const edges = [0, ...cuts, p.dur];
  const clear = 2 / p.fps; // two frames clear of a cut
  let windows, note;
  if (cuts.length === n - 1) {
    windows = edges.slice(0, -1).map((s, i) => {
      const e = edges[i + 1];
      const a = s + (i ? clear : 0), z = e - (i < n - 1 ? clear : 0);
      // a long stretch gives the shot its first 2 s; a short one is read whole (slightly slower than life)
      return [Number(a.toFixed(3)), Number(Math.min(z, a + 2).toFixed(3))];
    });
    note = 'measured';
  } else {
    windows = Array.from({ length: n }, (_, i) => [i * 2, Math.min(p.dur, i * 2 + 2)]);
    note = `fallback: ${cuts.length} cuts found where ${n - 1} were asked (scene > ${SCENE}); check the windows`;
  }
  const dir = path.join(OUT, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  run('ffmpeg', ['-hide_banner', '-nostdin', '-v', 'error', '-i', file, '-vf', 'scale=1920:1080:force_original_aspect_ratio=increase:flags=lanczos,crop=1920:1080', '-q:v', '2', path.join(dir, 'f%04d.jpg')]);
  const frames = Math.round(p.dur * p.fps);
  manifest.clips[name] = { source: path.basename(file), w: p.w, h: p.h, fps: p.fps, dur: p.dur, frames, cuts, windows, note };
  console.log(`${name}: ${p.w}×${p.h} @ ${p.fps.toFixed(3)} fps, ${p.dur.toFixed(2)} s; cuts ${cuts.map((c) => c.toFixed(2)).join(', ') || 'none'}; ${note}`);
  windows.forEach(([a, z], i) => console.log(`   shot ${i + 1}: ${a.toFixed(2)}–${z.toFixed(2)} s (×${((z - a) / 2).toFixed(2)} speed)`));
}

// the bar's cut-out: the black velvet keyed away, cropped to the bar with a margin
const bar = arg('bar');
if (bar) {
  const e = run('ffmpeg', ['-hide_banner', '-nostdin', '-i', bar, '-vf', 'format=gray,bbox=min_val=60', '-f', 'null', '-']).stderr;
  const m = [...e.matchAll(/x1:(\d+) x2:(\d+) y1:(\d+) y2:(\d+)/g)].pop();
  if (!m) throw new Error('bar: no bright object found');
  const [x1, x2, y1, y2] = m.slice(1).map(Number);
  const pad = Math.round((x2 - x1) * 0.08);
  const cx = Math.max(0, x1 - pad), cy = Math.max(0, y1 - pad), cw = x2 - x1 + 2 * pad, ch = y2 - y1 + 2 * pad;
  run('ffmpeg', ['-hide_banner', '-nostdin', '-v', 'error', '-y', '-i', bar, '-vf', `crop=${cw}:${ch}:${cx}:${cy},colorkey=0x080705:0.16:0.14,scale=1040:-1:flags=lanczos,format=rgba`, path.join(OUT, 'bar-cut.png')]);
  manifest.bar = { file: 'bar-cut.png', from: path.basename(bar), crop: [cx, cy, cw, ch] };
  console.log(`bar: cut out ${cw}×${ch} at ${cx},${cy}`);
}
// the master's frame rate: an exact multiple of the clips' own rate, so every source frame is held equally long
const rates = [...new Set(Object.values(manifest.clips).map((c) => Math.round(c.fps)))];
manifest.fps = rates.length === 1 ? (rates[0] <= 30 ? rates[0] * 2 : rates[0]) : 60;
writeFileSync(path.join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 1)}\n`);
console.log(`manifest: master ${manifest.fps} fps (clips at ${rates.join(', ')} fps)`);
