// Dashboard charts as SVG: vector-sharp at any pixel density, themeable with CSS tokens, keyboard-reachable. Time runs
// right→left like the page (RTL): the oldest point sits at the right edge.
import { esc } from '../core.mjs';

const f2 = (n) => (Math.round(n * 10) / 10).toString();
/** Line + area paths of a small trend line. */
export function sparkSvg(values, { w = 120, h = 36, cls = '' } = {}) {
  const v = (values ?? []).filter(Number.isFinite);
  if (v.length < 2) return `<svg class="gd-spark ${cls}" viewBox="0 0 ${w} ${h}" aria-hidden="true"></svg>`;
  const lo = Math.min(...v), hi = Math.max(...v), span = hi - lo || 1;
  const pts = v.map((x, i) => [w - 1 - (i / (v.length - 1)) * (w - 2), h - 3 - ((x - lo) / span) * (h - 8)]);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${f2(x)} ${f2(y)}`).join('');
  const area = `${line}L${f2(pts.at(-1)[0])} ${h}L${f2(pts[0][0])} ${h}Z`;
  const up = v.at(-1) >= v[0];
  return `<svg class="gd-spark ${up ? 'up' : 'down'} ${cls}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><path class="a" d="${area}"/><path class="l" d="${line}"/><circle cx="${f2(pts.at(-1)[0])}" cy="${f2(pts.at(-1)[1])}" r="2.2"/></svg>`;
}

/** Round axis ticks. */
function ticks(lo, hi, n = 4) {
  if (hi === lo) hi = lo + 1;
  const raw = (hi - lo) / n, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const a = Math.floor(lo / step) * step, b = Math.ceil(hi / step) * step;
  const out = [];
  for (let x = a; x <= b + step / 2; x += step) out.push(Math.round(x * 1000) / 1000);
  return out;
}

/**
 * The primary chart: gold position through time. series: [{key,label,cls,area,strong}]
 * opts: { fmtY(v), tip(point) → html, onPick(point), hidden:Set }
 */
export function positionChart(host, points, series, opts) {
  const hidden = opts.hidden ?? new Set();
  let idx = points.length - 1;
  const draw = () => {
    const W = Math.max(280, host.clientWidth || 600), H = Math.max(230, Math.min(350, Math.round(W * 0.56)));
    const pad = { t: 14, r: 12, b: 30, l: 52 };
    const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    const vis = series.filter((s) => !hidden.has(s.key));
    const all = points.flatMap((p) => vis.map((s) => p[s.key]));
    const lo = Math.min(0, ...all), hi = Math.max(1, ...all);
    const tk = ticks(lo, hi);
    const y0 = tk[0], y1 = tk.at(-1);
    const X = (i) => pad.l + iw - (points.length === 1 ? iw / 2 : (i / (points.length - 1)) * iw);
    const Y = (v) => pad.t + ih - ((v - y0) / (y1 - y0 || 1)) * ih;
    const path = (key) => points.map((p, i) => `${i ? 'L' : 'M'}${f2(X(i))} ${f2(Y(p[key]))}`).join('');
    const every = Math.max(1, Math.ceil(points.length / Math.max(3, Math.floor(iw / 78))));
    const svg = `<svg class="gd-pos" direction="ltr" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(opts.label ?? '')}">
      <defs>${vis.filter((s) => s.area).map((s) => `<linearGradient id="gpa-${s.key}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="stop-${s.cls}" stop-opacity=".28"/><stop offset="1" class="stop-${s.cls}" stop-opacity="0"/></linearGradient>`).join('')}</defs>
      <g class="grid">${tk.map((t) => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${f2(Y(t))}" y2="${f2(Y(t))}" class="${t === 0 ? 'zero' : ''}"/><text x="${pad.l - 8}" y="${f2(Y(t) + 4)}" text-anchor="end">${esc(opts.fmtY(t))}</text>`).join('')}</g>
      <g class="xl">${points.map((p, i) => (i % every === 0 || i === points.length - 1 ? `<text x="${f2(X(i))}" y="${H - 8}" text-anchor="${points.length > 1 && i === 0 ? 'end' : points.length > 1 && i === points.length - 1 ? 'start' : 'middle'}">${esc(p.label)}</text>` : '')).join('')}</g>
      ${vis.filter((s) => s.area).map((s) => `<path class="area" fill="url(#gpa-${s.key})" d="${path(s.key)}L${f2(X(points.length - 1))} ${f2(Y(Math.max(y0, 0)))}L${f2(X(0))} ${f2(Y(Math.max(y0, 0)))}Z"/>`).join('')}
      ${vis.map((s) => `<path class="ln ${s.cls} ${s.strong ? 'strong' : ''}" d="${path(s.key)}"/>`).join('')}
      <g class="xh" style="display:none"><line y1="${pad.t}" y2="${pad.t + ih}"/>${vis.map((s) => `<circle r="4.2" class="${s.cls}" data-k="${s.key}"/>`).join('')}</g>
      <rect class="hit" x="${pad.l}" y="${pad.t}" width="${iw}" height="${ih}" fill="transparent"/></svg>`;
    host.querySelector('.gd-pos-svg').innerHTML = svg;
    const g = host.querySelector('.xh'), tip = host.querySelector('.gd-tip');
    const show = (i, fromKey = false) => {
      idx = Math.max(0, Math.min(points.length - 1, i));
      const p = points[idx];
      g.style.display = '';
      g.querySelector('line').setAttribute('x1', X(idx));
      g.querySelector('line').setAttribute('x2', X(idx));
      for (const c of g.querySelectorAll('circle')) (c.setAttribute('cx', X(idx)), c.setAttribute('cy', Y(p[c.dataset.k])));
      tip.innerHTML = opts.tip(p);
      tip.hidden = false;
      const tw = tip.offsetWidth, x = X(idx) + (X(idx) > W / 2 ? -tw - 14 : 14);
      tip.style.transform = `translate(${Math.max(0, Math.min(W - tw, x))}px, ${pad.t}px)`;
      if (fromKey) host.setAttribute('aria-valuetext', p.label);
    };
    const hide = () => {
      g.style.display = 'none';
      tip.hidden = true;
    };
    const svgEl = host.querySelector('svg');
    const near = (e) => {
      const r = svgEl.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * W;
      return points.length === 1 ? 0 : Math.round(((pad.l + iw - x) / iw) * (points.length - 1));
    };
    svgEl.addEventListener('pointermove', (e) => show(near(e)));
    svgEl.addEventListener('pointerleave', hide);
    svgEl.addEventListener('click', (e) => opts.onPick?.(points[near(e)]));
    host.onkeydown = (e) => {
      if (e.key === 'ArrowLeft') (show(idx - 1, true), e.preventDefault()); // visually left = newer
      else if (e.key === 'ArrowRight') (show(idx + 1, true), e.preventDefault());
      else if (e.key === 'Home') (show(points.length - 1, true), e.preventDefault());
      else if (e.key === 'End') (show(0, true), e.preventDefault());
      else if (e.key === 'Enter') opts.onPick?.(points[idx]);
      else if (e.key === 'Escape') hide();
    };
    host.onfocus = () => show(idx, true);
    host.onblur = hide;
    // the ones in the list are newest-last; show newest by default for keyboard users
    idx = Math.min(idx, points.length - 1);
  };
  draw();
  const ro = new ResizeObserver(() => draw());
  ro.observe(host);
  return () => ro.disconnect();
}

/** Aging bars: rows of buttons, the bar width is the share of all receivables. */
export function agingRows(buckets, fmtMoney, fmtPct, selected) {
  const max = Math.max(1, ...buckets.map((b) => b.amount));
  return buckets
    .map(
      (b, i) => `<button class="gd-age r${i} ${selected === b.key ? 'on' : ''}" data-bucket="${b.key}" aria-pressed="${selected === b.key}" ${b.amount ? '' : 'disabled'}>
        <span class="k">${esc(b.label)}</span>
        <span class="gd-bar"><i style="width:${((b.amount / max) * 100).toFixed(2)}%"></i><em>${esc(fmtPct(b.pct))}</em></span>
        <span class="v"><b>${esc(fmtMoney(b.amount))}</b><small>${b.customers ? `${esc(String(b.customers).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]))} مشتری · میانگین ${esc(String(b.avgDays).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]))} روز` : '—'}</small></span></button>`,
    )
    .join('');
}

/** Donut of the operational assets. Segments are circles with dash arrays (clean at any size). */
export function donutSvg(segs, { size = 200, stroke = 26, active = null } = {}) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, total = segs.reduce((s, x) => s + x.value, 0) || 1;
  let off = 0;
  const gap = segs.filter((x) => x.value > 0).length > 1 ? 2.2 : 0;
  const arcs = segs
    .map((s) => {
      const len = (s.value / total) * c;
      if (len <= 0) return '';
      const el = `<circle class="seg ${active === s.key ? 'on' : ''} ${active && active !== s.key ? 'dim' : ''}" data-seg="${s.key}" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="${s.color}" stroke-width="${stroke}" stroke-dasharray="${Math.max(0.1, len - gap).toFixed(2)} ${(c - Math.max(0.1, len - gap)).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" fill="none" tabindex="0" role="button" aria-label="${esc(s.label)}"/>`;
      off += len;
      return el;
    })
    .join('');
  return `<svg class="gd-donut-svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"><g transform="rotate(-90 ${size / 2} ${size / 2})"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="trk" stroke-width="${stroke}" fill="none"/>${arcs}</g></svg>`;
}

/** Cash in and out by hour as paired micro bars (business hours). */
export function cashBars(byHour) {
  const hours = byHour.filter((x) => x.h >= 8 && x.h <= 21);
  const max = Math.max(1, ...hours.flatMap((x) => [x.in, x.out]));
  const W = hours.length * 12, H = 64;
  return `<svg class="gd-cashbars" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">${hours
    .map((x, i) => {
      const xi = W - (i + 1) * 12 + 2;
      const hi = (x.in / max) * (H - 4), ho = (x.out / max) * (H - 4);
      return `<rect class="in" x="${xi}" y="${H - hi}" width="4" height="${Math.max(hi, 1)}" rx="1"/><rect class="out" x="${xi + 5}" y="${H - ho}" width="4" height="${Math.max(ho, 1)}" rx="1"/>`;
    })
    .join('')}</svg>`;
}
