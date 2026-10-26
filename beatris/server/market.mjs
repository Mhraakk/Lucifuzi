// Market data on the server: daily bars per symbol in SQLite, entered by a manager (a price, a pasted table)
// or pulled by a feed the owner switches on. Until the first real price exists the API serves the labelled
// sample market, so every chart and lesson works from the first minute.
import { SYMBOLS, isSymbol, badBar, roundQuote, sampleMarket, DAY_RE } from '../public/js/market.mjs';
import { isoDay, jalaliOf, JALALI_MONTHS, TROY_OUNCE_G } from '../public/js/ta.mjs';
import { parseNum, MAZANEH_TO_G750 } from '../public/js/calc.mjs';
import { tehranDay, tehranMinutes, tehranClock } from './tz.mjs';

export const FEED_MODES = ['off', 'owner', 'forgod', 'tgju', 'json'];
export const FEED_LABEL = { off: 'ورود دستی مدیر', owner: 'کانال آب‌شده (@abshdh)، چنده و goldprice.org', forgod: 'forgod.qzz.io: ارز، دلار، طلا، سکه و بیت‌کوین', tgju: 'tgju.org (نقطه دسترسی عمومی و غیررسمی)', json: 'فید اختصاصی (JSON)', sample: 'داده نمونه آموزشی' };
export const DEFAULT_FEED = { mode: 'off', url: '', token: '', syncPrice: true, interval: 10 }; // the shop's base price follows the live 18k quote unless the manager turns it off
/** The feed a server starts with when neither the environment nor a manager chose one: forgod once its key is set. */
export const defaultFeedMode = (env = process.env) => (env.NODE_ENV === 'test' ? 'off' : env.BEATRIS_FORGOD_KEY ? 'forgod' : 'owner');
const TGJU_LIVE = 'https://call4.tgju.org/ajax.json';
const TGJU_HISTORY = (key) => `https://api.tgju.org/v1/market/indicator/summary-table-data/${encodeURIComponent(key)}`;
const MAX_JUMP = 0.3; // a live quote more than 30 % away from the last close is treated as a data error
const clean = (v) => Number(String(v ?? '').replace(/<[^>]*>/g, '').replace(/[,\s]/g, ''));

/* ---------------- source formats ---------------- */
/** tgju history rows: [open, low, high, close, change, change %, 'YYYY/MM/DD', jalali], rials (ounce in USD). */
export function parseTgjuHistory(json, sym) {
  const f = sym.feed.rial ? 0.1 : 1;
  const out = new Map();
  for (const row of Array.isArray(json?.data) ? json.data : []) {
    if (!Array.isArray(row) || row.length < 7) continue;
    const d = String(row[6]).replace(/\//g, '-');
    const [o, l, h, c] = row.slice(0, 4).map((v) => roundQuote(sym.id, clean(v) * f));
    const b = { d, o, h: Math.max(o, h, l, c), l: Math.min(o, h, l, c), c };
    if (!badBar(b)) out.set(d, b);
  }
  return [...out.values()].sort((a, b) => (a.d < b.d ? -1 : 1));
}
/** tgju live table: current[key] = { p, h, l, ts: 'YYYY-MM-DD hh:mm:ss' }. */
export function parseTgjuLive(json) {
  const out = {};
  for (const s of SYMBOLS) {
    const q = s.feed.tgju ? json?.current?.[s.feed.tgju] : null;
    if (!q || typeof q !== 'object') continue;
    const f = s.feed.rial ? 0.1 : 1;
    const p = clean(q.p) * f, h = clean(q.h) * f, l = clean(q.l) * f, d = String(q.ts ?? '').slice(0, 10);
    if (!(p > 0 && p < 1e13) || !DAY_RE.test(d)) continue;
    out[s.id] = { d, p: roundQuote(s.id, p), h: h > 0 ? roundQuote(s.id, h) : NaN, l: l > 0 ? roundQuote(s.id, l) : NaN };
  }
  return out;
}
/** Own feed: { day?: 'YYYY-MM-DD', prices: { symbolId: price | { p, h?, l? } } } in toman, the ounce in USD. */
export function parseCustom(json, today) {
  const out = {};
  const d = DAY_RE.test(String(json?.day ?? '')) ? json.day : today;
  const prices = json?.prices && typeof json.prices === 'object' ? json.prices : {};
  for (const id of Object.keys(prices)) {
    if (!isSymbol(id)) continue;
    const v = prices[id], q = v && typeof v === 'object' ? v : { p: v };
    const p = Number(q.p), h = Number(q.h), l = Number(q.l);
    if (!(p > 0 && p < 1e13)) continue;
    out[id] = { d, p: roundQuote(id, p), h: h > 0 ? roundQuote(id, h) : NaN, l: l > 0 ? roundQuote(id, l) : NaN };
  }
  return out;
}
/** Split one pasted line: tabs (Excel) first, then semicolons, then commas; double quotes protect separators. */
function splitRow(line) {
  const sep = line.includes('\t') ? '\t' : line.includes(';') ? ';' : ',';
  const out = [];
  let cur = '', quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch !== '"') cur += ch;
      else if (line[i + 1] === '"') cur += line[++i];
      else quoted = false;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}
/**
 * A pasted table, one day per line: date,close or date,open,high,low,close. Dates may be Jalali (1405/07/05)
 * or Gregorian and digits Persian; a first line without a date is taken as the header. Returns bars and errors.
 */
export function parseTable(text) {
  const bars = new Map(), errors = [];
  let rowNo = 0;
  String(text ?? '')
    .split(/\r?\n/)
    .forEach((line, k) => {
      const cells = splitRow(line);
      if (!cells.length) return;
      const header = rowNo++ === 0;
      const d = isoDay(cells[0]);
      if (!d) {
        if (!header) errors.push(`سطر ${k + 1}: تاریخ نامعتبر`);
        return;
      }
      const v = cells.slice(1).map(parseNum);
      let b;
      if (v.length === 1) b = { d, o: v[0], h: v[0], l: v[0], c: v[0] };
      else if (v.length >= 4) b = { d, o: v[0], h: v[1], l: v[2], c: v[3] };
      else return errors.push(`سطر ${k + 1}: یک قیمت (پایانی) یا چهار قیمت (باز، سقف، کف، پایانی) لازم است`);
      const e = badBar(b);
      if (e) errors.push(`سطر ${k + 1}: ${e}`);
      else bars.set(d, b);
    });
  return { bars: [...bars.values()].sort((a, b) => (a.d < b.d ? -1 : 1)), errors };
}
/* ---------------- the owner's sources ---------------- */
export const ABSHDH_URL = 'https://t.me/s/abshdh';
export const CHANDE_SSE = 'https://chande.net/api/v1/sse/prices';
export const GOLDPRICE_URL = 'https://data-asg.goldprice.org/dbXRates/USD';
const FA_DIGITS = (t) => t.replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
/**
 * Public web view of the @abshdh channel (the source of the owner's goldsuite-price app). Posts look like
 * "🔺#آبشده‌امروزی 104,140,000" · "#ابشـده‌حواله 104,570,000" · "#سکه‌حواله: 241,300,000", in toman.
 * Returns the newest quote of each kind: { mesghal, mesghal_fwd } with their post time.
 */
export function parseAbshdh(html, tehranDayOf) {
  const out = {};
  const posts = [...String(html).matchAll(/tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>[\s\S]*?<time datetime="([^"]+)"/g)];
  for (const [, body, when] of posts) {
    const t = FA_DIGITS(body.replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, ' ')).replace(/\u0640/g, '');
    const at = Date.parse(when);
    if (!Number.isFinite(at)) continue;
    const grab = (re) => {
      const m = re.exec(t);
      return m ? Number(m[1].replace(/[,٬\s]/g, '')) : NaN;
    };
    const kinds = [
      ['mesghal', grab(/#آبشده\u200c?امروزی[^\d]{0,12}([\d,٬]{9,13})/)],
      ['mesghal_fwd', grab(/#ابشده\u200c?حواله[^\d]{0,12}([\d,٬]{9,13})/)],
    ];
    for (const [id, p] of kinds) if (p > 1e7 && p < 1e11 && (!out[id] || out[id].at <= at)) out[id] = { at, p };
  }
  const res = {};
  for (const [id, q] of Object.entries(out)) res[id] = { d: tehranDayOf(new Date(q.at)), p: roundQuote(id, q.p), h: NaN, l: NaN, at: new Date(q.at).toISOString() };
  return res;
}
/** chande.net live stream (bonbast/navasan): rial buy and sell per symbol; the market quote is their mid. */
export function parseChande(text, tehranDayOf) {
  const line = String(text).split('\n').find((l) => l.startsWith('data:') && l.includes('"prices"'));
  if (!line) return {};
  const P = JSON.parse(line.slice(5)).prices ?? {};
  const mid = (k) => {
    const x = P[k];
    if (!x) return NaN;
    const b = Number(x.price_buy), s = Number(x.price_sell);
    return (b > 0 && s > 0 ? (b + s) / 2 : s > 0 ? s : b) / 10;
  };
  const day = (k) => tehranDayOf(new Date(Date.parse(P[k]?.updated_at?.replace(/(\.\d+)?$/, '')) || Date.now()));
  const map = { usd: 'USD', sekee: 'COIN_EMAMI', sekeb: 'COIN_BAHAR', nim: 'COIN_HALF', rob: 'COIN_QUARTER', gerami: 'COIN_GRAM' };
  const out = {};
  for (const [id, k] of Object.entries(map)) {
    const p = mid(k);
    if (p > 0) out[id] = { d: day(k), p: roundQuote(id, p), h: NaN, l: NaN };
  }
  const ons = Number(P.GOLD_24K?.price_usd); // world ounce in dollars, a fallback when goldprice.org is not reachable
  if (ons > 500 && ons < 50000) out.ons = { d: day('GOLD_24K'), p: roundQuote('ons', ons), h: NaN, l: NaN, fallback: true };
  return out;
}
/** goldprice.org: { items: [{ xauPrice, xauClose, ... }], date } — spot ounce in US dollars. */
export function parseGoldprice(json, tehranDayOf) {
  const x = json?.items?.[0]?.xauPrice;
  return x > 500 && x < 50000 ? { ons: { d: tehranDayOf(new Date()), p: roundQuote('ons', x), h: NaN, l: NaN } } : {};
}
/* ---------------- forgod (spec 0049) ---------------- */
export const FORGOD_URL = 'https://api.forgod.qzz.io';
/** The single addresses tried when /api/all fails: the dollar, the 18k gram and bitcoin. */
export const FORGOD_SINGLES = [['forgod_usd', 'usd'], ['forgod_18ayar', '18ayar'], ['forgod_btc', 'usd_btc']];
/** forgod's market hours on the Tehran clock, in minutes: most of the day's allowance is spent between them. */
export const FORGOD_DAY = [9 * 60, 22 * 60];
/**
 * How forgod's daily allowance is spent (spec 0049): a reserve kept back for a manager's «به‌روزرسانی همین حالا», a
 * tenth of the rest at night and the rest spread over market hours. For 50: 6 kept back, every 20 minutes from 09:00 to
 * 22:00 (39) and every 165 minutes at night (4), 43 automatic requests a day. A rolling 24-hour count enforces it.
 */
export function forgodPlan(daily = 50) {
  const n = Math.max(1, Math.floor(Number(daily) || 50));
  const reserve = Math.min(n - 1, Math.max(2, Math.round(n * 0.12)));
  const auto = Math.max(1, n - reserve);
  const night = Math.max(1, Math.floor(auto * 0.1)), day = Math.max(1, auto - night);
  const dayLen = FORGOD_DAY[1] - FORGOD_DAY[0];
  return { daily: n, reserve, auto, dayEvery: Math.ceil(dayLen / day), nightEvery: Math.ceil((1440 - dayLen) / night) };
}
const faNum = (v) => String(v).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
const FX_CODE = { aed_note: 'AED', usd_usdt: 'USDT' }; // forgod's codes that are not the ISO code in lower case
const FX_PER = { JPY: 100 }; // quoted per 100 units (173,377 toman for 100 yen)
const MAX_GAP = 0.25; // the 18k gram against ounce × dollar, and bitcoin against its dollar price × dollar
const CLOCK_RE = /^(\d{1,2}):(\d{2})(?::\d{2})?$/;
const LABEL_RE = new RegExp(`^([0-9۰-۹]{1,2}) (${JALALI_MONTHS.join('|')}|امرداد)(?: ([0-9۰-۹]{4}))?$`);
/**
 * forgod's label for a quote not made today («4 آبان», «۲۶ خرداد ۱۴۰۵») as an ISO day: without a year, the latest such
 * day on or before `today`. null when the label is not a date.
 */
export function forgodLabelDay(label, today) {
  const m = LABEL_RE.exec(String(label ?? '').trim().replace(/\s+/g, ' '));
  if (!m) return null;
  const num = (s) => Number(String(s).replace(/[۰-۹]/g, (c) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(c)));
  const jm = m[2] === 'امرداد' ? 5 : JALALI_MONTHS.indexOf(m[2]) + 1, jy = jalaliOf(today)[0];
  for (const y of m[3] ? [num(m[3])] : [jy, jy - 1]) {
    const d = isoDay(`${y}/${jm}/${num(m[1])}`);
    if (d && d <= today) return d;
  }
  return null;
}
/**
 * forgod's answer: /api/all ({ sections: { currencies, gold, bubbles, crypto }, last_updated, stale }) or single rows
 * ({ code, price, time, section, last_updated, stale }), prices in toman with thousands commas, the ounce and
 * `usd_price` in dollars. A row whose `time` is a date rather than a clock time is an old quote and is skipped; a
 * clock time more than 10 minutes after `last_updated` belongs to the day before. Returns the symbols' quotes, the
 * currency table (only from /api/all) and, when the gold does not agree with the ounce × the dollar, an error.
 * After midnight forgod dates every currency it has not quoted yet that day: such a rate dated today or yesterday
 * still enters the currency table (its latest rate), never a bar.
 */
export function parseForgod(answers, { now = new Date() } = {}) {
  const list = Array.isArray(answers) ? answers : [answers];
  const full = list.length === 1 && list[0]?.sections && typeof list[0].sections === 'object' ? list[0] : null;
  const rows = full ? Object.values(full.sections).flatMap((x) => (Array.isArray(x) ? x : [])) : list.filter((r) => r && typeof r === 'object' && r.code);
  const stamps = (full ? [full] : rows).map((r) => Date.parse(r.last_updated)).filter(Number.isFinite);
  const at = new Date(Math.min(now.getTime(), stamps.length ? Math.max(...stamps) : now.getTime()));
  const stale = (full ? [full] : rows).some((r) => r.stale === true);
  const clock = tehranMinutes(at), today = tehranDay(at), yesterday = tehranDay(new Date(at.getTime() - 86400000));
  const byCode = new Map(), dated = new Map(), order = [], skipped = [];
  for (const r of rows) {
    const code = String(r.code ?? '').toLowerCase();
    const p = clean(r.price), m = CLOCK_RE.exec(String(r.time ?? '').trim());
    if (!code || !(p > 0 && p < 1e13)) continue;
    const q = { code, p, section: String(r.section ?? ''), name: String(r.name ?? '').replace(/[<>]/g, '').trim().slice(0, 40), usd: Number(r.usd_price) };
    order.push(code);
    if (!m) {
      skipped.push(code); // «26 خرداد»: not today's quote
      const d = forgodLabelDay(r.time, today);
      if (d === today || d === yesterday) dated.set(code, { ...q, d, t: null }); // the currency table's latest rate, never a bar
      continue;
    }
    const mins = Number(m[1]) * 60 + Number(m[2]);
    byCode.set(code, { ...q, d: mins > clock + 10 ? yesterday : today, t: `${m[1].padStart(2, '0')}:${m[2]}` });
  }
  const live = {};
  for (const sym of SYMBOLS) {
    const q = sym.feed.forgod && byCode.get(sym.feed.forgod);
    if (q) live[sym.id] = { d: q.d, p: roundQuote(sym.id, q.p), h: NaN, l: NaN };
  }
  // the gram and the mazaneh are one price (mazaneh = gram-18 × 4.3318); either fills in for the other
  if (live.geram18 && !live.mesghal) live.mesghal = { ...live.geram18, p: roundQuote('mesghal', live.geram18.p * MAZANEH_TO_G750) };
  if (live.mesghal && !live.geram18) live.geram18 = { ...live.mesghal, p: roundQuote('geram18', live.mesghal.p / MAZANEH_TO_G750) };
  if (live.geram18) live.geram24 = { ...live.geram18, p: roundQuote('geram24', (live.geram18.p * 1000) / 750) };
  const out = { at: at.toISOString(), stale, live, fx: null, skipped, dropped: [], error: null };
  const g18 = live.geram18?.p, ons = live.ons?.p, usd = live.usd?.p;
  if (g18 && ons && usd && Math.abs(g18 / ((ons / TROY_OUNCE_G) * 0.75 * usd) - 1) > MAX_GAP) {
    out.live = {};
    out.error = 'قیمت طلای ۱۸ با انس × دلار همین منبع بیش از ۲۵٪ فاصله دارد (احتمال خطای واحد ریال و تومان)؛ چیزی ثبت نشد.';
    return out;
  }
  const btcUsd = byCode.get('usd_btc')?.usd;
  if (live.btc && usd && btcUsd > 0 && Math.abs(live.btc.p / (btcUsd * usd) - 1) > MAX_GAP) {
    delete live.btc;
    out.dropped.push('btc');
  }
  if (full) {
    const rates = [];
    for (const c of order) {
      const q = byCode.get(c) ?? dated.get(c);
      if (!q || (q.section !== 'currencies' && q.code !== 'usd_usdt')) continue;
      const code = FX_CODE[q.code] ?? q.code.toUpperCase();
      if (/^[A-Z]{3,5}$/.test(code) && !rates.some((x) => x.code === code)) rates.push({ code, name: q.name, p: q.p, per: FX_PER[code] ?? 1, t: q.t, d: q.d, at: out.at });
    }
    out.fx = { at: out.at, rates, btcUsd: btcUsd > 0 ? btcUsd : null };
  }
  return out;
}
/**
 * The currency table after an update (spec 0049, amendment 2): the fresh rates, and every earlier forgod rate this
 * update did not bring while its own last quote is under a day old, each where it stood. So an answer that leaves a few
 * currencies out never empties the table.
 */
export function mergeFx(fresh, prev, now = new Date()) {
  const was = prev?.src === 'forgod' && Array.isArray(prev.rates) ? prev.rates : [];
  const out = [...fresh.rates];
  was.forEach((r, i) => {
    if (out.some((x) => x.code === r.code) || !(now.getTime() - Date.parse(r.at ?? prev.at) < 86400000)) return;
    let k = i, at = -1; // after its nearest old neighbour still in the table, else first
    while (--k >= 0 && at < 0) {
      const code = was[k].code;
      at = out.findIndex((x) => x.code === code);
    }
    out.splice(at + 1, 0, r);
  });
  return { ...fresh, rates: out };
}
async function fetchText(fetchImpl, url, { timeout = 20000, max = 4 * 1024 * 1024, headers = {}, until = null } = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  try {
    const res = await fetchImpl(url, { headers: { 'user-agent': 'Mozilla/5.0 (Beatris gold-shop app)', ...headers }, redirect: 'follow', signal: ctl.signal });
    if (!res.ok) throw new Error(`پاسخ ${res.status} از ${new URL(url).hostname}`);
    const reader = res.body.getReader(), dec = new TextDecoder();
    let text = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      text += dec.decode(value, { stream: true });
      if (text.length > max) throw new Error('پاسخ منبع بیش از حد بزرگ است');
      if (until && until(text)) {
        ctl.abort(); // a live stream: the first full message is enough
        break;
      }
    }
    return text;
  } finally {
    clearTimeout(timer);
  }
}

/** Feed URLs must be public https hosts: no IP literals, no localhost, no private service names, no userinfo. */
export function checkFeedUrl(u) {
  let url;
  try {
    url = new URL(String(u));
  } catch {
    return 'نشانی فید معتبر نیست.';
  }
  if (url.protocol !== 'https:') return 'نشانی فید باید با https شروع شود.';
  const h = url.hostname.toLowerCase();
  if (!h.includes('.') || h.startsWith('[') || /^[\d.]+$/.test(h) || /(^|\.)(localhost|internal|local|lan|home|corp)$/.test(h)) return 'نشانی فید باید یک دامنه عمومی باشد، نه IP یا شبکه داخلی.';
  if (url.username || url.password) return 'اطلاعات ورود را در نشانی نگذارید؛ از فیلد توکن استفاده کنید.';
  return null;
}

async function fetchJson(fetchImpl, url, { headers = {}, timeout = 25000, max = 12 * 1024 * 1024 } = {}) {
  const res = await fetchImpl(url, { headers: { accept: 'application/json', 'user-agent': 'Beatris/2 (gold-shop training app)', ...headers }, redirect: 'error', signal: AbortSignal.timeout(timeout) });
  if (!res.ok) throw Object.assign(new Error(`پاسخ ${res.status} از منبع`), { status: res.status });
  if (Number(res.headers.get('content-length') || 0) > max) throw new Error('پاسخ منبع بیش از حد بزرگ است');
  const reader = res.body.getReader(), parts = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      throw new Error('پاسخ منبع بیش از حد بزرگ است');
    }
    parts.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(parts).toString('utf8'));
  } catch {
    throw new Error('پاسخ منبع JSON معتبر نیست');
  }
}

/* ---------------- store, feed and board ---------------- */
export function createMarket({ db, fetchImpl = globalThis.fetch, clock = () => new Date(), envMode = process.env.BEATRIS_MARKET_FEED, defaultMode = defaultFeedMode(process.env), forgod = { key: process.env.BEATRIS_FORGOD_KEY ?? '', base: process.env.BEATRIS_FORGOD_URL || FORGOD_URL, daily: process.env.BEATRIS_FORGOD_DAILY }, onPrice = () => {}, pause = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  const fgKey = String(forgod?.key ?? '').trim(), fgBase = String(forgod?.base || FORGOD_URL).replace(/\/+$/, '');
  const plan = forgodPlan(forgod?.daily ?? 50);
  /** The key never leaves the server: any text kept or shown has it masked, as typed and as sent in the address. */
  const hide = (t) => (fgKey ? String(t).split(fgKey).join('••••').split(encodeURIComponent(fgKey)).join('••••') : String(t));
  const iso = () => clock().toISOString();
  const today = () => tehranDay(clock());
  let sample = null, sampleDay = null;
  const sampleData = () => {
    const d = today();
    if (sampleDay !== d) [sample, sampleDay] = [sampleMarket(d), d];
    return sample;
  };
  const hasReal = () => !!db.get('SELECT 1 AS x FROM market_bars LIMIT 1');
  const setting = (key) => {
    const r = db.get('SELECT value_json FROM settings WHERE key=?', key);
    return r ? JSON.parse(r.value_json) : null;
  };
  const save = (key, value, by) =>
    db.run('INSERT INTO settings(key,value_json,updated_at,updated_by) VALUES (?,?,?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at, updated_by=excluded.updated_by', key, JSON.stringify(value), iso(), by);
  const config = () => ({ ...DEFAULT_FEED, mode: FEED_MODES.includes(envMode) ? envMode : defaultMode, ...(setting('market') ?? {}) });
  let status = setting('marketStatus');

  let revision = 0; // moves whenever a stored price changes; screens that value the books at market prices key on it
  function upsert(id, bars, src, { force = false } = {}) {
    const at = iso();
    let n = 0;
    revision++;
    db.tx(() => {
      for (const b of bars) {
        const r = db.run(
          `INSERT INTO market_bars(symbol,day,o,h,l,c,src,updated_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(symbol,day) DO UPDATE SET o=excluded.o, h=excluded.h, l=excluded.l, c=excluded.c, src=excluded.src, updated_at=excluded.updated_at${force ? '' : " WHERE market_bars.src <> 'manual'"}`,
          id, b.d, b.o, b.h, b.l, b.c, src, at,
        );
        n += Number(r.changes);
      }
    });
    return n;
  }
  /** A live quote joins its day's bar: the open stays, high and low widen, the close follows the quote. */
  function applyQuote(id, q, src) {
    const cur = db.get('SELECT o,h,l,c,src FROM market_bars WHERE symbol=? AND day=?', id, q.d);
    if (cur?.src === 'manual') return { n: 0 };
    const prev = db.get('SELECT c FROM market_bars WHERE symbol=? AND day<? ORDER BY day DESC LIMIT 1', id, q.d);
    const ref = cur?.c ?? prev?.c;
    if (ref && Math.abs(q.p / ref - 1) > MAX_JUMP) return { n: 0, rejected: true };
    const o = cur?.o ?? q.p;
    const h = Math.max(o, q.p, cur?.h ?? q.p, Number.isFinite(q.h) ? q.h : q.p);
    const l = Math.min(o, q.p, cur?.l ?? q.p, Number.isFinite(q.l) ? q.l : q.p);
    return { n: upsert(id, [{ d: q.d, o, h, l, c: q.p }], src) };
  }
  function series(ids, from) {
    const real = hasReal();
    const out = {};
    for (const id of ids) {
      const bars = real ? db.all('SELECT day AS d, o, h, l, c FROM market_bars WHERE symbol=? AND day>=? ORDER BY day', id, from || '0000') : sampleData()[id].filter((b) => !from || b.d >= from);
      out[id] = bars.map((b) => [b.d, b.o, b.h, b.l, b.c]);
    }
    return { sample: !real, series: out };
  }
  /** The latest currency table (spec 0049) while it is less than a day old; rates are toman per `per` units. */
  function fxTable() {
    const fx = setting('marketFx');
    return fx?.rates?.length && clock() - Date.parse(fx.at) < 86400000 ? fx : null;
  }
  function board() {
    const real = hasReal(), cfg = config();
    const items = SYMBOLS.map((s) => {
      const rows = real ? db.all('SELECT day AS d, o, h, l, c, src FROM market_bars WHERE symbol=? ORDER BY day DESC LIMIT 61', s.id).reverse() : sampleData()[s.id].slice(-61);
      if (!rows.length) return { id: s.id, empty: true };
      const last = rows.at(-1), prev = rows.at(-2);
      return { id: s.id, d: last.d, o: last.o, h: last.h, l: last.l, c: last.c, src: last.src ?? 'sample', prev: prev?.c ?? null, pct: prev ? (last.c / prev.c - 1) * 100 : null, spark: rows.slice(-60).map((r) => r.c) };
    });
    return { sample: !real, today: today(), source: { mode: real ? cfg.mode : 'sample', label: FEED_LABEL[real ? cfg.mode : 'sample'], at: status?.at ?? null, ok: status?.ok ?? null, error: status?.error ?? null }, items, fx: fxTable() };
  }

  /* forgod's allowance (spec 0049): every request is counted in a rolling 24-hour log kept in the database */
  const DAY_MS = 86400000;
  function quota() {
    const q = setting('forgodQuota') ?? {}, now = clock().getTime();
    const at = (Array.isArray(q.at) ? q.at : []).filter((t) => now - Date.parse(t) < DAY_MS).sort();
    return { at, blockedUntil: q.blockedUntil && Date.parse(q.blockedUntil) > now ? q.blockedUntil : null };
  }
  /** When the log will have room for one more request under `limit`. */
  const freeAt = (at, limit) => new Date(Date.parse(at[at.length - limit]) + DAY_MS);
  const quotaError = (msg) => Object.assign(new Error(msg), { quota: true });
  /** One request to forgod, if the allowance has room: automatic updates leave the reserve to a manager's own. */
  async function ask(path, { auto = false } = {}) {
    const q = quota(), limit = auto ? plan.auto : plan.daily;
    if (q.blockedUntil) throw quotaError(`forgod درخواست‌ها را نپذیرفت؛ تا ساعت ${faNum(tehranClock(new Date(q.blockedUntil)))} درخواستی فرستاده نمی‌شود.`);
    if (q.at.length >= limit) throw quotaError(`سهمیه ${auto ? 'به‌روزرسانی خودکار' : 'روزانه'} forgod پر است (${faNum(q.at.length)} از ${faNum(plan.daily)} درخواست در ۲۴ ساعت)؛ درخواست بعدی از ساعت ${faNum(tehranClock(freeAt(q.at, limit)))}.`);
    q.at.push(clock().toISOString());
    save('forgodQuota', q, 'system');
    try {
      return await fetchJson(fetchImpl, `${fgBase}/api/${path}?api_key=${encodeURIComponent(fgKey)}`, { timeout: 20000, max: 2 * 1024 * 1024 });
    } catch (e) {
      // refused (no allowance left, or the key): nothing more is sent for an hour
      if ([401, 403, 429].includes(e?.status)) save('forgodQuota', { ...quota(), blockedUntil: new Date(clock().getTime() + 3600000).toISOString() }, 'system');
      throw e;
    }
  }
  /** The daily history, once, from tgju's tables (always marked done when `always`, so a missing source is not asked every poll). */
  async function history(st, always) {
    st.missing = [];
    const keyed = SYMBOLS.filter((x) => x.feed.tgju);
    for (const s of keyed) {
      try {
        st.rows += upsert(s.id, parseTgjuHistory(await fetchJson(fetchImpl, TGJU_HISTORY(s.feed.tgju)), s), 'tgju');
      } catch {
        st.missing.push(s.id);
      }
      await pause(400); // one table at a time; be gentle with the source
    }
    if (always || st.missing.length < keyed.length) save('market', { ...(setting('market') ?? {}), backfilled: iso() }, 'system');
  }

  let running = null;
  function sync({ backfill = false, auto = false } = {}) {
    if (running) return running;
    running = (async () => {
      const cfg = config();
      const st = { at: iso(), mode: cfg.mode, ok: false, quotes: 0, rows: 0, rejected: [], error: null };
      try {
        let live = {};
        if (cfg.mode === 'tgju') {
          if (backfill || !cfg.backfilled) await history(st, false);
          live = parseTgjuLive(await fetchJson(fetchImpl, TGJU_LIVE));
        } else if (cfg.mode === 'owner') {
          // history comes once from tgju's daily tables; live prices from the owner's sources
          if (backfill || !cfg.backfilled) await history(st, true);
          st.sources = {};
          const dayOf = (d) => tehranDay(d);
          const tryIt = async (name, fn) => {
            try {
              const r = await fn();
              st.sources[name] = Object.keys(r).length ? 'ok' : 'بدون قیمت';
              return r;
            } catch (e) {
              st.sources[name] = String(e?.message ?? e).slice(0, 80);
              return {};
            }
          };
          const tg = await tryIt('abshdh', async () => parseAbshdh(await fetchText(fetchImpl, ABSHDH_URL), dayOf));
          const ch = await tryIt('chande', async () => parseChande(await fetchText(fetchImpl, CHANDE_SSE, { headers: { accept: 'text/event-stream' }, until: (t) => /\ndata:[^\n]*"prices"[^\n]*\n/.test(t), timeout: 15000 }), dayOf));
          const gp = await tryIt('goldprice', async () => parseGoldprice(JSON.parse(await fetchText(fetchImpl, GOLDPRICE_URL, { headers: { referer: 'https://goldprice.org/', accept: 'application/json' } })), dayOf));
          live = { ...ch, ...gp, ...tg };
          if (!gp.ons && ch.ons) st.onsFrom = 'chande';
          // gram prices follow the mazaneh exactly (gram-18 = mazaneh ÷ 4.3318; gram-24 = gram-18 × 1000 ÷ 750)
          if (live.mesghal) {
            const g18 = live.mesghal.p / MAZANEH_TO_G750;
            live.geram18 = { d: live.mesghal.d, p: roundQuote('geram18', g18), h: NaN, l: NaN };
            live.geram24 = { d: live.mesghal.d, p: roundQuote('geram24', (g18 * 1000) / 750), h: NaN, l: NaN };
          }
        } else if (cfg.mode === 'forgod') {
          // one request carries everything; the three single addresses only when it fails (spec 0049)
          if (!fgKey) throw new Error('کلید forgod روی سرور تنظیم نشده است (متغیر BEATRIS_FORGOD_KEY).');
          const bad = checkFeedUrl(fgBase);
          if (bad) throw new Error(bad);
          if (backfill || !cfg.backfilled) await history(st, true);
          st.sources = {};
          let got = null;
          try {
            const all = await ask('all', { auto });
            if (!all?.sections || typeof all.sections !== 'object') throw new Error('پاسخ /api/all بخش قیمت‌ها را ندارد');
            got = parseForgod(all, { now: clock() });
            st.sources.forgod = Object.keys(got.live).length || got.stale || got.error ? 'ok' : 'بدون قیمت';
          } catch (e) {
            if (e?.quota || [401, 403, 429].includes(e?.status)) throw e; // no allowance: the single addresses would not be answered either
            st.sources.forgod = hide(e?.message ?? e).slice(0, 80);
          }
          if (!got || (!Object.keys(got.live).length && !got.stale && !got.error)) {
            // the three single addresses only when the allowance has room for all three
            if ((auto ? plan.auto : plan.daily) - quota().at.length < FORGOD_SINGLES.length) throw new Error(`${st.sources.forgod ?? 'پاسخ /api/all خالی بود'}؛ سهمیه برای سه نشانی تکی کافی نیست.`);
            const rows = [];
            for (const [name, path] of FORGOD_SINGLES) {
              try {
                rows.push(await ask(path, { auto }));
                st.sources[name] = 'ok';
              } catch (e) {
                st.sources[name] = hide(e?.message ?? e).slice(0, 80);
              }
            }
            got = parseForgod(rows, { now: clock() });
          }
          if (got.stale) throw new Error('منبع forgod قیمت‌ها را کهنه (stale) اعلام کرده است؛ چیزی ثبت نشد.');
          if (got.error) throw new Error(got.error);
          if (got.skipped.length) st.skipped = got.skipped.slice(0, 40);
          if (got.dropped.length) st.dropped = got.dropped;
          const fx = got.fx && mergeFx(got.fx, setting('marketFx'), clock());
          if (fx?.rates.length) {
            save('marketFx', { ...fx, src: 'forgod' }, 'system');
            st.fx = fx.rates.length;
          }
          live = got.live;
        } else if (cfg.mode === 'json') {
          const err = checkFeedUrl(cfg.url);
          if (err) throw new Error(err);
          live = parseCustom(await fetchJson(fetchImpl, cfg.url, { headers: cfg.token ? { authorization: `Bearer ${cfg.token}` } : {} }), today());
        } else {
          st.ok = true;
          return st;
        }
        for (const id of Object.keys(live)) {
          const r = applyQuote(id, live[id], cfg.mode);
          st.rows += r.n;
          if (r.rejected) st.rejected.push(id);
          else st.quotes++;
        }
        st.ok = st.quotes > 0;
        if (!st.ok) st.error = st.rejected.length ? 'قیمت‌های رسیده با آخرین قیمت‌ها بیش از ۳۰٪ فاصله داشتند و ثبت نشدند.' : 'منبع هیچ قیمت معتبری نداد.';
        if (st.ok && cfg.syncPrice && live.geram18 && !st.rejected.includes('geram18')) onPrice(live.geram18.p, FEED_LABEL[cfg.mode]);
      } catch (e) {
        st.error = hide(e?.message ?? e).slice(0, 200);
      } finally {
        status = st;
        save('marketStatus', st, 'system');
      }
      return st;
    })().finally(() => (running = null));
    return running;
  }

  /** Background polling (the server calls start(); tests drive sync() directly). */
  let timer = null, last = 0;
  /** Time between automatic updates: the manager's own number, and for forgod never less than its allowance gives this hour. */
  function everyMs() {
    const cfg = config();
    let min = Math.min(60, Math.max(5, Number(cfg.interval) || 10));
    if (cfg.mode === 'forgod') {
      const t = tehranMinutes(clock());
      min = Math.max(min, t >= FORGOD_DAY[0] && t < FORGOD_DAY[1] ? plan.dayEvery : plan.nightEvery);
    }
    return min * 60000;
  }
  /** One poll if the configured period has passed (the persistent market worker calls this every minute). */
  function poll() {
    const cfg = config();
    if (cfg.mode === 'off') return null;
    const now = clock().getTime();
    if (now - last < everyMs()) return null;
    if (cfg.mode === 'forgod') {
      const q = quota(); // nothing could be sent: no empty run either, the last status stays
      if (q.blockedUntil || q.at.length >= plan.auto) return null;
    }
    last = now;
    return sync({ auto: true });
  }
  function start() {
    if (timer) return;
    const tick = () => void poll()?.catch(() => {});
    timer = setInterval(tick, 60000);
    timer.unref();
    setTimeout(tick, 5000).unref();
  }
  const stop = () => (clearInterval(timer), (timer = null));

  /** What a manager may know about the forgod source: whether its key is set and the host, never the key. */
  function forgodView() {
    const q = quota();
    const host = (() => { try { return new URL(fgBase).host; } catch { return ''; } })();
    return { key: !!fgKey, host, ...plan, day: FORGOD_DAY, used: q.at.length, left: Math.max(0, plan.daily - q.at.length), blockedUntil: q.blockedUntil, next: last ? new Date(last + everyMs()).toISOString() : null };
  }
  /** For the public deep health: the mode, how the last update went, the allowance used and the days of history; no prices, error texts or keys. */
  const health = () => ({ mode: config().mode, ok: status?.ok ?? null, quotes: status?.quotes ?? 0, at: status?.at ?? null, fx: fxTable()?.rates.length ?? 0, quota: { used: quota().at.length, daily: plan.daily }, days: db.get('SELECT COUNT(DISTINCT day) AS n FROM market_bars')?.n ?? 0 });
  return { config, rev: () => revision, stored: () => setting('market') ?? {}, save, status: () => status, upsert, applyQuote, series, board, fxTable, sync, poll, everyMs, start, stop, hasReal, today, forgodView, health };
}
