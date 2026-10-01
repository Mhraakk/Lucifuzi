// پلتفرم فروش — each shop that buys the app gets its own database; the vendor (the owner of the main shop) issues every
// account (username + password) from the vendor console, and the same account signs in on a phone and on a desktop.
// The main database keeps the registry: shops (tenants) and the username → shop map. Nothing here touches the books of
// any shop; it only opens them, signs sessions for them, and routes each request to its shop.
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { hashPin, verifyPin, normalizePhone, validPhone, digits, ROLES, ADMIN_ROLES, makeLimiter } from './auth.mjs';

export const PLATFORM_SCHEMA = `
CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  plan TEXT NOT NULL DEFAULT 'base',
  expires_at TEXT,
  allow_pw_change INTEGER NOT NULL DEFAULT 0,
  max_users INTEGER NOT NULL DEFAULT 10,
  contact TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  created_by TEXT
);
CREATE TABLE IF NOT EXISTS logins (
  username TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_logins_tenant ON logins(tenant_id);
CREATE TABLE IF NOT EXISTS join_codes (
  tenant_id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS access_requests (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  role TEXT NOT NULL,
  username TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  ticket_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  user_id TEXT,
  granted_username TEXT,
  decided_by TEXT,
  decided_at TEXT,
  picked_at TEXT,
  ip TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_access_tenant ON access_requests(tenant_id, status);
`;
export const MAIN = 'main';
const now = () => new Date().toISOString();
const tehranDay = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(new Date());
export const USERNAME_RE = /^[a-z][a-z0-9._-]{2,31}$/;
export const normUser = (s) => digits(s).toLowerCase().replace(/\s+/g, '');
export const validPassword = (p) => typeof p === 'string' && p.length >= 8 && p.length <= 64 && /\S/.test(p);
/** A readable password (no 0/O/1/l): 10 characters. */
export function newPassword() {
  const A = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const b = randomBytes(10);
  return Array.from(b, (x) => A[x % A.length]).join('');
}

export class PlatformError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const bad = (m) => new PlatformError(400, m);

/**
 * mainDb: the database of the main shop (it also holds the registry).
 * openTenant(row) → a request handler (createApi) bound to that shop's own database; called once per shop.
 */
export function createPlatform({ mainDb, signer, mainHandle, openTenant }) {
  mainDb.raw.exec(PLATFORM_SCHEMA);
  const byUser = makeLimiter(8, 10 * 60 * 1000);
  const byIp = makeLimiter(40, 10 * 60 * 1000);
  const open = new Map([[MAIN, mainHandle]]);
  const tenantRow = (id) => (id === MAIN ? { id: MAIN, name: '', status: 'active', plan: 'full', expires_at: null, allow_pw_change: 1, max_users: 1000 } : mainDb.get('SELECT * FROM tenants WHERE id=?', id));
  const expired = (t) => !!t.expires_at && t.expires_at < tehranDay();

  function handleFor(id) {
    const t = tenantRow(id);
    if (!t) throw new PlatformError(401, 'حساب این فروشگاه پیدا نشد. دوباره وارد شوید.');
    if (t.status !== 'active') throw new PlatformError(403, 'حساب این فروشگاه غیرفعال شده است. با ارائه‌دهنده تماس بگیرید.');
    if (expired(t)) throw new PlatformError(403, 'اشتراک این فروشگاه به پایان رسیده است. برای تمدید با ارائه‌دهنده تماس بگیرید.');
    let h = open.get(id);
    if (!h) {
      h = openTenant(t);
      open.set(id, h);
    }
    h.setTenant?.(t); // policy edits by the vendor apply without a restart
    return h;
  }
  /** Every shop's handler (for lookups that are not tied to a session, like the public authenticity page). */
  function* all() {
    yield [MAIN, mainHandle];
    for (const t of mainDb.all("SELECT id FROM tenants WHERE status='active'")) {
      try {
        yield [t.id, handleFor(t.id)];
      } catch {
        /* expired shops are skipped */
      }
    }
  }
  const tenantOfToken = (token) => {
    const p = token && signer.verify(token);
    return p && p.t === 'session' ? p.tn ?? MAIN : null;
  };

  /* ---------------- sign-in ---------------- */
  function login(body, ip, ua = '') {
    const id = normUser(body.login ?? body.username ?? body.phone ?? '');
    const pass = String(body.password ?? body.pin ?? '');
    if (!id || !pass) throw bad('نام کاربری و رمز را وارد کنید.');
    if (byIp.blocked(ip) || byUser.blocked(id)) throw new PlatformError(429, 'تلاش‌های ناموفق زیاد بود. ده دقیقه دیگر دوباره امتحان کنید.');
    const fail = () => {
      byIp.fail(ip);
      byUser.fail(id);
      return new PlatformError(401, 'نام کاربری یا رمز درست نیست.');
    };
    let tn = MAIN, u = null;
    const reg = mainDb.get('SELECT tenant_id, user_id FROM logins WHERE username=?', id);
    if (reg) {
      tn = reg.tenant_id;
      if (!tenantRow(tn)) throw fail();
      u = dbOf(tn).get('SELECT * FROM users WHERE id=?', reg.user_id);
    } else {
      // the main shop still signs in with a mobile number
      const phone = normalizePhone(id);
      if (!validPhone(phone)) throw fail();
      u = mainDb.get('SELECT * FROM users WHERE phone=?', phone);
    }
    if (!u || !u.active || !verifyPin(pass, u.pin_hash)) throw fail();
    byUser.reset(id);
    handleFor(tn); // right password: now say plainly if the shop is suspended or its subscription ended
    const db = dbOf(tn);
    db.run('UPDATE users SET last_login_at=?, last_login_ua=? WHERE id=?', now(), String(ua).slice(0, 160), u.id);
    const token = signer.sign({ t: 'session', uid: u.id, tv: u.token_version, tn }, 30 * 86400);
    return { token, tenant: tn };
  }

  /* ---------------- vendor console ---------------- */
  const isVendor = (user) => !!user && user.role === 'owner' && !user.demo_blocked;
  const userOut = (u, tn) => ({ id: u.id, name: u.name, username: u.username, phone: /^09\d{9}$/.test(u.phone) ? u.phone : '', role: u.role, active: !!u.active, lastLoginAt: u.last_login_at, lastDevice: deviceName(u.last_login_ua), tenant: tn });
  function tenantOut(t) {
    let stats = { users: 0, docs: 0, parties: 0, lastDoc: null };
    try {
      const h = handleFor(t.id);
      stats = {
        users: h.db.get('SELECT COUNT(*) AS n FROM users').n,
        docs: h.db.get("SELECT COUNT(*) AS n FROM bk_docs WHERE status='final'").n,
        parties: h.db.get('SELECT COUNT(*) AS n FROM bk_parties').n,
        lastDoc: h.db.get('SELECT MAX(created_at) AS t FROM bk_docs').t,
        lastLogin: h.db.get('SELECT MAX(last_login_at) AS t FROM users').t,
      };
    } catch {
      /* suspended or expired: the registry row still shows */
    }
    return { id: t.id, name: t.name, status: t.status, plan: t.plan, expiresAt: t.expires_at, expired: expired(t), allowPasswordChange: !!t.allow_pw_change, maxUsers: t.max_users, contact: t.contact, note: t.note, createdAt: t.created_at, stats };
  }
  const takeUsername = (raw) => {
    const u = normUser(raw);
    if (!USERNAME_RE.test(u)) throw bad('نام کاربری: ۳ تا ۳۲ حرف لاتین کوچک، رقم، نقطه، خط تیره یا زیرخط؛ با حرف شروع شود.');
    if (mainDb.get('SELECT 1 FROM logins WHERE username=?', u)) throw new PlatformError(409, 'این نام کاربری قبلاً گرفته شده است.');
    return u;
  };
  function addUser(tn, { name, username, password, role = 'employee', phone }, by, action = 'vendor.user.create') {
    const h = tn === MAIN ? mainHandle : handleFor(tn);
    const nm = String(name ?? '').trim();
    if (nm.length < 2) throw bad('نام را کامل وارد کنید.');
    if (!ROLES.includes(role)) throw bad('نقش نامعتبر است.');
    const uname = takeUsername(username);
    const pw = password ? String(password) : newPassword();
    if (!validPassword(pw)) throw bad('رمز باید دست‌کم ۸ نویسه باشد.');
    const t = tenantRow(tn);
    if (h.db.get('SELECT COUNT(*) AS n FROM users WHERE active=1').n >= t.max_users) throw new PlatformError(409, `سقف کاربران این فروشگاه (${t.max_users}) پر است.`);
    let ph = normalizePhone(phone);
    if (!validPhone(ph) || h.db.get('SELECT 1 FROM users WHERE phone=?', ph)) ph = `u:${uname}`;
    const id = randomUUID();
    h.db.run('INSERT INTO users(id,name,phone,role,branch,pin_hash,created_at,username) VALUES (?,?,?,?,?,?,?,?)', id, nm, ph, role, '', hashPin(pw), now(), uname);
    mainDb.run('INSERT INTO logins(username,tenant_id,user_id,created_at) VALUES (?,?,?,?)', uname, tn, id, now());
    audit(by, action, { tenant: tn, id, username: uname, role });
    return { user: userOut(h.db.get('SELECT * FROM users WHERE id=?', id), tn), password: pw };
  }
  const audit = (by, action, detail) => mainDb.run('INSERT INTO audit(user_id,action,detail_json,created_at) VALUES (?,?,?,?)', by, action, JSON.stringify(detail), now());

  const vendorRoutes = [];
  const vr = (method, pattern, fn) => vendorRoutes.push({ method, re: new RegExp(`^${pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)')}$`), fn });
  vr('GET', '/api/vendor/tenants', () => ({ items: [tenantOut({ ...tenantRow(MAIN), name: 'فروشگاه اصلی (خودتان)', created_at: null }), ...mainDb.all('SELECT * FROM tenants ORDER BY created_at DESC').map(tenantOut)] }));
  vr('POST', '/api/vendor/tenants', ({ body, user }) => {
    const name = String(body.name ?? '').trim();
    if (name.length < 2) throw bad('نام فروشگاه را وارد کنید.');
    const plan = ['base', 'full'].includes(body.plan) ? body.plan : 'base';
    const exp = body.expiresAt ? String(body.expiresAt) : null;
    if (exp && !/^\d{4}-\d{2}-\d{2}$/.test(exp)) throw bad('تاریخ پایان اشتراک نامعتبر است.');
    takeUsername(body.username); // fail early, before anything is created
    const id = `t_${randomBytes(6).toString('hex')}`;
    mainDb.run('INSERT INTO tenants(id,name,status,plan,expires_at,allow_pw_change,max_users,contact,note,created_at,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)', id, name, 'active', plan, exp, body.allowPasswordChange ? 1 : 0, Math.max(1, Math.min(200, Number(body.maxUsers) || 10)), String(body.contact ?? '').slice(0, 120), String(body.note ?? '').slice(0, 400), now(), user.id);
    try {
      const h = handleFor(id);
      h.initShop({ name, plan });
      const owner = addUser(id, { name: body.ownerName || 'مدیر فروشگاه', username: body.username, password: body.password, role: 'owner', phone: body.phone }, user.id);
      audit(user.id, 'vendor.tenant.create', { id, name, plan });
      return { tenant: tenantOut(tenantRow(id)), owner: owner.user, password: owner.password };
    } catch (e) {
      mainDb.run('DELETE FROM logins WHERE tenant_id=?', id);
      mainDb.run('DELETE FROM tenants WHERE id=?', id);
      open.delete(id);
      throw e;
    }
  });
  vr('PATCH', '/api/vendor/tenants/:id', ({ params, body, user }) => {
    const t = mainDb.get('SELECT * FROM tenants WHERE id=?', params.id);
    if (!t) throw new PlatformError(404, 'فروشگاه پیدا نشد.');
    const set = (col, v) => mainDb.run(`UPDATE tenants SET ${col}=? WHERE id=?`, v, t.id);
    if (body.name !== undefined && String(body.name).trim().length >= 2) set('name', String(body.name).trim());
    if (body.status !== undefined) {
      if (!['active', 'suspended'].includes(body.status)) throw bad('وضعیت نامعتبر است.');
      set('status', body.status);
    }
    if (body.expiresAt !== undefined) {
      if (body.expiresAt && !/^\d{4}-\d{2}-\d{2}$/.test(body.expiresAt)) throw bad('تاریخ نامعتبر است.');
      set('expires_at', body.expiresAt || null);
    }
    if (body.plan !== undefined && ['base', 'full'].includes(body.plan)) set('plan', body.plan);
    if (body.allowPasswordChange !== undefined) set('allow_pw_change', body.allowPasswordChange ? 1 : 0);
    if (body.maxUsers !== undefined) set('max_users', Math.max(1, Math.min(200, Number(body.maxUsers) || 10)));
    if (body.contact !== undefined) set('contact', String(body.contact).slice(0, 120));
    if (body.note !== undefined) set('note', String(body.note).slice(0, 400));
    audit(user.id, 'vendor.tenant.update', { id: t.id, fields: Object.keys(body) });
    return { tenant: tenantOut(mainDb.get('SELECT * FROM tenants WHERE id=?', t.id)) };
  });
  const dbOf = (tn) => {
    if (tn === MAIN) return mainDb;
    if (!mainDb.get('SELECT 1 FROM tenants WHERE id=?', tn)) throw new PlatformError(404, 'فروشگاه پیدا نشد.');
    let h = open.get(tn);
    if (!h) {
      h = openTenant(tenantRow(tn));
      open.set(tn, h);
    }
    return h.db;
  };
  vr('GET', '/api/vendor/tenants/:id/users', ({ params }) => ({ items: dbOf(params.id).all('SELECT * FROM users ORDER BY created_at').map((u) => userOut(u, params.id)) }));
  vr('POST', '/api/vendor/tenants/:id/users', ({ params, body, user }) => {
    dbOf(params.id);
    return addUser(params.id, body, user.id);
  });
  vr('PATCH', '/api/vendor/tenants/:id/users/:uid', ({ params, body, user }) => {
    const db = dbOf(params.id);
    const u = db.get('SELECT * FROM users WHERE id=?', params.uid);
    if (!u) throw new PlatformError(404, 'کاربر پیدا نشد.');
    let password;
    if (body.name !== undefined && String(body.name).trim().length >= 2) db.run('UPDATE users SET name=? WHERE id=?', String(body.name).trim(), u.id);
    if (body.role !== undefined) {
      if (!ROLES.includes(body.role)) throw bad('نقش نامعتبر است.');
      if (params.id === MAIN && u.id === user.id) throw bad('نقش خودتان را نمی‌توانید تغییر دهید.');
      db.run('UPDATE users SET role=? WHERE id=?', body.role, u.id);
    }
    if (body.active !== undefined) {
      if (params.id === MAIN && u.id === user.id) throw bad('حساب خودتان را نمی‌توانید غیرفعال کنید.');
      db.run('UPDATE users SET active=?, token_version=token_version+1 WHERE id=?', body.active ? 1 : 0, u.id);
    }
    if (body.username !== undefined && normUser(body.username) !== u.username) {
      const un = takeUsername(body.username);
      if (u.username) mainDb.run('DELETE FROM logins WHERE username=?', u.username);
      db.run('UPDATE users SET username=? WHERE id=?', un, u.id);
      mainDb.run('INSERT INTO logins(username,tenant_id,user_id,created_at) VALUES (?,?,?,?)', un, params.id, u.id, now());
    }
    if (body.resetPassword || body.password) {
      password = body.password ? String(body.password) : newPassword();
      if (!validPassword(password)) throw bad('رمز باید دست‌کم ۸ نویسه باشد.');
      db.run('UPDATE users SET pin_hash=?, token_version=token_version+1 WHERE id=?', hashPin(password), u.id);
    }
    if (body.logoutAll) db.run('UPDATE users SET token_version=token_version+1 WHERE id=?', u.id);
    audit(user.id, 'vendor.user.update', { tenant: params.id, id: u.id, fields: Object.keys(body).filter((k) => k !== 'password') });
    return { user: userOut(db.get('SELECT * FROM users WHERE id=?', u.id), params.id), ...(password ? { password } : {}) };
  });

  /* ---------------- account requests (spec 0011) ----------------
   * A colleague asks from the sign-in page with the shop's invite code; the shop's owner or manager approves inside the
   * app. No password is ever stored: the requester's device holds a random ticket (the server keeps its hash) and the
   * password is minted at the moment that device picks it up — once. */
  const CODE_ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const newCode = () => Array.from(randomBytes(8), (x) => CODE_ABC[x % CODE_ABC.length]).join('');
  const normCode = (s) => digits(s).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const showCode = (c) => `${c.slice(0, 4)}-${c.slice(4)}`;
  const sha = (s) => createHash('sha256').update(String(s)).digest('hex');
  const reqByIp = makeLimiter(6, 60 * 60 * 1000); // requests sent, per hour
  const guessByIp = makeLimiter(20, 10 * 60 * 1000); // wrong codes and tickets
  const PICKUP_MS = 7 * 864e5;
  const REQ_ROLES = ['employee', 'trainer', 'manager'];
  const ROLE_NAME = { employee: 'فروشنده', trainer: 'مربی', manager: 'مدیر', owner: 'مالک' };
  const txt = (v, max) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
  const codeRow = (tn) => {
    let r = mainDb.get('SELECT * FROM join_codes WHERE tenant_id=?', tn);
    if (!r) {
      mainDb.run('INSERT INTO join_codes(tenant_id,code,enabled,created_at) VALUES (?,?,1,?)', tn, newCode(), now());
      r = mainDb.get('SELECT * FROM join_codes WHERE tenant_id=?', tn);
    }
    return r;
  };
  /** The shop behind an invite code, or a plain error (counted against the caller's address). */
  function shopOfCode(raw, ip) {
    if (guessByIp.blocked(ip)) throw new PlatformError(429, 'تلاش‌های نادرست زیاد بود. ده دقیقه دیگر دوباره امتحان کنید.');
    const r = mainDb.get('SELECT * FROM join_codes WHERE code=?', normCode(raw));
    if (!r) {
      guessByIp.fail(ip);
      throw bad('کد فروشگاه درست نیست. کد را از مدیر فروشگاه بگیرید.');
    }
    if (!r.enabled) throw new PlatformError(403, 'درخواست حساب در این فروشگاه فعلاً بسته است؛ با مدیر فروشگاه هماهنگ کنید.');
    let h;
    try {
      h = handleFor(r.tenant_id);
    } catch {
      throw new PlatformError(403, 'درخواست حساب برای این فروشگاه فعلاً ممکن نیست.');
    }
    return { tn: r.tenant_id, shop: h.shopName?.() ?? '' };
  }
  const freeUsername = (u) => USERNAME_RE.test(u) && !mainDb.get('SELECT 1 FROM logins WHERE username=?', u);
  function suggestUsername(r) {
    if (r.username && freeUsername(r.username)) return r.username;
    const base = `u${r.phone.slice(-7)}`;
    if (freeUsername(base)) return base;
    for (let i = 0; i < 20; i++) {
      const u = `${base}${randomBytes(1)[0] % 100}`;
      if (freeUsername(u)) return u;
    }
    return `u${randomBytes(5).toString('hex')}`;
  }
  const existsIn = (tn, phone) => !!dbOf(tn).get('SELECT 1 FROM users WHERE phone=?', phone);
  const reqOut = (r, tn) => ({
    id: r.id, name: r.name, phone: r.phone, role: r.role, roleName: ROLE_NAME[r.role], username: r.username, note: r.note, status: r.status, createdAt: r.created_at, decidedAt: r.decided_at,
    grantedUsername: r.granted_username, picked: !!r.picked_at, suggested: r.status === 'pending' ? suggestUsername(r) : null, hasAccount: r.status === 'pending' && existsIn(tn, r.phone),
  });
  function mintPassword(r) {
    const db = dbOf(r.tenant_id);
    const pw = newPassword();
    db.run('UPDATE users SET pin_hash=?, token_version=token_version+1 WHERE id=?', hashPin(pw), r.user_id);
    mainDb.run('UPDATE access_requests SET picked_at=? WHERE id=?', now(), r.id);
    return pw;
  }

  function access(method, pathname, body, { ip, user, tn, query }) {
    // ----- public: the sign-in page -----
    if (method === 'GET' && pathname === '/api/access/shop') return { shop: shopOfCode(query.get('code') ?? '', ip).shop };
    if (method === 'POST' && pathname === '/api/access/requests') {
      if (reqByIp.blocked(ip)) throw new PlatformError(429, 'درخواست‌های زیادی از این دستگاه ثبت شده است؛ یک ساعت دیگر دوباره امتحان کنید.');
      const { tn: shopTn, shop } = shopOfCode(body.code, ip);
      if (txt(body.website, 10)) return { ok: true, ticket: randomBytes(24).toString('base64url'), shop }; // honeypot
      const name = txt(body.name, 60), note = txt(body.note, 300);
      const phone = normalizePhone(body.phone);
      const role = REQ_ROLES.includes(body.role) ? body.role : 'employee';
      const username = normUser(body.username ?? '');
      if (name.length < 2) throw bad('نام و نام خانوادگی را بنویسید.');
      if (!validPhone(phone)) throw bad('شماره موبایل باید ۱۱ رقم و با ۰۹ باشد.');
      if (username && !USERNAME_RE.test(username)) throw bad('نام کاربری: ۳ تا ۳۲ حرف لاتین کوچک، رقم، نقطه، خط تیره یا زیرخط؛ با حرف شروع شود.');
      if (mainDb.get("SELECT 1 FROM access_requests WHERE tenant_id=? AND phone=? AND status='pending'", shopTn, phone)) throw new PlatformError(409, 'برای این شماره درخواستی در انتظار تأیید هست؛ از مدیر فروشگاه بخواهید آن را بررسی کند.');
      if (mainDb.get("SELECT COUNT(*) AS n FROM access_requests WHERE tenant_id=? AND status='pending'", shopTn).n >= 30) throw new PlatformError(429, 'درخواست‌های بررسی‌نشده این فروشگاه زیاد است؛ کمی بعد دوباره امتحان کنید.');
      reqByIp.fail(ip);
      const ticket = randomBytes(24).toString('base64url');
      mainDb.run('INSERT INTO access_requests(id,tenant_id,name,phone,role,username,note,ticket_hash,ip,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)', randomUUID(), shopTn, name, phone, role, username, note, sha(ticket), String(ip).slice(0, 60), now());
      return { ok: true, ticket, shop };
    }
    if (method === 'POST' && pathname === '/api/access/status') {
      if (guessByIp.blocked(ip)) throw new PlatformError(429, 'تلاش‌های نادرست زیاد بود. ده دقیقه دیگر دوباره امتحان کنید.');
      const r = mainDb.get('SELECT * FROM access_requests WHERE ticket_hash=?', sha(String(body.ticket ?? '')));
      if (!r) {
        guessByIp.fail(ip);
        throw new PlatformError(404, 'این درخواست پیدا نشد.');
      }
      let shop = '';
      try {
        shop = handleFor(r.tenant_id).shopName?.() ?? '';
      } catch {
        /* suspended shop: the status still shows */
      }
      const out = { status: r.status, shop, name: r.name, createdAt: r.created_at };
      if (r.status !== 'approved') return out;
      out.username = r.granted_username;
      const fresh = !r.picked_at && Date.now() - Date.parse(r.decided_at) < PICKUP_MS && dbOf(r.tenant_id).get('SELECT active FROM users WHERE id=?', r.user_id)?.active;
      if (fresh) {
        out.password = mintPassword(r);
        audit(r.user_id, 'access.pickup', { tenant: r.tenant_id, id: r.id });
      } else out.handedToManager = true;
      return out;
    }

    // ----- the shop's owner or manager -----
    if (!user) throw new PlatformError(401, 'ورود لازم است.');
    if (!ADMIN_ROLES.has(user.role) || user.active === 0) throw new PlatformError(403, 'تأیید درخواست حساب مخصوص مالک و مدیر فروشگاه است.');
    if (method === 'GET' && pathname === '/api/access/admin') {
      const c = codeRow(tn);
      const items = mainDb.all("SELECT * FROM access_requests WHERE tenant_id=? ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, created_at DESC LIMIT 60", tn).map((r) => reqOut(r, tn));
      return { code: showCode(c.code), enabled: !!c.enabled, pending: items.filter((r) => r.status === 'pending').length, items };
    }
    if (method === 'POST' && pathname === '/api/access/admin/code') {
      const c = codeRow(tn);
      if (body.regenerate) mainDb.run('UPDATE join_codes SET code=?, created_at=? WHERE tenant_id=?', newCode(), now(), tn);
      if (body.enabled !== undefined) mainDb.run('UPDATE join_codes SET enabled=? WHERE tenant_id=?', body.enabled ? 1 : 0, tn);
      audit(user.id, 'access.code', { tenant: tn, regenerate: !!body.regenerate, enabled: body.enabled });
      const n = mainDb.get('SELECT * FROM join_codes WHERE tenant_id=?', c.tenant_id);
      return { code: showCode(n.code), enabled: !!n.enabled };
    }
    const m = /^\/api\/access\/admin\/requests\/([^/]+)$/.exec(pathname);
    if (method === 'POST' && m) {
      const r = mainDb.get('SELECT * FROM access_requests WHERE id=? AND tenant_id=?', decodeURIComponent(m[1]), tn);
      if (!r) throw new PlatformError(404, 'این درخواست پیدا نشد.');
      if (body.action === 'reject') {
        if (r.status !== 'pending') throw new PlatformError(409, 'این درخواست قبلاً بررسی شده است.');
        mainDb.run("UPDATE access_requests SET status='rejected', decided_by=?, decided_at=? WHERE id=?", user.id, now(), r.id);
        audit(user.id, 'access.reject', { tenant: tn, id: r.id });
        return { request: reqOut(mainDb.get('SELECT * FROM access_requests WHERE id=?', r.id), tn) };
      }
      if (body.action === 'approve') {
        if (r.status !== 'pending') throw new PlatformError(409, 'این درخواست قبلاً بررسی شده است.');
        const role = ROLES.includes(body.role) ? body.role : r.role;
        if (role === 'owner' && user.role !== 'owner') throw new PlatformError(403, 'فقط مالک می‌تواند نقش مالک بدهد.');
        const made = addUser(tn, { name: r.name, username: body.username ? body.username : suggestUsername(r), role, phone: r.phone }, user.id, 'access.approve');
        // the password addUser made is thrown away: the requester's device mints its own at pickup
        mainDb.run("UPDATE access_requests SET status='approved', user_id=?, granted_username=?, decided_by=?, decided_at=? WHERE id=?", made.user.id, made.user.username, user.id, now(), r.id);
        return { request: reqOut(mainDb.get('SELECT * FROM access_requests WHERE id=?', r.id), tn), user: made.user };
      }
      if (body.action === 'password') {
        if (r.status !== 'approved') throw new PlatformError(409, 'این درخواست هنوز تأیید نشده است.');
        if (!dbOf(tn).get('SELECT 1 FROM users WHERE id=? AND active=1', r.user_id)) throw new PlatformError(409, 'این حساب غیرفعال است.');
        const password = mintPassword(r);
        audit(user.id, 'access.password', { tenant: tn, id: r.id });
        return { username: r.granted_username, password, shop: handleFor(tn).shopName?.() ?? '' };
      }
      throw bad('عمل نامعتبر است.');
    }
    throw new PlatformError(404, 'مسیر API وجود ندارد.');
  }

  function vendor(method, pathname, body, user) {
    if (!isVendor(user)) throw new PlatformError(403, 'این بخش مخصوص ارائه‌دهنده (مالک فروشگاه اصلی) است.');
    for (const r of vendorRoutes) {
      if (r.method !== method) continue;
      const m = r.re.exec(pathname);
      if (m) return r.fn({ params: Object.fromEntries(Object.entries(m.groups ?? {}).map(([k, v]) => [k, decodeURIComponent(v)])), body: body ?? {}, user });
    }
    throw new PlatformError(404, 'مسیر API وجود ندارد.');
  }

  return { login, handleFor, tenantOfToken, all, vendor, isVendor, tenantRow, access };
}

/** «Chrome on Android» style label for the last device an account signed in from. */
export function deviceName(ua = '') {
  if (!ua) return '';
  const os = /Android/i.test(ua) ? 'اندروید' : /iPhone|iPad|iOS/i.test(ua) ? 'آیفون/آیپد' : /Windows/i.test(ua) ? 'ویندوز' : /Mac OS/i.test(ua) ? 'مک' : /Linux/i.test(ua) ? 'لینوکس' : 'دستگاه';
  const br = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
  return br ? `${br} روی ${os}` : os;
}
