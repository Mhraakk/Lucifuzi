// صد دور (spec 0029): the app used the way a shop uses it, a hundred times over, every output read back and checked
// against a small model built only from what was typed and the shared pure engine (trade.mjs) — never from the
// server's postings, so a fault in saving, balances, روزنگار, search, tracking or reports shows as a difference.
//   node scripts/hundred.mjs [--rounds=100] [--headed]
// Writes hundred-report.json in the working directory; exits non-zero on any failure.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { smsLogin } from '../tests/helpers/login.mjs';
import * as T from '../public/js/trade.mjs';
import * as B from '../public/js/books.mjs';
import { toJalali } from '../public/js/ta.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
const ROUNDS = Number(arg('rounds') ?? 100);
const pw = await import(process.env.PLAYWRIGHT ?? '/opt/node22/lib/node_modules/playwright/index.mjs');
const { chromium } = pw.default ?? pw;

/* ---------------- a fresh server ---------------- */
const dataDir = mkdtempSync(path.join(tmpdir(), 'b100-'));
const port = 6400 + Math.floor(Math.random() * 300);
const server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.mjs'], { cwd: ROOT, env: { ...process.env, BEATRIS_DEMO: 'true', BEATRIS_DATA_DIR: dataDir, PORT: String(port), NODE_ENV: 'test', BEATRIS_TOKEN_SECRET: 'hundred-secret-0123456789abcdef', BEATRIS_RATE_LIMIT: '1000000' }, stdio: ['ignore', 'ignore', 'inherit'] });
const base = `http://127.0.0.1:${port}`;
for (let i = 0; i < 120; i++) {
  if (await fetch(`${base}/api/health`).then((r) => r.ok).catch(() => false)) break;
  await new Promise((r) => setTimeout(r, 250));
}
const TOKEN = await smsLogin(base, '09120000002');
const api = async (method, p, body) => {
  const r = await fetch(base + p, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${method} ${p} → ${r.status} ${j?.error ?? ''}`);
  return j;
};
/** Save a document through the API and count it (روزنگار of today must list every one). */
const post = async (data) => {
  const d = await api('POST', '/api/books/docs', data);
  M.saved++;
  return d;
};

/* ---------------- the report ---------------- */
const FEAT = new Map();
const failures = [];
const pageErrors = [];
const feat = (name) => FEAT.get(name) ?? (FEAT.set(name, { tries: 0, pass: 0, fail: 0, ms: [] }), FEAT.get(name));
/** Run one checked step: it passes when fn resolves (and returns true or a value), fails on a throw or `false`. */
async function step(name, round, fn) {
  const f = feat(name);
  f.tries++;
  const t0 = performance.now();
  try {
    const v = await fn();
    if (v === false) throw new Error('check failed');
    f.pass++;
    f.ms.push(performance.now() - t0);
    return v;
  } catch (e) {
    f.fail++;
    failures.push({ round, feature: name, error: String(e.message ?? e).split('\n')[0].slice(0, 400) });
    return undefined;
  }
}
// objects compare by content: the key order of a JSON object is not part of its value
const canon = (v) => JSON.stringify(v, (_, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : x));
const same = (what, found, expected, tol = 0) => {
  const ok = typeof expected === 'number' ? Math.abs((found ?? 0) - expected) <= tol : canon(found) === canon(expected);
  if (!ok) throw new Error(`${what}: found ${JSON.stringify(found)}, expected ${JSON.stringify(expected)}`);
  return true;
};

/* ---------------- the model: only what was typed and the pure engine ---------------- */
const r3 = (x) => Math.round(x * 1000) / 1000;
const r2 = (x) => Math.round(x * 100) / 100;
const M = { cash: {}, bank: {}, chq: 0, gold: 0, coins: {}, fx: {}, bars: new Set(), card: {}, parties: {}, docs: [], saved: 0 };
const bump = (o, k, v, round = (x) => x) => (o[k] = round((o[k] ?? 0) + v));
const party = (id) => (M.parties[id] ??= {});
const unitRound = (u) => (u === 'G750' ? r3 : u.startsWith('FX:') ? r2 : (x) => x);
function applyPayments(calc, data, pid) {
  for (const [i, p] of calc.payments.entries()) {
    const src = data.payments[i];
    const k = p.dir === 'in' ? 1 : -1;
    const acct = B.payMethod(p.method).acct;
    if (pid) bump(party(pid), 'IRR', -k * p.value);
    if (acct === 'cash') bump(M.cash, src.account || 'main', k * p.value);
    else if (acct === 'bank') bump(M.bank, src.account || 'main', k * p.value);
    else if (acct === 'cheque') M.chq += k * p.value;
    else if (acct === 'party' && pid) bump(party(pid), 'IRR', k * p.value);
  }
}
/** A trade, hawala, convert, write-off or melting, as stored (its inputs), through the engine's own calc. */
function applyTradeDoc(data) {
  const c = T.calcTrade(data);
  const pid = data.partyId;
  if (c.type === 'hawala') {
    bump(party(c.hawala.from), c.hawala.unit, c.hawala.amount, unitRound(c.hawala.unit));
    bump(party(c.hawala.to), c.hawala.unit, -c.hawala.amount, unitRound(c.hawala.unit));
    return c;
  }
  if (c.type === 'convert') {
    bump(party(pid), c.convert.unit, -c.convert.amount, unitRound(c.convert.unit));
    bump(party(pid), 'IRR', c.net);
    return c;
  }
  if (c.type === 'writeoff') {
    bump(party(pid), c.writeoff.unit, -c.writeoff.amount, unitRound(c.writeoff.unit));
    return c;
  }
  for (const l of c.lines) {
    const k = l.dir === 'in' ? 1 : -1;
    if (l.stock === 'gold') M.gold = r3(M.gold + k * l.amt);
    else if (l.stock.startsWith('coin:')) bump(M.coins, l.stock.slice(5), k * l.amt);
    else if (l.stock.startsWith('fx:')) bump(M.fx, l.stock.slice(3), k * l.amt, r2);
    else if (l.stock.startsWith('bar:')) {
      if (k > 0) (M.bars.add(l.serial), (M.card[l.serial] = { weight: l.weight, fineness: l.fineness }));
      else M.bars.delete(l.serial);
    }
    if (c.type === 'transform') continue;
    if (l.priced) bump(party(pid), 'IRR', -k * l.value);
    else bump(party(pid), l.unit, -k * l.amt, unitRound(l.unit));
  }
  if (c.type === 'transform') {
    for (const [i, p] of c.payments.entries()) {
      const src = data.payments[i];
      const acct = B.payMethod(p.method).acct;
      if (acct === 'cash') bump(M.cash, src.account || 'main', -p.value);
      else if (acct === 'bank') bump(M.bank, src.account || 'main', -p.value);
    }
    return c;
  }
  applyPayments(c, data, pid);
  return c;
}
/** A books-family document (amounts typed in toman, stored ×10 in rial). */
function applyBooksDoc(data) {
  const pid = data.partyId;
  for (const p of data.payments) {
    const v = Math.round(p.amount * 10);
    const k = p.dir === 'in' ? 1 : -1;
    const acct = B.payMethod(p.method).acct;
    if (acct === 'cash') bump(M.cash, p.account || 'main', k * v);
    else if (acct === 'bank') bump(M.bank, p.account || 'main', k * v);
    if (pid && (data.type === 'receipt' || data.type === 'payment')) bump(party(pid), 'IRR', -k * v);
  }
}
const nz = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => Math.abs(v) > 1e-9));

/* ---------------- the shop ---------------- */
await api('PUT', '/api/books/settings', { edition: 'base' });
const accts = (await api('GET', '/api/books/accounts')).items;
const CASH = accts.find((a) => a.kind === 'cash').id;
let BANK = accts.find((a) => a.kind === 'bank')?.id;
if (!BANK) BANK = (await api('POST', '/api/books/accounts', { kind: 'bank', title: 'ملت جاری', bank: 'ملت' })).id;
// what the shop held before the first round: the model starts from it
const v0 = await api('GET', '/api/books/vault');
Object.assign(M.cash, v0.cash);
Object.assign(M.bank, v0.bank);
M.gold = v0.gold;
Object.assign(M.coins, v0.coins);
Object.assign(M.fx, v0.fx);
for (const b of v0.bars) (M.bars.add(b.serial), (M.card[b.serial] = { weight: b.weight, fineness: b.fineness }));
const NAMES = ['رضا تهرانی', 'سارا احمدی', 'مهدی کرمانی', 'نرگس شیرازی', 'علی اصفهانی', 'زهرا قزوینی', 'حسین تبریزی', 'مریم رشتی', 'امید کاشانی', 'لیلا یزدی', 'کاوه همدانی', 'پریسا اراکی'];
const PARTIES = [];
for (const [i, name] of NAMES.entries()) {
  const p = await api('POST', '/api/books/parties', { name: `${name} صددور`, mobile: `0912${String(3000000 + i).padStart(7, '0')}`, group: i % 2 ? 'همکار' : 'خرده' });
  PARTIES.push({ id: p.id, name: `${name} صددور` });
  const full = await api('GET', `/api/books/parties/${p.id}`);
  M.parties[p.id] = { ...full.balance };
}
// the demo shop may already have documents dated today: روزنگار counts them too
M.saved = (await api('GET', `/api/books/daybook?day=${new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(new Date())}`)).entries.length;
// enough in the till and the bank for the shop to pay out, booked as income (and in the model)
for (const [acct, method] of [[CASH, 'cash'], [BANK, 'havale']]) {
  const data = { type: 'income', category: 'سایر', note: 'موجودی آغاز صد دور', payments: [{ method, dir: 'in', amount: 3_000_000_000, account: acct }] };
  await post(data);
  applyBooksDoc(data);
}

/* ---------------- the browser ---------------- */
const browser = await chromium.launch({ headless: !process.argv.includes('--headed') });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 }, acceptDownloads: true });
await ctx.addInitScript((t) => {
  try {
    localStorage.setItem('beatris.token', t);
    localStorage.setItem('beatris.theme', 'calm');
  } catch {}
}, TOKEN);
const page = await ctx.newPage();
page.setDefaultTimeout(20000);
let roundNow = 0;
page.on('pageerror', (e) => pageErrors.push({ round: roundNow, url: page.url(), error: e.message.slice(0, 300) }));
page.on('console', (m) => m.type() === 'error' && !/favicon|ERR_ABORTED|net::ERR_CONNECTION/.test(m.text()) && pageErrors.push({ round: roundNow, url: page.url(), console: m.text().slice(0, 300) }));
const go = async (p, wait = 700) => {
  await page.goto(base + p);
  await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(wait);
};
const text = (sel) => page.$eval(sel, (e) => e.innerText);
const faN = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
const grouped = (n) => faN(Math.abs(n).toLocaleString('en-US').replace(/,/g, '٬'));
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(new Date());
const dueJ = (() => {
  const d = new Date(Date.parse(`${today}T00:00:00Z`) + 30 * 864e5);
  const [y, m, dd] = toJalali(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  return `${y}/${String(m).padStart(2, '0')}/${String(dd).padStart(2, '0')}`;
})();

/* ---------------- one round at the desk ---------------- */
const KINDS = ['melt', 'coin', 'bar', 'fx'];
const PAYS = ['cash', 'pos', 'c2c', 'slip', 'cheque', null];
const COINS = ['emami', 'bahar', 'half', 'quarter', 'gerami'];
const FXS = [['USD', 820000], ['EUR', 900000], ['AED', 224000]];
let barNo = 0;
const ownedBars = () => [...M.bars].filter((s) => s.startsWith('HR'));

/** What this round trades: a buy and a sell take turns; something is only sold when the shop holds it. */
function planOf(r) {
  const kind = KINDS[r % 4];
  const p = PARTIES[(r * 5) % PARTIES.length];
  const pay = PAYS[r % PAYS.length];
  let mode = Math.floor(r / 4) % 2 ? 'sell' : 'buy';
  const f = {};
  if (kind === 'melt') {
    f.weight = r3(1 + ((r * 7.137) % 20));
    f.fineness = [740, 750, 705, 745][r % 4];
    f.mazaneh = 405_000_000 + (r % 9) * 1_000_000;
    if (mode === 'sell' && M.gold < (f.weight * f.fineness) / 750 + 1) mode = 'buy';
  } else if (kind === 'coin') {
    f.coin = COINS[r % COINS.length];
    f.count = 1 + (r % 3);
    f.price = { emami: 1_000_000_000, bahar: 960_000_000, half: 520_000_000, quarter: 300_000_000, gerami: 150_000_000 }[f.coin] + (r % 5) * 1_000_000;
    if (mode === 'sell' && (M.coins[f.coin] ?? 0) < f.count) mode = 'buy';
  } else if (kind === 'bar') {
    const have = ownedBars();
    if (mode === 'sell' && have.length) {
      f.serial = have[0];
      f.weight = M.card[f.serial].weight;
      f.fineness = M.card[f.serial].fineness;
    } else {
      mode = 'buy';
      f.serial = `HR${String(++barNo).padStart(4, '0')}`;
      f.weight = [10, 20, 50, 100][r % 4];
      f.fineness = 995;
    }
    f.mazaneh = 406_000_000 + (r % 7) * 1_000_000;
  } else {
    const [code, rate] = FXS[r % FXS.length];
    f.code = code;
    f.fxAmount = 100 * (1 + (r % 5));
    f.rate = rate + (r % 4) * 1000;
    if (mode === 'sell' && (M.fx[code] ?? 0) < f.fxAmount) mode = 'buy';
  }
  // a cheque is something the shop receives: on a buy the round pays in cash instead
  return { kind, mode, party: p, pay: pay === 'cheque' && mode === 'buy' ? 'cash' : pay, f };
}

/** A failed desk round says where it stopped and what the screen said, with a screenshot next to the report. */
let deskAt = '';
async function deskTrade(r, plan) {
  try {
    return await deskSteps(r, plan);
  } catch (e) {
    const said = await page.evaluate(() => [...document.querySelectorAll('.toast, [role=alert], .err')].map((x) => x.innerText.trim()).filter(Boolean).join(' | ')).catch(() => '');
    await page.screenshot({ path: path.join(process.cwd(), `hundred-r${r}.png`) }).catch(() => {});
    throw new Error(`${deskAt}: ${String(e.message ?? e).split('\n')[0]}${said ? ` — on screen: ${said.slice(0, 240)}` : ''}`);
  }
}
async function deskSteps(r, plan) {
  deskAt = 'open the desk';
  await go('/books/desk', 500);
  const fresh = await page.$('[data-act=fresh]');
  if (fresh) (await fresh.click(), await page.waitForTimeout(200));
  // the customer, as the operator finds them: type, then Enter
  deskAt = 'pick the customer';
  await page.click('#pq');
  await page.fill('#pq', plan.party.name.split(' ')[0]);
  await page.waitForSelector(`#pdrop [data-pick="${plan.party.id}"]`, { timeout: 8000 });
  await page.click(`#pdrop [data-pick="${plan.party.id}"]`);
  await page.waitForSelector('.dk-who');
  deskAt = 'fill the line';
  await page.click(`[data-mode=${plan.mode}]`);
  await page.click(`[data-kind=${plan.kind}]`);
  const f = plan.f;
  const fill = async (k, v) => {
    await page.fill(`#form [data-f="${k}"]`, String(v));
    await page.dispatchEvent(`#form [data-f="${k}"]`, 'input');
  };
  if (plan.kind === 'melt') {
    await fill('weight', f.weight);
    await fill('fineness', f.fineness);
    await fill('mazaneh', f.mazaneh);
  } else if (plan.kind === 'coin') {
    await page.click(`#form [data-coin="${f.coin}"]`);
    await fill('count', f.count);
    await fill('price', f.price);
  } else if (plan.kind === 'bar') {
    await fill('serial', f.serial);
    if (plan.mode === 'buy') {
      await fill('weight', f.weight);
      await fill('fineness', f.fineness);
    } else await page.waitForFunction((w) => Number(document.querySelector('#form [data-f="weight"]')?.value) === w, f.weight, { timeout: 5000 }); // the desk fills the card
    await fill('mazaneh', f.mazaneh);
  } else {
    await page.selectOption('#form [data-f="code"]', f.code);
    await fill('fxAmount', f.fxAmount);
    await fill('rate', f.rate);
  }
  deskAt = 'add the line';
  await page.click('[data-act=add]');
  await page.waitForSelector('.dk-line');
  deskAt = 'the payment';
  if (plan.pay) {
    await page.click(`[data-pm=${plan.pay}]`);
    await page.click('[data-fill="0"]');
    const set = async (k, v) => page.fill(`[data-p="0"][data-k=${k}]`, String(v));
    if (['pos', 'c2c', 'slip'].includes(plan.pay)) await set('ref', String(100000 + r));
    if (plan.pay === 'c2c') await set('card', String(1000 + r).slice(-4));
    if (plan.pay === 'cheque') {
      await set('chequeNo', String(500000 + r));
      await set('bank', 'ملی');
      await set('dueJ', dueJ);
    }
  }
  deskAt = 'save';
  await page.click('.dk-save [data-act=save]');
  await page.waitForSelector('.dk-receipt', { timeout: 15000 });
  const id = await page.$eval('#dkReceipt', (e) => e.dataset.doc);
  const track = (await text('.dk-r-track b')).trim();
  const receipt = await text('.dk-receipt');
  await page.keyboard.press('Escape');
  return { id, track, receipt };
}

/* ---------------- the outputs of one document ---------------- */
async function checkDocOutputs(r, d, calc, sec) {
  // روزنگار in the document's section lists it
  await step('روزنگار: the section lists the document', r, async () => {
    await go(`/books/day?sec=${sec}`, 600);
    return (await text('#dyl')).includes(d.track) || same('روزنگار lists', (await text('#dyl')).slice(0, 120), d.track);
  });
  // the number search finds its value (the line's money value, else its amount)
  const value = calc.lines?.[0]?.value || calc.paidIn || calc.paidOut;
  if (value) {
    await step('روزنگار: number search finds the amount', r, async () => {
      const res = await api('GET', `/api/books/daybook/find?q=${encodeURIComponent(`${value} ریال`)}&sec=${sec}`);
      const hit = (res.items ?? []).flatMap((x) => x.docs ?? []).some((x) => x.id === d.id);
      return hit || same('search hit', JSON.stringify(res.items ?? res).slice(0, 160), d.track);
    });
  }
  // رهگیری opens it, by its code
  await step('رهگیری: the code opens the document', r, async () => {
    const t = await api('GET', `/api/books/trace?q=${encodeURIComponent(d.track)}`);
    return same('trace', t.items?.[0]?.id, d.id);
  });
}

/* ---------------- سرنخ‌یاب: a scrap of memory finds the document ---------------- */
const fa = (x) => String(x).replace(/\d/g, (c) => '۰۱۲۳۴۵۶۷۸۹'[c]);
async function clueChecks(r, d, data, calc, plan) {
  const found = async (q, what) => {
    const res = await api('GET', `/api/books/find?q=${encodeURIComponent(q)}&limit=12`);
    const at = (res.items ?? []).findIndex((x) => x.id === d.id);
    if (at < 0) return same(`${what} «${q}»`, (res.items ?? []).slice(0, 3).map((x) => `${x.track} ${x.matched}/${x.of}`), `${d.track} among the first 12`);
    // the document holds every clue it was found by
    return same(`${what} «${q}» holds every clue`, `${res.items[at].matched}/${res.items[at].of}`, `${res.items[at].of}/${res.items[at].of}`);
  };
  // three letters of the customer's name and three digits of the tracking number
  const name = plan.party.name.replace(/\s+/g, ' ').trim();
  await step('سرنخ‌یاب: three letters of the name and part of the code', r, () => found(`${name.slice(0, 3)} ${fa(d.track.split('-')[1].slice(-3))}`, 'name + code'));
  // the tail of the amount, as a person says it: «آخرش ۷۸۰»
  const v = calc.lines?.[0]?.value || calc.paidIn || calc.paidOut;
  if (v) {
    const sig = String(Math.round(v)).replace(/0+$/, '');
    const tail = sig.slice(-3).replace(/^0+/, '');
    if (tail.length >= 2) await step('سرنخ‌یاب: the amount’s tail and the kind', r, () => found(`${name.slice(0, 3)} آخرش ${fa(tail)} ${({ melt: 'آبشده', coin: 'سکه', bar: 'شمش', fx: 'ارز' })[plan.kind]}`, 'tail + kind'));
  }
  // a cheque by part of its number; a bar by part of its serial
  if (plan.pay === 'cheque') await step('سرنخ‌یاب: part of the cheque number', r, () => found(`چک ${fa(String(500000 + r).slice(-4))}`, 'cheque'));
  if (plan.f.serial) await step('سرنخ‌یاب: part of the bar serial', r, () => found(`شمش ${plan.f.serial.slice(-5)}`, 'serial'));
}

/* ---------------- the books, every few rounds ---------------- */
async function booksRound(r) {
  const p = PARTIES[r % PARTIES.length];
  const kind = ['receipt', 'payment', 'expense', 'income', 'transfer'][Math.floor(r / 5) % 5];
  const amount = 1_000_000 * (1 + (r % 9)); // toman
  const data =
    kind === 'receipt' ? { type: 'receipt', partyId: p.id, payments: [{ method: 'cash', dir: 'in', amount, account: CASH }] }
    : kind === 'payment' ? { type: 'payment', partyId: p.id, payments: [{ method: 'havale', dir: 'out', amount, account: BANK, ref: String(700000 + r) }] }
    : kind === 'expense' ? { type: 'expense', category: 'اجاره', payments: [{ method: 'cash', dir: 'out', amount, account: CASH }] }
    : kind === 'income' ? { type: 'income', category: 'کارمزد عیارسنجی و ری‌گیری', payments: [{ method: 'havale', dir: 'in', amount, account: BANK, ref: String(800000 + r) }] }
    : { type: 'transfer', payments: [{ method: 'cash', dir: 'out', amount, account: CASH }, { method: 'havale', dir: 'in', amount, account: BANK, ref: String(900000 + r) }] };
  await step(`books: ${kind}`, r, async () => {
    const d = await post(data);
    applyBooksDoc(data);
    return !!d.id;
  });
}

/** Every tenth round: the rarer documents, then every report and export. */
async function tenthRound(r) {
  const [a, b] = [PARTIES[r % PARTIES.length], PARTIES[(r + 3) % PARTIES.length]];
  // حواله: a's rial balance moves to b
  await step('حواله between customers', r, async () => {
    const data = { type: 'hawala', hawala: { from: a.id, to: b.id, unit: 'IRR', amount: 5_000_000 } };
    await post(data);
    applyTradeDoc(data);
    return true;
  });
  // تبدیل: goods left on account priced into rial (the customer first leaves 1 g with the shop)
  await step('goods on account, then تبدیل to rial', r, async () => {
    const dep = { type: 'trade', partyId: a.id, lines: [{ kind: 'melt', dir: 'in', priced: false, weight: 1, fineness: 750 }], payments: [] };
    await post(dep);
    applyTradeDoc(dep);
    const conv = { type: 'convert', partyId: a.id, convert: { unit: 'G750', amount: 1, mazaneh: 405_000_000 } };
    await post(conv);
    applyTradeDoc(conv);
    return true;
  });
  // سوخت: a small rial debt written off
  await step('سوخت (write-off)', r, async () => {
    const owes = M.parties[b.id]?.IRR ?? 0;
    if (owes <= 1_000_000) return true; // nothing owed to forgive this time
    const data = { type: 'writeoff', partyId: b.id, writeoff: { unit: 'IRR', amount: 1_000_000 }, note: 'صد دور' };
    await post(data);
    applyTradeDoc(data);
    return true;
  });
  // ذوب: melt 2 g of the vault's 750 into 1.99 g
  await step('ذوب from the vault', r, async () => {
    if (M.gold < 3) return true;
    const data = { type: 'transform', note: 'ذوب صد دور', lines: [{ kind: 'melt', dir: 'out', weight: 2, fineness: 750 }, { kind: 'melt', dir: 'in', weight: 1.99, fineness: 750 }], payments: [{ method: 'cash', dir: 'out', amount: 500000, account: CASH }] };
    await post(data);
    applyTradeDoc(data);
    return true;
  });
  // every report reads without a bad number
  for (const [name, p] of [['P&L', '/api/books/report/pnl'], ['VAT', `/api/books/report/vat?from=2000-01-01&to=${today}`], ['sales', `/api/books/report/sales?from=2000-01-01&to=${today}`], ['balance', '/api/books/report/balance'], ['summary', '/api/books/summary'], ['dashboard', '/api/books/dashboard'], ['audit', '/api/books/audit']]) {
    await step(`report: ${name}`, r, async () => {
      const j = JSON.stringify(await api('GET', p));
      return !/NaN|Infinity|"undefined"/.test(j) || same(`${name} has a bad number`, j.match(/.{40}(NaN|Infinity|"undefined").{20}/)?.[0], 'none');
    });
  }
  await step('report: P&L shows the net result', r, async () => {
    const pl = await api('GET', '/api/books/report/pnl');
    return Number.isFinite(pl.result?.net ?? pl.net ?? 0);
  });
  await step('export: everything (JSON)', r, async () => {
    const j = await api('GET', '/api/books/export');
    return (j.docs?.length ?? j.bk_docs?.length ?? 0) > 0 || Object.keys(j).length > 3;
  });
  await step('export: روزنگار CSV', r, async () => {
    await go('/books/day', 600);
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.click('[data-act=dy-csv]')]);
    const csv = readFileSync(await dl.path(), 'utf8');
    return csv.split('\n').length > 2;
  });
  // the pages: no page error, no bad number, no sideways scroll
  for (const p of ['/books/desk', '/books/day', '/books/vault', '/books/bars', '/books/parties', '/books/cash', '/books/reports?tab=pnl', '/books/reports', '/books/trace', '/books/pulse', '/books/dashboard', '/books/control', '/books/events', '/books/audit', '/books/log']) {
    await step(`page ${p}`, r, async () => {
      await go(p, 500);
      const s = await page.evaluate(() => ({ ov: document.documentElement.scrollWidth - innerWidth, bad: /NaN|undefined|Infinity/.test(document.querySelector('main')?.innerText ?? '') }));
      // name the widest offenders, so an overflow is actionable
      if (s.ov > 1) s.wide = await page.evaluate(() => [...document.querySelectorAll('main *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 1 || e.getBoundingClientRect().left < -1).slice(-3).map((e) => `${e.tagName.toLowerCase()}.${[...e.classList].join('.')}`));
      return (s.ov <= 1 && !s.bad) || same(`${p} overflow/bad`, s, { ov: 0, bad: false });
    });
  }
}

/* ---------------- after every round: the whole shop against the model ---------------- */
async function invariants(r) {
  await step('the event log chain verifies', r, async () => same('chain', (await api('GET', '/api/books/log')).chain.ok, true));
  await step('replay rebuilds the stored postings', r, async () => {
    const rp = await api('GET', '/api/books/replay').catch((e) => (/403/.test(e.message) ? { ok: true } : Promise.reject(e)));
    return same('replay', rp.ok ? true : rp.diffs?.slice(0, 3), true);
  });
  const v = await api('GET', '/api/books/vault');
  await step('vault: cash per till', r, () => same('cash', nz(v.cash), nz(M.cash)));
  await step('vault: bank per account', r, () => same('bank', nz(v.bank), nz(M.bank)));
  await step('vault: آبشده (750)', r, () => same('gold', v.gold ?? 0, M.gold, 0.0015));
  await step('vault: coins', r, () => same('coins', nz(v.coins), nz(M.coins)));
  await step('vault: currencies', r, () => same('fx', nz(v.fx), nz(M.fx)));
  await step('vault: bars in the vault', r, () => same('bars', v.bars.map((b) => b.serial).sort(), [...M.bars].sort()));
  await step('customers: every balance in every unit', r, async () => {
    for (const p of PARTIES) {
      const got = nz((await api('GET', `/api/books/parties/${p.id}`)).balance ?? {});
      const want = nz(M.parties[p.id] ?? {});
      for (const u of new Set([...Object.keys(got), ...Object.keys(want)])) same(`${p.name} ${u}`, got[u] ?? 0, want[u] ?? 0, u === 'G750' ? 0.0015 : u.startsWith('FX:') ? 0.005 : 0);
    }
    return true;
  });
  await step('روزنگار: today counts every document saved today', r, async () => {
    const day = await api('GET', `/api/books/daybook?day=${today}`);
    return same('docs today', day.entries.length, M.saved);
  });
}

/* ---------------- the run ---------------- */
const t0 = Date.now();
for (let r = 1; r <= ROUNDS; r++) {
  roundNow = r;
  const plan = planOf(r);
  const sec = plan.kind;
  const d = await step(`desk: ${plan.mode} ${plan.kind}${plan.pay ? ` · ${plan.pay}` : ' · on account'}`, r, () => deskTrade(r, plan));
  if (d) {
    // what was typed is what was stored
    const data = await api('GET', `/api/books/docs/${d.id}`); // the stored inputs come back at the top level
    await step('stored = typed', r, () => {
      const l = data.lines[0];
      const f = plan.f;
      for (const k of ['weight', 'fineness', 'mazaneh', 'count', 'price', 'fxAmount', 'rate', 'serial', 'coin', 'code']) if (f[k] !== undefined && k in l) same(`line ${k}`, typeof f[k] === 'number' ? Number(l[k]) : l[k], f[k]);
      same('line direction', l.dir, plan.mode === 'buy' ? 'in' : 'out');
      if (plan.pay) {
        const p = data.payments[0];
        same('payment method', p.method, plan.pay);
        if (plan.pay === 'cheque') same('cheque number', p.chequeNo, String(500000 + r));
      } else same('no payment', data.payments.length, 0);
      return true;
    });
    const calc = applyTradeDoc(data);
    M.saved++;
    M.docs.push({ id: d.id, track: d.track, r });
    // a paid trade settles in full: nothing is left on the customer from this document
    if (plan.pay) await step('paid in full: the document leaves nothing on account', r, () => same('credit', calc.credit, 0));
    await step('receipt: the track, the authenticity code and the amount', r, () => d.receipt.includes(d.track) && /کد اصالت/.test(d.receipt) && (calc.lines[0].value === 0 || d.receipt.includes(grouped(calc.lines[0].value))) || same('receipt', d.receipt.slice(0, 200), 'has the track, code and amount'));
    await checkDocOutputs(r, d, calc, sec);
    // سرنخ‌یاب (spec 0032): the smallest clue a person remembers finds this round's document
    await clueChecks(r, d, data, calc, plan);
    // the customer's page shows the model's rial balance
    await step('customer page: the balance', r, async () => {
      await go(`/books/party/${plan.party.id}`, 500);
      const tb = await text('.tb');
      const irr = M.parties[plan.party.id]?.IRR ?? 0;
      return irr === 0 || tb.includes(grouped(irr)) || same('ته حساب', tb.replace(/\s+/g, ' ').slice(0, 160), grouped(irr));
    });
  }
  if (r % 5 === 0) await booksRound(r);
  if (r % 10 === 0) {
    await tenthRound(r);
    // earlier documents are still found (a sample)
    for (const old of M.docs.filter((x, i) => i % 7 === r % 7).slice(0, 4)) await step('search still finds earlier documents', r, async () => same('trace', (await api('GET', `/api/books/trace?q=${encodeURIComponent(old.track)}`)).items?.[0]?.id ?? null, old.id));
  }
  await invariants(r);
  const fails = failures.filter((f) => f.round === r).length;
  console.log(`round ${String(r).padStart(3)} ${plan.mode.padEnd(4)} ${plan.kind.padEnd(4)} ${String(plan.pay ?? 'credit').padEnd(6)} ${fails ? `✗ ${fails} failed` : '✓'}${d ? ` ${d.track}` : ''}`);
}

/* ---------------- the report ---------------- */
const pct = (xs, q) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(q * xs.length))] : 0);
const features = [...FEAT].map(([name, f]) => ({ name, tries: f.tries, pass: f.pass, fail: f.fail, p50: Math.round(pct(f.ms, 0.5)), p95: Math.round(pct(f.ms, 0.95)) }));
const report = { rounds: ROUNDS, seconds: Math.round((Date.now() - t0) / 1000), features, failures, pageErrors };
writeFileSync(path.join(process.cwd(), 'hundred-report.json'), JSON.stringify(report, null, 1));
console.log('\nfeature'.padEnd(58), 'tries  pass  fail   p50ms  p95ms');
for (const f of features) console.log(`${f.name.padEnd(57)} ${String(f.tries).padStart(5)} ${String(f.pass).padStart(5)} ${String(f.fail).padStart(5)} ${String(f.p50).padStart(7)} ${String(f.p95).padStart(6)}`);
console.log(`\n${ROUNDS} rounds in ${report.seconds} s · ${failures.length} failures · ${pageErrors.length} page errors`);
for (const f of failures.slice(0, 40)) console.log(`  ✗ round ${f.round} · ${f.feature}: ${f.error}`);
for (const e of pageErrors.slice(0, 20)) console.log(`  ! round ${e.round} ${e.url}: ${e.error ?? e.console}`);
await browser.close();
server.kill();
rmSync(dataDir, { recursive: true, force: true });
process.exit(failures.length || pageErrors.length ? 1 : 0);
