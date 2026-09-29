// The Elliott studio's chart (spec 0003): a trading-terminal canvas — candles, Bollinger band, two EMAs, the wave
// channel, Fibonacci levels with prices, support and target zones, two degrees of wave labels, the primary and
// alternative scenario paths into the future, a live price tag, RSI and MACD panes, crosshair and OHLC readout.
// Pan by dragging, zoom with the wheel or a pinch, double-click for the whole count. Sharp up to 3× pixel density.
import { jalaliOf, JALALI_MONTHS } from './ta.mjs';

const C = {
  bg: '#0a0f1c', pane: '#0c1322', grid: 'rgba(148,163,184,0.08)', axis: 'rgba(148,163,184,0.22)', text: '#cbd5e1', dim: '#8190a5',
  up: '#22c55e', down: '#ef4444', ema1: '#facc15', ema2: '#38bdf8', bb: 'rgba(59,130,246,0.09)', bbLine: 'rgba(96,165,250,0.35)',
  major: '#fb923c', motive: '#3b82f6', motiveText: '#bfdbfe', corr: '#ef4444', corrText: '#fecaca', channel: 'rgba(226,232,240,0.5)',
  green: '#22c55e', red: '#ef4444', rsi: '#a78bfa', macd: '#60a5fa', signal: '#f97316', cross: 'rgba(226,232,240,0.45)',
};
const FIB = { 0: '#94a3b8', 0.236: '#f87171', 0.382: '#fbbf24', 0.5: '#facc15', 0.618: '#4ade80', 0.786: '#60a5fa', 1: '#94a3b8' };
const FONT = (px, w = 500) => `${w} ${px}px Vazirmatn, Tahoma, sans-serif`;
const fin = Number.isFinite;
const fa = (s) => String(s).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

function niceStep(range, target) {
  const raw = range / Math.max(1, target), p = 10 ** Math.floor(Math.log10(raw)), f = raw / p;
  return (f < 1.5 ? 1 : f < 2.25 ? 2 : f < 3.5 ? 2.5 : f < 7.5 ? 5 : 10) * p;
}

export function createElliottView(host, { label = 'نمودار امواج الیوت' } = {}) {
  const cv = document.createElement('canvas');
  cv.className = 'ew-cv';
  cv.tabIndex = 0;
  cv.setAttribute('role', 'img');
  cv.setAttribute('aria-label', label);
  host.append(cv);
  const g = cv.getContext('2d');
  let S = { bars: [], map: null, format: (v) => fa(Math.round(v)), symbol: '', tf: '', inset: 0 };
  let view = null, hover = null, W = 0, H = 0, L = null;

  function setup() {
    const r = host.getBoundingClientRect();
    W = Math.max(280, Math.floor(r.width));
    H = Math.max(320, Math.floor(r.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    cv.style.width = `${W}px`;
    cv.style.height = `${H}px`;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const big = Math.abs(S.bars.at(-1)?.c ?? 0) >= 1e6, axisW = (W < 560 ? 62 : 78) + (big ? 16 : 0), timeH = 24, small = H < 560;
    const rsiH = small ? 64 : 84, macdH = small ? 70 : 96;
    const priceH = H - timeH - rsiH - macdH - 8;
    L = { axisW, plotW: W - axisW, price: { y: 0, h: priceH }, time: { y: priceH, h: timeH }, rsi: { y: priceH + timeH + 4, h: rsiH }, macd: { y: priceH + timeH + rsiH + 8, h: macdH } };
  }

  function horizon() {
    const sc = S.map?.scenarios;
    return sc ? Math.max(...[...sc.primary.path, ...sc.alternative.path].map((p) => p.i)) - (S.bars.length - 1) : 0;
  }
  function fullView() {
    const n = S.bars.length;
    const start = S.map?.major ? Math.max(0, S.map.major.points[0].i - Math.round(n * 0.04)) : Math.max(0, n - 260);
    const fut = Math.max(horizon() + Math.max(6, Math.round((n - start) * 0.07)), Math.round((n - start) * 0.06));
    // leave room on the left for the legend card when it is open
    const span = n - 1 + fut - start, room = L ? clamp(S.inset / L.plotW, 0, 0.5) : 0;
    return { from: start - (span * room) / (1 - room), to: n - 1 + fut };
  }

  const xOf = (i) => ((i - view.from) / (view.to - view.from)) * L.plotW;
  const iOf = (x) => view.from + (x / L.plotW) * (view.to - view.from);

  function priceRange() {
    const b = S.bars, lo0 = Math.max(0, Math.floor(view.from)), hi0 = Math.min(b.length - 1, Math.ceil(view.to));
    let lo = Infinity, hi = -Infinity;
    for (let i = lo0; i <= hi0; i++) {
      lo = Math.min(lo, b[i].l);
      hi = Math.max(hi, b[i].h);
    }
    if (!fin(lo)) return [0, 1];
    const span = hi - lo;
    const extra = [];
    const sc = S.map?.scenarios;
    if (sc) for (const p of [...sc.primary.path, ...sc.alternative.path]) if (p.i >= view.from && p.i <= view.to + 1) extra.push(p.price);
    for (const z of S.map?.zones ?? []) extra.push(z.lo, z.hi);
    for (const v of extra) if (fin(v) && v > lo - span * 0.9 && v < hi + span * 0.9) ((lo = Math.min(lo, v)), (hi = Math.max(hi, v)));
    // headroom for the labels drawn beyond the extremes (wave labels, target tags, projected wave names)
    const room = sc ? 62 : 40;
    const pad = Math.max((hi - lo) * 0.07, ((hi - lo) * room) / Math.max(120, L.price.h - 2 * room)) || hi * 0.01;
    return [lo - pad, hi + pad];
  }

  function draw() {
    if (!L) setup();
    g.clearRect(0, 0, W, H);
    g.fillStyle = C.bg;
    g.fillRect(0, 0, W, H);
    const b = S.bars;
    if (b.length < 2) {
      g.fillStyle = C.dim;
      g.font = FONT(14);
      g.textAlign = 'center';
      g.fillText('داده کافی نیست', W / 2, H / 2);
      return;
    }
    if (!view) view = fullView();
    const [lo, hi] = priceRange();
    const P = L.price;
    const yOf = (v) => P.y + 8 + (1 - (v - lo) / (hi - lo)) * (P.h - 16);
    const bw = Math.max(1, (L.plotW / (view.to - view.from)) * 0.64);
    const i0 = Math.max(0, Math.floor(view.from) - 1), i1 = Math.min(b.length - 1, Math.ceil(view.to) + 1);

    // pane backgrounds and the watermark
    const grd = g.createLinearGradient(0, 0, 0, P.h);
    grd.addColorStop(0, '#0d1528');
    grd.addColorStop(1, '#090e1a');
    g.fillStyle = grd;
    g.fillRect(0, 0, L.plotW, P.h);
    for (const pn of [L.rsi, L.macd]) {
      g.fillStyle = C.pane;
      g.fillRect(0, pn.y, L.plotW, pn.h);
    }
    g.save();
    g.fillStyle = 'rgba(148,163,184,0.045)';
    g.font = FONT(Math.min(72, W / 11), 800);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.direction = 'ltr';
    g.fillText(`${S.symbol} · ${S.tf}`, L.plotW / 2, P.h * 0.52);
    g.restore();

    // grid and price axis
    const step = niceStep(hi - lo, Math.max(4, Math.round(P.h / 58)));
    g.font = FONT(11.5);
    g.textBaseline = 'middle';
    g.direction = 'ltr';
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) {
      const y = yOf(v);
      g.strokeStyle = C.grid;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(0, Math.round(y) + 0.5);
      g.lineTo(L.plotW, Math.round(y) + 0.5);
      g.stroke();
      g.fillStyle = C.dim;
      g.textAlign = 'left';
      g.fillText(S.format(v), L.plotW + 8, y);
    }
    // time axis: Jalali months, the year in bold where it changes
    let lastM = null, lastX = -1e9;
    g.textAlign = 'center';
    for (let i = i0; i <= i1; i++) {
      const [y, m] = jalaliOf(b[i].d);
      const key = `${y}-${m}`;
      if (key === lastM) continue;
      lastM = key;
      const x = xOf(i);
      if (x < 0 || x - lastX < 64) continue;
      lastX = x;
      g.strokeStyle = C.grid;
      g.beginPath();
      g.moveTo(Math.round(x) + 0.5, 0);
      g.lineTo(Math.round(x) + 0.5, P.h);
      g.stroke();
      g.fillStyle = m === 1 ? C.text : C.dim;
      g.font = FONT(11.5, m === 1 ? 800 : 500);
      g.direction = 'rtl';
      g.fillText(m === 1 ? fa(y) : JALALI_MONTHS[m - 1], x, L.time.y + L.time.h / 2);
    }
    g.direction = 'ltr';
    g.strokeStyle = C.axis;
    g.beginPath();
    g.moveTo(L.plotW + 0.5, 0);
    g.lineTo(L.plotW + 0.5, H);
    g.moveTo(0, P.h + 0.5);
    g.lineTo(W, P.h + 0.5);
    g.stroke();

    g.save();
    g.beginPath();
    g.rect(0, 0, L.plotW, P.h);
    g.clip();
    const M = S.map;

    // Bollinger band
    if (M?.bb) {
      g.fillStyle = C.bb;
      g.beginPath();
      let first = true;
      for (let i = i0; i <= i1; i++) if (fin(M.bb.upper[i])) (first ? g.moveTo(xOf(i), yOf(M.bb.upper[i])) : g.lineTo(xOf(i), yOf(M.bb.upper[i])), (first = false));
      for (let i = i1; i >= i0; i--) if (fin(M.bb.lower[i])) g.lineTo(xOf(i), yOf(M.bb.lower[i]));
      g.closePath();
      g.fill();
      for (const k of ['upper', 'lower']) line(M.bb[k], C.bbLine, 1);
    }
    function line(arr, color, w, dash = []) {
      g.strokeStyle = color;
      g.lineWidth = w;
      g.setLineDash(dash);
      g.beginPath();
      let on = false;
      for (let i = i0; i <= i1; i++) {
        if (!fin(arr[i])) continue;
        on ? g.lineTo(xOf(i), yOf(arr[i])) : g.moveTo(xOf(i), yOf(arr[i]));
        on = true;
      }
      g.stroke();
      g.setLineDash([]);
    }

    // zones: support/resistance (blue) and the alternative's target (red)
    for (const z of M?.zones ?? []) {
      const x = Math.max(0, xOf(z.from)), y1 = yOf(z.hi), y2 = yOf(z.lo);
      const blue = z.kind !== 'target';
      g.fillStyle = blue ? 'rgba(59,130,246,0.16)' : 'rgba(239,68,68,0.17)';
      g.fillRect(x, y1, L.plotW - x, y2 - y1);
      g.strokeStyle = blue ? 'rgba(96,165,250,0.55)' : 'rgba(248,113,113,0.6)';
      g.lineWidth = 1;
      g.strokeRect(x + 0.5, y1 + 0.5, L.plotW - x - 1, y2 - y1);
    }

    // Fibonacci levels with their prices at the right edge
    if (M?.fib) {
      const x0 = Math.max(0, xOf(M.fib.from.i));
      g.font = FONT(11.5, 600);
      for (const lv of M.fib.levels) {
        const y = yOf(lv.price);
        if (y < -2 || y > P.h + 2) continue;
        g.strokeStyle = FIB[lv.r] ?? C.dim;
        g.globalAlpha = 0.85;
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(x0, Math.round(y) + 0.5);
        g.lineTo(L.plotW, Math.round(y) + 0.5);
        g.stroke();
        g.globalAlpha = 1;
        const t = `${lv.r} (${S.format(lv.price)})`;
        const tw = g.measureText(t).width;
        g.fillStyle = 'rgba(10,15,28,0.78)';
        g.fillRect(L.plotW - tw - 12, y - 9, tw + 8, 17);
        g.fillStyle = FIB[lv.r] ?? C.dim;
        g.textAlign = 'right';
        g.fillText(t, L.plotW - 8, y);
      }
    }

    // the wave channel
    if (M?.channel) {
      const ch = M.channel, at = (i) => ch.a.price + ((ch.b.price - ch.a.price) * (i - ch.a.i)) / (ch.b.i - ch.a.i);
      const xa = ch.from, xb = view.to;
      for (const off of [0, ch.off]) {
        g.strokeStyle = C.channel;
        g.lineWidth = 1.2;
        g.setLineDash([7, 6]);
        g.beginPath();
        g.moveTo(xOf(xa), yOf(at(xa) + off));
        g.lineTo(xOf(xb), yOf(at(xb) + off));
        g.stroke();
      }
      g.setLineDash([]);
    }

    // candles
    for (let i = i0; i <= i1; i++) {
      const k = b[i], x = xOf(i), up = k.c >= k.o;
      g.strokeStyle = g.fillStyle = up ? C.up : C.down;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(Math.round(x) + 0.5, yOf(k.h));
      g.lineTo(Math.round(x) + 0.5, yOf(k.l));
      g.stroke();
      const yo = yOf(k.o), yc = yOf(k.c);
      if (bw >= 2.5) g.fillRect(x - bw / 2, Math.min(yo, yc), bw, Math.max(1, Math.abs(yc - yo)));
    }
    if (M) {
      line(M.ema21, C.ema1, 1.3);
      line(M.ema55, C.ema2, 1.3);
    }

    // wave paths: the large degree in orange, sub-waves in blue (motive) or red (corrective)
    const path = (pts, color, w, dash = []) => {
      g.strokeStyle = color;
      g.lineWidth = w;
      g.setLineDash(dash);
      g.beginPath();
      pts.forEach((p, k) => (k ? g.lineTo(xOf(p.i), yOf(p.price)) : g.moveTo(xOf(p.i), yOf(p.price))));
      g.stroke();
      g.setLineDash([]);
    };
    for (const m of M?.minor ?? []) path(m.points, m.motive ? 'rgba(96,165,250,0.55)' : 'rgba(248,113,113,0.55)', 1.2);
    if (M?.major) path(M.major.points, 'rgba(251,146,60,0.8)', 2);

    // scenario paths with arrowheads and turning-point tags
    const sc = M?.scenarios;
    const arrow = (pts, color) => {
      path(pts, color, 2.2, [8, 6]);
      const a = pts.at(-2), z = pts.at(-1);
      const ang = Math.atan2(yOf(z.price) - yOf(a.price), xOf(z.i) - xOf(a.i));
      g.fillStyle = color;
      g.beginPath();
      g.moveTo(xOf(z.i), yOf(z.price));
      g.lineTo(xOf(z.i) - 11 * Math.cos(ang - 0.42), yOf(z.price) - 11 * Math.sin(ang - 0.42));
      g.lineTo(xOf(z.i) - 11 * Math.cos(ang + 0.42), yOf(z.price) - 11 * Math.sin(ang + 0.42));
      g.closePath();
      g.fill();
    };
    const tag = (x0, y, t, color, below) => {
      g.font = FONT(12, 700);
      const tw = g.measureText(t).width;
      const x = clamp(x0, tw / 2 + 9, L.plotW - tw / 2 - 9);
      const yy = below ? y + 16 : y - 16;
      g.fillStyle = 'rgba(10,15,28,0.9)';
      g.strokeStyle = color;
      g.lineWidth = 1.2;
      roundRect(x - tw / 2 - 7, yy - 10, tw + 14, 20, 5);
      g.fill();
      g.stroke();
      g.fillStyle = color;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(t, x, yy);
    };
    if (sc) {
      arrow(sc.alternative.path, C.red);
      arrow(sc.primary.path, C.green);
      for (const [s, color] of [[sc.alternative, C.red], [sc.primary, C.green]]) {
        const z = s.path.at(-1);
        tag(xOf(z.i), yOf(z.price), `${S.format(s.band.lo)} – ${S.format(s.band.hi)}`, color, s.dir < 0);
        if (s.endLabel) {
          // the wave the path completes, in the large degree's notation (projected, so drawn lighter)
          g.font = FONT(16, 800);
          g.fillStyle = 'rgba(251,146,60,0.85)';
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.direction = 'ltr';
          g.fillText(`(${s.endLabel})`, clamp(xOf(z.i), 20, L.plotW - 24), yOf(z.price) + (s.dir < 0 ? 44 : -44));
        }
        for (const p of s.path.slice(1, -1)) if (p.tag) tag(xOf(p.i), yOf(p.price), `${typeof p.tag === 'string' ? `${p.tag} ` : ''}${S.format(p.price)}`, color, p.price < s.path[0].price);
      }
    }

    // wave labels: circles for the small degree, bracketed numerals for the large one
    const circle = (x, y, t, stroke, color) => {
      g.fillStyle = '#0a0f1c';
      g.strokeStyle = stroke;
      g.lineWidth = 1.6;
      g.beginPath();
      g.arc(x, y, 10, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.fillStyle = color;
      g.font = FONT(12, 800);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(t, x, y + 0.5);
    };
    const stackAt = new Map();
    for (const m of M?.minor ?? [])
      for (const p of m.points) {
        if (!p.label) continue;
        const x = xOf(p.i), top = p.kind === 'H';
        const y = yOf(p.price) + (top ? -16 : 16);
        circle(x, y, p.label, m.motive ? C.motive : C.corr, m.motive ? C.motiveText : C.corrText);
        stackAt.set(p.i, true);
      }
    if (M?.major)
      for (const p of M.major.points) {
        if (!p.label) continue;
        const x = xOf(p.i), top = p.kind === 'H', off = stackAt.has(p.i) ? 42 : 20;
        g.font = FONT(17, 800);
        g.fillStyle = C.major;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.direction = 'ltr';
        g.fillText(`(${p.label})`, x, yOf(p.price) + (top ? -off : off));
      }
    g.restore();

    // the live price: a dashed line and a tag on the axis
    const last = b.at(-1), ly = yOf(last.c), upC = last.c >= b.at(-2).c ? C.up : C.down;
    g.strokeStyle = upC;
    g.globalAlpha = 0.6;
    g.setLineDash([3, 4]);
    g.beginPath();
    g.moveTo(0, Math.round(ly) + 0.5);
    g.lineTo(L.plotW, Math.round(ly) + 0.5);
    g.stroke();
    g.setLineDash([]);
    g.globalAlpha = 1;
    axisTag(ly, S.format(last.c), upC);

    // RSI and MACD panes
    if (M) {
      oscillator(L.rsi, M.rsi, 0, 100, [70, 30], [{ arr: M.rsi, color: C.rsi, name: 'RSI (14)' }], null);
      const hist = M.macd.hist, all = [...M.macd.line, ...M.macd.signal, ...hist].slice(i0, i1 + 1).filter(fin);
      const m = Math.max(1e-9, ...all.map(Math.abs));
      oscillator(L.macd, null, -m * 1.1, m * 1.1, [0], [{ arr: M.macd.line, color: C.macd, name: 'MACD' }, { arr: M.macd.signal, color: C.signal, name: 'Signal' }], hist);
    }

    // crosshair and the OHLC readout
    if (hover && hover.x < L.plotW) {
      const i = clamp(Math.round(iOf(hover.x)), 0, b.length - 1), k = b[i], x = xOf(i);
      g.strokeStyle = C.cross;
      g.setLineDash([4, 4]);
      g.beginPath();
      g.moveTo(Math.round(x) + 0.5, 0);
      g.lineTo(Math.round(x) + 0.5, H);
      if (hover.y < P.h) {
        g.moveTo(0, Math.round(hover.y) + 0.5);
        g.lineTo(L.plotW, Math.round(hover.y) + 0.5);
      }
      g.stroke();
      g.setLineDash([]);
      if (hover.y < P.h) axisTag(hover.y, S.format(lo + (1 - (hover.y - P.y - 8) / (P.h - 16)) * (hi - lo)), '#334155');
      const [jy, jm, jd] = jalaliOf(k.d);
      const dt = fa(`${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`);
      g.font = FONT(11.5, 700);
      const tw = g.measureText(dt).width + 14;
      g.fillStyle = '#334155';
      g.fillRect(clamp(x - tw / 2, 0, L.plotW - tw), L.time.y + 2, tw, L.time.h - 4);
      g.fillStyle = '#f1f5f9';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(dt, clamp(x, tw / 2, L.plotW - tw / 2), L.time.y + L.time.h / 2);
      readout(k, i);
    } else readout(b.at(-1), b.length - 1);

    function readout(k, i) {
      const parts = [['O', k.o], ['H', k.h], ['L', k.l], ['C', k.c]];
      g.font = FONT(12, 600);
      g.textBaseline = 'middle';
      g.textAlign = 'left';
      g.direction = 'ltr';
      let x = 10;
      const y = 14;
      const col = k.c >= (b[i - 1]?.c ?? k.o) ? C.up : C.down;
      for (const [n, v] of parts) {
        g.fillStyle = C.dim;
        g.fillText(n, x, y);
        x += g.measureText(n).width + 4;
        g.fillStyle = col;
        const t = S.format(v);
        g.fillText(t, x, y);
        x += g.measureText(t).width + 12;
      }
      g.fillStyle = C.ema1;
      g.fillText('EMA21', x, y);
      x += g.measureText('EMA21').width + 10;
      g.fillStyle = C.ema2;
      g.fillText('EMA55', x, y);
      x += g.measureText('EMA55').width + 10;
      g.fillStyle = C.bbLine;
      g.fillText('BB(20,2)', x, y);
    }
    function axisTag(y, t, color) {
      g.font = FONT(11.5, 800);
      g.fillStyle = color;
      roundRect(L.plotW + 2, y - 10, L.axisW - 4, 20, 4);
      g.fill();
      g.fillStyle = '#fff';
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.direction = 'ltr';
      g.fillText(t, L.plotW + 7, y + 0.5);
    }
    function oscillator(pn, _unused, vlo, vhi, guides, series, hist) {
      const y = (v) => pn.y + 4 + (1 - (v - vlo) / (vhi - vlo)) * (pn.h - 8);
      g.save();
      g.beginPath();
      g.rect(0, pn.y, L.plotW, pn.h);
      g.clip();
      for (const gv of guides) {
        g.strokeStyle = 'rgba(148,163,184,0.3)';
        g.setLineDash([4, 4]);
        g.beginPath();
        g.moveTo(0, Math.round(y(gv)) + 0.5);
        g.lineTo(L.plotW, Math.round(y(gv)) + 0.5);
        g.stroke();
        g.setLineDash([]);
      }
      if (guides.length === 2) {
        g.fillStyle = 'rgba(167,139,250,0.06)';
        g.fillRect(0, y(guides[0]), L.plotW, y(guides[1]) - y(guides[0]));
      }
      if (hist)
        for (let i = i0; i <= i1; i++) {
          const v = hist[i];
          if (!fin(v)) continue;
          const grow = Math.abs(v) >= Math.abs(hist[i - 1] ?? 0);
          g.fillStyle = v >= 0 ? (grow ? '#22c55e' : 'rgba(34,197,94,0.45)') : grow ? '#ef4444' : 'rgba(239,68,68,0.45)';
          const y0 = y(0), y1 = y(v);
          g.fillRect(xOf(i) - bw / 2, Math.min(y0, y1), Math.max(1, bw), Math.abs(y1 - y0));
        }
      for (const s of series) {
        g.strokeStyle = s.color;
        g.lineWidth = 1.4;
        g.beginPath();
        let on = false;
        for (let i = i0; i <= i1; i++) {
          if (!fin(s.arr[i])) continue;
          on ? g.lineTo(xOf(i), y(s.arr[i])) : g.moveTo(xOf(i), y(s.arr[i]));
          on = true;
        }
        g.stroke();
      }
      g.restore();
      // legend with the latest values, and the value tags on the axis
      g.font = FONT(11.5, 700);
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.direction = 'ltr';
      let x = 10;
      for (const s of series) {
        const v = s.arr.at(-1);
        const t = `${s.name} ${fin(v) ? fa(v.toFixed(2)) : ''}`;
        g.fillStyle = s.color;
        g.fillText(t, x, pn.y + 12);
        x += g.measureText(t).width + 14;
        if (fin(v)) {
          g.fillStyle = s.color;
          roundRect(L.plotW + 2, y(v) - 9, L.axisW - 4, 18, 4);
          g.fill();
          g.fillStyle = '#0a0f1c';
          g.fillText(fa(v.toFixed(2)), L.plotW + 7, y(v) + 0.5);
        }
      }
      for (const gv of guides) {
        g.fillStyle = C.dim;
        g.font = FONT(10.5, 500);
        g.fillText(fa(gv), L.plotW + 7, y(gv));
      }
      g.strokeStyle = C.axis;
      g.beginPath();
      g.moveTo(0, pn.y + 0.5);
      g.lineTo(L.plotW, pn.y + 0.5);
      g.stroke();
    }
  }
  function roundRect(x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  /* ---------------- interaction ---------------- */
  let raf = 0;
  const redraw = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(draw);
  };
  const zoom = (factor, atX) => {
    const n = S.bars.length;
    const i = iOf(atX), span = clamp((view.to - view.from) * factor, 20, n + 200);
    const t = (i - view.from) / (view.to - view.from);
    view = { from: i - span * t, to: i - span * t + span };
    redraw();
  };
  const pan = (di) => {
    const n = S.bars.length, span = view.to - view.from;
    const from = clamp(view.from + di, -span * 0.3, n - span * 0.2);
    view = { from, to: from + span };
    redraw();
  };
  const pos = (e) => {
    const r = cv.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  cv.addEventListener('wheel', (e) => {
    if (!view) return;
    e.preventDefault();
    zoom(e.deltaY > 0 ? 1.12 : 1 / 1.12, pos(e).x);
  }, { passive: false });
  let drag = null;
  const pointers = new Map();
  cv.addEventListener('pointerdown', (e) => {
    cv.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, pos(e));
    drag = { x: pos(e).x, from: view?.from, pinch: pointers.size === 2 ? distance() : null, span: view ? view.to - view.from : 0 };
  });
  const distance = () => {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  cv.addEventListener('pointermove', (e) => {
    const p = pos(e);
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, p);
    if (drag && view && pointers.size === 2 && drag.pinch) {
      const span = clamp((drag.span * drag.pinch) / Math.max(20, distance()), 20, S.bars.length + 200);
      const mid = [...pointers.values()].reduce((s2, q) => s2 + q.x, 0) / 2;
      const i = iOf(mid), t = (i - view.from) / (view.to - view.from);
      view = { from: i - span * t, to: i - span * t + span };
      redraw();
      return;
    }
    if (drag && view && pointers.size === 1 && e.buttons) {
      const di = ((drag.x - p.x) / L.plotW) * (view.to - view.from);
      const span = view.to - view.from;
      const from = clamp(drag.from + di, -span * 0.3, S.bars.length - span * 0.2);
      view = { from, to: from + span };
    }
    hover = p;
    redraw();
  });
  const up = (e) => {
    pointers.delete(e.pointerId);
    if (!pointers.size) drag = null;
  };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);
  cv.addEventListener('pointerleave', () => {
    hover = null;
    redraw();
  });
  cv.addEventListener('dblclick', () => {
    view = fullView();
    redraw();
  });
  cv.addEventListener('keydown', (e) => {
    if (!view) return;
    const span = view.to - view.from;
    if (e.key === 'ArrowLeft') pan(-span * 0.1);
    else if (e.key === 'ArrowRight') pan(span * 0.1);
    else if (e.key === '+' || e.key === '=') zoom(1 / 1.2, L.plotW * 0.8);
    else if (e.key === '-') zoom(1.2, L.plotW * 0.8);
    else return;
    e.preventDefault();
  });
  const ro = new ResizeObserver(() => {
    setup();
    redraw();
  });
  ro.observe(host);

  return {
    set(next, { keepView = false } = {}) {
      S = { ...S, ...next };
      if (!keepView) view = null;
      setup();
      draw();
    },
    inset(px) {
      S.inset = px;
      view = fullView();
      redraw();
    },
    reset() {
      view = fullView();
      redraw();
    },
    png: () => cv.toDataURL('image/png'),
    destroy() {
      ro.disconnect();
      cv.remove();
    },
  };
}
