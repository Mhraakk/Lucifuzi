// spec 0047: the shared kit of the three story films. Every value is a pure function of the film's time t (seconds), so
// a frame can be drawn alone, in any order, and the recorder (render.mjs) gets the same picture each time.
// Words move as whole words: Persian letters are joined, so they never break apart.

export const BPM = 117.13919;
export const BEAT = 60 / BPM;
export const BAR = 4 * BEAT; // 2.0488 s: every cut of the three films sits on this grid
export const bar = (n) => n * BAR; // the time of bar n (0-based)

export const clamp01 = (x) => Math.min(1, Math.max(0, x));
export const lerp = (a, b, k) => a + (b - a) * k;
export const ease = {
  linear: (x) => x,
  out: (x) => 1 - (1 - x) ** 3,
  out5: (x) => 1 - (1 - x) ** 5,
  in: (x) => x ** 3,
  inOut: (x) => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2),
  expoOut: (x) => (x >= 1 ? 1 : 1 - 2 ** (-10 * x)),
  expoInOut: (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x < 0.5 ? 2 ** (20 * x - 10) / 2 : (2 - 2 ** (-20 * x + 10)) / 2),
};
/** 0 → 1 between t0 and t1, eased. */
export const prog = (t, t0, t1, e = ease.out) => e(clamp01((t - t0) / Math.max(1e-6, t1 - t0)));
/** In over [t0, t0 + din], out over [t1 − dout, t1]: 0 → 1 → 0. */
export const window01 = (t, t0, t1, din = 0.5, dout = 0.4, ein = ease.out, eout = ease.in) =>
  t < t0 || t > t1 ? 0 : Math.min(prog(t, t0, t0 + din, ein), 1 - prog(t, t1 - dout, t1, eout));

/** Seeded random (mulberry32): the films never call Math.random. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

const FA = '۰۱۲۳۴۵۶۷۸۹';
/** Persian digits, with the Persian thousands separator and decimal mark. */
export const fa = (n, { sep = true, dec = null } = {}) => {
  const s = typeof n === 'number' ? (dec === null ? String(Math.round(n)) : n.toFixed(dec)) : String(n);
  const [i, f] = s.split('.');
  const int = sep ? i.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : i;
  return (f !== undefined ? `${int}.${f}` : int).replace(/\d/g, (d) => FA[d]).replace(/,/g, '٬').replace(/\./g, '٫');
};

export const $ = (q, el = document) => el.querySelector(q);
export const $$ = (q, el = document) => [...el.querySelectorAll(q)];
export const css = (el, o) => {
  for (const [k, v] of Object.entries(o)) el.style.setProperty(k, String(v));
};

/**
 * A line of words that blur in and out, word by word (the reference's type grammar). `el` holds the words as
 * <span class="w">; between t0 and t1 the words arrive with a stagger and leave together.
 */
export function words(el, t, { t0, t1, stagger = 0.07, din = 0.55, dout = 0.4, blur = 14, rise = 18, exitBlur = 10 }) {
  const ws = $$('.w', el);
  const outK = prog(t, t1 - dout, t1, ease.in);
  ws.forEach((w, i) => {
    const k = prog(t, t0 + i * stagger, t0 + i * stagger + din, ease.out5);
    const a = t < t0 || t > t1 ? 0 : k * (1 - outK);
    css(w, { opacity: a.toFixed(4), filter: `blur(${((1 - k) * blur + outK * exitBlur).toFixed(2)}px)`, transform: `translateY(${((1 - k) * rise - outK * rise * 0.4).toFixed(2)}px)` });
  });
  el.style.visibility = t < t0 || t > t1 ? 'hidden' : 'visible';
}
/** Wraps each word of an element's text in <span class="w"> (spaces kept, so the line breaks as type should). */
export function splitWords(el) {
  if (el.dataset.split) return;
  const parts = el.innerHTML.split(/(\s+)/);
  el.innerHTML = parts.map((p) => (/^\s+$/.test(p) || p === '' ? p : `<span class="w">${p}</span>`)).join('');
  el.dataset.split = '1';
}

/** A camera over a picture: keys [{t, x, y, s}] (focus point in picture px, scale), eased between keys. */
export function camera(img, t, keys, { w = 1920, h = 1080, e = ease.inOut } = {}) {
  let a = keys[0], b = keys[keys.length - 1];
  for (let i = 0; i < keys.length - 1; i++) if (t >= keys[i].t && t <= keys[i + 1].t) (a = keys[i]), (b = keys[i + 1]);
  const k = t <= keys[0].t ? 0 : t >= keys[keys.length - 1].t ? 1 : e(clamp01((t - a.t) / Math.max(1e-6, b.t - a.t)));
  const x = lerp(a.x, b.x, k), y = lerp(a.y, b.y, k), s = lerp(a.s, b.s, k);
  css(img, { transform: `translate(${(w / 2 - x * s).toFixed(2)}px, ${(h / 2 - y * s).toFixed(2)}px) scale(${s.toFixed(5)})` });
  return { x, y, s };
}

/** The cursor: keys [{t, x, y}] in frame px; clicks [t…] press it and send a ring out. */
export function cursor(el, ring, t, keys, clicks = []) {
  let a = keys[0], b = keys[keys.length - 1];
  for (let i = 0; i < keys.length - 1; i++) if (t >= keys[i].t && t <= keys[i + 1].t) (a = keys[i]), (b = keys[i + 1]);
  const k = t <= keys[0].t ? 0 : t >= keys[keys.length - 1].t ? 1 : ease.inOut(clamp01((t - a.t) / Math.max(1e-6, b.t - a.t)));
  const x = lerp(a.x, b.x, k), y = lerp(a.y, b.y, k);
  const press = clicks.reduce((m, c) => Math.max(m, t >= c - 0.08 && t <= c + 0.16 ? 1 - Math.abs(t - c) / 0.16 : 0), 0);
  const vis = t < keys[0].t - 0.3 || t > keys[keys.length - 1].t + 0.6 ? 0 : 1;
  css(el, { transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${(1 - press * 0.16).toFixed(3)})`, opacity: vis });
  if (ring) {
    const c = clicks.filter((c) => t >= c && t <= c + 0.7).pop();
    const r = c === undefined ? 0 : prog(t, c, c + 0.7, ease.out);
    css(ring, { transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${(0.3 + r * 1.6).toFixed(3)})`, opacity: c === undefined ? 0 : (1 - r).toFixed(3) });
  }
  return { x, y };
}

/** A number that counts from a to b between t0 and t1 (Persian digits). */
export const count = (t, t0, t1, a, b, opts) => fa(lerp(a, b, prog(t, t0, t1, ease.out5)), opts);

/** The read time of a line (letters ÷ 15 + 1.5 s, and never under 1.8 s): spec 0047's check. */
export const readTime = (text) => Math.max(1.8, text.replace(/\s+/g, '').length / 15 + 1.5);
