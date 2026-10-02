// حرکت (spec 0021): the app's one small motion kit. A physical spring (one shared frame loop, idle when everything is
// at rest), the same spring as a CSS/WAAPI easing curve, and a text morph. Persian letters join, so the morph moves
// whole words: a kept word glides to its new place, a new word rises out of a soft blur, an old one leaves upward.
// Everything honours prefers-reduced-motion and touches only transform, opacity and filter.

export const still = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------------- springs ---------------- */
const live = new Set();
let raf = 0, last = 0;
function tick(now) {
  const dt = Math.min(0.032, (now - (last || now)) / 1000) || 1 / 60;
  last = now;
  for (const s of live) {
    // semi-implicit Euler in 4 sub-steps: stable for the stiff, light springs a UI wants
    for (let k = 0; k < 4; k++) {
      const h = dt / 4;
      const a = (-s.k * (s.x - s.to) - s.c * s.v) / s.m;
      s.v += a * h;
      s.x += s.v * h;
    }
    const done = Math.abs(s.v) < s.rest && Math.abs(s.x - s.to) < s.rest;
    if (done) (s.x = s.to), (s.v = 0), live.delete(s);
    s.on(s.x, s.v);
  }
  raf = live.size ? requestAnimationFrame(tick) : ((last = 0), 0);
}
/**
 * A spring towards a target. on(x, v) runs every frame while it moves. Stiffness, damping and mass are physical;
 * `rest` is the distance under which it snaps and sleeps.
 */
export function spring(x, on, { stiffness = 320, damping = 30, mass = 1, rest = 0.01 } = {}) {
  const s = { x, v: 0, to: x, k: stiffness, c: damping, m: mass, rest, on };
  return {
    get value() {
      return s.x;
    },
    get velocity() {
      return s.v;
    },
    set(to, { jump = false } = {}) {
      s.to = to;
      if (jump || still()) {
        s.x = to;
        s.v = 0;
        live.delete(s);
        return on(to, 0);
      }
      live.add(s);
      if (!raf) raf = requestAnimationFrame(tick);
    },
    stop() {
      live.delete(s);
    },
  };
}

/**
 * The same spring as a `linear()` easing for CSS transitions and element.animate(), sampled from the closed-form
 * solution; `bounce` 0 is critically damped, 0.2 overshoots a little. Falls back to an ease-out curve.
 */
const cache = new Map();
export function springEase(bounce = 0.12, n = 40) {
  const key = `${bounce}`;
  if (cache.has(key)) return cache.get(key);
  let out = 'cubic-bezier(0.22, 1, 0.36, 1)';
  if (typeof CSS !== 'undefined' && CSS.supports?.('animation-timing-function', 'linear(0, 1)')) {
    const zeta = 1 - bounce; // damping ratio
    const w = 2 * Math.PI * 1.15; // natural frequency for a curve that settles near t = 1
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      let y;
      if (zeta < 1) {
        const wd = w * Math.sqrt(1 - zeta * zeta);
        y = 1 - Math.exp(-zeta * w * t * 3) * (Math.cos(wd * t * 3) + ((zeta * w) / wd) * Math.sin(wd * t * 3));
      } else y = 1 - Math.exp(-w * t * 3) * (1 + w * t * 3);
      pts.push(+(i === n ? 1 : y).toFixed(4));
    }
    out = `linear(${pts.join(', ')})`;
  }
  cache.set(key, out);
  return out;
}

/* ---------------- text morph ---------------- */
const tokens = (text) => {
  const seen = new Map();
  return String(text)
    .split(/(\s+)/)
    .filter((t) => t.length)
    .map((t) => {
      const n = (seen.get(t) ?? 0) + 1;
      seen.set(t, n);
      return { key: `${t}\u0000${n}`, text: t, space: /^\s+$/.test(t) };
    });
};

/**
 * Change el's text to `text` with the morph: kept words glide (a spring on transform), new words rise out of a blur,
 * leaving words fade up and away. The element keeps an aria-label of the whole text for screen readers.
 */
export function morphText(el, text, { duration = 220, bounce = 0.12 } = {}) {
  if (!el) return;
  text = String(text ?? '');
  if (el.dataset.morph === text) return;
  const first = el.dataset.morph == null;
  el.dataset.morph = text;
  el.setAttribute('aria-label', text);
  if (first || still() || !el.isConnected || typeof el.animate !== 'function') {
    el.textContent = '';
    for (const t of tokens(text)) el.append(word(t));
    return;
  }
  const old = new Map();
  const box = el.getBoundingClientRect();
  for (const s of el.querySelectorAll(':scope > .tm-w')) old.set(s.dataset.k, { el: s, r: s.getBoundingClientRect() });
  const next = tokens(text).map((t) => {
    const prev = old.get(t.key);
    if (prev) old.delete(t.key);
    return { t, prev };
  });
  // leaving words: lifted out of the flow at their last place, then faded up
  for (const { el: s, r } of old.values()) {
    const ghost = s.cloneNode(true);
    ghost.classList.add('tm-out');
    Object.assign(ghost.style, { position: 'absolute', left: `${r.left - box.left}px`, top: `${r.top - box.top}px`, margin: 0 });
    s.remove();
    el.append(ghost);
    ghost.animate([{ opacity: 1, transform: 'translateY(0)', filter: 'blur(0px)' }, { opacity: 0, transform: 'translateY(-6px)', filter: 'blur(4px)' }], { duration, easing: 'ease-out' }).finished.then(() => ghost.remove(), () => ghost.remove());
  }
  // lay out the new order, then play each kept word from where it was (FLIP) and each new word from a blur
  const nodes = next.map(({ t, prev }) => prev?.el ?? word(t));
  for (const g of el.querySelectorAll(':scope > .tm-out')) nodes.push(g);
  el.replaceChildren(...nodes);
  const ease = springEase(bounce);
  next.forEach(({ prev }, i) => {
    const s = nodes[i];
    if (prev) {
      const r = s.getBoundingClientRect();
      const dx = prev.r.left - r.left, dy = prev.r.top - r.top;
      if (Math.abs(dx) + Math.abs(dy) > 0.5) s.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }], { duration: duration * 2, easing: ease });
    } else if (!s.classList.contains('tm-sp')) {
      s.animate([{ opacity: 0, transform: 'translateY(6px)', filter: 'blur(10px)' }, { opacity: 1, transform: 'translateY(0)', filter: 'blur(10px)', offset: 0.35 }, { opacity: 1, transform: 'translateY(0)', filter: 'blur(0px)' }], { duration: duration * 1.6, easing: 'ease-out' });
    }
  });
}
function word(t) {
  const s = document.createElement('span');
  s.className = t.space ? 'tm-w tm-sp' : 'tm-w';
  s.dataset.k = t.key;
  s.setAttribute('aria-hidden', 'true');
  s.textContent = t.text;
  return s;
}
