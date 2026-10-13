"""Sound effects for the «منشور» teaser, synthesised (no samples, no licences): soft airy whooshes on real transitions,
glass pings when a wave label or a level lands, one low warm hit when the light enters the gem. Seeded, so every run
gives the same file. Writes a 48 kHz stereo WAV whose events line up with prism.html's timeline.

    python3 scripts/promo-film/sfx.py out.wav          # the teaser's effects track
    python3 scripts/promo-film/sfx.py --kit DIR        # single effects for the tutorial films (whoosh, shimmer, hit)
"""
import sys, wave
import numpy as np

SR, DUR = 48000, 40.0
rng = np.random.default_rng(1405)
mix = np.zeros((int(SR * DUR), 2))


def put(at, sig, gain=1.0, pan=0.0):
    i = int(at * SR)
    n = min(len(sig), len(mix) - i)
    l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    mix[i:i + n, 0] += sig[:n] * gain * l * 1.4142
    mix[i:i + n, 1] += sig[:n] * gain * r * 1.4142


def onepole_lp(x, fc):
    a = np.exp(-2 * np.pi * fc / SR)
    y = np.empty_like(x)
    s = 0.0
    for k, v in enumerate(x):
        s = (1 - a) * v + a * s
        y[k] = s
    return y


def whoosh(d=1.1, lo=300, hi=2600, rise=True):
    """Band-limited noise whose brightness sweeps and whose level swells then falls: soft, no rumble below ~150 Hz."""
    n = int(d * SR)
    t = np.linspace(0, 1, n)
    noise = rng.standard_normal(n)
    # cheap time-varying band: low-pass at a sweeping cutoff minus a fixed low-pass at 150 Hz
    fc = lo + (hi - lo) * (t if rise else 1 - t) ** 1.5
    out = np.empty(n)
    a_lp = np.exp(-2 * np.pi * 150 / SR)
    s = s2 = 0.0
    for k in range(n):
        a = np.exp(-2 * np.pi * fc[k] / SR)
        s = (1 - a) * noise[k] + a * s
        s2 = (1 - a_lp) * s + a_lp * s2
        out[k] = s - s2
    env = np.sin(np.pi * t) ** 1.6 if rise else np.sin(np.pi * np.minimum(1, t * 1.25)) ** 1.4
    out *= env
    return out / (np.abs(out).max() + 1e-9)


def ping(f=1760.0, d=0.9, bright=0.35):
    """A small glass bell: a few inharmonic partials, fast attack, exponential decay."""
    n = int(d * SR)
    t = np.arange(n) / SR
    parts = [(1.0, 1.0, 5.0), (2.76, bright, 9.0), (5.4, bright * 0.5, 14.0)]
    out = sum(a * np.sin(2 * np.pi * f * m * t) * np.exp(-k * t) for m, a, k in parts)
    out *= np.minimum(1, t / 0.004)
    return out / (np.abs(out).max() + 1e-9)


def hit(f=58.0, d=1.6):
    """A low warm hit: a falling sine plus a soft click of noise on top."""
    n = int(d * SR)
    t = np.arange(n) / SR
    body = np.sin(2 * np.pi * (f * t + 18 * (1 - np.exp(-t * 9)) / 9)) * np.exp(-t * 3.2)
    click = onepole_lp(rng.standard_normal(n), 2500) * np.exp(-t * 60) * 0.4
    out = (body + click) * np.minimum(1, t / 0.003)
    return out / (np.abs(out).max() + 1e-9)


def shimmer(d=2.2, base=1046.5):
    """A rising sparkle: a major-ninth cluster of pings, staggered."""
    out = np.zeros(int(d * SR))
    for k, m in enumerate([1, 1.25, 1.5, 1.875, 2.25, 3.0]):
        p = ping(base * m, d=d - k * 0.12, bright=0.2)
        i = int(k * 0.07 * SR)
        out[i:i + len(p)] += p[: len(out) - i] * (0.7 - k * 0.07)
    return out / (np.abs(out).max() + 1e-9)


def write(file, x):
    x = np.atleast_2d(x.T).T if x.ndim == 1 else x
    if x.ndim == 1 or x.shape[1] == 1:
        x = np.repeat(x.reshape(-1, 1), 2, axis=1)
    pcm = (np.clip(x, -1, 1) * 32767).astype('<i2')
    with wave.open(file, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())


if len(sys.argv) > 2 and sys.argv[1] == '--kit':
    import os
    d = sys.argv[2]
    os.makedirs(d, exist_ok=True)
    write(os.path.join(d, 'whoosh.wav'), whoosh(0.9, 400, 3200) * 0.8)
    write(os.path.join(d, 'shimmer.wav'), shimmer(2.4) * 0.6)
    write(os.path.join(d, 'hit.wav'), hit(58, 1.6) * 0.8)
    print('kit', d)
    sys.exit(0)

# ---- the timeline (seconds, from prism.html) ----
put(0.10, whoosh(1.3, 250, 3800), 0.30, -0.4)          # the beam travels in
put(1.28, hit(), 0.55)                                   # it enters the gem
put(1.30, shimmer(2.4), 0.20, 0.3)                       # the spectrum opens
put(3.95, whoosh(1.4, 400, 2400, rise=False), 0.22, 0.4) # rays bend into the price
for k in range(1, 6):                                    # (I)…(V) land
    put(7.2 + k * 0.48, ping(1318.5 * (1.12 ** k), 0.8), 0.20, -0.5 + k * 0.2)
for k in range(7):                                       # Fibonacci levels draw
    put(10.2 + k * 0.12, ping(2093 * (1.06 ** k), 0.5, 0.15), 0.08, 0.6 - k * 0.15)
put(11.4, shimmer(2.0, 784), 0.14, -0.2)                 # the golden spiral unrolls
put(12.9, whoosh(0.9, 500, 2200), 0.16, 0.5)             # scenarios fan out
put(15.3, whoosh(1.3, 300, 3000), 0.24)                  # the chart flies into the app
put(17.4, shimmer(1.6, 659), 0.16)                       # light gathers into the orb
put(18.45, hit(64, 1.2), 0.30)
for at in (21.9, 24.2, 26.5, 28.8):                      # spectral wipes
    put(at, whoosh(0.9, 400, 3200), 0.22, 0.6)
for k in range(4):                                       # four skins land
    put(29.0 + k * 0.16, ping(1568 * (1.122 ** k), 0.7), 0.13, -0.6 + k * 0.4)
put(33.75, whoosh(1.0, 250, 3600), 0.24, -0.4)           # the end beam
put(34.6, hit(55, 2.2), 0.45)
put(34.62, shimmer(3.0, 1046.5), 0.20)

peak = np.abs(mix).max()
mix *= 0.89 / peak
write(sys.argv[1] if len(sys.argv) > 1 else 'sfx.wav', mix)
print('ok', round(float(peak), 3))
