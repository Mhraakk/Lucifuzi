// ورود با ایمیل (spec 0034): Supabase Auth sends the six-digit code and checks it. Two REST calls with the project's
// publishable key — no SDK — made by this server only, so the shop's devices never need to reach Supabase.
//   BEATRIS_SUPABASE_URL  https://<ref>.supabase.co
//   BEATRIS_SUPABASE_KEY  the publishable key (sb_publishable_…, or the legacy anon key)
// For a code rather than a link, the project's «Magic Link» email template must contain {{ .Token }}.

export class SupaError extends Error {
  constructor(status, message, { reach = true } = {}) {
    super(message);
    this.status = status;
    this.reach = reach;
  }
}

const URL_RE = /^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?$/i;
/** The configuration from the environment, { error } when it is half set or malformed, or null when absent. */
export function supabaseFromEnv(env = process.env) {
  const url = String(env.BEATRIS_SUPABASE_URL ?? '').trim().replace(/\/+$/, '');
  const key = String(env.BEATRIS_SUPABASE_KEY ?? '').trim();
  if (!url && !key) return null;
  if (!URL_RE.test(url) && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) return { error: 'BEATRIS_SUPABASE_URL باید نشانی https پروژه Supabase باشد.' };
  if (key.length < 20) return { error: 'BEATRIS_SUPABASE_KEY (کلید publishable پروژه) خالی یا ناقص است.' };
  return { url, key };
}

async function call(cfg, path, body, { fetchImpl = fetch, timeout = 12000 } = {}, { method = 'POST', bearer = '' } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  let r;
  try {
    const headers = { apikey: cfg.key, accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}), ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) };
    r = await fetchImpl(`${cfg.url}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: ctl.signal });
  } catch {
    throw new SupaError(502, 'سرور ایمیل (Supabase) در دسترس نیست؛ چند دقیقه دیگر دوباره امتحان کنید.', { reach: false });
  } finally {
    clearTimeout(t);
  }
  const j = await r.json().catch(() => ({}));
  return { status: r.status, ok: r.ok, body: j, message: String(j.msg ?? j.message ?? j.error_description ?? j.error ?? '').slice(0, 300), code: String(j.error_code ?? j.code ?? '') };
}

/**
 * Ask Supabase to email a sign-in code (and, in the same email, a link). opts.redirectTo: where the link lands — Supabase
 * keeps it only when it is the project's Site URL or on its list of redirect URLs. Throws SupaError with a sentence.
 */
export async function sendEmailCode(cfg, email, opts = {}) {
  const q = opts.redirectTo ? `?redirect_to=${encodeURIComponent(opts.redirectTo)}` : '';
  const r = await call(cfg, `/auth/v1/otp${q}`, { email, create_user: true }, opts);
  if (r.ok) return { ok: true };
  if (r.status === 429 || r.code === 'over_email_send_rate_limit' || r.code === 'over_request_rate_limit') throw new SupaError(429, 'کد ایمیل همین حالا فرستاده شد؛ کمی بعد دوباره امتحان کنید.');
  if (/not authorized|email_address_not_authorized/i.test(`${r.message} ${r.code}`)) throw new SupaError(502, 'سرویس ایمیل این پروژه هنوز فقط به اعضای تیم Supabase نامه می‌فرستد؛ ارائه‌دهنده باید SMTP اختصاصی را در Supabase تنظیم کند.');
  if (r.status === 401 || r.status === 403) throw new SupaError(502, 'کلید Supabase پذیرفته نشد؛ BEATRIS_SUPABASE_KEY را بررسی کنید.');
  if (r.status === 400 || r.status === 422) throw new SupaError(400, 'این نشانی ایمیل پذیرفته نشد؛ درست بودنش را بررسی کنید.');
  throw new SupaError(502, `ارسال ایمیل انجام نشد (${r.status}).`);
}

/** Ask Supabase whether `code` is the live code of `email`: true, false, or SupaError when it cannot be asked. */
export async function checkEmailCode(cfg, email, code, opts) {
  const r = await call(cfg, '/auth/v1/verify', { type: 'email', email, token: code }, opts);
  if (r.ok) return String(r.body?.user?.email ?? '').toLowerCase() === email;
  if (r.status === 429) throw new SupaError(429, 'تلاش‌های زیادی شد؛ کمی بعد دوباره امتحان کنید.');
  if (r.status >= 500) throw new SupaError(502, 'سرور ایمیل (Supabase) پاسخ نداد؛ چند دقیقه دیگر دوباره امتحان کنید.');
  return false; // 400/401/403: «Token has expired or is invalid»
}

// the ways a Supabase session can prove the email: its code or link (sign-in, first sign-up, invitation) — never a password
const LINK_METHODS = new Set(['otp', 'magiclink', 'email/signup', 'invite']);
const claims = (jwt) => {
  try {
    return JSON.parse(Buffer.from(String(jwt).split('.')[1] ?? '', 'base64url').toString('utf8'));
  } catch {
    return null;
  }
};
/**
 * The person behind a session Supabase issued when the link in the email was opened: { email, at } — `at` (ms) is when
 * the email was proven — or null when Supabase does not accept the session or it was not made by an email code or link.
 */
export async function emailFromLink(cfg, accessToken, opts) {
  const token = String(accessToken ?? '').trim();
  if (!/^[\w-]+\.[\w-]+\.[\w-]+$/.test(token) || token.length > 4096) return null;
  const r = await call(cfg, '/auth/v1/user', null, opts, { method: 'GET', bearer: token });
  if (r.status === 429) throw new SupaError(429, 'تلاش‌های زیادی شد؛ کمی بعد دوباره امتحان کنید.');
  if (r.status >= 500) throw new SupaError(502, 'سرور ایمیل (Supabase) پاسخ نداد؛ چند دقیقه دیگر دوباره امتحان کنید.');
  if (!r.ok) return null;
  // Supabase has just checked the signature, so the claims of this very token can be read as they are
  const c = claims(token);
  const email = String(r.body?.email ?? '').toLowerCase();
  if (!c || c.aud !== 'authenticated' || !email || String(c.email ?? '').toLowerCase() !== email || !r.body?.email_confirmed_at) return null;
  const by = (Array.isArray(c.amr) ? c.amr : []).filter((m) => LINK_METHODS.has(m?.method)).map((m) => Number(m.timestamp) * 1000);
  return by.length ? { email, at: Math.max(...by) } : null;
}
