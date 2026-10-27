# spec 0051 (amendment: Mozart): lays a recording's phrases on the film's bar grid, so its music is on the beat.
# A plan (JSON) names the attack of every phrase that starts a film bar, and an ending: the movement's own last bars,
# also by their attacks, one per film bar, the last being the final chord. Each source span between two attacks is
# time-stretched (ffmpeg rubberband,
# pitch kept, with 0.3 s of context either side) to exactly one film bar; the spans are joined with short equal-power
# crossfades placed just before each attack, so every attack stays whole. The final chord rings out unstretched.
# The track is written raw (48 kHz stereo); mix.mjs lays it as an unbroken stretch and masters the film.
#   python3 -I scripts/promo-film/stories/warp-music.py <recording> <plan.json> <out.wav>
# plan: { "bar": s, "dur": s, "lead": s, "xfade": s, "phrases": [attack s, …], "ending": { "phrases": [attack s, …, final chord], "to": s } }
import json, subprocess, sys, tempfile, os
import numpy as np

SR = 48000
rec, plan_path, out = sys.argv[1], sys.argv[2], sys.argv[3]
plan = json.load(open(plan_path))
BAR, DUR, LEAD, XF, PAD = plan['bar'], plan['dur'], plan.get('lead', 0.012), plan.get('xfade', 0.006), 0.3

tmp = tempfile.mkdtemp(prefix='warp-')
src = os.path.join(tmp, 'src.wav')
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', rec, '-ac', '2', '-ar', str(SR), '-c:a', 'pcm_f32le', src], check=True)


def stretched(a, c, length):
    """the span [a, c] of the recording, time-stretched to `length` seconds (plus XF of what follows it)"""
    r = (c - a) / length  # rubberband tempo: > 1 plays faster
    pre = min(PAD, a)
    p = subprocess.run(['ffmpeg', '-v', 'error', '-ss', f'{a - pre:.6f}', '-t', f'{c - a + pre + PAD:.6f}', '-i', src,
                        '-af', f'rubberband=tempo={r:.8f}:pitchq=quality:transients=crisp', '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-'],
                       capture_output=True, check=True)
    y = np.frombuffer(p.stdout, np.float32).reshape(-1, 2)
    s0 = int(round(pre / r * SR))
    return y[s0:s0 + int(round((length + XF) * SR))], r


def plain(a, c):
    p = subprocess.run(['ffmpeg', '-v', 'error', '-ss', f'{a:.6f}', '-t', f'{c - a:.6f}', '-i', src, '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-'],
                       capture_output=True, check=True)
    return np.frombuffer(p.stdout, np.float32).reshape(-1, 2)


n = int(round(DUR * SR))
track = np.zeros((n + SR, 2), np.float32)
xf = int(round(XF * SR))
fade_in = np.sin(np.linspace(0, np.pi / 2, xf))[:, None] ** 1
fade_out = np.cos(np.linspace(0, np.pi / 2, xf))[:, None] ** 1


def lay(seg, at, first=False):
    """add a segment from sample `at`; its first XF samples fade in over the previous segment's last XF, which fade out"""
    seg = seg.copy()
    if not first:
        seg[:xf] *= fade_in
        track[at:at + xf] *= np.concatenate([fade_out, np.ones((0, 1))])
    end = min(len(track), at + len(seg))
    if first:
        track[at:end] = seg[:end - at]
    else:
        track[at + xf:end] = seg[xf:end - at]
        track[at:at + xf] += seg[:xf]


report = []
cuts = [t - LEAD for t in plan['phrases']]
for k in range(len(cuts) - 1):
    seg, r = stretched(cuts[k], cuts[k + 1], BAR)
    lay(seg, int(round(k * BAR * SR)), first=(k == 0))
    report.append(f'bar {k}: {plan["phrases"][k]:.3f}–{plan["phrases"][k + 1]:.3f} s ×{1 / r:.4f}')
# the ending: the coda's spans, a bar each, then the final chord rings out as played
e = plan['ending']
k = len(cuts) - 1
for a, c in zip(e['phrases'], e['phrases'][1:]):
    seg, r = stretched(a - LEAD, c - LEAD, BAR)
    lay(seg, int(round(k * BAR * SR)))
    report.append(f'bar {k}: ending {a:.3f}–{c:.3f} s ×{1 / r:.4f}')
    k += 1
tail = plain(e['phrases'][-1] - LEAD, e['to'])
lay(tail, int(round(k * BAR * SR)))
report.append(f'bar {k}: final chord {e["phrases"][-1]:.3f} s, rings to {e["to"]:.2f} s (as played)')

track = track[:n]
track[:int(0.005 * SR)] *= np.linspace(0, 1, int(0.005 * SR))[:, None]
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', '-', '-c:a', 'pcm_f32le', out],
               input=track.astype(np.float32).tobytes(), check=True)
print('\n'.join(report))
print(f'{out}: {DUR:.2f} s; every phrase attack on its bar ({BAR:.4f} s), the final chord on bar {k}')
