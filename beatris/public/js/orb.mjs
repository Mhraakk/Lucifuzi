// گوی فکر (spec 0019): what an agent or the assistant is doing, drawn as a dotted orb. The geometry is the vendored
// thinking-orbs engine (MIT, /vendor/thinking-orbs); this file only binds it to the app: one shared clock, the skin's
// gold ink and tone, a still frame under reduced motion, and no work while an orb is off screen or the tab is hidden.
// Usage: put `orb('working')` in a template; any canvas[data-orb] in the page is picked up on its own.
import { M as FRAMES, r as resolvePreset, p as paintFrame } from '../vendor/thinking-orbs/engine.mjs';

/** The nine states, with what each one means here and its Persian label. */
export const ORB_STATES = {
  working: 'در حال کار',
  searching: 'در حال جست‌وجو',
  solving: 'در حال حل کردن',
  listening: 'در حال شنیدن',
  connecting: 'در حال ارتباط با عامل دیگر',
  weaving: 'در حال جمع‌بندی',
  composing: 'در حال نوشتن',
  breathing: 'در انتظار',
  shaping: 'در حال ساختن مدل',
};

/** An agent run's state → the orb that shows it. A finished run has no orb. */
export const RUN_ORB = {
  queued: 'breathing',
  running: 'working',
  waiting_for_tool: 'connecting',
  waiting_for_approval: 'listening',
  paused: 'breathing',
};

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const SIZES = [20, 32, 64];
const sizeOf = (n) => SIZES.reduce((a, b) => (Math.abs(b - n) < Math.abs(a - n) ? b : a), 64);

/** Markup for one orb. `label` overrides the state's own words (read by screen readers); `decorative` when text beside it says the same. */
export function orb(state = 'working', { size = 64, label, still = false, decorative = false } = {}) {
  const st = ORB_STATES[state] ? state : 'working';
  const s = sizeOf(size);
  return `<canvas class="orb orb-${s}" data-orb="${st}" data-size="${s}"${still ? ' data-still="1"' : ''} width="${s}" height="${s}" ${decorative ? 'aria-hidden="true"' : `role="img" aria-label="${esc(label ?? ORB_STATES[st])}"`}></canvas>`;
}

/** The geometry of one instant: pure, so a film can seek to any time and get the same frame. */
export function orbFrame(state, size, t) {
  const { mode, speed, opts } = resolvePreset(ORB_STATES[state] ? state : 'working', sizeOf(size));
  return FRAMES[mode](sizeOf(size), t * speed, opts);
}

/** Draw `state` at time `t` (seconds) into a 2D context of `size` CSS px. */
export function drawOrb(ctx, state, size, t, { dark = true, tint = null } = {}) {
  ctx.clearRect(0, 0, size, size);
  paintFrame(ctx, orbFrame(state, size, t), dark, tint ?? undefined);
}

// ---- the live binding -------------------------------------------------------------------------------------------
const live = new Set();
let raf = 0;
let seen = null;
let ink = null;
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The skin's gold and tone, read once per frame batch (a skin switch repaints on the next frame). */
function readInk() {
  const root = document.documentElement;
  const rgb = getComputedStyle(root).getPropertyValue('--gold-rgb').split(',').map((v) => Number(v.trim()));
  const tint = rgb.length === 3 && rgb.every(Number.isFinite) ? { r: rgb[0], g: rgb[1], b: rgb[2] } : null;
  return { dark: root.dataset.tone !== 'light', tint, key: `${root.dataset.skin}` };
}

function prepare(c) {
  const size = Number(c.dataset.size) || 64;
  const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
  if (c.width !== size * dpr) {
    c.width = size * dpr;
    c.height = size * dpr;
    c.style.width = c.style.height = `${size}px`;
  }
  const ctx = c.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, size };
}

function paintOne(c, t) {
  const { ctx, size } = prepare(c);
  drawOrb(ctx, c.dataset.orb, size, c.dataset.still || reduced() ? 1.7 : t, ink);
}

function loop(now) {
  raf = 0;
  ink = readInk();
  const t = now / 1000;
  let any = false;
  for (const c of live) {
    if (!c.isConnected) {
      live.delete(c);
      seen?.unobserve(c);
      continue;
    }
    if (c._orbOff) continue;
    paintOne(c, t);
    if (!c.dataset.still) any = true;
  }
  if (any && !reduced() && document.visibilityState !== 'hidden') raf = requestAnimationFrame(loop);
}
const kick = () => {
  if (!raf && live.size) raf = requestAnimationFrame(loop);
};

function adopt(c) {
  if (live.has(c)) return;
  live.add(c);
  seen?.observe(c);
  ink = ink ?? readInk();
  paintOne(c, performance.now() / 1000);
  kick();
}

/** Start watching the page for orbs. Called once by the app shell. */
export function initOrbs(root = document.body) {
  if (typeof IntersectionObserver === 'function') {
    seen = new IntersectionObserver((list) => {
      for (const e of list) e.target._orbOff = !e.isIntersecting;
      kick();
    });
  }
  const scan = (n) => {
    if (n.nodeType !== 1) return;
    // the one shared loading block (`<div class="loading"><span></span></div>` in many pages) becomes an orb
    for (const l of [...(n.matches('.loading') ? [n] : []), ...n.querySelectorAll('.loading')]) if (!l.querySelector('canvas[data-orb]')) l.innerHTML = orb('working');
    if (n.matches('canvas[data-orb]')) adopt(n);
    for (const c of n.querySelectorAll('canvas[data-orb]')) adopt(c);
  };
  scan(root);
  new MutationObserver((muts) => {
    for (const m of muts) {
      for (const n of m.addedNodes) scan(n);
      if (m.type === 'attributes' && m.target.matches?.('canvas[data-orb]')) paintOne(m.target, performance.now() / 1000);
    }
    kick();
  }).observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-orb'] });
  // a skin switch changes the ink: repaint (stills included) on the next frame
  new MutationObserver(() => {
    ink = readInk();
    for (const c of live) if (c.isConnected) paintOne(c, performance.now() / 1000);
    kick();
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-skin', 'data-tone'] });
  document.addEventListener('visibilitychange', kick);
}
