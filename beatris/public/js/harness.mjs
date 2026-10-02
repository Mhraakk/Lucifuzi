// The harness: what the operator does on the screens, recorded so the machine can learn how the shop works — which
// page, which button, which mode, how long a trade takes, which errors people meet. Only names of actions are kept,
// never what was typed (no amounts, names or numbers). Events are batched and sent quietly; if the network is down
// they wait in memory and go with the next batch.
import { api, store } from './core.mjs';

const Q = [];
let timer = null;
const MAX = 40;
const path = () => location.pathname.replace(/\/[0-9a-f-]{20,}(?=\/|$)/gi, '/:id');

export function track(kind, data = {}, ref = '') {
  if (!store.me?.user) return;
  Q.push({ kind, at: new Date().toISOString(), path: path(), ref: String(ref).slice(0, 80), data });
  if (Q.length >= MAX) flush();
  else if (!timer) timer = setTimeout(flush, 8000);
}
export async function flush() {
  clearTimeout(timer);
  timer = null;
  if (!Q.length || !store.me?.user) return;
  const events = Q.splice(0, Q.length);
  try {
    await api('/api/books/events', { method: 'POST', body: { events } });
  } catch {
    if (Q.length < 400) Q.unshift(...events); // retry with the next batch
  }
}

let started = false;
export function startHarness() {
  if (started) return;
  started = true;
  // every navigation
  const nav = () => track('nav');
  addEventListener('popstate', nav);
  const push = history.pushState.bind(history);
  history.pushState = (...a) => {
    push(...a);
    nav();
  };
  // the buttons people press on the accounting screens (names of actions only)
  document.addEventListener(
    'click',
    (e) => {
      if (!location.pathname.startsWith('/books')) return;
      const el = e.target.closest('[data-act],[data-mode],[data-kind],[data-pm],[data-q],[data-u],[data-f],[data-fmt],[data-theme-pick],[data-sev]');
      if (!el) return;
      const d = {};
      for (const k of ['act', 'mode', 'kind', 'pm', 'u', 'fmt', 'sev']) if (el.dataset[k] != null) d[k] = el.dataset[k].slice(0, 30);
      if (el.dataset.q != null) d.q = 'preset';
      if (el.dataset.f != null) d.filter = el.dataset.f.slice(0, 20);
      if (Object.keys(d).length) track('ui', d);
    },
    true,
  );
  // errors the operator saw (toasts) and errors of the page itself
  addEventListener('beatris:toast', (e) => e.detail?.kind === 'error' && track('error', { msg: String(e.detail.msg).slice(0, 120) }));
  addEventListener('error', (e) => track('error', { msg: String(e.message ?? 'error').slice(0, 120), src: 'page' }));
  addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush());
}
