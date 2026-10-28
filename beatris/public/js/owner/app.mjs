// دیده‌بان (spec 0053): the owner's dashboard. A glass header (title, live state, skin, CSV), one row of filters that
// scopes everything below it (days, the owner's own activity, live), glisse's TabBar for the eight views, and the
// views. Every number comes from GET /api/owner/*; nothing here writes, and no shop's documents or customers appear.
import { jsx, useCallback, useEffect, useMemo, useRef, useState, Glass, TabBar, Switch, Slider, Menu, SearchField, Button } from '/vendor/glisse/glisse.bundle.js';
import { api, auth, navigate, ROLE_FA, toast } from '../core.mjs';
import { jd, timeFa, addDays } from '../bk.mjs';
import { flipSkin } from '../skinpicker.mjs';
import { num, compact, Stat, Trend, BarList, Heat } from './charts.mjs';
import { ownerFeed } from './live.mjs';

/* ---------------- words and small helpers ---------------- */
const Icon = (d) => jsx`<svg className="ow-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML=${{ __html: d }} />`;
const ICON = {
  overview: Icon('<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>'),
  signups: Icon('<circle cx="10" cy="8" r="3.4"/><path d="M3.8 19.5c.8-3.2 3.3-5.1 6.2-5.1M17.5 13v7M14 16.5h7"/>'),
  logins: Icon('<path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M14 16l4-4-4-4M18 12H8"/>'),
  users: Icon('<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.7-3 3-4.8 5.5-4.8s4.8 1.8 5.5 4.8"/><circle cx="17" cy="9" r="2.4"/><path d="M16.5 14.3c2 .3 3.5 1.8 4 4.7"/>'),
  behavior: Icon('<path d="M3 12h4l2-6 4 12 2-6h6"/>'),
  shops: Icon('<path d="M4 9.5 5.5 4h13L20 9.5M4 9.5h16M4 9.5V20h16V9.5M9.5 20v-5h5v5"/>'),
  io: Icon('<path d="M7 4 3 8l4 4M3 8h13M17 20l4-4-4-4M21 16H8"/>'),
  live: Icon('<circle cx="12" cy="12" r="2.6"/><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 16.2a6 6 0 0 0 0-8.4M5 5a10 10 0 0 0 0 14M19 19a10 10 0 0 0 0-14"/>'),
  back: Icon('<path d="m9 6 6 6-6 6"/>'),
  skin: Icon('<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/>'),
  csv: Icon('<path d="M12 4v11m0 0-4-4m4 4 4-4"/><path d="M5 19h14"/>'),
  reload: Icon('<path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6"/>'),
  close: Icon('<path d="M6 6l12 12M18 6 6 18"/>'),
};
const TABS = [
  ['overview', 'نمای کلی'], ['signups', 'ثبت‌نام'], ['logins', 'ورودها'], ['users', 'کاربران'],
  ['behavior', 'رفتار'], ['shops', 'فروشگاه‌ها'], ['io', 'ورودی و خروجی'], ['live', 'زنده'],
];
const KIND = { code: 'درخواست کد', verify_fail: 'کد نادرست', blocked: 'مسدود موقت', login: 'ورود', signup: 'ثبت‌نام و فروشگاه تازه', pick: 'کد پذیرفته شد', logout_all: 'خروج از همه‌ی دستگاه‌ها' };
const VIA = { email: 'ایمیل', sms: 'پیامک', demo: 'نمایشی', dev: 'توسعه', 'owner-pin': 'رمز مالک' };
const ACT = { view: 'صفحه', act: 'کار', error: 'خطا', beat: 'حضور', mcp: 'MCP' };
const PAGE = {
  '/': 'خانه', '/work': 'میز کار من', '/learn': 'آموزش', '/practice': 'تمرین', '/market': 'بازار', '/tools': 'ابزار', '/staff': 'تیم', '/me': 'من', '/help': 'راهنما',
  '/books': 'حساب', '/books/desk': 'میز معامله', '/books/day': 'روزنگار', '/books/vault': 'گاوصندوق', '/books/dashboard': 'داشبورد مدیریت', '/books/control': 'کنترل',
  '/books/parties': 'مشتریان', '/books/party/:id': 'پرونده‌ی مشتری', '/books/docs': 'اسناد', '/books/doc/:id': 'یک سند', '/books/doc/:id/edit': 'اصلاح سند', '/books/reports': 'گزارش‌ها',
  '/books/settings': 'تنظیمات حساب', '/books/trace': 'رهگیری', '/books/audit': 'ممیز', '/books/smart': 'ابزار هوشمند', '/books/products': 'کالاها', '/books/stock': 'انبار', '/books/cash': 'صندوق و بانک',
  '/books/log': 'دفتر رویداد', '/books/find': 'جستجو', '/studio': 'استودیو', '/studio/coach': 'مربی استودیو', '/coins': 'آزمایشگاه سکه', '/vendor': 'کنسول ارائه‌دهنده', '/owner': 'دیده‌بان',
  '/ops': 'عملیات', '/setup': 'راه‌اندازی', '/library': 'کتابخانه', '/ledger': 'تمرین دفتر', '/history': 'تاریخچه',
};
const pageName = (p) => PAGE[p] ?? p;
const when = (iso) => (iso ? `${jd(iso)} · ${timeFa(iso)}` : '—');
function ago(iso) {
  if (!iso) return '—';
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return 'همین الان';
  if (s < 3600) return `${num(Math.floor(s / 60))} دقیقه پیش`;
  if (s < 86400) return `${num(Math.floor(s / 3600))} ساعت پیش`;
  if (s < 7 * 86400) return `${num(Math.floor(s / 86400))} روز پیش`;
  return jd(iso);
}
const minutes = (ms) => (ms >= 60000 ? `${num(Math.round(ms / 60000))} دقیقه` : `${num(Math.round((ms || 0) / 1000))} ثانیه`);
const pct = (a, b) => (b ? `${num(Math.round((a / b) * 100))}٪` : '—');
const PREF = 'beatris.owner';
const readPrefs = () => {
  try {
    return JSON.parse(localStorage.getItem(PREF) ?? '{}') || {};
  } catch {
    return {};
  }
};
const writePrefs = (p) => {
  try {
    localStorage.setItem(PREF, JSON.stringify(p));
  } catch {
    /* private window: the choices simply are not remembered */
  }
};

/** One GET, with the previous answer kept on screen while the next loads. */
function useOwner(path, refresh) {
  const [st, set] = useState({ data: null, error: null, busy: true });
  const seq = useRef(0);
  const load = useCallback(() => {
    const n = ++seq.current;
    set((s) => ({ ...s, busy: true }));
    api(path).then(
      (data) => n === seq.current && set({ data, error: null, busy: false }),
      (e) => n === seq.current && set((s) => ({ data: s.data, error: e.message, busy: false })),
    );
  }, [path]);
  useEffect(() => load(), [load, refresh]);
  return st;
}
function View({ st, children }) {
  if (!st.data) return jsx`<div className="ow-view" aria-busy="true">${st.error ? jsx`<p className="ow-empty bad">${st.error}</p>` : jsx`<p className="ow-empty">در حال خواندن…</p>`}</div>`;
  return jsx`<div className=${`ow-view ${st.busy ? 'busy' : ''}`} aria-busy=${st.busy}>${st.error ? jsx`<p className="ow-empty bad">${st.error}</p>` : null}${children(st.data)}</div>`;
}
/** A table whose columns sort by a press on their heading. cols: [{ key, label, get?, cell?, num? }] */
function Table({ cols, rows, initial, label, rowKey, empty = 'چیزی برای نشان دادن نیست.' }) {
  const [sort, setSort] = useState(initial ?? null);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const c = cols.find((x) => x.key === sort.key);
    const get = c?.get ?? ((r) => r[sort.key]);
    return [...rows].sort((a, b) => {
      const x = get(a) ?? '', y = get(b) ?? '';
      const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'fa');
      return sort.dir === 'asc' ? r : -r;
    });
  }, [rows, sort, cols]);
  if (!rows.length) return jsx`<p className="ow-empty">${empty}</p>`;
  return jsx`<div className="ow-scroll" tabIndex="0" role="region" aria-label=${label}><table className="ow-table">
    <thead><tr>${cols.map((c) => jsx`<th scope="col" key=${c.key} aria-sort=${sort?.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      ${c.sort === false ? c.label : jsx`<button type="button" className="ow-sort" onClick=${() => setSort((s) => ({ key: c.key, dir: s?.key === c.key && s.dir === 'desc' ? 'asc' : 'desc' }))}>${c.label}</button>`}</th>`)}</tr></thead>
    <tbody>${sorted.map((r, i) => jsx`<tr key=${rowKey ? rowKey(r) : i}>${cols.map((c) => jsx`<td key=${c.key} className=${c.num ? 'n' : ''}>${c.cell ? c.cell(r) : r[c.key] ?? '—'}</td>`)}</tr>`)}</tbody>
  </table></div>`;
}
const Badge = ({ ok, children }) => jsx`<span className=${`ow-badge ${ok === true ? 'ok' : ok === false ? 'bad' : ''}`}>${children}</span>`;
const Ltr = ({ children }) => jsx`<bdi dir="ltr" className="ow-ltr">${children}</bdi>`;
const Sec = ({ title, note, children }) => jsx`<section className="ow-sec"><header className="ow-sec-h"><h2>${title}</h2>${note ? jsx`<p>${note}</p>` : null}</header>${children}</section>`;

/* ---------------- the views ---------------- */
function Overview({ q, refresh }) {
  const st = useOwner(`/api/owner/overview?${q}`, refresh);
  return jsx`<${View} st=${st}>${(d) => {
    const out = d.outputs.print + d.outputs.pdf + d.outputs.share + d.outputs.export;
    return jsx`<div className="ow-stats">
        <${Stat} label="افراد در همه‌ی فروشگاه‌ها" value=${num(d.users.total)} sub=${`${num(d.users.new)} حساب تازه در این بازه`} spark=${d.series.signups} />
        <${Stat} label="فعال امروز" value=${num(d.dau)} sub=${`هفته ${num(d.wau)} · ماه ${num(d.mau)}`} spark=${d.series.active} />
        <${Stat} label="آنلاین الان" value=${num(d.online)} sub="در پنج دقیقه‌ی گذشته" tone=${d.online ? 'live' : ''} />
        <${Stat} label="ورود موفق" value=${num(d.logins.ok)} sub=${`${num(d.logins.failed)} نادرست · ${num(d.logins.blocked)} مسدود`} spark=${d.series.logins} />
        <${Stat} label="فروشگاه‌ها" value=${num(d.shops.total)} sub=${`${num(d.shops.active)} فعال · ${num(d.shops.suspended)} معلق · ${num(d.shops.expired)} منقضی · ${num(d.shops.new)} تازه`} />
        <${Stat} label="سند قطعی" value=${num(d.docs.final)} sub=${`${num(d.docs.void)} باطل · ${num(d.docs.draft)} پیش‌نویس`} spark=${d.series.docs} />
        <${Stat} label="خروجی‌ها" value=${num(out)} sub=${`چاپ ${num(d.outputs.print)} · PDF ${num(d.outputs.pdf)} · ارسال ${num(d.outputs.share)} · اکسل ${num(d.outputs.export)}`} />
        <${Stat} label="هوش مصنوعی" value=${num(d.ai.calls)} sub=${`${num(d.ai.errors)} خطا · ${compact(d.ai.tokensIn + d.ai.tokensOut)} توکن · MCP ${num(d.mcp)}`} />
        <${Stat} label="خطایی که کاربران دیدند" value=${num(d.errors)} sub="پیام خطا یا خطای صفحه" tone=${d.errors ? 'warn' : ''} />
      </div>
      <div className="ow-grid2">
        <${Trend} title="افراد فعال در هر روز" dayList=${d.dayList} series=${[{ key: 'active', label: 'نفر', values: d.series.active, tone: 1 }]} />
        <${Trend} title="ورودها" dayList=${d.dayList} series=${[{ key: 'ok', label: 'موفق', values: d.series.logins, tone: 1 }, { key: 'failed', label: 'ناموفق', values: d.series.failed, tone: 2 }]} />
        <${Trend} title="دقیقه‌های حضور (برگه‌ی باز و دیده‌شده)" dayList=${d.dayList} series=${[{ key: 'min', label: 'دقیقه', values: d.series.minutes, tone: 1 }]} />
        <${Trend} title="صفحه‌های دیده‌شده و سندهای قطعی" dayList=${d.dayList} series=${[{ key: 'views', label: 'صفحه', values: d.series.views, tone: 1 }, { key: 'docs', label: 'سند', values: d.series.docs, tone: 2 }]} />
      </div>
      ${d.market ? jsx`<p className="ow-foot">${d.market.mode === 'off' ? 'قیمت زنده خاموش است؛ مدیر قیمت روز را دستی وارد می‌کند.' : jsx`قیمت بازار: منبع <${Ltr}>${d.market.mode}</${Ltr}> · ${d.market.ok === false ? 'آخرین به‌روزرسانی ناموفق' : `آخرین به‌روزرسانی ${ago(d.market.at)}`} · سهمیه‌ی امروز ${num(d.market.quota?.used)} از ${num(d.market.quota?.daily)}`}</p>` : null}`;
  }}</${View}>`;
}

function Signups({ q, refresh }) {
  const st = useOwner(`/api/owner/signups?${q}`, refresh);
  return jsx`<${View} st=${st}>${(d) => jsx`
    <div className="ow-stats">
      <${Stat} label="فروشگاه تازه" value=${num(d.totals.shops)} sub=${`${num(d.totals.bySignup)} با ثبت‌نام آزاد · ${num(d.totals.shops - d.totals.bySignup)} به دست ارائه‌دهنده`} spark=${d.series.shops} />
      <${Stat} label="حساب تازه" value=${num(d.totals.accounts)} sub="در همه‌ی فروشگاه‌ها" spark=${d.series.accounts} />
    </div>
    <${Trend} title="ساخته‌شده در هر روز" dayList=${d.dayList} series=${[{ key: 'shops', label: 'فروشگاه', values: d.series.shops, tone: 1 }, { key: 'acc', label: 'حساب', values: d.series.accounts, tone: 2 }]} />
    <${Sec} title="فروشگاه‌های تازه" note="چه کسی ساخت، کی نخستین بار وارد شد و تا امروز چه کرده است.">
      <${Table} label="فروشگاه‌های تازه" rows=${d.shops} rowKey=${(r) => r.id} initial=${{ key: 'createdAt', dir: 'desc' }} empty="در این بازه فروشگاه تازه‌ای ساخته نشد." cols=${[
        { key: 'name', label: 'فروشگاه' },
        { key: 'by', label: 'ساخته به دست', cell: (r) => (r.by === 'signup' ? jsx`<${Badge}>ثبت‌نام آزاد</${Badge}>` : 'ارائه‌دهنده') },
        { key: 'owner', label: 'مالک' },
        { key: 'createdAt', label: 'ساخته', cell: (r) => when(r.createdAt) },
        { key: 'firstLogin', label: 'نخستین ورود', cell: (r) => (r.firstLogin ? ago(r.firstLogin) : jsx`<${Badge} ok=${false}>هنوز نه</${Badge}>`) },
        { key: 'users', label: 'کاربر', num: true, cell: (r) => num(r.users) },
        { key: 'docs', label: 'سند قطعی', num: true, cell: (r) => num(r.docs) },
        { key: 'lastSeen', label: 'آخرین فعالیت', cell: (r) => ago(r.lastSeen) },
        { key: 'status', label: 'وضعیت', cell: (r) => jsx`<${Badge} ok=${r.status === 'active'}>${r.status === 'active' ? 'فعال' : 'معلق'}</${Badge}>` },
      ]} />
    </${Sec}>
    <${Sec} title="حساب‌های تازه">
      <${Table} label="حساب‌های تازه" rows=${d.accounts} rowKey=${(r) => `${r.tenant}|${r.id}`} initial=${{ key: 'createdAt', dir: 'desc' }} empty="در این بازه حساب تازه‌ای ساخته نشد." cols=${[
        { key: 'name', label: 'نام' },
        { key: 'role', label: 'نقش', cell: (r) => ROLE_FA[r.role] ?? r.role },
        { key: 'shop', label: 'فروشگاه' },
        { key: 'createdAt', label: 'ساخته', cell: (r) => when(r.createdAt) },
        { key: 'lastLoginAt', label: 'آخرین ورود', cell: (r) => (r.lastLoginAt ? ago(r.lastLoginAt) : 'هنوز نه') },
        { key: 'device', label: 'دستگاه', cell: (r) => r.device || '—' },
      ]} />
    </${Sec}>`}</${View}>`;
}

function Logins({ q, refresh }) {
  const [ok, setOk] = useState('');
  const [text, setText] = useState('');
  const [find, setFind] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setFind(text.trim()), 300);
    return () => clearTimeout(t);
  }, [text]);
  const st = useOwner(`/api/owner/logins?${q}${ok ? `&ok=${ok}` : ''}${find ? `&q=${encodeURIComponent(find)}` : ''}`, refresh);
  return jsx`<div className="ow-tools">
      <div className="ow-seg" role="group" aria-label="کدام ورودها">${[['', 'همه'], ['1', 'موفق'], ['0', 'ناموفق']].map(([v, t]) => jsx`<button type="button" key=${v} aria-pressed=${ok === v} onClick=${() => setOk(v)}>${t}</button>`)}</div>
      <${SearchField} value=${text} onValueChange=${setText} placeholder="نام، آی‌پی، دستگاه یا فروشگاه" aria-label="جستجو در ورودها" className="ow-search" />
    </div>
    <${View} st=${st}>${(d) => jsx`
      <div className="ow-stats compact">${Object.entries(d.kinds).map(([k, v]) => jsx`<${Stat} key=${k} label=${KIND[k]} value=${num(v.ok + v.failed)} sub=${v.failed ? `${num(v.failed)} ناموفق` : 'بی‌خطا'} tone=${v.failed && !v.ok ? 'warn' : ''} />`)}</div>
      <div className="ow-grid2">
        <${BarList} title="ناموفق‌ها بر حسب آی‌پی" rows=${d.failedByIp.map((g) => ({ key: g.key, label: jsx`<${Ltr}>${g.key || '—'}</${Ltr}>`, value: g.n, sub: ago(g.last) }))} empty="ورود ناموفقی نبود." />
        <${BarList} title="ناموفق‌ها بر حسب نشانی" rows=${d.failedByWho.map((g) => ({ key: g.key, label: g.key || '—', value: g.n, sub: ago(g.last) }))} empty="ورود ناموفقی نبود." />
      </div>
      <${Sec} title=${`گام‌های ورود (${num(d.total)})`} note="آی‌پی، چپ‌ترین نشانی X-Forwarded-For است؛ زنجیره‌ی خام کنارش می‌ماند تا حلقه‌ی درست سنجیده شود (spec 0054).">
        <${Table} label="گام‌های ورود" rows=${d.rows} rowKey=${(r) => r.id} cols=${[
          { key: 'at', label: 'زمان', cell: (r) => when(r.at) },
          { key: 'kind', label: 'گام', cell: (r) => jsx`<${Badge} ok=${r.ok}>${KIND[r.kind] ?? r.kind}</${Badge}>` },
          { key: 'who', label: 'چه کسی', cell: (r) => (r.known ? jsx`<b>${r.who}</b>${r.role ? jsx` <small>${ROLE_FA[r.role]}</small>` : null}` : jsx`<${Ltr}>${r.who}</${Ltr}>`) },
          { key: 'shop', label: 'فروشگاه', cell: (r) => r.shop || '—' },
          { key: 'via', label: 'راه', cell: (r) => VIA[r.via] ?? (r.via || '—') },
          { key: 'ip', label: 'آی‌پی', cell: (r) => jsx`<${Ltr}>${r.ip || '—'}</${Ltr}>${r.xff && r.xff !== r.ip ? jsx`<small className="ow-xff"><${Ltr}>${r.xff}</${Ltr}></small>` : null}` },
          { key: 'device', label: 'دستگاه', cell: (r) => r.device || '—' },
          { key: 'reason', label: 'توضیح', cell: (r) => r.reason || '—' },
        ]} />
      </${Sec}>`}</${View}>`;
}

function Users({ q, refresh, open }) {
  const st = useOwner(`/api/owner/users?${q}`, refresh);
  const [text, setText] = useState('');
  return jsx`<div className="ow-tools"><${SearchField} value=${text} onValueChange=${setText} placeholder="نام، فروشگاه یا نقش" aria-label="جستجو در کاربران" className="ow-search" /></div>
    <${View} st=${st}>${(d) => {
      const t = text.trim().toLowerCase();
      const rows = t ? d.users.filter((u) => [u.name, u.shop, ROLE_FA[u.role], u.contact].some((v) => String(v ?? '').toLowerCase().includes(t))) : d.users;
      return jsx`<${Sec} title=${`همه‌ی افراد (${num(rows.length)})`} note="برای خط زمانی هر نفر، نامش را بزنید.">
        <${Table} label="کاربران" rows=${rows} rowKey=${(r) => `${r.tenant}|${r.id}`} cols=${[
          { key: 'name', label: 'نام', cell: (r) => jsx`<button type="button" className="ow-link ow-user" onClick=${(e) => open(r, e.currentTarget)}>${r.name}</button>${r.demo ? jsx` <${Badge}>نمایشی</${Badge}>` : null}${r.active ? null : jsx` <${Badge} ok=${false}>غیرفعال</${Badge}>`}` },
          { key: 'role', label: 'نقش', cell: (r) => ROLE_FA[r.role] ?? r.role },
          { key: 'shop', label: 'فروشگاه' },
          { key: 'lastSeen', label: 'آخرین دیده‌شدن', get: (r) => r.lastSeen ?? r.lastLoginAt ?? '', cell: (r) => ago(r.lastSeen ?? r.lastLoginAt) },
          { key: 'sessions', label: 'نشست', num: true, cell: (r) => num(r.sessions) },
          { key: 'minutes', label: 'دقیقه', num: true, cell: (r) => num(r.minutes) },
          { key: 'topPages', label: 'صفحه‌های پرکاربرد', sort: false, cell: (r) => (r.topPages.length ? jsx`<span className="ow-chips">${r.topPages.map(([p, n]) => jsx`<span key=${p} className="ow-chip">${pageName(p)} <small>${num(n)}</small></span>`)}</span>` : '—') },
          { key: 'device', label: 'دستگاه', cell: (r) => r.device || '—' },
          { key: 'createdAt', label: 'ساخته', cell: (r) => jd(r.createdAt) },
        ]} />
      </${Sec}>`;
    }}</${View}>`;
}

/** One person's timeline, in a panel at the side (solid: a refracting panel this large is slow to paint). */
function Drawer({ who, q, onClose }) {
  const st = useOwner(`/api/owner/users/${who.tenant}/${who.id}?${q}`, 0);
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.focus();
    const key = (e) => e.key === 'Escape' && onClose();
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  }, [onClose]);
  return jsx`<div className="ow-drawer-wrap"><button type="button" className="ow-scrim" aria-label="بستن" onClick=${onClose} />
    <div className="ow-drawer" role="dialog" aria-modal="true" aria-label=${`خط زمانی ${who.name}`}>
      <header className="ow-drawer-h"><div><h2 tabIndex="-1" ref=${ref}>${who.name}</h2><p>${ROLE_FA[who.role] ?? who.role} · ${who.shop}</p></div><${Button} icon=${ICON.close} aria-label="بستن" onClick=${onClose} /></header>
      <${View} st=${st}>${(d) => jsx`
        <dl className="ow-facts"><div><dt>نشانی</dt><dd><${Ltr}>${d.user.contact || '—'}</${Ltr}></dd></div><div><dt>ساخته</dt><dd>${when(d.user.createdAt)}</dd></div><div><dt>آخرین ورود</dt><dd>${when(d.user.lastLoginAt)}</dd></div><div><dt>دستگاه</dt><dd>${d.user.device || '—'}</dd></div></dl>
        <${Trend} title="دقیقه‌های حضور در هر روز" dayList=${d.dayList} series=${[{ key: 'm', label: 'دقیقه', values: d.minutes, tone: 1 }]} height=${160} />
        <${BarList} title="صفحه‌ها" rows=${d.pages.map((p) => ({ key: p.path, label: pageName(p.path), value: p.n, sub: minutes(p.ms) }))} />
        <${Sec} title="نشست‌ها">
          <${Table} label="نشست‌ها" rows=${d.sessions} rowKey=${(r) => r.sid} cols=${[
            { key: 'start', label: 'آغاز', cell: (r) => when(r.start) },
            { key: 'len', label: 'طول', get: (r) => Date.parse(r.end) - Date.parse(r.start), cell: (r) => minutes(Date.parse(r.end) - Date.parse(r.start)) },
            { key: 'views', label: 'صفحه', num: true, cell: (r) => num(r.views) },
            { key: 'acts', label: 'کار', num: true, cell: (r) => num(r.acts) },
            { key: 'minutes', label: 'دقیقه‌ی دیده‌شده', num: true, cell: (r) => num(r.minutes) },
          ]} />
        </${Sec}>
        <${Sec} title="ورودها">
          <ol className="ow-feed">${d.auths.map((a, i) => jsx`<li key=${i}><time>${when(a.at)}</time><${Badge} ok=${a.ok}>${KIND[a.kind] ?? a.kind}</${Badge}><span>${VIA[a.via] ?? ''}</span><${Ltr}>${a.ip}</${Ltr}><span>${a.device}</span></li>`)}</ol>
        </${Sec}>
        <${Sec} title="کارها و صفحه‌ها" note="فقط نام صفحه و نام کار؛ هیچ مقداری که تایپ شده نگه داشته نمی‌شود.">
          <ol className="ow-feed">${d.events.filter((e) => e.kind !== 'beat').slice(0, 200).map((e, i) => jsx`<li key=${i}><time>${when(e.at)}</time><${Badge} ok=${e.kind === 'error' ? false : undefined}>${ACT[e.kind] ?? e.kind}</${Badge}><span>${pageName(e.path)}</span>${e.name ? jsx`<${Ltr}>${e.name}</${Ltr}>` : null}${e.kind === 'view' && e.ms ? jsx`<small>${minutes(e.ms)}</small>` : null}</li>`)}</ol>
        </${Sec}>`}</${View}>
    </div></div>`;
}

const BUCKETS = ['کمتر از ۱ دقیقه', '۱ تا ۵ دقیقه', '۵ تا ۱۵ دقیقه', '۱۵ تا ۳۰ دقیقه', '۳۰ تا ۶۰ دقیقه', 'بیش از ۶۰ دقیقه'];
function Behavior({ q, refresh }) {
  const st = useOwner(`/api/owner/behavior?${q}`, refresh);
  return jsx`<${View} st=${st}>${(d) => {
    const f = d.funnel;
    return jsx`<div className="ow-grid2">
        <${BarList} title="صفحه‌های پربازدید" note="بار: بازدید؛ کنارش میانگین زمان و شمار افراد" rows=${d.pages.map((p) => ({ key: p.path, label: pageName(p.path), hint: p.path, value: p.n, sub: `${minutes(p.ms / Math.max(1, p.n))} · ${num(p.people)} نفر` }))} />
        <${BarList} title="کارهای پرکاربرد" note="نام دکمه‌ای که زده شد" rows=${d.actions.map((a) => ({ key: a.name, label: jsx`<${Ltr}>${a.name}</${Ltr}>`, value: a.n, sub: `${num(a.people)} نفر` }))} />
      </div>
      <${Heat} title="ساعت‌های کار در هفته (به وقت تهران)" grid=${d.heat} />
      <div className="ow-grid2">
        <${BarList} title="طول نشست‌ها" note=${d.sessions.median != null ? `میانه ${num(d.sessions.median)} دقیقه از ${num(d.sessions.n)} نشست` : ''} rows=${d.sessions.buckets.map((n, i) => ({ key: i, label: BUCKETS[i], value: n }))} />
        <${BarList} title="دستگاه‌ها هنگام ورود" rows=${d.devices.map((x) => ({ key: x.device, label: x.device, value: x.n }))} />
        <${BarList} title="قیف فروشگاه‌های تازه" note="از ساخت تا بازگشت در هفته‌ی دوم" rows=${!f.made ? [] : [
          { key: 'made', label: 'ساخته شد', value: f.made },
          { key: 'in', label: 'نخستین ورود', value: f.signedIn, sub: pct(f.signedIn, f.made) },
          { key: 'doc', label: 'نخستین سند قطعی', value: f.firstDoc, sub: pct(f.firstDoc, f.made) },
          { key: 'w2', label: 'فعال در هفته‌ی دوم', value: f.week2, sub: pct(f.week2, f.made) },
        ]} empty="در این بازه فروشگاه تازه‌ای نیست." />
        <figure className="ow-fig"><figcaption className="ow-fig-h"><span>ماندگاری هفتگی</span><small>هر ردیف: کسانی که آن هفته نخستین بار دیده شدند؛ خانه‌ها: سهم بازگشته در هفته‌های بعد</small></figcaption>
          ${d.retention.length ? jsx`<div className="ow-scroll" tabIndex="0"><table className="ow-table ow-ret"><thead><tr><th scope="col">هفته‌ی آغاز</th><th scope="col">نفر</th>${d.retention[0].back.map((_, k) => jsx`<th scope="col" key=${k}>${k ? `+${num(k)}` : 'همان'}</th>`)}</tr></thead>
            <tbody>${d.retention.map((c) => jsx`<tr key=${c.week}><th scope="row">${jd(addDays(d.start, c.week * 7))}</th><td className="n">${num(c.people)}</td>${c.back.map((b, k) => jsx`<td key=${k} className="ow-rc" style=${{ '--p': `${Math.round((b / c.people) * 70)}%` }}>${pct(b, c.people)}</td>`)}</tr>`)}</tbody></table></div>` : jsx`<p className="ow-empty">هنوز داده‌ای نیست.</p>`}
        </figure>
      </div>`;
  }}</${View}>`;
}

function Shops({ q, refresh }) {
  const st = useOwner(`/api/owner/shops?${q}`, refresh);
  return jsx`<${View} st=${st}>${(d) => jsx`<${Sec} title=${`همه‌ی فروشگاه‌ها (${num(d.shops.length)})`} note=${`فقط شمار و جمع؛ هیچ سند یا مشتری باز نمی‌شود. محاسبه‌شده ${ago(d.cachedAt)}.`}>
    <${Table} label="فروشگاه‌ها" rows=${d.shops} rowKey=${(r) => r.id} initial=${{ key: 'lastActivity', dir: 'desc' }} cols=${[
      { key: 'name', label: 'فروشگاه', cell: (r) => jsx`<b>${r.name}</b>${r.main ? jsx` <${Badge}>اصلی</${Badge}>` : null}${r.by === 'signup' ? jsx` <${Badge}>ثبت‌نام آزاد</${Badge}>` : null}` },
      { key: 'status', label: 'وضعیت', cell: (r) => jsx`<${Badge} ok=${r.status === 'active' && !(r.expiresAt && r.expiresAt < new Date().toISOString().slice(0, 10))}>${r.status !== 'active' ? 'معلق' : r.expiresAt && r.expiresAt < new Date().toISOString().slice(0, 10) ? 'منقضی' : 'فعال'}</${Badge}>${r.expiresAt ? jsx`<small> تا ${jd(r.expiresAt)}</small>` : null}` },
      { key: 'users', label: 'کاربر', num: true, get: (r) => r.users.a, cell: (r) => num(r.users.a) },
      { key: 'made', label: 'سند در بازه', num: true, cell: (r) => num(r.made) },
      { key: 'turnover', label: 'گردش (ریال)', num: true, cell: (r) => compact(r.turnover) },
      { key: 'g750', label: 'طلای ۷۵۰ (گرم)', num: true, cell: (r) => r.g750.toLocaleString('fa-IR', { maximumFractionDigits: 3 }) },
      { key: 'out', label: 'چاپ · PDF · ارسال · اکسل', num: true, get: (r) => r.outputs.print + r.outputs.pdf + r.outputs.share + r.outputs.export, cell: (r) => `${num(r.outputs.print)} · ${num(r.outputs.pdf)} · ${num(r.outputs.share)} · ${num(r.outputs.export)}` },
      { key: 'pos', label: 'کارتخوان موفق', num: true, get: (r) => r.pos.ok, cell: (r) => num(r.pos.ok) },
      { key: 'ai', label: 'هوش مصنوعی', num: true, get: (r) => r.ai.calls, cell: (r) => num(r.ai.calls) },
      { key: 'lastActivity', label: 'آخرین فعالیت', cell: (r) => ago(r.lastActivity) },
    ]} />
  </${Sec}>`}</${View}>`;
}

function Io({ q, refresh }) {
  const st = useOwner(`/api/owner/io?${q}`, refresh);
  return jsx`<${View} st=${st}>${(d) => jsx`
    <${Sec} title="ورودی‌ها" note="آنچه به اپ وارد شد">
      <div className="ow-stats compact">
        <${Stat} label="سند ثبت‌شده" value=${num(d.inputs.created)} />
        <${Stat} label="اصلاح و نسخه‌ی تازه" value=${num(d.inputs.amended)} />
        <${Stat} label="ابطال" value=${num(d.inputs.voided)} />
        <${Stat} label="حساب تازه" value=${num(d.inputs.signups)} />
        <${Stat} label="عکس بارگذاری‌شده" value=${num(d.inputs.uploads)} />
      </div>
    </${Sec}>
    <${Sec} title="خروجی‌ها" note="آنچه از اپ بیرون رفت">
      <div className="ow-stats compact">
        <${Stat} label="چاپ" value=${num(d.outputs.print)} />
        <${Stat} label="PDF" value=${num(d.outputs.pdf)} />
        <${Stat} label="ارسال رسید" value=${num(d.outputs.share)} />
        <${Stat} label="خروجی اکسل" value=${num(d.outputs.export)} />
        <${Stat} label="کد ورود فرستاده‌شده" value=${num(d.outputs.codes)} />
        <${Stat} label="فراخوانی هوش مصنوعی" value=${num(d.outputs.aiCalls)} />
        <${Stat} label="ابزار MCP" value=${num(d.outputs.mcp)} />
      </div>
    </${Sec}>
    <${Trend} title="ورودی و خروجی در هر روز" dayList=${d.dayList} series=${[{ key: 'in', label: 'ورودی', values: d.series.in, tone: 1 }, { key: 'out', label: 'خروجی', values: d.series.out, tone: 2 }]} />
    <div className="ow-grid2">
      <${BarList} title="کدهای ورود بر حسب راه" rows=${d.codesByVia.map((c) => ({ key: `${c.via}${c.ok}`, label: `${VIA[c.via] ?? c.via}${c.ok ? '' : ' (ناموفق)'}`, value: c.n }))} empty="کدی فرستاده نشد." />
      <${BarList} title="ابزارهای MCP" rows=${d.mcpTools.map((t) => ({ key: t.name, label: jsx`<${Ltr}>${t.name}</${Ltr}>`, value: t.n }))} empty="دستیاری از راه MCP کار نکرد." />
    </div>
    ${d.market ? jsx`<p className="ow-foot">قیمت بازار: منبع <${Ltr}>${d.market.mode}</${Ltr}> · ${num(d.market.quotes)} قیمت · سهمیه‌ی امروز ${num(d.market.quota?.used)} از ${num(d.market.quota?.daily)} · ${num(d.market.days)} روز تاریخچه</p>` : null}`}</${View}>`;
}

function Live({ feed, state, on }) {
  const [only, setOnly] = useState('');
  const rows = only ? feed.filter((e) => e.type === only) : feed;
  return jsx`<div className="ow-tools"><p className=${`ow-conn ${state}`} role="status">${!on ? 'زنده خاموش است؛ کلید «زنده» را روشن کنید.' : state === 'on' ? 'وصل؛ هر ورود و هر کار همین‌جا می‌آید.' : state === 'off' ? 'اجازه‌ی جریان زنده نیست.' : 'در حال وصل شدن…'}</p>
      <div className="ow-seg" role="group" aria-label="کدام رویدادها">${[['', 'همه'], ['auth', 'ورود'], ['act', 'کار']].map(([v, t]) => jsx`<button type="button" key=${v} aria-pressed=${only === v} onClick=${() => setOnly(v)}>${t}</button>`)}</div></div>
    ${rows.length ? jsx`<ol className="ow-feed live">${rows.map((e) => jsx`<li key=${e.k}><time>${timeFa(e.at)}</time>${e.type === 'auth'
      ? jsx`<${Badge} ok=${e.ok}>${KIND[e.kind] ?? e.kind}</${Badge}><b>${e.who}</b><span>${e.shop}</span><span>${VIA[e.via] ?? ''}</span><${Ltr}>${e.ip}</${Ltr}><span>${e.device}</span>`
      : jsx`<${Badge}>${Object.entries(e.kinds ?? {}).map(([k, n]) => `${ACT[k] ?? k} ${num(n)}`).join(' · ')}</${Badge}><b>${e.who}</b><span>${e.shop}</span><span>${pageName(e.path)}</span>${e.name ? jsx`<${Ltr}>${e.name}</${Ltr}>` : null}`}</li>`)}</ol>`
      : jsx`<p className="ow-empty">${on ? 'هنوز رویدادی نرسیده؛ هر ورود یا هر کاری در اپ همین‌جا دیده می‌شود.' : ''}</p>`}`;
}

/* ---------------- the page ---------------- */
export function OwnerApp() {
  const saved = useMemo(readPrefs, []);
  const fromUrl = new URLSearchParams(location.search).get('t');
  const [tab, setTab] = useState(TABS.some(([k]) => k === fromUrl) ? fromUrl : saved.tab && TABS.some(([k]) => k === saved.tab) ? saved.tab : 'overview');
  const [days, setDays] = useState(Math.max(1, Math.min(180, Number(saved.days) || 30)));
  const [self, setSelf] = useState(!!saved.self);
  const [live, setLive] = useState(saved.live !== false);
  const [refresh, setRefresh] = useState(0);
  const [feed, setFeed] = useState([]);
  const [conn, setConn] = useState('wait');
  const [who, setWho] = useState(null);
  const opener = useRef(null);
  const q = `days=${days}&self=${self ? 1 : 0}`;
  useEffect(() => {
    writePrefs({ tab, days, self, live });
    const u = new URL(location.href);
    u.searchParams.set('t', tab);
    history.replaceState(null, '', `${u.pathname}${u.search}`);
  }, [tab, days, self, live]);
  // the live feed: every event lands in «زنده», and the open view reads its numbers again a few seconds later
  useEffect(() => {
    if (!live) return undefined;
    let timer = null, k = 0;
    const stop = ownerFeed((type, data) => {
      if (type === 'hello') return;
      setFeed((f) => [{ ...data, type, k: `${Date.now()}-${k++}` }, ...f].slice(0, 150));
      clearTimeout(timer);
      timer = setTimeout(() => setRefresh((n) => n + 1), 4000);
    }, setConn);
    return () => (clearTimeout(timer), stop(), setConn('wait'));
  }, [live]);
  const open = useCallback((r, el) => ((opener.current = el), setWho(r)), []);
  const close = useCallback(() => (setWho(null), opener.current?.focus()), []);
  const exportCsv = async (what) => {
    try {
      const r = await api(`/api/owner/export?what=${what}&${q}`);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([r.text], { type: `${r.mime};charset=utf-8` }));
      a.download = r.filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (e) {
      toast(e.message, 'error');
    }
  };
  const items = [...TABS].reverse().map(([value, label]) => ({ value, label: jsx`<span className="ow-tab" title=${label}>${ICON[value]}<span className="ow-tab-t">${label}</span></span>` }));
  const views = { overview: Overview, signups: Signups, logins: Logins, users: Users, behavior: Behavior, shops: Shops, io: Io };
  const Cur = views[tab];
  return jsx`<div className="ow" dir="rtl">
    <${Glass} className="ow-head">
      <div className="ow-title"><h1>دیده‌بان</h1><p>همه‌ی اپ از نگاه مالک: ثبت‌نام، ورود، رفتار کاربران و هر آنچه وارد و خارج می‌شود.</p></div>
      <div className="ow-actions">
        <span className=${`ow-pill ${live && conn === 'on' ? 'on' : ''}`} role="status">${live ? (conn === 'on' ? 'زنده' : 'در حال وصل شدن') : 'زنده خاموش'}</span>
        <${Button} icon=${ICON.reload} aria-label="خواندن دوباره" onClick=${() => setRefresh((n) => n + 1)} />
        <${Button} icon=${ICON.skin} aria-label="پوسته‌ی روشن یا تیره" onClick=${() => flipSkin()} />
        <${Menu} aria-label="خروجی CSV" icon=${ICON.csv} align="end" items=${[
          { label: 'ورودها (CSV)', onSelect: () => exportCsv('logins') },
          { label: 'کاربران (CSV)', onSelect: () => exportCsv('users') },
          { label: 'فروشگاه‌ها (CSV)', onSelect: () => exportCsv('shops') },
          { label: 'ثبت‌نام‌ها (CSV)', onSelect: () => exportCsv('signups') },
        ]} />
        <${Button} icon=${ICON.back} onClick=${() => navigate('/')}>بازگشت به اپ</${Button}>
      </div>
    </${Glass}>
    <${Glass} className="ow-filters">
      <div className="ow-range"><span className="ow-range-l" id="owDaysL">بازه: <b>${days === 1 ? 'امروز' : `${num(days)} روز`}</b></span>
        <div className="ow-seg" role="group" aria-label="بازه‌های آماده">${[1, 7, 30, 90, 180].map((d) => jsx`<button type="button" key=${d} aria-pressed=${days === d} onClick=${() => setDays(d)}>${d === 1 ? 'امروز' : num(d)}</button>`)}</div>
        <${Slider} className="ow-slider" min=${1} max=${180} step=${1} value=${days} onValueChange=${(v) => setDays(Math.round(v))} aria-labelledby="owDaysL" />
      </div>
      <label className="ow-sw"><${Switch} checked=${self} onCheckedChange=${setSelf} aria-label="فعالیت خودم را هم بشمار" /><span>فعالیت خودم را هم بشمار</span></label>
      <label className="ow-sw"><${Switch} checked=${live} onCheckedChange=${setLive} aria-label="زنده" /><span>زنده</span></label>
    </${Glass}>
    <div className="ow-tabs" dir="ltr"><${TabBar} items=${items} value=${tab} onValueChange=${setTab} aria-label="بخش‌های دیده‌بان" /></div>
    <main className="ow-main" role="tabpanel" aria-label=${TABS.find(([k]) => k === tab)[1]}>
      ${tab === 'live' ? jsx`<${Live} feed=${feed} state=${conn} on=${live} />` : tab === 'users' ? jsx`<${Users} q=${q} refresh=${refresh} open=${open} />` : jsx`<${Cur} q=${q} refresh=${refresh} />`}
    </main>
    ${who ? jsx`<${Drawer} who=${who} q=${q} onClose=${close} />` : null}
    <p className="ow-foot">ورود و فعالیت در اپ برای امنیت و پشتیبانی ثبت می‌شود؛ داده‌ی خام ۱۸۰ روز می‌ماند و بعد فقط جمع روزانه. سند و مشتری هیچ فروشگاهی اینجا باز نمی‌شود.</p>
  </div>`;
}
