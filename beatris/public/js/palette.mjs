// فرمان سریع (spec 0002 #15): Ctrl+K (or ⌘K, or «/» outside a field) anywhere in the app. A few words find a page,
// an action, a customer, a document by its tracking code, a bar serial or a passage of the manual. Arrow keys move,
// Enter opens, Esc closes. Pages and actions are matched here; people, documents and the manual on the server.
import { html, api, navigate, store } from './core.mjs';

const norm = (s) => String(s ?? '').replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/‌/g, ' ').replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).toLowerCase().trim();
// [title, href, keywords, group, adminOnly]
const COMMANDS = [
  ['کنترل: نبض طلا و «چه تغییر کرد؟»', '/books/control', 'کنترل نبض تغییر امروز خلاصه', 'کنترل', true],
  ['مرکز استثناها', '/books/control?t=exceptions', 'استثنا مشکوک هشدار منفی تخفیف زیر بها', 'کنترل', true],
  ['شبیه‌ساز معامله و محاسبه فروش امن', '/books/control?t=simulate', 'شبیه ساز سناریو اگه بفروشم فروش امن', 'کنترل', true],
  ['ماشین زمان و دوقلوی دیجیتال', '/books/control?t=twin', 'ماشین زمان دوقلو وضعیت روز گذشته', 'کنترل', true],
  ['سری طلاها و ردیابی هر گرم', '/books/control?t=lots', 'سری لات ردیابی گرم fifo سود سری', 'کنترل', true],
  ['تایم‌لاین دفتر کل و داستان مشتری', '/books/control?t=story', 'تایم لاین داستان مشتری دفتر کل کالا', 'کنترل', true],
  ['تراز دوتایی وزنی و ریالی', '/books/control?t=trial', 'تراز دوتایی وزنی ریالی گرم', 'کنترل', true],
  ['پیش‌بینی ۱۰ روزه نقد و طلا', '/books/control?t=forecast', 'پیش بینی ۱۰ روز نقد طلا چک سررسید', 'کنترل', true],
  ['تأییدها و کنترل چهار چشم', '/books/control?t=approvals', 'تایید مدیر چهار چشم درخواست', 'کنترل', true],
  ['قفل دوره مالی', '/books/control?t=periods', 'قفل دوره ماه بستن ماه', 'کنترل', true],
  ['بستن خودکار روز', '/books/control?t=close', 'بستن خودکار تطبیق شبانه مغایرت', 'کنترل', true],
  ['موتور تبدیل عیار', '/books/control?t=karat', 'عیار تبدیل خالص مثقال قیراط ۷۵۰', 'ابزار', false],
  ['میز معامله', '/books/desk', 'میز معامله خرید فروش سکه آبشده ثبت', 'کار روزانه', false],
  ['روزنگار', '/books/day', 'روزنگار امروز اسناد روز', 'کار روزانه', false],
  ['مشتریان', '/books/parties', 'مشتری طرف حساب بدهکار بستانکار', 'کار روزانه', false],
  ['گاوصندوق', '/books/vault', 'گاوصندوق موجودی طلا سکه شمش', 'کار روزانه', false],
  ['شمش‌ها', '/books/bars', 'شمش سریال پلمپ', 'کار روزانه', false],
  ['صندوق، بانک، چک', '/books/cash', 'صندوق بانک چک نقد', 'کار روزانه', false],
  ['رهگیری سند', '/books/trace', 'رهگیری کد سند اصالت', 'کار روزانه', false],
  ['داشبورد مدیریت', '/books/dashboard', 'داشبورد مدیریت نمودار', 'گزارش', true],
  ['گزارش سود و زیان', '/books/reports?tab=pnl', 'سود زیان گزارش', 'گزارش', true],
  ['ممیز و تاجیار', '/books/audit', 'ممیز دستیار تاجیار', 'گزارش', false],
  ['بستن روز', '/books/smart?t=close', 'بستن روز امضا شمارش', 'کار روزانه', true],
  ['تطبیق با همکار', '/books/peers', 'همکار تطبیق', 'کنترل', true],
  ['راهنمای تصویری', '/help', 'راهنما فیلم آموزش ویدیو', 'راهنما', false],
];

let root = null;
let state = null;

function open(initial = '') {
  if (root) return;
  state = { q: initial, items: [], sel: 0, timer: null, seq: 0 };
  root = document.createElement('div');
  root.className = 'pal-back';
  root.innerHTML = String(html`<div class="pal" role="dialog" aria-modal="true" aria-label="فرمان سریع"><div class="pal-in"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/></svg><input id="palQ" placeholder="چند کلمه: نام مشتری، کد سند، «فروش امن»، «عیار»…" autocomplete="off" aria-label="جستجو" value="${initial}"><kbd>Esc</kbd></div><ul class="pal-list" id="palL" role="listbox"></ul><p class="pal-foot"><kbd>↑</kbd><kbd>↓</kbd> حرکت · <kbd>Enter</kbd> باز کردن · <kbd>Ctrl</kbd>+<kbd>K</kbd> هر جای برنامه</p></div>`);
  document.body.append(root);
  const input = root.querySelector('#palQ');
  input.focus();
  input.select();
  input.addEventListener('input', () => search(input.value));
  input.addEventListener('keydown', onKey);
  root.addEventListener('mousedown', (e) => e.target === root && close());
  root.querySelector('#palL').addEventListener('click', (e) => {
    const li = e.target.closest('[data-i]');
    if (li) go(Number(li.dataset.i));
  });
  search(initial);
}
function close() {
  root?.remove();
  root = null;
  clearTimeout(state?.timer);
}
function go(i) {
  const it = state.items[i];
  if (!it) return;
  close();
  navigate(it.href);
}
function onKey(e) {
  if (e.key === 'Escape') return close();
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const n = state.items.length;
    if (!n) return;
    state.sel = (state.sel + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
    draw();
    root.querySelector('.pal-list .on')?.scrollIntoView({ block: 'nearest' });
  }
  if (e.key === 'Enter') {
    e.preventDefault();
    go(state.sel);
  }
}
function local(q) {
  const admin = store.isAdmin?.() ?? false;
  const words = norm(q).split(/\s+/).filter(Boolean);
  const list = COMMANDS.filter((c) => admin || !c[4]);
  if (!words.length) return list.slice(0, 9).map((c) => ({ kind: 'page', title: c[0], sub: c[3], href: c[1] }));
  return list
    .map((c) => {
      const hay = norm(`${c[0]} ${c[2]}`);
      const hits = words.filter((w) => hay.includes(w)).length;
      return { c, hits };
    })
    .filter((x) => x.hits)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 6)
    .map(({ c }) => ({ kind: 'page', title: c[0], sub: c[3], href: c[1] }));
}
function search(q) {
  state.q = q;
  state.items = local(q);
  state.sel = 0;
  draw();
  clearTimeout(state.timer);
  if (norm(q).length < 2) return;
  const seq = ++state.seq;
  state.timer = setTimeout(async () => {
    try {
      const r = await api(`/api/books/control/find?q=${encodeURIComponent(q)}`);
      if (!root || seq !== state.seq) return;
      state.items = [...local(q), ...r.items];
      draw();
    } catch {
      /* the local list is still there */
    }
  }, 180);
}
const KIND = { page: 'صفحه', party: 'مشتری', doc: 'سند', help: 'راهنما' };
function draw() {
  const ul = root?.querySelector('#palL');
  if (!ul) return;
  ul.innerHTML = state.items.length
    ? state.items.map((it, i) => String(html`<li role="option" data-i="${i}" class="${i === state.sel ? 'on' : ''}" aria-selected="${i === state.sel}"><em class="k-${it.kind}">${KIND[it.kind] ?? it.kind}</em><span><b>${it.title}</b>${it.sub ? html`<small>${it.sub}</small>` : ''}</span></li>`)).join('')
    : String(html`<li class="pal-empty">چیزی پیدا نشد؛ نام مشتری، کد رهگیری (مثل M1405-00012) یا نام یک ابزار را بنویسید.</li>`);
}

let wired = false;
export function initPalette() {
  if (wired) return;
  wired = true;
  document.addEventListener('keydown', (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName ?? '') || document.activeElement?.isContentEditable;
    if ((e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (!store.me) return;
      root ? close() : open();
    } else if (e.key === '/' && !typing && !root && store.me) {
      e.preventDefault();
      open();
    }
  });
}
export const openPalette = (q = '') => store.me && open(q);
