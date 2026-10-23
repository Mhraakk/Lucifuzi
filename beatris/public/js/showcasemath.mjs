// ویترین سکه‌ها (spec 0041), the pure part: where each card of the endless 3D carousel stands, how the carousel glides
// and settles, the flight of a card into the detail window, and the coin facts on a card. No DOM; shared by
// pages/coinshowcase.mjs and tests/showcase.test.mjs.

export const GAP = 22;
/** Per frame at 60 fps, as the design states them; step() scales them to the real frame time. */
export const PHYS = { friction: 0.935, snap: 0.035, auto: 0.45, autoDelay: 3200, lerp: 0.1 };
const FRAME = 1000 / 60;

/**
 * Card size for a viewport width and the room under the hero (px from the carousel's top to the bottom of the first
 * screen). From 768 px up, a short screen (a laptop at 1440×900 or 1366×768) gets a smaller card in the same proportion,
 * never under 320 px tall, so the whole middle card shows without scrolling; the card stands 30 px into the carousel and
 * keeps 16 px clear below. A phone keeps its size: there the carousel is the second screen.
 */
export function cardSize(vw, room = Infinity) {
  const base = vw < 640 ? { w: 250, h: 350 } : vw < 1024 ? { w: 290, h: 400 } : { w: 340, h: 460 };
  if (vw < 768) return base;
  const h = Math.min(base.h, Math.max(320, Math.floor(room - 46)));
  return h === base.h ? base : { w: Math.round((base.w * h) / base.h), h };
}
/** Perspective and how far a card at the edge turns, sinks and shrinks: gentler under 768 px. */
export const depth = (vw) => (vw < 768 ? { perspective: 800, maxRot: 8, maxZ: -60, maxScale: 0.25 } : { perspective: 1200, maxRot: 14, maxZ: -120, maxScale: 0.35 });

/**
 * Where card i of n stands around the ring, in [-total/2, total/2): 0 is the middle of the screen. The ring is exactly
 * n strides long, so no two cards ever share a place.
 */
export function ringPos(i, stride, scroll, n) {
  const total = n * stride;
  return ((((i * stride - scroll) % total) + total * 1.5) % total) - total / 2;
}

/** How a card stands at screen offset x from the middle: turned toward the middle, pushed back, smaller; nearer is on top. */
export function pose(x, vw, d = depth(vw)) {
  const dist = x / (vw * 0.55);
  const abs = Math.min(Math.abs(dist), 1.5);
  return { rotateY: -dist * d.maxRot || 0, z: abs * d.maxZ, scale: 1 - abs * d.maxScale, zIndex: Math.max(0, Math.round((1 - abs) * 100)), near: abs < 0.3 };
}

/**
 * The entrance of a card `steps` places from the middle, `t` seconds after the page opened: the middle card first,
 * each farther one 70 ms later, rising 60 px and growing from 0.94 over 0.9 s (ease-out).
 */
export function entrance(steps, t) {
  const p = Math.min(1, Math.max(0, (t - 0.8 - Math.abs(steps) * 0.07) / 0.9));
  const e = 1 - (1 - p) ** 4;
  return { y: (1 - e) * 60, scale: 0.94 + e * 0.06, opacity: e, done: p >= 1 };
}

/** The nearest resting place: a whole number of strides. */
export const nearest = (scroll, stride) => Math.round(scroll / stride) * stride;
/** The card that rests in the middle, as an index into the n cards. */
export const centerIndex = (scroll, stride, n) => ((Math.round(scroll / stride) % n) + n) % n;

/**
 * One step of the carousel's motion, dt in ms. A target (the window's «next») is reached smoothly; otherwise a fling
 * glides and slows, and once slow the carousel is pulled onto the nearest card by a critically damped spring: it
 * arrives without swinging past the card, in the same time at any frame rate (the spring is solved exactly, not
 * stepped), and it keeps pulling until the carousel rests. After the idle delay it drifts on by itself (when `auto`).
 * `held` (a drag, an open window) stops everything but the target.
 */
export function step(s, dt, { stride, idle = 0, auto = false }) {
  const k = Math.min(4, Math.max(0, dt) / FRAME); // a long pause (a hidden tab) is not one giant step
  let { scroll, velocity, target, snapping = false } = s;
  const drift = auto && idle >= PHYS.autoDelay;
  if (target != null) {
    scroll += (target - scroll) * (1 - (1 - PHYS.lerp) ** k);
    velocity = 0;
    snapping = false;
    if (Math.abs(target - scroll) < 0.5) (scroll = target), (target = null);
  } else if (s.held) snapping = false;
  else if (drift && !snapping && Math.abs(velocity) < 0.3) {
    scroll += (velocity + PHYS.auto) * k;
    velocity *= PHYS.friction ** k;
  } else if (snapping || Math.abs(velocity) < 0.8) {
    // x(t) = (x0 + (v0 + w·x0)·t)·e^(−w·t): the design's spring stiffness, damped just enough not to overshoot
    snapping = true;
    const goal = nearest(scroll, stride), w = Math.sqrt(PHYS.snap), x = scroll - goal, c = velocity + w * x, e = Math.exp(-w * k);
    scroll = goal + (x + c * k) * e;
    velocity = (velocity - w * c * k) * e;
  } else {
    scroll += velocity * k;
    velocity *= PHYS.friction ** k;
  }
  const rest = target == null && !s.held && (snapping || !drift) && Math.abs(velocity) < 0.02 && Math.abs(nearest(scroll, stride) - scroll) < 0.05;
  if (rest) (scroll = nearest(scroll, stride)), (velocity = 0), (snapping = false);
  return { ...s, scroll, velocity, target, snapping, settled: rest && !drift };
}

/** How many times the set repeats so the ring always reaches past both edges of the screen by more than a card. */
export const copiesFor = (unique, stride, vw) => (unique > 0 ? Math.max(1, Math.ceil((vw + 3 * stride) / (unique * stride))) : 0);

/**
 * The flight of a card into the window's picture. The picture is laid out at its final place; it starts on the card
 * scaled evenly so it covers the card, cropped (clip-path, in its own pixels) to the card's frame with the card's
 * corners, and settles to its place. One even scale, so the coin is never stretched on the way.
 */
export function flipFrom(card, target, radius = 16) {
  const s = Math.max(card.w / target.w, card.h / target.h);
  return {
    dx: card.x + card.w / 2 - (target.x + target.w / 2),
    dy: card.y + card.h / 2 - (target.y + target.h / 2),
    s,
    insetX: Math.max(0, (target.w - card.w / s) / 2),
    insetY: Math.max(0, (target.h - card.h / s) / 2),
    r: radius / s,
  };
}

/** The market symbol whose price a coin trades at (old and new designs of a size share one quote). */
export const COIN_SYMBOL = { emami: 'sekee', bahar: 'sekeb', half: 'nim', halfOld: 'nim', quarter: 'rob', quarterOld: 'rob', gerami: 'gerami' };

/** A reference photo's label, «تمام بهار آزادی (طرح قدیم) — نخستین ضرب ۱۳۵۸», as a title, a design and a note. */
export function readLabel(label = '') {
  const [head = '', ...rest] = String(label).split(/\s+[—–]\s+/);
  const m = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(head.trim());
  return { title: (m ? m[1] : head).trim(), design: m ? m[2].trim() : '', note: rest.join(' — ').trim() };
}

/** A price alert as the market page keeps it (prices in toman), for a target typed in the app's money unit. */
export function alertFor(symbol, typed, current, unit = 'toman') {
  const price = unit === 'rial' ? typed / 10 : typed;
  if (!(price > 0) || !Number.isFinite(price)) return null;
  return { symbol, op: Number.isFinite(current) && price < current ? 'below' : 'above', price: Math.round(price) };
}
