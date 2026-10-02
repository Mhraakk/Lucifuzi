// کنترل — the owner's control room (spec docs/specs/0002-control.md). One page, clear tabs, each tool says in one line
// what it is for and links its video, so neither the owner nor the operator gets lost. Nothing here books anything:
// the simulator is a preview; locks, approvals and auto-close change only control settings.
import { html, raw, api, fa, $, $$, toast, store, busy } from '../core.mjs';
import { booksPrefs, jd, today, parseDay, timeFa, confirmBox, unitLabel, R } from '../bk.mjs';
import { booksNav } from './books.mjs';
import { shownCoins, TRADE_COINS as COIN_TYPES } from '../coins.mjs';
import { convert, parseFineness } from '../karat.mjs';

const TABS = [
  ['overview', 'نمای کلی', 'نبض، تغییرات و همه ابزارها در یک نگاه', 13],
  ['exceptions', 'استثناها', 'فقط چیزهای عجیب و خطرناک؛ بقیه را لازم نیست ببینید', 15],
  ['simulate', 'شبیه‌ساز و فروش امن', 'پیش از ثبت ببینید نقد، موجودی و بدهی چه می‌شود و حکم امن‌بودن را بگیرید', 14],
  ['twin', 'دوقلو و ماشین زمان', 'وضعیت دقیق فروشگاه در پایان هر روز، زنده یا گذشته', 16],
  ['lots', 'سری‌ها', 'هر خرید یک سری؛ کدام مانده، کجا رفته و چقدر سود داده', 16],
  ['story', 'تایم‌لاین', 'داستان کامل حساب هر مشتری یا کالا', 16],
  ['trial', 'تراز دوتایی', 'هر حساب با دو بعد جدا: وزنی و ریالی', 17],
  ['forecast', 'پیش‌بینی ۱۰ روزه', 'نقد و طلای ۱۰ روز آینده با چک‌های سررسید', 17],
  ['approvals', 'تأییدها', 'کارهای حساس با تأیید مدیر دیگر (چهار چشم)', 15],
  ['periods', 'قفل دوره', 'ماه بسته‌شده فقط با سند اصلاحی عوض می‌شود', 17],
  ['close', 'بستن خودکار', 'تطبیق شبانه؛ فقط مغایرت‌ها را نشان می‌دهد', 17],
  ['karat', 'تبدیل عیار', 'هر وزن و عیار به خالص، ۷۵۰ و مثقال', 17],
];
const STATE_FA = { calm: 'آرام', watch: 'نیاز به نگاه', alarm: 'هشدار', safe: 'امن', caution: 'با احتیاط', stop: 'ثبت نکنید' };
const pct = (x) => `${fa(Math.round((x ?? 0) * 100))}٪`;
const G = (v) => `${fa((Math.round((v ?? 0) * 1000) / 1000).toFixed(3)).replace('.', '٫')}`;
const why = (metric, day = '') => html`<button class="ctl-why" data-explain="${metric}" ${day ? raw(`data-day="${day}"`) : ''} title="این عدد از کجا آمد؟" aria-label="این عدد از کجا آمد؟">؟</button>`;
const probBar = (p, keys) => html`<div class="ctl-prob" role="img" aria-label="${keys.map((k) => `${STATE_FA[k]} ${pct(p[k])}`).join('، ')}">${keys.map((k) => html`<i class="p-${k}" style="--w:${Math.max(0.5, p[k] * 100)}%" title="${STATE_FA[k]} ${pct(p[k])}"></i>`)}</div>`;
const typed = (d, keys) => html`<div class="ctl-typed st-${d.choice}"><b>${STATE_FA[d.choice]}</b>${probBar(d.probabilities, keys)}<small>${keys.map((k) => `${STATE_FA[k]} ${pct(d.probabilities[k])}`).join(' · ')} · اطمینان ${pct(d.confidence)} · پوشش داده ${pct(d.coverage)}</small></div>`;

export async function controlPage(root) {
  await booksPrefs();
  const admin = store.isAdmin();
  const owner = store.me?.user?.role === 'owner';
  const params = new URLSearchParams(location.search);
  let tab = TABS.some(([k]) => k === params.get('t')) ? params.get('t') : 'overview';
  if (!admin && !['karat', 'approvals'].includes(tab)) tab = 'karat';
  const shown = TABS.filter(([k]) => admin || k === 'karat' || k === 'approvals');
  root.innerHTML = String(html`${booksNav('control')}<section class="ctl">
    <header class="ctl-head"><div><h1>کنترل</h1><p class="lead">به‌جای غرق شدن در همه‌چیز، فقط سراغ آنچه مهم است بروید. هر عدد این‌جا دکمه «؟» دارد که می‌گوید از کجا آمده. جستجوی سریع: <kbd>Ctrl</kbd>+<kbd>K</kbd></p></div></header>
    <nav class="tabs ctl-tabs" role="tablist" aria-label="ابزارهای کنترل">${shown.map(([k, l]) => html`<button role="tab" data-tab="${k}" aria-selected="${k === tab}">${l}</button>`)}</nav>
    <p class="ctl-purpose" id="ctlPurpose"></p>
    <div id="ctlBody" class="ctl-body"><div class="loading"><span></span></div></div></section>`);
  const body = $('#ctlBody', root);
  const setTab = (k) => {
    tab = k;
    history.replaceState(null, '', `/books/control${k === 'overview' ? '' : `?t=${k}`}`);
    for (const b of $$('[data-tab]', root)) b.setAttribute('aria-selected', String(b.dataset.tab === k));
    const t = TABS.find(([x]) => x === k);
    $('#ctlPurpose', root).innerHTML = String(html`${t[2]}${t[3] ? html` · <a href="/help?ch=${t[3]}" data-link>فیلم این بخش</a>` : ''}`);
    body.onclick = null; // each view installs its own handler
    body.innerHTML = '<div class="loading"><span></span></div>';
    (VIEWS[k] ?? VIEWS.overview)().catch((e) => (body.innerHTML = String(html`<p class="err">${e.message}</p>`)));
  };
  root.addEventListener('click', (e) => {
    const t = e.target.closest('[data-tab]');
    if (t && t.closest('.ctl-tabs')) setTab(t.dataset.tab);
    const go = e.target.closest('[data-go]');
    if (go) setTab(go.dataset.go);
  });

  /* ------------------------------------------------------------------ نمای کلی */
  async function overview() {
    const [p, c, ex, ap] = await Promise.all([api('/api/books/control/pulse'), api('/api/books/control/changes'), api('/api/books/control/exceptions'), api('/api/books/control/approvals')]);
    const pending = ap.items.filter((a) => a.status === 'pending').length;
    body.innerHTML = String(html`<div class="ctl-sig">
      <article class="tray ctl-pulse st-${p.state}"><header><h2>نبض طلا</h2>${why('pulse')}</header><p class="ctl-sentence">${p.sentence}</p>${typed(p, ['calm', 'watch', 'alarm'])}
        <ul class="ctl-drivers">${p.drivers.map((d) => html`<li class="${d.available ? '' : 'na'}"><a href="${d.href}" data-link><i style="--s:${d.score}"></i><span>${d.text}</span><small>${d.available ? `امتیاز ${pct(d.score)} · وزن ${fa(d.weight)}` : 'بی‌داده'}</small></a></li>`)}</ul></article>
      <article class="tray ctl-chg"><header><h2>چه تغییر کرد؟</h2>${c.items.length ? html`<button class="btn ghost small" data-act="seen">دیدم</button>` : ''}</header>
        <p class="small">${c.first ? 'در ۲۴ ساعت گذشته' : `از ${jd(c.since.slice(0, 10))} ساعت ${timeFa(c.since)}`}</p>
        ${c.items.length ? html`<ol class="ctl-chg-list">${c.items.map((x) => html`<li class="c-${x.icon}"><a href="${x.href}" data-link><b>${x.title}</b><span>${x.detail}</span></a></li>`)}</ol>` : html`<p class="ctl-empty">تغییر مهمی نبوده است.</p>`}</article></div>
      <div class="ctl-cards">${TABS.filter(([k]) => k !== 'overview').map(([k, l, d]) => html`<button class="ctl-card" data-go="${k}"><b>${l}</b><span>${d}</span>${k === 'exceptions' && ex.items.length ? html`<em class="bad">${fa(ex.items.length)}</em>` : ''}${k === 'approvals' && pending ? html`<em class="bad">${fa(pending)}</em>` : ''}</button>`)}</div>`);
    $('[data-act=seen]', body)?.addEventListener('click', async () => {
      await api('/api/books/control/changes/seen', { method: 'POST' });
      overview();
    });
  }

  /* ------------------------------------------------------------------ استثناها */
  async function exceptions() {
    const [r, cal] = await Promise.all([api('/api/books/control/exceptions'), api('/api/books/control/exceptions/calibration')]);
    const SEV = { high: 'جدی', mid: 'متوسط', low: 'کم' };
    body.innerHTML = String(html`<div class="ctl-exc-head"><div class="ctl-kpis"><div><small>جدی</small><b class="bad">${fa(r.count.high)}</b></div><div><small>متوسط</small><b>${fa(r.count.mid)}</b></div><div><small>کم</small><b>${fa(r.count.low)}</b></div></div>
        <p class="small">احتمال کنار هر مورد یعنی «چقدر محتمل است واقعاً مشکل باشد»؛ ${r.calibrated ? html`<b>کالیبره‌شده</b> با داوری‌های خود شما` : 'هنوز خام است؛ با داوری «واقعی / هشدار کاذب» دقیق‌تر می‌شود'}.</p></div>
      ${r.items.length ? html`<ul class="ctl-exc">${r.items.map((x) => html`<li class="sev-${x.sev}" data-key="${x.key}"><div class="ctl-exc-p"><b>${pct(x.p)}</b><small>${SEV[x.sev]}</small></div><div class="ctl-exc-b"><b>${x.title}</b><p>${x.detail}</p>${x.href ? html`<a href="${x.href}" data-link>باز کردن</a>` : ''}</div>
          <div class="ctl-exc-a"><button class="btn small" data-label="1">واقعی بود</button><button class="btn ghost small" data-label="0">هشدار کاذب</button><button class="btn ghost small" data-snooze>یک هفته بعد</button></div></li>`)}</ul>` : html`<p class="ctl-empty">✓ هیچ استثنای بازی نیست. خیالتان راحت.</p>`}
      <details class="tray ctl-cal"><summary>کالیبراسیون احتمال‌ها (${fa(cal.labels)} داوری)</summary>
        <p class="small">ایده از روش «typesafe»: اول بسنجیم (AUC: آیا قواعد اصلاً تمایز دارند؟ ECE: آیا عدد احتمال درست است؟)، بعد با دو عدد (Platt) مقیاس را روی داوری‌های شما تصحیح کنیم و روی نیمه‌ای که در برازش نبوده بسنجیم. اگر بهتر نشد، اعمال نمی‌شود.</p>
        ${cal.raw ? html`<table class="table"><tbody><tr><td>AUC (قدرت تمایز)</td><td class="num">${fa(cal.raw.auc?.toFixed?.(2) ?? '—')}</td></tr><tr><td>ECE (خطای مقیاس)</td><td class="num">${fa(cal.raw.ece.toFixed(3))}</td></tr><tr><td>واقعی / کاذب</td><td class="num">${fa(cal.real)} / ${fa(cal.falseAlarms)}</td></tr></tbody></table>` : ''}
        ${cal.current ? html`<p class="small">کالیبراسیون فعال از ${jd(cal.current.at.slice(0, 10))} روی ${fa(cal.current.n)} داوری: ECE آزمون ${fa(cal.current.heldOut.before.ece.toFixed(3))} → ${fa(cal.current.heldOut.after.ece.toFixed(3))}</p>` : ''}
        ${cal.refused ? html`<p class="err">${cal.refused}</p>` : ''}
        <button class="btn small" data-act="fit" ${cal.ready ? '' : raw('disabled')}>برازش کالیبراسیون</button>${cal.ready ? '' : html` <small>دست‌کم ۲۰ داوری (۳ واقعی و ۳ کاذب) لازم است.</small>`}</details>`);
    body.onclick = excClick;
  }
  async function excClick(e) {
    const li = e.target.closest('[data-key]');
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.act === 'fit') {
      busy(b, true);
      try {
        const r = await api('/api/books/control/exceptions/calibration', { method: 'POST' });
        toast(r.applied ? `کالیبره شد: ECE ${r.before.ece.toFixed(3)} → ${r.after.ece.toFixed(3)}` : r.reason, r.applied ? 'ok' : 'info');
        exceptions();
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        busy(b, false);
      }
      return;
    }
    if (!li || (!b.dataset.label && !('snooze' in b.dataset))) return;
    const payload = 'snooze' in b.dataset ? { key: li.dataset.key, status: 'snoozed', days: 7 } : { key: li.dataset.key, status: 'resolved', real: b.dataset.label === '1' };
    try {
      await api('/api/books/control/exceptions/label', { method: 'POST', body: payload });
      li.classList.add('done');
      setTimeout(() => li.remove(), 250);
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  /* ------------------------------------------------------------------ شبیه‌ساز و فروش امن */
  async function simulate() {
    const coins = shownCoins();
    body.innerHTML = String(html`<form class="tray ctl-sim" id="simF" autocomplete="off">
      <div class="ctl-sim-row"><label class="field">مشتری (اختیاری)<input class="input" name="pq" placeholder="نام یا کد مشتری…"><input type="hidden" name="partyId"></label><div class="ctl-picks" id="simPicks"></div></div>
      <div class="ctl-sim-row">
        <label class="field">جهت<select class="input" name="dir"><option value="out">فروش به مشتری</option><option value="in">خرید از مشتری</option></select></label>
        <label class="field">کالا<select class="input" name="kind"><option value="melt">آبشده</option>${coins.map(([k, c]) => html`<option value="coin:${k}">${c.short}</option>`)}</select></label>
        <label class="field melt">وزن (گرم)<input class="input ltr" name="weight" inputmode="decimal" value="2"></label>
        <label class="field melt">عیار<input class="input ltr" name="fineness" inputmode="decimal" value="750"></label>
        <label class="field melt">مظنه (ریال)<input class="input ltr" name="mazaneh" inputmode="numeric"></label>
        <label class="field coin" hidden>تعداد<input class="input ltr" name="count" inputmode="numeric" value="1"></label>
        <label class="field coin" hidden>قیمت هر عدد (ریال)<input class="input ltr" name="price" inputmode="numeric"></label>
      </div>
      <div class="ctl-sim-row"><label class="field">پرداخت<select class="input" name="method"><option value="">روی حساب مشتری (بدون پرداخت)</option><option value="cash">نقد</option><option value="pos">کارتخوان</option><option value="c2c">کارت به کارت</option></select></label><label class="field">مبلغ پرداخت (ریال)<input class="input ltr" name="amount" inputmode="numeric"></label>
        <button class="btn" data-act="run">محاسبه فروش امن</button></div>
      <p class="small">هیچ چیزی ثبت نمی‌شود؛ همان موتوری که سند را ثبت می‌کند اثر را حساب می‌کند.</p></form><div id="simOut"></div>`);
    const f = $('#simF', body);
    try {
      const m = await api('/api/market');
      const mz = m.items.find((x) => x.id === 'mesghal');
      if (mz && !mz.empty) f.mazaneh.value = String(mz.c * 10);
    } catch {
      /* no market */
    }
    const kindUi = () => {
      const coin = f.kind.value.startsWith('coin:');
      for (const el of $$('.melt', f)) el.hidden = coin;
      for (const el of $$('.coin', f)) el.hidden = !coin;
    };
    f.kind.addEventListener('change', kindUi);
    partyPicker(f, $('#simPicks', body));
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const n = (v) => Number(String(v ?? '').replace(/[٬,\s]/g, '').replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
      const coin = f.kind.value.startsWith('coin:') ? f.kind.value.slice(5) : null;
      const line = coin ? { kind: 'coin', dir: f.dir.value, coin, count: n(f.count.value), price: n(f.price.value) } : { kind: 'melt', dir: f.dir.value, weight: n(f.weight.value), fineness: n(f.fineness.value), mazaneh: n(f.mazaneh.value) };
      const payments = f.method.value && n(f.amount.value) ? [{ method: f.method.value, dir: f.dir.value === 'out' ? 'in' : 'out', amount: n(f.amount.value) }] : [];
      const btn = e.submitter;
      busy(btn, true);
      try {
        const r = await api('/api/books/control/simulate', { method: 'POST', body: { partyId: f.partyId.value || null, lines: [line], payments } });
        drawSim(r);
      } catch (err) {
        $('#simOut', body).innerHTML = String(html`<p class="err">${err.message}</p>`);
      } finally {
        busy(btn, false);
      }
    });
  }
  function drawSim(r) {
    const row = (label, b, a, fmt) => html`<tr><td>${label}</td><td class="num">${fmt(b)}</td><td class="num">${fmt(a)}</td><td class="num ${a - b > 0 ? 'pos' : a - b < 0 ? 'neg' : ''}">${a - b > 0 ? '+' : a - b < 0 ? '−' : ''}${fmt(Math.abs(a - b))}</td></tr>`;
    const coinKeys = [...new Set([...Object.keys(r.before.coins), ...Object.keys(r.after.coins)])];
    const partyUnits = r.before.party || r.after.party ? [...new Set([...Object.keys(r.before.party ?? {}), ...Object.keys(r.after.party ?? {})])] : [];
    $('#simOut', body).innerHTML = String(html`<article class="tray ctl-verdict st-${r.verdict.choice}"><h2>${r.summary}</h2>${typed(r.verdict, ['safe', 'caution', 'stop'])}
      <ul class="ctl-checks">${r.checks.map((c) => html`<li class="lv-${c.level}${c.available ? '' : ' na'}"><i aria-hidden="true">${c.ok ? '✓' : c.level === 'stop' ? '✕' : '!'}</i>${c.text}</li>`)}</ul>
      ${r.profit ? html`<p class="ctl-profit">سود تقریبی این فروش: <b class="${r.profit.profit >= 0 ? 'pos' : 'neg'}">${R(r.profit.profit)}</b> <small>(مبلغ ${R(r.profit.value)} − بهای سری‌ها ${R(r.profit.cost)} · ${r.profit.method})</small></p>` : ''}
      <div class="scrollx"><table class="table ctl-ba"><thead><tr><th></th><th>الان</th><th>پس از معامله</th><th>تغییر</th></tr></thead><tbody>
        ${row('نقد صندوق', r.before.cash, r.after.cash, R)}${row('بانک', r.before.bank, r.after.bank, R)}${row('طلای آبشده (گرم ۷۵۰)', r.before.gold, r.after.gold, G)}
        ${coinKeys.map((k) => row(`سکه ${COIN_TYPES[k]?.short ?? k}`, r.before.coins[k] ?? 0, r.after.coins[k] ?? 0, fa))}
        ${partyUnits.map((u) => row(`مانده مشتری · ${unitLabel(u)}`, r.before.party?.[u] ?? 0, r.after.party?.[u] ?? 0, (v) => (u === 'IRR' ? R(v) : u === 'G750' ? G(v) : fa(v))))}
      </tbody></table></div>${r.verdict.choice !== 'stop' ? html`<a class="btn ghost" href="/books/desk" data-link>رفتن به میز معامله برای ثبت</a>` : ''}</article>`);
  }
  function partyPicker(f, box) {
    let t = null;
    f.pq.addEventListener('input', () => {
      clearTimeout(t);
      f.partyId.value = '';
      const q = f.pq.value.trim();
      if (q.length < 2) return (box.innerHTML = '');
      t = setTimeout(async () => {
        const r = await api(`/api/books/parties?q=${encodeURIComponent(q)}`).catch(() => ({ items: [] }));
        box.innerHTML = String(html`${r.items.slice(0, 6).map((p) => html`<button type="button" class="chip" data-pid="${p.id}" data-label="${p.label}">${p.label}</button>`)}`);
      }, 200);
    });
    box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pid]');
      if (!b) return;
      f.partyId.value = b.dataset.pid;
      f.pq.value = b.dataset.label;
      box.innerHTML = '';
      f.dispatchEvent(new CustomEvent('party', { detail: b.dataset.pid }));
    });
  }

  /* ------------------------------------------------------------------ دوقلو و ماشین زمان */
  async function twin(day = '', cmp = '') {
    const q = new URLSearchParams({ ...(day ? { day } : {}), ...(cmp ? { compare: cmp } : {}) });
    const t = await api(`/api/books/control/twin?${q}`);
    const c = t.compare;
    const card = (label, v, fmt, metric, cv) => html`<div class="ctl-tw"><small>${label}${metric ? why(metric, t.live ? '' : t.day) : ''}</small><b class="num">${fmt(v)}</b>${c && cv !== undefined ? html`<em class="${v - cv > 0 ? 'pos' : v - cv < 0 ? 'neg' : ''}">${v - cv > 0 ? '+' : v - cv < 0 ? '−' : '±'}${fmt(Math.abs(v - cv))} نسبت به ${jd(c.day)}</em>` : ''}</div>`;
    body.innerHTML = String(html`<form class="ctl-when" id="twF"><label class="field">وضعیت در پایان روز<input class="input" name="day" placeholder="${jd(today())}" value="${t.live ? '' : jd(t.day)}"></label><label class="field">مقایسه با روز<input class="input" name="cmp" placeholder="اختیاری" value="${c ? jd(c.day) : ''}"></label><button class="btn">نمایش</button>${t.live ? '' : html`<button class="btn ghost" type="button" data-act="now">اکنون (زنده)</button>`}</form>
      <p class="ctl-asof">${t.live ? html`<b class="live">● زنده</b> اکنون` : html`<b>ماشین زمان</b>: پایان ${jd(t.day)}`}${t.closed ? html` · روز بسته‌شده با امضای ${t.closed.by}` : ''} · قیمت‌ها ${t.prices.sample ? 'نمونه' : t.live ? 'تابلوی زنده' : 'بسته همان روز'}</p>
      <div class="ctl-twin">
        ${card('نقد صندوق‌ها', t.cashTotal, R, 'cash', c?.cashTotal)}${card('بانک', t.bankTotal, R, 'bank', c?.bankTotal)}
        ${card('طلای فیزیکی (گرم ۷۵۰)', t.physicalG750, G, 'physical', c?.physicalG750)}${card('طلای خالص (گرم)', t.pure, G, null, c?.pure)}
        ${card('موقعیت خالص طلا', t.netGold, G, 'net', c?.netGold)}${card('مطالبات ریالی', t.receivable.IRR ?? 0, R, 'receivables', c?.receivable.IRR ?? 0)}
        ${card('بدهی ریالی', t.payable.IRR ?? 0, R, 'liabilities', c?.payable.IRR ?? 0)}${card('ارزش خالص فروشگاه', t.value.net, R, 'networth', c?.value.net)}
        ${card('سود تحقق‌یافته همان روز', t.realizedThatDay, R, 'pnl', c?.realizedThatDay)}${card('اسناد قطعی همان روز', t.docsThatDay, fa, null, c?.docsThatDay)}
      </div>
      <div class="ctl-twin-x"><div class="tray"><h3>سکه‌ها و شمش‌ها</h3><ul>${Object.entries(t.coins).filter(([, n]) => n).map(([k, n]) => html`<li>${COIN_TYPES[k]?.short ?? k}<b>${fa(n)}</b></li>`)}${t.bars.map((b) => html`<li>شمش ${fa(b.serial)}<b>${b.weight ? `${fa(b.weight)} گرم × ${fa(b.fineness)}` : '—'}</b></li>`)}</ul>${!Object.values(t.coins).some(Boolean) && !t.bars.length ? html`<p class="small">سکه یا شمشی نبود.</p>` : ''}</div>
        <div class="tray"><h3>جنسی مشتریان</h3><ul>${Object.entries(t.receivable).filter(([u]) => u !== 'IRR').map(([u, v]) => html`<li>طلب ${unitLabel(u)}<b>${u === 'G750' ? G(v) : fa(v)}</b></li>`)}${Object.entries(t.payable).filter(([u]) => u !== 'IRR').map(([u, v]) => html`<li>تعهد ${unitLabel(u)}<b>${u === 'G750' ? G(v) : fa(v)}</b></li>`)}</ul></div></div>`);
    const f = $('#twF', body);
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const d = f.day.value.trim() ? parseDay(f.day.value) : '';
      const k = f.cmp.value.trim() ? parseDay(f.cmp.value) : '';
      if ((f.day.value.trim() && !d) || (f.cmp.value.trim() && !k)) return toast('تاریخ را به شکل ۱۴۰۵/۰۶/۳۱ بنویسید.', 'error');
      twin(d, k).catch((err) => toast(err.message, 'error'));
    });
    $('[data-act=now]', body)?.addEventListener('click', () => twin());
  }

  /* ------------------------------------------------------------------ سری‌ها و ردیابی گرم */
  async function lots(q = '') {
    const r = await api(`/api/books/control/lots${q ? `?q=${encodeURIComponent(q)}` : ''}`);
    const U = (u) => (u === 'G750' ? 'گرم ۷۵۰' : unitLabel(u));
    body.innerHTML = String(html`<div class="ctl-kpis">${r.units.map((u) => html`<div><small>${U(u.unit)}</small><b>${u.unit === 'G750' ? G(u.remaining) : fa(u.remaining)}</b><em>${fa(u.open)} سری باز از ${fa(u.lots)} · سود ${R(u.realized)}</em></div>`)}</div>
      <form class="ctl-when" id="lotF"><label class="field">جستجوی سری، سریال شمش یا سند فروش<input class="input ltr" name="q" value="${q}" placeholder="M1405-00012"></label><button class="btn">جستجو</button></form>
      <p class="small">هر خرید قیمت‌دار یک سری است با شناسه کد رهگیری همان ردیف. فروش‌ها از قدیمی‌ترین سری برداشته می‌شوند (اولین‌ورود)؛ گزارش سود کل فروشگاه همچنان به روش میانگین موزون است.</p>
      ${r.lots.length ? html`<ul class="ctl-lots">${r.lots.map((l) => html`<li><details><summary><span class="ltr-num">${l.id}</span><span>${jd(l.date)}${l.party ? ` · ${l.party}` : ''}${l.serial ? ` · شمش ${fa(l.serial)}` : ''}</span><span class="ctl-lotbar" style="--p:${l.qty ? (l.remaining / l.qty) * 100 : 0}%" title="مانده"><i></i></span><b>${l.unit === 'G750' ? G(l.remaining) : fa(l.remaining)} / ${l.unit === 'G750' ? G(l.qty) : fa(l.qty)} ${U(l.unit)}</b><em class="${l.realized >= 0 ? 'pos' : 'neg'}">${R(l.realized)}</em></summary>
          <p class="small">بها ${R(l.cost)} · هر واحد ${R(l.avgCost)}${l.weight ? ` · ${fa(l.weight)} گرم عیار ${fa(l.fineness)}` : ''}</p>
          ${l.out.length ? html`<ol class="ctl-trace">${l.out.map((o) => html`<li><a href="/books/trace?q=${encodeURIComponent(o.track)}" data-link class="ltr-num">${o.track}</a> ${jd(o.date)}${o.party ? ` · ${o.party}` : ''} · ${l.unit === 'G750' ? G(o.qty) : fa(o.qty)} ${U(l.unit)} · ${o.shortage ? 'کسری شمارش' : `فروش ${R(o.value)}`} · <b class="${o.profit >= 0 ? 'pos' : 'neg'}">${R(o.profit)}</b></li>`)}</ol>` : html`<p class="small">هنوز چیزی از این سری نرفته است.</p>`}</details></li>`)}</ul>` : html`<p class="ctl-empty">سری‌ای پیدا نشد.</p>`}
      ${r.shortfalls.length ? html`<p class="err">${fa(r.shortfalls.length)} فروش بیش از سری‌های موجود بوده (موجودی منفی)؛ مرکز استثناها را ببینید.</p>` : ''}`);
    $('#lotF', body).addEventListener('submit', (e) => {
      e.preventDefault();
      lots(e.target.q.value.trim()).catch((err) => toast(err.message, 'error'));
    });
  }

  /* ------------------------------------------------------------------ تایم‌لاین */
  async function story(target = '') {
    body.innerHTML = String(html`<form class="tray ctl-sim" id="stF" autocomplete="off"><div class="ctl-sim-row"><label class="field">داستان مشتری<input class="input" name="pq" placeholder="نام یا کد مشتری…"><input type="hidden" name="partyId"></label><div class="ctl-picks" id="stPicks"></div>
      <label class="field">یا تایم‌لاین کالا<select class="input" name="unit"><option value="">—</option><option value="G750">طلای آبشده</option>${shownCoins().map(([k, c]) => html`<option value="COIN:${k}">${c.short}</option>`)}</select></label></div></form><div id="stOut"></div>`);
    const f = $('#stF', body);
    partyPicker(f, $('#stPicks', body));
    const show = async (q) => {
      const out = $('#stOut', body);
      out.innerHTML = '<div class="loading"><span></span></div>';
      try {
        const r = await api(`/api/books/control/story?${q}`);
        out.innerHTML = r.party ? String(html`<article class="tray ctl-story"><h2>${r.party.label}${why(`party:${r.party.id}`)}</h2><p class="ctl-sentence">${r.story}</p>
            <div class="ctl-chips">${r.behaviour.everyDays ? html`<span>هر ${fa(r.behaviour.everyDays)} روز</span>` : ''}${r.behaviour.method ? html`<span>${r.behaviour.method.label} ${fa(r.behaviour.method.n)} از ${fa(r.behaviour.method.of)}</span>` : ''}${r.behaviour.settleDays != null ? html`<span>تسویه در ${fa(r.behaviour.settleDays)} روز</span>` : ''}${r.behaviour.creditLimit ? html`<span>سقف اعتبار ${R(r.behaviour.creditLimit)}</span>` : ''}</div>
            <ol class="ctl-tl">${[...r.events].reverse().map((ev) => html`<li class="k-${ev.kind}"><time>${jd(ev.date)}</time><em>${ev.label}</em><span>${ev.text}</span>${ev.doc ? html`<a href="${ev.doc.href}" data-link class="ltr-num">${ev.doc.track}</a>` : ''}</li>`)}</ol></article>`)
          : String(html`<article class="tray ctl-story"><h2>${r.name}: مانده ${r.unit === 'G750' ? G(r.balance) : fa(r.balance)}</h2><ol class="ctl-tl">${[...r.events].reverse().map((ev) => html`<li class="k-${ev.kind}"><time>${jd(ev.date)}</time><em>${ev.label}</em><span>${ev.what}${ev.party ? ` · ${ev.party}` : ''}: ${r.unit === 'G750' ? G(Math.abs(ev.amt)) : fa(Math.abs(ev.amt))} → مانده ${r.unit === 'G750' ? G(ev.balance) : fa(ev.balance)}</span>${ev.doc ? html`<a href="${ev.doc.href}" data-link class="ltr-num">${ev.doc.track}</a>` : ''}</li>`)}</ol></article>`);
      } catch (err) {
        out.innerHTML = String(html`<p class="err">${err.message}</p>`);
      }
    };
    f.addEventListener('party', (e) => show(`party=${e.detail}`));
    f.unit.addEventListener('change', () => f.unit.value && show(`unit=${encodeURIComponent(f.unit.value)}`));
    if (target) show(target);
  }

  /* ------------------------------------------------------------------ تراز دوتایی */
  async function trial(day = '') {
    const r = await api(`/api/books/control/trial${day ? `?day=${day}` : ''}`);
    const groups = [...new Set(r.rows.map((x) => x.group))];
    body.innerHTML = String(html`<form class="ctl-when" id="trF"><label class="field">در پایان روز<input class="input" name="day" placeholder="${jd(today())}" value="${day ? jd(day) : ''}"></label><button class="btn">نمایش</button></form>
      <p class="small">${r.note}</p>
      <div class="scrollx"><table class="table ctl-trial"><thead><tr><th rowspan="2">حساب</th><th colspan="3" class="w">بعد وزنی</th><th class="r">بعد ریالی</th></tr><tr><th class="w">گرم ۷۵۰</th><th class="w">گرم خالص</th><th class="w">تعداد</th><th class="r">ریال</th></tr></thead>
        <tbody>${groups.map((g) => html`<tr class="grp"><td colspan="5">${r.rows.find((x) => x.group === g).groupLabel}</td></tr>${r.rows.filter((x) => x.group === g).map((x) => html`<tr><td>${x.title}</td><td class="num w">${x.g750 ? G(x.g750) : '—'}</td><td class="num w">${x.pure ? G(x.pure) : '—'}</td><td class="num w">${Object.entries(x.count).map(([u, n]) => `${fa(n)} ${unitLabel(u)}`).join('، ') || '—'}</td><td class="num r">${x.rial ? R(x.rial) : '—'}</td></tr>`)}`)}</tbody>
        <tfoot><tr><td>جمع هر بعد</td><td class="num w">${G(r.totals.g750)}</td><td class="num w">${G(r.totals.pure)}</td><td class="w"></td><td class="num r">${R(r.totals.rial)}</td></tr></tfoot></table></div>`);
    $('#trF', body).addEventListener('submit', (e) => {
      e.preventDefault();
      const v = e.target.day.value.trim();
      const d = v ? parseDay(v) : '';
      if (v && !d) return toast('تاریخ نامعتبر است.', 'error');
      trial(d).catch((err) => toast(err.message, 'error'));
    });
  }

  /* ------------------------------------------------------------------ پیش‌بینی ۱۰ روزه */
  async function forecast() {
    const r = await api('/api/books/control/forecast10');
    const chart = (key, low, high, fmt, label) => {
      const pts = [{ day: r.from, v: key === 'money' ? r.now.money : r.now.gold, lo: key === 'money' ? r.now.money : r.now.gold, hi: key === 'money' ? r.now.money : r.now.gold }, ...r.days.map((d) => ({ day: d.day, v: d[key], lo: d[low], hi: d[high] }))];
      const W = 560, H = 180, P = 28;
      const ys = pts.flatMap((p) => [p.lo, p.hi, p.v]);
      const min = Math.min(...ys), max = Math.max(...ys), span = max - min || 1;
      const X = (i) => W - P - (i * (W - 2 * P)) / (pts.length - 1); // right to left (RTL time)
      const Y = (v) => H - P - ((v - min) / span) * (H - 2 * P);
      const band = `${pts.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(p.hi).toFixed(1)}`).join(' ')} ${[...pts].reverse().map((p, i) => `L${X(pts.length - 1 - i).toFixed(1)} ${Y(p.lo).toFixed(1)}`).join(' ')} Z`;
      const line = pts.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(p.v).toFixed(1)}`).join(' ');
      return html`<figure class="tray ctl-fc"><figcaption>${label}: امروز <b>${fmt(pts[0].v)}</b> ← ۱۰ روز دیگر حدود <b>${fmt(pts.at(-1).v)}</b> <small>(بازه ۸۰٪: ${fmt(pts.at(-1).lo)} تا ${fmt(pts.at(-1).hi)})</small></figcaption>
        <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${label}"><path class="band" d="${band}"/><path class="line" d="${line}"/>${pts.map((p, i) => html`<circle cx="${X(i).toFixed(1)}" cy="${Y(p.v).toFixed(1)}" r="3"><title>${jd(p.day)}: ${fmt(p.v)}</title></circle>`)}<text x="${W - P}" y="${H - 6}" class="t">امروز</text><text x="${P}" y="${H - 6}" class="t e">${jd(pts.at(-1).day)}</text></svg></figure>`;
    };
    const cheq = r.days.flatMap((d) => d.cheques.map((c) => ({ ...c, day: d.day })));
    body.innerHTML = String(html`${chart('money', 'moneyLow', 'moneyHigh', R, 'نقد و بانک')}${chart('gold', 'goldLow', 'goldHigh', (v) => `${G(v)} گرم`, 'طلای فیزیکی (۷۵۰)')}
      <p class="small">مبنا: میانگین جریان روزانه ${r.daily.basis} (نقد ${R(r.daily.money)} و طلا ${G(r.daily.gold)} گرم در روز) + چک‌های سررسید. ${r.note}</p>
      ${cheq.length ? html`<div class="tray"><h3>چک‌های سررسید ۱۰ روز آینده</h3><ul class="ctl-chq">${cheq.map((c) => html`<li><time>${jd(c.day)}</time><span>${c.dir === 'in' ? 'دریافتی' : 'پرداختی'} ${c.no ? `شماره ${fa(c.no)}` : ''}${c.party ? ` · ${c.party}` : ''}</span><b class="${c.dir === 'in' ? 'pos' : 'neg'}">${c.dir === 'in' ? '+' : '−'}${R(c.amount)}</b></li>`)}</ul></div>` : html`<p class="small">چک سررسیدداری در ۱۰ روز آینده نیست.</p>`}`);
  }

  /* ------------------------------------------------------------------ تأییدها */
  async function approvals() {
    const r = await api('/api/books/control/approvals');
    const ST = { pending: 'در انتظار', approved: 'تأیید شد', rejected: 'رد شد', used: 'انجام شد' };
    body.innerHTML = String(html`${owner ? html`<form class="tray ctl-rules" id="apR"><h3>قواعد تأیید</h3>
        <label class="switch"><input type="checkbox" name="enabled" ${r.rules.enabled ? 'checked' : ''}> موتور تأیید روشن است</label>
        <div class="ctl-rule-list"><label><input type="checkbox" name="void" ${r.rules.void ? 'checked' : ''}> ابطال سند</label><label><input type="checkbox" name="belowCost" ${r.rules.belowCost ? 'checked' : ''}> فروش زیر بهای تمام‌شده</label><label><input type="checkbox" name="discount" ${r.rules.discount ? 'checked' : ''}> تخفیف بالاتر از <input class="input small ltr" name="discountPct" value="${r.rules.discountPct}" size="3">٪</label><label><input type="checkbox" name="unlock" ${r.rules.unlock ? 'checked' : ''}> باز کردن دوره قفل</label></div>
        <p class="small">کنترل چهار چشم: کسی که درخواست می‌دهد، حتی مالک، نمی‌تواند خودش تأیید کند؛ مدیر یا مالک دیگری باید تصمیم بگیرد. تأیید فقط یک بار و فقط برای همان محتوا معتبر است.</p><button class="btn small">ذخیره قواعد</button></form>` : ''}
      ${r.items.length ? html`<ul class="ctl-ap">${r.items.map((a) => html`<li class="st-${a.status}"><div><b>${a.kindLabel}</b><p>${a.summary}</p><small>درخواست: ${a.requestedBy} · ${jd(a.requestedAt.slice(0, 10))} ${timeFa(a.requestedAt)}${a.decidedBy ? ` · ${ST[a.status]} توسط ${a.decidedBy}${a.note ? `: «${a.note}»` : ''}` : ''}</small></div>
          <span class="ctl-st">${ST[a.status]}</span>${a.status === 'pending' && admin ? (a.requestedById === r.me ? html`<small class="ctl-4e">درخواست خودتان است؛ مدیر دیگری باید تأیید کند</small>` : html`<div class="ctl-ap-a"><button class="btn small" data-ap="approve" data-id="${a.id}">تأیید</button><button class="btn ghost small" data-ap="reject" data-id="${a.id}">رد</button></div>`) : ''}</li>`)}</ul>` : html`<p class="ctl-empty">درخواستی نیست.</p>`}`);
    $('#apR', body)?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      try {
        await api('/api/books/control/approvals/rules', { method: 'PUT', body: { enabled: f.enabled.checked, void: f.void.checked, belowCost: f.belowCost.checked, discount: f.discount.checked, unlock: f.unlock.checked, discountPct: Number(f.discountPct.value) } });
        toast('قواعد تأیید ذخیره شد.', 'ok');
      } catch (err) {
        toast(err.message, 'error');
      }
    });
    for (const b of $$('[data-ap]', body))
      b.addEventListener('click', async () => {
        let note = '';
        if (b.dataset.ap === 'reject') {
          note = await confirmBox('رد درخواست', 'دلیل رد را بنویسید؛ درخواست‌کننده آن را می‌بیند.', { reason: true, ok: 'رد', danger: true });
          if (!note) return;
        }
        try {
          await api(`/api/books/control/approvals/${b.dataset.id}/${b.dataset.ap}`, { method: 'POST', body: { note } });
          approvals();
        } catch (err) {
          toast(err.message, 'error');
        }
      });
  }

  /* ------------------------------------------------------------------ قفل دوره */
  async function periods() {
    const r = await api('/api/books/control/periods');
    body.innerHTML = String(html`<p class="small">پس از بستن یک ماه، هیچ سندی با تاریخ آن ماه ثبت، ویرایش یا باطل نمی‌شود؛ اشتباه‌ها با «سند اصلاح» در تاریخ امروز اصلاح می‌شوند. باز کردن فقط با مالک و با دلیل${owner ? '' : ' (شما مالک نیستید)'}.</p>
      <ul class="ctl-months">${r.months.map((m) => html`<li class="${m.locked ? 'locked' : ''}"><b>${m.label}</b><small>${fa(m.docs)} سند قطعی${m.lock?.unlocked_at ? ` · آخرین بار باز شد: «${m.lock.reason}»` : ''}</small>${m.current ? html`<span class="ctl-st">ماه جاری</span>` : m.locked ? html`<span class="ctl-st lock">🔒 قفل</span>${owner ? html`<button class="btn ghost small" data-unlock="${m.month}">باز کردن</button>` : ''}` : html`<button class="btn small" data-lock="${m.month}">قفل کن</button>`}</li>`)}</ul>`);
    body.onclick = async (e) => {
      const l = e.target.closest('[data-lock]'), u = e.target.closest('[data-unlock]');
      try {
        if (l && (await confirmBox('قفل دوره', `ماه ${l.closest('li').querySelector('b').textContent} قفل شود؟ پس از آن فقط سند اصلاحی ممکن است.`, { ok: 'قفل کن' }))) await api('/api/books/control/periods/lock', { method: 'POST', body: { month: l.dataset.lock } });
        if (u) {
          const reason = await confirmBox('باز کردن دوره قفل', 'چرا این ماه باید باز شود؟', { reason: true, danger: true, ok: 'باز کن' });
          if (!reason) return;
          await api('/api/books/control/periods/unlock', { method: 'POST', body: { month: u.dataset.unlock, reason } });
        }
        if (l || u) periods();
      } catch (err) {
        if (err.status === 428) toast('باز کردن دوره تأیید مدیر دیگر را لازم دارد؛ درخواست ثبت شد.', 'info');
        else toast(err.message, 'error');
      }
    };
  }

  /* ------------------------------------------------------------------ بستن خودکار */
  async function close() {
    const r = await api('/api/books/control/autoclose');
    body.innerHTML = String(html`${owner ? html`<form class="tray ctl-rules" id="acF"><h3>بستن خودکار روز مالی</h3><label class="switch"><input type="checkbox" name="enabled" ${r.rules.enabled ? 'checked' : ''}> هر شب خودکار تطبیق بده و اگر مغایرتی نبود، روز را با امضای فروشگاه ببند</label>
        <label class="field">ساعت (به وقت تهران)<input class="input ltr" name="at" value="${r.rules.at}" size="5"></label><label><input type="checkbox" name="requireCount" ${r.rules.requireCount ? 'checked' : ''}> بدون شمارش فیزیکی آن روز نبند</label><button class="btn small">ذخیره</button></form>` : ''}
      <div class="actions"><button class="btn ghost" data-act="recon">تطبیق همین الان</button><span class="small">ساعت فعلی تهران: ${fa(r.now)}</span></div>
      ${r.reports.length ? html`<ul class="ctl-recon">${r.reports.map((x) => html`<li class="${x.issues.length ? 'bad' : 'ok'}"><b>${jd(x.day)}</b><span>${x.issues.length ? `${fa(x.issues.length)} مغایرت` : 'بدون مغایرت'}${x.closed ? ' · بسته شد (خودکار)' : ''}${x.auto ? ' · شبانه' : ' · دستی'}</span>${x.issues.length ? html`<ul>${x.issues.map((i) => html`<li><a href="${i.href}" data-link>${i.title}</a>: ${i.detail}</li>`)}</ul>` : ''}</li>`)}</ul>` : html`<p class="ctl-empty">هنوز تطبیقی اجرا نشده است.</p>`}`);
    $('#acF', body)?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      try {
        await api('/api/books/control/autoclose', { method: 'PUT', body: { enabled: f.enabled.checked, at: f.at.value.trim().replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)), requireCount: f.requireCount.checked } });
        toast('ذخیره شد.', 'ok');
      } catch (err) {
        toast(err.message, 'error');
      }
    });
    $('[data-act=recon]', body).addEventListener('click', async (e) => {
      busy(e.currentTarget, true);
      try {
        const x = await api('/api/books/control/recon', { method: 'POST', body: {} });
        toast(x.issues.length ? `${fa(x.issues.length)} مغایرت پیدا شد.` : 'بدون مغایرت.', x.issues.length ? 'info' : 'ok');
        close();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }

  /* ------------------------------------------------------------------ موتور تبدیل عیار */
  async function karat() {
    body.innerHTML = String(html`<form class="tray ctl-sim" id="kF" autocomplete="off"><div class="ctl-sim-row"><label class="field">وزن (گرم)<input class="input ltr" name="w" inputmode="decimal" value="10"></label><label class="field">عیار (۷۵۰، ۱۸k، ۰٫۷۵، ۲۴ عیار…)<input class="input ltr" name="f" value="750"></label><label class="field">مظنه (اختیاری، ریال)<input class="input ltr" name="m" inputmode="numeric"></label></div></form><div id="kOut"></div>`);
    const f = $('#kF', body);
    const draw = () => {
      const w = Number(String(f.w.value).replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace('٫', '.'));
      const fin = parseFineness(f.f.value);
      const mz = Number(String(f.m.value).replace(/[٬,\s]/g, '').replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
      if (!(w > 0) || !fin) return ($('#kOut', body).innerHTML = String(html`<p class="small">وزن و عیار معتبر وارد کنید.</p>`));
      const c = convert(w, fin, { mazaneh: mz > 0 ? mz : null });
      $('#kOut', body).innerHTML = String(html`<div class="ctl-twin">${[['عیار (هزارم)', fa(c.fineness)], ['قیراط', fa(c.karat)], ['طلای خالص', `${G(c.pure)} گرم`], ['معادل ۷۵۰ (قاعده دفتر)', `${G(c.g750)} گرم`], ['مثقال ۷۰۵ (واحد مظنه)', G(c.mesghal705)], ['وزن در عیار ۹۹۵', `${G(c.at(995))} گرم`], ...(c.value ? [['ارزش با این مظنه', R(c.value)]] : [])].map(([l, v]) => html`<div class="ctl-tw"><small>${l}</small><b class="num">${v}</b></div>`)}</div>`);
    };
    f.addEventListener('input', draw);
    draw();
  }

  const VIEWS = { overview, exceptions, simulate, twin: () => twin(), lots: () => lots(), story: () => story(params.get('party') ? `party=${params.get('party')}` : ''), trial: () => trial(), forecast, approvals, periods, close, karat };
  setTab(tab);
}
