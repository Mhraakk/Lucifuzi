// پلتفرم فروش — each shop that buys the app gets its own database. Nobody is issued a username or a password (spec
// 0022): an account is a name, a mobile number and a role, and a person signs in with that number and a code sent by SMS.
// The number finds its shop by itself (no shop code); a number in several shops picks one after the code; a number with
// no account may open its own shop when the vendor keeps sign-up open. The main database keeps the registry of shops;
// nothing here touches the books of any shop — it only opens them, signs sessions for them and routes each request.
import { randomUUID, randomBytes } from 'node:crypto';
import { normalizePhone, validPhone, ROLES, NO_PIN, makeLimiter, normalizeEmail, validEmail, isProd } from './auth.mjs';
import { SMS_PROVIDERS } from './sms.mjs';

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
// (logins, join_codes and access_requests belong to the retired username accounts and shop codes; kept, never dropped)
export const MAIN = 'main';
const now = () => new Date().toISOString();
const tehranDay = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(new Date());
const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const txt = (v, max) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
const masked = (p) => `${p.slice(0, 4)}…${p.slice(-2)}`;
const PLANS = ['base', 'full'];
export const ROLE_NAME = { employee: 'فروشنده', trainer: 'مربی', manager: 'مدیر', owner: 'مالک' };

export class PlatformError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const bad = (m) => new PlatformError(400, m);
const PHONE_MSG = 'شماره موبایل باید ۱۱ رقم و با ۰۹ شروع شود.';
const EMAIL_MSG = 'نشانی ایمیل درست نیست.';

/**
 * mainDb: the database of the main shop (it also holds the registry). openTenant(row) → a request handler (createApi)
 * bound to that shop's own database; called once per shop. otp: the code service (server/otp.mjs). demo: demo accounts on.
 */
export function createPlatform({ mainDb, signer, mainHandle, openTenant, otp, demo = false, env = process.env }) {
  mainDb.raw.exec(PLATFORM_SCHEMA);
  const signupByIp = makeLimiter(3, 864e5);
  const open = new Map([[MAIN, mainHandle]]);
  const tenantRow = (id) => (id === MAIN ? { id: MAIN, name: '', status: 'active', plan: 'full', expires_at: null, allow_pw_change: 1, max_users: 0, contact: '', note: '' } : mainDb.get('SELECT * FROM tenants WHERE id=?', id));
  const expired = (t) => !!t.expires_at && t.expires_at < tehranDay();
  const audit = (by, action, detail) => mainDb.run('INSERT INTO audit(user_id,action,detail_json,created_at) VALUES (?,?,?,?)', by, action, JSON.stringify(detail), now());

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
  /** A shop's database whatever its state (the vendor console and the sign-in lookup also see suspended shops). */
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
  const shopName = (tn) => (tn === MAIN ? mainHandle.shopName?.() : open.get(tn)?.shopName?.() || tenantRow(tn)?.name) || '';
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

  /* ---------------- sign-in by SMS (spec 0022) ---------------- */
  const signupConf = () => {
    const r = mainDb.get("SELECT value_json FROM settings WHERE key='signup'");
    const s = r ? JSON.parse(r.value_json) : {};
    return { open: s.open !== false, plan: PLANS.includes(s.plan) ? s.plan : 'base', trialDays: Math.max(0, Math.min(365, Math.round(Number(s.trialDays) || 0))) };
  };
  /**
   * Every active account of a number (a string) or of an email ({ email }, spec 0034), in every shop; `blocked` says
   * why a suspended or expired shop cannot open.
   */
  function accountsOf(who) {
    const email = typeof who === 'object' && who ? who.email : null;
    const out = [];
    const take = (tn, db, row) => {
      const u = email ? db.get('SELECT * FROM users WHERE email=?', email) : db.get('SELECT * FROM users WHERE phone=?', who);
      if (!u || !u.active) return;
      const blocked = tn === MAIN ? null : row.status !== 'active' ? 'حساب این فروشگاه غیرفعال شده است. با ارائه‌دهنده تماس بگیرید.' : expired(row) ? 'اشتراک این فروشگاه به پایان رسیده است. برای تمدید با ارائه‌دهنده تماس بگیرید.' : null;
      out.push({ tn, user: u, blocked });
    };
    take(MAIN, mainDb, tenantRow(MAIN));
    for (const t of mainDb.all('SELECT * FROM tenants ORDER BY created_at')) {
      try {
        take(t.id, dbOf(t.id), t);
      } catch {
        /* a shop whose file cannot open is skipped, never a reason to refuse the others */
      }
    }
    return out;
  }
  const shopOut = (a) => ({ tenant: a.tn, shop: shopName(a.tn) || 'فروشگاه', role: a.user.role, roleName: ROLE_NAME[a.user.role], name: a.user.name });
  function session(a, ua = '') {
    if (a.tn !== MAIN) handleFor(a.tn); // says plainly if the shop was suspended a moment ago
    const db = dbOf(a.tn);
    db.run('UPDATE users SET last_login_at=?, last_login_ua=? WHERE id=?', now(), String(ua ?? '').slice(0, 160), a.user.id);
    const u = db.get('SELECT * FROM users WHERE id=?', a.user.id);
    return { token: signer.sign({ t: 'session', uid: u.id, tv: u.token_version, tn: a.tn }, 30 * 86400), tenant: a.tn };
  }
  // the ticket names who passed the code: { phone } or { email }
  const ticketFor = (id) => signer.sign({ t: 'otp-ok', ...id }, 900);
  const phoneOf = (raw) => {
    const p = normalizePhone(raw);
    if (!validPhone(p)) throw bad(PHONE_MSG);
    return p;
  };
  const emailOf = (raw) => {
    const e = normalizeEmail(raw);
    if (!validEmail(e)) throw bad(EMAIL_MSG);
    return e;
  };
  /** An optional email field: '' clears it, anything else must be a valid address. */
  const optEmail = (raw) => (raw === undefined || raw === null || String(raw).trim() === '' ? null : emailOf(raw));

  /** Step 1: a code to the email or the number (demo accounts see it on the screen; one that may not sign in gets nothing). */
  async function sendLoginCode(body, ip, origin = '') {
    if (body.email !== undefined) {
      const email = emailOf(body.email);
      const accts = accountsOf({ email });
      const allDemo = demo && accts.length > 0 && accts.every((a) => a.tn === MAIN && a.user.demo);
      const mode = allDemo ? 'demo' : accts.length || signupConf().open ? 'auto' : 'silent';
      // the link in the same email brings the person back to this sign-in page
      return { ok: true, email, ...(await otp.sendEmail({ email, purpose: 'login', ip, mode, redirectTo: origin ? `${origin}/login` : '' })) };
    }
    const phone = phoneOf(body.phone);
    const accts = accountsOf(phone);
    const allDemo = demo && accts.length > 0 && accts.every((a) => a.tn === MAIN && a.user.demo);
    const mode = allDemo ? 'demo' : accts.length || signupConf().open ? 'auto' : 'silent';
    return { ok: true, phone, ...(await otp.send({ phone, purpose: 'login', ip, mode })) };
  }
  /** Step 2: the code. One shop → a session; several → the list and a ticket; none → sign-up with a ticket. */
  async function verifyLogin(body, ip, ua) {
    if (body.accessToken !== undefined) return afterCode({ email: await otp.checkEmailLink({ accessToken: body.accessToken, purpose: 'login', ip }) }, ua);
    if (body.email !== undefined) {
      const email = emailOf(body.email);
      await otp.checkEmail({ email, purpose: 'login', code: body.code, ip });
      return afterCode({ email }, ua);
    }
    const phone = phoneOf(body.phone);
    otp.check({ phone, purpose: 'login', code: body.code, ip });
    return afterCode({ phone }, ua);
  }
  function afterCode(id, ua) {
    const accts = accountsOf(id.email ? { email: id.email } : id.phone);
    const usable = accts.filter((a) => !a.blocked);
    if (!accts.length) {
      if (!signupConf().open) throw new PlatformError(403, id.email ? 'این ایمیل هنوز در بئاتریس حسابی ندارد. از مدیر فروشگاه بخواهید ایمیل شما را در «تیم» ثبت کند.' : 'این شماره هنوز در بئاتریس حسابی ندارد. از مدیر فروشگاه بخواهید شماره شما را در «تیم» اضافه کند.');
      return { ticket: ticketFor(id), signup: true, ...id };
    }
    if (!usable.length) throw new PlatformError(403, accts[0].blocked);
    if (usable.length === 1) return session(usable[0], ua);
    return { ticket: ticketFor(id), shops: usable.map(shopOut), ...id };
  }
  /** Step 3 (only when needed): the shop picked from the list, or a new shop for a number with no account. */
  function finishLogin(body, ip, ua) {
    const p = signer.verify(String(body.ticket ?? ''));
    const id = p?.t !== 'otp-ok' ? null : p.email ? (validEmail(p.email) ? { email: p.email } : null) : validPhone(p.phone) ? { phone: p.phone } : null;
    if (!id) throw new PlatformError(401, 'مهلت ورود گذشت؛ دوباره کد بگیرید.');
    const accts = accountsOf(id.email ? { email: id.email } : id.phone);
    const usable = accts.filter((a) => !a.blocked);
    if (body.tenant) {
      const a = usable.find((x) => x.tn === String(body.tenant));
      if (!a) throw new PlatformError(403, id.email ? 'این ایمیل در این فروشگاه حسابی ندارد.' : 'این شماره در این فروشگاه حسابی ندارد.');
      return session(a, ua);
    }
    if (usable.length === 1) return session(usable[0], ua); // a second tap right after the shop was made
    if (usable.length > 1) return { ticket: body.ticket, shops: usable.map(shopOut), ...id };
    // a shop suspended after the code was checked: say so, never offer a new shop in its place
    if (accts.length) throw new PlatformError(403, accts[0].blocked);
    return signup(id, body, ip, ua);
  }
  /** A new shop for whoever passed the code. Sign-up by email also asks for the mobile: it is the account's key. */
  function signup(id, body, ip, ua) {
    const email = id.email ?? null;
    const phone = email ? phoneOf(body.phone) : id.phone;
    const conf = signupConf();
    if (!conf.open) throw new PlatformError(403, 'ساخت فروشگاه تازه فعلاً بسته است؛ با ارائه‌دهنده تماس بگیرید.');
    const name = txt(body.name, 60), shop = txt(body.shopName, 80);
    if (name.length < 2) throw bad('نام و نام خانوادگی را بنویسید.');
    if (shop.length < 2) throw bad('نام فروشگاه را بنویسید.');
    if (signupByIp.blocked(ip)) throw new PlatformError(429, 'از این شبکه امروز چند فروشگاه ساخته شده است؛ فردا دوباره امتحان کنید.');
    const cap = Math.max(1, Number(env.BEATRIS_SIGNUP_DAILY_CAP) || 50);
    if (mainDb.get("SELECT COUNT(*) AS n FROM tenants WHERE created_by='signup' AND created_at>?", new Date(Date.now() - 864e5).toISOString()).n >= cap) throw new PlatformError(429, 'ساخت فروشگاه تازه امروز به سقف رسید؛ فردا دوباره امتحان کنید.');
    signupByIp.fail(ip);
    const tn = makeShop({ name: shop, plan: conf.plan, expiresAt: conf.trialDays ? addDays(tehranDay(), conf.trialDays) : null, maxUsers: 0, contact: email ? `${phone} · ${email}` : phone, note: email ? 'ساخته‌شده با ثبت‌نام ایمیل' : 'ساخته‌شده با ثبت‌نام موبایل', by: 'signup', owner: { name, phone, email } });
    audit(null, 'signup.shop', { id: tn, phone: masked(phone), email: !!email, plan: conf.plan });
    return session(accountsOf(email ? { email } : phone).find((a) => a.tn === tn), ua);
  }

  /* ---------------- accounts: a name, a mobile, a role ---------------- */
  // in production a demo account is never the vendor, whatever its role (spec 0054)
  const prodEnv = isProd(env);
  const isVendor = (user) => !!user && user.role === 'owner' && !(prodEnv && user.demo);
  const userOut = (u, tn) => ({ id: u.id, name: u.name, phone: validPhone(u.phone) ? u.phone : '', noPhone: !validPhone(u.phone), email: u.email ?? '', username: u.username ?? null, role: u.role, active: !!u.active, lastLoginAt: u.last_login_at, lastDevice: deviceName(u.last_login_ua), tenant: tn });
  function tenantOut(t) {
    let stats = { users: 0, docs: 0, parties: 0, lastDoc: null };
    try {
      const h = handleFor(t.id);
      stats = {
        users: h.db.get('SELECT COUNT(*) AS n FROM users WHERE active=1').n,
        docs: h.db.get("SELECT COUNT(*) AS n FROM bk_docs WHERE status='final'").n,
        parties: h.db.get('SELECT COUNT(*) AS n FROM bk_parties').n,
        lastDoc: h.db.get('SELECT MAX(created_at) AS t FROM bk_docs').t,
        lastLogin: h.db.get('SELECT MAX(last_login_at) AS t FROM users').t,
        noPhone: h.db.all('SELECT phone FROM users WHERE active=1').filter((u) => !validPhone(u.phone)).length,
      };
    } catch {
      /* suspended or expired: the registry row still shows */
    }
    return { id: t.id, name: t.name, status: t.status, plan: t.plan, expiresAt: t.expires_at, expired: expired(t), maxUsers: t.max_users, contact: t.contact, note: t.note, createdAt: t.created_at, selfMade: t.created_by === 'signup', stats };
  }
  /** One account in one shop: a valid mobile (and an optional email) not yet used in that shop, inside its cap (0 = unlimited). */
  function addUser(tn, { name, role = 'employee', phone, branch = '', email }, by, action = 'vendor.user.create') {
    const db = tn === MAIN ? mainDb : handleFor(tn).db;
    const nm = txt(name, 60);
    if (nm.length < 2) throw bad('نام را کامل وارد کنید.');
    if (!ROLES.includes(role)) throw bad('نقش نامعتبر است.');
    const ph = normalizePhone(phone);
    if (!validPhone(ph)) throw bad(PHONE_MSG);
    if (db.get('SELECT 1 FROM users WHERE phone=?', ph)) throw new PlatformError(409, 'این شماره در همین فروشگاه حساب دارد.');
    const em = optEmail(email);
    if (em && db.get('SELECT 1 FROM users WHERE email=?', em)) throw new PlatformError(409, 'این ایمیل در همین فروشگاه حساب دارد.');
    const t = tenantRow(tn);
    if (t.max_users > 0 && db.get('SELECT COUNT(*) AS n FROM users WHERE active=1').n >= t.max_users) throw new PlatformError(409, `سقف کاربران این فروشگاه (${t.max_users}) پر است.`);
    const id = randomUUID();
    db.run('INSERT INTO users(id,name,phone,role,branch,pin_hash,created_at,email) VALUES (?,?,?,?,?,?,?,?)', id, nm, ph, role, txt(branch, 40), NO_PIN, now(), em);
    audit(by, action, { tenant: tn, id, role, email: !!em });
    return { user: userOut(db.get('SELECT * FROM users WHERE id=?', id), tn) };
  }
  /** A new shop and its owner; undone completely if any part fails. */
  function makeShop({ name, plan, expiresAt, maxUsers, contact = '', note = '', by, owner }) {
    const id = `t_${randomBytes(6).toString('hex')}`;
    mainDb.run('INSERT INTO tenants(id,name,status,plan,expires_at,allow_pw_change,max_users,contact,note,created_at,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)', id, name, 'active', plan, expiresAt, 0, maxUsers, contact, note, now(), by);
    try {
      handleFor(id).initShop({ name, plan });
      addUser(id, { name: owner.name || 'مدیر فروشگاه', role: 'owner', phone: owner.phone, email: owner.email }, by === 'signup' ? null : by);
      return id;
    } catch (e) {
      mainDb.run('DELETE FROM tenants WHERE id=?', id);
      open.delete(id);
      throw e;
    }
  }

  const vendorRoutes = [];
  const vr = (method, pattern, fn) => vendorRoutes.push({ method, re: new RegExp(`^${pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)')}$`), fn });
  const capOf = (v) => Math.max(0, Math.min(1000, Math.round(Number(v) || 0)));
  vr('GET', '/api/vendor/tenants', () => ({ items: [tenantOut({ ...tenantRow(MAIN), name: 'فروشگاه اصلی (خودتان)', created_at: null }), ...mainDb.all('SELECT * FROM tenants ORDER BY created_at DESC').map(tenantOut)] }));
  vr('POST', '/api/vendor/tenants', ({ body, user }) => {
    const name = txt(body.name, 80);
    if (name.length < 2) throw bad('نام فروشگاه را وارد کنید.');
    const plan = PLANS.includes(body.plan) ? body.plan : 'base';
    const exp = body.expiresAt ? String(body.expiresAt) : null;
    if (exp && !/^\d{4}-\d{2}-\d{2}$/.test(exp)) throw bad('تاریخ پایان اشتراک نامعتبر است.');
    const phone = phoneOf(body.phone); // fail early, before anything is created
    const email = optEmail(body.ownerEmail);
    const id = makeShop({ name, plan, expiresAt: exp, maxUsers: capOf(body.maxUsers), contact: txt(body.contact, 120), note: txt(body.note, 400), by: user.id, owner: { name: txt(body.ownerName, 60), phone, email } });
    audit(user.id, 'vendor.tenant.create', { id, name, plan });
    return { tenant: tenantOut(tenantRow(id)), owner: userOut(dbOf(id).get('SELECT * FROM users WHERE phone=?', phone), id) };
  });
  vr('PATCH', '/api/vendor/tenants/:id', ({ params, body, user }) => {
    const t = mainDb.get('SELECT * FROM tenants WHERE id=?', params.id);
    if (!t) throw new PlatformError(404, 'فروشگاه پیدا نشد.');
    const set = (col, v) => mainDb.run(`UPDATE tenants SET ${col}=? WHERE id=?`, v, t.id);
    if (body.name !== undefined && txt(body.name, 80).length >= 2) set('name', txt(body.name, 80));
    if (body.status !== undefined) {
      if (!['active', 'suspended'].includes(body.status)) throw bad('وضعیت نامعتبر است.');
      set('status', body.status);
    }
    if (body.expiresAt !== undefined) {
      if (body.expiresAt && !/^\d{4}-\d{2}-\d{2}$/.test(body.expiresAt)) throw bad('تاریخ نامعتبر است.');
      set('expires_at', body.expiresAt || null);
    }
    if (body.plan !== undefined && PLANS.includes(body.plan)) set('plan', body.plan);
    if (body.maxUsers !== undefined) set('max_users', capOf(body.maxUsers));
    if (body.contact !== undefined) set('contact', txt(body.contact, 120));
    if (body.note !== undefined) set('note', txt(body.note, 400));
    audit(user.id, 'vendor.tenant.update', { id: t.id, fields: Object.keys(body) });
    return { tenant: tenantOut(mainDb.get('SELECT * FROM tenants WHERE id=?', t.id)) };
  });
  vr('GET', '/api/vendor/tenants/:id/users', ({ params }) => ({ items: dbOf(params.id).all('SELECT * FROM users ORDER BY created_at').map((u) => userOut(u, params.id)) }));
  vr('POST', '/api/vendor/tenants/:id/users', ({ params, body, user }) => {
    dbOf(params.id);
    return addUser(params.id, { name: body.name, role: body.role, phone: body.phone, email: body.email }, user.id);
  });
  vr('PATCH', '/api/vendor/tenants/:id/users/:uid', ({ params, body, user }) => {
    const db = dbOf(params.id);
    const u = db.get('SELECT * FROM users WHERE id=?', params.uid);
    if (!u) throw new PlatformError(404, 'کاربر پیدا نشد.');
    const self = params.id === MAIN && u.id === user.id;
    if (body.name !== undefined && txt(body.name, 60).length >= 2) db.run('UPDATE users SET name=? WHERE id=?', txt(body.name, 60), u.id);
    if (body.role !== undefined) {
      if (!ROLES.includes(body.role)) throw bad('نقش نامعتبر است.');
      if (self) throw bad('نقش خودتان را نمی‌توانید تغییر دهید.');
      db.run('UPDATE users SET role=? WHERE id=?', body.role, u.id);
    }
    if (body.active !== undefined) {
      if (self) throw bad('حساب خودتان را نمی‌توانید غیرفعال کنید.');
      db.run('UPDATE users SET active=?, token_version=token_version+1 WHERE id=?', body.active ? 1 : 0, u.id);
    }
    if (body.phone !== undefined) {
      const ph = phoneOf(body.phone);
      if (ph !== u.phone) {
        // the main owner's number comes from the server's variables: changed here, a restart would make a new owner on the old number
        if (params.id === MAIN && u.phone === normalizePhone(env.BEATRIS_OWNER_PHONE)) throw bad('شماره مالک اصلی از متغیر سرور BEATRIS_OWNER_PHONE می‌آید؛ همان‌جا عوض کنید.');
        if (db.get('SELECT 1 FROM users WHERE phone=? AND id<>?', ph, u.id)) throw new PlatformError(409, 'این شماره در همین فروشگاه حساب دیگری دارد.');
        // the number is the key to the account: whoever signed in with the old one is signed out
        db.run('UPDATE users SET phone=?, token_version=token_version+1 WHERE id=?', ph, u.id);
      }
    }
    if (body.email !== undefined) {
      const em = optEmail(body.email);
      if (em !== (u.email ?? null)) {
        if (params.id === MAIN && u.phone === normalizePhone(env.BEATRIS_OWNER_PHONE) && validEmail(normalizeEmail(env.BEATRIS_OWNER_EMAIL))) throw bad('ایمیل مالک اصلی از متغیر سرور BEATRIS_OWNER_EMAIL می‌آید؛ همان‌جا عوض کنید.');
        if (em && db.get('SELECT 1 FROM users WHERE email=? AND id<>?', em, u.id)) throw new PlatformError(409, 'این ایمیل در همین فروشگاه حساب دیگری دارد.');
        // like the number, the email opens the account: a change signs out whoever came in with the old one
        db.run('UPDATE users SET email=?, token_version=token_version+1 WHERE id=?', em, u.id);
      }
    }
    if (body.logoutAll) db.run('UPDATE users SET token_version=token_version+1 WHERE id=?', u.id);
    audit(user.id, 'vendor.user.update', { tenant: params.id, id: u.id, fields: Object.keys(body) });
    const fresh = db.get('SELECT * FROM users WHERE id=?', u.id);
    // the vendor who corrects their own number stays signed in on this device
    const token = self && fresh.token_version !== u.token_version ? signer.sign({ t: 'session', uid: fresh.id, tv: fresh.token_version, tn: MAIN }, 30 * 86400) : undefined;
    return { user: userOut(fresh, params.id), ...(token ? { token } : {}) };
  });
  // پیامک ورود: the panel, its test, and open sign-up
  vr('GET', '/api/vendor/sms', () => ({ ...otp.view(), email: otp.emailView(), providers: SMS_PROVIDERS.map(({ id, label, need, fields, hint, param }) => ({ id, label, need, fields, hint, param: param ?? '' })), signup: signupConf() }));
  vr('PUT', '/api/vendor/sms', ({ body, user }) => {
    const v = otp.saveConfig(body, user.id);
    audit(user.id, 'vendor.sms', { provider: body.provider || 'none' });
    return { ...v, signup: signupConf() };
  });
  vr('POST', '/api/vendor/sms/test', async ({ body, user, ip }) => {
    audit(user.id, 'vendor.sms.test', { to: masked(String(normalizePhone(body.phone))) });
    return otp.test(body.phone, ip);
  });
  vr('PUT', '/api/vendor/signup', ({ body, user }) => {
    const cur = signupConf();
    const next = { open: body.open === undefined ? cur.open : !!body.open, plan: PLANS.includes(body.plan) ? body.plan : cur.plan, trialDays: body.trialDays === undefined ? cur.trialDays : Math.max(0, Math.min(365, Math.round(Number(body.trialDays) || 0))) };
    mainDb.run('INSERT INTO settings(key,value_json,updated_at,updated_by) VALUES (?,?,?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at, updated_by=excluded.updated_by', 'signup', JSON.stringify(next), now(), user.id);
    audit(user.id, 'vendor.signup', next);
    return { signup: next };
  });

  /** Account requests with a shop code (spec 0011) are retired: every old link gets one plain answer. */
  function access() {
    throw new PlatformError(410, 'درخواست حساب با کد فروشگاه برداشته شد. مدیر فروشگاه ایمیل شما را در «تیم» ثبت می‌کند و شما با همان ایمیل و کدی که به آن فرستاده می‌شود وارد می‌شوید.');
  }

  function vendor(method, pathname, body, user, ip = '') {
    if (!isVendor(user)) throw new PlatformError(403, 'این بخش مخصوص ارائه‌دهنده (مالک فروشگاه اصلی) است.');
    for (const r of vendorRoutes) {
      if (r.method !== method) continue;
      const m = r.re.exec(pathname);
      if (m) return r.fn({ params: Object.fromEntries(Object.entries(m.groups ?? {}).map(([k, v]) => [k, decodeURIComponent(v)])), body: body ?? {}, user, ip });
    }
    throw new PlatformError(404, 'مسیر API وجود ندارد.');
  }

  /** Every shop's database whatever its state: [[id, db]] (backups, the owner's dashboard). */
  const allShops = () => [[MAIN, mainDb], ...mainDb.all('SELECT id FROM tenants ORDER BY created_at').map((t) => [t.id, dbOf(t.id)])];
  return { sendLoginCode, verifyLogin, finishLogin, accountsOf, handleFor, tenantOfToken, all, allShops, dbOf, vendor, isVendor, tenantRow, access, signupConf };
}

/** «Chrome on Android» style label for the last device an account signed in from. */
export function deviceName(ua = '') {
  if (!ua) return '';
  const os = /Android/i.test(ua) ? 'اندروید' : /iPhone|iPad|iOS/i.test(ua) ? 'آیفون/آیپد' : /Windows/i.test(ua) ? 'ویندوز' : /Mac OS/i.test(ua) ? 'مک' : /Linux/i.test(ua) ? 'لینوکس' : 'دستگاه';
  const br = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
  return br ? `${br} روی ${os}` : os;
}
