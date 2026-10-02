// کارتخوان این رایانه (spec 0005): the desk sends the amount to the local bridge (desktop/windows/pos-bridge.ps1),
// which talks to the card reader on the shop's LAN, and books the document only after the bank approves.
// Settings are per device (each counter has its own terminal), kept in this browser.
import { html, fa, api } from './core.mjs';

const KEY = 'beatris.pos';
export const DRIVERS = [
  ['sep', 'سامان (SEP) — PC-POS روی شبکه'],
  ['command', 'سداد یا PSP دیگر — برنامه رابط رسمی'],
  ['sim', 'شبیه‌ساز (آموزش؛ پولی جابه‌جا نمی‌شود)'],
];
const DEFAULTS = { on: false, driver: 'sep', host: '', port: 1197, bridge: 8765 };
const FINAL = new Set(['approved', 'declined', 'cancelled', 'unknown', 'error']);

export function posConfig() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}
export function savePosConfig(c) {
  const v = { on: !!c.on, driver: DRIVERS.some(([d]) => d === c.driver) ? c.driver : 'sep', host: String(c.host ?? '').trim(), port: Number(c.port) || 1197, bridge: Number(c.bridge) || 8765 };
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {}
  return v;
}
/** Problems that stop a charge before it starts (shown in settings and on the desk). */
export function posProblem(c = posConfig()) {
  if (c.driver === 'sep' && !/^[A-Za-z0-9.-]{1,253}$/.test(c.host)) return 'نشانی IP کارتخوان را در تنظیمات وارد کنید.';
  if (!(c.port >= 1 && c.port <= 65535) || !(c.bridge >= 1 && c.bridge <= 65535)) return 'پورت نامعتبر است.';
  return '';
}

const NO_BRIDGE = 'پل کارتخوان روی این رایانه در دسترس نیست. بئاتریس ویندوز را نصب کنید (پل همراهش اجرا می‌شود) یا «pos-bridge» را اجرا کنید؛ اگر مرورگر اجازه دسترسی به شبکه محلی خواست، «اجازه» بزنید.';
async function bridge(c, path, { method = 'GET', body, timeout = 8000 } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  let r;
  try {
    r = await fetch(`http://127.0.0.1:${c.bridge}${path}`, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, signal: ctl.signal, cache: 'no-store' });
  } catch {
    throw Object.assign(new Error(NO_BRIDGE), { bridge: false });
  } finally {
    clearTimeout(t);
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok && r.status !== 409) throw new Error(j.error || `پل کارتخوان: خطای ${r.status}`);
  return { status: r.status, ...j };
}
export const bridgeStatus = (c = posConfig()) => bridge(c, '/status', { timeout: 3000 });
export const testTerminal = (c = posConfig()) => bridge(c, '/test', { method: 'POST', body: { driver: c.driver, host: c.host, port: c.port }, timeout: 25000 });

/**
 * Start (or resume — same id never charges twice) a charge and follow it to its end.
 * Returns { done: Promise<job>, cancel() }; onState(job) sees every change.
 */
export function startCharge(c, { id, amount }, onState = () => {}) {
  let cancelled = false;
  const done = (async () => {
    let j = await bridge(c, '/charge', { method: 'POST', body: { id, amount, driver: c.driver, host: c.host, port: c.port } });
    if (j.status === 409) throw new Error('کارتخوان مشغول تراکنش دیگری است؛ چند ثانیه بعد دوباره بزنید.');
    let misses = 0;
    for (;;) {
      onState(j);
      if (FINAL.has(j.state)) return j;
      await new Promise((r) => setTimeout(r, 600));
      if (cancelled) await bridge(c, `/charge/${id}/cancel`, { method: 'POST', body: {} }).catch(() => {});
      try {
        j = await bridge(c, `/charge/${id}`);
        misses = 0;
      } catch (e) {
        // the bridge vanished mid-charge: the terminal may still finish — never call it declined
        if (++misses > 5) return { id, amount, state: 'unknown', message: `${e.message} رسید کارتخوان را ببینید؛ اگر موفق بود شماره پیگیری را دستی وارد کنید.` };
      }
    }
  })();
  return { done, cancel: () => (cancelled = true) };
}
export const newChargeId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`);

/** Keep the shop's reconciliation log in step (best effort; the bridge keeps its own journal too). */
export const logCharge = (j, extra = {}) => api('/api/books/pos', { method: 'POST', body: { id: j.id, state: j.state, amount: j.amount, driver: j.driver, rrn: j.rrn, stan: j.stan, card: j.card, terminal: j.terminal, code: j.code, message: j.message, ...extra } }).catch(() => null);
export const linkCharge = (id, docId) => api('/api/books/pos', { method: 'POST', body: { id, docId } }).catch(() => null);

export const STATE_TEXT = {
  connecting: 'در حال ارسال مبلغ به کارتخوان…',
  waiting: 'کارت را بکشید و رمز را روی کارتخوان بزنید',
  approved: 'پرداخت موفق',
  declined: 'پرداخت انجام نشد',
  cancelled: 'لغو شد',
  unknown: 'نتیجه معلوم نیست',
  error: 'خطا',
};
export const chargeLine = (j) => html`${STATE_TEXT[j.state] ?? j.state}${j.rrn && j.state === 'approved' ? html` · پیگیری <b class="ltr-num">${fa(j.rrn)}</b>` : ''}${j.card ? html` · کارت ****${fa(j.card)}` : ''}`;
