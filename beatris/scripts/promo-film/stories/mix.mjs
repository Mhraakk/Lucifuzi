// spec 0047: the sound of a story film, laid under its picture. The music is «Autofahren» (Mixkit), cut on its own bar grid:
// the film's section of the track, then the track's own ending for the end card (a 30 ms crossfade, a 0.25 s tail fade).
// The effects are placed on the film's own events (window.EV, saved by render.mjs next to the picture), each starting so
// that its audible onset meets its frame. The mix is mastered to −16 LUFS under a −1 dBTP ceiling; the video is copied.
//   MUSIC=<autofahren.mp3> SFX=<HyperFrames sfx dir> node scripts/promo-film/stories/mix.mjs <picture.mp4> <out.mp4>
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const [pic, out] = process.argv.slice(2);
if (!pic || !out) throw new Error('usage: mix.mjs <picture.mp4> <out.mp4>');
const OM = process.env.OM ?? '/home/user/calesthio/openmontage';
const MUSIC = process.env.MUSIC ?? path.join(OM, 'projects/beatris-one-gram/assets/music/autofahren-mixkit-770.mp3');
const SFX = process.env.SFX ?? path.join(OM, '.agents/skills/hyperframes-media/assets/sfx');
for (const [k, p] of [['MUSIC', MUSIC], ['SFX', SFX]]) if (!existsSync(p)) throw new Error(`${k}: not found (${p})`);
const meta = JSON.parse(readFileSync(pic.replace(/\.mp4$/, '.json'), 'utf8')); // { DUR, EV: [{t, s, v}], MUSIC: {from, bars, end: [a, b]} }
const LUFS = -16, CEIL = -1;

const ff = (args) => {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostdin', '-y', ...args], { encoding: 'utf8', maxBuffer: 64 << 20 });
  if (r.status) throw new Error(r.stderr.slice(-3000));
  return r.stderr;
};
const loud = (file) => {
  const e = ff(['-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-']);
  const sum = e.slice(e.lastIndexOf('Summary:'));
  const num = (re) => Number(sum.match(re)?.[1]);
  return { I: num(/I:\s+(-?[\d.]+) LUFS/), TP: num(/Peak:\s+(-?[\d.]+) dBFS/) };
};
// the first audible moment of an effect file (its own leading silence is skipped, so the onset meets the frame)
const onset = (file) => {
  const e = ff(['-i', file, '-af', 'silencedetect=noise=-45dB:d=0.01', '-f', 'null', '-']);
  const m = e.match(/silence_end: ([\d.]+)/);
  const first = e.match(/silence_start: ([\d.]+)/);
  return first && Number(first[1]) === 0 && m ? Number(m[1]) : 0;
};

const tmp = mkdtempSync(path.join(tmpdir(), 'story-mix-'));
try {
  // 1. the music edit
  const BAR = (4 * 60) / 117.13919;
  const { from, bars, end } = meta.MUSIC;
  const body = bars * BAR, tail = end[1] - end[0], X = 0.03;
  const music = path.join(tmp, 'music.wav');
  ff(['-i', MUSIC, '-i', MUSIC, '-filter_complex',
    `[0:a]atrim=${from}:${from + body + X},asetpts=PTS-STARTPTS[a];[1:a]atrim=${end[0]}:${end[1]},asetpts=PTS-STARTPTS[b];[a][b]acrossfade=d=${X}:c1=tri:c2=tri,afade=t=out:st=${(body + tail - 0.25).toFixed(3)}:d=0.25,aresample=48000[m]`,
    '-map', '[m]', '-ac', '2', music]);
  // 2. the effects, each on its frame
  const ins = [], parts = [];
  meta.EV.forEach((e, i) => {
    const f = path.join(SFX, `${e.s}.mp3`);
    if (!existsSync(f)) throw new Error(`effect ${e.s}: not found`);
    const lead = onset(f);
    ins.push('-ss', lead.toFixed(3), '-i', f);
    parts.push(`[${i + 1}:a]aresample=48000,aformat=channel_layouts=stereo,volume=${e.v ?? 0.3},adelay=${Math.max(0, Math.round(e.t * 1000))}|${Math.max(0, Math.round(e.t * 1000))}[e${i}]`);
  });
  const raw = path.join(tmp, 'raw.wav');
  ff(['-i', music, ...ins, '-filter_complex', `${parts.join(';')};[0:a]${meta.EV.map((_, i) => `[e${i}]`).join('')}amix=inputs=${meta.EV.length + 1}:normalize=0:duration=first[x]`, '-map', '[x]', '-t', meta.DUR.toFixed(3), raw]);
  // 3. master: two passes of loudness to −16 LUFS under a true-peak ceiling. The ceiling is measured on the encoded
  //    file; when the AAC's inter-sample peaks still pass it, the master is made again with a lower peak target.
  const m1 = ff(['-i', raw, '-af', `loudnorm=I=${LUFS}:TP=${CEIL - 0.5}:LRA=11:print_format=json`, '-f', 'null', '-']);
  const j = JSON.parse(m1.slice(m1.lastIndexOf('{'), m1.lastIndexOf('}') + 1));
  const mastered = path.join(tmp, 'master.wav');
  let L, tp = CEIL - 0.5;
  for (let k = 0; k < 4; k++) {
    ff(['-i', raw, '-af', `loudnorm=I=${LUFS}:TP=${tp.toFixed(2)}:LRA=11:measured_I=${j.input_i}:measured_TP=${j.input_tp}:measured_LRA=${j.input_lra}:measured_thresh=${j.input_thresh}:offset=${j.target_offset}:linear=true,aresample=48000`, mastered]);
    ff(['-i', pic, '-i', mastered, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-shortest', '-movflags', '+faststart', out]);
    L = loud(out);
    if (L.TP <= CEIL) break;
    tp -= Math.max(0.3, L.TP - CEIL + 0.2);
  }
  console.log(`${out}: ${L.I} LUFS, true peak ${L.TP} dBFS (target ${tp.toFixed(2)}), ${meta.EV.length} effects, music ${from.toFixed(2)}–${(from + body).toFixed(2)} s + ending`);
  if (Math.abs(L.I - LUFS) > 0.5 || L.TP > CEIL) process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
