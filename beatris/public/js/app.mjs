import { html, raw, $, route, render, setShell, store, ROLE_FA } from './core.mjs';
import { ICON, brandMark } from './ui.mjs';
import { SHOP_NAME } from './crown.mjs';
import { startHarness } from './harness.mjs';
import { initPalette, openPalette } from './palette.mjs';
import { initExplain } from './explain.mjs';
import { initInstall, install, canInstall } from './install.mjs';
import { sunrise } from './light.mjs';
import { pending, onOutbox } from './outbox.mjs';

/* ---------- پوسته: آرام (default), روز, کلاسیک — remembered per device ---------- */
const THEMES = ['calm', 'day', 'classic'];
const THEME_FA = { calm: 'شب آرام', day: 'روز', classic: 'کلاسیک طلایی' };
const THEME_ICON = {
  calm: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/></svg>',
  day: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  classic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 17h16l-1.5-9-4 4L12 6l-2.5 6-4-4Z"/><path d="M4 20h16"/></svg>',
};
const theme = () => {
  try {
    const t = localStorage.getItem('beatris.theme');
    return THEMES.includes(t) ? t : 'calm';
  } catch {
    return 'calm';
  }
};
function saveTheme(t) {
  try {
    localStorage.setItem('beatris.theme', t);
  } catch {
    /* storage unavailable */
  }
}
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'day' ? '#f4f1ea' : t === 'classic' ? '#0d0b08' : '#13171c');
}
applyTheme(theme());

/** وضعیت اتصال و صف ارسال (spec 0013): always in view, so nobody wonders whether a document went through. */
async function netPill() {
  const el = document.getElementById('netPill');
  if (!el) return;
  const n = (await pending().catch(() => [])).length;
  const off = typeof navigator !== 'undefined' && navigator.onLine === false;
  el.hidden = !n && !off;
  el.className = `net-pill ${off ? 'off' : n ? 'queued' : ''}`;
  el.innerHTML = `<i aria-hidden="true"></i>${off ? 'بدون اینترنت' : ''}${off && n ? ' · ' : ''}${n ? `${String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d])} سند در صف ارسال` : off ? ' — کار روی همین دستگاه ذخیره می‌شود' : ''}`;
}
onOutbox(() => netPill());
addEventListener('online', netPill);
addEventListener('offline', netPill);

const lazy = (mod, fn) => async (root, params) => (await import(mod))[fn](root, params);

route('/login', lazy('./pages/login.mjs', 'loginPage'), { public: true, bare: true, tone: 'full' });
route('/join', lazy('./pages/join.mjs', 'joinPage'), { public: true, bare: true, tone: 'full' });
route('/intro', lazy('./pages/intro.mjs', 'introPage'), { public: true, bare: true, tone: 'full' });
route('/intro/:tab', lazy('./pages/intro.mjs', 'introPage'), { public: true, bare: true, tone: 'full' });
route('/', lazy('./pages/home.mjs', 'homePage'), { tab: 'home', tone: 'full' });
route('/learn', lazy('./pages/learn.mjs', 'learnPage'), { tab: 'learn' });
route('/train/accounting', lazy('./pages/acctrain.mjs', 'accountingPage'), { tab: 'learn', tone: 'wide' });
route('/train/team', lazy('./pages/acctrain.mjs', 'trainingTeamPage'), { tab: 'learn', tone: 'wide', staff: true });
route('/learn/:id', lazy('./pages/learn.mjs', 'coursePage'), { tab: 'learn' });
route('/lesson/:id', lazy('./pages/learn.mjs', 'lessonPage'), { tab: 'learn', tone: 'paper-page' });
route('/exam/:id', lazy('./pages/exam.mjs', 'examPage'), { tab: 'learn' });
route('/practice', lazy('./pages/practice.mjs', 'practicePage'), { tab: 'practice' });
route('/scenario/:id', lazy('./pages/practice.mjs', 'scenarioPage'), { tab: 'practice' });
route('/cards', lazy('./pages/practice.mjs', 'cardsPage'), { tab: 'practice' });
route('/drill', lazy('./pages/practice.mjs', 'drillPage'), { tab: 'practice' });
route('/tools', lazy('./pages/tools.mjs', 'toolsPage'), { tab: 'tools' });
route('/tools/melt', lazy('./pages/melttool.mjs', 'meltToolPage'), { tab: 'tools' });
route('/tools/inspect', lazy('./pages/inspect.mjs', 'inspectPage'), { tab: 'tools' });
route('/tools/:id', lazy('./pages/tools.mjs', 'toolPage'), { tab: 'tools' });
route('/ledger', lazy('./pages/ledger.mjs', 'ledgerPage'), { tab: 'practice' });
route('/market', lazy('./pages/market.mjs', 'marketPage'), { tab: 'market', tone: 'wide' });
route('/market/elliott', lazy('./pages/elliott.mjs', 'elliottPage'), { tab: 'market', tone: 'full' });
route('/market/data', lazy('./pages/marketdata.mjs', 'marketDataPage'), { tab: 'market', staff: true, tone: 'wide' });
route('/books', lazy('./pages/books.mjs', 'booksHome'), { tab: 'books', tone: 'wide' });
route('/books/desk', lazy('./pages/desk.mjs', 'deskPage'), { tab: 'books', tone: 'wide' });
route('/books/dashboard', lazy('./pages/dashboard.mjs', 'dashboardPage'), { tab: 'books', tone: 'full', bare: true });
route('/books/memory', lazy('./pages/memory.mjs', 'memoryPage'), { tab: 'books', tone: 'wide' });
route('/books/pulse', lazy('./pages/pulse.mjs', 'pulsePage'), { tab: 'books', tone: 'wide' });
route('/books/trace', lazy('./pages/trace.mjs', 'tracePage'), { tab: 'books', tone: 'wide' });
route('/books/audit', lazy('./pages/auditor.mjs', 'auditPage'), { tab: 'books', tone: 'wide' });
route('/books/day', lazy('./pages/deskmore.mjs', 'dayPage'), { tab: 'books', tone: 'wide' });
route('/books/vault', lazy('./pages/deskmore.mjs', 'vaultPage'), { tab: 'books', tone: 'wide' });
route('/books/bars', lazy('./pages/deskmore.mjs', 'barsPage'), { tab: 'books', tone: 'wide' });
route('/books/bank/:id', lazy('./pages/deskmore.mjs', 'bankPage'), { tab: 'books', tone: 'wide' });
route('/books/new/:type', lazy('./pages/bookdoc.mjs', 'docEditorPage'), { tab: 'books', tone: 'wide' });
route('/books/doc/:id/edit', lazy('./pages/bookdoc.mjs', 'docEditorPage'), { tab: 'books', tone: 'wide' });
route('/books/doc/:id', lazy('./pages/books.mjs', 'docPage'), { tab: 'books', tone: 'wide' });
route('/books/docs', lazy('./pages/books.mjs', 'docsPage'), { tab: 'books', tone: 'wide' });
route('/books/log', lazy('./pages/books.mjs', 'logPage'), { tab: 'books', tone: 'wide' });
route('/books/parties', lazy('./pages/bookmgmt.mjs', 'partiesPage'), { tab: 'books', tone: 'wide' });
route('/books/party/:id', lazy('./pages/bookmgmt.mjs', 'partyPage'), { tab: 'books', tone: 'wide' });
route('/books/ai', lazy('./pages/aikeys.mjs', 'aiKeysPage'), { tab: 'books', tone: 'wide', staff: true });
route('/books/smart', lazy('./pages/smart.mjs', 'smartPage'), { tab: 'books', tone: 'wide' });
route('/books/control', lazy('./pages/control.mjs', 'controlPage'), { tab: 'books', tone: 'wide' });
route('/books/elliott', lazy('./pages/elliott.mjs', 'elliottPage'), { tab: 'books', tone: 'full' });
route('/books/peers', lazy('./pages/peers.mjs', 'peersPage'), { tab: 'books', tone: 'wide' });
route('/books/products', lazy('./pages/products.mjs', 'productsPage'), { tab: 'books', tone: 'wide' });
route('/books/stock', lazy('./pages/bookmgmt.mjs', 'stockPage'), { tab: 'books', tone: 'wide' });
route('/books/cash', lazy('./pages/bookmgmt.mjs', 'cashPage'), { tab: 'books', tone: 'wide' });
route('/books/reports', lazy('./pages/bookmgmt.mjs', 'reportsPage'), { tab: 'books', tone: 'wide' });
route('/books/settings', lazy('./pages/bookmgmt.mjs', 'settingsPage'), { tab: 'books', tone: 'wide' });
route('/help', lazy('./pages/help.mjs', 'helpPage'), { tab: 'books', tone: 'wide' });
route('/setup', lazy('./pages/setup.mjs', 'setupPage'), { tab: 'books', tone: 'wide', setup: true });
route('/ops', lazy('./pages/ops.mjs', 'opsPage'), { tab: 'team', tone: 'wide', vendor: true });
route('/vendor', lazy('./pages/vendor.mjs', 'vendorPage'), { tab: 'team', tone: 'wide', vendor: true });
route('/s/:token', lazy('./pages/statement.mjs', 'statementPage'), { public: true, bare: true, tone: 'full' });
route('/verify/:code', lazy('./pages/books.mjs', 'verifyPage'), { public: true, bare: true });
route('/studio', lazy('./pages/studio3d.mjs', 'studioPage'), { tab: 'studio', tone: 'full' });
route('/coins', lazy('./pages/coinlab.mjs', 'coinLabPage'), { tab: 'tools', tone: 'full' });
route('/coins/manage', lazy('./pages/coinphotos.mjs', 'coinPhotosPage'), { tab: 'tools', staff: true });
route('/history', lazy('./pages/history.mjs', 'historyPage'), { tab: 'learn', tone: 'full' });
route('/library', lazy('./pages/library.mjs', 'libraryPage'), { tab: 'me' });
route('/sop/:id', lazy('./pages/library.mjs', 'sopPage'), { tab: 'me' });
route('/me', lazy('./pages/me.mjs', 'mePage'), { tab: 'me' });
route('/staff', lazy('./pages/team.mjs', 'teamPage'), { tab: 'team', staff: true, tone: 'wide' });
route('/staff/queue', lazy('./pages/team.mjs', 'queuePage'), { tab: 'team', staff: true });
route('/staff/settings', lazy('./pages/team.mjs', 'settingsPage'), { tab: 'team', staff: true });
route('/staff/leads', lazy('./pages/team.mjs', 'leadsPage'), { tab: 'team', staff: true });
route('/staff/access', lazy('./pages/access.mjs', 'accessPage'), { tab: 'team', staff: true });
route('/staff/:id', lazy('./pages/team.mjs', 'memberPage'), { tab: 'team', staff: true, tone: 'wide' });

setShell((opts) => {
  const top = $('#topbar');
  const nav = $('#tabbar');
  document.body.classList.toggle('bare', !!opts.bare);
  if (opts.bare) {
    top.hidden = true;
    nav.hidden = true;
    return;
  }
  const u = store.me?.user;
  if (u) startHarness();
  top.hidden = false;
  const shop = store.me?.brand?.shopName || SHOP_NAME;
  top.innerHTML = String(html`<a class="brand" href="/" data-link>${brandMark}<span class="brand-t"><b>${shop}</b><small>بئاتریس · حساب و آموزش</small></span></a><span class="who"><span class="net-pill" id="netPill" hidden role="status" aria-live="polite"></span><button class="theme-btn" id="palBtn" title="فرمان سریع (Ctrl+K)" aria-label="فرمان سریع"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/></svg></button><a class="theme-btn help-btn" href="/help" data-link title="راهنمای تصویری" aria-label="راهنمای تصویری"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M10 9l5 3-5 3Z"/></svg></a>${canInstall() ? html`<button class="theme-btn" id="insBtn" title="نصب اپ روی همین دستگاه" aria-label="نصب اپ روی همین دستگاه"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 4v11m0 0-4-4m4 4 4-4"/><path d="M5 19h14"/></svg></button>` : ''}<button class="theme-btn" id="themeBtn" title="پوسته: ${THEME_FA[theme()]}" aria-label="تغییر پوسته (${THEME_FA[theme()]})">${raw(THEME_ICON[theme()])}</button><a class="who" href="/me" data-link style="text-decoration:none"><span>${u?.name} · ${ROLE_FA[u?.role] ?? ''}</span><i>${(u?.name ?? '؟').trim()[0]}</i></a></span>`);
  netPill();
  $('#palBtn', top)?.addEventListener('click', () => openPalette());
  $('#insBtn', top)?.addEventListener('click', () => install());
  $('#themeBtn', top)?.addEventListener('click', (e) => {
    const next = THEMES[(THEMES.indexOf(theme()) + 1) % THEMES.length];
    const b = e.currentTarget, r = b.getBoundingClientRect();
    saveTheme(next); // at once: a second tap during the sunrise moves on from here
    sunrise(() => applyTheme(next), r.left + r.width / 2, r.top + r.height / 2);
    b.innerHTML = THEME_ICON[next];
    b.title = `پوسته: ${THEME_FA[next]}`;
    b.setAttribute('aria-label', `تغییر پوسته (${THEME_FA[next]})`);
  });
  const tabs = [
    ['home', '/', 'خانه', ICON.home],
    ['learn', '/learn', 'آموزش', ICON.learn],
    ['practice', '/practice', 'تمرین', ICON.practice],
    ['market', '/market', 'بازار', ICON.chart],
    ['books', '/books', 'حساب', ICON.book],
    ['studio', '/studio', 'استودیو', ICON.cube],
    ['tools', '/tools', 'ابزار', ICON.tools],
  ];
  if (store.isStaff()) tabs.push(['team', '/staff', 'تیم', ICON.team]);
  else tabs.push(['me', '/me', 'من', ICON.me]);
  nav.hidden = false;
  nav.innerHTML = String(html`${tabs.map(([k, href, label, icon]) => html`<a href="${href}" data-link ${opts.tab === k ? html`aria-current="page"` : ''}>${icon}<span>${label}</span></a>`)}`);
});

initPalette();
initInstall();
initExplain();
render();

if ('serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
