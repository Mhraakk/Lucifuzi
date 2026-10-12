// کارتخوان این رایانه (spec 0005): the desk sends the amount to the local bridge (desktop/windows/pos-bridge.ps1),
// which talks to the card reader on the shop's LAN, and books the document only after the bank approves.
// Settings are per device (each counter has its own terminal), kept in this browser.
import { html, fa, api, toast, $ } from './core.mjs';
import { modal } from './dialog.mjs';
import { R } from './bk.mjs';

const KEY = 'beatris.pos';
export const DRIVERS = [
  ['sep', 'سامان (SEP) — PC-POS روی شبکه'],
  ['command', 'سداد یا PSP دیگر — برنامه رابط رسمی'],
  ['sim', 'شبیه‌ساز (آموزش؛ پولی جابه‌جا نمی‌شود)'],
];
// on: this computer has the card reader (its bridge); station: it also charges for the shop's phones and tablets;
// relay: this device has no card reader and asks the counter (spec 0035)
const DEFAULTS = { on: false, driver: 'sep', host: '', port: 1197, bridge: 8765, station: false, stationName: '', relay: false };
const FINAL = new Set(['approved', 'declined', 'cancelled', 'unknown', 'error']);

export function posConfig() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}
export function savePosConfig(c) {
  const on = !!c.on;
  const v = { on, driver: DRIVERS.some(([d]) => d === c.driver) ? c.driver : 'sep', host: String(c.host ?? '').trim(), port: Number(c.port) || 1197, bridge: Number(c.bridge) || 8765, station: on && !!c.station, stationName: String(c.stationName ?? '').trim().slice(0, 40), relay: !on && !!c.relay };
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
/** How this device charges a card: its own bridge, the counter through the server, or not at all. */
export const posMode = (c = posConfig()) => (c.on ? 'local' : c.relay ? 'relay' : null);

/**
 * پرداخت از گوشی و تبلت (spec 0035): the same shape as startCharge, but the counter computer does the charging; this
 * device follows the request on the server. A lost connection never becomes «declined»: after a while it is unknown.
 */
export function startRelay({ id, amount }, onState = () => {}) {
  let cancelled = false, asked = false;
  const done = (async () => {
    let j = await api('/api/books/pos/requests', { method: 'POST', body: { id, amount } });
    let misses = 0;
    for (;;) {
      const view = { ...j, state: j.state === 'pending' ? 'connecting' : j.state === 'expired' ? 'error' : j.state, relay: true };
      onState(view);
      if (FINAL.has(view.state)) return view;
      await new Promise((r) => setTimeout(r, 700));
      if (cancelled && !asked) {
        asked = true;
        await api(`/api/books/pos/requests/${id}/cancel`, { method: 'POST', body: {} }).catch(() => {});
      }
      try {
        j = await api(`/api/books/pos/requests/${id}`);
        misses = 0;
      } catch (e) {
        if (++misses > 8) return { id, amount, state: 'unknown', relay: true, message: `${e.message} رسید کارتخوان پیشخوان را ببینید؛ اگر موفق بود شماره پیگیری را دستی وارد کنید.` };
      }
    }
  })();
  return { done, cancel: () => (cancelled = true) };
}
/** Charge with whatever this device has. */
export const chargeVia = (c, job, onState) => (posMode(c) === 'relay' ? startRelay(job, onState) : startCharge(c, job, onState));

/* ---------------- the counter computer (spec 0035): charges for the shop's other devices ---------------- */
const STATION_KEY = 'beatris.posStation';
function stationId() {
  try {
    let id = localStorage.getItem(STATION_KEY);
    if (!id) localStorage.setItem(STATION_KEY, (id = `station-${newChargeId()}`));
    return id;
  } catch {
    return 'station-this-device';
  }
}
let station = null;
/** Starts or stops the counter loop to match this device's settings (called at start and after saving them). */
export function initPosStation() {
  const c = posConfig();
  const want = c.on && c.station && !!localStorage.getItem('beatris.token');
  if (!want) return station?.stop();
  if (station) return station.update(c);
  station = runStation(c);
}
function runStation(cfg) {
  let c = cfg, stopped = false, job = null, timer = 0, lastSent = '';
  const id = stationId();
  const badge = document.createElement('div');
  badge.className = 'pos-station';
  badge.setAttribute('role', 'status');
  badge.setAttribute('aria-live', 'polite');
  document.body.append(badge);
  const show = (text, cls = '') => {
    badge.className = `pos-station ${cls}`;
    badge.innerHTML = `<i aria-hidden="true"></i><span>${text}</span>`;
  };
  show('کارتخوان پیشخوان: آماده', 'ok');
  const report = (j) => {
    const key = `${j.state}|${j.rrn ?? ''}`;
    if (key === lastSent) return;
    lastSent = key;
    return api(`/api/books/pos/requests/${j.id}/result`, { method: 'POST', body: { station: id, state: j.state, rrn: j.rrn, stan: j.stan, card: j.card, terminal: j.terminal, code: j.code, message: j.message, driver: j.driver } })
      .then((r) => r.cancel && job?.run.cancel())
      .catch(() => {});
  };
  const tick = async () => {
    if (stopped) return;
    try {
      const r = await api('/api/books/pos/station', { method: 'POST', body: { id, name: c.stationName || 'پیشخوان', driver: c.driver, take: !job } });
      if (r.active?.cancel && job) job.run.cancel();
      if (r.request && !job) {
        const req = r.request;
        lastSent = '';
        show(`${fa(req.amount.toLocaleString('en-US')).replace(/,/g, '٬')} ریال${req.from ? ` برای ${req.from}` : ''} — کارت را بکشید و رمز بزنید`, 'busy');
        const run = startCharge(c, { id: req.id, amount: req.amount }, (j) => report(j));
        job = { req, run };
        run.done
          .then((j) => report(j))
          .catch((e) => report({ id: req.id, amount: req.amount, state: 'error', message: e.message }))
          .finally(() => {
            job = null;
            show('کارتخوان پیشخوان: آماده', 'ok');
          });
      }
    } catch (e) {
      if (e.status === 401) return stop();
      if (!job) show('کارتخوان پیشخوان: اتصال به سرور قطع است', 'warn');
    }
    if (!stopped) timer = setTimeout(tick, job ? 900 : 1200);
  };
  function stop() {
    stopped = true;
    clearTimeout(timer);
    badge.remove();
    station = null;
  }
  tick();
  return { stop, update: (n) => (c = n) };
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

/**
 * The card-reader window, the same on the desk and in the invoice editor: follows one charge — on this computer's bridge
 * or through the counter (spec 0035) — and resolves the approved charge, or null (declined, cancelled, closed).
 */
export function cardWindow(pc, amount) {
  return new Promise((resolve) => {
    const id = newChargeId();
    let run = null, result = null, retrying = false, last = { id, amount, driver: pc.driver, state: 'connecting' };
    const close = modal(
      String(html`<div class="pos-box" role="status"><h3 class="bk-h">کارتخوان</h3><div class="pos-amt">${R(amount)}</div>
        <div class="pos-st connecting" id="posSt" aria-live="assertive"><i class="pos-dot"></i><span>${STATE_TEXT.connecting}</span></div>
        <p class="small pos-msg" id="posMsg">${posMode(pc) === 'relay' ? 'به کارتخوان پیشخوان فرستاده می‌شود؛ مشتری کارت را آن‌جا بکشد و رمز بزند.' : pc.driver === 'sim' ? 'شبیه‌ساز: پولی جابه‌جا نمی‌شود.' : ''}</p>
        <div class="pos-manual" id="posManual" hidden><label class="field">شماره پیگیری روی رسید کارتخوان<input class="input ltr" id="posRrn" inputmode="numeric" maxlength="20"></label></div>
        <div class="actions" id="posAct"><button class="btn ghost" data-pos="cancel">انصراف</button></div></div>`),
      (m) =>
        m.addEventListener('click', (e) => {
          const b = e.target.closest('[data-pos]');
          if (!b) return;
          const a = b.dataset.pos;
          if (a === 'cancel') {
            if (run && !result) {
              run.cancel();
              show({ ...last, state: last.state }, 'در حال لغو… اگر کارت کشیده شده، صبر کنید.');
            } else close();
          } else if (a === 'retry') {
            retrying = true;
            close();
            chargeModal(pc, amount).then(resolve);
          } else if (a === 'manual') {
            const rrn = $('#posRrn', m).value.replace(/[^\d۰-۹]/g, '').replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
            if (rrn.length < 6) return toast('شماره پیگیری رسید کارتخوان را کامل وارد کنید.', 'error');
            result = { ...last, state: 'approved', rrn, message: 'ثبت دستی از روی رسید کارتخوان' };
            logCharge(result);
            close();
          }
        }),
      () => {
        if (run && !result && !['declined', 'cancelled', 'error', 'unknown'].includes(last.state)) run.cancel();
        if (!retrying) resolve(result?.state === 'approved' ? result : null);
      },
    );
    const show = (j, extra) => {
      const st = document.getElementById('posSt');
      if (!st) return;
      st.className = `pos-st ${j.state}`;
      st.innerHTML = `<i class="pos-dot"></i><span>${String(chargeLine(j))}</span>`;
      document.getElementById('posMsg').textContent = extra ?? (j.state === 'approved' ? '' : j.message || (j.relay && ['connecting', 'waiting'].includes(j.state) ? `کارتخوان پیشخوان${j.station ? ` (${j.station})` : ''}: ${j.state === 'waiting' ? 'کارت را بکشید و رمز بزنید.' : 'در حال رساندن مبلغ…'}` : ''));
      const act = document.getElementById('posAct');
      if (['declined', 'cancelled', 'error'].includes(j.state)) act.innerHTML = String(html`<button class="btn" data-pos="retry">دوباره بفرست</button><button class="btn ghost" data-close>بستن</button>`);
      if (j.state === 'unknown') {
        document.getElementById('posManual').hidden = false;
        act.innerHTML = String(html`<button class="btn" data-pos="manual">پرداخت شده؛ ثبت با این شماره</button><button class="btn ghost" data-pos="retry">دوباره بفرست</button><button class="btn ghost" data-close>بستن</button>`);
      }
    };
    run = chargeVia(pc, { id, amount }, (j) => {
      last = j;
      show(j);
    });
    run.done
      .then((j) => {
        last = j;
        show(j);
        logCharge(j);
        if (j.state === 'approved') {
          result = j;
          setTimeout(close, 900);
        }
      })
      .catch((e) => {
        last = { ...last, state: 'error', message: e.message };
        show(last);
      });
  });
}
