// محلی‌محور (spec 0013): work is written on this device the moment it changes (no save button), and a final
// document goes to the server with a client key through a queue — a cut network loses nothing, and a retry never
// books twice (the server answers a key it has seen with the same document). IndexedDB, with localStorage as the
// fallback; everything degrades to "online only" when neither is available.
import { api } from './core.mjs';

const DB_NAME = 'beatris-local', DB_V = 1;
let dbp = null;
function idb() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  dbp ??= new Promise((res) => {
    let r;
    try {
      r = indexedDB.open(DB_NAME, DB_V);
    } catch {
      return res(null);
    }
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains('drafts')) d.createObjectStore('drafts');
      if (!d.objectStoreNames.contains('outbox')) d.createObjectStore('outbox', { keyPath: 'key' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => res(null);
    r.onblocked = () => res(null);
  });
  return dbp;
}
const lsKey = (store) => `beatris.local.${store}`;
const lsGet = (store) => {
  try {
    return JSON.parse(localStorage.getItem(lsKey(store)) ?? '{}');
  } catch {
    return {};
  }
};
const lsSet = (store, v) => {
  try {
    localStorage.setItem(lsKey(store), JSON.stringify(v));
  } catch {
    /* storage full or blocked */
  }
};
async function op(store, mode, fn) {
  const d = await idb();
  if (!d) return fn(null);
  return new Promise((res, rej) => {
    const t = d.transaction(store, mode);
    const s = t.objectStore(store);
    let out;
    Promise.resolve(fn(s)).then((v) => (out = v));
    t.oncomplete = () => res(out);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
  });
}
const req = (r) => new Promise((res, rej) => ((r.onsuccess = () => res(r.result)), (r.onerror = () => rej(r.error))));

/* ---------------- drafts: the flow's state, written on every change ---------------- */
export const drafts = {
  async get(flow) {
    try {
      return await op('drafts', 'readonly', (s) => (s ? req(s.get(flow)) : lsGet('drafts')[flow] ?? null));
    } catch {
      return lsGet('drafts')[flow] ?? null;
    }
  },
  async set(flow, value) {
    const v = value == null ? null : { ...value, at: Date.now() };
    try {
      await op('drafts', 'readwrite', (s) => {
        if (!s) {
          const all = lsGet('drafts');
          if (v) all[flow] = v;
          else delete all[flow];
          return lsSet('drafts', all);
        }
        return v ? req(s.put(v, flow)) : req(s.delete(flow));
      });
    } catch {
      /* best effort: the page still holds the state */
    }
  },
};

/** Debounced draft writer for one flow: call it after every change. */
export function autosave(flow, getState, ms = 250) {
  let t = 0;
  const write = () => drafts.set(flow, getState());
  const fn = () => {
    clearTimeout(t);
    t = setTimeout(write, ms);
  };
  fn.now = () => (clearTimeout(t), write());
  return fn;
}

/* ---------------- the outbox: final documents waiting for the network ---------------- */
async function all() {
  try {
    return await op('outbox', 'readonly', (s) => (s ? req(s.getAll()) : Object.values(lsGet('outbox'))));
  } catch {
    return Object.values(lsGet('outbox'));
  }
}
async function put(item) {
  try {
    await op('outbox', 'readwrite', (s) => {
      if (!s) {
        const m = lsGet('outbox');
        m[item.key] = item;
        return lsSet('outbox', m);
      }
      return req(s.put(item));
    });
  } catch {
    const m = lsGet('outbox');
    m[item.key] = item;
    lsSet('outbox', m);
  }
}
async function del(key) {
  try {
    await op('outbox', 'readwrite', (s) => {
      if (!s) {
        const m = lsGet('outbox');
        delete m[key];
        return lsSet('outbox', m);
      }
      return req(s.delete(key));
    });
  } catch {
    /* gone already */
  }
}

export const newKey = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`).replace(/-/g, '').slice(0, 32);
/** A refusal the operator must fix (bad input, permissions, a locked month) vs. a network or server hiccup. */
export const retryable = (e) => !e?.status || e.status >= 500 || e.status === 429 || e.status === 401; // 401: signed out — wait for the next sign-in, never drop the document

const listeners = new Set();
export function onOutbox(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const emit = (ev) => listeners.forEach((f) => f(ev));

/**
 * Send a final document. Online: the server's answer now ({ doc }). Network down or server unavailable: the
 * document waits in the queue ({ queued: true, key }) and is sent by itself later. A refusal (4xx) throws, so the
 * operator corrects it while the customer is still there.
 */
export async function submit({ url, method = 'POST', body, label = '' }) {
  const key = body.clientKey ?? newKey();
  const payload = { ...body, clientKey: key };
  try {
    return { doc: await api(url, { method, body: payload }) };
  } catch (e) {
    if (!retryable(e)) throw e;
    await put({ key, url, method, body: payload, label, at: Date.now(), tries: 0, status: 'queued', error: '' });
    emit({ type: 'queued', key });
    kick(1500);
    return { queued: true, key };
  }
}

export async function pending() {
  return (await all()).filter((x) => x.status !== 'sent').sort((a, b) => a.at - b.at);
}

let timer = 0, running = false;
/** Try the queue now (or after ms): oldest first; a refusal parks the item as «failed» for the operator. */
export function kick(ms = 0) {
  clearTimeout(timer);
  timer = setTimeout(flush, ms);
}
async function flush() {
  if (running) return;
  running = true;
  let wait = 0;
  try {
    for (const it of await pending()) {
      if (it.status === 'failed') continue;
      try {
        const doc = await api(it.url, { method: it.method, body: it.body });
        await del(it.key);
        emit({ type: 'sent', key: it.key, doc, label: it.label });
      } catch (e) {
        if (retryable(e)) {
          await put({ ...it, tries: it.tries + 1, error: e.message });
          wait = Math.min(60000, 4000 * 2 ** Math.min(4, it.tries));
          break; // the network is still away: keep the order, try again later
        }
        await put({ ...it, status: 'failed', error: e.message });
        emit({ type: 'failed', key: it.key, error: e.message, label: it.label, body: it.body });
      }
    }
  } finally {
    running = false;
    emit({ type: 'change' });
    if (wait) kick(wait);
  }
}
/** A failed item goes back to its desk for correction (and leaves the queue). */
export async function take(key) {
  const it = (await all()).find((x) => x.key === key);
  if (it) await del(key);
  emit({ type: 'change' });
  return it ?? null;
}

if (typeof window !== 'undefined') {
  addEventListener('online', () => kick(300));
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && kick(500));
  setInterval(() => kick(), 30000);
  kick(2000);
}
