// پیامک (spec 0022): the code that signs people in goes out through the vendor's own Iranian SMS panel. Each request is
// built exactly as that provider's official SDK builds it (Kavenegar kavenegar-node, SMS.ir sms-typescript, IPPanel
// ippanel-node-sdk, Ghasedak ghasedaksms-php, Melipayamak melipayamak-node), success is read the provider's own way, and
// a failure becomes a Persian sentence that never carries the key.

const TIMEOUT_MS = 10000;
const faNum = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);

/** The five services, with the words the vendor console shows for each field. `need` lists the required fields. */
export const SMS_PROVIDERS = [
  {
    id: 'smsir', label: 'SMS.ir', base: 'https://api.sms.ir', need: ['key', 'template'], param: 'Code',
    fields: { key: 'کلید API (X-API-KEY)', template: 'شناسه قالب (templateId، عدد)', param: 'نام پارامتر قالب' },
    hint: 'در پنل SMS.ir یک قالب «ارسال سریع» بسازید، مثلاً «کد ورود بئاتریس: #Code#»؛ شناسه قالب را این‌جا بنویسید.',
  },
  {
    id: 'kavenegar', label: 'کاوه‌نگار', base: 'https://api.kavenegar.com', need: ['key', 'template'],
    fields: { key: 'کلید API', template: 'نام الگوی تأیید (template)' },
    hint: 'در پنل کاوه‌نگار یک الگوی «تأیید» بسازید، مثلاً «کد ورود بئاتریس: %token%»؛ نام الگو را این‌جا بنویسید.',
  },
  {
    id: 'ippanel', label: 'IPPanel / فراز اس‌ام‌اس', base: 'https://edge.ippanel.com', need: ['key', 'template', 'sender'], param: 'code',
    fields: { key: 'کلید دسترسی (API key)', template: 'کد پترن', sender: 'شماره خط فرستنده', param: 'نام متغیر پترن' },
    hint: 'در پنل یک پترن بسازید، مثلاً «کد ورود بئاتریس: %code%»؛ کد پترن و شماره خط را این‌جا بنویسید.',
  },
  {
    id: 'ghasedak', label: 'قاصدک', base: 'https://gateway.ghasedak.me', need: ['key', 'template'], param: 'Code',
    fields: { key: 'کلید API (ApiKey)', template: 'نام قالب (templateName)', param: 'نام پارامتر قالب' },
    hint: 'در پنل قاصدک یک قالب OTP با یک پارامتر بسازید؛ نام قالب و نام پارامتر را این‌جا بنویسید.',
  },
  {
    id: 'melipayamak', label: 'ملی‌پیامک', base: 'https://rest.payamak-panel.com', need: ['username', 'key', 'template'],
    fields: { username: 'نام کاربری پنل', key: 'رمز پنل یا ApiKey', template: 'کد متن (bodyId، عدد)' },
    hint: 'در پنل ملی‌پیامک متن «خط خدماتی اشتراکی» بسازید، مثلاً «کد ورود بئاتریس: {0}»؛ پس از تأیید، کد متن را این‌جا بنویسید.',
  },
];
const BY_ID = new Map(SMS_PROVIDERS.map((p) => [p.id, p]));
const ALIAS = { 'sms.ir': 'smsir', farazsms: 'ippanel', faraz: 'ippanel', kavehnegar: 'kavenegar', 'payamak-panel': 'melipayamak', meli: 'melipayamak' };
export const providerLabel = (id) => BY_ID.get(id)?.label ?? '';

export class SmsError extends Error {
  /** detail: what the vendor sees (provider's own words); reach: false when the server never got an answer. */
  constructor(message, { status = null, reach = true } = {}) {
    super(message);
    this.status = status;
    this.reach = reach;
  }
}

/** IPPanel's sender line in E.164: «3000505», «03000505», «983000505» and «+983000505» all mean +983000505. */
export function e164Line(s) {
  const d = String(s ?? '').replace(/[۰-۹]/g, (c) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(c)).replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('98')) return `+${d}`;
  return `+98${d.replace(/^0+/, '')}`;
}

/** A cleaned configuration, or { error } naming the first field that is missing or malformed. */
export function checkSmsConfig(raw) {
  const id = ALIAS[String(raw?.provider ?? '').trim().toLowerCase()] ?? String(raw?.provider ?? '').trim().toLowerCase();
  const p = BY_ID.get(id);
  if (!p) return { error: 'سرویس پیامک را انتخاب کنید.' };
  const s = (v, max = 200) => String(v ?? '').trim().slice(0, max);
  const cfg = { provider: id, key: s(raw.key, 500), template: s(raw.template, 100), sender: p.need.includes('sender') ? e164Line(raw.sender) : '', param: p.param ? s(raw.param, 40) || p.param : '', username: p.need.includes('username') ? s(raw.username, 100) : '' };
  for (const f of p.need) if (!cfg[f]) return { error: `${p.fields[f]} را بنویسید.` };
  if (/\s/.test(cfg.key)) return { error: `${p.fields.key} نباید فاصله داشته باشد.` };
  if ((id === 'smsir' || id === 'melipayamak') && !/^\d{1,12}$/.test(cfg.template)) return { error: `${p.fields.template} باید عدد باشد.` };
  if (id !== 'smsir' && id !== 'melipayamak' && /\s/.test(cfg.template)) return { error: `${p.fields.template} نباید فاصله داشته باشد.` };
  if (cfg.param && !/^[A-Za-z_][\w-]{0,39}$/.test(cfg.param)) return { error: `${p.fields.param}: فقط حروف لاتین، رقم و _ .` };
  if (id === 'ippanel' && !/^\+98\d{4,13}$/.test(cfg.sender)) return { error: 'شماره خط فرستنده درست نیست.' };
  return { cfg };
}

/** The configuration from the server's variables, or null when BEATRIS_SMS_PROVIDER is not set. */
export function smsConfigFromEnv(env = process.env) {
  const id = String(env.BEATRIS_SMS_PROVIDER ?? '').trim().toLowerCase();
  if (!id) return null;
  if (id === 'off' || id === 'none') return { provider: 'off', fromEnv: true };
  if (id === 'console') return { provider: 'console', fromEnv: true };
  const r = checkSmsConfig({ provider: id, key: env.BEATRIS_SMS_API_KEY ?? env.BEATRIS_SMS_PASSWORD, template: env.BEATRIS_SMS_TEMPLATE, sender: env.BEATRIS_SMS_SENDER, param: env.BEATRIS_SMS_PARAM, username: env.BEATRIS_SMS_USERNAME });
  if (r.error) return { provider: 'invalid', error: `متغیرهای پیامک سرور: ${r.error}`, fromEnv: true };
  return { ...r.cfg, baseUrl: relayUrl(env.BEATRIS_SMS_BASE_URL), fromEnv: true };
}
/** Your own relay (e.g. a server inside Iran forwarding the same paths): https only; plain http only on this machine. */
export function relayUrl(v) {
  const s = String(v ?? '').trim().replace(/\/+$/, '');
  if (!s) return '';
  try {
    const u = new URL(s);
    const local = ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname);
    if (u.username || u.password || !(u.protocol === 'https:' || (u.protocol === 'http:' && local))) return '';
    return s;
  } catch {
    return '';
  }
}

/** What the console may show: never the key. */
export function publicSmsView(cfg) {
  if (!cfg || !BY_ID.has(cfg.provider)) return { provider: cfg?.provider === 'off' ? 'off' : '', label: '', hasKey: false, fromEnv: !!cfg?.fromEnv };
  return { provider: cfg.provider, label: providerLabel(cfg.provider), template: cfg.template, sender: cfg.sender, param: cfg.param, username: cfg.username, hasKey: !!cfg.key, fromEnv: !!cfg.fromEnv, relay: !!cfg.baseUrl };
}

/* ---------------- the five requests ---------------- */
const FORM = 'application/x-www-form-urlencoded; charset=UTF-8';
const BUILD = {
  smsir: (c, phone, code, base) => ({
    url: `${base}/v1/send/verify/`,
    headers: { 'X-API-KEY': c.key, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ mobile: phone, templateId: Number(c.template), parameters: [{ name: c.param, value: code }] }),
  }),
  kavenegar: (c, phone, code, base) => ({
    url: `${base}/v1/${encodeURIComponent(c.key)}/verify/lookup.json`,
    headers: { Accept: 'application/json', 'Content-Type': FORM },
    body: new URLSearchParams({ receptor: phone, token: code, template: c.template }).toString(),
  }),
  ippanel: (c, phone, code, base) => ({
    url: `${base}/v1/api/send`,
    headers: { Authorization: c.key, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ sending_type: 'pattern', from_number: c.sender, code: c.template, recipients: [`+98${phone.slice(1)}`], params: { [c.param]: code } }),
  }),
  ghasedak: (c, phone, code, base, ref) => ({
    url: `${base}/Rest/api/v1/WebService/SendOtpSMS`,
    headers: { ApiKey: c.key, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ sendDate: new Date().toISOString(), receptors: [{ mobile: phone, clientReferenceId: ref }], templateName: c.template, inputs: [{ param: c.param, value: code }], udh: false, isVoice: false }),
  }),
  melipayamak: (c, phone, code, base) => ({
    url: `${base}/api/SendSMS/BaseServiceNumber`,
    headers: { Accept: 'application/json', 'Content-Type': FORM },
    body: new URLSearchParams({ username: c.username, password: c.key, text: code, to: phone, bodyId: c.template }).toString(),
  }),
};
// ملی‌پیامک answers an error as a small number in Value (a sent message gets a long recId)
const MELI = { '-10': 'در متغیرها پیوند هست', '-7': 'خطا در شماره فرستنده', '-6': 'خطای داخلی سامانه', '-5': 'متن با متغیرهای متن پیش‌فرض نمی‌خواند', '-4': 'کد متن (bodyId) نادرست است یا هنوز تأیید نشده', '-3': 'خط فرستنده تعریف نشده است', '-2': 'محدودیت تعداد گیرنده', '-1': 'دسترسی وب‌سرویس غیرفعال است', 0: 'نام کاربری یا رمز نادرست است', 2: 'اعتبار کافی نیست', 6: 'سامانه در حال به‌روزرسانی است', 7: 'متن کلمه فیلترشده دارد', 10: 'کاربر فعال نیست', 11: 'ارسال نشد', 12: 'مدارک کاربر کامل نیست', 16: 'شماره گیرنده پیدا نشد', 17: 'متن خالی است', 35: 'شماره در فهرست سیاه مخابرات است' };
const READ = {
  smsir: (res, b) => ({ ok: res.ok && b?.status === 1, message: b?.message, status: b?.status ?? res.status, id: b?.data?.messageId }),
  kavenegar: (res, b) => {
    const e = Array.isArray(b?.entries) ? b.entries[0] : b?.entries;
    return { ok: b?.return?.status === 200, message: b?.return?.message, status: b?.return?.status ?? res.status, id: e?.messageid };
  },
  ippanel: (res, b) => {
    const errs = b?.meta?.errors ?? b?.errors;
    const first = errs && typeof errs === 'object' ? Object.values(errs).flat()[0] : null;
    return { ok: res.ok && b?.meta?.status === true, message: [b?.meta?.message, first].filter(Boolean).join(' — '), status: b?.meta?.message_code ?? res.status, id: b?.data?.message_outbox_ids?.[0] };
  },
  ghasedak: (res, b) => ({ ok: b?.isSuccess === true && b?.data != null, message: b?.message, status: b?.statusCode ?? res.status, id: b?.data?.items?.[0]?.messageId ?? null }),
  melipayamak: (res, b) => {
    const v = String(b?.Value ?? '');
    const ok = b?.RetStatus === 1 && /^\d{6,}$/.test(v);
    return { ok, message: ok ? '' : MELI[v] ?? b?.StrRetStatus ?? '', status: v || res.status, id: ok ? v : null };
  },
};

/**
 * Sends `code` to `phone` (09xxxxxxxxx) through the configured service. Resolves { id } or throws SmsError.
 * fetchImpl and baseUrl are for tests (a local mock server); a relay set in BEATRIS_SMS_BASE_URL arrives as cfg.baseUrl.
 */
export async function sendCode(cfg, phone, code, { fetchImpl = globalThis.fetch, timeoutMs = TIMEOUT_MS, baseUrl = '', ref = String(Date.now()) } = {}) {
  const p = BY_ID.get(cfg?.provider);
  if (!p) throw new SmsError('سرویس پیامک تنظیم نشده است.', { reach: false });
  const base = (baseUrl || cfg.baseUrl || p.base).replace(/\/+$/, '');
  const req = BUILD[p.id](cfg, phone, code, base, ref);
  const hide = (s) => {
    let t = String(s ?? '').replace(/[\u0000-\u001f]/g, ' ').trim();
    for (const secret of [cfg.key, encodeURIComponent(cfg.key ?? '')]) if (secret && secret.length >= 4) t = t.split(secret).join('***');
    return t.slice(0, 220);
  };
  let res, text;
  try {
    res = await fetchImpl(req.url, { method: 'POST', headers: req.headers, body: req.body, signal: AbortSignal.timeout(timeoutMs), redirect: 'error' });
    text = await res.text();
  } catch (e) {
    const late = e?.name === 'TimeoutError' || e?.name === 'AbortError';
    throw new SmsError(late ? `${p.label} در ${faNum(Math.round(timeoutMs / 1000))} ثانیه پاسخ نداد.` : `سرور به ${p.label} وصل نشد.`, { reach: false });
  }
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    /* not JSON: a proxy page or an HTML error */
  }
  const r = READ[p.id](res, body);
  if (r.ok) return { id: r.id == null ? null : String(r.id) };
  const why = hide(r.message) || (body ? '' : `پاسخ نامعتبر (HTTP ${res.status})`);
  throw new SmsError(`${p.label}: ${why || 'ارسال انجام نشد'}${r.status != null && r.status !== '' ? ` (کد ${hide(r.status)})` : ''}`, { status: r.status });
}
