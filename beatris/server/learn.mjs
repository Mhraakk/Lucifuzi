// حافظه — how the machine learns the shop. Three layers, all deterministic and inspectable:
//  1. the harness: every operator action on the screens (which button, which mode, which page, errors shown) is
//     recorded as an event — never the typed values — so the machine knows how people work;
//  2. habits learned from the books themselves (ground truth, not guesses): per customer the usual payment method and
//     account, the usual fineness and coin, the usual weight range, the rhythm of visits; per operator speed and errors;
//  3. memories: facts a person tells it («یادت باشه…»), kept with who and when, and forgotten only on request.
// Learning never writes to the books. Every suggestion carries its evidence (n of m trades), and a replay test
// measures how often the learned habit would have predicted what actually happened next.
import { randomUUID } from 'node:crypto';
import * as TR from '../public/js/trade.mjs';

export const LEARN_SCHEMA = `
CREATE TABLE IF NOT EXISTS bk_events (seq INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, user_id TEXT, kind TEXT NOT NULL, path TEXT NOT NULL DEFAULT '', ref TEXT NOT NULL DEFAULT '', data_json TEXT NOT NULL DEFAULT '{}');
CREATE INDEX IF NOT EXISTS idx_bkev_user ON bk_events(user_id, at);
CREATE TABLE IF NOT EXISTS bk_memory (id TEXT PRIMARY KEY, scope TEXT NOT NULL CHECK (scope IN ('party','shop','user')), ref TEXT NOT NULL DEFAULT '', text TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'operator', by TEXT, at TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1);
CREATE INDEX IF NOT EXISTS idx_bkmem_ref ON bk_memory(scope, ref);
`;
export const EVENT_KINDS = new Set(['nav', 'ui', 'desk.open', 'desk.party', 'desk.add', 'desk.save', 'desk.error', 'desk.suggest', 'search', 'trace', 'print', 'export', 'assistant', 'error', 'theme']);
const clip = (v, n) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').slice(0, n);
const mode = (list) => {
  const m = new Map();
  for (const x of list) if (x != null && x !== '') m.set(x, (m.get(x) ?? 0) + 1);
  let best = null, n = 0;
  for (const [k, c] of m) if (c > n) (best = k), (n = c);
  return best == null ? null : { value: best, n, of: list.filter((x) => x != null && x !== '').length };
};
const quant = (arr, q) => {
  if (!arr.length) return null;
  const a = [...arr].sort((x, y) => x - y);
  const i = (a.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
  return Math.round((a[lo] + (a[hi] - a[lo]) * (i - lo)) * 1000) / 1000;
};

export function makeLearn({ db, now, log, isAdmin }) {
  db.raw.exec(LEARN_SCHEMA);
  const accTitle = () => Object.fromEntries(db.all('SELECT id, title FROM bk_accounts').map((a) => [a.id, a.title]));

  /* ---------------- 1. the harness ---------------- */
  function record(user, events) {
    const list = (Array.isArray(events) ? events : []).slice(0, 100);
    let n = 0;
    db.tx(() => {
      for (const e of list) {
        if (!EVENT_KINDS.has(e?.kind)) continue;
        const at = typeof e.at === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(e.at) && Math.abs(Date.parse(e.at) - Date.now()) < 36e5 * 24 ? e.at : now();
        const data = e.data && typeof e.data === 'object' ? JSON.stringify(e.data).slice(0, 800) : '{}';
        db.run('INSERT INTO bk_events(at,user_id,kind,path,ref,data_json) VALUES (?,?,?,?,?,?)', at, user.id, e.kind, clip(e.path, 120), clip(e.ref, 80), data);
        n++;
      }
    });
    // keep the last 120 days
    if (Math.random() < 0.02) db.run("DELETE FROM bk_events WHERE at < ?", new Date(Date.now() - 120 * 864e5).toISOString());
    return { ok: true, stored: n };
  }

  /* ---------------- 2. habits from the books ---------------- */
  const tradesOf = (pid) =>
    db.all("SELECT id, date, created_at, data_json, calc_json FROM bk_docs WHERE party_id=? AND status='final' AND type='trade' ORDER BY date, created_at", pid).map((r) => ({ id: r.id, date: r.date, at: r.created_at, data: JSON.parse(r.data_json), calc: JSON.parse(r.calc_json) }));
  const payKey = (p) => `${p.method}|${p.account ?? ''}`;
  function habits(trades) {
    const pays = trades.flatMap((t) => (t.data.payments ?? []).map(payKey));
    const melts = trades.flatMap((t) => t.calc.lines.filter((l) => l.kind === 'melt'));
    const coins = trades.flatMap((t) => t.calc.lines.filter((l) => l.kind === 'coin').map((l) => l.coin));
    const kinds = trades.flatMap((t) => t.calc.lines.map((l) => `${l.kind}:${l.dir}`));
    const weights = melts.map((l) => l.weight);
    const gaps = trades.slice(1).map((t, i) => (Date.parse(`${t.date}T00:00:00Z`) - Date.parse(`${trades[i].date}T00:00:00Z`)) / 864e5);
    return { pay: mode(pays), fineness: mode(melts.map((l) => l.fineness)), coin: mode(coins), kind: mode(kinds), weight: weights.length ? { p10: quant(weights, 0.1), p50: quant(weights, 0.5), p90: quant(weights, 0.9), n: weights.length } : null, everyDays: gaps.length ? quant(gaps, 0.5) : null };
  }
  function partyProfile(pid) {
    const trades = tradesOf(pid);
    const h = habits(trades);
    const acc = accTitle();
    const pay = h.pay ? (() => {
      const [method, account] = h.pay.value.split('|');
      return { method, account: account || null, accountTitle: acc[account] ?? '', n: h.pay.n, of: h.pay.of };
    })() : null;
    return {
      trades: trades.length, last: trades.at(-1)?.date ?? null, everyDays: h.everyDays,
      pay, fineness: h.fineness && { value: h.fineness.value, n: h.fineness.n, of: h.fineness.of }, coin: h.coin && { value: h.coin.value, n: h.coin.n, of: h.coin.of },
      kind: h.kind && { value: h.kind.value, n: h.kind.n, of: h.kind.of }, weight: h.weight,
      memory: memories('party', pid),
    };
  }
  // replay: at every trade, would the habit learned from the trades before it have named what was actually used?
  function replay() {
    const score = { pay: [0, 0], fineness: [0, 0], coin: [0, 0] };
    for (const { party_id: pid } of db.all("SELECT DISTINCT party_id FROM bk_docs WHERE party_id IS NOT NULL AND status='final' AND type='trade'")) {
      const ts = tradesOf(pid);
      for (let i = 2; i < ts.length; i++) {
        const h = habits(ts.slice(0, i));
        const t = ts[i];
        if (h.pay && t.data.payments?.length) (score.pay[1]++, t.data.payments.some((p) => payKey(p) === h.pay.value) && score.pay[0]++);
        const fs = t.calc.lines.filter((l) => l.kind === 'melt').map((l) => l.fineness);
        if (h.fineness && fs.length) (score.fineness[1]++, fs.includes(h.fineness.value) && score.fineness[0]++);
        const cs = t.calc.lines.filter((l) => l.kind === 'coin').map((l) => l.coin);
        if (h.coin && cs.length) (score.coin[1]++, cs.includes(h.coin.value) && score.coin[0]++);
      }
    }
    return Object.fromEntries(Object.entries(score).map(([k, [hit, n]]) => [k, { hit, n, pct: n ? Math.round((hit / n) * 100) : null }]));
  }
  function operators(user) {
    const rows = db.all("SELECT e.user_id, u.name, e.kind, e.at, e.data_json FROM bk_events e LEFT JOIN users u ON u.id=e.user_id WHERE e.at >= ? ORDER BY e.at", new Date(Date.now() - 30 * 864e5).toISOString());
    const by = new Map();
    for (const r of rows) {
      if (!isAdmin(user) && r.user_id !== user.id) continue;
      const o = by.get(r.user_id) ?? { id: r.user_id, name: r.name ?? '—', events: 0, saves: 0, errors: {}, hours: Array(24).fill(0), durations: [], open: null, actions: {} };
      o.events++;
      const d = JSON.parse(r.data_json || '{}');
      const hr = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Tehran' }).format(new Date(r.at))) % 24;
      o.hours[hr]++;
      if (r.kind === 'desk.open') o.open = Date.parse(r.at);
      if (r.kind === 'desk.save') {
        o.saves++;
        if (o.open && Date.parse(r.at) - o.open < 36e5) o.durations.push((Date.parse(r.at) - o.open) / 1000);
        o.open = Date.parse(r.at);
      }
      if (r.kind === 'desk.error' || r.kind === 'error') o.errors[clip(d.msg, 80)] = (o.errors[clip(d.msg, 80)] ?? 0) + 1;
      if (r.kind === 'ui' && d.act) o.actions[d.act] = (o.actions[d.act] ?? 0) + 1;
      by.set(r.user_id, o);
    }
    return [...by.values()].map((o) => ({ id: o.id, name: o.name, events: o.events, saves: o.saves, medianSeconds: quant(o.durations, 0.5), hours: o.hours, topErrors: Object.entries(o.errors).sort((a, b) => b[1] - a[1]).slice(0, 5), topActions: Object.entries(o.actions).sort((a, b) => b[1] - a[1]).slice(0, 8) }));
  }
  function shopRhythm() {
    const hours = Array(24).fill(0), week = Array(7).fill(0);
    for (const r of db.all("SELECT created_at FROM bk_docs WHERE status='final' AND created_at >= ?", new Date(Date.now() - 90 * 864e5).toISOString())) {
      const d = new Date(r.created_at);
      const parts = new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, weekday: 'short', timeZone: 'Asia/Tehran' }).formatToParts(d);
      hours[Number(parts.find((p) => p.type === 'hour').value) % 24]++;
      week[['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'].indexOf(parts.find((p) => p.type === 'weekday').value)]++;
    }
    return { hours, week };
  }

  /* ---------------- 3. memories ---------------- */
  function memories(scope, ref) {
    return db.all('SELECT m.*, u.name FROM bk_memory m LEFT JOIN users u ON u.id=m.by WHERE m.active=1 AND m.scope=? AND m.ref=? ORDER BY m.at DESC LIMIT 30', scope, ref ?? '').map((m) => ({ id: m.id, text: m.text, by: m.name ?? '', at: m.at, source: m.source }));
  }
  function allMemories() {
    return db.all('SELECT m.*, u.name FROM bk_memory m LEFT JOIN users u ON u.id=m.by WHERE m.active=1 ORDER BY m.at DESC LIMIT 300').map((m) => {
      const p = m.scope === 'party' ? db.get('SELECT * FROM bk_parties WHERE id=?', m.ref) : null;
      return { id: m.id, scope: m.scope, ref: m.ref, about: p ? TR.partyLabel(p) : m.scope === 'shop' ? 'مغازه' : '', text: m.text, by: m.name ?? '', at: m.at };
    });
  }
  function remember(user, { scope = 'shop', ref = '', text }) {
    const t = clip(text, 400).trim();
    if (t.length < 3) throw new Error('متن یادداشت کوتاه است.');
    if (!['party', 'shop', 'user'].includes(scope)) throw new Error('دامنه نامعتبر است.');
    if (scope === 'party' && !db.get('SELECT 1 FROM bk_parties WHERE id=?', ref)) throw new Error('مشتری پیدا نشد.');
    const id = randomUUID();
    const r = scope === 'user' ? user.id : scope === 'shop' ? '' : ref;
    db.run('INSERT INTO bk_memory(id,scope,ref,text,source,by,at,active) VALUES (?,?,?,?,?,?,?,1)', id, scope, r, t, 'operator', user.id, now());
    log(user, 'memory.add', id, { scope, ref: r, text: t });
    return { id, scope, ref: r, text: t };
  }
  function forget(user, id) {
    const m = db.get('SELECT * FROM bk_memory WHERE id=? AND active=1', id);
    if (!m) throw new Error('یادداشت پیدا نشد.');
    if (m.by !== user.id && !isAdmin(user)) throw new Error('فقط نویسنده یا مدیر می‌تواند این یادداشت را پاک کند.');
    db.run('UPDATE bk_memory SET active=0 WHERE id=?', id);
    log(user, 'memory.forget', id, { text: m.text });
    return { ok: true };
  }
  return { record, partyProfile, replay, operators, shopRhythm, memories, allMemories, remember, forget };
}
