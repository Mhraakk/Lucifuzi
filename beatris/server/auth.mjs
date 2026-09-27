import { scryptSync, randomBytes, timingSafeEqual, createHmac, randomUUID } from 'node:crypto';

export const ROLES = ['employee', 'trainer', 'manager', 'owner'];
export const STAFF_ROLES = new Set(['trainer', 'manager', 'owner']);
export const ADMIN_ROLES = new Set(['manager', 'owner']);

export const digits = (v) =>
  String(v ?? '')
    .replace(/[۰-۹]/g, (c) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c)))
    .replace(/[٠-٩]/g, (c) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(c)))
    .trim();

export function hashPin(pin) {
  const salt = randomBytes(16);
  const h = scryptSync(digits(pin), salt, 32, { N: 16384, r: 8, p: 1 });
  return `s1$${salt.toString('base64url')}$${h.toString('base64url')}`;
}
export function verifyPin(pin, stored) {
  const [v, s, h] = String(stored).split('$');
  if (v !== 's1' || !s || !h) return false;
  const expect = Buffer.from(h, 'base64url');
  const got = scryptSync(digits(pin), Buffer.from(s, 'base64url'), expect.length, { N: 16384, r: 8, p: 1 });
  return got.length === expect.length && timingSafeEqual(got, expect);
}
export const validPin = (pin) => /^[0-9]{4,8}$/.test(digits(pin));
export function normalizePhone(p) {
  const d = String(p ?? '')
    .replace(/[۰-۹]/g, (c) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c)))
    .replace(/[٠-٩]/g, (c) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(c)))
    .replace(/\D/g, '');
  if (/^989\d{9}$/.test(d)) return `0${d.slice(2)}`;
  if (/^9\d{9}$/.test(d)) return `0${d}`;
  return d;
}
export const validPhone = (p) => /^09\d{9}$/.test(p);

export function makeSigner(secret) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const mac = (s) => createHmac('sha256', secret).update(s).digest('base64url');
  return {
    sign(payload, ttlSec) {
      const body = b64({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSec });
      return `${body}.${mac(body)}`;
    },
    verify(token) {
      const [body, sig] = String(token ?? '').split('.');
      if (!body || !sig) return null;
      const good = Buffer.from(mac(body));
      const given = Buffer.from(sig);
      if (good.length !== given.length || !timingSafeEqual(good, given)) return null;
      try {
        const p = JSON.parse(Buffer.from(body, 'base64url').toString());
        return p.exp > Date.now() / 1000 ? p : null;
      } catch {
        return null;
      }
    },
  };
}

export function resolveSecret(env = process.env) {
  const s = env.BEATRIS_TOKEN_SECRET;
  const prod = env.NODE_ENV === 'production' || !!env.VERCEL;
  if (s && s.length >= 16) return s;
  if (prod) throw new Error('BEATRIS_TOKEN_SECRET (≥16 chars) is required in production.');
  console.warn('[beatris] BEATRIS_TOKEN_SECRET not set — using an ephemeral dev secret.');
  return randomUUID() + randomUUID();
}

/** Fixed-window limiter persisted in the database, so it holds across serverless instances. */
export function makeLimiter(db, scope, max, windowMs) {
  const k = (key) => `${scope}:${key}`;
  return {
    async blocked(key) {
      const h = await db.get('SELECT n, until_ms FROM login_limits WHERE key=?', k(key));
      return !!h && h.until_ms > Date.now() && h.n >= max;
    },
    async fail(key) {
      const now = Date.now();
      await db.run(
        'INSERT INTO login_limits(key,n,until_ms) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET n = CASE WHEN login_limits.until_ms < ? THEN 1 ELSE login_limits.n + 1 END, until_ms = CASE WHEN login_limits.until_ms < ? THEN excluded.until_ms ELSE login_limits.until_ms END',
        k(key), now + windowMs, now, now,
      );
    },
    reset: (key) => db.run('DELETE FROM login_limits WHERE key=?', k(key)),
  };
}
