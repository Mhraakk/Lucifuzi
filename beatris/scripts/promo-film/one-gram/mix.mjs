// The «یک گرم، یک حساب» master. The sound is rebuilt from the composition itself: every <audio> of the staged index.html
// is mixed as written (start, length, offset into its file, volume), the mix is brought to -16 LUFS under a -1 dBTP
// ceiling, and laid under the HyperFrames picture. The video stream is copied, or with --crf re-encoded once for the
// web (H.264 High 4.2, as the help centre's <source> names it). Needs ffmpeg.
//   OM=<OpenMontage checkout> node scripts/promo-film/one-gram/mix.mjs <picture.mp4> <out.mp4> [--lufs=-16] [--crf=20]
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const OM = process.env.OM ?? '/home/user/calesthio/openmontage';
const WS = path.join(OM, 'projects/beatris-one-gram/hyperframes');
const [pic, out] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!pic || !out) throw new Error('usage: mix.mjs <picture.mp4> <out.mp4> [--lufs=-16] [--crf=20]');
const opt = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const LUFS = Number(opt('lufs') ?? -16);
const CRF = opt('crf');
const CEIL = -1; // dBTP, after the AAC encode

const ff = (args) => {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostdin', ...args], { encoding: 'utf8', maxBuffer: 64 << 20 });
  if (r.status) throw new Error(r.stderr.slice(-2000));
  return r.stderr;
};
const loud = (file) => {
  const e = ff(['-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-']);
  const sum = e.slice(e.lastIndexOf('Summary:'));
  const num = (re) => Number(sum.match(re)?.[1]);
  return { I: num(/I:\s+(-?[\d.]+) LUFS/), LRA: num(/LRA:\s+([\d.]+) LU/), TP: num(/Peak:\s+(-?[\d.]+) dBFS/) };
};

// every <audio>, as the composition has it
const html = readFileSync(path.join(WS, 'index.html'), 'utf8');
const attr = (tag, k) => tag.match(new RegExp(`\\s${k}="([^"]*)"`))?.[1];
const tracks = [...html.matchAll(/<audio\b[^>]*>/g)].map(([tag]) => ({
  src: path.join(WS, attr(tag, 'src')),
  start: Number(attr(tag, 'data-start')),
  dur: Number(attr(tag, 'data-duration')),
  from: Number(attr(tag, 'data-playback-start') ?? 0),
  vol: Number(attr(tag, 'data-volume') ?? 1),
}));
const LEN = Number(html.match(/data-composition-id="main"[^>]*?data-duration="([\d.]+)"/)[1]);

const tmp = mkdtempSync(path.join(tmpdir(), 'one-gram-mix-'));
try {
  // each leg: its own window of the file, its volume, click-free edges, then its place on the film's clock
  const inputs = tracks.flatMap((t) => ['-ss', String(t.from), '-t', String(t.dur), '-i', t.src]);
  const legs = tracks.map((t, i) => {
    const ms = Math.round(t.start * 1000);
    const head = t.from > 0 ? ',afade=t=in:d=0.005' : '';
    return `[${i}:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,volume=${t.vol}${head},afade=t=out:st=${(t.dur - 0.012).toFixed(3)}:d=0.012,adelay=${ms}|${ms}[a${i}]`;
  });
  const sum = `${tracks.map((_, i) => `[a${i}]`).join('')}amix=inputs=${tracks.length}:normalize=0:duration=longest,atrim=0:${LEN}[m]`;
  const mix = path.join(tmp, 'mix.wav');
  ff([...inputs, '-filter_complex', `${legs.join(';')};${sum}`, '-map', '[m]', '-c:a', 'pcm_f32le', '-y', mix]);

  // gain to the target, a lookahead limiter a little under the ceiling (the encode adds inter-sample peaks), measured again
  const master = path.join(tmp, 'master.wav');
  const before = loud(mix);
  let gain = LUFS - before.I;
  let m;
  for (let k = 0; k < 4; k++) {
    ff(['-i', mix, '-af', `volume=${gain.toFixed(3)}dB,alimiter=limit=${(10 ** ((CEIL - 0.7) / 20)).toFixed(4)}:attack=5:release=80:level=false:latency=true`, '-c:a', 'pcm_f32le', '-y', master]);
    m = loud(master);
    if (Math.abs(m.I - LUFS) < 0.1) break;
    gain += LUFS - m.I;
  }
  const video = CRF ? ['-c:v', 'libx264', '-preset', 'slow', '-profile:v', 'high', '-level:v', '4.2', '-crf', CRF, '-pix_fmt', 'yuv420p'] : ['-c:v', 'copy'];
  ff(['-i', pic, '-i', master, '-map', '0:v:0', '-map', '1:a:0', ...video, '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-shortest', '-movflags', '+faststart', '-y', out]);
  const f = loud(out);
  console.log(`${tracks.length} tracks · mix ${before.I} LUFS → gain ${gain.toFixed(2)} dB · ${out}: I ${f.I} LUFS, LRA ${f.LRA} LU, true peak ${f.TP} dBTP`);
  if (f.TP > CEIL) throw new Error(`true peak ${f.TP} dBTP is over ${CEIL}`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
