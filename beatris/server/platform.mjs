// پلتفرم فروش — each shop that buys the app gets its own database; the vendor (the owner of the main shop) issues every
// account (username + password) from the vendor console, and the same account signs in on a phone and on a desktop.
// The main database keeps the registry: shops (tenants) and the username → shop map. Nothing here touches the books of
// any shop; it only opens them, signs sessions for them, and routes each request to its shop.
import { randomUUID, randomBytes } from 'node:crypto';
import { hashPin, verifyPin, normalizePhone, validPhone, digits, ROLES, makeLimiter } from './auth.mjs';

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
  function addUser(tn, { name, username, password, role = 'employee', phone }, by) {
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
    audit(by, 'vendor.user.create', { tenant: tn, id, username: uname, role });
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

  function vendor(method, pathname, body, user) {
    if (!isVendor(user)) throw new PlatformError(403, 'این بخش مخصوص ارائه‌دهنده (مالک فروشگاه اصلی) است.');
    for (const r of vendorRoutes) {
      if (r.method !== method) continue;
      const m = r.re.exec(pathname);
      if (m) return r.fn({ params: Object.fromEntries(Object.entries(m.groups ?? {}).map(([k, v]) => [k, decodeURIComponent(v)])), body: body ?? {}, user });
    }
    throw new PlatformError(404, 'مسیر API وجود ندارد.');
  }

  return { login, handleFor, tenantOfToken, all, vendor, isVendor, tenantRow };
}

/** «Chrome on Android» style label for the last device an account signed in from. */
export function deviceName(ua = '') {
  if (!ua) return '';
  const os = /Android/i.test(ua) ? 'اندروید' : /iPhone|iPad|iOS/i.test(ua) ? 'آیفون/آیپد' : /Windows/i.test(ua) ? 'ویندوز' : /Mac OS/i.test(ua) ? 'مک' : /Linux/i.test(ua) ? 'لینوکس' : 'دستگاه';
  const br = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
  return br ? `${br} روی ${os}` : os;
}
