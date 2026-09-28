import { html, $, route, render, setShell, store, ROLE_FA } from './core.mjs';
import { ICON, brandMark } from './ui.mjs';
import { SHOP_NAME } from './crown.mjs';

const lazy = (mod, fn) => async (root, params) => (await import(mod))[fn](root, params);

route('/login', lazy('./pages/login.mjs', 'loginPage'), { public: true, bare: true, tone: 'full' });
route('/intro', lazy('./pages/intro.mjs', 'introPage'), { public: true, bare: true, tone: 'full' });
route('/', lazy('./pages/home.mjs', 'homePage'), { tab: 'home', tone: 'full' });
route('/learn', lazy('./pages/learn.mjs', 'learnPage'), { tab: 'learn' });
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
route('/market/data', lazy('./pages/marketdata.mjs', 'marketDataPage'), { tab: 'market', staff: true, tone: 'wide' });
route('/books', lazy('./pages/books.mjs', 'booksHome'), { tab: 'books', tone: 'wide' });
route('/books/desk', lazy('./pages/desk.mjs', 'deskPage'), { tab: 'books', tone: 'wide' });
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
route('/books/stock', lazy('./pages/bookmgmt.mjs', 'stockPage'), { tab: 'books', tone: 'wide' });
route('/books/cash', lazy('./pages/bookmgmt.mjs', 'cashPage'), { tab: 'books', tone: 'wide' });
route('/books/reports', lazy('./pages/bookmgmt.mjs', 'reportsPage'), { tab: 'books', tone: 'wide' });
route('/books/settings', lazy('./pages/bookmgmt.mjs', 'settingsPage'), { tab: 'books', tone: 'wide' });
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
  top.hidden = false;
  const shop = store.me?.brand?.shopName || SHOP_NAME;
  top.innerHTML = String(html`<a class="brand" href="/" data-link>${brandMark}<span class="brand-t"><b>${shop}</b><small>بئاتریس · حساب و آموزش</small></span></a><a class="who" href="/me" data-link style="text-decoration:none"><span>${u?.name} · ${ROLE_FA[u?.role] ?? ''}</span><i>${(u?.name ?? '؟').trim()[0]}</i></a>`);
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

render();

if ('serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
