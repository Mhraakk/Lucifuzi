// نبض — the first screen of the day: the market's pulse (مظنه, gram, coins, dollar with 30-day lines), the shop's pulse
// today (what came in and went out, in money and in metal), the gold position on a gauge, the books' health, the last
// things that happened (each with its tracking code) and who owes whom. Quiet colours, no blinking: it is read all day.
import { html, fa, api, store, navigate, $, $$ } from '../core.mjs';
import * as B from '../books.mjs';
import { COIN_TYPES } from '../coins.mjs';
import { sparkline } from '../charts.mjs';
import { booksPrefs, R, G, jd, jdLong, timeFa, today, unitAmt, unitLabel, balUnits } from '../bk.mjs';
import { booksNav } from './books.mjs';

const TICKS = [
  ['mesghal', 'مظنه نقدی', 'مثقال ۷۰۵'],
  ['geram18', 'گرم ۱۸', 'عیار ۷۵۰'],
  ['sekee', 'تمام امامی', 'سکه'],
  ['nim', 'نیم سکه', 'سکه'],
  ['usd', 'دلار', 'بازار آزاد'],
];
const greet = () => {
  const h = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Tehran' }).format(new Date()));
  return h < 11 ? 'صبح بخیر' : h < 15 ? 'ظهر بخیر' : h < 19 ? 'عصر بخیر' : 'شب بخیر';
};
const short = (rial) => {
  const a = Math.abs(rial);
  const [v, u] = a >= 1e12 ? [a / 1e12, 'همت ریال'] : a >= 1e9 ? [a / 1e9, 'میلیارد ریال'] : a >= 1e6 ? [a / 1e6, 'میلیون ریال'] : [a, 'ریال'];
  return `${rial < 0 ? '−' : ''}${B.faNum(v.toLocaleString('en-US', { maximumFractionDigits: v >= 100 ? 0 : 2 })).replace(/,/g, '٬').replace('.', '٫')} ${u}`;
};

export async function pulsePage(root) {
  await booksPrefs();
  const admin = store.isAdmin();
  const from = new Date(Date.now() - 45 * 86400000).toISOString().slice(0, 10);
  const [day, vault, audit, board, series, parties] = await Promise.all([
    api(`/api/books/daybook?day=${today()}`).catch(() => null),
    api('/api/books/vault').catch(() => null),
    api('/api/books/audit').catch(() => null),
    api('/api/market').catch(() => null),
    api(`/api/market/series?symbols=${TICKS.map((t) => t[0]).join(',')}&from=${from}`).catch(() => null),
    api('/api/books/parties').catch(() => ({ items: [] })),
  ]);
  const t = day?.totals ?? { docs: 0, buys: 0, sells: 0, goldIn: 0, goldOut: 0, coins: {}, money: {}, realized: 0, bars: { in: 0, out: 0 } };
  const cashIn = Object.entries(t.money).filter(([k]) => k.endsWith(':in')).reduce((s, [, v]) => s + v, 0);
  const cashOut = Object.entries(t.money).filter(([k]) => k.endsWith(':out')).reduce((s, [, v]) => s + v, 0);
  const cust = vault?.custody ?? {};
  const netG = vault ? B.r3(vault.gold - (cust.G750?.owedByShop ?? 0) + (cust.G750?.owedToShop ?? 0)) : 0;
  const p750 = vault?.prices?.price?.G750 ?? 0;
  // who owes whom: largest by rial, and everyone with goods on account
  const rows = parties.items.filter((p) => balUnits(p.balance).length);
  const debtors = rows.filter((p) => balUnits(p.balance).some((u) => p.balance[u] > 0)).sort((a, b) => (b.balance.IRR ?? 0) - (a.balance.IRR ?? 0)).slice(0, 6);
  const creditors = rows.filter((p) => balUnits(p.balance).some((u) => p.balance[u] < 0)).sort((a, b) => (a.balance.IRR ?? 0) - (b.balance.IRR ?? 0)).slice(0, 6);
  const who = (p, sign) => balUnits(p.balance).filter((u) => p.balance[u] * sign > 0).map((u) => (u.startsWith('BAR:') ? unitLabel(u) : unitAmt(u, Math.abs(p.balance[u])))).join(' + ');
  // gauge: −100%…+100% of the shop's gold held (a short position leans left)
  const held = Math.max(0.001, vault?.gold ?? 0, Math.abs(netG));
  const lean = Math.max(-1, Math.min(1, netG / held));
  const tick = (id) => board?.items?.find((x) => x.id === id);

  root.innerHTML = String(html`${booksNav('pulse')}
    <section class="pl-hero">
      <div><span class="pl-greet">${greet()}، ${store.me.user.name.split(' ')[0]}</span><h1>نبض امروز</h1><p class="small">${jdLong(today())} · <span id="clock" class="num"></span>${board?.sample ? ' · قیمت‌ها نمونه‌اند (فید زنده وصل نیست)' : ''}</p></div>
      <div class="pl-go"><a class="btn" href="/books/desk" data-link>معامله تازه</a><form id="pq" class="pl-find"><input class="input" name="q" placeholder="رهگیری: کد سند، پیگیری، سریال…" autocomplete="off"></form></div>
    </section>
    <section class="pl-ticks">${TICKS.map(([id, label, sub]) => {
      const x = tick(id);
      const v = x && !x.empty ? x.c * 10 : null;
      return html`<article class="pl-tick"><header><span>${label}</span><small>${sub}</small></header><b class="num">${v ? R(v).replace(' ریال', '') : '—'}</b><footer>${x?.pct ? html`<em class="${x.pct > 0 ? 'up' : 'down'}">${x.pct > 0 ? '▲' : '▼'} ${fa(Math.abs(x.pct).toFixed(2))}٪</em>` : html`<em>—</em>`}<canvas data-spark="${id}" width="120" height="34" aria-hidden="true"></canvas></footer></article>`;
    })}</section>
    <section class="pl-kpis">
      <div><span>سند قطعی امروز</span><b>${fa(t.docs)}</b></div>
      <div><span>خرید از مشتریان</span><b>${short(t.buys)}</b></div>
      <div><span>فروش به مشتریان</span><b>${short(t.sells)}</b></div>
      <div><span>وجه دریافتی / پرداختی</span><b class="pl-two"><i class="in">+${short(cashIn)}</i><i class="out">−${short(cashOut)}</i></b></div>
      <div><span>آبشده ورود / خروج</span><b class="pl-two"><i class="in">+${G(t.goldIn)}</i><i class="out">−${G(t.goldOut)}</i></b><small>گرم ۷۵۰</small></div>
      <div><span>سکه (خالص)</span><b>${Object.entries(t.coins).filter(([, n]) => n).map(([k, n]) => `${COIN_TYPES[k]?.short} ${n > 0 ? '+' : '−'}${fa(Math.abs(n))}`).join(' · ') || '—'}</b></div>
      ${admin ? html`<div class="${t.realized < 0 ? 'bad' : t.realized > 0 ? 'good' : ''}"><span>سود/زیان تحقق‌یافته</span><b>${short(t.realized)}</b></div>` : ''}
    </section>
    <div class="pl-grid">
      <section class="tray pl-gauge"><h3 class="bk-h">موقعیت طلای مغازه</h3>
        <svg viewBox="0 0 220 128" class="pl-meter" role="img" aria-label="موقعیت خالص طلا">
          <path d="M20 112 A90 90 0 0 1 200 112" class="trk"/><path d="M20 112 A90 90 0 0 1 110 22" class="short"/><path d="M110 22 A90 90 0 0 1 200 112" class="long"/>
          <g style="transform: rotate(${(lean * 90).toFixed(1)}deg); transform-origin: 110px 112px" class="ndl"><line x1="110" y1="112" x2="110" y2="34"/><circle cx="110" cy="112" r="6"/></g>
          <text x="34" y="126" text-anchor="middle">فروش باز</text><text x="186" y="126" text-anchor="middle">موجودی</text>
        </svg>
        <p class="pl-big num">${netG >= 0 ? '' : '−'}${G(Math.abs(netG))} <small>گرم ۷۵۰ خالص</small></p>
        <p class="small">در گاوصندوق ${G(vault?.gold ?? 0)} · امانت مشتریان ${G(cust.G750?.owedByShop ?? 0)} · طلب طلایی ما ${G(cust.G750?.owedToShop ?? 0)}</p>
        ${p750 && Math.abs(netG) > 0.001 ? html`<p class="pl-note">هر ۱٪ ${netG < 0 ? 'افزایش' : 'کاهش'} مظنه ≈ <b>${short(Math.round(Math.abs(netG) * p750 * 0.01))}</b> از ارزش خالص مغازه کم می‌کند.</p>` : ''}</section>
      <section class="tray pl-health"><h3 class="bk-h">سلامت دفاتر</h3>
        ${audit ? html`<div class="pl-hrow"><div class="au-ring ${audit.score >= 85 ? '' : audit.score >= 60 ? 'warn' : 'bad'}" style="--p:${audit.score}"><b>${fa(audit.score)}</b><span>از ۱۰۰</span></div>
          <ul class="pl-find-list">${audit.findings.filter((f) => f.sev !== 'info').slice(0, 4).map((f) => html`<li class="${f.sev}"><b>${f.title}</b></li>`)}${audit.findings.some((f) => f.sev !== 'info') ? '' : html`<li class="ok"><b>✓ مورد قابل‌توجهی نیست</b></li>`}</ul></div>
          <a class="chip" href="/books/audit" data-link>گزارش کامل ممیز</a>` : html`<p class="small">در دسترس نیست.</p>`}</section>
      <section class="tray pl-feed"><div class="bk-head"><h3 class="bk-h">آخرین رویدادها</h3><a class="chip" href="/books/day" data-link>روزنگار</a></div>
        <ol>${(day?.entries ?? []).slice(-8).reverse().map((e) => html`<li class="${e.status}"><time class="num">${timeFa(e.at)}</time><div><b>${B.DOC_TYPES[e.type]?.short ?? e.type} · ${e.party?.label ?? (e.hawala ? `${e.hawala.fromName} ← ${e.hawala.toName}` : 'گذری')}</b><small>${e.type !== 'trade' ? `${B.DOC_TYPES[e.type]?.label ?? ''}${e.net ? ` · ${short(Math.abs(e.net))}` : ''}` : e.lines.slice(0, 3).map((l) => `${l.priced ? (l.dir === 'in' ? 'خرید' : 'فروش') : l.dir === 'in' ? 'دریافت' : 'تحویل'} ${l.kind === 'coin' ? `${fa(l.count)} ${COIN_TYPES[l.coin]?.short}` : l.kind === 'melt' ? `${G(l.eq750)} گرم ۷۵۰` : l.kind === 'bar' ? `شمش ${fa(l.serial)}` : `${fa(l.amt)} ${l.code}`}`).join('، ')}${e.payments.length ? ` · ${e.payments.map((p) => B.payMethod(p.method)?.label).join('، ')}` : ''}</small></div><a class="rz-track ltr-num" href="/books/trace?q=${e.track}" data-link>${e.track}</a></li>`)}${day?.entries?.length ? '' : html`<li class="empty">امروز هنوز سندی ثبت نشده است.</li>`}</ol></section>
      <section class="tray pl-owe"><h3 class="bk-h">مطالبات و تعهدات</h3>
        <div class="pl-cols"><div><h4>مطالبه ما (بدهکاران)</h4>${debtors.length ? debtors.map((p) => html`<a href="/books/party/${p.id}" data-link><span>${p.label}</span><em class="debt">${who(p, 1)}</em></a>`) : html`<p class="small">—</p>`}</div>
          <div><h4>تعهد ما (طلبکاران)</h4>${creditors.length ? creditors.map((p) => html`<a href="/books/party/${p.id}" data-link><span>${p.label}</span><em class="cred">${who(p, -1)}</em></a>`) : html`<p class="small">—</p>`}</div></div></section>
    </div>`);

  // 30-day lines under each price
  for (const cv of $$('[data-spark]', root)) {
    const s = series?.series?.[cv.dataset.spark];
    if (s?.length > 2) sparkline(cv, s.map((b) => b[4]), { w: 120, h: 34 });
    else cv.remove();
  }
  const clock = () => {
    const el = $('#clock', root);
    if (el) el.textContent = new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tehran' });
  };
  clock();
  const timer = setInterval(clock, 20000);
  $('#pq', root).addEventListener('submit', (e) => {
    e.preventDefault();
    const q = new FormData(e.target).get('q').trim();
    if (q) navigate(`/books/trace?q=${encodeURIComponent(q)}`);
  });
  return () => clearInterval(timer);
}
