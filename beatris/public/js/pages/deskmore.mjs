// The base edition's other screens: روزنگار (everything that happened on a day, line by line, with the payment
// method and each customer's balance right after), گاوصندوق (what is physically held vs what customers hold with us,
// with a physical count), the sealed-bar registry (serial → who, when, where), and bank reconciliation.
import { html, raw, fa, api, store, toast, navigate, actions, $, $$, busy } from '../core.mjs';
import * as B from '../books.mjs';
import * as TR from '../trade.mjs';
import { COIN_TYPES } from '../coins.mjs';
import { booksPrefs, R, G, jd, jdLong, jdInput, parseDay, today, addDays, timeFa, modal, confirmBox, balChips, unitLabel, unitAmt, describeLine, lineVerb, exportButtons, wireExport, statusChip } from '../bk.mjs';
import { booksNav } from './books.mjs';

const money = (v) => R(v);
const sg = (n) => (n < 0 ? raw(`<bdi dir="ltr">−${fa(-n)}</bdi>`) : fa(n));
const sgm = (v) => (v < 0 ? raw(`<bdi dir="ltr">−${R(-v).replace(' ریال', '')}</bdi> ریال`) : R(v));
const payText = (p) => [B.payMethod(p.method)?.label ?? p.method, p.account && `(${p.account})`, p.ref && `پیگیری ${fa(p.ref)}`, p.card && `کارت …${fa(p.card)}`, p.chequeNo && `چک ${fa(p.chequeNo)}`, p.due && `سررسید ${jd(p.due)}`].filter(Boolean).join(' ');
const partyLink = (p) => (p ? html`<a href="/books/party/${p.id}" data-link>${p.label}</a>` : html`<span class="small">مشتری گذری</span>`);

/* ---------------- روزنگار ---------------- */
const FILTERS = [
  ['all', 'همه'],
  ['buy', 'خرید'],
  ['sell', 'فروش'],
  ['goods', 'جنسی'],
  ['money', 'فقط وجه'],
  ['hawala', 'حواله'],
  ['convert', 'تبدیل'],
  ['void', 'باطل'],
];
const entryTags = (e) => {
  const t = new Set();
  if (e.status === 'void') t.add('void');
  if (e.type === 'hawala') t.add('hawala');
  if (e.type === 'convert') t.add('convert');
  for (const l of e.lines) {
    if (e.type !== 'trade') continue;
    if (!l.priced) t.add('goods');
    else t.add(l.dir === 'in' ? 'buy' : 'sell');
  }
  if (e.type === 'trade' && !e.lines.length) t.add('money');
  return t;
};

export async function dayPage(root) {
  await booksPrefs();
  const qs = new URLSearchParams(location.search);
  const day = parseDay(qs.get('day') ?? '') ?? today();
  let r;
  try {
    r = await api(`/api/books/daybook?day=${day}`);
  } catch (e) {
    root.innerHTML = String(html`${booksNav('day')}<div class="notice">${e.message}</div>`);
    return;
  }
  const t = r.totals;
  const state = { f: qs.get('f') ?? 'all', q: '' };
  const go = (d) => navigate(`/books/day?day=${d}`);
  const coinTot = Object.entries(t.coins).filter(([, n]) => n);
  const fxTot = Object.entries(t.fx).filter(([, n]) => n);
  const moneyRows = B.PAY_METHODS.map((m) => [m, t.money[`${m.id}:in`] ?? 0, t.money[`${m.id}:out`] ?? 0]).filter(([, a, b]) => a || b);
  root.innerHTML = String(html`${booksNav('day')}
    <div class="bk-head dy-head"><div><h1>روزنگار</h1><span class="small">${jdLong(day)} · همه رویدادهای روز با مانده هر مشتری پس از همان سند · مبالغ به ریال</span></div>
      <div class="dy-nav"><button class="iconbtn" data-act="prev" aria-label="روز قبل">›</button><input class="input ltr sm" id="dday" value="${jdInput(day)}" aria-label="تاریخ"><button class="iconbtn" data-act="next" aria-label="روز بعد" ${day >= today() ? 'disabled' : ''}>‹</button>${day !== today() ? html`<button class="chip" data-act="today">امروز</button>` : ''}</div></div>
    <div class="printable pr-sheet"><h2 class="pr-only">روزنگار ${jdLong(day)}</h2><div class="stats bk-stats dy-stats">
      <div><b>${fa(t.docs)}</b><span>سند قطعی</span></div>
      <div><b>${money(t.buys).replace(' ریال', '')}</b><span>خرید از مشتریان (ریال)</span></div>
      <div><b>${money(t.sells).replace(' ریال', '')}</b><span>فروش به مشتریان (ریال)</span></div>
      <div><b class="dy-io"><em>ورود ${G(t.goldIn)}</em><em>خروج ${G(t.goldOut)}</em></b><span>آبشده (گرم ۷۵۰)</span></div>
      <div><b class="dy-io">${coinTot.length ? coinTot.map(([k, n]) => html`<em>${COIN_TYPES[k]?.short} ${n > 0 ? 'ورود' : 'خروج'} ${fa(Math.abs(n))}</em>`) : '—'}</b><span>سکه (خالص)</span></div>
      <div><b>${fa(t.bars.in)} / ${fa(t.bars.out)}</b><span>شمش ورود / خروج</span></div>
      ${fxTot.length ? html`<div><b class="dy-io">${fxTot.map(([k, n]) => html`<em>${TR.FX_CODES[k]} ${n > 0 ? 'ورود' : 'خروج'} ${fa(Math.abs(n))}</em>`)}</b><span>ارز</span></div>` : ''}
      ${store.isAdmin() ? html`<div class="${t.realized < 0 ? 'bad' : 'good'}"><b>${sgm(t.realized)}</b><span>سود/زیان تحقق‌یافته امروز (میانگین موزون)</span></div>` : ''}
    </div>
    ${moneyRows.length ? html`<section class="tray dy-money"><h3 class="bk-h">گردش وجه به تفکیک روش</h3><div class="dy-methods">${moneyRows.map(([m, a, b]) => html`<div><span>${m.label}</span>${a ? html`<b class="in">+${money(a)}</b>` : ''}${b ? html`<b class="out">−${money(b)}</b>` : ''}</div>`)}</div></section>` : ''}
    <div class="dy-tools"><div class="chips" id="dyf">${FILTERS.map(([k, l]) => html`<button class="chip" data-f="${k}" aria-pressed="${state.f === k}">${l}</button>`)}</div><input class="input" id="dyq" placeholder="جستجوی نام مشتری، شماره سند، سریال…">${exportButtons('dy')}</div>
    <ol class="dy-list" id="dyl"></ol></div>`);

  const list = $('#dyl', root);
  function draw() {
    const q = TR.normName(state.q);
    const rows = r.entries.filter((e) => (state.f === 'all' || entryTags(e).has(state.f)) && (!q || TR.normName([e.party?.label, e.no, e.hawala?.fromName, e.hawala?.toName, e.note, ...e.lines.map((l) => l.serial)].join(' ')).includes(q)));
    list.innerHTML = rows.length
      ? rows.map((e, i) => String(entry(e, i))).join('')
      : String(html`<li class="dy-empty">${r.entries.length ? 'موردی با این فیلتر نیست.' : `در ${jd(day)} سندی ثبت نشده است.`}</li>`);
  }
  function entry(e, i) {
    const label = B.DOC_TYPES[e.type]?.label ?? e.type;
    return html`<li class="dy-e ${e.status}" style="--i:${Math.min(i, 12)}">
      <div class="dy-time"><b>${timeFa(e.at)}</b><span>${e.by ?? ''}</span></div>
      <div class="dy-card">
        <div class="dy-top"><a class="dy-no" href="/books/doc/${e.id}" data-link>${label} ${fa(e.no)}</a>${e.version > 1 ? html`<span class="bk-st">نسخه ${fa(e.version)}</span>` : ''}${e.status !== 'final' ? statusChip(e.status) : ''}${e.type !== 'hawala' ? html`<span class="dy-who">${partyLink(e.party)}${e.party?.group ? html`<em>${e.party.group}</em>` : ''}</span>` : ''}</div>
        ${e.type === 'hawala' && e.hawala ? html`<p class="dy-l"><span class="dk-tag">حواله</span> ${unitAmt(e.hawala.unit, e.hawala.amount)} از حساب <b>${e.hawala.fromName}</b> به حساب <b>${e.hawala.toName}</b></p>` : ''}
        ${e.type === 'convert' && e.convert ? html`<p class="dy-l"><span class="dk-tag">تبدیل</span> ${e.convert.amount > 0 ? 'بدهی' : 'طلب'} ${unitAmt(e.convert.unit, Math.abs(e.convert.amount))} به ریال${e.convert.mazaneh ? html` روی مظنه ${money(e.convert.mazaneh)}` : e.convert.price ? html` با نرخ ${money(e.convert.price)}` : ''} = <b>${money(Math.abs(e.convert.value))}</b></p>` : ''}
        ${e.type === 'trade'
          ? e.lines.map((l) => html`<p class="dy-l ${l.dir} ${l.priced ? '' : 'goods'}"><span class="dk-tag">${lineVerb(l)}</span> <b>${TR.TRADE_KINDS[l.kind]}${l.kind === 'coin' ? ` ${COIN_TYPES[l.coin]?.short ?? ''}` : ''}</b> ${describeLine(l)}${l.src?.conditional ? ' · شرطی (منتظر آزمایشگاه)' : ''}${l.assay ? ` · عیار آزمایشگاه ${fa(l.assay.from)}←${fa(l.assay.to)}` : ''}${l.kind === 'melt' && l.priced && l.eq750 ? html` · هر گرم ۷۵۰: ${money(B.rnd(l.value / l.eq750))}` : ''}${l.priced ? html` → <strong>${money(l.value)}</strong>` : ''}</p>`)
          : e.type !== 'hawala' && e.type !== 'convert' ? html`<p class="dy-l"><span class="dk-tag">${label}</span> ${e.lines.length ? `${fa(e.lines.length)} ردیف` : ''}${e.net ? html` · خالص ${money(Math.abs(e.net))}` : ''}</p>` : ''}
        ${e.payments.length ? html`<div class="dy-pays">${e.payments.map((p) => html`<span class="dy-pay ${p.dir}">${p.dir === 'in' ? 'دریافت' : 'پرداخت'} ${payText(p)} <b>${money(p.value)}</b></span>`)}</div>` : ''}
        ${e.type === 'trade' && e.credit ? html`<p class="small dy-credit">${e.credit > 0 ? 'به حساب بدهی مشتری رفت' : 'به حساب طلب مشتری رفت'}: <b>${money(Math.abs(e.credit))}</b></p>` : ''}
        ${e.note ? html`<p class="small">یادداشت: ${e.note}</p>` : ''}
        ${Object.entries(e.after).length ? html`<div class="dy-after">${Object.entries(e.after).map(([pid, b]) => html`<div><span>مانده ${e.type === 'hawala' ? (pid === e.hawala?.from ? e.hawala.fromName : e.hawala?.toName) : e.party?.name ?? ''} پس از این سند</span>${balChips(b)}</div>`)}</div>` : ''}
      </div></li>`;
  }
  draw();
  $('#dyf', root).addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-f]');
    if (!b) return;
    state.f = b.dataset.f;
    $$('[data-f]', root).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    draw();
  });
  $('#dyq', root).addEventListener('input', (ev) => {
    state.q = ev.target.value;
    draw();
  });
  $('#dday', root).addEventListener('change', (ev) => {
    const d = parseDay(ev.target.value);
    if (d) go(d);
    else toast('تاریخ را مثل ۱۴۰۵/۰۷/۰۶ وارد کنید.', 'error');
  });
  const map = { prev: () => go(addDays(day, -1)), next: () => go(addDays(day, 1)), today: () => go(today()) };
  const exportRows = () =>
    r.entries.flatMap((e) => {
      const base = { time: timeFa(e.at), doc: `${B.DOC_TYPES[e.type]?.short ?? ''} ${e.no}`, status: e.status === 'final' ? 'قطعی' : 'باطل', party: e.type === 'hawala' ? `${e.hawala?.fromName} ← ${e.hawala?.toName}` : e.party?.label ?? 'گذری', by: e.by ?? '' };
      const out = e.lines.map((l) => ({ ...base, what: e.type === 'trade' ? `${lineVerb(l)} ${TR.TRADE_KINDS[l.kind]}` : B.DOC_TYPES[e.type]?.label, weight: l.weight || '', fineness: l.fineness || '', eq750: l.eq750 || '', mesghal: l.mesghal || '', count: l.count || '', mazaneh: l.mazaneh || l.impliedMazaneh || '', serial: l.serial ?? '', amount: l.priced ? l.value : '', method: '', ref: '' }));
      if (e.hawala) out.push({ ...base, what: `حواله ${unitLabel(e.hawala.unit)}`, count: e.hawala.amount });
      if (e.convert) out.push({ ...base, what: `تبدیل ${unitLabel(e.convert.unit)}`, count: e.convert.amount, amount: e.convert.value });
      for (const p of e.payments) out.push({ ...base, what: p.dir === 'in' ? 'دریافت وجه' : 'پرداخت وجه', amount: p.dir === 'in' ? p.value : -p.value, method: B.payMethod(p.method)?.label, ref: [p.ref, p.card, p.chequeNo, p.account].filter(Boolean).join(' ') });
      return out;
    });
  wireExport(map, 'dy', `roznegar-${day}`, exportRows, [['time', 'ساعت'], ['doc', 'سند'], ['status', 'وضعیت'], ['party', 'طرف حساب'], ['what', 'شرح'], ['weight', 'وزن'], ['fineness', 'عیار'], ['eq750', 'معادل ۷۵۰'], ['mesghal', 'مثقال'], ['count', 'تعداد/مقدار'], ['mazaneh', 'مظنه (ریال)'], ['serial', 'سریال'], ['amount', 'مبلغ (ریال)'], ['method', 'روش'], ['ref', 'پیگیری/حساب'], ['by', 'کاربر']], `روزنگار ${jd(day)}`);
  actions(root, map);
}

/* ---------------- گاوصندوق ---------------- */
export async function vaultPage(root) {
  await booksPrefs();
  const [v, acc] = await Promise.all([api('/api/books/vault'), api('/api/books/accounts')]);
  const admin = store.isAdmin();
  const P = v.prices.price;
  const accName = Object.fromEntries(acc.items.map((a) => [a.id, a.title]));
  const coins = Object.keys(COIN_TYPES).filter((k) => v.coins[k] || v.custody[`COIN:${k}`]);
  const goldValue = B.rnd(v.gold * (P.G750 ?? 0));
  const coinValue = coins.reduce((s, k) => s + (v.coins[k] ?? 0) * (P[`COIN:${k}`] ?? 0), 0);
  const cashSum = Object.values(v.cash).reduce((s, x) => s + x, 0), bankSum = Object.values(v.bank).reduce((s, x) => s + x, 0);
  const cust = (u) => v.custody[u] ?? { owedByShop: 0, owedToShop: 0 };
  const netOf = (u, held) => held - cust(u).owedByShop + cust(u).owedToShop;
  root.innerHTML = String(html`${booksNav('vault')}
    <div class="bk-head"><div><h1>گاوصندوق</h1><span class="small">موجودی فیزیکی، امانت مشتریان و موقعیت خالص · ارزش به قیمت زنده (ریال)</span></div><div class="actions"><button class="btn small" data-act="count">شمارش فیزیکی</button><button class="btn small ghost" data-act="print">چاپ</button></div></div>
    <div class="printable pr-sheet"><h2 class="pr-only">گاوصندوق ${jdLong(today())}</h2><div class="vt-tiles">
      <div class="vt-tile vt-gold"><span>طلای آبشده (گرم ۷۵۰)</span><b>${G(v.gold)}</b><small>${P.G750 ? money(goldValue) : ''}</small></div>
      ${coins.map((k) => html`<div class="vt-tile vt-coin"><span>${COIN_TYPES[k].label ?? COIN_TYPES[k].short}</span><b>${sg(v.coins[k] ?? 0)}</b><small>${P[`COIN:${k}`] ? sgm((v.coins[k] ?? 0) * P[`COIN:${k}`]) : ''}</small></div>`)}
      <div class="vt-tile vt-bar"><span>شمش پلمپ</span><b>${fa(v.bars.length)}</b><small>${G(v.bars.reduce((s, b) => s + (b.weight ?? 0), 0))} گرم</small></div>
      ${Object.entries(v.fx).map(([c, n]) => html`<div class="vt-tile vt-fx"><span>${TR.FX_CODES[c]}</span><b>${fa(n)}</b></div>`)}
      <div class="vt-tile vt-cash"><span>نقد صندوق‌ها</span><b>${money(cashSum).replace(' ریال', '')}</b><small>ریال</small></div>
      <div class="vt-tile vt-bank"><span>موجودی بانک‌ها</span><b>${money(bankSum).replace(' ریال', '')}</b><small>ریال</small></div>
    </div>
    <div class="grid2 bk-grid vt-grid">
      <section class="tray"><h3 class="bk-h">موقعیت خالص (موجودی − امانت مشتری + طلب جنسی)</h3>
        <div class="scrollx"><table class="table-plain"><thead><tr><th>قلم</th><th>در گاوصندوق</th><th>امانت / طلب مشتریان</th><th>بدهی جنسی مشتریان</th><th>خالص ما</th></tr></thead><tbody>
          <tr><td>طلا (گرم ۷۵۰)</td><td class="num">${G(v.gold)}</td><td class="num">${G(cust('G750').owedByShop)}</td><td class="num">${G(cust('G750').owedToShop)}</td><td class="num"><b>${G(B.r3(netOf('G750', v.gold)))}</b></td></tr>
          ${coins.map((k) => html`<tr><td>${COIN_TYPES[k].short}</td><td class="num">${sg(v.coins[k] ?? 0)}</td><td class="num">${fa(cust(`COIN:${k}`).owedByShop)}</td><td class="num">${fa(cust(`COIN:${k}`).owedToShop)}</td><td class="num"><b>${sg(netOf(`COIN:${k}`, v.coins[k] ?? 0))}</b></td></tr>`)}
          <tr><td>ریال</td><td class="num">${money(cashSum + bankSum)}</td><td class="num">${money(cust('IRR').owedByShop)}</td><td class="num">${money(cust('IRR').owedToShop)}</td><td class="num"><b>${money(netOf('IRR', cashSum + bankSum))}</b></td></tr>
        </tbody></table></div>
        <p class="small">مظنه نقدی: ${v.prices.mazaneh ? money(v.prices.mazaneh) : '—'} · گرم ۷۵۰: ${P.G750 ? money(P.G750) : '—'}</p></section>
      <section class="tray"><h3 class="bk-h">صندوق‌ها و بانک‌ها</h3><table class="table-plain">${[...Object.entries(v.cash).map(([id, x]) => ['صندوق', id, x]), ...Object.entries(v.bank).map(([id, x]) => ['بانک', id, x])].map(([k, id, x]) => html`<tr><td>${accName[id] ?? id} <span class="small">${k}</span></td><td class="num">${money(x)}</td><td>${k === 'بانک' && admin ? html`<a class="chip" href="/books/bank/${id}" data-link>تطبیق</a>` : ''}</td></tr>`)}</table></section>
    </div>
    ${v.bars.length ? html`<section class="tray bk-sec"><div class="bk-head"><h3 class="bk-h">شمش‌های داخل گاوصندوق</h3><a class="chip" href="/books/bars" data-link>دفتر شمش‌ها</a></div><div class="scrollx"><table class="table-plain bk-table"><thead><tr><th>سریال</th><th>ضامن</th><th>گالری</th><th>وزن</th><th>عیار</th><th>تاریخ پلمپ</th><th>ورود</th></tr></thead><tbody>${v.bars.map((b) => html`<tr><td class="ltr-num"><a href="/books/bars?q=${b.serial}" data-link>${fa(b.serial)}</a></td><td>${b.brand}</td><td>${b.gallery}</td><td class="num">${G(b.weight)}</td><td class="num">${fa(b.fineness)}</td><td>${b.sealDate ? jd(b.sealDate) : '—'}</td><td>${b.history.at(-1) ? jd(b.history.at(-1).date) : ''}</td></tr>`)}</tbody></table></div></section>` : ''}</div>`);
  actions(root, {
    print: () => window.print(),
    count: () => {
      const items = [['gold', 'طلای آبشده (گرم ۷۵۰)', v.gold], ...Object.keys(COIN_TYPES).map((k) => [`coin:${k}`, COIN_TYPES[k].short, v.coins[k] ?? 0])];
      modal(
        String(html`<h3 class="bk-h">شمارش فیزیکی گاوصندوق</h3><p class="small">مقدار شمرده‌شده را وارد کنید؛ اختلاف با دفتر همین‌جا نشان داده می‌شود.${admin ? ' مدیر می‌تواند اختلاف را با یک سند «مانده افتتاحیه / اصلاح شمارش» ثبت کند.' : ''}</p>
          <table class="table-plain vt-count">${items.map(([k, l, b]) => html`<tr data-k="${k}" data-b="${b}"><td>${l}</td><td class="num">دفتر: ${k === 'gold' ? G(b) : fa(b)}</td><td><input class="input ltr sm" inputmode="decimal" placeholder="شمارش"></td><td class="num vt-diff"></td></tr>`)}</table>
          <p class="err" id="vterr"></p><div class="actions">${admin ? html`<button class="btn" data-adj>ثبت اصلاحیه اختلاف</button>` : ''}<button class="btn ghost" data-close>بستن</button></div>`),
        (m, close) => {
          const diffs = () =>
            $$('tr[data-k]', m)
              .map((tr) => {
                const x = $('input', tr).value.trim();
                if (x === '') return null;
                const n = B.num(x);
                const d = tr.dataset.k === 'gold' ? B.r3(n - Number(tr.dataset.b)) : Math.round(n - Number(tr.dataset.b));
                const price = P[tr.dataset.k === 'gold' ? 'G750' : `COIN:${tr.dataset.k.slice(5)}`];
                // a surplus enters at today's price so the trading result is not distorted
                return Number.isFinite(d) ? { acct: tr.dataset.k, amount: d, ...(d > 0 && price ? { cost: B.rnd(d * price) } : {}) } : null;
              })
              .filter((x) => x && x.amount);
          m.addEventListener('input', () => {
            for (const tr of $$('tr[data-k]', m)) {
              const x = $('input', tr).value.trim();
              const n = B.num(x);
              const d = x === '' || !Number.isFinite(n) ? null : tr.dataset.k === 'gold' ? B.r3(n - Number(tr.dataset.b)) : Math.round(n - Number(tr.dataset.b));
              const cell = $('.vt-diff', tr);
              cell.textContent = d == null ? '' : d === 0 ? '✓ برابر' : `${d > 0 ? 'اضافه' : 'کسری'} ${tr.dataset.k === 'gold' ? G(Math.abs(d)) : fa(Math.abs(d))}`;
              cell.className = `num vt-diff ${d ? (d > 0 ? 'good' : 'bad') : ''}`;
            }
          });
          m.querySelector('[data-adj]')?.addEventListener('click', async (ev) => {
            const btn = ev.currentTarget;
            const bal = diffs();
            if (!bal.length) return ($('#vterr', m).textContent = 'اختلافی برای ثبت نیست.');
            const ok = await confirmBox('ثبت اصلاحیه شمارش', `${fa(bal.length)} قلم اختلاف به‌صورت سند اصلاحی ثبت می‌شود و در تاریخچه می‌ماند.`);
            if (!ok) return;
            busy(btn, true);
            try {
              await api('/api/books/docs', { method: 'POST', body: { type: 'opening', money: 'rial', balances: bal, note: `اصلاح شمارش فیزیکی گاوصندوق ${jd(today())}` } });
              toast('اصلاحیه ثبت شد.', 'ok');
              close();
              navigate('/books/vault', { replace: true });
            } catch (err) {
              $('#vterr', m).textContent = err.message;
            } finally {
              busy(btn, false);
            }
          });
        },
      );
    },
  });
}

/* ---------------- دفتر شمش‌ها ---------------- */
export async function barsPage(root) {
  await booksPrefs();
  const q = new URLSearchParams(location.search).get('q') ?? '';
  const r = await api(`/api/books/bars${q ? `?q=${encodeURIComponent(q)}` : ''}`);
  const status = (b) => (b.inVault ? html`<span class="bk-st final">در گاوصندوق</span>` : b.custodyOf ? html`<span class="bk-st draft">امانت ${b.custodyOf}</span>` : html`<span class="bk-st void">خارج شده</span>`);
  root.innerHTML = String(html`${booksNav('bars')}
    <div class="bk-head"><div><h1>دفتر شمش‌های پلمپ</h1><span class="small">هر سریال فقط یک بار وارد گاوصندوق می‌شود؛ سیر کامل ورود و خروج هر شمش.</span></div>${exportButtons('br')}</div>
    <form class="bk-filters" id="bq"><input class="input ltr" name="q" value="${q}" placeholder="سریال (بخشی از آن کافی است)" autofocus><button class="btn small">جستجو</button>${q ? html`<a class="chip" href="/books/bars" data-link>همه</a>` : ''}</form>
    <div class="br-list printable pr-sheet">${r.items.length
      ? r.items.map((b, i) => html`<details class="tray br-card" style="--i:${Math.min(i, 12)}" ${r.items.length === 1 ? raw('open') : ''}><summary><b class="ltr-num">${fa(b.serial)}</b><span>${b.brand || '—'}${b.gallery ? ` · ${b.gallery}` : ''}</span><span>${b.weight != null ? `${G(b.weight)} گرم · ${fa(b.fineness)}` : ''}</span>${status(b)}</summary>
          <p class="small">تاریخ پلمپ: ${b.sealDate ? jd(b.sealDate) : '—'}</p>
          <ol class="br-hist">${b.history.map((h) => html`<li class="${h.dir}"><b>${jd(h.date)}</b> ${h.dir === 'in' ? (h.priced ? 'خرید از' : 'دریافت امانی از') : h.priced ? 'فروش به' : 'تحویل به'} ${h.party ?? 'مشتری گذری'} · <a href="/books/doc/${h.doc}" data-link>سند ${fa(h.no)}</a></li>`)}</ol></details>`)
      : html`<p class="notice">${q ? 'شمشی با این سریال ثبت نشده است.' : 'هنوز شمشی ثبت نشده است؛ در میز معامله گزینه «شمش پلمپ» را بزنید.'}</p>`}</div>`);
  $('#bq', root).addEventListener('submit', (e) => {
    e.preventDefault();
    const v = new FormData(e.target).get('q');
    navigate(`/books/bars${v ? `?q=${encodeURIComponent(v)}` : ''}`);
  });
  const map = {};
  wireExport(map, 'br', 'shemsh', () => r.items.map((b) => ({ serial: b.serial, brand: b.brand, gallery: b.gallery, weight: b.weight, fineness: b.fineness, sealDate: b.sealDate ? jd(b.sealDate) : '', status: b.inVault ? 'در گاوصندوق' : b.custodyOf ? `امانت ${b.custodyOf}` : 'خارج شده', last: b.history.at(-1) ? `${jd(b.history.at(-1).date)} ${b.history.at(-1).party ?? ''}` : '' })), [['serial', 'سریال'], ['brand', 'ضامن'], ['gallery', 'گالری'], ['weight', 'وزن'], ['fineness', 'عیار'], ['sealDate', 'تاریخ پلمپ'], ['status', 'وضعیت'], ['last', 'آخرین رویداد']], 'شمش‌ها');
  actions(root, map);
}

/* ---------------- تطبیق بانک ---------------- */
export async function bankPage(root, { id }) {
  await booksPrefs();
  let r;
  try {
    r = await api(`/api/books/bank/${id}`);
  } catch (e) {
    root.innerHTML = String(html`${booksNav('cash')}<div class="notice">${e.message}</div>`);
    return;
  }
  const a = r.account;
  const pend = new Map(); // src -> {on, ref}
  root.innerHTML = String(html`${booksNav('cash')}
    <div class="bk-head"><div><h1>تطبیق بانک: ${a.title}</h1><span class="small">${a.bank ?? ''} ${a.number ? fa(a.number) : ''}</span></div>${exportButtons('bn')}</div>
    <div class="stats bk-stats"><div><b>${money(r.book)}</b><span>مانده دفتر</span></div><div><b>${money(r.reconciledBalance)}</b><span>مانده تطبیق‌شده با صورتحساب</span></div><div class="${r.open ? 'bad' : 'good'}"><b>${fa(r.open)}</b><span>ردیف تطبیق‌نشده</span></div></div>
    <section class="tray bk-sec"><h3 class="bk-h">چسباندن صورتحساب بانک</h3><p class="small">هر سطر: تاریخ، مبلغ (ریال؛ برداشت با منفی)، شماره پیگیری — با کاما، تب یا | جدا. مثال: <span class="ltr-num">۱۴۰۵/۰۷/۰۶, 500000000, 1234</span></p>
      <textarea class="input ltr" id="stmt" rows="4"></textarea><div class="actions"><button class="btn small" data-act="match">تطبیق خودکار</button></div><div id="mres"></div></section>
    <section class="tray bk-sec printable pr-sheet"><div class="bk-head"><h3 class="bk-h">گردش حساب در دفتر ${a.title}</h3><button class="btn small" data-act="save" disabled id="rsave">ذخیره تطبیق</button></div>
      <div class="scrollx"><table class="table-plain bk-table"><thead><tr><th>تطبیق</th><th>تاریخ</th><th>سند</th><th>طرف حساب</th><th>روش / پیگیری</th><th>واریز</th><th>برداشت</th><th>مانده</th></tr></thead><tbody>${r.rows.map((x) => html`<tr data-src="${x.id}" class="${x.reconciled ? 'ok' : ''}"><td><input type="checkbox" data-rc="${x.id}" ${x.reconciled ? 'checked' : ''} aria-label="تطبیق"></td><td>${jd(x.date)}</td><td>${x.doc ? html`<a href="/books/doc/${x.src}" data-link>${B.DOC_TYPES[x.doc.type]?.short ?? ''} ${fa(x.doc.no)}</a>` : ''}</td><td>${x.party ?? '—'}</td><td class="small">${x.refs.join('، ')}${x.reconRef ? html` · صورتحساب ${fa(x.reconRef)}` : ''}</td><td class="num">${x.amt > 0 ? money(x.amt) : ''}</td><td class="num">${x.amt < 0 ? money(-x.amt) : ''}</td><td class="num">${money(x.balance)}</td></tr>`)}</tbody></table></div></section>`);
  const refresh = () => ($('#rsave', root).disabled = !pend.size);
  root.addEventListener('change', (e) => {
    const c = e.target.closest('[data-rc]');
    if (!c) return;
    pend.set(c.dataset.rc, { on: c.checked, ref: pend.get(c.dataset.rc)?.ref ?? '' });
    refresh();
  });
  const map = {
    match: async (btn) => {
      const { rows, errors } = TR.parseStatement($('#stmt', root).value, parseDay);
      const box = $('#mres', root);
      if (!rows.length) return (box.innerHTML = String(html`<p class="err">سطر معتبری پیدا نشد${errors.length ? ` (${errors.join('، ')})` : ''}.</p>`));
      busy(btn, true);
      try {
        const m = await api(`/api/books/bank/${id}/match`, { method: 'POST', body: { rows } });
        for (const x of m.matches) {
          pend.set(x.book, { on: true, ref: m.rows[x.stmt].ref });
          const cb = $(`[data-rc="${x.book}"]`, root);
          if (cb) {
            cb.checked = true;
            cb.closest('tr').classList.add('hit');
          }
        }
        box.innerHTML = String(html`<p class="small">${fa(m.matches.length)} ردیف جفت شد (${fa(m.matches.filter((x) => x.byRef).length)} با شماره پیگیری). ${m.unmatchedStatement.length ? html`<b class="bad">${fa(m.unmatchedStatement.length)} سطر صورتحساب در دفتر نیست:</b> ${m.unmatchedStatement.map((i) => `${jd(m.rows[i].date)} ${money(m.rows[i].amt)}`).join('، ')}` : ''} ${errors.length ? `سطرهای ناخوانا: ${errors.join('، ')}` : ''} برای ثبت «ذخیره تطبیق» را بزنید.</p>`);
        refresh();
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        busy(btn, false);
      }
    },
    save: async (btn) => {
      busy(btn, true);
      try {
        await api(`/api/books/bank/${id}/recon`, { method: 'POST', body: { items: [...pend].map(([src, x]) => ({ src, ...x })) } });
        toast('تطبیق ذخیره شد.', 'ok');
        navigate(location.pathname, { replace: true });
      } catch (err) {
        toast(err.message, 'error');
        busy(btn, false);
      }
    },
  };
  wireExport(map, 'bn', `bank-${a.title}`, () => r.rows.map((x) => ({ date: jd(x.date), doc: x.doc ? `${B.DOC_TYPES[x.doc.type]?.short ?? ''} ${x.doc.no}` : '', party: x.party ?? '', refs: x.refs.join(' '), amt: x.amt, balance: x.balance, rec: x.reconciled ? 'بله' : '' })), [['date', 'تاریخ'], ['doc', 'سند'], ['party', 'طرف حساب'], ['refs', 'روش/پیگیری'], ['amt', 'مبلغ (ریال)'], ['balance', 'مانده'], ['rec', 'تطبیق']], 'بانک');
  actions(root, map);
}
