// دیده‌بان (spec 0053): the dashboard's charts as React components (htm, no JSX). Time runs right→left like the page:
// the oldest day sits at the right edge. Marks are thin, one axis only, colours from the two validated series tokens
// (--ow-s1, --ow-s2); every chart has a hover/focus readout and a table twin, so no value hides behind a tooltip.
import { jsx, useEffect, useMemo, useRef, useState } from '/vendor/glisse/glisse.bundle.js';
import { jd } from '../bk.mjs';

export const num = (v) => Math.round(Number(v) || 0).toLocaleString('fa-IR');
/** 1234 → «۱٬۲۳۴»; 25300 → «۲۵٫۳ هزار»; in the millions and billions likewise. */
export function compact(v) {
  const x = Math.abs(Number(v) || 0), s = Number(v) < 0 ? '−' : '';
  const f = (d, u) => `${s}${(x / d).toLocaleString('fa-IR', { maximumFractionDigits: x / d < 10 ? 1 : 0 })} ${u}`;
  if (x >= 1e9) return f(1e9, 'میلیارد');
  if (x >= 1e6) return f(1e6, 'میلیون');
  if (x >= 1e4) return f(1e3, 'هزار');
  return `${s}${num(x)}`;
}
const f1 = (n) => Math.round(n * 10) / 10;

/** Round ticks from 0 to just above the top; whole steps, since every series here is a count. */
function ticks(hi, n = 4) {
  if (!(hi > 0)) hi = 1;
  const raw = hi / n, mag = 10 ** Math.floor(Math.log10(raw));
  const step = Math.max(1, [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag);
  const out = [];
  for (let x = 0; x <= hi + step / 2 && out.length < 8; x += step) out.push(Math.round(x * 1000) / 1000);
  if (out.at(-1) < hi) out.push(out.at(-1) + step);
  return out.map((t) => (Number.isInteger(step) ? Math.round(t) : t));
}

/** The width of a box, followed as it changes. */
function useWidth(fallback = 640) {
  const ref = useRef(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** A small trend in a stat tile: history in the quiet ink, today's point in the accent. */
export function Spark({ values, label }) {
  const v = (values ?? []).map((x) => Number(x) || 0);
  if (v.length < 2) return null;
  const W = 96, H = 28, hi = Math.max(1, ...v);
  const X = (i) => W - 2 - (i / (v.length - 1)) * (W - 4);
  const Y = (x) => H - 3 - (x / hi) * (H - 7);
  const d = v.map((x, i) => `${i ? 'L' : 'M'}${f1(X(i))} ${f1(Y(x))}`).join('');
  return jsx`<svg className="ow-spark" viewBox=${`0 0 ${W} ${H}`} width=${W} height=${H} role="img" aria-label=${label ?? ''}><path d=${d} /><circle cx=${f1(X(v.length - 1))} cy=${f1(Y(v.at(-1)))} r="3" /></svg>`;
}

/** A tile: the label, the number, one line under it, and an optional spark. */
export function Stat({ label, value, sub, spark, tone }) {
  return jsx`<div className=${`ow-stat ${tone ?? ''}`}><span className="ow-stat-l">${label}</span><b className="ow-stat-v">${value}</b>${sub ? jsx`<span className="ow-stat-s">${sub}</span>` : null}${spark ? jsx`<${Spark} values=${spark} label=${`روند ${label}`} />` : null}</div>`;
}

/** A button that turns a chart into its table and back. */
function TableToggle({ on, set }) {
  return jsx`<button type="button" className="ow-tt" aria-pressed=${on} onClick=${() => set(!on)}>${on ? 'نمودار' : 'جدول'}</button>`;
}

/**
 * Counts through time on one axis. series: [{ key, label, values, tone: 1 | 2 }]; dayList: ISO days, oldest first.
 * The crosshair finds the day under the pointer (or the arrow keys) and lists every series at it.
 */
export function Trend({ title, dayList, series, fmt = num, height = 220 }) {
  const [box, W] = useWidth();
  const [at, setAt] = useState(null);
  const [table, setTable] = useState(false);
  const n = dayList.length;
  const H = height, pad = { t: 16, r: 14, b: 28, l: 46 };
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const hi = Math.max(1, ...series.flatMap((s) => s.values));
  const tk = ticks(hi);
  const top = tk.at(-1);
  const X = (i) => pad.l + iw - (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
  const Y = (v) => pad.t + ih - (v / top) * ih;
  const path = (vals) => vals.map((v, i) => `${i ? 'L' : 'M'}${f1(X(i))} ${f1(Y(v))}`).join('');
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 84))));
  const near = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    return Math.max(0, Math.min(n - 1, n === 1 ? 0 : Math.round(((pad.l + iw - x) / iw) * (n - 1))));
  };
  const key = (e) => {
    const cur = at ?? n - 1;
    if (e.key === 'ArrowLeft') (setAt(Math.min(n - 1, cur + 1)), e.preventDefault()); // visually left = newer
    else if (e.key === 'ArrowRight') (setAt(Math.max(0, cur - 1)), e.preventDefault());
    else if (e.key === 'Home') (setAt(n - 1), e.preventDefault());
    else if (e.key === 'End') (setAt(0), e.preventDefault());
    else if (e.key === 'Escape') setAt(null);
  };
  const tipX = at == null ? 0 : X(at);
  const legend = series.length > 1 ? jsx`<ul className="ow-legend">${series.map((s) => jsx`<li key=${s.key}><i className=${`ow-key s${s.tone}`} />${s.label}</li>`)}</ul>` : null;
  return jsx`<figure className="ow-fig">
    <figcaption className="ow-fig-h"><span>${title}</span>${legend}<${TableToggle} on=${table} set=${setTable} /></figcaption>
    ${table
      ? jsx`<div className="ow-scroll" tabIndex="0"><table className="ow-table"><thead><tr><th scope="col">روز</th>${series.map((s) => jsx`<th scope="col" key=${s.key}>${s.label}</th>`)}</tr></thead>
          <tbody>${[...dayList.keys()].reverse().map((i) => jsx`<tr key=${dayList[i]}><td>${jd(dayList[i])}</td>${series.map((s) => jsx`<td key=${s.key}>${fmt(s.values[i])}</td>`)}</tr>`)}</tbody></table></div>`
      : jsx`<div className="ow-plot" ref=${box}>
          <svg className="ow-trend" direction="ltr" viewBox=${`0 0 ${W} ${H}`} width=${W} height=${H} role="img" aria-label=${`${title}: ${series.map((s) => `${s.label} امروز ${fmt(s.values.at(-1))}`).join('، ')}`}
            tabIndex="0" onPointerMove=${(e) => setAt(near(e))} onPointerLeave=${() => setAt(null)} onFocus=${() => setAt(n - 1)} onBlur=${() => setAt(null)} onKeyDown=${key}>
            <g className="ow-grid">${tk.map((t) => jsx`<g key=${t}><line x1=${pad.l} x2=${W - pad.r} y1=${f1(Y(t))} y2=${f1(Y(t))} /><text x=${pad.l - 8} y=${f1(Y(t) + 4)} textAnchor="end">${fmt(t)}</text></g>`)}</g>
            <g className="ow-x">${dayList.map((d, i) => (i % every === 0 || i === n - 1 ? jsx`<text key=${d} x=${f1(X(i))} y=${H - 8} textAnchor=${n > 1 && i === 0 ? 'end' : n > 1 && i === n - 1 ? 'start' : 'middle'}>${jd(d).slice(5)}</text>` : null))}</g>
            ${series.length === 1 ? jsx`<path className="ow-area s1" d=${`${path(series[0].values)}L${f1(X(n - 1))} ${f1(Y(0))}L${f1(X(0))} ${f1(Y(0))}Z`} />` : null}
            ${series.map((s) => jsx`<path key=${s.key} className=${`ow-line s${s.tone}`} d=${path(s.values)} />`)}
            ${series.map((s) => jsx`<circle key=${`e${s.key}`} className=${`ow-dot s${s.tone}`} cx=${f1(X(n - 1))} cy=${f1(Y(s.values.at(-1)))} r="4" />`)}
            ${at != null ? jsx`<g className="ow-xh"><line x1=${f1(tipX)} x2=${f1(tipX)} y1=${pad.t} y2=${pad.t + ih} />${series.map((s) => jsx`<circle key=${s.key} className=${`ow-dot s${s.tone}`} cx=${f1(tipX)} cy=${f1(Y(s.values[at]))} r="4.5" />`)}</g>` : null}
          </svg>
          ${at != null ? jsx`<div className="ow-tip" style=${{ insetInlineStart: `${Math.max(0, Math.min(W - 170, W - tipX - 85))}px` }} role="status">
            <b>${jd(dayList[at])}</b>${series.map((s) => jsx`<span key=${s.key}><i className=${`ow-key s${s.tone}`} /><strong>${fmt(s.values[at])}</strong> ${s.label}</span>`)}</div>` : null}
        </div>`}
  </figure>`;
}

/** Rows with a bar each: one series, one colour; the value is written beside the bar, never only in a tooltip. */
export function BarList({ title, rows, fmt = num, empty = 'هنوز داده‌ای نیست.', note }) {
  const hi = Math.max(1, ...rows.map((r) => r.value));
  return jsx`<figure className="ow-fig">
    <figcaption className="ow-fig-h"><span>${title}</span>${note ? jsx`<small>${note}</small>` : null}</figcaption>
    ${rows.length
      ? jsx`<ol className="ow-bars">${rows.map((r) => jsx`<li key=${r.key ?? r.label}><span className="ow-bar-l" title=${r.hint ?? ''}>${r.label}</span>
          <span className="ow-bar-t"><i style=${{ inlineSize: r.value > 0 ? `${Math.max(1.5, (r.value / hi) * 100)}%` : '0' }} /></span>
          <span className="ow-bar-v"><b>${fmt(r.value)}</b>${r.sub ? jsx`<small>${r.sub}</small>` : null}</span></li>`)}</ol>`
      : jsx`<p className="ow-empty">${empty}</p>`}
  </figure>`;
}

const WEEK = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];
/** Weekday × hour, Tehran time: one hue, darker where busier, with its scale and its busiest cell named. */
export function Heat({ title, grid }) {
  const [table, setTable] = useState(false);
  const [cur, setCur] = useState(null);
  const hi = Math.max(1, ...grid.flat());
  const peak = useMemo(() => {
    let best = null;
    grid.forEach((row, d) => row.forEach((v, h) => (!best || v > best.v) && (best = { d, h, v })));
    return best && best.v > 0 ? best : null;
  }, [grid]);
  const say = (d, h, v) => `${WEEK[d]}، ساعت ${num(h)} تا ${num(h + 1)}: ${num(v)} رویداد`;
  return jsx`<figure className="ow-fig">
    <figcaption className="ow-fig-h"><span>${title}</span><${TableToggle} on=${table} set=${setTable} /></figcaption>
    ${table
      ? jsx`<div className="ow-scroll" tabIndex="0"><table className="ow-table ow-heat-t"><thead><tr><th scope="col">روز</th>${grid[0].map((_, h) => jsx`<th scope="col" key=${h}>${num(h)}</th>`)}</tr></thead>
          <tbody>${grid.map((row, d) => jsx`<tr key=${d}><th scope="row">${WEEK[d]}</th>${row.map((v, h) => jsx`<td key=${h}>${num(v)}</td>`)}</tr>`)}</tbody></table></div>`
      : jsx`<div className="ow-heat" role="img" aria-label=${`${title}. ${peak ? `شلوغ‌ترین: ${say(peak.d, peak.h, peak.v)}` : 'هنوز رویدادی نیست.'} جدول کامل با دکمه‌ی «جدول».`}>
          <span className="ow-heat-h" aria-hidden="true" />${grid[0].map((_, h) => jsx`<span className="ow-heat-h" key=${`h${h}`} aria-hidden="true">${h % 3 === 0 ? num(h) : ''}</span>`)}
          ${grid.map((row, d) => [jsx`<span className="ow-heat-d" key=${`d${d}`} aria-hidden="true">${WEEK[d]}</span>`, ...row.map((v, h) => jsx`<span key=${`${d}-${h}`} className="ow-cell" aria-hidden="true"
              style=${{ '--p': v ? `${Math.round(12 + (v / hi) * 88)}%` : '0%' }} onPointerEnter=${() => setCur({ d, h, v })} onPointerLeave=${() => setCur(null)} />`)])}
        </div>
        <p className="ow-heat-k"><span>کم</span><i className="ow-scale" aria-hidden="true" /><span>زیاد (${num(hi)})</span><output>${cur ? say(cur.d, cur.h, cur.v) : peak ? `شلوغ‌ترین: ${say(peak.d, peak.h, peak.v)}` : 'هنوز رویدادی نیست.'}</output></p>`}
  </figure>`;
}
