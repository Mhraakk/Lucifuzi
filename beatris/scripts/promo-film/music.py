"""Music for «رؤیای طلایی», the bright teaser: an original, fully synthesised cue (no samples, no licences), seeded so
every run writes the same file. D major at 104 BPM, I–V–vi–IV, laid out on the film's own scenes:

    0.0  dawn          soft pads and a shimmer
    4.6  sign-in       plucked arpeggios join
    9.2  sales desk    bass and a light kit (kick, offbeat hats, claps from 13.8)
   25.4  the letter    the kit steps out: pads and slow, piano-like notes (G A F#m Bm)
   30.0  the way in    one last D chord with a kick, ringing out to 32 s

    python3 scripts/promo-film/music.py out.wav [seconds]
"""
import sys, wave
import numpy as np

SR = 48000
DUR = float(sys.argv[2]) if len(sys.argv) > 2 else 32.0
BPM = 104.0
BEAT = 60.0 / BPM
BAR = 4 * BEAT
rng = np.random.default_rng(1405)
N = int(SR * (DUR + 2.5))
mix = np.zeros((N, 2))


def hz(n):
    """note name → frequency, e.g. 'F#4'"""
    names = {'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11}
    k, o = n[:-1], int(n[-1])
    return 440.0 * 2 ** ((names[k] + 12 * (o + 1) - 69) / 12)


def put(at, sig, gain=1.0, pan=0.0):
    i = int(at * SR)
    if i >= N:
        return
    n = min(len(sig), N - i)
    l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    mix[i:i + n, 0] += sig[:n] * gain * l * 1.4142
    mix[i:i + n, 1] += sig[:n] * gain * r * 1.4142


def pad_note(f, d, detune=0.0):
    """A soft saw-like pad: a few rolled-off harmonics, slow in, slow out."""
    n = int(d * SR)
    t = np.arange(n) / SR
    f = f * (1 + detune)
    out = sum(np.sin(2 * np.pi * f * k * t + k * 0.7) / k * np.exp(-k / 3.2) for k in range(1, 9))
    env = np.minimum(1, t / 0.9) * np.minimum(1, (d - t) / 0.9)
    return out * env


def pluck(f, d=0.6, bright=1.0):
    """A soft marimba-like pluck: harmonics that die away quickly."""
    n = int(d * SR)
    t = np.arange(n) / SR
    out = sum(a * np.sin(2 * np.pi * f * m * t) * np.exp(-t * k) for m, a, k in [(1, 1.0, 7), (2, 0.42 * bright, 13), (3, 0.18 * bright, 19), (4.01, 0.08 * bright, 27)])
    return out * np.minimum(1, t / 0.003)


def keys(f, d=2.2):
    """A slow, piano-like note for the letter: a struck partial set with a long, gentle tail."""
    n = int(d * SR)
    t = np.arange(n) / SR
    out = sum(a * np.sin(2 * np.pi * f * m * t) * np.exp(-t * k) for m, a, k in [(1, 1.0, 1.6), (2.0, 0.35, 2.6), (3.0, 0.14, 3.8), (4.02, 0.06, 5.0)])
    return out * np.minimum(1, t / 0.004)


def bass(f, d=BEAT * 0.95):
    n = int(d * SR)
    t = np.arange(n) / SR
    out = np.sin(2 * np.pi * f * t) + 0.28 * np.sin(4 * np.pi * f * t)
    return out * np.minimum(1, t / 0.006) * np.exp(-t * 2.6)


def kick():
    n = int(0.32 * SR)
    t = np.arange(n) / SR
    ph = 2 * np.pi * (48 * t + (110 - 48) * (1 - np.exp(-t * 26)) / 26)
    return np.sin(ph) * np.exp(-t * 11) * np.minimum(1, t / 0.002)


def hat():
    n = int(0.06 * SR)
    t = np.arange(n) / SR
    x = rng.standard_normal(n)
    x = np.diff(x, prepend=0)  # a first difference: bright, no low end
    return x * np.exp(-t * 70) * 0.5


def clap():
    n = int(0.22 * SR)
    t = np.arange(n) / SR
    x = rng.standard_normal(n)
    x = np.diff(x, prepend=0) * 0.6 + x * 0.2
    env = np.exp(-t * 26) + 0.6 * np.exp(-np.maximum(0, t - 0.012) * 40) * (t > 0.012) + 0.4 * np.exp(-np.maximum(0, t - 0.024) * 40) * (t > 0.024)
    return x * env * 0.5


CH = {
    'D': ['D3', 'F#3', 'A3', 'D4', 'F#4'], 'A': ['A2', 'E3', 'A3', 'C#4', 'E4'], 'Bm': ['B2', 'F#3', 'B3', 'D4', 'F#4'], 'G': ['G2', 'D3', 'G3', 'B3', 'D4'],
    'F#m': ['F#2', 'C#3', 'F#3', 'A3', 'C#4'],
}
ROOT = {'D': 'D2', 'A': 'A1', 'Bm': 'B1', 'G': 'G1', 'F#m': 'F#1'}
ARP = {'D': ['D5', 'F#5', 'A5', 'D6'], 'A': ['C#5', 'E5', 'A5', 'C#6'], 'Bm': ['B4', 'D5', 'F#5', 'B5'], 'G': ['B4', 'D5', 'G5', 'B5'], 'F#m': ['A4', 'C#5', 'F#5', 'A5']}
PLAN = ['D', 'A', 'Bm', 'G', 'D', 'A', 'Bm', 'G', 'D', 'A', 'Bm', 'G', 'A', 'D']  # 14 bars; the letter re-voices 11–12
LETTER = {11: 'G', 12: 'A'}

for b, ch in enumerate(PLAN):
    at = b * BAR
    last = b == len(PLAN) - 1
    d = (BAR + 0.9) if not last else (DUR - at + 2.0)
    # pads, a little wider in stereo by a small detune each side
    for k, nn in enumerate(CH[ch]):
        g = 0.05 if b < 11 or b > 12 else 0.045
        put(at, pad_note(hz(nn), d, -0.0016), g, -0.5)
        put(at, pad_note(hz(nn), d, +0.0016), g, 0.5)
    if 2 <= b <= 10 or last:
        # eighth-note arpeggio, up and back: 0 1 2 3 2 1 2 3
        pat = [0, 1, 2, 3, 2, 1, 2, 3]
        for i, p in enumerate(pat if not last else [0, 1, 2, 3]):
            put(at + i * BEAT / 2, pluck(hz(ARP[ch][p]), 0.55, 0.9 if b > 3 else 0.6), 0.09 if b > 3 else 0.07, -0.35 if i % 2 else 0.35)
    if 4 <= b <= 10:
        for q in range(4):
            put(at + q * BEAT, bass(hz(ROOT[ch])), 0.30)
            if q in (0, 2):
                put(at + q * BEAT, kick(), 0.42)
            put(at + q * BEAT + BEAT / 2, hat(), 0.055, 0.25)
            if b >= 6 and q in (1, 3):
                put(at + q * BEAT, clap(), 0.08, -0.1)
    if b in LETTER:
        # the letter: slow notes over the pad, a melody that walks down to the cadence
        line = {11: ['B4', 'D5', 'G5', 'F#5'], 12: ['E5', 'C#5', 'A4', 'C#5']}[b]
        for q, nn in enumerate(line):
            put(at + q * BEAT, keys(hz(nn), 2.4), 0.11, -0.15 + 0.1 * q)
    if last:
        put(at, kick(), 0.45)
        put(at, bass(hz(ROOT[ch]), 2.8), 0.32)
        for q, nn in enumerate(['D5', 'F#5', 'A5', 'D6']):
            put(at + q * 0.09, keys(hz(nn), 3.4), 0.09, -0.3 + 0.2 * q)

x = mix[: int(SR * DUR)]
# gentle glue: a soft saturation, then the peak to −1 dBFS (the film's mix sets the loudness)
x = np.tanh(x * 1.6) / 1.6
x *= 0.891 / (np.abs(x).max() + 1e-9)
fade = int(SR * 0.4)
x[-fade:] *= np.linspace(1, 0, fade)[:, None]
pcm = (np.clip(x, -1, 1) * 32767).astype('<i2')
with wave.open(sys.argv[1] if len(sys.argv) > 1 else 'music.wav', 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print('music', round(DUR, 2), 's', len(PLAN), 'bars at', BPM, 'BPM')
