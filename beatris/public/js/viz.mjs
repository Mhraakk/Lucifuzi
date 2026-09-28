// Interactive diagrams for lessons ('viz' blocks). Each widget is small, keyboard-accessible, and computes with
// the same functions as the counter tools (melt.mjs), so what a lesson shows is exactly what the shop books.
import { html, fa } from './core.mjs';
import { fmt, parseNum } from './calc.mjs';
import { eq750, pureOf, mesghalOf, gram18, ledgerValue, r3, rT, PATTERNS } from './melt.mjs';

const T = (n) => `${fmt(Math.round(n))} تومان`;
const G = (n, d = 3) => `${fmt(n, d)} گرم`;
const num = (el, fallback) => {
  const v = parseNum(el?.value);
  return Number.isFinite(v) ? v : fallback;
};
const input = (name, label, value, step = 'any') => html`<label class="vz-in"><span>${label}</span><input class="input ltr" name="${name}" inputmode="decimal" value="${fa(value)}" data-step="${step}"></label>`;

/* ---------------- ladder: one piece, every unit the market uses ---------------- */
function ladder(el, b) {
  el.innerHTML = String(html`<div class="vz-row">${input('w', 'وزن ترازو (گرم)', b.w)}${input('ayar', 'عیار ری‌گیری', b.ayar)}${input('maz', 'مظنه (تومان)', fmt(b.maz))}</div><div class="vz-bars" aria-live="polite"></div>`);
  const draw = () => {
    const w = num(el.querySelector('[name=w]'), b.w), a = num(el.querySelector('[name=ayar]'), b.ayar), m = num(el.querySelector('[name=maz]'), b.maz);
    const rows = [
      ['وزن ترازو', w, G(w, 2)],
      ['معادل ۷۵۰ (زبان دفتر)', eq750(w, a), G(r3(eq750(w, a)))],
      ['طلای خالص', pureOf(w, a), G(pureOf(w, a))],
      ['به مثقال', mesghalOf(w), `${fmt(mesghalOf(w), 3)} مثقال`],
    ];
    const max = Math.max(...rows.map((r) => r[1]), 1e-9);
    el.querySelector('.vz-bars').innerHTML = String(html`${rows.map(([l, v, t]) => html`<div class="vz-bar"><span>${l}</span><i><b style="width:${Math.max(1, (v / max) * 100).toFixed(1)}%"></b></i><em>${t}</em></div>`)}
      <div class="vz-total"><span>قیمت گرم ۱۸ = مظنه ÷ ۴٫۳۳۱۸</span><b>${T(gram18(m))}</b><span>ارزش قطعه (قاعده دفتر)</span><b>${T(ledgerValue(w, a, m))}</b></div>`);
  };
  el.addEventListener('input', draw);
  draw();
}

/* ---------------- patterns: fixed formulas with a live example ---------------- */
function patterns(el, b) {
  el.innerHTML = String(html`<div class="vz-row">${input('maz', 'مظنه نمونه (تومان)', fmt(b.maz))}</div><div class="vz-cards"></div>`);
  const draw = () => {
    const m = num(el.querySelector('[name=maz]'), b.maz), g = gram18(m);
    const ex = {
      'p-g18': `${fmt(m)} ÷ ۴٫۳۳۱۸ = ${T(g)}`,
      'p-eq': `۱۰ گرم × ۷۴۰ ÷ ۷۵۰ = ${G(eq750(10, 740))}`,
      'p-val': `۱۰ گرم عیار ۷۴۰: ${G(r3(eq750(10, 740)))} × ${T(g)} = ${T(ledgerValue(10, 740, m))}`,
      'p-maz': `۱۰ × ۷۴۰ × ${fmt(m)} ÷ ۳۲۴۸٫۸۵ ≈ ${T(rT((10 * 740 * m) / 3248.85))}`,
      'p-assay': `۱۰۰ گرم، ادعا ۷۴۵، ری‌گیری ۷۴۲: ${G(r3(eq750(100, 742) - eq750(100, 745)))}`,
      'p-settle': `بدهی ۱۰۰ گرم، پرداخت ۳۰۰ میلیون: ${G(r3(300e6 / g))} تسویه، مانده ${G(r3(100 - r3(300e6 / g)))}`,
      'p-msq': `۱۰ مثقال = ${G(46.083)}`,
    };
    el.querySelector('.vz-cards').innerHTML = String(html`${PATTERNS.map((p) => html`<div class="vz-card"><b>${p.title}</b><code>${fa(p.expr)}</code><p>${fa(p.quick)}</p><p class="vz-ex">مثال: ${fa(ex[p.id] ?? '')}</p><p class="vz-check">${fa(p.check)}</p></div>`)}`);
  };
  el.addEventListener('input', draw);
  draw();
}

/* ---------------- journal: a trade lands in the two columns ---------------- */
function journal(el, b) {
  const eq = r3(eq750(b.w, b.ayar)), g = gram18(b.maz), value = ledgerValue(b.w, b.ayar, b.maz);
  const buy = b.trade !== 'sell';
  const steps = [
    ['ترازو و برگه ری‌گیری', `وزن ${fmt(b.w, 2)} گرم، عیار ${fmt(b.ayar)}`, null],
    ['طرف معامله و مظنه', `${buy ? 'خرید از مشتری ← مظنه خرید' : 'فروش به مشتری ← مظنه فروش'}: ${fmt(b.maz)} تومان`, null],
    ['معادل ۷۵۰', `${fmt(b.w, 2)} × ${fmt(b.ayar)} ÷ ۷۵۰ = ${G(eq)}`, null],
    ['مبلغ', `${G(eq)} × ${T(g)} = ${T(value)}`, null],
    ['ستون طلا', `${buy ? '+' : '−'} ${G(eq)}`, 'gold'],
    ['ستون پول', `${buy ? '−' : '+'} ${T(value)}`, 'cash'],
  ];
  let k = 0;
  const draw = () => {
    el.innerHTML = String(html`<div class="vz-steps">${steps.map(([t, d], i) => html`<div class="vz-step ${i < k ? 'on' : ''} ${i === k - 1 ? 'now' : ''}"><i>${fa(i + 1)}</i><b>${t}</b><span>${i < k ? fa(d) : '…'}</span></div>`)}</div>
      <div class="vz-t"><div><h4>طلا (گرم ۷۵۰)</h4><p>${k >= 5 ? fa(steps[4][1]) : ''}</p></div><div><h4>صندوق (تومان)</h4><p>${k >= 6 ? fa(steps[5][1]) : ''}</p></div></div>
      <div class="vz-act"><button class="btn small" type="button" data-vz="next" ${k >= steps.length ? 'disabled' : ''}>قدم بعد</button><button class="btn small ghost" type="button" data-vz="reset">از اول</button></div>`);
  };
  el.addEventListener('click', (e) => {
    const a = e.target.closest('[data-vz]')?.dataset.vz;
    if (a === 'next' && k < steps.length) k++;
    else if (a === 'reset') k = 0;
    else return;
    draw();
  });
  draw();
}

/* ---------------- assay: declared vs measured fineness ---------------- */
function assay(el, b) {
  el.innerHTML = String(html`<div class="vz-row">${input('w', 'وزن (گرم)', b.w)}${input('declared', 'عیار اعلامی', b.declared)}<label class="vz-in"><span>عیار ری‌گیری: <b data-v></b></span><input type="range" name="measured" min="690" max="760" step="1" value="${b.measured}"></label>${input('maz', 'مظنه (تومان)', fmt(b.maz))}</div><div class="vz-bars" aria-live="polite"></div>`);
  const draw = () => {
    const w = num(el.querySelector('[name=w]'), b.w), d = num(el.querySelector('[name=declared]'), b.declared), m = Number(el.querySelector('[name=measured]').value), maz = num(el.querySelector('[name=maz]'), b.maz);
    el.querySelector('[data-v]').textContent = fa(m);
    const eqD = r3(eq750(w, d)), eqM = r3(eq750(w, m)), diff = r3(eqM - eqD);
    const max = Math.max(eqD, eqM, 1e-9);
    el.querySelector('.vz-bars').innerHTML = String(html`<div class="vz-bar"><span>معادل ۷۵۰ طبق ادعا</span><i><b style="width:${((eqD / max) * 100).toFixed(1)}%"></b></i><em>${G(eqD)}</em></div>
      <div class="vz-bar"><span>معادل ۷۵۰ طبق ری‌گیری</span><i><b class="${diff < 0 ? 'low' : ''}" style="width:${((eqM / max) * 100).toFixed(1)}%"></b></i><em>${G(eqM)}</em></div>
      <div class="vz-total"><span>اختلاف</span><b class="${diff < 0 ? 'neg' : ''}">${diff < 0 ? '−' : '+'}${G(Math.abs(diff))}</b><span>به تومان</span><b class="${diff < 0 ? 'neg' : ''}">${T(rT(Math.abs(diff) * gram18(maz)))}</b></div>`);
  };
  el.addEventListener('input', draw);
  draw();
}

/* ---------------- balance: a week with the wholesaler ---------------- */
function balance(el) {
  const m1 = 40000000, m2 = 41000000;
  const rows = [];
  let debt = 0, cash = 0, stock = 0;
  const push = (day, text, dDebt, dCash, dStock) => {
    debt = r3(debt + dDebt);
    cash += dCash;
    stock = r3(stock + dStock);
    rows.push({ day, text, debt, cash, stock });
  };
  push('شنبه', 'خرید ۱۰۰ گرم ۷۵۰ از بنکدار به‌صورت طلایی (نسیه)', 100, 0, 100);
  push('یکشنبه', `فروش ۳۰ گرم به مشتری با مظنه ${fmt(m1)}`, 0, rT(30 * gram18(m1)), -30);
  const settled = r3(300e6 / gram18(m1));
  push('دوشنبه', `پرداخت ۳۰۰٬۰۰۰٬۰۰۰ تومان با مظنه ${fmt(m1)} ← تسویه ${fmt(settled, 3)} گرم`, -settled, -300e6, 0);
  push('سه‌شنبه', 'برگرداندن ۲۰ گرم آب‌شده ۷۵۰ به بنکدار', -20, 0, -20);
  const rest = debt;
  push('چهارشنبه', `تسویه کامل مانده ${fmt(rest, 3)} گرم با مظنه ${fmt(m2)}`, -rest, -rT(rest * gram18(m2)), 0);
  let k = 1;
  const draw = () => {
    el.innerHTML = String(html`<div class="tablewrap"><table><thead><tr><th>روز</th><th>شرح</th><th>بدهی طلایی به بنکدار</th><th>صندوق (خالص)</th><th>موجودی طلا</th></tr></thead><tbody>${rows.slice(0, k).map((r) => html`<tr><td>${r.day}</td><td>${fa(r.text)}</td><td>${G(r.debt)}</td><td>${T(r.cash)}</td><td>${G(r.stock)}</td></tr>`)}</tbody></table></div>
      <p class="small">${k === rows.length ? 'بدهی طلایی صفر شد؛ ببینید قیمت بالاتر چهارشنبه چقدر پول بیشتری برای همان گرم‌ها گرفت.' : ''}</p>
      <div class="vz-act"><button class="btn small" type="button" data-vz="next" ${k >= rows.length ? 'disabled' : ''}>روز بعد</button><button class="btn small ghost" type="button" data-vz="reset">از اول</button></div>`);
  };
  el.addEventListener('click', (e) => {
    const a = e.target.closest('[data-vz]')?.dataset.vz;
    if (a === 'next' && k < rows.length) k++;
    else if (a === 'reset') k = 1;
    else return;
    draw();
  });
  draw();
}

/* ---------------- chart: a market chart inside a lesson ---------------- */
// Drawn from the sample market ending on a fixed day, so the picture always matches the lesson text.
const LESSON_DAY = '2026-09-27';
async function chart(el, b) {
  el.innerHTML = '<div class="vz-chart"><div class="vz-cv"></div><p class="vz-note">داده نمونه آموزشی (شبیه‌سازی‌شده، نه قیمت واقعی) · کشیدن و بزرگ‌نمایی فعال است</p></div>';
  const [{ createChart }, M, T, I] = await Promise.all([import('./charts.mjs'), import('./market.mjs'), import('./ta.mjs'), import('./indicators.mjs')]);
  const id = M.isSymbol(b.symbol) ? b.symbol : 'mesghal';
  const show = b.bars ?? 180;
  const bars = M.sampleMarket(LESSON_DAY)[id].slice(-(show + 260)); // extra days warm up the indicators
  const c = T.closes(bars), sym = M.SYMBOL[id];
  const f = (v) => fmt(M.roundQuote(id, v), sym.decimals ?? 0);
  // a convincing Elliott count (all rules, score ≥ 40) is labelled on the zigzag; otherwise the zigzag alone
  let wave = null;
  if (b.overlays?.includes('zigzag')) {
    const zz = T.zigzag(bars, T.swingPct(bars));
    const best = T.elliott(zz).find((x) => x.valid && x.score >= 40);
    if (best) wave = { ...best, zz };
  }
  const overlays = I.OVERLAYS.filter(([k]) => b.overlays?.includes(k)).flatMap(([, , build]) => build(bars, c, f, wave));
  const panes = I.PANES.filter(([k]) => b.panes?.includes(k)).map(([, , build]) => ({ ...build(bars, c), height: 90 }));
  const height = 290 + panes.length * 90;
  const ch = createChart(el.querySelector('.vz-cv'), { height, label: b.caption ?? 'نمودار بازار' });
  ch.set({ bars, type: b.type ?? 'candle', overlays, panes, unit: sym.unit, decimals: sym.decimals ?? 0, format: (v) => fmt(v, sym.decimals ?? 0), view: show, height });
}

const WIDGETS = { ladder, patterns, journal, assay, balance, chart };
export const VIZ_KINDS = Object.keys(WIDGETS);

/** Mount every viz block inside root. */
export function mountViz(root) {
  for (const el of root.querySelectorAll('[data-viz]')) {
    if (el.dataset.mounted) continue;
    let spec;
    try {
      spec = JSON.parse(el.dataset.viz);
    } catch {
      continue;
    }
    const fn = Object.hasOwn(WIDGETS, spec.kind) ? WIDGETS[spec.kind] : null;
    if (!fn) continue;
    el.dataset.mounted = '1';
    fn(el.querySelector('.vz-body'), spec);
  }
}
