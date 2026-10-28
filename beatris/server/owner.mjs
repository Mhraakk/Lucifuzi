// دیده‌بان (spec 0053): the platform owner's own view of the whole app — who signed up, who signed in from where and on
// what, what people do on the screens, and every shop's counts and totals. Only the account named by
// BEATRIS_OWNER_PHONE or BEATRIS_OWNER_EMAIL sees it. It reads the shops and never writes to them, and it never opens a
// document's or a customer's content: counts and sums only. Raw rows are kept 180 days, then folded into daily sums.
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { normalizePhone, validPhone, normalizeEmail, validEmail, maskEmail, isProd } from './auth.mjs';
import { MAIN, deviceName } from './platform.mjs';
import { tehranDay } from './tz.mjs';

export const OWNER_SCHEMA = `
CREATE TABLE IF NOT EXISTS auth_log (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, kind TEXT NOT NULL, user_id TEXT, tenant_id TEXT, who TEXT NOT NULL DEFAULT '', via TEXT NOT NULL DEFAULT '', ok INTEGER NOT NULL DEFAULT 1, reason TEXT NOT NULL DEFAULT '', ip TEXT NOT NULL DEFAULT '', xff TEXT NOT NULL DEFAULT '', ua TEXT NOT NULL DEFAULT '', device TEXT NOT NULL DEFAULT '');
CREATE INDEX IF NOT EXISTS idx_authlog_at ON auth_log(at);
CREATE INDEX IF NOT EXISTS idx_authlog_user ON auth_log(user_id, at);
CREATE INDEX IF NOT EXISTS idx_authlog_ip ON auth_log(ip, at);
CREATE TABLE IF NOT EXISTS act_events (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, tenant_id TEXT NOT NULL, user_id TEXT, sid TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL, path TEXT NOT NULL DEFAULT '', name TEXT NOT NULL DEFAULT '', ms INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS idx_act_at ON act_events(at);
CREATE INDEX IF NOT EXISTS idx_act_user ON act_events(user_id, at);
CREATE INDEX IF NOT EXISTS idx_act_tenant ON act_events(tenant_id, at);
CREATE TABLE IF NOT EXISTS act_daily (day TEXT NOT NULL, tenant_id TEXT NOT NULL, user_id TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL, path TEXT NOT NULL DEFAULT '', n INTEGER NOT NULL DEFAULT 0, ms INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, tenant_id, user_id, kind, path));
`;
export const AUTH_KINDS = ['code', 'verify_fail', 'blocked', 'login', 'signup', 'pick', 'logout_all'];
/** What the screens send (spec 0053): a page with the time it was seen, a press, an error, a visible minute. */
export const ACT_KINDS = new Set(['view', 'act', 'error', 'beat']);
export const KEEP_DAYS = 180;
const TZ = '+210 minutes'; // Asia/Tehran is UTC+03:30 all year (no daylight saving since 2022)
const clip = (v, n) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').slice(0, n);
const maskPhone = (p) => (validPhone(p) ? `${p.slice(0, 4)}…${p.slice(-3)}` : '');
/** Ids never travel in a path: /books/doc/<uuid> → /books/doc/:id. */
export const foldPath = (p) => clip(String(p ?? '').split(/[?#]/)[0], 120).replace(/\/(t_[0-9a-f]{12}|[0-9a-f-]{16,}|[A-Za-z0-9_-]{24,}|\d{3,})(?=\/|$)/gi, '/:id') || '/';
/** The person behind a sign-in request, half-hidden: «o…@s…p.ir», «0912…233». */
export function whoOf(id) {
  if (id?.email !== undefined && id?.email !== null) {
    const e = normalizeEmail(id.email);
    return validEmail(e) ? maskEmail(e) : 'ایمیل نادرست';
  }
  return maskPhone(normalizePhone(id?.phone)) || 'شماره نادرست';
}
const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const csvCell = (v) => {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const toCsv = (head, rows) => `\uFEFF${[head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`;

export function createOwner({ db, env = process.env, platform, bus = null, mediaDir = null, market = null, now = () => new Date().toISOString() }) {
  db.raw.exec(OWNER_SCHEMA);
  const prod = isProd(env);
  const publish = (data) => bus?.publish('owner.event', data);

  /* ---------------- who may look ---------------- */
  const ownerPhone = () => normalizePhone(env.BEATRIS_OWNER_PHONE);
  const ownerEmail = () => normalizeEmail(env.BEATRIS_OWNER_EMAIL);
  /** The platform owner: the main shop's owner whose mobile or email the server's variables name; never a demo account in production. */
  function isOwner(user, tn) {
    if (!user || tn !== MAIN || user.role !== 'owner' || !user.active) return false;
    if (prod && user.demo) return false;
    const ph = ownerPhone(), em = ownerEmail();
    return (validPhone(ph) && user.phone === ph) || (validEmail(em) && user.email === em);
  }
  const ownerIds = () => db.all("SELECT * FROM users WHERE role='owner' AND active=1").filter((u) => isOwner(u, MAIN)).map((u) => u.id);

  /* ---------------- capture ---------------- */
  /** One step of signing in (or out everywhere), with where it came from. A failure here never stops the sign-in. */
  function auth({ kind, ok = true, via = '', reason = '', who = '', userId = null, tenant = null, ip = '', xff = '', ua = '' }) {
    try {
      const row = { at: now(), kind, userId, tenant, who: clip(who, 80), via: clip(via, 20), ok: ok ? 1 : 0, reason: clip(reason, 160), ip: clip(ip, 64), xff: clip(xff, 200), ua: clip(ua, 300), device: deviceName(ua) };
      const r = db.run('INSERT INTO auth_log(at,kind,user_id,tenant_id,who,via,ok,reason,ip,xff,ua,device) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', row.at, kind, userId, tenant, row.who, row.via, row.ok, row.reason, row.ip, row.xff, row.ua, row.device);
      publish({ type: 'auth', id: Number(r.lastInsertRowid), at: row.at, kind, ok: !!row.ok, via: row.via, reason: row.reason, who: person(tenant, userId)?.name ?? row.who, shop: tenant ? shopName(tenant) : '', ip: row.ip, device: row.device });
    } catch {
      /* the dashboard is never a reason to refuse a sign-in */
    }
  }
  const lastBeat = new Map();
  /** A batch from the screens of one signed-in person: only names, paths without ids, and times — never what was typed. */
  function record(tn, user, events) {
    const list = (Array.isArray(events) ? events : []).slice(0, 100);
    const t = Date.now();
    const kept = [];
    db.tx(() => {
      for (const e of list) {
        if (!ACT_KINDS.has(e?.kind)) continue;
        if (e.kind === 'beat') {
          const k = `${tn}|${user.id}`;
          if (t - (lastBeat.get(k) ?? 0) < 55_000) continue; // one visible minute a minute
          lastBeat.set(k, t);
        }
        const at = typeof e.at === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(e.at) && Math.abs(Date.parse(e.at) - t) < 864e5 ? new Date(Date.parse(e.at)).toISOString() : now();
        const row = [at, tn, user.id, clip(e.sid, 24), e.kind, foldPath(e.path), clip(e.name, 40), Math.max(0, Math.min(6 * 36e5, Math.round(Number(e.ms) || 0)))];
        db.run('INSERT INTO act_events(at,tenant_id,user_id,sid,kind,path,name,ms) VALUES (?,?,?,?,?,?,?,?)', ...row);
        kept.push(row);
      }
    });
    if (lastBeat.size > 20000) lastBeat.clear();
    if (kept.length) {
      const last = kept.at(-1);
      publish({ type: 'act', at: last[0], shop: shopName(tn), who: user.name, role: user.role, kinds: kept.reduce((m, r) => ((m[r[4]] = (m[r[4]] ?? 0) + 1), m), {}), path: last[5], name: last[6] });
    }
    return { ok: true, stored: kept.length };
  }
  /** A tool an AI assistant called over MCP (the main shop's token). */
  function mcp(name) {
    try {
      const at = now();
      db.run("INSERT INTO act_events(at,tenant_id,user_id,sid,kind,path,name,ms) VALUES (?,?,NULL,'','mcp','',?,0)", at, MAIN, clip(name, 40));
      publish({ type: 'act', at, shop: shopName(MAIN), who: 'MCP', role: '', kinds: { mcp: 1 }, path: '', name: clip(name, 40) });
    } catch {
      /* never a reason to fail the tool call */
    }
  }
  /** Raw rows older than KEEP_DAYS become daily sums (day in UTC), then go. */
  function prune(days = KEEP_DAYS) {
    const cut = new Date(Date.now() - days * 864e5).toISOString();
    const up = 'INSERT INTO act_daily(day,tenant_id,user_id,kind,path,n,ms) VALUES (?,?,?,?,?,?,?) ON CONFLICT(day,tenant_id,user_id,kind,path) DO UPDATE SET n=n+excluded.n, ms=ms+excluded.ms';
    let folded = 0;
    db.tx(() => {
      for (const r of db.all("SELECT substr(at,1,10) AS day, tenant_id, COALESCE(user_id,'') AS uid, kind, path, COUNT(*) AS n, SUM(ms) AS ms FROM act_events WHERE at<? GROUP BY 1,2,3,4,5", cut)) {
        db.run(up, r.day, r.tenant_id, r.uid, r.kind, r.path, r.n, r.ms ?? 0);
        folded += r.n;
      }
      for (const r of db.all("SELECT substr(at,1,10) AS day, COALESCE(tenant_id,'') AS tn, COALESCE(user_id,'') AS uid, kind, ok, COUNT(*) AS n FROM auth_log WHERE at<? GROUP BY 1,2,3,4,5", cut)) {
        db.run(up, r.day, r.tn, r.uid, `auth.${r.kind}${r.ok ? '' : '.fail'}`, '', r.n, 0);
        folded += r.n;
      }
      db.run('DELETE FROM act_events WHERE at<?', cut);
      db.run('DELETE FROM auth_log WHERE at<?', cut);
    });
    return { folded, before: cut };
  }

  /* ---------------- the shops, read only ---------------- */
  const shopRows = () => [{ id: MAIN, name: platform.shopName?.(MAIN) || 'فروشگاه اصلی', status: 'active', plan: 'full', expires_at: null, created_at: null, created_by: null }, ...db.all('SELECT id, name, status, plan, expires_at, created_at, created_by FROM tenants ORDER BY created_at')];
  const shopName = (tn) => (tn === MAIN ? platform.shopName?.(MAIN) || 'فروشگاه اصلی' : db.get('SELECT name FROM tenants WHERE id=?', tn)?.name ?? tn);
  const shopDbs = () => platform.allShops();
  const people = new Map(); // `${tn}|${uid}` → { name, role } for a request
  function person(tn, uid) {
    if (!tn || !uid) return null;
    const k = `${tn}|${uid}`;
    if (!people.has(k)) {
      if (people.size > 5000) people.clear();
      try {
        const u = platform.dbOf(tn).get('SELECT name, role FROM users WHERE id=?', uid);
        people.set(k, u ? { name: u.name, role: u.role } : null);
      } catch {
        people.set(k, null);
      }
    }
    return people.get(k);
  }
  const safe = (fn, fallback) => {
    try {
      return fn();
    } catch {
      return fallback;
    }
  };

  /* ---------------- windows ---------------- */
  function windowOf(url) {
    const days = Math.max(1, Math.min(KEEP_DAYS, Math.round(Number(url.searchParams.get('days')) || 30)));
    const today = tehranDay();
    const dayList = Array.from({ length: days }, (_, i) => addDays(today, i - days + 1));
    const since = new Date(Date.parse(`${dayList[0]}T00:00:00+03:30`)).toISOString();
    const self = url.searchParams.get('self') === '1';
    const ids = self ? [] : ownerIds();
    // the owner's own steps are left out unless asked for
    // (a row without a person — a failed code, an MCP call — always stays: NULL must not turn the test into NULL)
    const notSelf = (col = 'user_id', tcol = 'tenant_id') => (ids.length ? { sql: ` AND NOT (COALESCE(${tcol},'')='${MAIN}' AND COALESCE(${col},'') IN (${ids.map(() => '?').join(',')}))`, args: ids } : { sql: '', args: [] });
    return { days, dayList, since, self, notSelf, ownerIds: ids };
  }
  const series = (dayList, rows, key = 'n') => {
    const m = new Map(rows.map((r) => [r.day, r[key] ?? 0]));
    return dayList.map((d) => m.get(d) ?? 0);
  };
  const byDay = (sql, ...args) => db.all(sql, ...args);

  /* ---------------- answers ---------------- */
  function overview(w) {
    const ns = w.notSelf();
    const users = { total: 0, active: 0, byRole: { owner: 0, manager: 0, trainer: 0, employee: 0 }, new: 0 };
    const shops = { total: 0, active: 0, suspended: 0, expired: 0, new: 0 };
    const docs = { final: 0, draft: 0, void: 0, made: 0 };
    const outputs = { print: 0, pdf: 0, share: 0, export: 0 };
    const ai = { calls: 0, errors: 0, tokensIn: 0, tokensOut: 0 };
    const madeByDay = new Map(), newUsersByDay = new Map();
    const today = tehranDay();
    for (const s of shopRows()) {
      if (s.id !== MAIN) {
        shops.total++;
        const expired = s.expires_at && s.expires_at < today;
        if (s.status !== 'active') shops.suspended++;
        else if (expired) shops.expired++;
        else shops.active++;
        if (s.created_at >= w.since) shops.new++;
      }
    }
    for (const [tn, sdb] of shopDbs()) {
      for (const u of safe(() => sdb.all('SELECT id, role, active, created_at FROM users'), [])) {
        if (!u.active) continue;
        if (!w.self && tn === MAIN && w.ownerIds.includes(u.id)) continue;
        users.total++;
        users.active++;
        users.byRole[u.role] = (users.byRole[u.role] ?? 0) + 1;
        if (u.created_at >= w.since) {
          users.new++;
          const d = tehranDayOfIso(u.created_at);
          newUsersByDay.set(d, (newUsersByDay.get(d) ?? 0) + 1);
        }
      }
      for (const r of safe(() => sdb.all('SELECT status, COUNT(*) AS n FROM bk_docs WHERE created_at>=? GROUP BY status', w.since), [])) docs[r.status] = (docs[r.status] ?? 0) + r.n;
      for (const r of safe(() => sdb.all(`SELECT date(created_at,'${TZ}') AS day, COUNT(*) AS n FROM bk_docs WHERE created_at>=? AND status='final' GROUP BY 1`, w.since), [])) madeByDay.set(r.day, (madeByDay.get(r.day) ?? 0) + r.n);
      for (const r of safe(() => (logIndex(sdb), sdb.all("SELECT action, COUNT(*) AS n FROM bk_log WHERE at>=? AND action IN ('doc.print','doc.pdf','doc.share','export') GROUP BY action", w.since)), [])) outputs[r.action.replace('doc.', '')] += r.n;
      const a = safe(() => sdb.get('SELECT SUM(calls) AS calls, SUM(errors) AS errors, SUM(tokens_in) AS tin, SUM(tokens_out) AS tout FROM ai_usage WHERE day>=?', w.dayList[0]), null);
      if (a) (ai.calls += a.calls ?? 0, ai.errors += a.errors ?? 0, ai.tokensIn += a.tin ?? 0, ai.tokensOut += a.tout ?? 0);
    }
    docs.made = docs.final + docs.void + docs.draft;
    const active = (ms) => db.get(`SELECT COUNT(*) AS n FROM (SELECT DISTINCT tenant_id, user_id FROM act_events WHERE at>=? AND user_id IS NOT NULL${ns.sql})`, new Date(Date.now() - ms).toISOString(), ...ns.args).n;
    const loginRows = db.all(`SELECT kind, ok, COUNT(*) AS n FROM auth_log WHERE at>=?${w.notSelf().sql} GROUP BY kind, ok`, w.since, ...ns.args);
    const count = (pred) => loginRows.filter(pred).reduce((s, r) => s + r.n, 0);
    const errors = db.get(`SELECT COUNT(*) AS n FROM act_events WHERE kind='error' AND at>=?${ns.sql}`, w.since, ...ns.args).n;
    const perDay = (sql) => series(w.dayList, byDay(sql, w.since, ...ns.args));
    return {
      now: now(), days: w.days, self: w.self, dayList: w.dayList,
      users, shops,
      dau: active(864e5), wau: active(7 * 864e5), mau: active(30 * 864e5), online: active(5 * 60e3),
      logins: { ok: count((r) => ['login', 'signup'].includes(r.kind)), failed: count((r) => r.kind === 'verify_fail' || (r.kind === 'code' && !r.ok)), blocked: count((r) => r.kind === 'blocked'), codes: count((r) => r.kind === 'code' && r.ok) },
      docs, outputs, ai, errors,
      mcp: db.get("SELECT COUNT(*) AS n FROM act_events WHERE kind='mcp' AND at>=?", w.since).n,
      market: safe(() => market?.health?.() ?? null, null),
      series: {
        logins: perDay(`SELECT date(at,'${TZ}') AS day, COUNT(*) AS n FROM auth_log WHERE kind IN ('login','signup') AND at>=?${ns.sql} GROUP BY 1`),
        failed: perDay(`SELECT date(at,'${TZ}') AS day, COUNT(*) AS n FROM auth_log WHERE ok=0 AND at>=?${ns.sql} GROUP BY 1`),
        active: perDay(`SELECT day, COUNT(*) AS n FROM (SELECT DISTINCT date(at,'${TZ}') AS day, tenant_id, user_id FROM act_events WHERE at>=? AND user_id IS NOT NULL${ns.sql}) GROUP BY day`),
        views: perDay(`SELECT date(at,'${TZ}') AS day, COUNT(*) AS n FROM act_events WHERE kind='view' AND at>=?${ns.sql} GROUP BY 1`),
        minutes: perDay(`SELECT date(at,'${TZ}') AS day, COUNT(*) AS n FROM act_events WHERE kind='beat' AND at>=?${ns.sql} GROUP BY 1`),
        docs: w.dayList.map((d) => madeByDay.get(d) ?? 0),
        signups: w.dayList.map((d) => newUsersByDay.get(d) ?? 0),
      },
    };
  }
  const tehranDayOfIso = (iso) => new Date(Date.parse(iso) + 210 * 60e3).toISOString().slice(0, 10);
  const logIndex = (sdb) => sdb.raw.exec('CREATE INDEX IF NOT EXISTS idx_bklog_at ON bk_log(at)');

  function signups(w) {
    const shops = [];
    const newShops = db.all('SELECT id, name, status, plan, expires_at, created_at, created_by FROM tenants WHERE created_at>=? ORDER BY created_at DESC', w.since);
    for (const t of newShops) {
      const sdb = safe(() => platform.dbOf(t.id), null);
      const owner = sdb && safe(() => sdb.get("SELECT name FROM users WHERE role='owner' ORDER BY created_at LIMIT 1"), null);
      const first = db.get("SELECT MIN(at) AS at FROM auth_log WHERE tenant_id=? AND kind IN ('login','signup')", t.id).at;
      shops.push({ id: t.id, name: t.name, status: t.status, plan: t.plan, expiresAt: t.expires_at, createdAt: t.created_at, by: t.created_by === 'signup' ? 'signup' : 'vendor', owner: owner?.name ?? '', users: sdb ? safe(() => sdb.get('SELECT COUNT(*) AS n FROM users').n, 0) : 0, docs: sdb ? safe(() => sdb.get("SELECT COUNT(*) AS n FROM bk_docs WHERE status='final'").n, 0) : 0, firstLogin: first, lastSeen: db.get('SELECT MAX(at) AS at FROM act_events WHERE tenant_id=?', t.id).at });
    }
    const accounts = [];
    for (const [tn, sdb] of shopDbs())
      for (const u of safe(() => sdb.all('SELECT id, name, role, active, created_at, last_login_at, last_login_ua FROM users WHERE created_at>=? ORDER BY created_at DESC', w.since), [])) {
        if (!w.self && tn === MAIN && w.ownerIds.includes(u.id)) continue;
        accounts.push({ tenant: tn, shop: shopName(tn), id: u.id, name: u.name, role: u.role, active: !!u.active, createdAt: u.created_at, lastLoginAt: u.last_login_at, device: deviceName(u.last_login_ua ?? '') });
      }
    accounts.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    const count = (list, key) => {
      const m = new Map();
      for (const x of list) {
        const d = tehranDayOfIso(x[key]);
        m.set(d, (m.get(d) ?? 0) + 1);
      }
      return w.dayList.map((d) => m.get(d) ?? 0);
    };
    return { days: w.days, dayList: w.dayList, shops, accounts: accounts.slice(0, 300), series: { shops: count(newShops, 'created_at'), accounts: count(accounts, 'createdAt') }, totals: { shops: newShops.length, bySignup: newShops.filter((t) => t.created_by === 'signup').length, accounts: accounts.length } };
  }

  function logins(w, url, limit = 300) {
    const ns = w.notSelf();
    const ok = url.searchParams.get('ok');
    const q = clip(url.searchParams.get('q'), 60).trim().toLowerCase();
    const okSql = ok === '1' ? ' AND ok=1' : ok === '0' ? ' AND ok=0' : '';
    const rows = db.all(`SELECT * FROM auth_log WHERE at>=?${okSql}${ns.sql} ORDER BY id DESC LIMIT 2000`, w.since, ...ns.args).map((r) => {
      const p = person(r.tenant_id, r.user_id);
      return { id: r.id, at: r.at, kind: r.kind, ok: !!r.ok, via: r.via, reason: r.reason, who: p?.name ?? r.who, role: p?.role ?? '', known: !!p, shop: r.tenant_id ? shopName(r.tenant_id) : '', ip: r.ip, xff: r.xff, device: r.device };
    });
    const hit = q ? rows.filter((r) => [r.who, r.ip, r.device, r.shop, r.reason].some((v) => String(v).toLowerCase().includes(q))) : rows;
    const group = (key) => {
      const m = new Map();
      for (const r of rows) if (!r.ok) {
        const g = m.get(r[key]) ?? { key: r[key], n: 0, last: r.at };
        g.n++;
        m.set(r[key], g);
      }
      return [...m.values()].sort((a, b) => b.n - a.n).slice(0, 10);
    };
    const kinds = Object.fromEntries(AUTH_KINDS.map((k) => [k, { ok: 0, failed: 0 }]));
    for (const r of rows) kinds[r.kind] && (r.ok ? kinds[r.kind].ok++ : kinds[r.kind].failed++);
    return { days: w.days, rows: hit.slice(0, limit), total: hit.length, kinds, failedByIp: group('ip'), failedByWho: group('who') };
  }

  function users(w, url) {
    const ns = w.notSelf();
    const q = clip(url.searchParams.get('q'), 60).trim().toLowerCase();
    const stats = new Map();
    for (const r of db.all(`SELECT tenant_id, user_id, COUNT(DISTINCT NULLIF(sid,'')) AS sessions, SUM(kind='beat') AS minutes, SUM(kind='view') AS views, SUM(kind='act') AS acts, MAX(at) AS last FROM act_events WHERE at>=? AND user_id IS NOT NULL${ns.sql} GROUP BY tenant_id, user_id`, w.since, ...ns.args)) stats.set(`${r.tenant_id}|${r.user_id}`, r);
    const pages = new Map();
    for (const r of db.all(`SELECT tenant_id, user_id, path, COUNT(*) AS n FROM act_events WHERE kind='view' AND at>=? AND user_id IS NOT NULL${ns.sql} GROUP BY 1,2,3 ORDER BY n DESC`, w.since, ...ns.args)) {
      const k = `${r.tenant_id}|${r.user_id}`;
      const l = pages.get(k) ?? [];
      if (l.length < 3) l.push([r.path, r.n]);
      pages.set(k, l);
    }
    const out = [];
    for (const [tn, sdb] of shopDbs())
      for (const u of safe(() => sdb.all('SELECT id, name, role, active, demo, phone, email, created_at, last_login_at, last_login_ua FROM users ORDER BY created_at'), [])) {
        if (!w.self && tn === MAIN && w.ownerIds.includes(u.id)) continue;
        const s = stats.get(`${tn}|${u.id}`);
        const row = { tenant: tn, shop: shopName(tn), id: u.id, name: u.name, role: u.role, active: !!u.active, demo: !!u.demo, contact: validEmail(u.email ?? '') ? maskEmail(u.email) : maskPhone(u.phone), createdAt: u.created_at, lastLoginAt: u.last_login_at, device: deviceName(u.last_login_ua ?? ''), lastSeen: s?.last ?? null, sessions: s?.sessions ?? 0, minutes: s?.minutes ?? 0, views: s?.views ?? 0, acts: s?.acts ?? 0, topPages: pages.get(`${tn}|${u.id}`) ?? [] };
        if (q && ![row.name, row.shop, row.contact, row.role].some((v) => String(v).toLowerCase().includes(q))) continue;
        out.push(row);
      }
    out.sort((a, b) => String(b.lastSeen ?? b.lastLoginAt ?? '').localeCompare(String(a.lastSeen ?? a.lastLoginAt ?? '')));
    return { days: w.days, users: out, total: out.length };
  }

  function userTimeline(w, tn, uid) {
    const sdb = platform.dbOf(tn);
    const u = sdb.get('SELECT id, name, role, active, demo, phone, email, created_at, last_login_at, last_login_ua FROM users WHERE id=?', uid);
    if (!u) return null;
    const events = db.all('SELECT at, sid, kind, path, name, ms FROM act_events WHERE tenant_id=? AND user_id=? AND at>=? ORDER BY id DESC LIMIT 400', tn, uid, w.since);
    const auths = db.all('SELECT at, kind, ok, via, reason, ip, xff, device FROM auth_log WHERE tenant_id=? AND user_id=? AND at>=? ORDER BY id DESC LIMIT 100', tn, uid, w.since).map((r) => ({ ...r, ok: !!r.ok }));
    const sessions = db.all("SELECT sid, MIN(at) AS start, MAX(at) AS end, SUM(kind='view') AS views, SUM(kind='act') AS acts, SUM(kind='beat') AS minutes FROM act_events WHERE tenant_id=? AND user_id=? AND at>=? AND sid<>'' GROUP BY sid ORDER BY start DESC LIMIT 40", tn, uid, w.since);
    const minutes = series(w.dayList, db.all(`SELECT date(at,'${TZ}') AS day, COUNT(*) AS n FROM act_events WHERE tenant_id=? AND user_id=? AND kind='beat' AND at>=? GROUP BY 1`, tn, uid, w.since));
    const pages = db.all("SELECT path, COUNT(*) AS n, SUM(ms) AS ms FROM act_events WHERE tenant_id=? AND user_id=? AND kind='view' AND at>=? GROUP BY path ORDER BY n DESC LIMIT 10", tn, uid, w.since);
    return { days: w.days, dayList: w.dayList, user: { tenant: tn, shop: shopName(tn), id: u.id, name: u.name, role: u.role, active: !!u.active, demo: !!u.demo, contact: validEmail(u.email ?? '') ? maskEmail(u.email) : maskPhone(u.phone), createdAt: u.created_at, lastLoginAt: u.last_login_at, device: deviceName(u.last_login_ua ?? '') }, events, auths, sessions, minutes, pages };
  }

  function behavior(w) {
    const ns = w.notSelf();
    const pages = db.all(`SELECT path, COUNT(*) AS n, SUM(ms) AS ms, COUNT(DISTINCT tenant_id || '|' || user_id) AS people FROM act_events WHERE kind='view' AND at>=?${ns.sql} GROUP BY path ORDER BY n DESC LIMIT 20`, w.since, ...ns.args);
    const actions = db.all(`SELECT name, COUNT(*) AS n, COUNT(DISTINCT tenant_id || '|' || user_id) AS people FROM act_events WHERE kind='act' AND at>=?${ns.sql} GROUP BY name ORDER BY n DESC LIMIT 20`, w.since, ...ns.args);
    // Saturday first, as the Persian week runs; hours in Tehran
    const heat = Array.from({ length: 7 }, () => Array(24).fill(0));
    for (const r of db.all(`SELECT CAST(strftime('%w', at, '${TZ}') AS INTEGER) AS w, CAST(strftime('%H', at, '${TZ}') AS INTEGER) AS h, COUNT(*) AS n FROM act_events WHERE kind IN ('view','act','beat') AND at>=?${ns.sql} GROUP BY 1,2`, w.since, ...ns.args)) heat[(r.w + 1) % 7][r.h] = r.n;
    const lengths = db.all(`SELECT (julianday(MAX(at)) - julianday(MIN(at))) * 1440 AS m FROM act_events WHERE sid<>'' AND at>=?${ns.sql} GROUP BY sid`, w.since, ...ns.args).map((r) => r.m);
    const edges = [1, 5, 15, 30, 60];
    const buckets = [0, 0, 0, 0, 0, 0];
    for (const m of lengths) buckets[edges.findIndex((e) => m < e) === -1 ? 5 : edges.findIndex((e) => m < e)]++;
    const sorted = [...lengths].sort((a, b) => a - b);
    const devices = db.all(`SELECT device, COUNT(*) AS n FROM auth_log WHERE kind IN ('login','signup') AND device<>'' AND at>=?${ns.sql} GROUP BY device ORDER BY n DESC LIMIT 8`, w.since, ...ns.args);
    // the funnel of shops made in the window: made → signed in → a final document → back in their second week
    const funnel = { made: 0, signedIn: 0, firstDoc: 0, week2: 0 };
    for (const t of db.all('SELECT id, created_at FROM tenants WHERE created_at>=?', w.since)) {
      funnel.made++;
      if (db.get("SELECT 1 FROM auth_log WHERE tenant_id=? AND kind IN ('login','signup') LIMIT 1", t.id)) funnel.signedIn++;
      if (safe(() => platform.dbOf(t.id).get("SELECT 1 FROM bk_docs WHERE status='final' LIMIT 1"), null)) funnel.firstDoc++;
      const a = new Date(Date.parse(t.created_at) + 7 * 864e5).toISOString(), b = new Date(Date.parse(t.created_at) + 14 * 864e5).toISOString();
      if (db.get('SELECT 1 FROM act_events WHERE tenant_id=? AND at>=? AND at<? LIMIT 1', t.id, a, b)) funnel.week2++;
    }
    // weekly retention: people by the week they were first seen in the window; share back in each later week
    const weeks = new Map();
    for (const r of db.all(`SELECT tenant_id || '|' || user_id AS u, CAST((julianday(at) - julianday(?)) / 7 AS INTEGER) AS wk FROM act_events WHERE at>=? AND user_id IS NOT NULL${ns.sql} GROUP BY 1, 2`, w.since, w.since, ...ns.args)) {
      const s = weeks.get(r.u) ?? new Set();
      s.add(r.wk);
      weeks.set(r.u, s);
    }
    const span = Math.ceil(w.days / 7);
    const cohorts = Array.from({ length: span }, (_, i) => ({ week: i, people: 0, back: Array(Math.max(0, span - i)).fill(0) }));
    for (const s of weeks.values()) {
      const first = Math.min(...s);
      const c = cohorts[first];
      if (!c) continue;
      c.people++;
      for (const wk of s) if (wk - first < c.back.length) c.back[wk - first]++;
    }
    return { days: w.days, start: w.dayList[0], pages, actions, heat, sessions: { n: lengths.length, edges, buckets, median: sorted.length ? Math.round(sorted[Math.floor(sorted.length / 2)] * 10) / 10 : null }, devices, funnel, retention: cohorts.filter((c) => c.people) };
  }

  const shopCache = new Map();
  function shops(w) {
    const key = `${w.days}`;
    const hit = shopCache.get(key);
    if (hit && Date.now() - hit.t < 5 * 60e3) return hit.v;
    const rows = new Map(shopRows().map((s) => [s.id, s]));
    const out = [];
    for (const [tn, sdb] of shopDbs()) {
      const s = rows.get(tn) ?? { id: tn, name: tn };
      const docs = {};
      for (const r of safe(() => sdb.all('SELECT type, status, COUNT(*) AS n FROM bk_docs GROUP BY type, status'), [])) (docs[r.type] ??= { final: 0, draft: 0, void: 0 })[r.status] = r.n;
      const turnover = safe(() => sdb.get("SELECT COALESCE(SUM(ABS(json_extract(calc_json,'$.net'))),0) AS v FROM bk_docs WHERE status='final' AND created_at>=?", w.since).v, 0);
      const g750 = safe(() => sdb.get("SELECT COALESCE(SUM(ABS(json_extract(j.value,'$.eq750'))),0) AS v FROM bk_docs d, json_each(d.calc_json,'$.lines') j WHERE d.status='final' AND d.created_at>=? AND json_extract(j.value,'$.kind') IN ('melt','used')", w.since).v, 0);
      const outputs = { print: 0, pdf: 0, share: 0, export: 0 };
      for (const r of safe(() => (logIndex(sdb), sdb.all("SELECT action, COUNT(*) AS n FROM bk_log WHERE at>=? AND action IN ('doc.print','doc.pdf','doc.share','export') GROUP BY action", w.since)), [])) outputs[r.action.replace('doc.', '')] = r.n;
      const pos = safe(() => sdb.get("SELECT COUNT(*) AS n, SUM(state='approved') AS ok, COALESCE(SUM(CASE WHEN state='approved' THEN amount END),0) AS amount FROM bk_pos WHERE at>=?", w.since), { n: 0, ok: 0, amount: 0 });
      const ai = safe(() => sdb.get('SELECT COALESCE(SUM(calls),0) AS calls, COALESCE(SUM(errors),0) AS errors FROM ai_usage WHERE day>=?', w.dayList[0]), { calls: 0, errors: 0 });
      const lastDoc = safe(() => sdb.get('SELECT MAX(created_at) AS at FROM bk_docs').at, null);
      const lastAct = db.get('SELECT MAX(at) AS at FROM act_events WHERE tenant_id=?', tn).at;
      out.push({ id: tn, name: tn === MAIN ? shopName(MAIN) : s.name, main: tn === MAIN, status: s.status, plan: s.plan, expiresAt: s.expires_at, createdAt: s.created_at, by: s.created_by === 'signup' ? 'signup' : tn === MAIN ? '' : 'vendor', users: safe(() => sdb.get('SELECT COUNT(*) AS n, COALESCE(SUM(active),0) AS a FROM users'), { n: 0, a: 0 }), docs, made: safe(() => sdb.get('SELECT COUNT(*) AS n FROM bk_docs WHERE created_at>=?', w.since).n, 0), turnover: Math.round(turnover), g750: Math.round(g750 * 1000) / 1000, outputs, shares: safe(() => sdb.get('SELECT COUNT(*) AS n FROM bk_shares WHERE created_at>=?', w.since).n, 0), pos: { n: pos.n ?? 0, ok: pos.ok ?? 0, amount: pos.amount ?? 0 }, ai, lastActivity: [lastDoc, lastAct].filter(Boolean).sort().at(-1) ?? null });
    }
    const v = { days: w.days, shops: out, cachedAt: now() };
    shopCache.set(key, { t: Date.now(), v });
    return v;
  }

  function io(w) {
    const ns = w.notSelf();
    const zero = () => w.dayList.map(() => 0);
    const add = (arr, rows) => {
      const idx = new Map(w.dayList.map((d, i) => [d, i]));
      for (const r of rows) if (idx.has(r.day)) arr[idx.get(r.day)] += r.n;
    };
    const inputs = { created: 0, amended: 0, voided: 0, signups: 0, uploads: 0 };
    const outputs = { print: 0, pdf: 0, share: 0, export: 0, codes: 0, aiCalls: 0, mcp: 0 };
    const sIn = zero(), sOut = zero();
    for (const [, sdb] of shopDbs()) {
      safe(() => logIndex(sdb));
      for (const r of safe(() => sdb.all("SELECT action, COUNT(*) AS n FROM bk_log WHERE at>=? AND action IN ('doc.create','doc.amend','doc.update','doc.void','doc.print','doc.pdf','doc.share','export') GROUP BY action", w.since), [])) {
        if (r.action === 'doc.create') inputs.created += r.n;
        else if (r.action === 'doc.amend' || r.action === 'doc.update') inputs.amended += r.n;
        else if (r.action === 'doc.void') inputs.voided += r.n;
        else outputs[r.action.replace('doc.', '')] += r.n;
      }
      add(sIn, safe(() => sdb.all(`SELECT date(at,'${TZ}') AS day, COUNT(*) AS n FROM bk_log WHERE at>=? AND action IN ('doc.create','doc.amend','doc.update','doc.void') GROUP BY 1`, w.since), []));
      add(sOut, safe(() => sdb.all(`SELECT date(at,'${TZ}') AS day, COUNT(*) AS n FROM bk_log WHERE at>=? AND action IN ('doc.print','doc.pdf','doc.share','export') GROUP BY 1`, w.since), []));
      for (const r of safe(() => sdb.all('SELECT day, SUM(calls) AS n FROM ai_usage WHERE day>=? GROUP BY day', w.dayList[0]), [])) {
        outputs.aiCalls += r.n ?? 0;
        add(sOut, [{ day: r.day, n: r.n ?? 0 }]);
      }
      inputs.signups += safe(() => sdb.get('SELECT COUNT(*) AS n FROM users WHERE created_at>=?', w.since).n, 0);
    }
    if (mediaDir) {
      const t0 = Date.parse(w.since);
      for (const f of safe(() => readdirSync(path.join(mediaDir, 'coins')), [])) if (safe(() => statSync(path.join(mediaDir, 'coins', f)).mtimeMs >= t0, false)) inputs.uploads++;
    }
    const codes = db.all(`SELECT via, ok, COUNT(*) AS n FROM auth_log WHERE kind='code' AND at>=?${ns.sql} GROUP BY via, ok`, w.since, ...ns.args);
    outputs.codes = codes.filter((r) => r.ok).reduce((s, r) => s + r.n, 0);
    add(sOut, db.all(`SELECT date(at,'${TZ}') AS day, COUNT(*) AS n FROM auth_log WHERE kind='code' AND ok=1 AND at>=?${ns.sql} GROUP BY 1`, w.since, ...ns.args));
    outputs.mcp = db.get("SELECT COUNT(*) AS n FROM act_events WHERE kind='mcp' AND at>=?", w.since).n;
    const tools = db.all("SELECT name, COUNT(*) AS n FROM act_events WHERE kind='mcp' AND at>=? GROUP BY name ORDER BY n DESC LIMIT 10", w.since);
    return { days: w.days, dayList: w.dayList, inputs, outputs, codesByVia: codes.map((r) => ({ via: r.via || '—', ok: !!r.ok, n: r.n })), mcpTools: tools, market: safe(() => market?.health?.() ?? null, null), series: { in: sIn, out: sOut } };
  }

  function exportCsv(w, url) {
    const what = url.searchParams.get('what');
    const fa = (s) => s ?? '';
    if (what === 'logins') {
      const r = logins(w, new URL('http://x/?'), 2000);
      return { filename: `beatris-logins-${w.days}d.csv`, mime: 'text/csv', text: toCsv(['زمان', 'نوع', 'موفق', 'راه', 'چه کسی', 'فروشگاه', 'IP', 'X-Forwarded-For', 'دستگاه', 'دلیل'], r.rows.map((x) => [x.at, x.kind, x.ok ? 1 : 0, x.via, x.who, x.shop, x.ip, x.xff, x.device, x.reason])) };
    }
    if (what === 'users') {
      const r = users(w, new URL('http://x/?'));
      return { filename: `beatris-users-${w.days}d.csv`, mime: 'text/csv', text: toCsv(['فروشگاه', 'نام', 'نقش', 'فعال', 'ساخته', 'آخرین ورود', 'آخرین دیده‌شدن', 'نشست', 'دقیقه', 'دستگاه'], r.users.map((x) => [x.shop, x.name, x.role, x.active ? 1 : 0, fa(x.createdAt), fa(x.lastLoginAt), fa(x.lastSeen), x.sessions, x.minutes, x.device])) };
    }
    if (what === 'shops') {
      const r = shops(w);
      return { filename: `beatris-shops-${w.days}d.csv`, mime: 'text/csv', text: toCsv(['فروشگاه', 'وضعیت', 'نسخه', 'کاربران', 'سند در بازه', 'گردش ریالی', 'گرم ۷۵۰', 'چاپ', 'PDF', 'اشتراک', 'خروجی', 'کارتخوان موفق', 'هوش مصنوعی', 'آخرین فعالیت'], r.shops.map((x) => [x.name, x.status, x.plan, x.users.n, x.made, x.turnover, x.g750, x.outputs.print, x.outputs.pdf, x.outputs.share, x.outputs.export, x.pos.ok, x.ai.calls, fa(x.lastActivity)])) };
    }
    if (what === 'signups') {
      const r = signups(w);
      return { filename: `beatris-signups-${w.days}d.csv`, mime: 'text/csv', text: toCsv(['فروشگاه', 'نام', 'نقش', 'ساخته', 'آخرین ورود'], r.accounts.map((x) => [x.shop, x.name, x.role, x.createdAt, fa(x.lastLoginAt)])) };
    }
    return null;
  }

  /** GET /api/owner/… for the owner (the caller checks isOwner first). */
  function route(method, url) {
    if (method !== 'GET') return { status: 405 };
    const w = windowOf(url);
    const p = url.pathname.slice('/api/owner/'.length);
    people.clear();
    if (p === 'overview') return { body: overview(w) };
    if (p === 'signups') return { body: signups(w) };
    if (p === 'logins') return { body: logins(w, url) };
    if (p === 'users') return { body: users(w, url) };
    const m = /^users\/(main|t_[0-9a-f]{12})\/([\w-]{1,64})$/.exec(p);
    if (m) {
      const r = safe(() => userTimeline(w, m[1], m[2]), null);
      return r ? { body: r } : { status: 404 };
    }
    if (p === 'behavior') return { body: behavior(w) };
    if (p === 'shops') return { body: shops(w) };
    if (p === 'io') return { body: io(w) };
    if (p === 'export') {
      const r = exportCsv(w, url);
      return r ? { body: r } : { status: 400 };
    }
    return { status: 404 };
  }

  return { isOwner, auth, record, mcp, prune, route, whoOf };
}
