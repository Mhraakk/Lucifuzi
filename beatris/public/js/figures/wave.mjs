// «دستگاه موج» (spec 0030): a five-wave count as an instrument, drawn with the anatomy kit. Six rails carry sliders at
// the swing prices P0…P5; the wave line is traced on the board behind them, exactly behind every slider; every hard
// rule is a collar on a rail (or a gauge rod in the tray) that turns red when it is broken; Fibonacci rulers stand
// beside rails 2 and 4. Verdicts, ratios and the score come from wave-model.mjs, i.e. from ta.elliott — the studio's
// own engine.
import * as k from '../../vendor/anatomy/iso-kit.mjs';
import { EXAMPLES, STOPS, RULE_FA, judge, fromStudio } from './wave-model.mjs';

const W = 640, H = 340;
const fa = (v) => String(v).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]).replace('.', '٫');
const r3 = (x) => Math.round(x * 1000) / 1000;

/* ---------------- the world ---------------- */
const PLATE = { x: -158, y: -40, w: 316, d: 84, r: 8 };
const PLATE_H = 8, FOOT_H = 5;
const BOARD = { x: -142, y: -34, w: 284, d: 6, r: 1.6 }, BOARD_FRONT = BOARD.y + BOARD.d, BOARD_H = 112;
const XS = [-115, -69, -23, 23, 69, 115], RAIL_Y = -16, RAIL_R = 2, RAIL_TOP = 104;
const Z0 = 12, ZSPAN = 84; // the price scale: Z0 at the lowest price shown, Z0 + ZSPAN at the highest
const TRAY = { x: -66, y: 14, w: 132, d: 22, r: 2 }, ROD_Y = [18.5, 24.5, 30.5], ROD_X = TRAY.x + 12, ROD_MAX = 104;
const COLLAR_R = 4.4, COLLAR_H = 2.2;
const RULER = { dx: 7.5, w: 15, d: 1.2 }; // a Fibonacci ruler stands right of its rail, in the rails' own plane, held off the board
const RULER_FRONT = RAIL_Y + RULER.d / 2;

const P = k.fitProjection([...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), [BOARD.x, BOARD.y, BOARD_H + 2], [BOARD.x + BOARD.w, BOARD.y, BOARD_H + 2], [PLATE.x, PLATE.y + PLATE.d, 0]], W, H, { pad: 20, azimuth: 66 });
const at = (p) => k.iso(p, P);
// a slider's touch target: half the gap between two rails across, a finger's height up and down
const HIT_RX = Math.round(Math.abs(at([XS[1], RAIL_Y, 0])[0] - at([XS[0], RAIL_Y, 0])[0]) * 0.45), HIT_RY = 22;
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
const onBoard = (x, z) => at([x, BOARD_FRONT, z]);
const boardLine = (pts) => k.pathOf(pts.map(([x, z]) => onBoard(x, z)));
const byDepth = (pts) => [...pts].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
const faceText = (x, z, text, size, tone, cls) => `<text class="iso-face-text ${cls}" data-tone="${tone}" transform="${k.sideMatrix([x, RULER_FRONT], z, P, 'left')}" font-size="${size}" text-anchor="middle">${text}</text>`;

function base() {
  const out = [`<path class="iso-halo" d="${k.haloOf(PLATE, -PLATE_H - FOOT_H, PLATE_H, P)}"/>`];
  for (const [x, y] of byDepth(k.corners(PLATE, 20))) {
    out.push(S(k.cylinder(x, y, 7, -PLATE_H - FOOT_H, 1.6, P, 28), { tone: 'lo' }));
    out.push(S(k.cylinder(x, y, 5.4, -PLATE_H - FOOT_H + 1.6, FOOT_H - 1.6, P, 28), { tone: 'mid' }));
  }
  out.push(S(k.slabOf(PLATE, -PLATE_H, PLATE_H, P, 8, 1.4), { tone: 'mid' }));
  out.push(L(k.planOutline(k.insetPlan(PLATE, 5), 0, P), { tone: 'lo' }));
  const screws = k.corners(PLATE, 10);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 2.2, 0, P, 16)).join(''), { tone: 'lo' }));
  out.push(D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
  // a time ruler along the front edge, one major tick per rail
  const strip = { x: XS[0] - 14, y: PLATE.y + PLATE.d - 11, w: XS[5] - XS[0] + 28, d: 6, r: 1 };
  out.push(S(k.slabOf(strip, 0, 0.6, P, 3), { tone: 'lo', crease: 'none' }));
  const t = k.topTicks(XS[0], XS[5], (XS[1] - XS[0]) / 4, 4, strip.y + 0.6, 0.6, [1.8, 3.4], P);
  out.push(L(t.minor, { tone: 'lo' }), L(t.major, { tone: 'mid' }));
  out.push(D([at([strip.x + 2.4, strip.y + 3, 0.6]), at([strip.x + strip.w - 2.4, strip.y + 3, 0.6])], { size: 0.45 }));
  return out.join('');
}

/** The board: a tall plate on two feet, price lines that run edge to edge, a frame groove. */
function board() {
  const out = [];
  for (const x of [BOARD.x + 16, BOARD.x + BOARD.w - 22]) out.push(S(k.slabOf({ x, y: BOARD.y - 4, w: 6, d: BOARD.d + 8, r: 1 }, 0, 6, P, 2, 0.4), { tone: 'mid' }));
  out.push(S(k.slabOf(BOARD, 0, BOARD_H, P, 3, 0.6), { tone: 'mid', inner: L(k.sideSeam(BOARD, BOARD_H - 4, P, 3), { tone: 'faint' }) }));
  const x0 = BOARD.x + 4, x1 = BOARD.x + BOARD.w - 4;
  out.push(L(Array.from({ length: 9 }, (_, i) => boardLine([[x0, Z0 + (i * ZSPAN) / 8], [x1, Z0 + (i * ZSPAN) / 8]])).join(''), { tone: 'faint' }));
  out.push(L(k.pathOf([onBoard(x0, 6), onBoard(x1, 6), onBoard(x1, BOARD_H - 6), onBoard(x0, BOARD_H - 6)], true), { tone: 'lo' }));
  out.push(D([onBoard(x0 + 3, BOARD_H - 3), onBoard(x1 - 3, BOARD_H - 3), onBoard(x0 + 3, 3), onBoard(x1 - 3, 3)], { size: 0.45 }));
  return out.join('');
}

/** A rail: foot, post with two seams, cap; its number engraved on the foot's top. */
function rail(i) {
  const x = XS[i], out = [];
  out.push(S(k.cylinder(x, RAIL_Y, 5, 0, 3, P, 28, 0.4), { tone: 'mid' }));
  out.push(S(k.cylinder(x, RAIL_Y, RAIL_R, 3, RAIL_TOP - 3, P, 20), { tone: 'mid', crease: 'none', inner: L([30, 70].map((z) => k.sideArc(x, RAIL_Y, RAIL_R, z, P, 12)).join(''), { tone: 'faint' }) }));
  out.push(S(k.cylinder(x, RAIL_Y, 3, RAIL_TOP, 2.4, P, 20, 0.3), { tone: 'mid' }));
  out.push(`<text class="iso-face-text" data-tone="mid" transform="${k.topMatrix([x, RAIL_Y + 3.6], 3, P, 'x')}" font-size="3.4" text-anchor="middle">${fa(i)}</text>`);
  return out.join('');
}
/** A stop collar, built centred on z = 0 and moved to its rule's price; a set screw on its side. */
const collar = (rule, i) => `<g class="wv-stop" data-rule="${rule}">${S(k.cylinder(XS[i], RAIL_Y, COLLAR_R, -COLLAR_H / 2, COLLAR_H, P, 28, 0.3), { tone: 'hi', className: 'wv-collar' })}${S(k.cylinder(XS[i] + COLLAR_R + 0.6, RAIL_Y + 1.2, 1, -0.6, 1.2, P, 12), { tone: 'mid' })}</g>`;
/** A slider, built centred on z = 0 and moved to its price; an invisible, larger target for a finger. */
function slider(i) {
  const plan = { x: XS[i] - 6, y: RAIL_Y - 5, w: 12, d: 10, r: 2 };
  const [hx, hy] = at([XS[i], RAIL_Y, 0]);
  return `<g class="wv-slider" data-rail="${i}"><ellipse class="wv-hit" cx="${hx.toFixed(1)}" cy="${hy.toFixed(1)}" rx="${HIT_RX}" ry="${HIT_RY}"/>${S(k.slabOf(plan, -3.2, 6.4, P, 4, 0.5), { tone: 'hi', className: 'wv-block' })}${L(k.planOutline(k.insetPlan(plan, 1.8), 3.2, P, 4), { tone: 'faint' })}${S(k.cylinder(XS[i], plan.y + plan.d + 1.6, 1.8, -1.2, 2.4, P, 16), { tone: 'mid' })}${D([at([XS[i] - 3.4, RAIL_Y + 1, 3.2]), at([XS[i] + 3.4, RAIL_Y + 1, 3.2])], { size: 0.4 })}</g>`;
}
/** A rail's moving parts: its collar (if the rail carries a rule) and its slider, re-ordered as they pass. */
const carriage = (i) => {
  const stop = STOPS.find((s) => s.rail === i);
  return `<g class="wv-on" data-on="${i}">${stop ? collar(stop.rule, i) : ''}${slider(i)}</g>`;
};
/** A Fibonacci ruler beside a rail, rebuilt per frame (its span follows the waves). */
const ruler = (id) => `<g class="wv-ruler" data-ruler="${id}"></g>`;
function rulerSvg(i, top, len, levels, labelled) {
  const x0 = XS[i] + RULER.dx, zs = levels.map((r) => top - r * len);
  const z1 = Math.max(...zs) + 3, z0 = Math.min(...zs) - 3;
  // two standoffs hold the ruler off the board's face, at its top and its foot
  const arm = { x: x0 + RULER.w - 3.6, y: BOARD_FRONT, w: 2, d: RAIL_Y - RULER.d / 2 - BOARD_FRONT, r: 0.4 };
  const out = [z1 - 2.4, z0 + 0.8].map((z) => S(k.slabOf(arm, z, 1.6, P, 2), { tone: 'mid', crease: 'none' }));
  out.push(S(k.slabOf({ x: x0, y: RAIL_Y - RULER.d / 2, w: RULER.w, d: RULER.d, r: 0.3 }, z0, Math.max(1, z1 - z0), P, 2), { tone: 'mid', crease: 'none' }));
  // the golden zone on rail 2's ruler: 0.382 to 0.618 of wave 1, a lit band on the ruler's face
  if (labelled.includes(0.382) && labelled.includes(0.618)) {
    const za = top - 0.618 * len, zb = top - 0.382 * len;
    out.push(`<path class="wv-zone" d="${k.pathOf([at([x0, RULER_FRONT, za]), at([x0 + RULER.w, RULER_FRONT, za]), at([x0 + RULER.w, RULER_FRONT, zb]), at([x0, RULER_FRONT, zb])], true)}"/>`);
  }
  out.push(L(levels.map((r, n) => k.pathOf([at([x0, RULER_FRONT, zs[n]]), at([x0 + (labelled.includes(r) ? 4 : 2.4), RULER_FRONT, zs[n]])])).join(''), { tone: 'hi' }));
  let last = -Infinity;
  for (const [n, r] of levels.entries()) {
    if (!labelled.includes(r) || Math.abs(zs[n] - last) < 6) continue;
    last = zs[n];
    out.push(faceText(x0 + 10, zs[n] - 1.3, fa(r), 3.4, 'hi', 'wv-fib'));
  }
  return out.join('');
}

function tray() {
  const out = [S(k.slabOf(TRAY, 0, 2.6, P, 3, 0.4), { tone: 'mid' })];
  out.push(L(k.planOutline(k.insetPlan(TRAY, 2.4), 2.6, P, 3), { tone: 'lo' }));
  ROD_Y.forEach((y, n) => out.push(`<text class="iso-face-text" data-tone="hi" transform="${k.topMatrix([TRAY.x + 6, y + 1.2], 2.6, P, 'x')}" font-size="3.8" text-anchor="middle">${fa([1, 3, 5][n])}</text>`));
  out.push(D(k.corners(TRAY, 3).map(([x, y]) => at([x, y, 2.6])), { size: 0.4 }));
  return out.join('');
}
const rodSvg = (n, len) => S(k.slabOf({ x: ROD_X, y: ROD_Y[n] - 1.5, w: Math.max(2, len), d: 3, r: 1.4 }, 2.6, 2.8, P, 3, 0.3), { tone: 'hi', className: 'wv-rod' });

const LABEL = 'دستگاه موج: شش ریل با لغزنده‌هایی در قیمت نقاط چرخش P0 تا P5؛ خط موج روی صفحه پشت آن‌ها کشیده می‌شود. هر قاعده سخت الیوت یک ضامن است که اگر شکسته شود قرمز می‌شود: ضامن ریل ۲ در قیمت P0، ضامن ریل‌های ۳ و ۴ در قیمت P1، و سه میله سنجه طول موج‌های ۱، ۳ و ۵ در سینی جلو. خط‌کش‌های فیبوناچی کنار ریل‌های ۲ و ۴ ایستاده‌اند.';
/** The whole drawing, back to front (pure: the test counts its parts). The tray is in front of the rails. */
export const sceneSvg = () =>
  k.figureSvg({
    width: W,
    height: H,
    label: LABEL,
    className: 'wv-svg',
    body: [base(), board(), `<path data-part="wave" class="iso-line wv-wave" data-tone="lit" d=""/>`, ...XS.map((_, i) => rail(i) + carriage(i)), ruler('r2'), ruler('r4'), tray(), '<g data-part="rods"></g>'],
  });

/* ---------------- the page ---------------- */
const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const RATIOS = [['۲', '۱', 'موج ۲ ÷ موج ۱'], ['۳', '۱', 'موج ۳ ÷ موج ۱'], ['۴', '۳', 'موج ۴ ÷ موج ۳'], ['۵', '۱', 'موج ۵ ÷ موج ۱']];

/** What the readout says for the engine's verdict `v` (no middle dots: next to Persian digits they read as zeros). */
export function readoutOf(v, { prices, pick = -1, unit = (x) => fa(Math.round(x)), note = '' } = {}) {
  const ok = v.rules.filter((r) => r.ok).length, broken = v.broken.map((b) => RULE_FA[b]).join('، ');
  if (pick >= 0) return `نقطه ${fa(pick)} = ${unit(prices[pick])} — ${ok === 4 ? 'همه قواعد برقرار' : `شکسته: ${broken}`}`;
  const g = Object.fromEntries(v.guides.map((x) => [x.label, x.ratio]));
  const ratios = RATIOS.map(([a, b, l]) => `${a} به ${b} = ${Number.isFinite(g[l]) ? fa(r3(g[l])) : '—'}`).join('، ');
  return `${note}${v.valid ? `قواعد ۴ از ۴، امتیاز ${fa(v.score)}` : `قواعد ${fa(ok)} از ۴، شکسته: ${broken}`} — نسبت‌ها: ${ratios}`;
}

/**
 * Mount in `el`. studio(): the studio's current map (or null), read when «شمارش همین نمودار» is pressed.
 * manual: no clock of its own (no tour, no glide, no observer) — the caller poses it (the teaser, spec 0031).
 * Returns { show(prices), pose(prices, range), stop() }.
 */
export function mountWave(el, { studio = () => null, format = (v) => fa(Math.round(v)), manual = false } = {}) {
  el.innerHTML = `<figure class="iso-figure wv-fig">
    <div class="iso-plate iso">
      <div class="iso-plate-corners" aria-hidden="true"><span class="iso-plate-corner" data-corner="fig">شکل ۱</span><span class="iso-plate-corner" data-corner="title">دستگاه موج</span></div>
      <div class="iso-stage" tabindex="0" role="group" aria-roledescription="شکل" aria-label="${LABEL}">${sceneSvg()}</div>
      <p class="iso-plate-corner wv-readout" data-corner="readout" data-readout aria-live="polite"></p>
    </div>
    <figcaption class="iso-legend">
      <span class="oc-hint">لغزنده‌ها را بکشید یا با پیکان‌ها جابه‌جا کنید؛ داوری هر حرکت با همان موتور قواعد الیوت این صفحه است.</span>
      <span class="iso-keys wv-keys">${EXAMPLES.map((e) => `<button type="button" class="chip wv-ex" data-ex="${e.id}">${e.name}</button>`).join('')}<button type="button" class="chip" data-act="studio">شمارش همین نمودار</button></span>
      <span class="iso-caption">هر قاعده سخت الیوت اینجا یک قطعه است: اگر موج ۲ از ابتدای موج ۱ پایین‌تر برود، ضامن ریل ۲ قرمز می‌شود؛ اگر موج ۴ به محدوده موج ۱ برسد، ضامن ریل ۴؛ و اگر موج ۳ کوتاه‌ترین باشد، میله سنجه ۳. نوار روشن خط‌کش ریل ۲ ناحیه طلایی ۰٫۳۸۲ تا ۰٫۶۱۸ است. نسبت‌ها و امتیاز را همان موتوری می‌دهد که شمارش نمودار بالا را ساخته است.</span>
    </figcaption>
  </figure>`;
  const svg = el.querySelector('svg');
  const stage = el.querySelector('.iso-stage');
  const readout = el.querySelector('[data-readout]');
  const sliders = [...svg.querySelectorAll('.wv-slider')];
  const carriages = [...svg.querySelectorAll('.wv-on')];
  const stops = Object.fromEntries([...svg.querySelectorAll('.wv-stop')].map((g) => [g.dataset.rule, g]));
  const wave = svg.querySelector('[data-part="wave"]');
  const rods = svg.querySelector('[data-part="rods"]');
  const rulers = Object.fromEntries([...svg.querySelectorAll('.wv-ruler')].map((g) => [g.dataset.ruler, g]));
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  const say = (t) => readout.textContent !== t && (readout.textContent = t);

  // the scale: prices shown map onto Z0…Z0+ZSPAN; it changes with the prices, never under a moving slider
  let lo = 90, hi = 180, from = EXAMPLES[0].prices, to = from, t0 = 0, dur = 0, pick = -1, studioNote = '', unitOf = format;
  const zOf = (price) => Z0 + ((price - lo) / (hi - lo)) * ZSPAN;
  const priceOf = (z) => lo + ((z - Z0) / ZSPAN) * (hi - lo);
  let now = from.slice();

  function draw(prices) {
    const v = judge(prices);
    const z = prices.map(zOf);
    sliders.forEach((g, i) => {
      g.setAttribute('transform', k.translateAlong(P, [0, 0, z[i]]));
      g.querySelector('.wv-block').toggleAttribute('data-lit', i === pick);
    });
    for (const s of STOPS) {
      const g = stops[s.rule], zc = zOf(s.at(prices));
      g.setAttribute('transform', k.translateAlong(P, [0, 0, zc]));
      g.toggleAttribute('data-bad', v.broken.includes(s.rule));
      // painter's order on the rail: the higher part is nearer the camera, so it is drawn last
      const box = carriages[s.rail], top = zc > z[s.rail] ? g : sliders[s.rail];
      if (box.lastElementChild !== top) box.append(top);
    }
    // the trace on the board, exactly behind every slider's centre
    wave.setAttribute('d', k.pathOf(prices.map((p, i) => at([XS[i], RAIL_Y, z[i]]))));
    // the gauge rods: waves 1, 3, 5 at one scale; the shortest lit, red when it is wave 3
    const w = [v.waves[0], v.waves[2], v.waves[4]], max = Math.max(...w.map(Math.abs), 1e-9);
    const shortest = w.indexOf(Math.min(...w));
    rods.innerHTML = w.map((len, n) => `<g class="wv-rodg" data-n="${n}"${n === shortest ? ' data-short=""' : ''}${n === 1 && v.broken.includes('w3short') ? ' data-bad=""' : ''}>${rodSvg(n, (Math.max(0, len) / max) * ROD_MAX)}</g>`).join('');
    rods.querySelectorAll('.wv-rodg[data-short] .wv-rod').forEach((s) => s.setAttribute('data-lit', ''));
    // Fibonacci rulers: 0.382…0.786 of wave 1 below P1 (rail 2), 0.236…0.5 of wave 3 below P3 (rail 4)
    rulers.r2.innerHTML = rulerSvg(2, z[1], z[1] - z[0], [0.382, 0.5, 0.618, 0.786], [0.382, 0.618]);
    rulers.r4.innerHTML = rulerSvg(4, z[3], z[3] - z[2], [0.236, 0.382, 0.5], [0.236, 0.382, 0.5]);
    say(readoutOf(v, { prices, pick, unit: unitOf, note: studioNote }));
    el.querySelector('.wv-fig').toggleAttribute('data-bad', !v.valid);
    return v;
  }
  /** A new scale keeps every slider where it stands on screen, so nothing jumps when the range changes. */
  function rescale(range) {
    const [lo0, hi0] = [lo, hi];
    [lo, hi] = range;
    const keep = (p) => lo + ((p - lo0) / (hi0 - lo0)) * (hi - lo);
    from = from.map(keep);
    now = now.map(keep);
  }
  /** Glide to new prices (and a new scale when they need one). */
  function show(prices, { range = null } = {}) {
    from = now.slice();
    to = prices.slice();
    const a = Math.min(...to), b = Math.max(...to), pad = (b - a) * 0.12 || 1;
    if (range || a < lo || b > hi || b - a < (hi - lo) * 0.45) rescale(range ?? [a - pad, b + pad]);
    t0 = performance.now();
    dur = still.matches || manual ? 0 : 900;
    if (manual) return draw((now = to.slice()));
    run();
  }
  let raf = 0, visible = false, stopped = false, tour = !still.matches && !manual, tourAt = 0, tourTimer = 0;
  function tick(t) {
    raf = 0;
    const u = dur ? ease((t - t0) / dur) : 1;
    now = from.map((p, i) => p + (to[i] - p) * u);
    draw(now);
    if (u < 1 && visible && !stopped) raf = requestAnimationFrame(tick);
  }
  const run = () => {
    if (!raf && !stopped) raf = requestAnimationFrame(tick);
  };
  const io = manual ? null : new IntersectionObserver((e) => {
    visible = e[e.length - 1].isIntersecting;
    if (visible) run();
  }, { rootMargin: '60px 0px' });
  io?.observe(stage);
  // the tour: one example every 4.5 s while nobody touches the machine
  const next = () => {
    clearTimeout(tourTimer);
    if (!tour || stopped) return;
    tourTimer = setTimeout(() => {
      if (visible && tour) {
        tourAt = (tourAt + 1) % EXAMPLES.length;
        studioNote = '';
        mark(EXAMPLES[tourAt].id);
        show(EXAMPLES[tourAt].prices);
      }
      next();
    }, 4500);
  };
  const hold = () => {
    tour = false;
    clearTimeout(tourTimer);
  };
  const mark = (id) => el.querySelectorAll('[data-ex]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.ex === id)));
  el.querySelector('.wv-keys').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    hold();
    pick = -1;
    if (b.dataset.ex) {
      studioNote = '';
      unitOf = format;
      mark(b.dataset.ex);
      show(EXAMPLES.find((x) => x.id === b.dataset.ex).prices, { range: [90, 180] });
      return;
    }
    const s = fromStudio(studio()?.major);
    mark(null);
    if (!s.ok) return say(s.why);
    studioNote = `شمارش همین نمودار${s.up ? '' : ' (نزولی، وارونه نشان داده شده)'}: ${s.raw.map((p) => format(p)).join(' ← ')} — `;
    show(s.prices, { range: null });
  });
  // pointer: drag a slider up and down
  let drag = null;
  svg.addEventListener('pointerdown', (e) => {
    const g = e.target.closest('.wv-slider');
    if (!g) return;
    hold();
    pick = Number(g.dataset.rail);
    drag = { y: e.clientY, z: zOf(now[pick]), scale: svg.getBoundingClientRect().height / H };
    svg.setPointerCapture(e.pointerId);
    draw(now);
  });
  svg.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dz = -(e.clientY - drag.y) / drag.scale / k.screenRise(1, P);
    const z = Math.max(Z0 - 6, Math.min(Z0 + ZSPAN + 6, drag.z + dz));
    now[pick] = to[pick] = from[pick] = priceOf(z);
    draw(now);
  });
  const endDrag = () => {
    if (!drag) return;
    drag = null;
    pick = -1;
    draw(now);
  };
  svg.addEventListener('pointerup', endDrag);
  svg.addEventListener('pointercancel', endDrag);
  // keys: ← → pick a rail, ↑ ↓ move it by 1% of the scale, Home the valid example
  stage.addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'Escape'].includes(e.key)) return;
    e.preventDefault();
    hold();
    if (e.key === 'Home') return (pick = -1), mark('valid'), show(EXAMPLES[0].prices, { range: [90, 180] });
    if (e.key === 'Escape') return (pick = -1), draw(now);
    if (e.key === 'ArrowRight') pick = Math.min(5, pick + 1);
    if (e.key === 'ArrowLeft') pick = Math.max(0, pick < 0 ? 0 : pick - 1);
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      if (pick < 0) pick = 0;
      now[pick] = to[pick] = from[pick] = now[pick] + (e.key === 'ArrowUp' ? 1 : -1) * (hi - lo) * 0.01;
    }
    draw(now);
  });
  stage.addEventListener('blur', () => {
    pick = -1;
    draw(now);
  });
  mark('valid');
  draw(now);
  next();
  return {
    show,
    /** Set the prices (and, if given, the scale) at once: the teaser's clock drives the machine through this. */
    pose(prices, range = null) {
      if (range) [lo, hi] = range;
      now = from = to = prices.slice();
      return draw(now);
    },
    stop() {
      stopped = true;
      if (raf) cancelAnimationFrame(raf);
      clearTimeout(tourTimer);
      io?.disconnect();
    },
  };
}
