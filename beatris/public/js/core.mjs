import { faDigits } from './calc.mjs';

/* ---------- templating ---------- */
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
class Raw {
  constructor(s) {
    this.s = s;
  }
  toString() {
    return this.s;
  }
}
export const raw = (s) => new Raw(String(s));
const part = (v) => (v == null || v === false ? '' : v instanceof Raw ? v.s : Array.isArray(v) ? v.map(part).join('') : esc(v));
/** Tagged template: interpolations are escaped unless wrapped in raw() or produced by html``. */
export function html(strings, ...vals) {
  let out = strings[0];
  vals.forEach((v, i) => (out += part(v) + strings[i + 1]));
  return new Raw(out);
}
export const fa = (s) => faDigits(s ?? '');
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/* ---------- api ---------- */
const TOKEN_KEY = 'beatris.token';
export const auth = {
  get token() {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set token(v) {
    try {
      if (v) localStorage.setItem(TOKEN_KEY, v);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* storage unavailable */
    }
  },
};
export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export async function api(path, { method = 'GET', body } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth.token) headers.Authorization = `Bearer ${auth.token}`;
  let res;
  try {
    res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, 'اتصال به سرور برقرار نشد. اینترنت را بررسی کنید.');
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/api/auth/login') {
    auth.token = null;
    store.me = null;
    navigate('/login');
  }
  if (!res.ok) throw new ApiError(res.status, fa(data.error || 'درخواست انجام نشد.'));
  return data;
}

/* ---------- store ---------- */
export const store = {
  me: null,
  content: null,
  async loadMe() {
    this.me = await api('/api/me');
    return this.me;
  },
  async loadContent() {
    if (!this.content) this.content = await api('/api/content');
    return this.content;
  },
  course(id) {
    return this.content?.courses.find((c) => c.id === id) ?? null;
  },
  courseProgress(id) {
    return this.me?.progress.courses.find((c) => c.id === id) ?? null;
  },
  isStaff() {
    return ['trainer', 'manager', 'owner'].includes(this.me?.user.role);
  },
  isAdmin() {
    return ['manager', 'owner'].includes(this.me?.user.role);
  },
};
export const ROLE_FA = { employee: 'فروشنده', trainer: 'مربی', manager: 'مدیر', owner: 'مالک' };

/* ---------- toast ---------- */
export function toast(msg, kind = 'info') {
  let box = $('#toasts');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toasts';
    box.setAttribute('role', 'status');
    box.setAttribute('aria-live', 'polite');
    document.body.append(box);
  }
  const t = document.createElement('div');
  t.className = `toast ${kind}`;
  t.textContent = fa(msg);
  box.append(t);
  setTimeout(() => t.classList.add('out'), 3200);
  setTimeout(() => t.remove(), 3700);
}

/* ---------- router ---------- */
const routes = [];
let cleanup = null;
let renderShell = () => {};
export const route = (pattern, handler, opts = {}) => routes.push({ re: new RegExp(`^${pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)')}/?$`), handler, opts });
export const setShell = (fn) => (renderShell = fn);

export function navigate(to, { replace = false } = {}) {
  if (location.pathname + location.search !== to) history[replace ? 'replaceState' : 'pushState']({}, '', to);
  render();
}

export async function render() {
  const path = location.pathname;
  const match = routes.map((r) => ({ r, m: r.re.exec(path) })).find((x) => x.m);
  const main = $('#main');
  if (typeof cleanup === 'function') cleanup();
  cleanup = null;
  if (!match) {
    main.innerHTML = String(html`<section class="empty"><h1>این صفحه وجود ندارد</h1><a class="btn" href="/" data-link>بازگشت به خانه</a></section>`);
    return;
  }
  const { r, m } = match;
  if (!r.opts.public && !auth.token) return navigate('/login', { replace: true });
  try {
    if (!r.opts.public && !store.me) {
      main.innerHTML = '<div class="loading" aria-busy="true"><span></span></div>';
      await Promise.all([store.loadMe(), store.loadContent()]);
    }
    if (r.opts.staff && !store.isStaff()) return navigate('/', { replace: true });
    renderShell(r.opts);
    const page = document.createElement('div');
    page.className = `page ${r.opts.tone ?? ''}`;
    main.replaceChildren(page);
    window.scrollTo(0, 0);
    cleanup = (await r.handler(page, m.groups ?? {})) ?? null;
    reveal(page);
    const h1 = $('h1', page);
    document.title = h1 ? `${h1.textContent} · بئاتریس` : 'بئاتریس';
  } catch (e) {
    if (e.status === 401) return;
    main.innerHTML = String(html`<section class="empty"><h1>بارگذاری انجام نشد</h1><p>${e.message}</p><button class="btn" data-act="retry">تلاش دوباره</button></section>`);
    $('[data-act=retry]', main)?.addEventListener('click', () => render());
  }
}

document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href]');
  // in-page anchors (#section) and links a page already handled are not navigations
  if (!a || e.defaultPrevented || a.getAttribute('href').startsWith('#') || a.target || a.hasAttribute('download') || e.metaKey || e.ctrlKey || e.shiftKey) return;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin) return;
  e.preventDefault();
  navigate(url.pathname + url.search);
});
window.addEventListener('popstate', () => render());

/* ---------- motion: staggered reveal on scroll + pointer light ---------- */
const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && (e.target.classList.add('in'), io.unobserve(e.target))), { rootMargin: '0px 0px -6% 0px' }) : null;
export function reveal(root) {
  if (!io || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const els = $$(':scope > *:not(.home-hero):not(.studio3d):not(.paper):not(.printable), .rows > li, .grid2 > *, .bento > *, .tool-grid > *, .stats > div, .era-item', root);
  els.forEach((el, i) => {
    if (el.classList.contains('rv')) return;
    el.classList.add('rv');
    el.style.setProperty('--i', String(i % 8));
    io.observe(el);
  });
}
document.addEventListener('pointermove', (e) => {
  const el = e.target.closest?.('.tray, .tile, .tool-card');
  if (!el) return;
  const r = el.getBoundingClientRect();
  el.style.setProperty('--mx', `${e.clientX - r.left}px`);
  el.style.setProperty('--my', `${e.clientY - r.top}px`);
}, { passive: true });

/** Delegate [data-act] clicks inside a root to a handler map. */
export function actions(root, map) {
  root.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || !root.contains(el)) return;
    const fn = map[el.dataset.act];
    if (fn) {
      e.preventDefault();
      fn(el, e);
    }
  });
}

export function busy(btn, on) {
  if (!btn) return;
  btn.disabled = on;
  btn.classList.toggle('is-busy', on);
}
