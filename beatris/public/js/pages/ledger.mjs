// Ledger trainer: realistic melted-gold trades at the counter, entered field by field like in the shop's
// accounting software. Trial and error: every field is graded, the worked line is shown, time is measured.
import { html, fa, api, store, $, $$ } from '../core.mjs';
import { back } from '../ui.mjs';
import { fmt, parseNum } from '../calc.mjs';
import { makeTrade, gradeTrade, LEDGER_LEVELS, PATTERNS } from '../melt.mjs';

const KEY = 'beatris.ledger.stats';
const HINT_FOR = { buy: ['p-eq', 'p-val'], sell: ['p-eq', 'p-val'], assay: ['p-assay', 'p-val'], credit: ['p-eq', 'p-val'], settle: ['p-settle', 'p-g18'] };

export function ledgerPage(root) {
  const base = store.me.pricing.p750;
  let stats;
  try {
    stats = JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    stats = {};
  }
  const S = { level: Number(new URLSearchParams(location.search).get('level')) || 1, seed: Math.floor(Math.random() * 1e6), trade: null, t0: 0, graded: null, hint: false, n: 0, ok: 0, streak: 0, times: [] };
  if (!LEDGER_LEVELS.some((l) => l.id === S.level)) S.level = 1;
  const save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(stats));
    } catch {
      /* storage unavailable */
    }
  };

  function fresh() {
    S.seed = Math.floor(Math.random() * 1e6);
    S.trade = makeTrade(S.seed, S.level, base);
    S.graded = null;
    S.hint = false;
    S.t0 = performance.now();
    draw();
    $('input[data-f]', root)?.focus();
  }

  function draw() {
    const t = S.trade;
    const best = stats[`best${S.level}`];
    const avg = S.times.length ? S.times.reduce((a, b) => a + b, 0) / S.times.length : 0;
    root.innerHTML = String(html`${back('/practice', 'تمرین')}
      <h1>تمرین‌گر دفتر آب‌شده</h1>
      <p class="lead">هر سطر یک معامله واقعی پشت پیشخوان است. مثل نرم‌افزار حسابداری، فیلد به فیلد وارد کنید؛ Enter شما را به فیلد بعد می‌برد و در آخر ثبت می‌کند. اشتباه هم آموزش است: پاسخ درست و روش محاسبه همان لحظه نشان داده می‌شود.</p>
      <div class="chips" style="margin:14px 0">${LEDGER_LEVELS.map((l) => html`<button class="chip" data-level="${l.id}" aria-pressed="${l.id === S.level}">سطح ${fa(l.id)}: ${l.label}</button>`)}</div>
      <div class="ledger-stats"><span>این جلسه <b>${fa(S.ok)}</b> درست از <b>${fa(S.n)}</b></span><span>زنجیره <b>${fa(S.streak)}</b></span><span>میانگین زمان <b>${S.times.length ? fa(avg.toFixed(1)) : '—'}</b> ثانیه</span><span>بهترین زمان کامل‌درست این سطح <b>${best ? fa(best.toFixed(1)) : '—'}</b> ثانیه</span></div>
      <form class="tray ledger-card" id="lf" data-seed="${t.seed}" data-level="${t.level}" autocomplete="off">
        <span class="stamp">${t.title}</span>
        <p class="ledger-prompt">${fa(t.prompt)}</p>
        <div class="ledger-fields">${t.fields.map((f, i) => {
          const g = S.graded?.fields[f.id];
          return html`<label class="field ${g ? (g.ok ? 'ok' : 'bad') : ''}">${f.label} <small>(${f.unit})</small>
            <input class="input ltr" data-f="${f.id}" data-i="${i}" inputmode="decimal" ${S.graded ? 'readonly' : ''} value="${S.graded ? fa(S.entered[f.id] ?? '') : ''}" aria-label="${f.label}">
            ${g ? html`<span class="ledger-fb">${g.ok ? '✓ درست' : html`✗ درست: <b>${fmt(f.answer, f.unit === 'گرم' ? 3 : 0)}</b>`} · <span class="small">${fa(f.how)}</span></span>` : ''}</label>`;
        })}</div>
        ${S.hint && !S.graded ? html`<div class="ledger-hint">${PATTERNS.filter((p) => HINT_FOR[t.kind].includes(p.id)).map((p) => html`<div><b>${p.title}</b><code>${fa(p.expr)}</code></div>`)}</div>` : ''}
        <div class="actions">
          ${S.graded
            ? html`<button class="btn" type="button" data-act="next">سطر بعد (Enter)</button><span class="small">${S.graded.correct ? `همه فیلدها درست · ${fa(S.lastTime.toFixed(1))} ثانیه` : 'فیلدهای قرمز را با روش نشان‌داده‌شده مقایسه کنید.'}</span>`
            : html`<button class="btn" type="submit">ثبت سطر</button><button class="btn ghost" type="button" data-act="hint">الگوی این معامله${S.hint ? '' : ' (بدون امتیاز زمان)'}</button>`}
        </div>
      </form>
      <p class="small">علامت‌ها: طلا یا پولی که وارد مغازه می‌شود مثبت، خارج‌شده منفی. گرم‌ها تا سه رقم اعشار، مبلغ به تومان (گرد به هزار). اعداد فارسی و جداکننده هزارگان پذیرفته است.</p>`);
  }

  root.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const inp = e.target.closest('input[data-f]');
    if (S.graded) {
      e.preventDefault();
      return fresh();
    }
    if (!inp) return;
    const next = $$(`input[data-f]`, root)[Number(inp.dataset.i) + 1];
    if (next) {
      e.preventDefault();
      next.focus();
    }
  });
  root.addEventListener('submit', (e) => {
    e.preventDefault();
    if (S.graded) return fresh();
    const values = {};
    const entered = {};
    for (const inp of $$('input[data-f]', root)) {
      entered[inp.dataset.f] = inp.value;
      values[inp.dataset.f] = parseNum(inp.value);
    }
    const g = gradeTrade(S.trade, values);
    const secs = (performance.now() - S.t0) / 1000;
    S.graded = g;
    S.entered = entered;
    S.lastTime = secs;
    S.n++;
    if (g.correct) {
      S.ok++;
      S.streak++;
      if (!S.hint) {
        S.times.push(secs);
        const k = `best${S.level}`;
        if (!stats[k] || secs < stats[k]) stats[k] = secs;
        save();
      }
    } else S.streak = 0;
    api('/api/drills', { method: 'POST', body: { kind: 'ledger', correct: g.correct } }).catch(() => {});
    draw();
    $('[data-act=next]', root)?.focus();
  });
  root.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.level) {
      S.level = Number(b.dataset.level);
      history.replaceState({}, '', `/ledger?level=${S.level}`);
      fresh();
    } else if (b.dataset.act === 'next') fresh();
    else if (b.dataset.act === 'hint') {
      const keep = Object.fromEntries($$('input[data-f]', root).map((i) => [i.dataset.f, i.value]));
      S.hint = true;
      draw();
      for (const i of $$('input[data-f]', root)) i.value = keep[i.dataset.f] ?? '';
    }
  });
  fresh();
}
