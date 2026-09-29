// کنترل (spec docs/specs/0002-control.md) — the owner's control room over the books. Everything here READS the books
// (bk_docs, bk_postings, bk_versions, bk_log) and computes; the only writes are the owner's own control state
// (what they have seen, exception labels and status, calibration, period locks, approvals, auto-close reports).
// Machine judgements are typed (public/js/typed.mjs): a fixed set of answers, a probability for each, confidence, and
// coverage — how much of the evidence was actually available.
import * as B from '../public/js/books.mjs';
import * as TR from '../public/js/trade.mjs';
import { TRADE_COINS as COIN_TYPES } from '../public/js/coins.mjs';
import { MAZANEH_TO_G750 } from '../public/js/calc.mjs';
import { typedChoice } from '../public/js/typed.mjs';
import { sigmoid, calibrate, report as calReport } from '../public/js/calibration.mjs';
import { buildLots } from '../public/js/lots.mjs';
import { jalaliOf } from '../public/js/ta.mjs';
import { replayLedger } from './replay.mjs';
import { knowledge } from './rag.mjs';
import { createHash, randomUUID } from 'node:crypto';

const createHashHex = (s) => createHash('sha256').update(s).digest('hex');
const randomId = () => randomUUID();

export const CONTROL_SCHEMA = `
CREATE TABLE IF NOT EXISTS ctl_seen (user_id TEXT PRIMARY KEY, at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS ctl_exc (key TEXT PRIMARY KEY, status TEXT NOT NULL DEFAULT 'open', until TEXT, label INTEGER, raw REAL, rules TEXT, by TEXT, at TEXT NOT NULL, note TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS ctl_locks (month TEXT PRIMARY KEY, locked_by TEXT NOT NULL, locked_at TEXT NOT NULL, unlocked_at TEXT, unlocked_by TEXT, reason TEXT);
CREATE TABLE IF NOT EXISTS ctl_approvals (id TEXT PRIMARY KEY, kind TEXT NOT NULL, ref TEXT, summary TEXT NOT NULL, payload_hash TEXT NOT NULL, detail_json TEXT NOT NULL DEFAULT '{}', status TEXT NOT NULL DEFAULT 'pending', requested_by TEXT NOT NULL, requested_name TEXT NOT NULL, requested_at TEXT NOT NULL, decided_by TEXT, decided_name TEXT, decided_at TEXT, note TEXT NOT NULL DEFAULT '', used_at TEXT);
CREATE TABLE IF NOT EXISTS ctl_recon (day TEXT PRIMARY KEY, data_json TEXT NOT NULL, issues INTEGER NOT NULL, closed INTEGER NOT NULL DEFAULT 0, at TEXT NOT NULL);
`;

/** The exception rules; a calibration is only valid for the rules version it was fitted on. */
export const RULES_VERSION = 'exc-1';

const now = () => new Date().toISOString();
const DAY = 864e5;
const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);
const r3 = (x) => Math.round(x * 1000) / 1000;
const txt = (v, max = 300) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
const fa = B.faNum;
/** Jalali date for sentences (1405/07/07), never the stored Gregorian. */
const jd = (iso) => {
  if (!iso) return '';
  const [y, m, d] = jalaliOf(String(iso).slice(0, 10));
  return fa(`${y}/${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}`);
};
const pf = (x, digits = 1) => fa(Number(x).toFixed(digits)).replace('.', '٫');
const R = (v) => B.fmtMoney(Math.round(v), 'rial');
const G = (v) => `${B.fmtG(r3(v))} گرم`;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const tehranDayOf = (iso) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(new Date(iso));
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0;
};
const quantile = (xs, q) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1))] : 0;
};
const unitName = (u) => (u === 'IRR' ? 'ریال' : u === 'G750' ? 'گرم ۷۵۰' : u.startsWith('COIN:') ? `سکه ${COIN_TYPES[u.slice(5)]?.short ?? u.slice(5)}` : u.startsWith('FX:') ? (TR.FX_CODES[u.slice(3)] ?? u) : u.startsWith('BAR:') ? `شمش ${fa(u.slice(4))}` : u);
const amtText = (u, v) => (u === 'IRR' ? R(v) : u === 'G750' ? `${G(v)} ۷۵۰` : u.startsWith('COIN:') ? `${fa(v)} ${unitName(u)}` : u.startsWith('BAR:') ? unitName(u) : `${fa(v)} ${unitName(u)}`);

export function makeControl({ db, on, call, settings, getSetting, saveSetting, livePrices, tehranDay, bad, notFound, HttpError, isAdmin, guardAdmin, log, partyRow, market, dashboard, audit, risk, shopId, closeSystem = null }) {
  db.raw.exec(CONTROL_SCHEMA);
  const SYS = { id: null, role: 'owner', name: 'سامانه' };
  const forbid = (m) => new HttpError(403, m);
  const track = (d) => B.trackCode(d.type, d.fy, d.no);
  const partyLabel = (id) => {
    const p = id ? partyRow(id) : null;
    return p ? TR.partyLabel(p) : null;
  };
  const docLink = (d) => ({ id: d.id, track: track(d), href: `/books/doc/${d.id}` });

  /* ------------------------------------------------------------------ state at any day (twin, time machine) */
  /** Every account's balance per unit at the end of `day` (postings are dated; later days are not counted). */
  function balancesAt(day) {
    const m = new Map();
    for (const r of db.all('SELECT acct, unit, SUM(amt) AS s FROM bk_postings WHERE date<=? GROUP BY acct, unit', day)) {
      if (Math.abs(r.s) < 1e-9) continue;
      if (!m.has(r.acct)) m.set(r.acct, {});
      m.get(r.acct)[r.unit] = r.unit === 'G750' ? r3(r.s) : r.unit.startsWith('FX:') ? Math.round(r.s * 100) / 100 : r.unit === 'IRR' ? Math.round(r.s) : r3(r.s);
    }
    return m;
  }
  const barCards = () => {
    const m = new Map();
    for (const d of db.all("SELECT data_json FROM bk_docs WHERE status='final' AND (data_json LIKE '%\"kind\":\"bar\"%' OR data_json LIKE '%\"acct\":\"bar:%')")) {
      const data = JSON.parse(d.data_json);
      for (const l of data.lines ?? []) if (l.kind === 'bar' && l.serial && B.num(l.weight)) m.set(l.serial, { weight: B.num(l.weight), fineness: B.num(l.fineness ?? 995) });
      for (const b of data.balances ?? []) if (b.acct?.startsWith('bar:') && b.weight) m.set(b.acct.slice(4), { weight: B.num(b.weight), fineness: B.num(b.fineness ?? 995) });
    }
    return m;
  };
  /** Board prices (rial) on a past day, from the stored daily closes; today = the live board. */
  function pricesAt(day) {
    if (day >= tehranDay()) {
      const lp = livePrices();
      return { price: lp.price, mazaneh: lp.mazaneh, sample: lp.sample, day };
    }
    const COIN_MAP = { bahar: 'sekeb', emami: 'sekee', halfOld: 'nim', half: 'nim', quarterOld: 'rob', quarter: 'rob', gerami: 'gerami' };
    const ids = ['mesghal', 'usd', ...new Set(Object.values(COIN_MAP))];
    const last = {};
    let sample = true;
    try {
      const s = market.series(ids, addDays(day, -20));
      sample = !!s.sample;
      for (const id of ids) {
        const rows = (s.series[id] ?? []).filter((r) => r[0] <= day);
        if (rows.length) last[id] = rows.at(-1)[4] * 10;
      }
    } catch {
      /* no market history */
    }
    const p750 = last.mesghal ? last.mesghal / MAZANEH_TO_G750 : livePrices().price.G750;
    const price = { G750: Math.round(p750) };
    for (const k of Object.keys(COIN_TYPES)) price[`COIN:${k}`] = last[COIN_MAP[k]] ?? Math.round((COIN_TYPES[k].weight * COIN_TYPES[k].fineness * p750) / 750);
    if (last.usd) price['FX:USD'] = last.usd;
    return { price, mazaneh: last.mesghal ?? null, sample: sample || !last.mesghal, day };
  }
  const accountTitles = () => Object.fromEntries(db.all('SELECT id, kind, title FROM bk_accounts').map((a) => [`${a.kind}:${a.id}`, a.title]));
  /** The digital twin: the whole shop as it stood at the end of `day`. */
  function twin(day) {
    const bal = balancesAt(day);
    const cards = barCards();
    const titles = accountTitles();
    const px = pricesAt(day);
    const t = { day, live: day >= tehranDay(), cash: [], bank: [], gold: 0, pure: 0, bars: [], coins: {}, fx: {}, cheques: 0, receivable: {}, payable: {}, debtors: 0, creditors: 0, prices: px };
    for (const [acct, u] of bal) {
      if (acct.startsWith('cash:')) t.cash.push({ acct, title: titles[acct] ?? acct, amount: u.IRR ?? 0 });
      else if (acct.startsWith('bank:')) t.bank.push({ acct, title: titles[acct] ?? acct, amount: u.IRR ?? 0 });
      else if (acct === 'gold') t.gold = u.G750 ?? 0;
      else if (acct.startsWith('coin:')) t.coins[acct.slice(5)] = Object.values(u)[0] ?? 0;
      else if (acct.startsWith('fx:')) t.fx[acct.slice(3)] = Object.values(u)[0] ?? 0;
      else if (acct.startsWith('bar:') && Object.values(u)[0] > 0) {
        const c = cards.get(acct.slice(4));
        t.bars.push({ serial: acct.slice(4), weight: c?.weight ?? null, fineness: c?.fineness ?? null, g750: c ? r3((c.weight * c.fineness) / 750) : 0 });
      } else if (acct.startsWith('chq:')) t.cheques += u.IRR ?? 0;
      else if (acct.startsWith('party:')) {
        let debt = false, cred = false;
        for (const [unit, v] of Object.entries(u)) {
          if (v > 0) (t.receivable[unit] = (t.receivable[unit] ?? 0) + v), (debt ||= unit === 'IRR');
          else if (v < 0) (t.payable[unit] = (t.payable[unit] ?? 0) - v), (cred ||= unit === 'IRR');
        }
        if (debt) t.debtors++;
        if (cred) t.creditors++;
      }
    }
    for (const k of Object.keys(t.receivable)) t.receivable[k] = k === 'IRR' ? Math.round(t.receivable[k]) : r3(t.receivable[k]);
    for (const k of Object.keys(t.payable)) t.payable[k] = k === 'IRR' ? Math.round(t.payable[k]) : r3(t.payable[k]);
    const barG = r3(t.bars.reduce((s, b) => s + b.g750, 0));
    const barPure = r3(t.bars.reduce((s, b) => s + (b.weight && b.fineness ? (b.weight * b.fineness) / 1000 : 0), 0));
    t.barG750 = barG;
    t.physicalG750 = r3(t.gold + barG);
    t.pure = r3(t.gold * 0.75 + barPure);
    const goldRec = t.receivable.G750 ?? 0, goldPay = t.payable.G750 ?? 0;
    t.netGold = r3(t.physicalG750 + goldRec - goldPay);
    t.cashTotal = t.cash.reduce((s, c) => s + c.amount, 0);
    t.bankTotal = t.bank.reduce((s, c) => s + c.amount, 0);
    const p = px.price;
    const coinValue = Object.entries(t.coins).reduce((s, [k, n]) => s + n * (p[`COIN:${k}`] ?? 0), 0);
    const goodsVal = (side) => Object.entries(side).filter(([u]) => u !== 'IRR').reduce((s, [u, v]) => s + (u.startsWith('BAR:') ? (cards.get(u.slice(4)) ? ((cards.get(u.slice(4)).weight * cards.get(u.slice(4)).fineness) / 750) * p.G750 : 0) : v * (p[u] ?? 0)), 0);
    t.value = {
      physical: Math.round(t.physicalG750 * p.G750),
      coins: Math.round(coinValue),
      cash: t.cashTotal + t.bankTotal + t.cheques,
      receivableIrr: t.receivable.IRR ?? 0,
      payableIrr: t.payable.IRR ?? 0,
      goodsReceivable: Math.round(goodsVal(t.receivable)),
      goodsPayable: Math.round(goodsVal(t.payable)),
    };
    t.value.net = t.value.physical + t.value.coins + t.value.cash + t.value.receivableIrr - t.value.payableIrr + t.value.goodsReceivable - t.value.goodsPayable;
    const events = finalEvents(day);
    const pr = TR.positionReport(events);
    t.realizedToDate = Object.values(pr.positions).reduce((s, x) => s + x.realized, 0);
    t.realizedThatDay = pr.byDay[day] ?? 0;
    t.docsThatDay = db.get("SELECT COUNT(*) AS n FROM bk_docs WHERE status='final' AND date=?", day).n;
    const close = db.get('SELECT created_at, signer_name, reopened_at FROM bk_closes WHERE day=?', day);
    t.closed = close && !close.reopened_at ? { at: close.created_at, by: close.signer_name } : null;
    return t;
  }
  function finalEvents(upto = '9999-12-31', from = '0000-01-01') {
    return db.all("SELECT id, type, fy, no, date, party_id, data_json, calc_json FROM bk_docs WHERE status='final' AND date<=? AND date>=? ORDER BY date, COALESCE(issued_at, created_at)", upto, from)
      .map((r) => ({ id: r.id, track: track(r), type: r.type, date: r.date, party: r.party_id ? partyLabel(r.party_id) : null, partyId: r.party_id, data: JSON.parse(r.data_json), calc: JSON.parse(r.calc_json) }));
  }

  on('GET', '/api/books/control/twin', 'auth', ({ user, url }) => {
    guardAdmin(user);
    const day = DAY_RE.test(url.searchParams.get('day') ?? '') ? url.searchParams.get('day') : tehranDay();
    if (day > tehranDay()) throw bad('ماشین زمان به آینده نمی‌رود؛ برای آینده «پیش‌بینی ۱۰ روزه» را ببینید.');
    const t = twin(day);
    const cmp = url.searchParams.get('compare');
    return DAY_RE.test(cmp ?? '') && cmp <= tehranDay() ? { ...t, compare: twin(cmp) } : t;
  });

  /* ------------------------------------------------------------------ exceptions (مرکز استثناها) */
  const excState = () => new Map(db.all('SELECT * FROM ctl_exc').map((r) => [r.key, r]));
  const calibrationNow = () => {
    const c = getSetting('excCalibration', null);
    return c && c.rules === RULES_VERSION ? c : null; // a calibration fitted on other rules is refused, never applied
  };
  function exceptionsRaw() {
    const today = tehranDay();
    const since = addDays(today, -30);
    const out = [];
    const push = (x) => out.push({ sev: x.raw >= 2.5 ? 'high' : x.raw >= 1.2 ? 'mid' : 'low', ...x });
    const bal = balancesAt(today);
    const titles = accountTitles();
    // 1. stock or cash below zero
    for (const [acct, u] of bal) {
      const v = Object.values(u)[0];
      if (/^(gold|coin:|fx:|bar:)/.test(acct) && v < -1e-9) push({ key: `neg:${acct}`, rule: 'neg-stock', title: 'موجودی منفی', detail: `${acct === 'gold' ? 'طلای آبشده' : unitName(acct.startsWith('coin:') ? `COIN:${acct.slice(5)}` : acct.startsWith('fx:') ? `FX:${acct.slice(3)}` : `BAR:${acct.slice(4)}`)} در دفتر ${acct === 'gold' ? G(v) : fa(v)} است؛ بیش از آنچه بوده فروخته یا تحویل شده.`, raw: 3.2, href: '/books/vault' });
      if (/^(cash|bank):/.test(acct) && (u.IRR ?? 0) < -1) push({ key: `neg:${acct}`, rule: 'neg-cash', title: 'مانده منفی صندوق یا بانک', detail: `${titles[acct] ?? acct}: ${R(u.IRR)}؛ پرداختی بیش از موجودی ثبت شده است.`, raw: 3, href: '/books/cash' });
    }
    const docs = finalEvents(today, since);
    // 2. sold below cost (FIFO lots over all history, sales of the last 30 days)
    const lots = buildLots(finalEvents(today));
    for (const s of lots.sales) {
      if (s.date < since || s.shortage) continue;
      const cost = s.alloc.reduce((a, x) => a + x.cost, 0), profit = s.alloc.reduce((a, x) => a + x.profit, 0);
      if (s.alloc.length && profit < 0 && s.value > 0) push({ key: `below:${s.track}`, rule: 'below-cost', title: 'فروش زیر بهای تمام‌شده', detail: `${s.track}: ${amtText(s.unit, s.qty)} به ${R(s.value)} فروخته شد؛ بهای همان سری‌ها ${R(cost)} بود (زیان ${R(-profit)}).`, raw: 1.2 + Math.min(3, (4 * -profit) / Math.max(1, cost)), date: s.date, href: `/books/trace?q=${encodeURIComponent(s.track)}` });
    }
    // 3. unusual discounts on invoices
    const disc = [];
    for (const d of docs) if (['sale'].includes(d.type)) for (const [i, l] of (d.calc.lines ?? []).entries()) {
      const base = (l.goldValue ?? 0) + (l.ojratValue ?? l.ojrat ?? 0);
      const dv = B.num(l.discount);
      if (dv > 0 && base > 0) disc.push({ d, i, pct: dv / base });
    }
    const pcts = disc.map((x) => x.pct);
    const limit = Math.max((settings().maxDiscountPct ?? 10) / 100, quantile(pcts, 0.95) * 1.5 || 0);
    for (const x of disc) if (x.pct > limit) push({ key: `disc:${x.d.track}/L${x.i + 1}`, rule: 'discount', title: 'تخفیف غیرعادی', detail: `${x.d.track}/L${x.i + 1}: تخفیف ${pf(x.pct * 100)}٪ (سقف معمول ${pf(limit * 100)}٪)${x.d.party ? ` برای ${x.d.party}` : ''}.`, raw: 1 + Math.min(2.5, x.pct / limit), date: x.d.date, href: `/books/doc/${x.d.id}` });
    // 4. large round cash payments, 5. many trades of one customer in one day (splitting)
    const cashAmts = [];
    for (const d of docs) for (const p of d.data.payments ?? []) if (B.payMethod(p.method)?.acct === 'cash') cashAmts.push(B.num(p.amount) * (d.type === 'trade' ? 1 : 10));
    const bigCash = Math.max(settings().bigCash ?? 2_000_000_000, quantile(cashAmts, 0.97));
    const perPartyDay = new Map();
    for (const d of docs) {
      for (const [i, p] of (d.data.payments ?? []).entries()) {
        const amt = B.num(p.amount) * (d.type === 'trade' ? 1 : 10);
        if (B.payMethod(p.method)?.acct === 'cash' && amt >= bigCash && amt % 10_000_000 === 0) push({ key: `cash:${d.track}/P${i + 1}`, rule: 'round-cash', title: 'پرداخت نقدی کلان و گرد', detail: `${d.track}/P${i + 1}: ${R(amt)} نقد ${p.dir === 'in' ? 'دریافت' : 'پرداخت'} شد${d.party ? ` (${d.party})` : ''}؛ هویت و منشأ وجه را ثبت کنید.`, raw: 0.9 + Math.min(1.5, amt / bigCash / 3), date: d.date, href: `/books/doc/${d.id}` });
      }
      if (d.type === 'trade' && d.partyId) {
        const k = `${d.partyId}|${d.date}`;
        const e = perPartyDay.get(k) ?? { n: 0, total: 0, d, docs: [] };
        e.n++;
        e.total += Math.abs(d.calc.net ?? 0);
        e.docs.push(d.track);
        perPartyDay.set(k, e);
      }
    }
    for (const [k, e] of perPartyDay) if (e.n >= 3) push({ key: `split:${k}`, rule: 'split', title: 'چند معامله هم‌روز یک مشتری', detail: `${e.d.party}: ${fa(e.n)} سند در ${jd(e.d.date)} با جمع ${R(e.total)} (${e.docs.join('، ')}). اگر عمداً خرد شده، یک‌جا بررسی کنید.`, raw: 0.8 + Math.min(2, (e.n - 2) * 0.5), date: e.d.date, href: `/books/party/${e.d.partyId}` });
    // 6. back-dated documents, 7. edits of final documents, 8. voids
    // back-dated documents, one item per day of entry (entering history after setup is one event, not fifty)
    const back = new Map();
    for (const d of db.all("SELECT id, type, fy, no, date, created_at FROM bk_docs WHERE created_at>=? AND type<>'opening'", `${since}T00:00:00Z`)) {
      const made = tehranDayOf(d.created_at);
      const gap = daysBetween(d.date, made);
      if (gap <= 2) continue;
      const g = back.get(made) ?? { made, docs: [], maxGap: 0, first: d };
      g.docs.push(track(d));
      g.maxGap = Math.max(g.maxGap, gap);
      back.set(made, g);
    }
    for (const g of back.values()) push({ key: `back:${g.made}:${g.docs.length}`, rule: 'backdated', title: g.docs.length > 1 ? `${fa(g.docs.length)} سند با تاریخ گذشته` : 'سند با تاریخ گذشته', detail: `در ${jd(g.made)} ${g.docs.length > 1 ? `${fa(g.docs.length)} سند` : g.docs[0]} با تاریخ عقب‌تر ثبت شد (تا ${fa(g.maxGap)} روز)${g.docs.length > 1 ? `: ${g.docs.slice(0, 4).join('، ')}${g.docs.length > 4 ? '…' : ''}` : ''}. اگر ورود سابقه بوده، «هشدار کاذب» بزنید.`, raw: 0.8 + Math.min(1.5, g.maxGap / 10), date: g.made, href: g.docs.length > 1 ? '/books/docs' : `/books/doc/${g.first.id}` });
    for (const v of db.all("SELECT v.doc_id, v.version, v.status, v.reason, v.at, d.type, d.fy, d.no FROM bk_versions v JOIN bk_docs d ON d.id=v.doc_id WHERE v.at>=? AND v.version>1", `${since}T00:00:00Z`)) {
      const printed = db.get("SELECT COUNT(*) AS n FROM bk_log WHERE ref=? AND action='doc.event' AND at<?", v.doc_id, v.at).n > 0;
      if (v.status === 'void') push({ key: `void:${v.doc_id}`, rule: 'void', title: 'سند باطل شد', detail: `${track(v)} باطل شد: «${v.reason || 'بی‌دلیل'}».${printed ? ' این سند پیش از ابطال چاپ یا ارسال شده بود.' : ''}`, raw: 1.1 + (printed ? 0.8 : 0), date: tehranDayOf(v.at), href: `/books/doc/${v.doc_id}` });
      else if (v.reason !== 'قطعی شد') push({ key: `edit:${v.doc_id}:${v.version}`, rule: 'edit', title: printed ? 'ویرایش سند پس از چاپ' : 'ویرایش سند قطعی', detail: `${track(v)} نسخه ${fa(v.version)}: «${v.reason || 'بی‌دلیل'}».`, raw: 0.6 + (printed ? 1.2 : 0), date: tehranDayOf(v.at), href: `/books/doc/${v.doc_id}` });
    }
    // 9. customers over their credit limit
    for (const p of db.all('SELECT id, name, alias, father, city, mobile, credit_limit FROM bk_parties WHERE credit_limit>0 AND deleted_at IS NULL')) {
      const owe = bal.get(`party:${p.id}`)?.IRR ?? 0;
      if (owe > p.credit_limit) push({ key: `credit:${p.id}`, rule: 'credit', title: 'عبور از سقف اعتبار', detail: `${TR.partyLabel(p)}: بدهی ${R(owe)} از سقف ${R(p.credit_limit)} گذشته (${fa(Math.round((owe / p.credit_limit) * 100))}٪).`, raw: 1.5 + Math.min(2, owe / p.credit_limit - 1), href: `/books/party/${p.id}` });
    }
    // 10. the books disagree with their own documents
    try {
      const rp = replayLedger(db);
      for (const x of rp.diffs.slice(0, 20)) push({ key: `replay:${x.doc}:${x.acct}:${x.unit}`, rule: 'replay', title: 'اختلاف دفتر با اسناد', detail: `${x.track ?? x.doc}: ثبت ${x.acct} در دفتر ${fa(x.stored)} است ولی از سند ${fa(x.expected)} درمی‌آید.`, raw: 4, href: x.track ? `/books/trace?q=${encodeURIComponent(x.track)}` : '/books/log' });
    } catch {
      /* replay is optional */
    }
    // 11. what the auditor already calls serious
    try {
      for (const f of audit.run(SYS).findings.filter((f) => f.sev === 'high').slice(0, 15)) push({ key: `audit:${f.key ?? f.title}:${f.ref ?? f.detail ?? ''}`.slice(0, 200), rule: 'audit', title: `ممیز: ${f.title}`, detail: f.detail ?? '', raw: 2.6, href: '/books/audit' });
    } catch {
      /* the auditor is optional */
    }
    return out;
  }
  function exceptions({ all = false } = {}) {
    const cal = calibrationNow();
    const st = excState();
    const today = tehranDay();
    const items = exceptionsRaw().map((x) => {
      const s = st.get(x.key);
      const p = cal ? sigmoid(cal.a * x.raw + cal.b) : sigmoid(x.raw - 1.5);
      const status = s?.status === 'snoozed' && s.until && s.until < today ? 'open' : s?.status ?? 'open';
      return { ...x, p: Math.round(p * 1000) / 1000, calibrated: !!cal, status, label: s?.label ?? null, note: s?.note ?? '' };
    });
    const shown = all ? items : items.filter((x) => x.status === 'open');
    shown.sort((a, b) => b.p - a.p);
    const count = { high: shown.filter((x) => x.sev === 'high').length, mid: shown.filter((x) => x.sev === 'mid').length, low: shown.filter((x) => x.sev === 'low').length };
    return { rules: RULES_VERSION, calibrated: !!cal, count, total: items.length, items: shown };
  }
  on('GET', '/api/books/control/exceptions', 'auth', ({ user, url }) => {
    guardAdmin(user);
    return exceptions({ all: url.searchParams.get('all') === '1' });
  });
  on('POST', '/api/books/control/exceptions/label', 'auth', ({ user, body }) => {
    guardAdmin(user);
    const key = txt(body.key, 200);
    const item = exceptionsRaw().find((x) => x.key === key);
    if (!item) throw notFound('این استثنا دیگر وجود ندارد.');
    const status = ['open', 'resolved', 'snoozed'].includes(body.status) ? body.status : 'resolved';
    const label = body.real === true ? 1 : body.real === false ? 0 : null;
    const until = status === 'snoozed' ? addDays(tehranDay(), Math.max(1, Math.min(30, Math.round(B.num(body.days) || 7)))) : null;
    db.run('INSERT INTO ctl_exc(key,status,until,label,raw,rules,by,at,note) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET status=excluded.status, until=excluded.until, label=COALESCE(excluded.label, label), raw=excluded.raw, rules=excluded.rules, by=excluded.by, at=excluded.at, note=excluded.note', key, status, until, label, item.raw, RULES_VERSION, user.id, now(), txt(body.note, 300));
    log(user, 'control.exception', key, { status, label });
    return { ok: true };
  });
  /** Calibration of the risk probabilities on the owner's own verdicts (real / false alarm). */
  function calibrationView() {
    const rows = db.all('SELECT raw, label FROM ctl_exc WHERE label IS NOT NULL AND rules=?', RULES_VERSION);
    const xs = rows.map((r) => r.raw - 1.5), ys = rows.map((r) => r.label);
    const pos = ys.filter((y) => y === 1).length;
    const cal = calibrationNow();
    const stale = getSetting('excCalibration', null);
    return {
      rules: RULES_VERSION,
      labels: rows.length, real: pos, falseAlarms: rows.length - pos,
      ready: rows.length >= 20 && pos >= 3 && rows.length - pos >= 3,
      current: cal ? { a: cal.a, b: cal.b, n: cal.n, at: cal.at, heldOut: cal.heldOut } : null,
      refused: stale && stale.rules !== RULES_VERSION ? `کالیبراسیون ذخیره‌شده برای قواعد ${stale.rules} برازش شده و روی ${RULES_VERSION} اعمال نمی‌شود.` : null,
      raw: rows.length ? calReport(xs.map(sigmoid), ys) : null,
    };
  }
  on('GET', '/api/books/control/exceptions/calibration', 'auth', ({ user }) => (guardAdmin(user), calibrationView()));
  on('POST', '/api/books/control/exceptions/calibration', 'auth', ({ user }) => {
    guardAdmin(user);
    const v = calibrationView();
    if (!v.ready) throw bad(`برای کالیبره کردن دست‌کم ۲۰ داوری لازم است (حداقل ۳ واقعی و ۳ هشدار کاذب)؛ اکنون ${fa(v.labels)} داوری.`);
    const rows = db.all('SELECT raw, label FROM ctl_exc WHERE label IS NOT NULL AND rules=?', RULES_VERSION);
    const c = calibrate(rows.map((r) => r.raw - 1.5), rows.map((r) => r.label));
    // AUC before ECE: no signal → nothing to fix; a correction that does not help on held-out data is not applied
    if (!(c.before.auc > 0.6)) return { applied: false, reason: `AUC ${c.before.auc.toFixed(2)}: قواعد روی داوری‌های شما تمایز کافی ندارند؛ مقیاس‌گذاری کمکی نمی‌کند.`, ...c };
    if (!c.helped) return { applied: false, reason: 'روی نیمه آزمون، خطای کالیبراسیون بهتر نشد؛ احتمال‌های خام نگه داشته شد.', ...c };
    // the stored model maps the raw score directly: p = σ(a·(raw−1.5) + b) = σ(a·raw + (b − 1.5a))
    saveSetting('excCalibration', { a: c.a, b: c.b - 1.5 * c.a, rules: RULES_VERSION, n: rows.length, at: now(), heldOut: { before: { auc: c.before.auc, ece: c.before.ece, brier: c.before.brier }, after: { auc: c.after.auc, ece: c.after.ece, brier: c.after.brier } } }, user.id);
    log(user, 'control.calibrate', RULES_VERSION, { n: rows.length, eceBefore: c.before.ece, eceAfter: c.after.ece });
    return { applied: true, ...c };
  });

  /* ------------------------------------------------------------------ نبض طلا (a typed decision) */
  function pulse() {
    const today = tehranDay();
    const signals = [];
    const sig = (key, weight, available, score, text, href) => signals.push({ key, weight, available, score: available ? Math.max(0, Math.min(1, score)) : 0, text, href });
    const t = twin(today);
    const ex = exceptions();
    // serious items drive the pulse; medium ones can raise it at most to «نیاز به نگاه»
    sig('exceptions', 3, true, ex.count.high * 0.35 + Math.min(0.45, ex.count.mid * 0.08), ex.count.high ? `${fa(ex.count.high)} استثنای جدی باز است` : ex.count.mid ? `${fa(ex.count.mid)} مورد نیاز به نگاه دارد` : 'استثنای جدی نیست', '/books/control?t=exceptions');
    let fc = null;
    try {
      fc = call('GET', '/api/books/forecast', SYS);
    } catch {
      /* no forecast */
    }
    const need = fc && fc.activeSamples >= 2 ? fc.cash.p90 : null;
    sig('liquidity', 2.5, need != null, need ? Math.max(0, (need - t.cashTotal) / need) * 1.2 : 0, need != null ? (t.cashTotal >= need ? `نقد صندوق (${R(t.cashTotal)}) برای فردا کافی است` : `نقد صندوق ${R(t.cashTotal)} است ولی فردا تا ${R(need)} لازم می‌شود`) : 'سابقه کافی برای پیش‌بینی نقد نیست', '/books/smart?t=forecast');
    const owedGold = t.payable.G750 ?? 0;
    sig('custody', 2, owedGold > 0 || t.physicalG750 !== 0, owedGold > 0 ? Math.max(0, (owedGold - t.physicalG750) / owedGold) * 1.3 : t.physicalG750 < 0 ? 1 : 0, owedGold > t.physicalG750 ? `تعهد طلایی به مشتریان (${G(owedGold)}) از طلای موجود (${G(t.physicalG750)}) بیشتر است` : `طلای موجود (${G(t.physicalG750)}) تعهدات طلایی را پوشش می‌دهد`, '/books/vault');
    let rk = null;
    try {
      rk = risk();
    } catch {
      /* optional */
    }
    sig('risk', 1.5, !!rk, rk ? rk.count.high * 0.3 : 0, rk?.count.high ? `${fa(rk.count.high)} مشتری با نوسان قیمت بی‌پوشش می‌شود` : 'پوشش بدهی‌های جنسی مشتریان برقرار است', '/books/smart?t=risk');
    const yesterday = addDays(today, -1);
    const hadYesterday = db.get("SELECT COUNT(*) AS n FROM bk_docs WHERE status='final' AND date=?", yesterday).n > 0;
    const closedY = db.get('SELECT 1 AS x FROM bk_closes WHERE day=? AND reopened_at IS NULL', yesterday);
    sig('close', 1, hadYesterday, hadYesterday && !closedY ? 0.5 : 0, hadYesterday && !closedY ? 'روز گذشته هنوز بسته نشده است' : 'روز گذشته بسته شده است', '/books/smart?t=close');
    let move = null;
    try {
      const m = market.board().items.find((x) => x.id === 'mesghal');
      move = m?.pct ?? null;
    } catch {
      /* no market */
    }
    sig('price', 1, move != null, move != null ? Math.abs(move) / 4 : 0, move != null ? `مظنه امروز ${move >= 0 ? '+' : '−'}${pf(Math.abs(move))}٪` : 'قیمت روز در دسترس نیست', '/market');
    const pending = db.get("SELECT COUNT(*) AS n FROM ctl_approvals WHERE status='pending'").n;
    sig('approvals', 0.8, true, pending * 0.25, pending ? `${fa(pending)} درخواست منتظر تأیید شماست` : 'درخواست تأییدی منتظر نیست', '/books/control?t=approvals');
    const avail = signals.filter((s) => s.available);
    const wsum = avail.reduce((a, s) => a + s.weight, 0) || 1;
    const avg = avail.reduce((a, s) => a + s.weight * s.score, 0) / wsum;
    const S = Math.max(avg, 0.8 * Math.max(0, ...avail.map((s) => s.score)));
    const coverage = signals.reduce((a, s) => a + (s.available ? s.weight : 0), 0) / signals.reduce((a, s) => a + s.weight, 0);
    const decision = typedChoice(['calm', 'watch', 'alarm'], [1.5 - 6 * S, 1 - 4 * Math.abs(S - 0.45), 6 * S - 3.5], { coverage, ordered: true });
    const drivers = [...signals].sort((a, b) => b.score * b.weight - a.score * a.weight);
    const worst = drivers.filter((s) => s.available && s.score > 0.15);
    const lead = { calm: 'فروشگاه آرام است', watch: 'به چند مورد نگاه کنید', alarm: 'هشدار' }[decision.choice];
    const sentence = decision.choice === 'calm'
      ? `${lead}: ${[signals.find((s) => s.key === 'liquidity').text, signals.find((s) => s.key === 'exceptions').text, `امروز ${fa(t.docsThatDay)} سند قطعی`].join('؛ ')}.`
      : `${lead}: ${worst.slice(0, 2).map((s) => s.text).join('؛ و ') || drivers[0].text}.`;
    return { ...decision, state: decision.choice, sentence, score: Math.round(S * 1000) / 1000, drivers: drivers.map(({ key, weight, available, score, text, href }) => ({ key, weight, available, score: Math.round(score * 1000) / 1000, text, href })), at: now() };
  }
  on('GET', '/api/books/control/pulse', 'auth', ({ user }) => (guardAdmin(user), pulse()));

  /* ------------------------------------------------------------------ چه تغییر کرد؟ */
  function changes(user, sinceParam) {
    const seen = db.get('SELECT at FROM ctl_seen WHERE user_id=?', user.id)?.at;
    const floor = new Date(Date.now() - 7 * DAY).toISOString();
    const since = sinceParam && !Number.isNaN(Date.parse(sinceParam)) ? new Date(sinceParam).toISOString() : seen && seen > floor ? seen : new Date(Date.now() - DAY).toISOString();
    const items = [];
    const add = (weight, icon, title, detail, href) => items.push({ weight, icon, title, detail, href });
    const docs = db.all("SELECT id, type, fy, no, date, party_id, calc_json, created_by, created_at, status FROM bk_docs WHERE created_at>=? AND status<>'draft'", since);
    if (docs.length) {
      const net = docs.filter((d) => d.status === 'final').reduce((s, d) => s + Math.abs(JSON.parse(d.calc_json).net ?? 0), 0);
      add(1 + Math.min(2, docs.length / 20), 'doc', `${fa(docs.length)} سند تازه`, `جمع گردش ${R(net)}`, '/books/day');
    }
    // the biggest trades, measured against the last 90 days
    const hist = db.all("SELECT calc_json FROM bk_docs WHERE status='final' AND type='trade' AND date>=?", addDays(tehranDay(), -90)).map((r) => Math.abs(JSON.parse(r.calc_json).net ?? 0) + Math.abs(JSON.parse(r.calc_json).buys ?? 0));
    const big = Math.max(quantile(hist, 0.9), 1);
    for (const d of docs.filter((x) => x.type === 'trade' && x.status === 'final')) {
      const c = JSON.parse(d.calc_json);
      const size = Math.abs(c.net ?? 0) + Math.abs(c.buys ?? 0);
      if (size >= big && hist.length >= 5) add(2 + Math.min(2, size / big / 2), 'big', 'معامله بزرگ', `${track(d)}${d.party_id ? ` · ${partyLabel(d.party_id)}` : ''}: ${R(size)}`, `/books/doc/${d.id}`);
    }
    for (const v of db.all("SELECT v.doc_id, v.version, v.status, v.reason, v.at, d.type, d.fy, d.no FROM bk_versions v JOIN bk_docs d ON d.id=v.doc_id WHERE v.at>=? AND v.version>1 AND v.reason<>'قطعی شد'", since)) add(v.status === 'void' ? 3 : 2, v.status === 'void' ? 'void' : 'edit', v.status === 'void' ? 'ابطال سند' : 'ویرایش سند', `${track(v)}: «${v.reason || 'بی‌دلیل'}»`, `/books/doc/${v.doc_id}`);
    // cash and gold moved by what was booked since
    const moved = db.get("SELECT SUM(CASE WHEN p.acct LIKE 'cash:%' THEN p.amt ELSE 0 END) AS cash, SUM(CASE WHEN p.acct='gold' THEN p.amt ELSE 0 END) AS gold FROM bk_postings p JOIN bk_docs d ON d.id=p.src WHERE d.updated_at>=?", since);
    if (Math.abs(moved.cash ?? 0) >= 1) add(1.5, 'cash', `نقد ${moved.cash > 0 ? 'افزایش' : 'کاهش'} یافت`, `${moved.cash > 0 ? '+' : '−'}${R(Math.abs(moved.cash))} در صندوق‌ها`, '/books/cash');
    if (Math.abs(moved.gold ?? 0) >= 0.001) add(1.5, 'gold', `طلای آبشده ${moved.gold > 0 ? 'افزایش' : 'کاهش'} یافت`, `${moved.gold > 0 ? '+' : '−'}${G(Math.abs(moved.gold))} ۷۵۰`, '/books/vault');
    // price since then
    try {
      const s = market.series(['mesghal'], addDays(tehranDayOf(since), -5)).series.mesghal ?? [];
      const then = [...s].reverse().find((r) => r[0] <= tehranDayOf(since))?.[4];
      const nowP = s.at(-1)?.[4];
      if (then && nowP && then !== nowP) {
        const pct = ((nowP - then) / then) * 100;
        add(Math.abs(pct) >= 2 ? 3 : 1, 'price', `مظنه ${pct > 0 ? 'بالا' : 'پایین'} رفت`, `${pct > 0 ? '+' : '−'}${pf(Math.abs(pct))}٪ از ${R(then * 10)} به ${R(nowP * 10)}`, '/market');
      }
    } catch {
      /* no market */
    }
    const ex = exceptions().items.filter((x) => x.sev !== 'low' && (!x.date || x.date >= tehranDayOf(since)));
    if (ex.length) add(2.5 + Math.min(2, ex.length / 3), 'alert', `${fa(ex.length)} استثنای تازه`, ex.slice(0, 2).map((x) => x.title).join('، '), '/books/control?t=exceptions');
    const pend = db.all("SELECT summary FROM ctl_approvals WHERE status='pending' AND requested_at>=?", since);
    if (pend.length) add(3, 'approve', `${fa(pend.length)} درخواست تأیید`, pend[0].summary, '/books/control?t=approvals');
    for (const c of db.all('SELECT day, signer_name, created_at, reopened_at, reopen_reason FROM bk_closes WHERE created_at>=? OR reopened_at>=?', since, since)) add(c.reopened_at ? 2.5 : 1, 'close', c.reopened_at ? 'روز بسته دوباره باز شد' : 'روز بسته شد', c.reopened_at ? `${jd(c.day)}: «${c.reopen_reason}»` : `${jd(c.day)} با امضای ${c.signer_name}`, '/books/smart?t=close');
    const recon = db.all('SELECT day, issues FROM ctl_recon WHERE at>=? AND issues>0', since);
    for (const r of recon) add(2.5, 'recon', 'مغایرت در تطبیق شبانه', `${jd(r.day)}: ${fa(r.issues)} مغایرت`, '/books/control?t=close');
    items.sort((a, b) => b.weight - a.weight);
    return { since, first: !seen, items: items.slice(0, 8), more: Math.max(0, items.length - 8) };
  }
  on('GET', '/api/books/control/changes', 'auth', ({ user, url }) => (guardAdmin(user), changes(user, url.searchParams.get('since'))));
  on('POST', '/api/books/control/changes/seen', 'auth', ({ user }) => {
    guardAdmin(user);
    db.run('INSERT INTO ctl_seen(user_id,at) VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET at=excluded.at', user.id, now());
    return { ok: true };
  });

  /* ------------------------------------------------------------------ شبیه‌ساز معامله و محاسبه فروش امن */
  function simulate(user, body) {
    const today = tehranDay();
    const doc = { type: 'trade', date: today, partyId: body.partyId || null, lines: Array.isArray(body.lines) ? body.lines.slice(0, 40) : [], payments: Array.isArray(body.payments) ? body.payments.slice(0, 20) : [] };
    if (!doc.lines.length && !doc.payments.length) throw bad('دست‌کم یک ردیف یا پرداخت وارد کنید.');
    let calc;
    try {
      calc = TR.calcTrade(doc, { round: settings().tradeRound ?? 10000 });
    } catch (e) {
      throw bad(e.message);
    }
    const party = doc.partyId ? partyRow(doc.partyId) : null;
    if (doc.partyId && !party) throw notFound('مشتری پیدا نشد.');
    // the same engine that books a document tells what it would post; the twin says what is there now
    const post = B.postings({ ...doc, partyId: doc.partyId }, calc);
    const before = balancesAt(today);
    const after = new Map([...before].map(([k, v]) => [k, { ...v }]));
    for (const p of post) {
      const u = after.get(p.acct) ?? {};
      u[p.unit] = (u[p.unit] ?? 0) + p.amt;
      after.set(p.acct, u);
    }
    const sumPrefix = (m, pre, unit = 'IRR') => [...m].filter(([a]) => a.startsWith(pre)).reduce((s, [, u]) => s + (u[unit] ?? 0), 0);
    const v = (m, acct, unit) => m.get(acct)?.[unit] ?? 0;
    const state = (m) => ({
      cash: Math.round(sumPrefix(m, 'cash:')),
      bank: Math.round(sumPrefix(m, 'bank:')),
      gold: r3(v(m, 'gold', 'G750')),
      coins: Object.fromEntries([...m].filter(([a]) => a.startsWith('coin:')).map(([a, u]) => [a.slice(5), Object.values(u)[0] ?? 0])),
      party: party ? Object.fromEntries(Object.entries(m.get(`party:${party.id}`) ?? {}).filter(([, x]) => Math.abs(x) > 1e-9).map(([u, x]) => [u, u === 'IRR' ? Math.round(x) : r3(x)])) : null,
    });
    const b = state(before), a = state(after);
    const checks = [];
    const check = (key, level, ok, text, available = true) => checks.push({ key, level: ok ? 'ok' : level, ok, text, available });
    // 1. stock: nothing in the vault may go below zero
    const short = post.filter((p) => /^(gold|coin:|bar:|fx:)/.test(p.acct) && p.amt < 0).map((p) => ({ acct: p.acct, have: v(before, p.acct, p.unit), after: v(after, p.acct, p.unit), unit: p.unit })).filter((x) => x.after < -1e-9);
    check('stock', 'stop', !short.length, short.length ? `موجودی کافی نیست: ${short.map((x) => `${x.acct === 'gold' ? 'طلای آبشده' : x.acct} موجود ${x.acct === 'gold' ? G(x.have) : fa(x.have)}`).join('، ')}` : 'موجودی برای تحویل کافی است');
    // 2. cash drawer never negative
    // only what THIS trade does to the drawer: an already negative drawer is the exceptions centre's business
    const cashNeg = [...after].filter(([k, u]) => k.startsWith('cash:') && (u.IRR ?? 0) < -1 && (u.IRR ?? 0) < (before.get(k)?.IRR ?? 0));
    check('cash', 'stop', !cashNeg.length, cashNeg.length ? `صندوق نقد منفی می‌شود (${R(cashNeg[0][1].IRR)})؛ از بانک پرداخت کنید یا کمتر بپردازید` : 'این معامله صندوق نقد را منفی نمی‌کند');
    // 3. selling below cost and margin (next lots out, FIFO)
    const lots = buildLots(finalEvents(today));
    const openByUnit = {};
    for (const l of lots.lots) if (l.remaining > 1e-9) (openByUnit[l.unit] ??= []).push(l);
    const minMargin = (settings().minMarginPct ?? 0.5) / 100;
    let costOut = 0, valueOut = 0, anyCost = false;
    for (const l of calc.lines ?? []) {
      if (!l.priced || l.dir !== 'out') continue;
      const unit = l.kind === 'melt' || l.kind === 'bar' ? 'G750' : l.unit;
      let q = l.kind === 'melt' || l.kind === 'bar' ? l.eq750 : l.amt;
      let cost = 0;
      for (const lot of openByUnit[unit] ?? []) {
        if (q <= 1e-9) break;
        const use = Math.min(q, lot.remaining);
        cost += (lot.cost * use) / lot.qty;
        q -= use;
      }
      if (q > 1e-9) continue; // not in lots: the stock check already stops it
      anyCost = true;
      costOut += cost;
      valueOut += l.value - (l.fee ?? 0);
    }
    const profit = Math.round(valueOut - costOut);
    if (anyCost) {
      const margin = costOut ? profit / costOut : 0;
      check('cost', 'stop', profit >= 0, profit >= 0 ? `بالاتر از بهای تمام‌شده؛ سود تقریبی ${R(profit)}` : `زیر بهای تمام‌شده: زیان ${R(-profit)} (بها ${R(costOut)})`);
      if (profit >= 0) check('margin', 'caution', margin >= minMargin, margin >= minMargin ? `حاشیه سود ${pf(margin * 100, 2)}٪` : `حاشیه سود فقط ${pf(margin * 100, 2)}٪ (کمتر از ${pf(minMargin * 100, 2)}٪)`);
    }
    // 4. price against the live board
    const lp = livePrices();
    for (const l of calc.lines ?? []) {
      if (!l.priced) continue;
      if (l.kind === 'melt' && lp.mazaneh && B.num(l.mazaneh)) {
        const dev = (B.num(l.mazaneh) - lp.mazaneh) / lp.mazaneh;
        const bad2 = l.dir === 'out' ? dev < -0.01 : dev > 0.01;
        check('price', 'caution', !bad2, bad2 ? `مظنه ${l.dir === 'out' ? 'فروش' : 'خرید'} ${pf(dev * 100)}٪ با تابلو فاصله دارد (${R(lp.mazaneh)})` : `مظنه نزدیک تابلوست (${pf(dev * 100)}٪)`, !lp.sample);
      } else if (l.kind === 'coin') {
        const bp = lp.price[`COIN:${l.coin}`];
        const unitPrice = l.amt ? l.value / l.amt : 0;
        if (bp && unitPrice) {
          const dev = (unitPrice - bp) / bp;
          const bad2 = l.dir === 'out' ? dev < -0.01 : dev > 0.01;
          check('price', 'caution', !bad2, bad2 ? `قیمت هر ${unitName(l.unit)} ${pf(dev * 100)}٪ با تابلو فاصله دارد` : `قیمت سکه نزدیک تابلوست`, !lp.sample);
        }
      }
    }
    // 5. cash for tomorrow
    let fc = null;
    try {
      fc = call('GET', '/api/books/forecast', SYS);
    } catch {
      /* none */
    }
    if (fc && fc.activeSamples >= 2) {
      const ok = a.cash >= fc.cash.p90;
      check('liquidity', a.cash < fc.cash.p50 ? 'stop' : 'caution', ok, ok ? `پس از معامله ${R(a.cash)} نقد می‌ماند؛ برای فردا کافی است` : `پس از معامله ${R(a.cash)} نقد می‌ماند ولی فردا تا ${R(fc.cash.p90)} لازم می‌شود`);
    } else check('liquidity', 'caution', true, 'سابقه کافی برای سنجش نقد فردا نیست', false);
    // 6. the customer's credit
    if (party) {
      const owe = a.party?.IRR ?? 0;
      if (party.credit_limit > 0) check('credit', owe > party.credit_limit * 1.2 ? 'stop' : 'caution', owe <= party.credit_limit, owe <= party.credit_limit ? `بدهی مشتری در سقف اعتبار می‌ماند (${R(owe)} از ${R(party.credit_limit)})` : `بدهی مشتری به ${R(owe)} می‌رسد؛ بالاتر از سقف ${R(party.credit_limit)}`);
      else if (owe > 0) check('credit', 'caution', owe <= (b.party?.IRR ?? 0), owe > (b.party?.IRR ?? 0) ? `مشتری سقف اعتبار ندارد و ${R(owe)} بدهکار می‌شود` : 'بدهی مشتری بیشتر نمی‌شود');
    }
    // 7. who owes what: a sale with neither a customer nor a payment leaves the money on nobody
    if (!party && (calc.credit ?? 0) > 0) check('unpaid', 'caution', false, `${R(calc.credit)} دریافت نشده و مشتری مشخص نیست؛ مشتری را انتخاب کنید یا پرداخت را ثبت کنید`);
    // 8. a locked day or month
    const locked = lockOf(today);
    const closedToday = db.get('SELECT 1 AS x FROM bk_closes WHERE day=? AND reopened_at IS NULL', today);
    check('lock', 'stop', !locked && !closedToday, locked ? `ماه ${locked} قفل است` : closedToday ? 'امروز بسته شده است' : 'روز و ماه باز است');
    const avail = checks.filter((c) => c.available);
    const stops = avail.filter((c) => c.level === 'stop').length, cautions = avail.filter((c) => c.level === 'caution').length;
    const verdict = typedChoice(['safe', 'caution', 'stop'], [1.5 - cautions * 0.8 - stops * 3, 0.2 + cautions * 1.2 - stops * 0.5, -2 + stops * 4], { coverage: avail.length / checks.length, ordered: true });
    return {
      saved: false,
      verdict,
      summary: { stop: 'این معامله را این‌طور ثبت نکنید', caution: 'با احتیاط؛ موارد زرد را ببینید', safe: 'امن است' }[verdict.choice],
      before: b, after: a,
      delta: { cash: a.cash - b.cash, bank: a.bank - b.bank, gold: r3(a.gold - b.gold), coins: Object.fromEntries([...new Set([...Object.keys(a.coins), ...Object.keys(b.coins)])].map((k) => [k, (a.coins[k] ?? 0) - (b.coins[k] ?? 0)]).filter(([, x]) => x)) },
      profit: anyCost ? { value: Math.round(valueOut), cost: Math.round(costOut), profit, method: 'FIFO سری‌ها' } : null,
      checks,
      calc: { buys: calc.buys, sells: calc.sells, net: calc.net, paidIn: calc.paidIn, paidOut: calc.paidOut, credit: calc.credit, goods: calc.goods, lines: (calc.lines ?? []).map((l) => ({ kind: l.kind, dir: l.dir, priced: l.priced, eq750: l.eq750, amt: l.amt, unit: l.unit, value: l.value })) },
    };
  }
  on('POST', '/api/books/control/simulate', 'auth', ({ user, body }) => simulate(user, body));

  /* ------------------------------------------------------------------ سری‌ها و ردیابی هر گرم */
  on('GET', '/api/books/control/lots', 'auth', ({ user, url }) => {
    guardAdmin(user);
    const r = buildLots(finalEvents(tehranDay()));
    const unit = url.searchParams.get('unit');
    const q = String(url.searchParams.get('q') ?? '').trim().toUpperCase().replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
    let lots = r.lots;
    if (unit) lots = lots.filter((l) => l.unit === unit);
    if (url.searchParams.get('open') === '1') lots = lots.filter((l) => l.remaining > 1e-9);
    if (q) lots = lots.filter((l) => l.id.includes(q) || (l.serial ?? '').toUpperCase().includes(q) || l.out.some((o) => o.track?.includes(q)));
    return { units: r.units, lots: lots.slice(-300).reverse(), shortfalls: r.shortfalls.slice(-50), method: 'FIFO' };
  });

  /* ------------------------------------------------------------------ تایم‌لاین دفتر کل و داستان مشتری */
  const KIND_FA = { invoice: 'فاکتور', delivery: 'تحویل/دریافت جنس', payment: 'پرداخت/دریافت', correction: 'اصلاحیه', void: 'ابطال', opening: 'مانده افتتاحیه', adjust: 'اصلاح موجودی', transfer: 'حواله', convert: 'تبدیل', cheque: 'چک' };
  function partyStory(id) {
    const p = partyRow(id);
    if (!p) throw notFound('مشتری پیدا نشد.');
    const v = call('GET', '/api/books/parties/:id', SYS, { params: { id } });
    const events = [];
    const docs = db.all('SELECT * FROM bk_docs WHERE party_id=? OR id IN (SELECT DISTINCT src FROM bk_postings WHERE acct=?) ORDER BY date, COALESCE(issued_at, created_at)', id, `party:${id}`);
    for (const d of docs) {
      const data = JSON.parse(d.data_json), c = JSON.parse(d.calc_json);
      const base = { date: d.date, at: d.issued_at ?? d.created_at, doc: docLink(d), status: d.status };
      if (d.type === 'trade') {
        const priced = (c.lines ?? []).filter((l) => l.priced), goods = (c.lines ?? []).filter((l) => !l.priced);
        if (priced.length) events.push({ ...base, kind: 'invoice', text: priced.map((l) => `${l.dir === 'in' ? 'خرید از او' : 'فروش به او'} ${l.kind === 'melt' || l.kind === 'bar' ? `${G(l.eq750)} ۷۵۰` : amtText(l.unit, l.amt)} به ${R(l.value)}`).join('، ') });
        if (goods.length) events.push({ ...base, kind: 'delivery', text: goods.map((l) => `${l.dir === 'in' ? 'دریافت' : 'تحویل'} ${l.kind === 'melt' ? `${G(l.eq750)} ۷۵۰` : amtText(l.unit, l.amt)}`).join('، ') });
        const pays = (data.payments ?? []).filter((x) => B.num(x.amount));
        if (pays.length) events.push({ ...base, kind: 'payment', text: pays.map((x) => `${x.dir === 'in' ? 'دریافت' : 'پرداخت'} ${R(B.num(x.amount))} (${B.payMethod(x.method)?.label ?? x.method})`).join('، ') });
      } else if (['receipt', 'payment'].includes(d.type)) events.push({ ...base, kind: 'payment', text: `${B.DOC_TYPES[d.type]?.label ?? d.type}: ${R(Math.abs(c.net ?? 0) * (d.type === 'trade' ? 1 : 10))}` });
      else if (d.type === 'hawala') events.push({ ...base, kind: 'transfer', text: 'حواله بین مشتریان' });
      else if (d.type === 'convert') events.push({ ...base, kind: 'convert', text: `تبدیل مانده جنسی به ریال: ${R(c.convert?.value ?? 0)}` });
      else if (d.type === 'opening') events.push({ ...base, kind: 'opening', text: 'مانده ابتدای دفتر' });
      else events.push({ ...base, kind: 'invoice', text: `${B.DOC_TYPES[d.type]?.label ?? d.type}: ${R(Math.abs(c.net ?? 0) * 10)}` });
      for (const ver of db.all("SELECT version, status, reason, at FROM bk_versions WHERE doc_id=? AND version>1 AND reason<>'قطعی شد' ORDER BY version", d.id)) events.push({ date: tehranDayOf(ver.at), at: ver.at, doc: docLink(d), kind: ver.status === 'void' ? 'void' : 'correction', text: `${ver.status === 'void' ? 'ابطال' : `نسخه ${fa(ver.version)}`}: «${ver.reason}»` });
    }
    for (const q of db.all('SELECT * FROM bk_cheques WHERE party_id=? ORDER BY created_at', id)) events.push({ date: tehranDayOf(q.created_at), at: q.created_at, kind: 'cheque', text: `چک ${q.dir === 'in' ? 'دریافتی' : 'پرداختی'} ${R(q.amount)} سررسید ${jd(q.due)} (${q.status})` });
    events.sort((x, y) => String(x.at).localeCompare(String(y.at)));
    for (const e of events) e.label = KIND_FA[e.kind] ?? e.kind;
    // behaviour: rhythm, how they pay, how fast debts are settled (FIFO), debt trend
    const trades = docs.filter((d) => d.status === 'final' && d.type === 'trade');
    const days = [...new Set(trades.map((d) => d.date))].sort();
    const gaps = days.slice(1).map((d, i) => daysBetween(days[i], d));
    const methods = {};
    for (const d of trades) for (const x of JSON.parse(d.data_json).payments ?? []) methods[x.method] = (methods[x.method] ?? 0) + 1;
    const topMethod = Object.entries(methods).sort((x, y) => y[1] - x[1])[0];
    const irr = v.statement.filter((r) => r.unit === 'IRR');
    const queue = [];
    const settle = [];
    for (const r of irr) {
      if (r.amt > 0) queue.push({ date: r.date, left: r.amt });
      else {
        let pay = -r.amt;
        while (pay > 0.5 && queue.length) {
          const q0 = queue[0];
          const use = Math.min(pay, q0.left);
          q0.left -= use;
          pay -= use;
          if (q0.left <= 0.5) settle.push(daysBetween(q0.date, r.date)), queue.shift();
        }
      }
    }
    const oldest = queue[0]?.date ?? null;
    const bal = v.balance ?? {};
    const ninety = irr.filter((r) => r.date >= addDays(tehranDay(), -90));
    const trend = ninety.length >= 2 ? ninety.at(-1).balance - ninety[0].balance + ninety[0].amt : 0;
    const behaviour = {
      since: days[0] ?? null, trades: trades.length, lastVisit: days.at(-1) ?? null,
      everyDays: gaps.length ? Math.round(median(gaps)) : null,
      method: topMethod ? { id: topMethod[0], label: B.payMethod(topMethod[0])?.label ?? topMethod[0], n: topMethod[1], of: Object.values(methods).reduce((a2, b2) => a2 + b2, 0) } : null,
      settleDays: settle.length ? Math.round(median(settle)) : null,
      openDebtSince: oldest, openDebtDays: oldest ? daysBetween(oldest, tehranDay()) : 0,
      debtTrend90: Math.round(trend),
      creditLimit: p.credit_limit,
    };
    const bits = [];
    if (behaviour.since) bits.push(`از ${jd(behaviour.since)} با شما کار می‌کند و ${fa(behaviour.trades)} معامله داشته`);
    if (behaviour.everyDays) bits.push(`معمولاً هر ${fa(behaviour.everyDays)} روز یک بار می‌آید`);
    if (behaviour.method) bits.push(`بیشتر با ${behaviour.method.label} پرداخت می‌کند`);
    if (behaviour.settleDays != null) bits.push(`بدهی‌هایش را به‌طور میانه ${fa(behaviour.settleDays)} روزه تسویه می‌کند`);
    const owe = bal.IRR ?? 0;
    if (owe > 0) bits.push(`اکنون ${R(owe)} بدهکار است${oldest ? ` که قدیمی‌ترینش از ${fa(behaviour.openDebtDays)} روز پیش مانده` : ''}`);
    else if (owe < 0) bits.push(`اکنون ${R(-owe)} از شما طلبکار است`);
    const goods = Object.entries(bal).filter(([u, x]) => u !== 'IRR' && x);
    if (goods.length) bits.push(`مانده جنسی: ${goods.map(([u, x]) => `${amtText(u, Math.abs(x))} ${x > 0 ? 'بدهکار' : 'بستانکار'}`).join('، ')}`);
    return { party: { id: p.id, label: TR.partyLabel(p), code: p.code, mobile: p.mobile }, story: bits.length ? `${bits.join('؛ ')}.` : 'هنوز داستانی ثبت نشده است.', behaviour, balance: bal, events: events.slice(-400), statement: v.statement.slice(-200) };
  }
  function itemTimeline(unit) {
    const acct = unit === 'G750' ? 'gold' : unit.startsWith('COIN:') ? `coin:${unit.slice(5)}` : unit.startsWith('FX:') ? `fx:${unit.slice(3)}` : unit.startsWith('BAR:') ? `bar:${unit.slice(4)}` : null;
    if (!acct) throw bad('کالای نامعتبر.');
    let run = 0;
    const rows = db.all("SELECT p.src, SUM(p.amt) AS amt, MIN(p.date) AS date, d.type, d.fy, d.no, d.party_id, d.id, COALESCE(d.issued_at, d.created_at) AS at FROM bk_postings p LEFT JOIN bk_docs d ON d.id=p.src WHERE p.acct=? GROUP BY p.src ORDER BY date, at", acct).map((r) => {
      run += r.amt;
      return { date: r.date, doc: r.id ? docLink(r) : null, party: partyLabel(r.party_id), kind: r.amt > 0 ? 'in' : 'out', label: r.amt > 0 ? 'ورود' : 'خروج', what: r.type ? B.DOC_TYPES[r.type]?.label ?? r.type : 'چک', amt: unit === 'G750' ? r3(r.amt) : r.amt, balance: unit === 'G750' ? r3(run) : Math.round(run * 100) / 100 };
    });
    return { unit, name: unitName(unit), events: rows.slice(-500), balance: unit === 'G750' ? r3(run) : run };
  }
  on('GET', '/api/books/control/story', 'auth', ({ user, url }) => {
    guardAdmin(user);
    const party = url.searchParams.get('party');
    const unit = url.searchParams.get('unit');
    if (party) return partyStory(party);
    if (unit) return itemTimeline(unit);
    throw bad('مشتری یا کالا را مشخص کنید.');
  });

  /* ------------------------------------------------------------------ تراز دوتایی: وزنی و ریالی جدا */
  function trial(day) {
    const bal = balancesAt(day);
    const titles = accountTitles();
    const cards = barCards();
    const group = (acct) => (acct === 'gold' || /^(coin|bar|fx):/.test(acct) ? 'vault' : /^(cash|bank):/.test(acct) ? 'money' : acct.startsWith('chq:') ? 'cheque' : acct.startsWith('party:') ? 'party' : 'other');
    const GROUP_FA = { vault: 'گاوصندوق', money: 'صندوق و بانک', cheque: 'چک‌های در جریان', party: 'مشتریان', other: 'سایر حساب‌ها' };
    const rows = [];
    const agg = { cheque: { rial: 0 } };
    const parties = { debit: { rial: 0, g750: 0, n: 0 }, credit: { rial: 0, g750: 0, n: 0 } };
    for (const [acct, u] of bal) {
      const g = group(acct);
      const weight = { g750: 0, pure: 0, count: {}, bars: [] };
      let rial = 0;
      for (const [unit, v] of Object.entries(u)) {
        if (unit === 'IRR') rial += v;
        else if (unit === 'G750') (weight.g750 += v), (weight.pure += v * 0.75);
        else if (unit.startsWith('BAR:') || acct.startsWith('bar:')) {
          const c = cards.get(unit.startsWith('BAR:') ? unit.slice(4) : acct.slice(4));
          const g750 = c ? (c.weight * c.fineness) / 750 : 0;
          weight.g750 += v * g750;
          weight.pure += c ? v * ((c.weight * c.fineness) / 1000) : 0;
          weight.bars.push(unit.startsWith('BAR:') ? unit.slice(4) : acct.slice(4));
        } else weight.count[unit] = (weight.count[unit] ?? 0) + v;
      }
      if (g === 'cheque') {
        agg.cheque.rial += rial;
        continue;
      }
      if (g === 'party') {
        const side = rial > 0 || (rial === 0 && weight.g750 > 0) ? 'debit' : 'credit';
        parties[side].rial += rial;
        parties[side].g750 += weight.g750;
        parties[side].n++;
        continue;
      }
      rows.push({ group: g, groupLabel: GROUP_FA[g], acct, title: acct === 'gold' ? 'طلای آبشده' : acct.startsWith('coin:') ? unitName(`COIN:${acct.slice(5)}`) : acct.startsWith('bar:') ? `شمش ${fa(acct.slice(4))}` : acct.startsWith('fx:') ? unitName(`FX:${acct.slice(3)}`) : titles[acct] ?? acct, rial: Math.round(rial), g750: r3(weight.g750), pure: r3(weight.pure), count: weight.count });
    }
    if (agg.cheque.rial) rows.push({ group: 'cheque', groupLabel: GROUP_FA.cheque, acct: 'chq:*', title: 'چک‌های نزد ما / صادره در جریان', rial: Math.round(agg.cheque.rial), g750: 0, pure: 0, count: {} });
    rows.push({ group: 'party', groupLabel: GROUP_FA.party, acct: 'party:+', title: `مشتریان بدهکار (${fa(parties.debit.n)})`, rial: Math.round(parties.debit.rial), g750: r3(parties.debit.g750), pure: r3(parties.debit.g750 * 0.75), count: {} });
    rows.push({ group: 'party', groupLabel: GROUP_FA.party, acct: 'party:-', title: `مشتریان بستانکار (${fa(parties.credit.n)})`, rial: Math.round(parties.credit.rial), g750: r3(parties.credit.g750), pure: r3(parties.credit.g750 * 0.75), count: {} });
    const totals = { rial: rows.reduce((s, r) => s + r.rial, 0), g750: r3(rows.reduce((s, r) => s + r.g750, 0)), pure: r3(rows.reduce((s, r) => s + r.pure, 0)) };
    return { day, rows, totals, note: 'بعد وزنی (گرم ۷۵۰ و خالص) و بعد ریالی هرگز با هم جمع نمی‌شوند؛ تبدیل فقط با سند «تبدیل».' };
  }
  on('GET', '/api/books/control/trial', 'auth', ({ user, url }) => (guardAdmin(user), trial(DAY_RE.test(url.searchParams.get('day') ?? '') ? url.searchParams.get('day') : tehranDay())));

  /* ------------------------------------------------------------------ پیش‌بینی ساده ۱۰ روزه نقد و طلا */
  function forecast10(horizon = 10) {
    const today = tehranDay();
    const t = twin(today);
    const from = addDays(today, -30);
    const flows = new Map();
    for (const r of db.all("SELECT p.date, SUM(CASE WHEN p.acct LIKE 'cash:%' OR p.acct LIKE 'bank:%' THEN p.amt ELSE 0 END) AS money, SUM(CASE WHEN p.acct='gold' THEN p.amt ELSE 0 END) AS gold FROM bk_postings p WHERE p.date>? AND p.date<=? AND p.src NOT LIKE 'chq:%' AND p.src NOT IN (SELECT id FROM bk_docs WHERE type IN ('opening','adjust')) GROUP BY p.date", from, today)) flows.set(r.date, r);
    const series = Array.from({ length: 30 }, (_, k) => addDays(from, k + 1)).map((d) => ({ money: flows.get(d)?.money ?? 0, gold: flows.get(d)?.gold ?? 0 }));
    const trim = (xs) => {
      const s = [...xs].sort((a, b) => a - b);
      const cut = Math.floor(s.length * 0.1);
      return s.slice(cut, s.length - cut);
    };
    const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
    const sd = (xs) => {
      const m = mean(xs);
      return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
    };
    const mMoney = mean(trim(series.map((s) => s.money))), sMoney = sd(series.map((s) => s.money));
    const mGold = mean(trim(series.map((s) => s.gold))), sGold = sd(series.map((s) => s.gold));
    const cheques = db.all("SELECT dir, amount, due, status, no, party_id FROM bk_cheques WHERE ((dir='in' AND status IN ('hand','deposited')) OR (dir='out' AND status='issued')) AND due<=?", addDays(today, horizon));
    const out = [];
    let money = t.cashTotal + t.bankTotal, gold = t.physicalG750, chq = 0;
    for (let k = 1; k <= horizon; k++) {
      const d = addDays(today, k);
      const due = cheques.filter((c) => (k === 1 ? c.due <= d : c.due === d));
      const dueNet = due.reduce((s, c) => s + (c.dir === 'in' ? c.amount : -c.amount), 0);
      chq += dueNet;
      money += mMoney + dueNet;
      gold += mGold;
      const band = Math.sqrt(k);
      out.push({ day: d, money: Math.round(money), moneyLow: Math.round(money - 1.28 * sMoney * band), moneyHigh: Math.round(money + 1.28 * sMoney * band), gold: r3(gold), goldLow: r3(gold - 1.28 * sGold * band), goldHigh: r3(gold + 1.28 * sGold * band), cheques: due.map((c) => ({ dir: c.dir, amount: c.amount, no: c.no, party: partyLabel(c.party_id) })) });
    }
    return { from: today, now: { money: t.cashTotal + t.bankTotal, gold: t.physicalG750 }, daily: { money: Math.round(mMoney), gold: r3(mGold), basis: '۳۰ روز اخیر، ۱۰٪ بالا و پایین حذف' }, chequesNet: chq, days: out, note: 'تقریبی: میانگین جریان روزانه + چک‌های سررسید؛ بازه ۸۰٪.' };
  }
  on('GET', '/api/books/control/forecast10', 'auth', ({ user }) => (guardAdmin(user), forecast10()));

  /* ------------------------------------------------------------------ «این عدد از کجا آمد؟» */
  function explain(metric, day = tehranDay()) {
    const t = twin(day);
    const lines = (acctLike, unit, limit = 8) => db.all(`SELECT p.src, SUM(p.amt) AS amt, MIN(p.date) AS date, d.type, d.fy, d.no, d.id FROM bk_postings p LEFT JOIN bk_docs d ON d.id=p.src WHERE p.acct LIKE ? AND p.unit=? AND p.date<=? GROUP BY p.src ORDER BY date DESC, p.src DESC LIMIT ${limit}`, acctLike, unit, day).map((r) => ({ label: r.id ? `${track(r)} (${B.DOC_TYPES[r.type]?.short ?? r.type})` : r.src.startsWith('chq:') ? 'چک' : r.src, value: unit === 'G750' ? r3(r.amt) : Math.round(r.amt), date: r.date, href: r.id ? `/books/doc/${r.id}` : null }));
    const p750 = t.prices.price.G750;
    switch (metric) {
      case 'cash':
        return { metric, title: 'نقد صندوق‌ها', value: t.cashTotal, unit: 'IRR', sentence: `${R(t.cashTotal)} جمع مانده ${fa(t.cash.length)} صندوق نقد است؛ هر دریافت نقدی به صندوق اضافه و هر پرداخت نقدی از آن کم شده است.`, formula: 'Σ ثبت‌های حساب‌های cash:* تا پایان روز', parts: t.cash.map((c) => ({ label: c.title, value: c.amount })), recent: lines('cash:%', 'IRR') };
      case 'bank':
        return { metric, title: 'موجودی بانک', value: t.bankTotal, unit: 'IRR', sentence: `${R(t.bankTotal)} جمع مانده حساب‌های بانکی در دفتر است (کارتخوان، کارت به کارت، فیش، چک وصول‌شده).`, formula: 'Σ ثبت‌های bank:*', parts: t.bank.map((c) => ({ label: c.title, value: c.amount })), recent: lines('bank:%', 'IRR') };
      case 'physical':
        return { metric, title: 'طلای فیزیکی', value: t.physicalG750, unit: 'G750', sentence: `${G(t.physicalG750)} ۷۵۰ = ${G(t.gold)} آبشده در گاوصندوق + ${G(t.barG750)} معادل ۷۵۰ از ${fa(t.bars.length)} شمش پلمپ. به قیمت روز ${R(t.value.physical)} می‌ارزد (هر گرم ۷۵۰ ${R(p750)}).`, formula: 'آبشده (gold) + Σ شمش‌ها (وزن × عیار ÷ ۷۵۰)', parts: [{ label: 'آبشده', value: t.gold }, ...t.bars.map((b) => ({ label: `شمش ${fa(b.serial)} (${b.weight ? `${fa(b.weight)} گرم × ${fa(b.fineness)}` : 'بی‌کارت'})`, value: b.g750 }))], recent: lines('gold', 'G750') };
      case 'receivables':
        return { metric, title: 'مطالبات ریالی', value: t.receivable.IRR ?? 0, unit: 'IRR', sentence: `${R(t.receivable.IRR ?? 0)} جمع بدهی ریالی ${fa(t.debtors)} مشتری بدهکار است؛ مانده هر مشتری جدا حساب و فقط مثبت‌ها جمع شده‌اند (طلبکارها کم نمی‌شوند).`, formula: 'Σ max(0, مانده ریالی هر مشتری)', parts: topParties('IRR', 1), recent: [] };
      case 'liabilities':
        return { metric, title: 'بدهی ریالی به مشتریان', value: t.payable.IRR ?? 0, unit: 'IRR', sentence: `${R(t.payable.IRR ?? 0)} جمع طلب ریالی ${fa(t.creditors)} مشتری از فروشگاه است.`, formula: 'Σ max(0, −مانده ریالی هر مشتری)', parts: topParties('IRR', -1), recent: [] };
      case 'net': {
        const rec = t.receivable.G750 ?? 0, pay = t.payable.G750 ?? 0;
        return { metric, title: 'موقعیت خالص طلا', value: t.netGold, unit: 'G750', sentence: `${G(t.netGold)} = ${G(t.physicalG750)} طلای فیزیکی + ${G(rec)} طلبی که مشتریان به طلا بدهکارند − ${G(pay)} طلایی که به مشتریان بدهکاریم (امانت و تعهد). اگر مظنه ۱٪ بالا برود، ارزش این موقعیت حدود ${R(Math.abs(t.netGold * p750 * 0.01))} ${t.netGold >= 0 ? 'بیشتر' : 'کمتر'} می‌شود.`, formula: 'فیزیکی + طلب طلایی − تعهد طلایی (گرم ۷۵۰)', parts: [{ label: 'طلای فیزیکی', value: t.physicalG750 }, { label: 'طلب طلایی از مشتریان', value: rec }, { label: 'تعهد طلایی به مشتریان', value: -pay }], recent: [] };
      }
      case 'pnl': {
        const pr = TR.positionReport(finalEvents(day));
        return { metric, title: 'سود و زیان تحقق‌یافته روز', value: pr.byDay[day] ?? 0, unit: 'IRR', sentence: `سود ${jd(day)} ${R(pr.byDay[day] ?? 0)} است: برای هر فروش، مبلغ فروش منهای میانگین موزون بهای همان کالا در لحظه فروش. خرید سود نمی‌سازد؛ فقط بهای میانگین را عوض می‌کند.`, formula: 'Σ (مبلغ فروش − مقدار × میانگین موزون بها)', parts: Object.entries(pr.positions).map(([k, x]) => ({ label: `${unitName(k)} · میانگین بها ${R(x.qty ? x.cost / x.qty : 0)}`, value: x.realized })), recent: [] };
      }
      case 'networth':
        return { metric, title: 'ارزش خالص فروشگاه', value: t.value.net, unit: 'IRR', sentence: `ارزش خالص با قیمت‌های ${t.live ? 'زنده' : `پایان ${jd(day)}`}: دارایی‌ها منهای بدهی‌ها.`, formula: 'طلا + سکه + نقد/بانک/چک + مطالبات ریالی + طلب جنسی − بدهی ریالی − تعهد جنسی', parts: [{ label: 'طلای فیزیکی', value: t.value.physical }, { label: 'سکه', value: t.value.coins }, { label: 'نقد، بانک و چک', value: t.value.cash }, { label: 'مطالبات ریالی', value: t.value.receivableIrr }, { label: 'طلب جنسی', value: t.value.goodsReceivable }, { label: 'بدهی ریالی', value: -t.value.payableIrr }, { label: 'تعهد جنسی', value: -t.value.goodsPayable }], recent: [] };
      case 'pulse': {
        const pl = pulse();
        return { metric, title: 'نبض طلا', value: pl.probabilities[pl.choice], unit: 'p', sentence: `حکم «${{ calm: 'آرام', watch: 'نیاز به نگاه', alarm: 'هشدار' }[pl.choice]}» با احتمال ${fa(Math.round(pl.probabilities[pl.choice] * 100))}٪ و اطمینان ${fa(Math.round(pl.confidence * 100))}٪؛ ${fa(Math.round(pl.coverage * 100))}٪ نشانه‌ها داده داشتند. هر نشانه امتیاز ۰ تا ۱ دارد؛ میانگین وزنی (یا ۸۰٪ بدترین نشانه) از سه گزینه مجاز فقط یکی را برمی‌گزیند.`, formula: 'S = max(Σwᵢsᵢ/Σwᵢ, 0.8·max sᵢ) → softmax(آرام، نگاه، هشدار)', parts: pl.drivers.map((d) => ({ label: `${d.text}${d.available ? '' : ' (بی‌داده)'}`, value: d.score, weight: d.weight })), recent: [] };
      }
      default:
        if (String(metric).startsWith('party:')) {
          const s = partyStory(metric.slice(6));
          return { metric, title: s.party.label, value: s.balance.IRR ?? 0, unit: 'IRR', sentence: s.story, formula: 'Σ ثبت‌های حساب همین مشتری به تفکیک واحد', parts: Object.entries(s.balance).map(([u, x]) => ({ label: unitName(u), value: x })), recent: s.statement.slice(-8).reverse().map((r) => ({ label: r.doc ? r.doc.track : 'مانده', value: r.amt, date: r.date, unit: r.unit, href: r.doc ? `/books/doc/${r.doc.id}` : null })) };
        }
        throw bad('این عدد توضیح ندارد.');
    }
  }
  function topParties(unit, sign) {
    return db.all("SELECT acct, SUM(amt) AS s FROM bk_postings WHERE acct LIKE 'party:%' AND unit=? GROUP BY acct HAVING SUM(amt)*?>0.5 ORDER BY ABS(SUM(amt)) DESC LIMIT 8", unit, sign).map((r) => ({ label: partyLabel(r.acct.slice(6)) ?? r.acct, value: Math.round(Math.abs(r.s)), href: `/books/party/${r.acct.slice(6)}` }));
  }
  on('GET', '/api/books/control/explain', 'auth', ({ user, url }) => {
    guardAdmin(user);
    const day = DAY_RE.test(url.searchParams.get('day') ?? '') ? url.searchParams.get('day') : tehranDay();
    return explain(String(url.searchParams.get('metric') ?? ''), day);
  });

  /* ------------------------------------------------------------------ فرمان سریع */
  on('GET', '/api/books/control/find', 'auth', ({ user, url }) => {
    const q = String(url.searchParams.get('q') ?? '').trim().slice(0, 80);
    if (q.length < 2) return { items: [] };
    const items = [];
    try {
      for (const p of call('GET', '/api/books/parties', user, { query: { q } }).items.slice(0, 5)) items.push({ kind: 'party', title: p.label, sub: `کد ${fa(p.code)}${p.balance?.IRR ? ` · ${R(Math.abs(p.balance.IRR))} ${p.balance.IRR > 0 ? 'بدهکار' : 'بستانکار'}` : ''}`, href: `/books/party/${p.id}` });
    } catch {
      /* no parties */
    }
    if (/[0-9۰-۹]/.test(q)) {
      try {
        for (const d of call('GET', '/api/books/trace', user, { query: { q } }).items.slice(0, 5)) items.push({ kind: 'doc', title: `${d.track ?? ''} ${B.DOC_TYPES[d.type]?.label ?? ''}`.trim(), sub: `${jd(d.date ?? '')}${d.party ? ` · ${d.party.label ?? d.party}` : ''}`, href: `/books/doc/${d.id}` });
      } catch {
        /* nothing traced */
      }
    }
    for (const h of knowledge().search(q, 3)) items.push({ kind: 'help', title: h.title, sub: `${h.kind}: ${h.snippet.slice(0, 80)}`, href: h.url });
    return { items };
  });

  /* ------------------------------------------------------------------ قفل دوره مالی (spec #10) */
  const monthOf = (day) => {
    const [y, m] = jalaliOf(day);
    return `${y}-${String(m).padStart(2, '0')}`;
  };
  const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
  const lockOf = (day) => {
    const m = monthOf(day);
    return db.get('SELECT month FROM ctl_locks WHERE month=? AND unlocked_at IS NULL', m) ? m : null;
  };
  const monthFa = (m) => {
    const [y, mm] = m.split('-').map(Number);
    return `${['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'][mm - 1]} ${fa(y)}`;
  };
  function periods() {
    const cur = monthOf(tehranDay());
    const counts = new Map();
    for (const r of db.all("SELECT date, COUNT(*) AS n FROM bk_docs WHERE status='final' GROUP BY date")) {
      const m = monthOf(r.date);
      counts.set(m, (counts.get(m) ?? 0) + r.n);
    }
    const locks = new Map(db.all('SELECT * FROM ctl_locks').map((r) => [r.month, r]));
    const months = [...new Set([...counts.keys(), ...locks.keys(), cur])].sort().reverse().slice(0, 24);
    return { current: cur, months: months.map((m) => ({ month: m, label: monthFa(m), docs: counts.get(m) ?? 0, current: m === cur, locked: !!(locks.get(m) && !locks.get(m).unlocked_at), lock: locks.get(m) ?? null })) };
  }
  on('GET', '/api/books/control/periods', 'auth', ({ user }) => (guardAdmin(user), periods()));
  on('POST', '/api/books/control/periods/lock', 'auth', ({ user, body }) => {
    guardAdmin(user);
    const m = String(body.month ?? '');
    if (!MONTH_RE.test(m)) throw bad('ماه را به شکل ۱۴۰۵-۰۶ انتخاب کنید.');
    if (m >= monthOf(tehranDay())) throw bad('فقط ماه‌های تمام‌شده قفل می‌شوند.');
    db.run('INSERT INTO ctl_locks(month,locked_by,locked_at) VALUES (?,?,?) ON CONFLICT(month) DO UPDATE SET locked_by=excluded.locked_by, locked_at=excluded.locked_at, unlocked_at=NULL, unlocked_by=NULL, reason=NULL', m, user.id, now());
    log(user, 'period.lock', m, {});
    return periods();
  });
  on('POST', '/api/books/control/periods/unlock', 'auth', ({ user, body }) => {
    if (user.role !== 'owner') throw forbid('باز کردن دوره قفل‌شده فقط با مالک است.');
    const m = String(body.month ?? '');
    const reason = txt(body.reason, 300);
    if (!db.get('SELECT 1 AS x FROM ctl_locks WHERE month=? AND unlocked_at IS NULL', m)) throw notFound('این ماه قفل نیست.');
    if (reason.length < 3) throw bad('دلیل باز کردن دوره را بنویسید؛ در دفتر رویداد می‌ماند.');
    const ap = gate(user, 'unlock', { month: m }, body.approval, `باز کردن قفل ${monthFa(m)}: «${reason}»`, m);
    db.tx(() => {
      db.run('UPDATE ctl_locks SET unlocked_at=?, unlocked_by=?, reason=? WHERE month=?', now(), user.id, reason, m);
      if (ap) useApproval(ap);
      log(user, 'period.unlock', m, { reason });
    });
    return periods();
  });

  /* ------------------------------------------------------------------ موتور تأیید و کنترل چهار چشم (spec #11) */
  const RULES_FA = { void: 'ابطال سند', belowCost: 'فروش زیر بهای تمام‌شده', discount: 'تخفیف بالاتر از حد', unlock: 'باز کردن دوره قفل' };
  const approvalRules = () => ({ enabled: false, void: true, belowCost: true, discount: true, discountPct: 10, unlock: true, ...(getSetting('approvals', {}) ?? {}) });
  const canon = (o) => JSON.stringify(o, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((x) => [x, v[x]])) : v));
  const hashOf = (kind, payload) => createHashHex(`${kind}|${canon(payload)}`);
  /**
   * A gated operation: without an approval it files a request (or reuses the open one for the very same content)
   * and stops with 428; with an approval it checks: approved, not yet used, same content, same requester.
   */
  function gate(user, kind, payload, approvalId, summary, ref = null) {
    const rules = approvalRules();
    if (!rules.enabled || !rules[kind]) return null;
    const h = hashOf(kind, payload);
    if (approvalId) {
      const a = db.get('SELECT * FROM ctl_approvals WHERE id=?', String(approvalId));
      if (!a) throw notFound('درخواست تأیید پیدا نشد.');
      if (a.payload_hash !== h) throw new HttpError(409, 'این تأیید برای محتوای دیگری صادر شده است؛ پس از تغییر، دوباره درخواست تأیید بدهید.');
      if (a.requested_by !== user.id) throw forbid('این تأیید برای کاربر دیگری است.');
      if (a.status === 'rejected') throw forbid(`درخواست رد شد${a.note ? `: «${a.note}»` : ''}.`);
      if (a.status !== 'approved') throw new HttpError(428, 'هنوز تأیید نشده است.', { approval: { id: a.id, status: a.status } });
      if (a.used_at) throw new HttpError(409, 'این تأیید قبلاً یک بار استفاده شده است.');
      if (Date.now() - Date.parse(a.decided_at) > DAY) throw new HttpError(410, 'مهلت این تأیید (۲۴ ساعت) تمام شده است.');
      return a.id;
    }
    let a = db.get("SELECT * FROM ctl_approvals WHERE payload_hash=? AND requested_by=? AND status='pending'", h, user.id);
    if (!a) {
      const id = randomId();
      db.run('INSERT INTO ctl_approvals(id,kind,ref,summary,payload_hash,detail_json,requested_by,requested_name,requested_at) VALUES (?,?,?,?,?,?,?,?,?)', id, kind, ref, txt(summary, 400), h, JSON.stringify(payload).slice(0, 20000), user.id, user.name ?? '', now());
      log(user, 'approval.request', id, { kind, summary: txt(summary, 200) });
      a = { id, status: 'pending' };
    }
    throw new HttpError(428, `این کار (${RULES_FA[kind]}) تأیید مدیر دیگری را لازم دارد؛ درخواست ثبت شد. پس از تأیید، دوباره همین کار را انجام دهید.`, { approval: { id: a.id, status: a.status, kind } });
  }
  const useApproval = (id) => db.run('UPDATE ctl_approvals SET used_at=? WHERE id=? AND used_at IS NULL', now(), id);
  const approvalOut = (a) => ({ id: a.id, kind: a.kind, kindLabel: RULES_FA[a.kind] ?? a.kind, ref: a.ref, summary: a.summary, status: a.used_at ? 'used' : a.status, requestedBy: a.requested_name, requestedById: a.requested_by, requestedAt: a.requested_at, decidedBy: a.decided_name, decidedAt: a.decided_at, note: a.note });
  on('GET', '/api/books/control/approvals', 'auth', ({ user }) => {
    const mine = !isAdmin(user);
    const rows = mine ? db.all('SELECT * FROM ctl_approvals WHERE requested_by=? ORDER BY requested_at DESC LIMIT 100', user.id) : db.all('SELECT * FROM ctl_approvals ORDER BY (status=\'pending\') DESC, requested_at DESC LIMIT 200');
    return { rules: approvalRules(), items: rows.map(approvalOut), me: user.id };
  });
  on('PUT', '/api/books/control/approvals/rules', 'auth', ({ user, body }) => {
    if (user.role !== 'owner') throw forbid('قواعد تأیید را فقط مالک تنظیم می‌کند.');
    const cur = approvalRules();
    const next = { ...cur };
    for (const k of ['enabled', 'void', 'belowCost', 'discount', 'unlock']) if (typeof body[k] === 'boolean') next[k] = body[k];
    if (body.discountPct !== undefined) {
      const v = B.num(body.discountPct);
      if (!(v > 0 && v <= 100)) throw bad('حد تخفیف باید بین ۰ و ۱۰۰ درصد باشد.');
      next.discountPct = v;
    }
    saveSetting('approvals', next, user.id);
    log(user, 'approval.rules', 'approvals', next);
    return { rules: next };
  });
  for (const [verb, status] of [['approve', 'approved'], ['reject', 'rejected']]) {
    on('POST', `/api/books/control/approvals/:id/${verb}`, 'auth', ({ user, params, body }) => {
      guardAdmin(user);
      const a = db.get('SELECT * FROM ctl_approvals WHERE id=?', params.id);
      if (!a) throw notFound('درخواست پیدا نشد.');
      // four eyes: whoever asked cannot be the one who approves, whatever their role
      if (a.requested_by === user.id) throw forbid('کنترل چهار چشم: درخواست خودتان را نمی‌توانید تأیید یا رد کنید؛ مدیر دیگری باید تصمیم بگیرد.');
      if (a.status !== 'pending') throw new HttpError(409, 'این درخواست قبلاً بررسی شده است.');
      const note = txt(body.note, 300);
      if (status === 'rejected' && note.length < 3) throw bad('دلیل رد را بنویسید.');
      db.run('UPDATE ctl_approvals SET status=?, decided_by=?, decided_name=?, decided_at=?, note=? WHERE id=?', status, user.id, user.name ?? '', now(), note, a.id);
      log(user, `approval.${verb}`, a.id, { kind: a.kind, note: note || undefined });
      return approvalOut(db.get('SELECT * FROM ctl_approvals WHERE id=?', a.id));
    });
  }
  /** What in a document needs approval (only when the owner switched the engine on). */
  function docGates(doc, calc, prev) {
    const rules = approvalRules();
    if (!rules.enabled) return [];
    const out = [];
    if (rules.belowCost && doc.type === 'trade') {
      const lots = buildLots(finalEvents(tehranDay()).filter((e) => e.id !== prev?.id));
      const open = {};
      for (const l of lots.lots) if (l.remaining > 1e-9) (open[l.unit] ??= []).push({ ...l });
      let loss = 0;
      for (const l of calc.lines ?? []) {
        if (!l.priced || l.dir !== 'out') continue;
        const unit = l.kind === 'melt' || l.kind === 'bar' ? 'G750' : l.unit;
        let q = l.kind === 'melt' || l.kind === 'bar' ? l.eq750 : l.amt;
        let cost = 0;
        for (const lot of open[unit] ?? []) {
          if (q <= 1e-9) break;
          const use = Math.min(q, lot.remaining);
          cost += (lot.cost * use) / lot.qty;
          lot.remaining -= use;
          q -= use;
        }
        if (q <= 1e-9 && l.value - (l.fee ?? 0) < cost) loss += cost - (l.value - (l.fee ?? 0));
      }
      if (loss > 0.5) out.push({ kind: 'belowCost', summary: `فروش زیر بها با زیان ${R(loss)}` });
    }
    if (rules.discount && doc.type === 'sale') {
      for (const l of calc.lines ?? []) {
        const base = (l.goldValue ?? 0) + (l.ojratValue ?? l.ojrat ?? 0);
        const d = B.num(l.discount);
        if (base > 0 && d / base > rules.discountPct / 100) out.push({ kind: 'discount', summary: `تخفیف ${pf((d / base) * 100)}٪ (حد ${pf(rules.discountPct)}٪)` });
      }
    }
    return out;
  }
  const payloadOf = (doc, prev) => ({ id: prev?.id ?? null, type: doc.type, date: doc.date, partyId: doc.partyId ?? null, lines: doc.lines, payments: doc.payments ?? [] });
  const hooks = {
    /** Before a document is saved: locked months, then the approval engine. Returns an approval id to consume. */
    check(user, doc, calc, prev, body) {
      for (const day of [doc?.date, prev?.date]) {
        const m = day && lockOf(day);
        if (m) throw new HttpError(423, `دوره ${monthFa(m)} قفل است؛ اسناد آن مستقیم تغییر نمی‌کنند. اصلاح را با «سند اصلاح» در تاریخ باز ثبت کنید.`);
      }
      if (body?.status === 'draft') return null; // a draft posts nothing: approvals are asked when it becomes final
      const gates = docGates(doc, calc, prev);
      if (!gates.length) return null;
      const payload = payloadOf(doc, prev);
      const kind = gates[0].kind;
      return gate(user, kind, payload, body?.approval, `${gates.map((g) => g.summary).join('؛ ')}${doc.partyId ? ` · ${partyLabel(doc.partyId)}` : ''}`, prev?.id ?? null);
    },
    commit(approvalId) {
      useApproval(approvalId);
    },
    /** dryRun (outside the void's transaction): refuse or file the request; inside: check again and consume. */
    voiding(user, row, { reason, approval, dryRun = false } = {}) {
      const m = lockOf(row.date);
      if (m) throw new HttpError(423, `دوره ${monthFa(m)} قفل است؛ به‌جای ابطال، سند اصلاح در تاریخ باز بزنید.`);
      const id = gate(user, 'void', { id: row.id, version: row.version }, approval, `ابطال ${track(row)}: «${txt(reason, 200)}»`, row.id);
      if (id && !dryRun) useApproval(id);
    },
  };

  /* ------------------------------------------------------------------ بستن خودکار روز (spec #13) */
  const autoRules = () => ({ enabled: false, at: '23:30', requireCount: false, ...(getSetting('autoClose', {}) ?? {}) });
  /** Nightly reconciliation: the day's close checks + the ledger replay + balances below zero. Only issues are kept. */
  function recon(day) {
    const rules = autoRules();
    const issues = [];
    let view = null;
    try {
      view = call('GET', '/api/books/close', SYS, { query: { day } });
    } catch {
      /* no close view */
    }
    for (const c of view?.checks ?? []) {
      if (c.ok) continue;
      if (c.key === 'count' && !rules.requireCount && !(view.counts?.length)) continue; // no count that day: not a mismatch unless required
      issues.push({ key: c.key, title: c.title, detail: c.warn, href: c.key === 'bank' ? '/books/cash' : c.key === 'count' ? '/books/smart?t=close' : c.key === 'audit' ? '/books/audit' : '/books/smart?t=close' });
    }
    const rp = replayLedger(db);
    if (!rp.ok) issues.push({ key: 'replay', title: 'اختلاف دفتر با اسناد', detail: `${fa(rp.count)} اختلاف در بازپخش دفتر`, href: '/books/control?t=exceptions' });
    for (const [acct, u] of balancesAt(day)) {
      const v = Object.values(u)[0];
      if (/^(gold|coin:|fx:|bar:|cash:)/.test(acct) && v < -1e-6) issues.push({ key: `neg:${acct}`, title: 'مانده منفی', detail: `${acct === 'gold' ? 'طلای آبشده' : acct}: ${acct === 'gold' ? G(v) : acct.startsWith('cash:') ? R(v) : fa(v)}`, href: acct.startsWith('cash:') ? '/books/cash' : '/books/vault' });
    }
    return { day, at: now(), issues, totals: view?.totals ?? null, entries: view?.entries ?? 0, closedBefore: !!view?.closed };
  }
  function runRecon(day, { close = false, auto = false } = {}) {
    const r = { ...recon(day), auto };
    let closed = false;
    if (close && !r.issues.length && !r.closedBefore && closeSystem) closed = !!closeSystem(day, { issues: 0, at: r.at }).ok;
    db.run('INSERT INTO ctl_recon(day,data_json,issues,closed,at) VALUES (?,?,?,?,?) ON CONFLICT(day) DO UPDATE SET data_json=excluded.data_json, issues=excluded.issues, closed=excluded.closed, at=excluded.at', day, JSON.stringify(r), r.issues.length, closed ? 1 : 0, r.at);
    return { ...r, closed };
  }
  const tehranTime = () => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tehran', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
  /** Called by the job queue every few minutes, for every shop. */
  function autoTick() {
    const rules = autoRules();
    if (!rules.enabled) return null;
    const day = tehranDay();
    if (tehranTime() < rules.at) return null;
    const done = db.get('SELECT data_json FROM ctl_recon WHERE day=?', day);
    if (done && JSON.parse(done.data_json).auto) return null; // tonight's automatic run already happened
    return runRecon(day, { close: true, auto: true });
  }
  on('GET', '/api/books/control/autoclose', 'auth', ({ user }) => {
    guardAdmin(user);
    return { rules: autoRules(), now: tehranTime(), reports: db.all('SELECT * FROM ctl_recon ORDER BY day DESC LIMIT 30').map((r) => ({ ...JSON.parse(r.data_json), closed: !!r.closed, issuesCount: r.issues })) };
  });
  on('PUT', '/api/books/control/autoclose', 'auth', ({ user, body }) => {
    if (user.role !== 'owner') throw forbid('بستن خودکار را فقط مالک تنظیم می‌کند.');
    const next = { ...autoRules() };
    if (typeof body.enabled === 'boolean') next.enabled = body.enabled;
    if (typeof body.requireCount === 'boolean') next.requireCount = body.requireCount;
    if (body.at !== undefined) {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(body.at))) throw bad('ساعت را به شکل ۲۳:۳۰ بنویسید.');
      next.at = String(body.at);
    }
    saveSetting('autoClose', next, user.id);
    log(user, 'autoclose.rules', 'autoClose', next);
    return { rules: next };
  });
  on('POST', '/api/books/control/recon', 'auth', ({ user, body }) => {
    guardAdmin(user);
    const day = DAY_RE.test(body.day ?? '') ? body.day : tehranDay();
    if (day > tehranDay()) throw bad('روز آینده را نمی‌توان تطبیق داد.');
    return runRecon(day, { close: body.close === true && user.role === 'owner' });
  });

  return { twin, pulse, exceptions, simulate, explain, trial, forecast10, partyStory, itemTimeline, balancesAt, monthOf, lockOf, finalEvents, hooks, autoTick, recon: runRecon };
}
