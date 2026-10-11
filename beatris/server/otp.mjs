// کد یک‌بارمصرف (spec 0022): six digits by SMS sign a person in («login») or sign a closed day («sign»). The code is
// kept only as an HMAC with the server secret, lives 3 minutes, dies after 5 wrong tries, and one number can ask again
// after 60 seconds. Every real send is written to the main database, so the limits per number, per address and for the
// whole server survive a restart. Demo accounts see their code on the screen; development prints it; in production, until
// an SMS service is set, only the vendor's own phone gets in, with BEATRIS_OWNER_PIN in place of the code.
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { sendCode, checkSmsConfig, smsConfigFromEnv, publicSmsView, providerLabel, SmsError } from './sms.mjs';
import { normalizePhone, validPhone, validPin, digits, makeLimiter } from './auth.mjs';

export const OTP_SCHEMA = `
CREATE TABLE IF NOT EXISTS otp_codes (
  phone TEXT NOT NULL,
  purpose TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  via TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  sent_at INTEGER NOT NULL,
  PRIMARY KEY (phone, purpose)
);
CREATE TABLE IF NOT EXISTS otp_sends (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT NOT NULL,
  ip TEXT NOT NULL DEFAULT '',
  purpose TEXT NOT NULL,
  via TEXT NOT NULL,
  ok INTEGER NOT NULL,
  error TEXT NOT NULL DEFAULT '',
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_otp_sends_phone ON otp_sends(phone, at);
CREATE INDEX IF NOT EXISTS idx_otp_sends_ip ON otp_sends(ip, at);
CREATE INDEX IF NOT EXISTS idx_otp_sends_at ON otp_sends(at);
`;
export const CODE_TTL = 180; // seconds
export const RESEND_AFTER = 60;
export const MAX_TRIES = 5;
const MIN = 60000, HOUR = 3600000, DAY = 86400000;
const PURPOSES = new Set(['login', 'sign']);
const faNum = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);

export class OtpError extends Error {
  constructor(status, message, extra = null) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

/**
 * db: the main database. sealer seals the panel key at rest. env decides production, the owner's way in, the SMS
 * variables and the caps. smsOpts reach sendCode (tests point it at a local server).
 */
export function createOtp({ db, secret, sealer, env = process.env, quiet = false, smsOpts = {}, now = () => Date.now(), silentDelay = () => 400 + randomInt(0, 800) }) {
  db.raw.exec(OTP_SCHEMA);
  const prod = env.NODE_ENV === 'production' || !!env.RAILWAY_ENVIRONMENT;
  const hourlyCap = Math.max(1, Number(env.BEATRIS_SMS_HOURLY_CAP) || 300);
  const clean = (c) => digits(c).replace(/\D/g, '');
  const mac = (phone, purpose, code) => createHmac('sha256', secret).update(`otp|${phone}|${purpose}|${clean(code)}`).digest();
  const verifyByIp = makeLimiter(30, 10 * MIN);
  const freeByIp = makeLimiter(300, 10 * MIN); // demo and development codes cost nothing, but are still not endless

  /* ---------------- the panel's settings: Railway variables win, else the vendor console ---------------- */
  function stored() {
    const r = db.get("SELECT value_json FROM settings WHERE key='sms'");
    return r ? JSON.parse(r.value_json) : null;
  }
  /** The live configuration with its key, or null; { provider: 'off' | 'invalid' | 'console' } are not senders. */
  function config() {
    const fromEnv = smsConfigFromEnv(env);
    if (fromEnv) return fromEnv;
    const s = stored();
    if (!s?.provider) return null;
    const key = s.secret ? sealer.open(s.secret, 'sms') : '';
    return { ...s, key: key ?? '', secret: undefined, fromEnv: false };
  }
  const canSend = (c) => !!c && !['off', 'invalid', 'console'].includes(c.provider) && !!c.key;
  function saveConfig(raw, by) {
    if (smsConfigFromEnv(env)) throw new OtpError(409, 'پیامک با متغیرهای Railway تنظیم شده است؛ برای تغییر، همان‌جا عوض کنید.');
    const put = (v) => db.run('INSERT INTO settings(key,value_json,updated_at,updated_by) VALUES (?,?,?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at, updated_by=excluded.updated_by', 'sms', JSON.stringify(v), new Date(now()).toISOString(), by ?? null);
    if (!raw?.provider) {
      put({});
      return view();
    }
    const prev = stored();
    // an empty key field keeps the key already sealed for the same service
    const key = String(raw.key ?? '').trim() || (prev?.provider === raw.provider && prev.secret ? sealer.open(prev.secret, 'sms') ?? '' : '');
    const r = checkSmsConfig({ ...raw, key });
    if (r.error) throw new OtpError(400, r.error);
    const { key: k, ...rest } = r.cfg;
    put({ ...rest, secret: sealer.seal(k, 'sms') });
    return view();
  }
  function stats() {
    const t = now();
    const row = db.get('SELECT SUM(CASE WHEN ok=1 THEN 1 ELSE 0 END) AS sent, SUM(CASE WHEN ok=0 THEN 1 ELSE 0 END) AS failed FROM otp_sends WHERE at>? AND via=?', t - DAY, 'sms');
    const lastErr = db.get("SELECT error, at FROM otp_sends WHERE ok=0 AND via='sms' ORDER BY at DESC LIMIT 1");
    const lastOk = db.get("SELECT at FROM otp_sends WHERE ok=1 AND via='sms' ORDER BY at DESC LIMIT 1");
    return { sent24h: row?.sent ?? 0, failed24h: row?.failed ?? 0, lastError: lastErr && (!lastOk || lastErr.at > lastOk.at) ? { at: new Date(lastErr.at).toISOString(), error: lastErr.error } : null };
  }
  /** What the vendor console shows: the service, never its key. */
  function view() {
    const c = config();
    return { config: publicSmsView(c), envError: c?.provider === 'invalid' ? c.error : null, ready: canSend(c), ownerPin: ownerPinOpen(), prod, stats: stats() };
  }

  /* ---------------- the vendor's way in before SMS works ---------------- */
  const ownerPhone = () => normalizePhone(env.BEATRIS_OWNER_PHONE);
  function ownerPinOpen() {
    return prod && !canSend(config()) && validPhone(ownerPhone()) && validPin(env.BEATRIS_OWNER_PIN);
  }

  /* ---------------- limits (database: they survive a restart) ---------------- */
  function limit(phone, ip) {
    const t = now();
    const n = (sql, ...a) => db.get(sql, ...a).n;
    const lastSent = db.get("SELECT MAX(at) AS at FROM otp_sends WHERE phone=? AND ok IN (1,2) AND via IN ('sms','silent','owner-pin')", phone).at;
    if (lastSent && t - lastSent < RESEND_AFTER * 1000) {
      const wait = Math.ceil((RESEND_AFTER * 1000 - (t - lastSent)) / 1000);
      throw new OtpError(429, `کد همین حالا فرستاده شد؛ ${faNum(wait)} ثانیه دیگر می‌توانید دوباره بگیرید.`, { retryAfter: wait });
    }
    const real = "via IN ('sms','silent','owner-pin')";
    if (n(`SELECT COUNT(*) AS n FROM otp_sends WHERE phone=? AND at>? AND ${real}`, phone, t - HOUR) >= 5) throw new OtpError(429, 'برای این شماره در یک ساعت گذشته کد زیادی فرستاده شد؛ یک ساعت دیگر دوباره امتحان کنید.');
    if (n(`SELECT COUNT(*) AS n FROM otp_sends WHERE phone=? AND at>? AND ${real}`, phone, t - DAY) >= 10) throw new OtpError(429, 'سقف کد این شماره برای امروز پر شد؛ فردا دوباره امتحان کنید.');
    if (ip && n(`SELECT COUNT(*) AS n FROM otp_sends WHERE ip=? AND at>? AND ${real}`, ip, t - HOUR) >= 20) throw new OtpError(429, 'از این شبکه در یک ساعت گذشته کد زیادی درخواست شد؛ کمی بعد دوباره امتحان کنید.');
    if (ip && n(`SELECT COUNT(*) AS n FROM otp_sends WHERE ip=? AND at>? AND ${real}`, ip, t - DAY) >= 60) throw new OtpError(429, 'سقف درخواست کد از این شبکه برای امروز پر شد.');
    if (n("SELECT COUNT(*) AS n FROM otp_sends WHERE at>? AND via='sms'", t - HOUR) >= hourlyCap) throw new OtpError(503, 'ارسال پیامک این ساعت به سقف رسید؛ چند دقیقه دیگر دوباره امتحان کنید.');
  }
  const record = (phone, ip, purpose, via, ok, error = '') => Number(db.run('INSERT INTO otp_sends(phone,ip,purpose,via,ok,error,at) VALUES (?,?,?,?,?,?,?)', phone, String(ip ?? '').slice(0, 60), purpose, via, ok, error.slice(0, 300), now()).lastInsertRowid);
  const keep = (phone, purpose, code, via) => db.run('INSERT INTO otp_codes(phone,purpose,code_hash,via,expires_at,attempts,sent_at) VALUES (?,?,?,?,?,0,?) ON CONFLICT(phone,purpose) DO UPDATE SET code_hash=excluded.code_hash, via=excluded.via, expires_at=excluded.expires_at, attempts=0, sent_at=excluded.sent_at', phone, purpose, code ? mac(phone, purpose, code).toString('base64url') : '', via, now() + CODE_TTL * 1000, now());
  const prune = () => {
    db.run('DELETE FROM otp_sends WHERE at<?', now() - 2 * DAY);
    db.run('DELETE FROM otp_codes WHERE expires_at<?', now() - HOUR);
  };
  const newCode = () => String(randomInt(0, 1_000_000)).padStart(6, '0');

  /**
   * mode: 'auto' (send by SMS, or the development/owner ways when there is no service), 'demo' (show on screen; demo
   * accounts only), 'silent' (a number nobody may sign in with: answer exactly like a send, send nothing).
   * Resolves { via, ttl, resend, code? } — `code` only for demo and development.
   */
  async function send({ phone: raw, purpose = 'login', ip = '', mode = 'auto' }) {
    const phone = normalizePhone(raw);
    if (!validPhone(phone)) throw new OtpError(400, 'شماره موبایل باید ۱۱ رقم و با ۰۹ باشد.');
    if (!PURPOSES.has(purpose)) throw new OtpError(400, 'نوع کد نامعتبر است.');
    prune();
    const out = (via, code) => ({ via, ttl: CODE_TTL, resend: RESEND_AFTER, ...(code ? { code } : {}) });
    const free = () => {
      if (freeByIp.blocked(ip)) throw new OtpError(429, 'درخواست کد زیاد بود؛ چند دقیقه دیگر دوباره امتحان کنید.');
      freeByIp.fail(ip);
    };
    if (mode === 'demo') {
      free();
      const code = newCode();
      keep(phone, purpose, code, 'demo');
      record(phone, ip, purpose, 'demo', 1);
      return out('demo', code);
    }
    const cfg = config();
    if (mode === 'silent') {
      // a number that may not sign in gets the same answer as one that may, after a send's usual delay
      if (!canSend(cfg) && prod) throw new OtpError(503, 'ارسال پیامک هنوز راه نیفتاده است؛ ارائه‌دهنده باید سرویس پیامک را در کنسول تنظیم کند.');
      limit(phone, ip);
      record(phone, ip, purpose, 'silent', 1);
      const ms = silentDelay();
      if (ms > 0) await new Promise((r) => setTimeout(r, ms));
      return out('sms');
    }
    if (canSend(cfg)) {
      limit(phone, ip);
      const code = newCode();
      const id = record(phone, ip, purpose, 'sms', 2);
      try {
        await sendCode(cfg, phone, code, smsOpts);
      } catch (e) {
        const why = e instanceof SmsError ? e.message : 'خطای ناشناخته در ارسال';
        db.run('UPDATE otp_sends SET ok=0, error=? WHERE id=?', why.slice(0, 300), id);
        if (!quiet) console.error(`[beatris] sms ${cfg.provider} → ${phone.slice(0, 4)}…${phone.slice(-2)}: ${why}`);
        throw new OtpError(502, 'ارسال پیامک انجام نشد؛ چند دقیقه دیگر دوباره امتحان کنید.');
      }
      db.run('UPDATE otp_sends SET ok=1 WHERE id=?', id);
      keep(phone, purpose, code, 'sms');
      return out('sms');
    }
    if (!prod) {
      // development and tests: no service, the code goes to the server log and back to the page
      free();
      const code = newCode();
      keep(phone, purpose, code, 'dev');
      record(phone, ip, purpose, 'dev', 1);
      if (!quiet) console.log(`[beatris] کد ${purpose === 'sign' ? 'امضا' : 'ورود'} ${phone}: ${code} (بدون سرویس پیامک؛ فقط محیط توسعه)`);
      return out('dev', code);
    }
    if (ownerPinOpen() && phone === ownerPhone()) {
      limit(phone, ip);
      keep(phone, purpose, '', 'owner-pin');
      record(phone, ip, purpose, 'owner-pin', 1);
      return out('owner-pin');
    }
    throw new OtpError(503, 'ارسال پیامک هنوز راه نیفتاده است؛ ارائه‌دهنده باید سرویس پیامک را در کنسول تنظیم کند.');
  }

  /** Throws OtpError unless `code` is the live code of phone+purpose; a right code is used up. */
  function check({ phone: raw, purpose = 'login', code, ip = '' }) {
    const phone = normalizePhone(raw);
    if (verifyByIp.blocked(ip)) throw new OtpError(429, 'تلاش‌های نادرست زیاد بود. ده دقیقه دیگر دوباره امتحان کنید.');
    const row = validPhone(phone) ? db.get('SELECT * FROM otp_codes WHERE phone=? AND purpose=?', phone, purpose) : null;
    if (!row) throw new OtpError(401, 'کدی برای این شماره فرستاده نشده یا کد باطل شده است؛ کد تازه بگیرید.');
    if (row.expires_at < now()) {
      db.run('DELETE FROM otp_codes WHERE phone=? AND purpose=?', phone, purpose);
      throw new OtpError(401, 'زمان کد گذشت؛ کد تازه بگیرید.');
    }
    let good;
    if (row.via === 'owner-pin') {
      // the vendor's own way in: the PIN from Railway, compared as HMACs so the length leaks nothing
      good = ownerPinOpen() && phone === ownerPhone() && timingSafeEqual(mac(phone, purpose, String(code ?? '')), mac(phone, purpose, String(env.BEATRIS_OWNER_PIN)));
    } else {
      const want = Buffer.from(row.code_hash, 'base64url');
      const got = mac(phone, purpose, String(code ?? ''));
      good = /^\d{6}$/.test(clean(code)) && want.length === got.length && timingSafeEqual(want, got);
    }
    if (good) {
      db.run('DELETE FROM otp_codes WHERE phone=? AND purpose=?', phone, purpose);
      verifyByIp.reset(ip);
      return true;
    }
    verifyByIp.fail(ip);
    if (row.attempts + 1 >= MAX_TRIES) {
      db.run('DELETE FROM otp_codes WHERE phone=? AND purpose=?', phone, purpose);
      throw new OtpError(401, `${faNum(MAX_TRIES)} بار نادرست وارد شد و کد باطل شد؛ کد تازه بگیرید.`);
    }
    db.run('UPDATE otp_codes SET attempts=attempts+1 WHERE phone=? AND purpose=?', phone, purpose);
    throw new OtpError(401, `کد درست نیست (${faNum(MAX_TRIES - row.attempts - 1)} بار دیگر می‌توانید امتحان کنید).`);
  }

  /** The vendor's «پیامک آزمایشی»: a real send to any number through the configured service, with the service's own answer. */
  async function test(raw, ip = '') {
    const phone = normalizePhone(raw);
    if (!validPhone(phone)) throw new OtpError(400, 'شماره موبایل باید ۱۱ رقم و با ۰۹ باشد.');
    const cfg = config();
    if (!canSend(cfg)) throw new OtpError(409, cfg?.provider === 'invalid' ? cfg.error : 'اول سرویس پیامک و کلید آن را ذخیره کنید.');
    limit(phone, ip);
    const id = record(phone, ip, 'test', 'sms', 2);
    const t0 = now();
    try {
      const r = await sendCode(cfg, phone, newCode(), smsOpts);
      db.run('UPDATE otp_sends SET ok=1 WHERE id=?', id);
      return { ok: true, provider: providerLabel(cfg.provider), id: r.id, ms: now() - t0 };
    } catch (e) {
      const why = e instanceof SmsError ? e.message : 'خطای ناشناخته در ارسال';
      db.run('UPDATE otp_sends SET ok=0, error=? WHERE id=?', why.slice(0, 300), id);
      return { ok: false, provider: providerLabel(cfg.provider), error: why, reach: e?.reach !== false, ms: now() - t0 };
    }
  }

  return { send, check, test, config, saveConfig, view, ownerPinOpen, canSend: () => canSend(config()), prod };
}
