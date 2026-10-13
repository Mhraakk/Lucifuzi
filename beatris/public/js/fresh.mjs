// نسخه‌ی تازه (spec 0036): a deploy reaches a page that is already open. The server names its build in /api/health;
// the page keeps the build it started with and asks again when it comes back into view, after each page it opens,
// and every five minutes. On the sign-in page, with nothing typed yet, a new build reloads at once; anywhere else a
// small bar offers the reload, so no half-entered document is lost.
const EVERY = 5 * 60 * 1000;
let first = null;
let last = 0;
let offered = false;

async function buildNow() {
  try {
    const r = await fetch('/api/health', { cache: 'no-store' });
    return r.ok ? ((await r.json()).build ?? null) : null;
  } catch {
    return null; // offline: nothing to compare
  }
}
const untouched = () => location.pathname === '/login' && ![...document.querySelectorAll('input')].some((i) => i.value.trim());

function offer() {
  if (offered) return;
  offered = true;
  const bar = document.createElement('div');
  bar.className = 'fresh-bar';
  bar.setAttribute('role', 'status');
  bar.innerHTML = '<span>نسخه‌ی تازه‌ی بئاتریس آماده است.</span><button type="button" class="btn small">به‌روزرسانی</button>';
  bar.querySelector('button').addEventListener('click', () => location.reload());
  document.body.append(bar);
}

export async function checkBuild({ force = false } = {}) {
  if (!force && Date.now() - last < 30_000) return;
  last = Date.now();
  const b = await buildNow();
  if (!b) return;
  if (!first) first = b;
  else if (b !== first) untouched() ? location.reload() : offer();
}

export function initFresh() {
  checkBuild({ force: true });
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && checkBuild({ force: true }));
  document.addEventListener('lt:done', () => checkBuild());
  setInterval(() => checkBuild({ force: true }), EVERY);
}
