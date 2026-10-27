// The harness: what the operator does on the screens, recorded so the machine can learn how the shop works — which
// page, which button, which mode, how long a trade takes, which errors people meet. Only names of actions are kept,
// never what was typed (no amounts, names or numbers). Events are batched and sent quietly; if the network is down
// they wait in memory and go with the next batch.
// The owner's dashboard (spec 0053) gets its own stream on every page: a page with the time it was seen, the name of a
// pressed action, an error, and one beat for each visible minute, with a random id for this tab — never a value.
import { api, store, auth } from './core.mjs';

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

/* ---------------- the owner's view (spec 0053) ---------------- */
const SID = (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`).replace(/-/g, '').slice(0, 16);
const A = [];
let aTok = null; // the session the waiting events belong to: a sign-out or another person in this tab starts afresh
let aTimer = null;
const queue = (e) => {
  if (auth.token !== aTok) (A.length = 0), (aTok = auth.token);
  if (!aTok) return;
  A.push(e);
  if (A.length >= 60) flushAct();
  else if (!aTimer) aTimer = setTimeout(flushAct, 15000);
};
const act = (kind, extra = {}) => store.me?.user && queue({ kind, at: new Date().toISOString(), path: path(), sid: SID, ...extra });
/** keepalive: the batch still goes when the tab is closing (the session header goes with it, never in a URL). */
export async function flushAct(keepalive = false) {
  clearTimeout(aTimer);
  aTimer = null;
  if (auth.token !== aTok) (A.length = 0), (aTok = auth.token);
  if (!A.length || !aTok) return;
  const events = A.splice(0, A.length);
  try {
    const r = await fetch('/api/act', { method: 'POST', keepalive, headers: { 'content-type': 'application/json', authorization: `Bearer ${auth.token}` }, body: JSON.stringify({ events }) });
    if (!r.ok && r.status >= 500 && A.length < 400) A.unshift(...events);
  } catch {
    if (A.length < 400) A.unshift(...events);
  }
}
// the page now open, and how long it has been visible
let view = null;
const visible = () => document.visibilityState === 'visible';
function closeView() {
  if (!view) return;
  const ms = view.ms + (view.since ? Date.now() - view.since : 0);
  queue({ kind: 'view', at: new Date(view.t0).toISOString(), path: view.path, sid: SID, ms });
  view = null;
}
function openView() {
  view = { path: path(), t0: Date.now(), since: visible() ? Date.now() : 0, ms: 0 };
}
function pageChanged() {
  if (view && view.path === path()) return;
  closeView();
  openView();
}

let started = false;
export function startHarness() {
  if (started) return;
  started = true;
  // every navigation
  const nav = () => track('nav');
  addEventListener('popstate', () => (nav(), pageChanged()));
  const push = history.pushState.bind(history);
  history.pushState = (...a) => {
    closeView();
    push(...a);
    nav();
    openView();
  };
  const replace = history.replaceState.bind(history);
  history.replaceState = (...a) => {
    replace(...a);
    pageChanged();
  };
  openView();
  // a pressed action anywhere in the app: its name only
  document.addEventListener(
    'click',
    (e) => {
      const el = e.target.closest?.('[data-act]');
      if (el?.dataset.act) act('act', { name: el.dataset.act.slice(0, 40) });
    },
    true,
  );
  // one beat for each minute the app is in view
  setInterval(() => visible() && act('beat'), 60000);
  addEventListener('visibilitychange', () => {
    if (!view) return;
    if (visible()) view.since = Date.now();
    else {
      view.ms += view.since ? Date.now() - view.since : 0;
      view.since = 0;
      // the time so far goes now; the same page continues if the person comes back
      const p = view.path;
      closeView();
      flushAct(true);
      view = { path: p, t0: Date.now(), since: 0, ms: 0 };
    }
  });
  addEventListener('pagehide', () => (closeView(), flushAct(true)));
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
  addEventListener('beatris:toast', (e) => e.detail?.kind === 'error' && (track('error', { msg: String(e.detail.msg).slice(0, 120) }), act('error', { name: 'toast' })));
  addEventListener('error', (e) => (track('error', { msg: String(e.message ?? 'error').slice(0, 120), src: 'page' }), act('error', { name: 'page' })));
  addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush());
}
