import { html, $, route, render, setShell, store, ROLE_FA } from './core.mjs';
import { ICON, brandMark } from './ui.mjs';

const lazy = (mod, fn) => async (root, params) => (await import(mod))[fn](root, params);

route('/login', lazy('./pages/login.mjs', 'loginPage'), { public: true, bare: true, tone: 'full' });
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
route('/tools/:id', lazy('./pages/tools.mjs', 'toolPage'), { tab: 'tools' });
route('/studio', lazy('./pages/studio3d.mjs', 'studioPage'), { tab: 'studio', tone: 'full' });
route('/history', lazy('./pages/history.mjs', 'historyPage'), { tab: 'learn', tone: 'full' });
route('/library', lazy('./pages/library.mjs', 'libraryPage'), { tab: 'me' });
route('/sop/:id', lazy('./pages/library.mjs', 'sopPage'), { tab: 'me' });
route('/me', lazy('./pages/me.mjs', 'mePage'), { tab: 'me' });
route('/staff', lazy('./pages/team.mjs', 'teamPage'), { tab: 'team', staff: true, tone: 'wide' });
route('/staff/queue', lazy('./pages/team.mjs', 'queuePage'), { tab: 'team', staff: true });
route('/staff/settings', lazy('./pages/team.mjs', 'settingsPage'), { tab: 'team', staff: true });
route('/staff/:id', lazy('./pages/team.mjs', 'memberPage'), { tab: 'team', staff: true, tone: 'wide' });

setShell((opts) => {
  const top = $('#topbar');
  const nav = $('#tabbar');
  if (opts.bare) {
    top.hidden = true;
    nav.hidden = true;
    return;
  }
  const u = store.me?.user;
  top.hidden = false;
  top.innerHTML = String(html`<a class="brand" href="/" data-link>${brandMark}<span>بئاتریس</span></a><a class="who" href="/me" data-link style="text-decoration:none"><span>${u?.name} · ${ROLE_FA[u?.role] ?? ''}</span><i>${(u?.name ?? '؟').trim()[0]}</i></a>`);
  const tabs = [
    ['home', '/', 'خانه', ICON.home],
    ['learn', '/learn', 'آموزش', ICON.learn],
    ['practice', '/practice', 'تمرین', ICON.practice],
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
