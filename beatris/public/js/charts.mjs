// Canvas charts for the market page, without dependencies: a pannable, zoomable price chart with overlays,
// levels and indicator panes (crosshair, tooltip, log scale, touch and keyboard), plus small bar, heatmap and
// sparkline charts for the analytics. Time runs left to right as on every market screen; labels are Persian.
import { fmt } from './calc.mjs';
import { jalaliOf, JALALI_MONTHS } from './ta.mjs';

export const COLORS = { grid: 'rgba(255,240,200,0.07)', axis: 'rgba(255,240,200,0.16)', text: '#bfb193', dim: '#8a7f68', up: '#3fb27f', down: '#e0605e', gold: '#e3b862', cross: 'rgba(255,240,200,0.45)', tip: 'rgba(16,13,9,0.94)', tipLine: 'rgba(227,184,98,0.35)' };
export const PALETTE = ['#e3b862', '#5aa9e6', '#b388eb', '#3fb27f', '#e0605e', '#f29e4c', '#8fd3c1', '#d9d2c3', '#ff7eb6', '#a0c15a'];
const FONT = (px, w = 400) => `${w} ${px}px Estedad, Vazirmatn, Tahoma, sans-serif`;
const fin = Number.isFinite;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const faDigits = (s) => String(s).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
// canvas text follows the page (RTL); numbers, dates and signs are laid out left to right
const LETTERS = /[\u0600-\u06EF\u06FA-\u06FF]/;
function text(g, t, x, y) {
  const s = String(t);
  const d = g.direction;
  g.direction = LETTERS.test(s) ? 'rtl' : 'ltr';
  g.fillText(s, x, y);
  g.direction = d;
}
export const jDate = (d, style = 'full') => {
  const [y, m, day] = jalaliOf(d);
  if (style === 'day') return faDigits(`${day} ${JALALI_MONTHS[m - 1]}`);
  if (style === 'month') return faDigits(`${JALALI_MONTHS[m - 1]} ${String(y).slice(2)}`);
  if (style === 'year') return faDigits(String(y));
  return faDigits(`${y}/${String(m).padStart(2, '0')}/${String(day).padStart(2, '0')}`);
};

/** Numbers on an axis: millions or thousands of toman when the values are large. */
export function axisScale(lo, hi, decimals = 0) {
  const m = Math.max(Math.abs(lo), Math.abs(hi));
  if (m >= 1e7) return { div: 1e6, unit: 'میلیون', dec: hi - lo < 5e6 ? 2 : 1 };
  if (m >= 1e5) return { div: 1e3, unit: 'هزار', dec: hi - lo < 5e3 ? 1 : 0 };
  return { div: 1, unit: '', dec: hi - lo < 5 ? Math.max(decimals, 2) : hi - lo < 50 ? Math.max(decimals, 1) : decimals };
}
function niceStep(range, target) {
  const raw = range / Math.max(1, target), p = 10 ** Math.floor(Math.log10(raw)), f = raw / p;
  return (f < 1.5 ? 1 : f < 2.25 ? 2 : f < 3.5 ? 2.5 : f < 7.5 ? 5 : 10) * p;
}
function ticks(lo, hi, target, log) {
  if (!(hi > lo)) return [lo];
  if (!log || lo <= 0) {
    const s = niceStep(hi - lo, target), out = [];
    for (let v = Math.ceil(lo / s) * s; v <= hi + s * 1e-9; v += s) out.push(Math.abs(v) < s * 1e-9 ? 0 : v);
    return out;
  }
  const out = [];
  for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++)
    for (const m of [1, 1.5, 2, 3, 5, 7]) {
      const v = m * 10 ** e;
      if (v >= lo && v <= hi) out.push(v);
    }
  if (out.length > target * 1.6) return out.filter((_, i) => i % Math.ceil(out.length / target) === 0);
  return out.length >= 2 ? out : ticks(lo, hi, target, false);
}

function setupCanvas(cv, w, h) {
  const dpr = Math.min(window.devicePixelRatio || 1, 3); // sharp on 4K and Retina screens
  cv.width = Math.round(w * dpr);
  cv.height = Math.round(h * dpr);
  cv.style.width = `${w}px`;
  cv.style.height = `${h}px`;
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  return g;
}

/**
 * The price chart. set(spec) takes
 *   { bars:[{d,o,h,l,c}], type:'candle'|'ohlc'|'line'|'area'|'bricks'|'none', overlays:[…], panes:[…],
 *     future:n, log:bool, decimals, unit, format:(v)=>text }
 * overlays: {kind:'line',values,color,width,dash,label} · {kind:'band',upper,lower,color,label}
 *           {kind:'cloud',a,b,label} · {kind:'dots',values,colors|color,label} · {kind:'levels',items:[{price,label,color}]}
 *           {kind:'path',points:[{i,price,label}],color,label}
 * panes:    {title,height,range:[lo,hi]|null,guides:[…],format,series:[{kind:'line'|'hist',values,color,colors,label}]}
 */
export function createChart(host, { height = 420, label = 'نمودار', onHover = null } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'chart-wrap';
  const base = document.createElement('canvas'), top = document.createElement('canvas');
  top.className = 'chart-top';
  top.tabIndex = 0;
  top.setAttribute('role', 'img');
  top.setAttribute('aria-label', label);
  wrap.append(base, top);
  host.replaceChildren(wrap);
  let spec = { bars: [], type: 'candle', overlays: [], panes: [], future: 0 };
  let W = 0, H = height, start = 0, count = 100, hover = -1, hoverY = null, layout = null;

  const total = () => spec.bars.length + (spec.future || 0);
  const minCount = () => Math.min(12, Math.max(2, total()));
  function clampView() {
    count = clamp(count, minCount(), Math.max(minCount(), total()));
    start = clamp(start, 0, Math.max(0, total() - count));
  }
  const fmtV = (v) => (spec.format ? spec.format(v) : fmt(v, spec.decimals ?? 0));

  function computeLayout() {
    const panes = spec.panes ?? [];
    const paneH = panes.reduce((s, p) => s + (p.height ?? 96), 0);
    const axisW = W < 520 ? 52 : 64, bottom = 22;
    const mainH = Math.max(120, H - paneH - bottom);
    const left = 8, right = W - axisW;
    const L = { left, right, axisW, plotW: right - left, main: { top: 6, h: mainH - 12 }, panes: [], bottom: H - bottom };
    let y = mainH;
    for (const p of panes) {
      L.panes.push({ top: y + 6, h: (p.height ?? 96) - 12, spec: p });
      y += p.height ?? 96;
    }
    return L;
  }
  const barW = () => layout.plotW / count;
  const xOf = (i) => layout.left + (i - start + 0.5) * barW();
  const iAt = (x) => Math.floor(start + (x - layout.left) / barW());

  function visible() {
    return [Math.max(0, Math.floor(start)), Math.min(total(), Math.ceil(start + count))];
  }
  function rangeOf(i0, i1) {
    let lo = Infinity, hi = -Infinity;
    const eat = (v) => {
      if (fin(v) && (!spec.log || v > 0)) {
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    };
    const b = spec.bars;
    if (spec.type !== 'none')
      for (let i = i0; i < Math.min(i1, b.length); i++) {
        if (spec.type === 'line' || spec.type === 'area') eat(b[i].c);
        else if (spec.type === 'bricks') (eat(b[i].o), eat(b[i].c));
        else (eat(b[i].h), eat(b[i].l));
      }
    for (const o of spec.overlays ?? []) {
      const arrays = o.kind === 'band' ? [o.upper, o.lower] : o.kind === 'cloud' ? [o.a, o.b] : o.kind === 'line' || o.kind === 'dots' ? [o.values] : [];
      for (const a of arrays) for (let i = i0; i < Math.min(i1, a.length); i++) eat(a[i]);
      if (o.kind === 'path' && o.scale) for (const p of o.points) if (p.i >= i0 && p.i < i1) eat(p.price);
    }
    if (!(hi >= lo)) return [0, 1];
    if (hi === lo) return [lo * 0.99 || -1, hi * 1.01 || 1];
    if (spec.log && lo > 0) {
      const r = Math.log(hi / lo) * 0.06;
      return [lo / Math.exp(r), hi * Math.exp(r)];
    }
    const pad = (hi - lo) * 0.06;
    return [lo - pad, hi + pad];
  }
  const yMap = (lo, hi, top, h, log) => (v) => {
    if (log && lo > 0 && v > 0) return top + h - ((Math.log(v) - Math.log(lo)) / (Math.log(hi) - Math.log(lo))) * h;
    return top + h - ((v - lo) / (hi - lo)) * h;
  };

  function draw() {
    if (!W) return;
    layout = computeLayout();
    const g = setupCanvas(base, W, H);
    g.clearRect(0, 0, W, H);
    clampView();
    const [i0, i1] = visible();
    const L = layout, bw = barW();
    g.font = FONT(11);
    /* ---- main pane ---- */
    const [lo, hi] = rangeOf(i0, i1);
    const log = !!spec.log && lo > 0;
    const y = yMap(lo, hi, L.main.top, L.main.h, log);
    L.main.y = y;
    L.main.lo = lo;
    L.main.hi = hi;
    const sc = axisScale(lo, hi, spec.decimals ?? 0);
    L.main.sc = sc;
    g.strokeStyle = COLORS.grid;
    g.lineWidth = 1;
    g.fillStyle = COLORS.text;
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    for (const v of ticks(lo, hi, Math.max(3, Math.floor(L.main.h / 48)), log)) {
      const yy = Math.round(y(v)) + 0.5;
      g.beginPath();
      g.moveTo(L.left, yy);
      g.lineTo(L.right, yy);
      g.stroke();
      text(g, faDigits(fmt(v / sc.div, sc.dec)), L.right + 6, yy);
    }
    if (sc.unit || spec.unit) {
      g.fillStyle = COLORS.dim;
      g.textAlign = 'right';
      text(g, `${sc.unit ? `${sc.unit} ` : ''}${spec.unit ?? ''}${log ? ' · لگاریتمی' : ''}`, L.right - 6, L.main.top + 10);
    }
    g.save();
    g.beginPath();
    g.rect(L.left, L.main.top - 4, L.plotW, L.main.h + 8);
    g.clip();
    for (const o of spec.overlays ?? []) if (o.kind === 'cloud' || o.kind === 'band') drawFill(g, o, i0, i1, y);
    drawSeries(g, i0, i1, y, bw);
    for (const o of spec.overlays ?? []) if (o.kind !== 'cloud' && o.kind !== 'band') drawOverlay(g, o, i0, i1, y, bw);
    for (const o of spec.overlays ?? []) if (o.kind === 'band' || o.kind === 'cloud') drawOverlay(g, o, i0, i1, y, bw);
    g.restore();
    for (const o of spec.overlays ?? []) if (o.kind === 'levels') drawLevelTags(g, o, y, lo, hi, sc);
    drawLegend(g);
    /* ---- indicator panes ---- */
    for (const p of L.panes) drawPane(g, p, i0, i1, bw);
    /* ---- time axis ---- */
    drawTimeAxis(g, i0, i1);
    drawTop();
  }

  function drawSeries(g, i0, i1, y, bw) {
    const b = spec.bars, n = Math.min(i1, b.length);
    if (spec.type === 'none') return;
    if (spec.type === 'line' || spec.type === 'area') {
      g.beginPath();
      let started = false, firstX = 0, lastX = 0;
      for (let i = Math.max(0, i0 - 1); i < Math.min(n + 1, b.length); i++) {
        const x = xOf(i), yy = y(b[i].c);
        if (!started) ((started = true), (firstX = x), g.moveTo(x, yy));
        else g.lineTo(x, yy);
        lastX = x;
      }
      if (spec.type === 'area' && started) {
        const grad = g.createLinearGradient(0, layout.main.top, 0, layout.main.top + layout.main.h);
        grad.addColorStop(0, 'rgba(227,184,98,0.32)');
        grad.addColorStop(1, 'rgba(227,184,98,0.02)');
        g.save();
        g.lineTo(lastX, layout.main.top + layout.main.h);
        g.lineTo(firstX, layout.main.top + layout.main.h);
        g.closePath();
        g.fillStyle = grad;
        g.fill();
        g.restore();
        g.beginPath();
        started = false;
        for (let i = Math.max(0, i0 - 1); i < Math.min(n + 1, b.length); i++) {
          const x = xOf(i), yy = y(b[i].c);
          if (!started) ((started = true), g.moveTo(x, yy));
          else g.lineTo(x, yy);
        }
      }
      g.strokeStyle = COLORS.gold;
      g.lineWidth = 1.6;
      g.stroke();
      return;
    }
    const w = Math.max(1, Math.min(18, bw * (spec.type === 'bricks' ? 0.9 : 0.68)));
    for (let i = i0; i < n; i++) {
      const k = b[i], x = xOf(i), up = spec.type === 'bricks' ? k.c >= k.o : k.c >= k.o;
      g.strokeStyle = g.fillStyle = up ? COLORS.up : COLORS.down;
      if (spec.type === 'bricks') {
        const y1 = y(Math.max(k.o, k.c)), y2 = y(Math.min(k.o, k.c));
        g.globalAlpha = 0.85;
        g.fillRect(Math.round(x - w / 2), Math.round(y1), Math.max(1, Math.round(w)), Math.max(1, Math.round(y2 - y1)));
        g.globalAlpha = 1;
        continue;
      }
      const yh = y(k.h), yl = y(k.l), yo = y(k.o), yc = y(k.c);
      const cx = Math.round(x) + 0.5;
      g.lineWidth = 1;
      if (spec.type === 'ohlc' || bw < 3) {
        g.beginPath();
        g.moveTo(cx, yh);
        g.lineTo(cx, yl);
        if (spec.type === 'ohlc' && bw >= 3) {
          g.moveTo(cx - w / 2, yo);
          g.lineTo(cx, yo);
          g.moveTo(cx, yc);
          g.lineTo(cx + w / 2, yc);
        }
        g.stroke();
        continue;
      }
      g.beginPath();
      g.moveTo(cx, yh);
      g.lineTo(cx, Math.min(yo, yc));
      g.moveTo(cx, Math.max(yo, yc));
      g.lineTo(cx, yl);
      g.stroke();
      const top = Math.min(yo, yc), hgt = Math.max(1, Math.abs(yc - yo));
      g.fillRect(Math.round(x - w / 2), Math.round(top), Math.max(1, Math.round(w)), Math.round(hgt) || 1);
    }
  }
  function path(g, values, i0, i1, y) {
    g.beginPath();
    let pen = false;
    for (let i = Math.max(0, i0 - 1); i < Math.min(values.length, i1 + 1); i++) {
      const v = values[i];
      if (!fin(v) || (spec.log && v <= 0)) {
        pen = false;
        continue;
      }
      const x = xOf(i), yy = y(v);
      if (!pen) (g.moveTo(x, yy), (pen = true));
      else g.lineTo(x, yy);
    }
  }
  function drawFill(g, o, i0, i1, y) {
    const [a, b] = o.kind === 'band' ? [o.upper, o.lower] : [o.a, o.b];
    const from = Math.max(0, i0 - 1), to = Math.min(a.length, b.length, i1 + 1);
    for (let i = from; i < to - 1; i++) {
      if (![a[i], b[i], a[i + 1], b[i + 1]].every(fin)) continue;
      g.fillStyle = o.kind === 'band' ? o.fill ?? 'rgba(90,169,230,0.08)' : a[i] >= b[i] ? 'rgba(63,178,127,0.16)' : 'rgba(224,96,94,0.16)';
      g.beginPath();
      g.moveTo(xOf(i), y(a[i]));
      g.lineTo(xOf(i + 1), y(a[i + 1]));
      g.lineTo(xOf(i + 1), y(b[i + 1]));
      g.lineTo(xOf(i), y(b[i]));
      g.closePath();
      g.fill();
    }
  }
  function drawOverlay(g, o, i0, i1, y, bw) {
    g.setLineDash(o.dash ?? []);
    if (o.kind === 'line') {
      path(g, o.values, i0, i1, y);
      g.strokeStyle = o.color ?? COLORS.gold;
      g.lineWidth = o.width ?? 1.3;
      g.stroke();
    } else if (o.kind === 'band' || o.kind === 'cloud') {
      const pairs = o.kind === 'band' ? [[o.upper, o.color], [o.lower, o.color], ...(o.mid ? [[o.mid, o.color]] : [])] : [[o.a, '#3fb27f'], [o.b, '#e0605e']];
      for (const [vals, col] of pairs) {
        path(g, vals, i0, i1, y);
        g.strokeStyle = col ?? '#5aa9e6';
        g.lineWidth = 1;
        g.stroke();
      }
    } else if (o.kind === 'dots') {
      const r = clamp(bw * 0.18, 1.2, 2.6);
      for (let i = i0; i < Math.min(i1, o.values.length); i++) {
        if (!fin(o.values[i])) continue;
        g.fillStyle = o.colors?.[i] ?? o.color ?? COLORS.gold;
        g.beginPath();
        g.arc(xOf(i), y(o.values[i]), r, 0, Math.PI * 2);
        g.fill();
      }
    } else if (o.kind === 'levels') {
      for (const it of o.items) {
        if (!fin(it.price)) continue;
        const yy = Math.round(y(it.price)) + 0.5;
        g.strokeStyle = it.color ?? o.color ?? 'rgba(227,184,98,0.6)';
        g.setLineDash(it.dash ?? [4, 4]);
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(layout.left, yy);
        g.lineTo(layout.right, yy);
        g.stroke();
      }
    } else if (o.kind === 'path') {
      g.setLineDash([]);
      g.beginPath();
      o.points.forEach((p, k) => (k ? g.lineTo(xOf(p.i), y(p.price)) : g.moveTo(xOf(p.i), y(p.price))));
      g.strokeStyle = o.color ?? '#f29e4c';
      g.lineWidth = o.width ?? 1.4;
      g.stroke();
      g.font = FONT(11, 700);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      for (const [k, p] of o.points.entries()) {
        if (!p.label) continue;
        const above = p.kind ? p.kind === 'H' : k % 2 === 1;
        const cx = xOf(p.i), cy = y(p.price) + (above ? -14 : 14);
        g.fillStyle = o.color ?? '#f29e4c';
        g.beginPath();
        g.arc(cx, cy, 9, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#16120c';
        text(g, p.label, cx, cy + 0.5);
      }
      g.font = FONT(11);
    }
    g.setLineDash([]);
  }
  function drawLevelTags(g, o, y, lo, hi, sc) {
    g.font = FONT(10);
    g.textBaseline = 'middle';
    for (const it of o.items) {
      if (!fin(it.price)) continue;
      const inside = it.price >= lo && it.price <= hi;
      const yy = inside ? y(it.price) : it.price > hi ? layout.main.top + 8 : layout.main.top + layout.main.h - 8;
      const t = `${it.label}${inside ? '' : it.price > hi ? ' ↑' : ' ↓'}`;
      const w = g.measureText(t).width + 8;
      g.fillStyle = 'rgba(16,13,9,0.8)';
      g.fillRect(layout.right - w - 4, yy - 8, w, 16);
      g.fillStyle = it.color ?? o.color ?? COLORS.gold;
      g.textAlign = 'right';
      text(g, t, layout.right - 8, yy);
    }
    g.font = FONT(11);
  }
  function drawLegend(g) {
    const items = (spec.overlays ?? []).filter((o) => o.label);
    if (!items.length) return;
    g.font = FONT(11);
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    let x = layout.left + 6;
    const yy = layout.main.top + 10;
    for (const o of items) {
      const col = o.color ?? (o.kind === 'cloud' ? '#3fb27f' : COLORS.gold);
      g.fillStyle = col;
      g.fillRect(x, yy - 1, 10, 2.5);
      g.fillStyle = COLORS.text;
      text(g, o.label, x + 14, yy);
      x += g.measureText(o.label).width + 28;
      if (x > layout.right - 140) break;
    }
  }
  function drawPane(g, p, i0, i1, bw) {
    const s = p.spec;
    g.strokeStyle = COLORS.axis;
    g.beginPath();
    g.moveTo(layout.left, Math.round(p.top - 6) + 0.5);
    g.lineTo(W, Math.round(p.top - 6) + 0.5);
    g.stroke();
    let lo = Infinity, hi = -Infinity;
    if (s.range) [lo, hi] = s.range;
    else
      for (const ser of s.series)
        for (let i = i0; i < Math.min(i1, ser.values.length); i++) {
          const v = ser.values[i];
          if (fin(v)) (v < lo && (lo = v), v > hi && (hi = v));
        }
    if (!(hi > lo)) [lo, hi] = [lo - 1 || -1, hi + 1 || 1];
    if (!s.range) {
      if (s.series.some((x) => x.kind === 'hist')) (lo = Math.min(lo, 0), (hi = Math.max(hi, 0)));
      const pad = (hi - lo) * 0.08;
      lo -= pad;
      hi += pad;
    }
    const y = yMap(lo, hi, p.top, p.h, false);
    p.y = y;
    g.font = FONT(10);
    g.fillStyle = COLORS.dim;
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    const guides = s.guides ?? ticks(lo, hi, 2, false);
    g.strokeStyle = COLORS.grid;
    for (const v of guides) {
      const yy = Math.round(y(v)) + 0.5;
      g.setLineDash(s.guides ? [3, 4] : []);
      g.beginPath();
      g.moveTo(layout.left, yy);
      g.lineTo(layout.right, yy);
      g.stroke();
      text(g, faDigits(s.format ? s.format(v) : fmt(v, Math.abs(hi - lo) < 5 ? 2 : 0)), layout.right + 6, yy);
    }
    g.setLineDash([]);
    g.save();
    g.beginPath();
    g.rect(layout.left, p.top - 2, layout.plotW, p.h + 4);
    g.clip();
    for (const ser of s.series) {
      if (ser.kind === 'hist') {
        const w = Math.max(1, bw * 0.6), y0 = y(0);
        for (let i = i0; i < Math.min(i1, ser.values.length); i++) {
          const v = ser.values[i];
          if (!fin(v)) continue;
          g.fillStyle = ser.colors?.[i] ?? (v >= 0 ? 'rgba(63,178,127,0.7)' : 'rgba(224,96,94,0.7)');
          const yy = y(v);
          g.fillRect(xOf(i) - w / 2, Math.min(yy, y0), w, Math.max(1, Math.abs(y0 - yy)));
        }
      } else {
        path(g, ser.values, i0, i1, y);
        g.strokeStyle = ser.color ?? COLORS.gold;
        g.lineWidth = ser.width ?? 1.2;
        g.stroke();
      }
    }
    g.restore();
    g.font = FONT(11);
    g.fillStyle = COLORS.text;
    g.textAlign = 'right';
    text(g, s.title ?? '', layout.right - 6, p.top + 8);
  }
  function drawTimeAxis(g, i0, i1) {
    const b = spec.bars, L = layout;
    g.strokeStyle = COLORS.axis;
    g.beginPath();
    g.moveTo(L.left, Math.round(L.bottom) + 0.5);
    g.lineTo(L.right, Math.round(L.bottom) + 0.5);
    g.stroke();
    if (!b.length) return;
    const n = Math.min(i1, b.length) - i0;
    const days = n > 1 ? (Date.parse(b[Math.min(i1, b.length) - 1].d) - Date.parse(b[i0].d)) / 86400000 : 1;
    const style = days <= 150 ? 'day' : days <= 1100 ? 'month' : 'year';
    const keyOf = (d) => {
      const [yy, m] = jalaliOf(d);
      return style === 'year' ? yy : style === 'month' ? yy * 100 + m : d;
    };
    g.font = FONT(10);
    g.fillStyle = COLORS.text;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    let lastX = -Infinity, lastKey = i0 > 0 ? keyOf(b[i0 - 1].d) : null;
    const gap = style === 'day' ? 64 : 58;
    for (let i = i0; i < Math.min(i1, b.length); i++) {
      const k = keyOf(b[i].d);
      if (k === lastKey && style !== 'day') continue;
      lastKey = k;
      const x = xOf(i);
      if (x - lastX < gap || x < L.left + 16 || x > L.right - 16) continue;
      lastX = x;
      text(g, jDate(b[i].d, style), x, L.bottom + 11);
      g.strokeStyle = COLORS.grid;
      g.beginPath();
      g.moveTo(Math.round(x) + 0.5, L.main.top);
      g.lineTo(Math.round(x) + 0.5, L.bottom);
      g.stroke();
    }
  }

  /* ---- crosshair and tooltip ---- */
  function drawTop() {
    const g = setupCanvas(top, W, H);
    g.clearRect(0, 0, W, H);
    const b = spec.bars;
    if (hover < 0 || hover >= b.length || !layout) return;
    const x = xOf(hover), L = layout;
    g.strokeStyle = COLORS.cross;
    g.setLineDash([3, 3]);
    g.beginPath();
    g.moveTo(Math.round(x) + 0.5, L.main.top);
    g.lineTo(Math.round(x) + 0.5, L.bottom);
    if (hoverY != null && hoverY > L.main.top && hoverY < L.main.top + L.main.h) {
      g.moveTo(L.left, Math.round(hoverY) + 0.5);
      g.lineTo(L.right, Math.round(hoverY) + 0.5);
    }
    g.stroke();
    g.setLineDash([]);
    g.font = FONT(10);
    // price at the pointer, on the axis
    if (hoverY != null && hoverY > L.main.top && hoverY < L.main.top + L.main.h) {
      const { lo, hi, sc } = L.main;
      const f = (L.main.top + L.main.h - hoverY) / L.main.h;
      const v = spec.log && lo > 0 ? Math.exp(Math.log(lo) + f * (Math.log(hi) - Math.log(lo))) : lo + f * (hi - lo);
      g.fillStyle = COLORS.gold;
      g.fillRect(L.right, hoverY - 9, L.axisW, 18);
      g.fillStyle = '#16120c';
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      text(g, faDigits(fmt(v / sc.div, sc.dec)), L.right + 5, hoverY);
    }
    // date on the time axis
    const dt = jDate(b[hover].d);
    const dw = g.measureText(dt).width + 12;
    g.fillStyle = COLORS.gold;
    g.fillRect(clamp(x - dw / 2, L.left, L.right - dw), L.bottom + 1, dw, 20);
    g.fillStyle = '#16120c';
    g.textAlign = 'center';
    text(g, dt, clamp(x, L.left + dw / 2, L.right - dw / 2), L.bottom + 11);
    // tooltip
    const k = b[hover], prev = b[hover - 1];
    const lines = [];
    if (spec.type === 'none') lines.push([dt, '']);
    else if (spec.type === 'line' || spec.type === 'area') lines.push([dt, ''], ['قیمت', fmtV(k.c)]);
    else lines.push([dt, ''], ['باز', fmtV(k.o)], ['سقف', fmtV(k.h)], ['کف', fmtV(k.l)], ['پایانی', fmtV(k.c)]);
    if (prev && spec.type !== 'none' && prev.c) lines.push(['تغییر', `${k.c >= prev.c ? '+' : '−'}${faDigits(fmt(Math.abs((k.c / prev.c - 1) * 100), 2))}٪`]);
    for (const o of spec.overlays ?? []) {
      if (o.kind === 'line' && o.label && fin(o.values[hover])) lines.push([o.label, (o.format ?? fmtV)(o.values[hover]), o.color]);
      if (o.kind === 'band' && o.label && fin(o.upper[hover])) lines.push([o.label, `${fmtV(o.lower[hover])} تا ${fmtV(o.upper[hover])}`, o.color]);
    }
    for (const p of spec.panes ?? []) for (const s of p.series) if (s.label && fin(s.values[hover])) lines.push([s.label, faDigits(p.format ? p.format(s.values[hover]) : fmt(s.values[hover], 2)), s.color]);
    g.font = FONT(11);
    const lw = Math.max(...lines.map(([a, v]) => g.measureText(a).width + g.measureText(v).width)) + 30;
    const th = lines.length * 17 + 10;
    let tx = x + 14;
    if (tx + lw > L.right) tx = x - 14 - lw;
    tx = clamp(tx, L.left, Math.max(L.left, L.right - lw));
    const ty = L.main.top + 22;
    g.fillStyle = COLORS.tip;
    g.strokeStyle = COLORS.tipLine;
    g.beginPath();
    g.roundRect(tx, ty, lw, th, 8);
    g.fill();
    g.stroke();
    g.textBaseline = 'middle';
    lines.forEach(([a, v, col], r) => {
      const yy = ty + 13 + r * 17;
      g.textAlign = 'right';
      g.fillStyle = col ?? (r === 0 ? COLORS.gold : COLORS.dim);
      text(g, a, tx + lw - 10, yy);
      g.textAlign = 'left';
      g.fillStyle = COLORS.text;
      text(g, v, tx + 10, yy);
    });
  }

  /* ---- interaction ---- */
  const pts = new Map();
  let drag = null, pinch = null;
  const local = (e) => {
    const r = top.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  function setHover(p) {
    const i = layout && p ? iAt(p.x) : -1;
    hover = i >= 0 && i < spec.bars.length && p.x <= layout.right ? i : -1;
    hoverY = p?.y ?? null;
    drawTop();
    onHover?.(hover);
  }
  top.addEventListener('pointerdown', (e) => {
    top.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, local(e));
    if (pts.size === 1) drag = { x: local(e).x, start };
    else if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), count, mid: (a.x + b.x) / 2, start };
      drag = null;
    }
  });
  top.addEventListener('pointermove', (e) => {
    const p = local(e);
    if (pts.has(e.pointerId)) pts.set(e.pointerId, p);
    if (pinch && pts.size === 2) {
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d > 10) zoomAt(pinch.mid, pinch.count * (pinch.d / d), pinch);
      return;
    }
    if (drag) {
      start = drag.start - (p.x - drag.x) / barW();
      draw();
      if (Math.abs(p.x - drag.x) > 4) drag.moved = true;
    }
    if (e.pointerType === 'mouse' || !drag?.moved) setHover(p);
  });
  const end = (e) => {
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = null;
    if (!pts.size) drag = null;
  };
  top.addEventListener('pointerup', end);
  top.addEventListener('pointercancel', end);
  top.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse') setHover(null);
  });
  function zoomAt(x, newCount, from = { start, count }) {
    const idx = from.start + (x - layout.left) / (layout.plotW / from.count);
    count = clamp(newCount, minCount(), Math.max(minCount(), total()));
    start = idx - (x - layout.left) / (layout.plotW / count);
    draw();
  }
  top.addEventListener(
    'wheel',
    (e) => {
      if (!layout) return;
      e.preventDefault();
      zoomAt(local(e).x, count * Math.exp(clamp(e.deltaY, -200, 200) * 0.0016));
    },
    { passive: false },
  );
  top.addEventListener('dblclick', () => {
    start = 0;
    count = total();
    draw();
  });
  top.addEventListener('keydown', (e) => {
    const step = Math.max(1, Math.round(count * 0.1));
    if (e.key === 'ArrowLeft') start -= step;
    else if (e.key === 'ArrowRight') start += step;
    else if (e.key === '+' || e.key === '=') return zoomAt(layout.left + layout.plotW / 2, count / 1.25);
    else if (e.key === '-') return zoomAt(layout.left + layout.plotW / 2, count * 1.25);
    else if (e.key === 'Home') start = 0;
    else if (e.key === 'End') start = total();
    else return;
    e.preventDefault();
    draw();
  });
  const ro = new ResizeObserver(() => {
    const w = Math.round(wrap.getBoundingClientRect().width);
    if (w && w !== W) {
      W = w;
      draw();
    }
  });
  ro.observe(wrap);

  return {
    /** Replace what is drawn. keepView keeps zoom and position (a new indicator on the same data). */
    set(next, { keepView = false } = {}) {
      const wasTotal = total();
      spec = { ...next };
      H = next.height ?? H;
      wrap.style.height = `${H}px`;
      if (!keepView || total() !== wasTotal) {
        count = next.view ?? total();
        start = total() - count;
      }
      hover = -1;
      draw();
    },
    get view() {
      return { start, count };
    },
    redraw: draw,
    canvas: () => [base, top],
    /** A PNG of the chart as drawn (base + crosshair layers). */
    toBlob() {
      const c = document.createElement('canvas');
      c.width = base.width;
      c.height = base.height;
      const g = c.getContext('2d');
      g.fillStyle = '#0f0c08';
      g.fillRect(0, 0, c.width, c.height);
      g.drawImage(base, 0, 0);
      return new Promise((r) => c.toBlob(r, 'image/png'));
    },
    destroy() {
      ro.disconnect();
      wrap.remove();
    },
  };
}

/** A small line in a tile. */
export function sparkline(cv, values, { color, w = 120, h = 34 } = {}) {
  const v = values.filter(fin);
  const g = setupCanvas(cv, w, h);
  g.clearRect(0, 0, w, h);
  if (v.length < 2) return;
  const lo = Math.min(...v), hi = Math.max(...v), span = hi - lo || 1;
  const col = color ?? (v.at(-1) >= v[0] ? COLORS.up : COLORS.down);
  g.beginPath();
  v.forEach((x, i) => {
    const px = (i / (v.length - 1)) * (w - 2) + 1, py = h - 2 - ((x - lo) / span) * (h - 4);
    i ? g.lineTo(px, py) : g.moveTo(px, py);
  });
  g.strokeStyle = col;
  g.lineWidth = 1.4;
  g.stroke();
  g.lineTo(w - 1, h);
  g.lineTo(1, h);
  g.closePath();
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, col === COLORS.up ? 'rgba(63,178,127,0.25)' : col === COLORS.down ? 'rgba(224,96,94,0.25)' : 'rgba(227,184,98,0.25)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fill();
}

/** Vertical bars with labels (histograms, seasonality). values may be negative. */
export function barChart(host, { labels, values, colors, height = 220, format = (v) => fmt(v, 1), title = '', tip = null }) {
  host.replaceChildren();
  const cv = document.createElement('canvas');
  cv.className = 'chart-static';
  cv.tabIndex = 0;
  cv.setAttribute('role', 'img');
  cv.setAttribute('aria-label', title);
  host.append(cv);
  let W = 0, hi = -1;
  const draw = () => {
    W = Math.round(host.getBoundingClientRect().width) || 300;
    const g = setupCanvas(cv, W, height), padB = 34, padT = 18, left = 8, right = W - 50;
    g.clearRect(0, 0, W, height);
    const fv = values.filter(fin);
    let lo = Math.min(0, ...fv), top = Math.max(0, ...fv);
    if (top === lo) top = lo + 1;
    const y = (v) => padT + (1 - (v - lo) / (top - lo)) * (height - padT - padB);
    g.font = FONT(10);
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    for (const v of ticks(lo, top, 4, false)) {
      g.strokeStyle = COLORS.grid;
      g.beginPath();
      g.moveTo(left, Math.round(y(v)) + 0.5);
      g.lineTo(right, Math.round(y(v)) + 0.5);
      g.stroke();
      g.fillStyle = COLORS.dim;
      text(g, faDigits(format(v)), right + 6, y(v));
    }
    const bw = (right - left) / values.length;
    values.forEach((v, i) => {
      if (!fin(v)) return;
      g.fillStyle = colors?.[i] ?? (v >= 0 ? COLORS.up : COLORS.down);
      g.globalAlpha = hi === -1 || hi === i ? 0.9 : 0.45;
      const y0 = y(0), y1 = y(v);
      g.fillRect(left + i * bw + bw * 0.12, Math.min(y0, y1), bw * 0.76, Math.max(1, Math.abs(y1 - y0)));
    });
    g.globalAlpha = 1;
    g.fillStyle = COLORS.text;
    g.textAlign = 'center';
    const every = Math.ceil(values.length / Math.max(1, Math.floor((right - left) / 38)));
    labels.forEach((l, i) => i % every === 0 && text(g, faDigits(l), left + (i + 0.5) * bw, height - padB + 14));
    if (title) {
      g.textAlign = 'right';
      text(g, title, right, 9);
    }
    if (hi >= 0 && tip) {
      const t = tip(hi);
      g.font = FONT(11);
      const w = g.measureText(t).width + 16, x = clamp(left + (hi + 0.5) * bw - w / 2, left, right - w);
      g.fillStyle = COLORS.tip;
      g.fillRect(x, padT, w, 22);
      g.fillStyle = COLORS.gold;
      text(g, t, x + w / 2, padT + 11);
    }
    cv._bw = bw;
    cv._left = left;
  };
  cv.addEventListener('pointermove', (e) => {
    const r = cv.getBoundingClientRect(), i = Math.floor((e.clientX - r.left - cv._left) / cv._bw);
    const n = i >= 0 && i < values.length ? i : -1;
    if (n !== hi) ((hi = n), draw());
  });
  cv.addEventListener('pointerleave', () => ((hi = -1), draw()));
  const ro = new ResizeObserver(() => Math.round(host.getBoundingClientRect().width) !== W && draw());
  ro.observe(host);
  draw();
  return { destroy: () => ro.disconnect() };
}

/** A grid of coloured cells (correlation, monthly returns). value → colour on a diverging scale. */
export function heatmap(host, { rows, cols, values, format = (v) => fmt(v, 2), domain = [-1, 1], height, title = '' }) {
  host.replaceChildren();
  const cv = document.createElement('canvas');
  cv.className = 'chart-static';
  cv.setAttribute('role', 'img');
  cv.setAttribute('aria-label', title);
  host.append(cv);
  let W = 0;
  const color = (v) => {
    if (!fin(v)) return 'rgba(255,255,255,0.03)';
    const t = clamp((v - domain[0]) / (domain[1] - domain[0]), 0, 1) * 2 - 1; // −1 … 1
    const a = 0.12 + Math.abs(t) * 0.75;
    return t >= 0 ? `rgba(63,178,127,${a})` : `rgba(224,96,94,${a})`;
  };
  const draw = () => {
    W = Math.round(host.getBoundingClientRect().width) || 300;
    const labW = Math.min(90, W * 0.22), topH = 24, cell = Math.max(16, Math.min(56, (W - labW - 4) / cols.length));
    const Hh = height ?? topH + rows.length * cell + 4;
    const g = setupCanvas(cv, W, Hh);
    g.clearRect(0, 0, W, Hh);
    g.font = FONT(cell < 26 ? 9 : 11);
    g.textBaseline = 'middle';
    g.textAlign = 'center';
    const x0 = W - labW - cols.length * cell; // RTL: labels on the right
    cols.forEach((c, j) => {
      g.fillStyle = COLORS.text;
      text(g, faDigits(c), x0 + (cols.length - 1 - j + 0.5) * cell, topH / 2);
    });
    rows.forEach((r, i) => {
      g.textAlign = 'right';
      g.fillStyle = COLORS.text;
      text(g, faDigits(r), W - 4, topH + (i + 0.5) * cell);
      g.textAlign = 'center';
      cols.forEach((_, j) => {
        const v = values[i][j], x = x0 + (cols.length - 1 - j) * cell, yy = topH + i * cell;
        g.fillStyle = color(v);
        g.fillRect(x + 1, yy + 1, cell - 2, cell - 2);
        if (fin(v) && cell >= 22) {
          g.fillStyle = '#efe6d2';
          text(g, faDigits(format(v)), x + cell / 2, yy + cell / 2);
        }
      });
    });
  };
  const ro = new ResizeObserver(() => Math.round(host.getBoundingClientRect().width) !== W && draw());
  ro.observe(host);
  draw();
  return { destroy: () => ro.disconnect() };
}
