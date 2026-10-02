// راه‌اندازی فروشگاه — five short steps that put the shop's real state into the books once: identity, cash and banks,
// the vault (melt, coins, sealed bars, currency) with its cost, customers' balances, then a review with the totals.
// It books one opening document; every chart and report reads from it. Money is typed in the shop's display unit.
import { html, raw, api, fa, $, $$, toast, navigate, store } from '../core.mjs';
import { booksPrefs, prefs, TU, G, unitName, jd, today, parseDay, confirmBox } from '../bk.mjs';
import * as B from '../books.mjs';

const STEPS = [
  ['who', 'مشخصات فروشگاه'],
  ['money', 'صندوق و بانک'],
  ['vault', 'طلا، سکه، شمش، ارز'],
  ['people', 'مشتریان و مانده‌ها'],
  ['review', 'بازبینی و ثبت'],
];
const num = (v) => {
  const x = B.num(v);
  return Number.isFinite(x) ? x : 0;
};
const row = () => ({});

export async function setupPage(root) {
  await booksPrefs(true);
  const info = await api('/api/books/setup');
  if (info.done) {
    root.innerHTML = String(html`<section class="empty"><h1>راه‌اندازی انجام شده است</h1><p>تغییرات بعدی با سند ثبت می‌شود: خرید و فروش در میز معامله، اصلاح شمارش در گاوصندوق، مشتری تازه در بخش مشتریان.</p><a class="btn" href="/books" data-link>رفتن به حساب</a></section>`);
    return;
  }
  if (!info.canRun) {
    root.innerHTML = String(html`<section class="empty"><h1>راه‌اندازی فروشگاه</h1><p>${info.hasBooks ? 'این دفتر سند قطعی دارد؛ راه‌اندازی فقط برای دفتر خالی است.' : 'راه‌اندازی را مدیر یا مالک فروشگاه انجام می‌دهد.'}</p><a class="btn" href="/" data-link>خانه</a></section>`);
    return;
  }
  const k = prefs.money === 'rial' ? 1 : 10; // display unit → rial
  const S = {
    step: 0,
    identity: { ...info.identity, shopName: info.identity.shopName || store.me?.brand?.shopName || '' },
    edition: info.edition,
    money: info.money,
    date: today(),
    cash: [{ title: 'صندوق اصلی', amount: '' }],
    banks: [{ title: '', bank: '', card: '', sheba: '', amount: '' }],
    gold: { grams: '', avgPrice: '' },
    coins: info.coinTypes.map((c) => ({ coin: c.id, label: c.label, count: '', avgPrice: '' })),
    bars: [],
    fx: [],
    parties: [{ name: '', mobile: '', father: '', city: '', irr: '', irrSide: 'd', g: '', gSide: 'd', emami: '', emamiSide: 'd' }],
  };
  const liveG = info.prices.G750, liveCoin = info.prices.coins;
  const disp = (rial) => (rial ? B.faNum(Math.round(rial / k).toLocaleString('en-US')).replace(/,/g, '٬') : '');

  root.innerHTML = String(html`<div class="su">
    <header class="su-head"><div><span class="eyebrow">راه‌اندازی فروشگاه</span><h1>وضعیت امروز مغازه‌تان را یک بار وارد کنید</h1><p class="lead">از این پس هر عدد داشبورد، گاوصندوق، ریز حساب مشتری و سود و زیان از همین نقطه شروع می‌شود. همه مبالغ به ${unitName()} است. <a href="/help?ch=2" data-link>فیلم همین مرحله</a></p></div>
      <button class="btn ghost small" data-act="skip">بعداً؛ دفتر خالی شروع شود</button></header>
    <ol class="su-steps" id="suSteps"></ol>
    <form class="tray su-card" id="suForm" novalidate></form>
    <div class="su-nav"><button class="btn ghost" data-act="prev">قبلی</button><p class="err" id="suErr" role="alert"></p><button class="btn" data-act="next">بعدی</button></div></div>`);

  const form = $('#suForm', root);
  const stepBar = () => ($('#suSteps', root).innerHTML = STEPS.map(([key, l], i) => String(html`<li class="${i < S.step ? 'done' : i === S.step ? 'on' : ''}"><button type="button" data-go="${i}" ${i > S.step ? raw('disabled') : ''}><i>${fa(i + 1)}</i><span>${l}</span></button></li>`)).join(''));
  const moneyIn = (path, val, ph = '') => html`<input class="input ltr su-money" data-path="${path}" value="${val ?? ''}" inputmode="decimal" placeholder="${ph}" autocomplete="off"><small class="su-hint" data-hint="${path}"></small>`;
  const txtIn = (path, val, ph = '', cls = '') => html`<input class="input ${cls}" data-path="${path}" value="${val ?? ''}" placeholder="${ph}" autocomplete="off">`;

  function draw() {
    stepBar();
    $('[data-act=prev]', root).hidden = S.step === 0;
    $('[data-act=next]', root).textContent = S.step === STEPS.length - 1 ? 'ثبت نهایی و شروع کار' : 'بعدی';
    $('#suErr', root).textContent = '';
    const key = STEPS[S.step][0];
    if (key === 'who') {
      const i = S.identity;
      form.innerHTML = String(html`<h2>مشخصات فروشگاه</h2><p class="small">روی سربرگ فاکتور و رسید می‌آید. شماره اقتصادی و شناسه حافظه برای سامانه مودیان است و اگر هنوز ندارید خالی بگذارید.</p>
        <div class="su-grid">
          <label class="field">نام فروشگاه${txtIn('identity.shopName', i.shopName, 'مثلاً طلا و سکه امید')}</label>
          <label class="field">نام حقوقی / صاحب امتیاز${txtIn('identity.legalName', i.legalName)}</label>
          <label class="field">شماره اقتصادی${txtIn('identity.economicCode', i.economicCode, '', 'ltr')}</label>
          <label class="field">کد ملی / شناسه ملی${txtIn('identity.nationalId', i.nationalId, '', 'ltr')}</label>
          <label class="field">شناسه یکتای حافظه مالیاتی${txtIn('identity.memoryId', i.memoryId, '', 'ltr')}</label>
          <label class="field">تلفن${txtIn('identity.phone', i.phone, '', 'ltr')}</label>
          <label class="field">کد پستی${txtIn('identity.postal', i.postal, '', 'ltr')}</label>
          <label class="field su-wide">نشانی${txtIn('identity.address', i.address)}</label>
          <label class="field">نسخه کار<select class="input" data-path="edition"><option value="base" ${S.edition === 'base' ? 'selected' : ''}>پایه: سکه، آبشده، شمش، ارز</option><option value="full" ${S.edition === 'full' ? 'selected' : ''}>کامل: همراه فروش مصنوعات و مالیات</option></select></label>
          <label class="field">واحد نمایش پول<select class="input" data-path="money"><option value="rial" ${S.money === 'rial' ? 'selected' : ''}>ریال</option><option value="toman" ${S.money === 'toman' ? 'selected' : ''}>تومان</option></select></label>
          <label class="field">تاریخ شروع دفتر${html`<input class="input ltr" data-path="dateJ" value="${jd(S.date)}">`}<small class="su-hint">مانده‌ها «در پایان همین روز» ثبت می‌شوند.</small></label>
        </div>`);
    } else if (key === 'money') {
      form.innerHTML = String(html`<h2>صندوق‌های نقد و حساب‌های بانکی</h2><p class="small">موجودی امروز هر صندوق و مانده هر حساب بانکی را بنویسید. هر تعداد که دارید؛ بعداً هم می‌توانید اضافه کنید.</p>
        <h3 class="su-sub">صندوق نقد</h3>${S.cash.map((c, i) => html`<div class="su-row"><label class="field">نام صندوق${txtIn(`cash.${i}.title`, c.title)}</label><label class="field">موجودی (${unitName()})${moneyIn(`cash.${i}.amount`, c.amount)}</label><button type="button" class="iconbtn" data-del="cash.${i}" aria-label="حذف">✕</button></div>`)}
        <button type="button" class="chip" data-add="cash">+ صندوق دیگر</button>
        <h3 class="su-sub">حساب بانکی</h3>${S.banks.map((c, i) => html`<div class="su-row b"><label class="field">عنوان${txtIn(`banks.${i}.title`, c.title, 'مثلاً ملت جاری')}</label><label class="field">بانک${txtIn(`banks.${i}.bank`, c.bank)}</label><label class="field">شماره کارت${txtIn(`banks.${i}.card`, c.card, '', 'ltr')}</label><label class="field">مانده (${unitName()})${moneyIn(`banks.${i}.amount`, c.amount)}</label><button type="button" class="iconbtn" data-del="banks.${i}" aria-label="حذف">✕</button></div>`)}
        <button type="button" class="chip" data-add="banks">+ حساب بانکی دیگر</button>`);
    } else if (key === 'vault') {
      form.innerHTML = String(html`<h2>موجودی گاوصندوق</h2><p class="small">آنچه امروز فیزیکی در مغازه است. «میانگین بها» همان قیمتی است که خریده‌اید؛ سود و زیان هر فروش از روی آن حساب می‌شود. اگر نمی‌دانید، دکمه «قیمت امروز» را بزنید.</p>
        <h3 class="su-sub">طلای آبشده</h3>
        <div class="su-row"><label class="field">وزن (گرم ۷۵۰)${html`<input class="input ltr su-num" data-path="gold.grams" value="${S.gold.grams}" inputmode="decimal" placeholder="۰٫۰۰۰">`}</label><label class="field">میانگین بهای هر گرم (${unitName()})${moneyIn('gold.avgPrice', S.gold.avgPrice)}</label><button type="button" class="chip" data-live="gold">قیمت امروز: ${TU(liveG)}</button></div>
        <h3 class="su-sub">سکه</h3>
        <div class="su-coins">${S.coins.map((c, i) => html`<div class="su-coin"><b>${c.label}</b><label class="field">تعداد${html`<input class="input ltr su-num" data-path="coins.${i}.count" value="${c.count}" inputmode="numeric">`}</label><label class="field">میانگین بها (${unitName()})${moneyIn(`coins.${i}.avgPrice`, c.avgPrice)}</label>${liveCoin[c.coin] ? html`<button type="button" class="chip" data-live="coin" data-i="${i}">امروز ${TU(liveCoin[c.coin])}</button>` : ''}</div>`)}</div>
        <h3 class="su-sub">شمش پلمپ</h3>${S.bars.map((b, i) => html`<div class="su-row bar"><label class="field">سریال${txtIn(`bars.${i}.serial`, b.serial, 'NV-12345', 'ltr')}</label><label class="field">وزن (گرم)${html`<input class="input ltr su-num" data-path="bars.${i}.weight" value="${b.weight ?? ''}" inputmode="decimal">`}</label><label class="field">عیار${html`<input class="input ltr su-num" data-path="bars.${i}.fineness" value="${b.fineness ?? 995}" inputmode="numeric">`}</label><label class="field">سازنده${txtIn(`bars.${i}.brand`, b.brand)}</label><label class="field">بهای خرید (${unitName()})${moneyIn(`bars.${i}.cost`, b.cost)}</label><button type="button" class="iconbtn" data-del="bars.${i}" aria-label="حذف">✕</button></div>`)}
        <button type="button" class="chip" data-add="bars">+ شمش</button>
        <h3 class="su-sub">ارز</h3>${S.fx.map((f, i) => html`<div class="su-row"><label class="field">ارز<select class="input" data-path="fx.${i}.code">${info.fxCodes.map((c) => html`<option value="${c.id}" ${f.code === c.id ? 'selected' : ''}>${c.label}</option>`)}</select></label><label class="field">مقدار${html`<input class="input ltr su-num" data-path="fx.${i}.amount" value="${f.amount ?? ''}" inputmode="decimal">`}</label><label class="field">نرخ خرید هر واحد (${unitName()})${moneyIn(`fx.${i}.rate`, f.rate)}</label><button type="button" class="iconbtn" data-del="fx.${i}" aria-label="حذف">✕</button></div>`)}
        <button type="button" class="chip" data-add="fx">+ ارز</button>`);
    } else if (key === 'people') {
      form.innerHTML = String(html`<h2>مشتریان و مانده حساب‌شان</h2><p class="small">«بدهکار» یعنی مشتری به شما بدهکار است (مطالبه)، «بستانکار» یعنی شما به او بدهکارید (تعهد). طلای امانی مشتری نزد شما = بستانکار جنسی. هم‌نام‌ها را با نام پدر، شهر یا موبایل جدا کنید.</p>
        <details class="su-paste"><summary>چسباندن فهرست از اکسل</summary><p class="small">هر خط: نام، موبایل، مانده ${unitName()} (بدهکار مثبت، بستانکار منفی)، مانده طلا به گرم ۷۵۰ (بدهکار مثبت). با کاما یا Tab جدا کنید.</p><textarea class="input" id="suPaste" rows="4" placeholder="رضا تهرانی، 09121234567، 300000000، -10"></textarea><button type="button" class="chip" data-act="paste">افزودن به فهرست</button></details>
        <div class="su-people">${S.parties.map((p, i) => html`<div class="su-person"><div class="su-p1"><label class="field">نام و نام خانوادگی${txtIn(`parties.${i}.name`, p.name)}</label><label class="field">موبایل${txtIn(`parties.${i}.mobile`, p.mobile, '09…', 'ltr')}</label><label class="field">نام پدر${txtIn(`parties.${i}.father`, p.father)}</label><label class="field">شهر${txtIn(`parties.${i}.city`, p.city)}</label><button type="button" class="iconbtn" data-del="parties.${i}" aria-label="حذف">✕</button></div>
          <div class="su-p2">${side(`parties.${i}.irrSide`, p.irrSide)}<label class="field">مانده مالی (${unitName()})${moneyIn(`parties.${i}.irr`, p.irr)}</label>${side(`parties.${i}.gSide`, p.gSide)}<label class="field">مانده جنسی طلا (گرم ۷۵۰)${html`<input class="input ltr su-num" data-path="parties.${i}.g" value="${p.g}" inputmode="decimal">`}</label>${side(`parties.${i}.emamiSide`, p.emamiSide)}<label class="field">سکه امامی (عدد)${html`<input class="input ltr su-num" data-path="parties.${i}.emami" value="${p.emami}" inputmode="numeric">`}</label></div></div>`)}</div>
        <button type="button" class="chip" data-add="parties">+ مشتری</button>`);
    } else {
      const t = totals();
      form.innerHTML = String(html`<h2>بازبینی</h2><p class="small">این اعداد یک «سند افتتاحیه» با کد رهگیری می‌سازند. پس از ثبت، تغییر فقط با سند اصلاحی ممکن است و در تاریخچه می‌ماند.</p>
        <dl class="su-sum">
          <div><dt>نقد در صندوق‌ها</dt><dd>${TU(t.cash)}</dd></div><div><dt>مانده بانک‌ها</dt><dd>${TU(t.bank)}</dd></div>
          <div><dt>طلای آبشده</dt><dd>${G(t.gold)} گرم</dd></div><div><dt>سکه</dt><dd>${fa(t.coins)} عدد</dd></div>
          <div><dt>شمش پلمپ</dt><dd>${fa(t.bars)} شمش · ${G(t.barG)} گرم ۷۵۰</dd></div><div><dt>ارز</dt><dd>${t.fx ? t.fxText : '—'}</dd></div>
          <div><dt>مطالبات مالی از مشتریان</dt><dd class="pos">${TU(t.recv)}</dd></div><div><dt>بدهی مالی به مشتریان</dt><dd class="neg">${TU(t.pay)}</dd></div>
          <div><dt>طلب طلایی از مشتریان</dt><dd>${G(t.gRecv)} گرم</dd></div><div><dt>طلای امانی مشتریان نزد شما</dt><dd>${G(t.gPay)} گرم</dd></div>
          <div class="su-est"><dt>برآورد ارزش خالص با قیمت امروز ${info.prices.sample ? '(قیمت نمونه؛ فید زنده وصل نیست)' : ''}</dt><dd>${TU(t.worth)}</dd></div>
        </dl>
        <p class="small">${fa(t.people)} مشتری · ${fa(t.accounts)} صندوق و حساب بانکی · تاریخ دفتر ${jd(S.date)}${t.noCost ? html` · <b class="warn">برای ${fa(t.noCost)} قلم بها وارد نشده؛ سود و زیان آن اقلام تا خرید بعدی تقریبی است.</b>` : ''}</p>`);
    }
    for (const el of $$('[data-path]', form)) hint(el);
    $('input, select', form)?.focus({ preventScroll: true });
  }
  const side = (path, v) => html`<select class="input su-side" data-path="${path}" aria-label="جهت مانده"><option value="d" ${v === 'd' ? 'selected' : ''}>بدهکار</option><option value="c" ${v === 'c' ? 'selected' : ''}>بستانکار</option></select>`;
  function hint(el) {
    const h = $(`[data-hint="${el.dataset.path}"]`, form);
    if (!h) return;
    const v = num(el.value);
    h.textContent = v ? `${B.words(Math.round(v))} ${unitName()}` : '';
  }
  const setPath = (path, v) => {
    const parts = path.split('.');
    if (path === 'dateJ') return (S.date = parseDay(v) ?? S.date);
    let o = S;
    for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]];
    o[parts.at(-1)] = v;
  };

  function payload() {
    const rial = (v) => Math.round(num(v) * k);
    return {
      identity: S.identity,
      edition: S.edition,
      money: S.money,
      date: S.date,
      cash: S.cash.filter((c) => c.title?.trim()).map((c) => ({ title: c.title, amount: rial(c.amount) })),
      banks: S.banks.filter((c) => c.title?.trim()).map((c) => ({ title: c.title, bank: c.bank, card: c.card, amount: rial(c.amount) })),
      gold: { grams: num(S.gold.grams), avgPrice: rial(S.gold.avgPrice) },
      coins: S.coins.filter((c) => num(c.count)).map((c) => ({ coin: c.coin, count: num(c.count), avgPrice: rial(c.avgPrice) })),
      bars: S.bars.filter((b) => b.serial?.trim()).map((b) => ({ serial: b.serial, weight: num(b.weight), fineness: num(b.fineness) || 995, brand: b.brand, cost: rial(b.cost) })),
      fx: S.fx.filter((f) => num(f.amount)).map((f) => ({ code: f.code, amount: num(f.amount), rate: rial(f.rate) })),
      parties: S.parties.filter((p) => p.name?.trim()).map((p) => {
        const sg = (v, sd) => (num(v) ? (sd === 'c' ? -1 : 1) * Math.abs(num(v)) : 0);
        const bal = { IRR: sg(p.irr, p.irrSide) * k, G750: sg(p.g, p.gSide), 'COIN:emami': sg(p.emami, p.emamiSide) };
        return { name: p.name, mobile: p.mobile, father: p.father, city: p.city, balances: Object.fromEntries(Object.entries(bal).filter(([, v]) => v).map(([u, v]) => [u, u === 'IRR' ? Math.round(v) : v])) };
      }),
    };
  }
  function totals() {
    const p = payload();
    const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
    const party = (u, sign) => sum(p.parties, (x) => (sign * (x.balances[u] ?? 0) > 0 ? Math.abs(x.balances[u]) : 0));
    const barG = sum(p.bars, (b) => (b.weight * b.fineness) / 750);
    const t = {
      cash: sum(p.cash, (x) => x.amount), bank: sum(p.banks, (x) => x.amount), gold: p.gold.grams, coins: sum(p.coins, (c) => c.count), bars: p.bars.length, barG,
      fx: p.fx.length, fxText: p.fx.map((f) => `${B.faNum(f.amount)} ${info.fxCodes.find((c) => c.id === f.code)?.label}`).join('، '),
      recv: party('IRR', 1), pay: party('IRR', -1), gRecv: party('G750', 1), gPay: party('G750', -1), people: p.parties.length, accounts: p.cash.length + p.banks.length,
      noCost: (p.gold.grams && !p.gold.avgPrice ? 1 : 0) + p.coins.filter((c) => !c.avgPrice).length + p.bars.filter((b) => !b.cost).length,
    };
    const coinWorth = sum(p.coins, (c) => c.count * (liveCoin[c.coin] ?? c.avgPrice ?? 0));
    const fxWorth = sum(p.fx, (f) => f.amount * (info.prices.fx[f.code] ?? f.rate ?? 0));
    t.worth = Math.round(t.cash + t.bank + (t.gold + barG + t.gRecv - t.gPay) * liveG + coinWorth + fxWorth + t.recv - t.pay);
    return t;
  }

  /* ---------------- interactions ---------------- */
  form.addEventListener('input', (e) => {
    const el = e.target.closest('[data-path]');
    if (!el) return;
    setPath(el.dataset.path, el.value);
    hint(el);
  });
  form.addEventListener('change', (e) => {
    const el = e.target.closest('select[data-path]');
    if (el) setPath(el.dataset.path, el.value);
  });
  form.addEventListener('submit', (e) => e.preventDefault());
  root.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act],[data-add],[data-del],[data-go],[data-live]');
    if (!b) return;
    if (b.dataset.add) {
      const list = S[b.dataset.add];
      list.push(b.dataset.add === 'parties' ? { name: '', mobile: '', father: '', city: '', irr: '', irrSide: 'd', g: '', gSide: 'd', emami: '', emamiSide: 'd' } : b.dataset.add === 'fx' ? { code: 'USD', amount: '', rate: '' } : b.dataset.add === 'bars' ? { serial: '', weight: '', fineness: 995, brand: '', cost: '' } : row());
      draw();
      return $$('.su-row, .su-person', form).at(-1)?.querySelector('input')?.focus();
    }
    if (b.dataset.del) {
      const [list, i] = b.dataset.del.split('.');
      S[list].splice(Number(i), 1);
      return draw();
    }
    if (b.dataset.go) {
      S.step = Number(b.dataset.go);
      return draw();
    }
    if (b.dataset.live === 'gold') {
      S.gold.avgPrice = String(Math.round(liveG / k));
      return draw();
    }
    if (b.dataset.live === 'coin') {
      const c = S.coins[Number(b.dataset.i)];
      c.avgPrice = String(Math.round(liveCoin[c.coin] / k));
      return draw();
    }
    const act = b.dataset.act;
    if (act === 'prev' && S.step > 0) {
      S.step--;
      return draw();
    }
    if (act === 'paste') {
      const lines = $('#suPaste', form).value.split(/\n+/).map((l) => l.split(/[,،\t]/).map((x) => x.trim())).filter((x) => x[0]);
      for (const [name, mobile = '', irr = '', g = ''] of lines) {
        const i = num(irr), gg = num(g);
        S.parties.push({ name, mobile, father: '', city: '', irr: i ? String(Math.abs(i)) : '', irrSide: i < 0 ? 'c' : 'd', g: gg ? String(Math.abs(gg)) : '', gSide: gg < 0 ? 'c' : 'd', emami: '', emamiSide: 'd' });
      }
      S.parties = S.parties.filter((p, idx) => p.name || idx === S.parties.length - 1);
      toast(`${fa(lines.length)} مشتری اضافه شد.`, 'ok');
      return draw();
    }
    if (act === 'skip') {
      if (!(await confirmBox('دفتر خالی شروع شود؟', 'مانده‌ها را بعداً فقط با سند افتتاحیه یا اصلاحی می‌شود وارد کرد.', { ok: 'شروع با دفتر خالی' }))) return;
      await api('/api/books/setup/skip', { method: 'POST' });
      store.me = null;
      return navigate('/books', { replace: true });
    }
    if (act === 'next') {
      const err = validate();
      if (err) return ($('#suErr', root).textContent = err);
      if (S.step < STEPS.length - 1) {
        S.step++;
        return draw();
      }
      b.disabled = true;
      try {
        const r = await api('/api/books/setup', { method: 'POST', body: payload() });
        store.me = null;
        await booksPrefs(true);
        root.innerHTML = String(html`<section class="su-done tray"><span class="eyebrow">آماده است</span><h1>دفتر فروشگاه باز شد</h1><p>${r.doc ? html`سند افتتاحیه با کد رهگیری <b class="ltr-num">${r.doc.track}</b> ثبت شد: ${fa(r.counts.balances)} مانده، ${fa(r.counts.parties)} مشتری، ${fa(r.counts.accounts)} صندوق و حساب.` : 'دفتر خالی باز شد.'}</p>
          <div class="actions"><a class="btn" href="/books/dashboard" data-link>داشبورد مدیریت</a><a class="btn ghost" href="/books/desk" data-link>اولین معامله</a><a class="btn ghost" href="/books/vault" data-link>گاوصندوق</a><a class="btn ghost" href="/help?ch=3" data-link>فیلم آموزش گام بعد</a></div></section>`);
      } catch (err) {
        $('#suErr', root).textContent = err.message;
        b.disabled = false;
      }
    }
  });
  function validate() {
    const key = STEPS[S.step][0];
    if (key === 'who' && String(S.identity.shopName ?? '').trim().length < 2) return 'نام فروشگاه را بنویسید.';
    if (key === 'money') for (const c of [...S.cash, ...S.banks]) if (num(c.amount) && !String(c.title ?? '').trim()) return 'برای هر مبلغ، نام صندوق یا حساب را هم بنویسید.';
    if (key === 'vault') for (const b of S.bars) if (b.serial?.trim() && !(num(b.weight) > 0)) return `وزن شمش ${b.serial} را بنویسید.`;
    if (key === 'people') for (const p of S.parties) if (!p.name?.trim() && (num(p.irr) || num(p.g) || num(p.emami))) return 'برای هر مانده نام مشتری را هم بنویسید.';
    return '';
  }
  draw();
}
