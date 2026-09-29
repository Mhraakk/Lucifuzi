// هفت ابزار تازه — tools no other gold-shop software has, all built on the same books (nothing here books a trade by
// itself; every change to the ledger still goes through a document):
//   1. مظنه قفل‌شده: a price guaranteed to a customer for a few minutes, with a code; the trade must honour it exactly.
//   2. هشدار نوسان: customers whose goods debt is covered by money (or the other way) and how far the price may move.
//   3. کارت شناسایی شمش: photos and fingerprints of both faces of a sealed bar at entry, compared again at exit.
//   4. شمارش با ترازو: counting sessions (a connected scale or by hand) against the books.
//   5. برگه ته حساب اشتراکی: a dated, revocable link where a customer sees and confirms (or disputes) the balance.
//   6. پیش‌بینی نقدینگی: how much cash, gold and coins to have ready tomorrow morning, from the shop's own history.
//   7. بستن روز: counts, bank, auditor and open items in one step, closed with the manager's digital signature; a
//      closed day cannot be changed without reopening it with a reason.
import { createHash, randomBytes, randomUUID, generateKeyPairSync, createPrivateKey, createPublicKey, sign as edSign, verify as edVerify } from 'node:crypto';
import * as B from '../public/js/books.mjs';
import * as TR from '../public/js/trade.mjs';
import { TRADE_COINS as COIN_TYPES } from '../public/js/coins.mjs';
import { verifyPin } from './auth.mjs';
import { tehranHour } from './tz.mjs';

export const IDEAS_SCHEMA = `
CREATE TABLE IF NOT EXISTS bk_quotes (id TEXT PRIMARY KEY, no INTEGER NOT NULL, party_id TEXT, spec_json TEXT NOT NULL, created_by TEXT, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', doc_id TEXT, note TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS bk_shares (id TEXT PRIMARY KEY, party_id TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, created_by TEXT, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, revoked INTEGER NOT NULL DEFAULT 0, views INTEGER NOT NULL DEFAULT 0, last_view_at TEXT, answer TEXT, answer_note TEXT, answered_at TEXT, answer_json TEXT);
CREATE INDEX IF NOT EXISTS idx_shares_party ON bk_shares(party_id);
CREATE TABLE IF NOT EXISTS bk_bar_cards (id TEXT PRIMARY KEY, serial TEXT NOT NULL, side TEXT NOT NULL, kind TEXT NOT NULL, image TEXT NOT NULL, dhash TEXT NOT NULL, blocks TEXT NOT NULL, score REAL, created_by TEXT, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_barcards ON bk_bar_cards(serial, side, kind);
CREATE TABLE IF NOT EXISTS bk_counts (id TEXT PRIMARY KEY, day TEXT NOT NULL, lines_json TEXT NOT NULL, source TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', created_by TEXT, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_counts_day ON bk_counts(day);
CREATE TABLE IF NOT EXISTS bk_closes (day TEXT PRIMARY KEY, data_json TEXT NOT NULL, hash TEXT NOT NULL, prev_hash TEXT, signature TEXT NOT NULL, signer TEXT NOT NULL, signer_name TEXT NOT NULL, created_at TEXT NOT NULL, reopened_at TEXT, reopen_reason TEXT, reopened_by TEXT);
`;

const now = () => new Date().toISOString();
const DAY = 864e5;
const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const sha = (s) => createHash('sha256').update(s).digest('hex');
const txt = (v, max = 200) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
const canon = (o) => JSON.stringify(o, Object.keys(o).sort());
const weekdayOf = (iso) => new Date(`${iso}T12:00:00Z`).getUTCDay();
const WD = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'];

/** Weighted quantile of values with weights (both arrays). */
function wq(vals, ws, q) {
  const idx = vals.map((v, i) => [v, ws[i]]).sort((a, b) => a[0] - b[0]);
  const tot = idx.reduce((s, x) => s + x[1], 0);
  if (!tot) return 0;
  let acc = 0;
  for (const [v, w] of idx) {
    acc += w;
    if (acc / tot >= q) return v;
  }
  return idx.at(-1)[0];
}

/** Similarity of two bar-face fingerprints: 64-bit difference hash and a 16×16 grey block map (Pearson). */
export function barSimilarity(a, b) {
  const bits = (h) => BigInt(`0x${h}`);
  let x = bits(a.dhash) ^ bits(b.dhash), d = 0;
  while (x) (d += Number(x & 1n)), (x >>= 1n);
  const s1 = 1 - d / 64;
  const A = a.blocks, Bb = b.blocks, n = Math.min(A.length, Bb.length);
  const ma = A.reduce((s, v) => s + v, 0) / n, mb = Bb.reduce((s, v) => s + v, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) (num += (A[i] - ma) * (Bb[i] - mb)), (da += (A[i] - ma) ** 2), (db += (Bb[i] - mb) ** 2);
  const s2 = da && db ? num / Math.sqrt(da * db) : 0;
  const score = Math.max(0, Math.min(1, 0.4 * s1 + 0.6 * Math.max(0, s2)));
  return { score: Math.round(score * 1000) / 1000, hash: Math.round(s1 * 1000) / 1000, blocks: Math.round(s2 * 1000) / 1000, verdict: score >= 0.85 ? 'match' : score >= 0.7 ? 'unsure' : 'mismatch' };
}

export function makeIdeas({ db, on, call, settings, getSetting, saveSetting, livePrices, tehranDay, bad, notFound, HttpError, isAdmin, guardAdmin, log, sealer, shopId, partyRow, verifyLog }) {
  db.raw.exec(IDEAS_SCHEMA);
  const SYS = { id: null, role: 'owner', name: 'سامانه' };
  const forbid = (m) => new HttpError(403, m);

  /* =============================== 1. locked quotes =============================== */
  const quoteOut = (q) => {
    const spec = JSON.parse(q.spec_json);
    const p = q.party_id ? partyRow(q.party_id) : null;
    const left = Math.max(0, Math.round((Date.parse(q.expires_at) - Date.now()) / 1000));
    return { id: q.id, code: `Q${q.no}`, no: q.no, party: p ? { id: p.id, label: TR.partyLabel(p) } : null, ...spec, createdAt: q.created_at, expiresAt: q.expires_at, secondsLeft: left, status: q.status === 'open' && !left ? 'expired' : q.status, docId: q.doc_id, note: q.note };
  };
  function cleanQuote(body) {
    const kind = ['melt', 'coin', 'fx', 'bar'].includes(body.kind) ? body.kind : null;
    if (!kind) throw bad('نوع کالای قیمت قفل‌شده نامعتبر است.');
    const dir = body.dir === 'in' ? 'in' : body.dir === 'out' ? 'out' : null;
    if (!dir) throw bad('جهت معامله (خرید از مشتری یا فروش به مشتری) را مشخص کنید.');
    const price = Math.round(B.num(body.price));
    if (!(price > 0 && price < 1e15)) throw bad('قیمت قفل‌شده نامعتبر است.');
    const spec = { kind, dir, price, basis: kind === 'melt' || kind === 'bar' ? 'mazaneh' : 'unit' };
    if (kind === 'coin') {
      if (!COIN_TYPES[body.coin]) throw bad('نوع سکه نامعتبر است.');
      spec.coin = body.coin;
    }
    if (kind === 'fx') {
      if (!TR.FX_CODES[body.code]) throw bad('نوع ارز نامعتبر است.');
      spec.fxCode = body.code;
    }
    const qty = B.num(body.qty);
    if (qty > 0) spec.qty = kind === 'melt' || kind === 'bar' ? B.r3(qty) : qty;
    const minutes = Math.round(B.num(body.minutes || 10));
    if (!(minutes >= 1 && minutes <= 120)) throw bad('مدت قفل ۱ تا ۱۲۰ دقیقه است.');
    return { spec, minutes };
  }
  on('POST', '/api/books/quotes', 'auth', ({ user, body }) => {
    const { spec, minutes } = cleanQuote(body);
    const partyId = body.partyId || null;
    if (partyId && !partyRow(partyId)) throw bad('مشتری پیدا نشد.');
    const lp = livePrices();
    // the board price at the moment of the lock, kept beside the promise for the auditor
    spec.board = spec.kind === 'coin' ? lp.price[`COIN:${spec.coin}`] ?? null : spec.kind === 'fx' ? lp.price[`FX:${spec.fxCode}`] ?? null : lp.mazaneh ?? null;
    const id = randomUUID();
    const no = (db.get('SELECT MAX(no) AS m FROM bk_quotes').m ?? 1000) + 1;
    const t = now();
    db.run('INSERT INTO bk_quotes(id,no,party_id,spec_json,created_by,created_at,expires_at,status,note) VALUES (?,?,?,?,?,?,?,?,?)', id, no, partyId, JSON.stringify(spec), user.id, t, new Date(Date.now() + minutes * 60000).toISOString(), 'open', txt(body.note, 200));
    log(user, 'quote.create', id, { no, ...spec, minutes, partyId });
    return quoteOut(db.get('SELECT * FROM bk_quotes WHERE id=?', id));
  });
  on('GET', '/api/books/quotes', 'auth', ({ url }) => {
    const st = url.searchParams.get('status');
    const rows = db.all('SELECT * FROM bk_quotes ORDER BY created_at DESC LIMIT 200').map(quoteOut);
    return { items: st ? rows.filter((q) => q.status === st) : rows };
  });
  on('GET', '/api/books/quotes/:id', 'auth', ({ params }) => {
    const q = db.get('SELECT * FROM bk_quotes WHERE id=? OR no=?', params.id, Number(String(params.id).replace(/^Q/i, '')) || -1);
    if (!q) throw notFound('قیمت قفل‌شده پیدا نشد.');
    return quoteOut(q);
  });
  on('POST', '/api/books/quotes/:id/cancel', 'auth', ({ user, params }) => {
    const q = db.get('SELECT * FROM bk_quotes WHERE id=?', params.id);
    if (!q) throw notFound('قیمت قفل‌شده پیدا نشد.');
    if (q.status !== 'open') throw bad('این قیمت دیگر باز نیست.');
    db.run("UPDATE bk_quotes SET status='cancelled' WHERE id=?", q.id);
    log(user, 'quote.cancel', q.id, { no: q.no });
    return quoteOut(db.get('SELECT * FROM bk_quotes WHERE id=?', q.id));
  });
  /** A trade line that names a quote must be exactly what was promised, before it runs out. */
  function checkQuotes(doc, calc, prev) {
    const used = [];
    doc.lines.forEach((l, i) => {
      if (!l.quote) return;
      const q = db.get('SELECT * FROM bk_quotes WHERE id=?', l.quote);
      if (!q) throw bad('قیمت قفل‌شده این ردیف پیدا نشد.');
      const o = quoteOut(q);
      const already = q.doc_id && q.doc_id === prev?.id;
      if (!already) {
        if (o.status === 'expired') throw new HttpError(409, `قیمت قفل‌شده ${o.code} منقضی شده است؛ قیمت تازه بگیرید.`);
        if (o.status !== 'open') throw new HttpError(409, `قیمت قفل‌شده ${o.code} ${o.status === 'used' ? 'قبلاً در سند دیگری استفاده شده' : 'لغو شده'} است.`);
      }
      if (doc.type !== 'trade' || l.kind !== o.kind || l.dir !== o.dir || (o.coin && l.coin !== o.coin) || (o.fxCode && l.code !== o.fxCode)) throw bad(`ردیف ${i + 1} با قیمت قفل‌شده ${o.code} نمی‌خواند (نوع کالا یا جهت).`);
      if (o.party && doc.partyId !== o.party.id) throw bad(`قیمت ${o.code} برای مشتری دیگری قفل شده است.`);
      const c = calc.lines[i];
      const given = o.basis === 'mazaneh' ? Math.round(B.num(l.mazaneh)) : o.kind === 'coin' ? Math.round(c.value / (c.count || c.amt || 1)) : Math.round(B.num(l.rate));
      if (given !== o.price) throw bad(`ردیف ${i + 1}: قیمت باید دقیقاً همان قیمت قفل‌شده ${o.code} باشد (${B.fmtMoney(o.price, 'rial')}).`);
      if (o.qty && (o.kind === 'melt' || o.kind === 'bar' ? c.eq750 > o.qty + 1e-9 : (c.count ?? c.amt) > o.qty)) throw bad(`ردیف ${i + 1} از مقدار قفل‌شده ${o.code} بیشتر است.`);
      used.push(q.id);
    });
    return used;
  }

  /* =============================== 7 (guard). closed days =============================== */
  const lastClosed = () => db.get('SELECT MAX(day) AS d FROM bk_closes WHERE reopened_at IS NULL').d;
  function checkClosed(user, doc, prev) {
    const d = lastClosed();
    if (!d) return;
    for (const day of [doc?.date, prev?.date]) if (day && day <= d) throw forbid(`روز ${B.faNum(day)} بسته و امضا شده است؛ برای تغییر اسناد آن، مالک باید روز را با ذکر دلیل باز کند.`);
  }
  const hooks = {
    check(user, doc, calc, prev) {
      checkClosed(user, doc, prev);
      return checkQuotes(doc, calc, prev);
    },
    commit(docId, used) {
      for (const id of used) db.run("UPDATE bk_quotes SET status='used', doc_id=? WHERE id=?", docId, id);
    },
    voiding(user, row) {
      checkClosed(user, null, { date: row.date });
      // a voided trade frees nothing: the promise was honoured once
    },
  };

  /* =============================== 2. price-move risk =============================== */
  function risk() {
    const lp = livePrices();
    const margin = (settings().riskMarginPct ?? 10) / 100;
    const rows = db.all("SELECT acct, unit, SUM(amt) AS s FROM bk_postings WHERE acct LIKE 'party:%' GROUP BY acct, unit HAVING ABS(SUM(amt)) > 1e-9");
    const by = new Map();
    for (const r of rows) {
      const m = by.get(r.acct) ?? {};
      m[r.unit] = r.s;
      by.set(r.acct, m);
    }
    const out = [];
    for (const [acct, bal] of by) {
      const money = bal.IRR ?? 0;
      let goods = 0, goodsG = 0, unpriced = false;
      for (const [u, v] of Object.entries(bal)) {
        if (u === 'IRR') continue;
        const p = u === 'G750' ? lp.price.G750 : u.startsWith('BAR:') ? null : lp.price[u];
        if (!p) {
          unpriced = true;
          continue;
        }
        goods += v * p;
        if (u === 'G750') goodsG += v;
      }
      if (unpriced && !goods) continue;
      const p = partyRow(acct.slice(6));
      if (!p) continue;
      const base = { party: { id: p.id, label: TR.partyLabel(p), mobile: p.mobile ?? '' }, money: Math.round(money), goodsValue: Math.round(goods), goldGrams: B.r3(goodsG), balance: bal };
      // A: owes goods, the shop holds their money → a rising price eats the cover
      if (goods > 0 && money < 0) {
        const cover = -money / goods;
        const breakP750 = goodsG > 0 ? Math.round((-money - (goods - goodsG * lp.price.G750)) / goodsG) : null;
        const movePct = goodsG > 0 && breakP750 ? ((breakP750 - lp.price.G750) / lp.price.G750) * 100 : null;
        out.push({ ...base, kind: 'short', cover: Math.round(cover * 1000) / 1000, sev: cover < 1 ? 'high' : cover < 1 + margin ? 'mid' : 'low', breakP750, movePct: movePct == null ? null : Math.round(movePct * 10) / 10, text: cover < 1 ? 'بدهی جنسی از پول نزد ما بیشتر شده است' : `با ${movePct == null ? '?' : B.faNum(Math.abs(Math.round(movePct * 10) / 10))}٪ بالا رفتن قیمت، پول نزد ما بدهی جنسی را پوشش نمی‌دهد` });
      } else if (money > 0 && goods < 0) {
        // B: owes money, the shop holds their gold → a falling price eats the cover
        const cover = -goods / money;
        const breakP750 = goodsG < 0 ? Math.round((money - (-goods + goodsG * lp.price.G750)) / -goodsG) : null;
        const movePct = goodsG < 0 && breakP750 ? ((breakP750 - lp.price.G750) / lp.price.G750) * 100 : null;
        out.push({ ...base, kind: 'long', cover: Math.round(cover * 1000) / 1000, sev: cover < 1 ? 'high' : cover < 1 + margin ? 'mid' : 'low', breakP750, movePct: movePct == null ? null : Math.round(movePct * 10) / 10, text: cover < 1 ? 'طلای امانی از بدهی مالی کمتر شده است' : `با ${movePct == null ? '?' : B.faNum(Math.abs(Math.round(movePct * 10) / 10))}٪ پایین آمدن قیمت، طلای امانی بدهی را پوشش نمی‌دهد` });
      } else if (goods > 0 && money >= 0) {
        // C: owes both, no cover at all
        out.push({ ...base, kind: 'naked', cover: 0, sev: goods + money > (settings().riskNakedLimit ?? 5e9) ? 'mid' : 'low', breakP750: null, movePct: null, text: 'بدهی جنسی بدون وثیقه؛ هر بالا رفتن قیمت، طلب شما را بزرگ‌تر می‌کند' });
      }
    }
    const order = { high: 0, mid: 1, low: 2 };
    out.sort((a, b) => order[a.sev] - order[b.sev] || a.cover - b.cover);
    return { at: now(), p750: lp.price.G750, mazaneh: lp.mazaneh, sample: !!lp.sample, marginPct: margin * 100, items: out, count: { high: out.filter((x) => x.sev === 'high').length, mid: out.filter((x) => x.sev === 'mid').length } };
  }
  on('GET', '/api/books/risk', 'auth', ({ user }) => {
    guardAdmin(user);
    return risk();
  });

  /* =============================== 3. bar identity cards =============================== */
  const serialOk = (s) => /^[A-Z0-9-]{3,30}$/.test(s);
  on('POST', '/api/books/bars/:serial/card', 'auth', ({ user, params, body }) => {
    const serial = TR.normSerial(params.serial);
    if (!serialOk(serial)) throw bad('سریال شمش نامعتبر است.');
    const side = body.side === 'back' ? 'back' : body.side === 'front' ? 'front' : null;
    if (!side) throw bad('روی شمش (جلو یا پشت) را مشخص کنید.');
    const kind = body.kind === 'check' ? 'check' : 'entry';
    const image = String(body.image ?? '');
    if (!/^data:image\/(jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(image) || image.length > 1_200_000) throw bad('عکس باید JPEG یا WebP و کمتر از ۹۰۰ کیلوبایت باشد.');
    const dhash = String(body.dhash ?? '');
    const blocks = Array.isArray(body.blocks) ? body.blocks.map(Number) : [];
    if (!/^[0-9a-f]{16}$/.test(dhash) || blocks.length !== 256 || blocks.some((v) => !(v >= 0 && v <= 255))) throw bad('اثر انگشت تصویر نامعتبر است.');
    let result = null;
    if (kind === 'check') {
      const ref = db.get("SELECT * FROM bk_bar_cards WHERE serial=? AND side=? AND kind='entry' ORDER BY created_at DESC LIMIT 1", serial, side);
      if (!ref) throw bad(`برای ${side === 'front' ? 'روی' : 'پشت'} این شمش هنوز کارت ورود ثبت نشده است.`);
      result = barSimilarity({ dhash: ref.dhash, blocks: JSON.parse(ref.blocks) }, { dhash, blocks });
    }
    const id = randomUUID();
    db.run('INSERT INTO bk_bar_cards(id,serial,side,kind,image,dhash,blocks,score,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)', id, serial, side, kind, image, dhash, JSON.stringify(blocks), result?.score ?? null, user.id, now());
    log(user, kind === 'check' ? 'bar.check' : 'bar.card', serial, { side, ...(result ? { score: result.score, verdict: result.verdict } : {}) });
    return { id, serial, side, kind, ...(result ? { result } : {}) };
  });
  on('GET', '/api/books/bars/:serial/cards', 'auth', ({ params }) => {
    const serial = TR.normSerial(params.serial);
    const rows = db.all('SELECT id, side, kind, image, score, created_by, created_at FROM bk_bar_cards WHERE serial=? ORDER BY created_at', serial);
    const latest = (side, kind) => rows.filter((r) => r.side === side && r.kind === kind).at(-1) ?? null;
    return {
      serial,
      entry: { front: latest('front', 'entry'), back: latest('back', 'entry') },
      checks: rows.filter((r) => r.kind === 'check').map((r) => ({ ...r, verdict: r.score >= 0.85 ? 'match' : r.score >= 0.7 ? 'unsure' : 'mismatch' })),
    };
  });

  /* =============================== 4. counting sessions (scale or by hand) =============================== */
  function booksNow() {
    const v = call('GET', '/api/books/vault', SYS);
    const map = { gold: v.gold, ...Object.fromEntries(Object.entries(v.coins).map(([k, n]) => [`coin:${k}`, n])), ...Object.fromEntries(Object.entries(v.fx).map(([k, n]) => [`fx:${k}`, n])), ...Object.fromEntries(Object.entries(v.cash).map(([k, n]) => [`cash:${k}`, n])) };
    return { map, bars: v.bars.map((b) => b.serial) };
  }
  function cleanCount(lines) {
    if (!Array.isArray(lines) || !lines.length) throw bad('دست‌کم یک قلم شمارش لازم است.');
    return lines.slice(0, 200).map((l) => {
      const acct = String(l.acct ?? '');
      if (!/^(gold|coin:\w+|fx:[A-Z]+|cash:[\w-]{1,40})$/.test(acct)) throw bad(`قلم شمارش ${acct} نامعتبر است.`);
      if (acct.startsWith('coin:') && !COIN_TYPES[acct.slice(5)]) throw bad('نوع سکه نامعتبر است.');
      const counted = B.num(l.counted);
      if (!Number.isFinite(counted) || counted < 0) throw bad('مقدار شمرده‌شده نامعتبر است.');
      return { acct, counted: acct === 'gold' ? B.r3(counted) : acct.startsWith('fx:') ? Math.round(counted * 100) / 100 : Math.round(counted), source: l.source === 'scale' ? 'scale' : 'hand', ...(l.raw ? { raw: txt(l.raw, 60) } : {}), ...(B.num(l.gross) > 0 ? { gross: B.r3(B.num(l.gross)), tare: B.r3(B.num(l.tare) || 0) } : {}) };
    });
  }
  on('POST', '/api/books/counts', 'auth', ({ user, body }) => {
    const lines = cleanCount(body.lines);
    const bk = booksNow().map;
    const withDiff = lines.map((l) => ({ ...l, books: bk[l.acct] ?? 0, diff: l.acct === 'gold' ? B.r3(l.counted - (bk[l.acct] ?? 0)) : Math.round((l.counted - (bk[l.acct] ?? 0)) * 100) / 100 }));
    const id = randomUUID();
    db.run('INSERT INTO bk_counts(id,day,lines_json,source,note,created_by,created_at) VALUES (?,?,?,?,?,?,?)', id, tehranDay(), JSON.stringify(withDiff), lines.some((l) => l.source === 'scale') ? 'scale' : 'hand', txt(body.note, 300), user.id, now());
    log(user, 'count.save', id, { lines: withDiff.length, off: withDiff.filter((l) => l.diff).length });
    return { id, day: tehranDay(), lines: withDiff, balanced: withDiff.every((l) => !l.diff) };
  });
  on('GET', '/api/books/counts', 'auth', ({ url }) => {
    const day = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('day') ?? '') ? url.searchParams.get('day') : tehranDay();
    return { day, items: db.all('SELECT * FROM bk_counts WHERE day=? ORDER BY created_at DESC', day).map((r) => ({ id: r.id, day: r.day, source: r.source, note: r.note, at: r.created_at, lines: JSON.parse(r.lines_json) })), books: booksNow().map, scale: getSetting('scale', { baud: 9600, tares: {} }) };
  });
  on('PUT', '/api/books/scale', 'auth', ({ user, body }) => {
    guardAdmin(user);
    const baud = [1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200].includes(Number(body.baud)) ? Number(body.baud) : 9600;
    const tares = Object.fromEntries(Object.entries(body.tares ?? {}).slice(0, 30).map(([k, v]) => [txt(k, 40), B.r3(B.num(v))]).filter(([k, v]) => k && v >= 0 && v < 100000));
    saveSetting('scale', { baud, tares }, user.id);
    return { baud, tares };
  });

  /* =============================== 5. shared statement links =============================== */
  const shareHash = (tok) => sha(`share:${tok}`);
  on('POST', '/api/books/parties/:id/share', 'auth', ({ user, params, body }) => {
    const p = partyRow(params.id);
    if (!p) throw notFound('مشتری پیدا نشد.');
    const days = Math.max(1, Math.min(30, Math.round(B.num(body.days || 7))));
    const rand = randomBytes(18).toString('base64url');
    const token = `${shopId}~${rand}`;
    const id = randomUUID();
    db.run('INSERT INTO bk_shares(id,party_id,token_hash,created_by,created_at,expires_at) VALUES (?,?,?,?,?,?)', id, p.id, shareHash(token), user.id, now(), new Date(Date.now() + days * DAY).toISOString());
    log(user, 'share.create', p.id, { share: id, days });
    return { id, token, path: `/s/${token}`, expiresAt: new Date(Date.now() + days * DAY).toISOString() };
  });
  on('GET', '/api/books/parties/:id/shares', 'auth', ({ params }) => ({ items: db.all('SELECT id, created_at, expires_at, revoked, views, last_view_at, answer, answer_note, answered_at, answer_json FROM bk_shares WHERE party_id=? ORDER BY created_at DESC LIMIT 50', params.id).map((r) => ({ ...r, answer_json: undefined, confirmed: r.answer_json ? JSON.parse(r.answer_json) : null, expired: r.expires_at < now() })) }));
  on('POST', '/api/books/shares/:id/revoke', 'auth', ({ user, params }) => {
    db.run('UPDATE bk_shares SET revoked=1 WHERE id=?', params.id);
    log(user, 'share.revoke', params.id, {});
    return { ok: true };
  });
  const publicHits = new Map();
  const shareFor = (token, ip) => {
    const t = Date.now(), h = publicHits.get(ip);
    if (!h || t - h.t0 > 60000) publicHits.set(ip, { t0: t, n: 1 });
    else if (++h.n > 60) throw new HttpError(429, 'درخواست زیاد است؛ یک دقیقه بعد دوباره باز کنید.');
    if (publicHits.size > 5000) publicHits.clear();
    const s = db.get('SELECT * FROM bk_shares WHERE token_hash=?', shareHash(String(token)));
    if (!s || s.revoked) throw notFound('این برگه وجود ندارد یا لغو شده است.');
    if (s.expires_at < now()) throw new HttpError(410, 'مهلت این برگه تمام شده است؛ از فروشگاه برگه تازه بخواهید.');
    return s;
  };
  function statementView(s) {
    const d = call('GET', '/api/books/parties/:id', SYS, { params: { id: s.party_id } });
    const since = addDays(tehranDay(), -60);
    const brand = getSetting('brand', {}).shopName || settings().legalName || '';
    return {
      shop: brand,
      party: TR.partyLabel(d.party),
      asOf: now(),
      balance: d.balance,
      lines: d.statement.filter((r) => r.date >= since).slice(-40).map((r) => ({ date: r.date, unit: r.unit, amt: r.amt, balance: r.balance, what: r.doc ? B.DOC_TYPES[r.doc.type]?.short ?? '' : 'مانده', track: r.doc?.track ?? null })),
      expiresAt: s.expires_at,
      answer: s.answer ? { answer: s.answer, note: s.answer_note, at: s.answered_at } : null,
    };
  }
  on('GET', '/api/public/statement/:token', 'public', ({ params, ip }) => {
    const s = shareFor(params.token, ip);
    db.run('UPDATE bk_shares SET views=views+1, last_view_at=? WHERE id=?', now(), s.id);
    return statementView(s);
  });
  on('POST', '/api/public/statement/:token', 'public', ({ params, body, ip }) => {
    const s = shareFor(params.token, ip);
    if (s.answer) throw new HttpError(409, 'پاسخ این برگه قبلاً ثبت شده است.');
    const answer = body.answer === 'agree' ? 'agree' : body.answer === 'dispute' ? 'dispute' : null;
    if (!answer) throw bad('پاسخ نامعتبر است.');
    const note = txt(body.note, 500);
    if (answer === 'dispute' && note.length < 3) throw bad('مغایرت را در چند کلمه بنویسید.');
    const view = statementView(s);
    const snap = { balance: view.balance, at: now(), ipHash: sha(`${ip}|${s.id}`).slice(0, 16) };
    db.run('UPDATE bk_shares SET answer=?, answer_note=?, answered_at=?, answer_json=? WHERE id=?', answer, note, now(), JSON.stringify(snap), s.id);
    log({ id: null, name: 'مشتری' }, answer === 'agree' ? 'share.confirm' : 'share.dispute', s.party_id, { share: s.id, balance: view.balance, note: note || undefined });
    return { ok: true, answer };
  });

  /* =============================== 6. liquidity forecast =============================== */
  function dayFlows(from, to) {
    const docs = db.all("SELECT id, type, date, issued_at, created_at, data_json, calc_json FROM bk_docs WHERE status='final' AND date>=? AND date<=? AND type IN ('trade','sale','buy','return','receipt','payment','expense') ORDER BY date, COALESCE(issued_at, created_at)", from, to);
    const days = new Map();
    for (const d of docs) {
      const c = JSON.parse(d.calc_json), data = JSON.parse(d.data_json);
      const e = days.get(d.date) ?? { day: d.date, docs: 0, steps: [], hours: Array(24).fill(0) };
      e.docs++;
      const at = d.issued_at ?? d.created_at;
      e.hours[tehranHour(at)]++;
      const step = { cash: 0, gold: 0, coins: {} };
      for (const p of data.payments ?? []) {
        if (B.payMethod(p.method)?.acct !== 'cash') continue;
        const v = B.rnd(B.num(p.amount) * (d.type === 'trade' ? 1 : 10));
        step.cash += p.dir === 'in' ? v : -v;
      }
      if (d.type === 'trade') for (const l of c.lines ?? []) {
        if (l.kind === 'melt') step.gold += l.dir === 'in' ? l.eq750 : -l.eq750;
        if (l.kind === 'coin') step.coins[l.coin] = (step.coins[l.coin] ?? 0) + (l.dir === 'in' ? l.count : -l.count);
      }
      e.steps.push(step);
      days.set(d.date, e);
    }
    return days;
  }
  /** The most a day drew down (cash paid out, gold and coins handed over) before the day's own receipts came back. */
  const drawdown = (steps, pick) => {
    let run = 0, low = 0;
    for (const s of steps) (run += pick(s)), (low = Math.min(low, run));
    return -low;
  };
  function forecastFor(target, weeks = 12, shared = null) {
    const wd = weekdayOf(target);
    const from = addDays(target, -weeks * 7);
    // only days before the target are looked up, so a wider shared map gives the same answer
    const flows = shared ?? dayFlows(from, addDays(target, -1));
    const samples = [];
    for (let k = 1; k <= weeks; k++) {
      const day = addDays(target, -7 * k);
      if (day < from) break;
      const f = flows.get(day) ?? { day, docs: 0, steps: [], hours: Array(24).fill(0) };
      samples.push({ day, w: 0.85 ** (k - 1), f });
    }
    const active = samples.filter((s) => s.f.docs);
    const ws = samples.map((s) => s.w);
    const coinIds = [...new Set(samples.flatMap((s) => s.f.steps.flatMap((st) => Object.keys(st.coins))))];
    const need = (pick) => {
      const vals = samples.map((s) => drawdown(s.f.steps, pick));
      return { p50: Math.round(wq(vals, ws, 0.5)), p90: Math.round(wq(vals, ws, 0.9)), max: Math.round(Math.max(0, ...vals)) };
    };
    const cash = need((s) => s.cash);
    const gold = (() => {
      const vals = samples.map((s) => drawdown(s.f.steps, (st) => st.gold));
      return { p50: B.r3(wq(vals, ws, 0.5)), p90: B.r3(wq(vals, ws, 0.9)), max: B.r3(Math.max(0, ...vals)) };
    })();
    const coins = Object.fromEntries(coinIds.map((c) => [c, need((st) => st.coins[c] ?? 0)]));
    const hours = Array.from({ length: 24 }, (_, h) => Math.round((samples.reduce((s, x) => s + x.w * x.f.hours[h], 0) / (ws.reduce((a, b) => a + b, 0) || 1)) * 10) / 10);
    const docs = Math.round((samples.reduce((s, x) => s + x.w * x.f.docs, 0) / (ws.reduce((a, b) => a + b, 0) || 1)) * 10) / 10;
    return { target, weekday: WD[wd], samples: samples.length, activeSamples: active.length, cash, gold, coins, hours, docs };
  }
  on('GET', '/api/books/forecast', 'auth', ({ user, url }) => {
    guardAdmin(user);
    const target = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('day') ?? '') ? url.searchParams.get('day') : addDays(tehranDay(), 1);
    // the documents of all seven forecasts (today's and six back-tests) are read once
    const flowsAll = dayFlows(addDays(target, -7 * 6 - 12 * 7), target);
    const f = forecastFor(target, 12, flowsAll);
    const v = call('GET', '/api/books/vault', SYS);
    const cashNow = Object.values(v.cash).reduce((s, x) => s + x, 0);
    // back-test: the same forecast for each of the last six same weekdays, against what actually happened
    const tests = [];
    for (let k = 1; k <= 6; k++) {
      const day = addDays(target, -7 * k);
      const fc = forecastFor(day, 12, flowsAll);
      if (fc.activeSamples < 2) continue;
      const actual = flowsAll.get(day);
      const real = actual ? drawdown(actual.steps, (s) => s.cash) : 0;
      tests.push({ day, p50: fc.cash.p50, p90: fc.cash.p90, actual: Math.round(real), covered: real <= fc.cash.p90 });
    }
    const enough = f.activeSamples >= 3;
    return {
      ...f,
      enough,
      have: { cash: cashNow, gold: v.gold, coins: v.coins },
      short: { cash: Math.max(0, f.cash.p90 - cashNow), gold: B.r3(Math.max(0, f.gold.p90 - v.gold)), coins: Object.fromEntries(Object.entries(f.coins).map(([c, n]) => [c, Math.max(0, n.p90 - (v.coins[c] ?? 0))]).filter(([, n]) => n)) },
      backtest: { days: tests, hitRate: tests.length ? Math.round((tests.filter((t) => t.covered).length / tests.length) * 100) : null, mae: tests.length ? Math.round(tests.reduce((s, t) => s + Math.abs(t.actual - t.p50), 0) / tests.length) : null },
    };
  });

  /* =============================== 7. one-button day close =============================== */
  function shopKey() {
    let k = getSetting('closeKey', null);
    if (!k?.pub) {
      const { publicKey, privateKey } = generateKeyPairSync('ed25519');
      const pub = publicKey.export({ type: 'spki', format: 'pem' });
      const priv = privateKey.export({ type: 'pkcs8', format: 'pem' });
      k = { pub, privSealed: sealer ? sealer.seal(priv, `close:${shopId}`) : null, privPlain: sealer ? undefined : priv, createdAt: now() };
      saveSetting('closeKey', k, null);
    }
    return { pub: k.pub, priv: k.privSealed ? sealer.open(k.privSealed, `close:${shopId}`) : k.privPlain };
  }
  function closeView(day) {
    const dbk = call('GET', '/api/books/daybook', SYS, { query: { day } });
    const today = tehranDay();
    const cashBooks = {};
    for (const r of db.all("SELECT acct, SUM(amt) AS s FROM bk_postings WHERE acct LIKE 'cash:%' AND date<=? GROUP BY acct", day)) cashBooks[r.acct] = Math.round(r.s);
    const accounts = Object.fromEntries(db.all('SELECT id, kind, title FROM bk_accounts').map((a) => [`${a.kind}:${a.id}`, a.title]));
    let bankOpen = 0;
    for (const a of db.all("SELECT id FROM bk_accounts WHERE kind='bank'")) {
      try {
        bankOpen += call('GET', '/api/books/bank/:id', SYS, { params: { id: a.id } }).rows.filter((r) => !r.reconciled && r.date === day).length;
      } catch {
        /* no bank rows */
      }
    }
    let auditCount = { high: 0, mid: 0 };
    try {
      const a = call('GET', '/api/books/audit', SYS);
      auditCount = { high: a.count.high, mid: a.count.mid, score: a.score };
    } catch {
      /* the auditor is optional here */
    }
    const counts = db.all('SELECT * FROM bk_counts WHERE day=? ORDER BY created_at DESC', day).map((r) => ({ id: r.id, at: r.created_at, source: r.source, lines: JSON.parse(r.lines_json) }));
    const lastCount = counts[0] ?? null;
    const drafts = db.get("SELECT COUNT(*) AS n FROM bk_docs WHERE status='draft' AND date<=?", day).n;
    const quotesOpen = db.all("SELECT * FROM bk_quotes WHERE status='open'").map(quoteOut).filter((q) => q.status === 'open').length;
    let conditional = 0;
    try {
      conditional = call('GET', '/api/books/conditional', SYS).items?.length ?? 0;
    } catch {
      /* none */
    }
    const r = risk();
    const chain = verifyLog?.() ?? { ok: true };
    const checks = [
      { key: 'count', title: 'شمارش فیزیکی گاوصندوق و صندوق نقد', ok: !!lastCount && lastCount.lines.every((l) => !l.diff), warn: !lastCount ? 'امروز شمارش ثبت نشده است.' : lastCount.lines.some((l) => l.diff) ? `${B.faNum(lastCount.lines.filter((l) => l.diff).length)} قلم با دفتر اختلاف دارد؛ سند اصلاح موجودی بزنید یا توضیح دهید.` : '' },
      { key: 'bank', title: 'تطبیق بانک همین روز', ok: bankOpen === 0, warn: bankOpen ? `${B.faNum(bankOpen)} ردیف بانکی امروز تطبیق نشده است.` : '' },
      { key: 'audit', title: 'ممیز', ok: !auditCount.high, warn: auditCount.high ? `${B.faNum(auditCount.high)} هشدار جدی باز است.` : '' },
      { key: 'drafts', title: 'پیش‌نویس‌های باز', ok: !drafts, warn: drafts ? `${B.faNum(drafts)} سند پیش‌نویس مانده است.` : '' },
      { key: 'quotes', title: 'قیمت‌های قفل‌شده باز', ok: !quotesOpen, warn: quotesOpen ? `${B.faNum(quotesOpen)} قیمت قفل‌شده هنوز باز است.` : '' },
      { key: 'assay', title: 'آبشده شرطی در انتظار آزمایشگاه', ok: !conditional, warn: conditional ? `${B.faNum(conditional)} ردیف شرطی منتظر عیار نهایی است.` : '' },
      { key: 'risk', title: 'هشدار نوسان مشتریان', ok: !r.count.high, warn: r.count.high ? `${B.faNum(r.count.high)} مشتری بی‌پوشش است.` : '' },
      { key: 'chain', title: 'زنجیره رویدادهای دفتر', ok: chain.ok !== false, warn: chain.ok === false ? 'زنجیره دفتر رویداد گسسته است.' : '' },
    ];
    const close = db.get('SELECT * FROM bk_closes WHERE day=?', day);
    return {
      day, isToday: day === today,
      totals: dbk.totals, entries: dbk.entries.length,
      cash: Object.entries(cashBooks).map(([acct, amt]) => ({ acct, title: accounts[acct] ?? acct, books: amt })),
      counts, checks,
      closed: close ? { at: close.created_at, signer: close.signer_name, hash: close.hash, reopened: close.reopened_at ? { at: close.reopened_at, reason: close.reopen_reason } : null } : null,
      lastClosed: lastClosed(),
      publicKey: shopKey().pub,
    };
  }
  on('GET', '/api/books/close', 'auth', ({ user, url }) => {
    guardAdmin(user);
    const day = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('day') ?? '') ? url.searchParams.get('day') : tehranDay();
    return closeView(day);
  });
  on('POST', '/api/books/close', 'auth', ({ user, body }) => {
    guardAdmin(user);
    const day = /^\d{4}-\d{2}-\d{2}$/.test(body.day ?? '') ? body.day : tehranDay();
    if (day > tehranDay()) throw bad('روز آینده را نمی‌توان بست.');
    const cur = db.get('SELECT * FROM bk_closes WHERE day=?', day);
    if (cur && !cur.reopened_at) throw new HttpError(409, 'این روز قبلاً بسته شده است.');
    // the signature: the manager types their own password again
    const u = db.get('SELECT pin_hash FROM users WHERE id=?', user.id);
    if (!u || !verifyPin(String(body.password ?? ''), u.pin_hash)) throw forbid('رمز امضاکننده درست نیست.');
    const view = closeView(day);
    const open = view.checks.filter((c) => !c.ok);
    const acks = new Set(Array.isArray(body.ack) ? body.ack : []);
    const missing = open.filter((c) => !acks.has(c.key));
    if (missing.length) throw new HttpError(409, `پیش از بستن، این موارد را برطرف یا تأیید کنید: ${missing.map((c) => c.title).join('، ')}.`);
    if (open.length && txt(body.note, 600).length < 3) throw bad('برای مواردی که باز می‌مانند توضیح بنویسید.');
    const prev = db.get('SELECT hash FROM bk_closes WHERE day<? ORDER BY day DESC LIMIT 1', day);
    const data = { day, totals: view.totals, entries: view.entries, cash: view.cash, count: view.counts[0]?.lines ?? null, checks: view.checks.map((c) => ({ key: c.key, ok: c.ok, warn: c.warn })), acknowledged: open.map((c) => c.key), note: txt(body.note, 600), signer: { id: user.id, name: user.name, role: user.role }, at: now(), shop: shopId };
    const hash = sha(`${prev?.hash ?? ''}|${canon(data)}`);
    const signature = edSign(null, Buffer.from(hash), createPrivateKey(shopKey().priv)).toString('base64');
    db.tx(() => {
      db.run('DELETE FROM bk_closes WHERE day=?', day);
      db.run('INSERT INTO bk_closes(day,data_json,hash,prev_hash,signature,signer,signer_name,created_at) VALUES (?,?,?,?,?,?,?,?)', day, JSON.stringify(data), hash, prev?.hash ?? null, signature, user.id, user.name, data.at);
      log(user, 'day.close', day, { hash, acknowledged: data.acknowledged });
    });
    return { ok: true, day, hash, signature };
  });
  on('GET', '/api/books/close/:day/verify', 'auth', ({ params }) => {
    const c = db.get('SELECT * FROM bk_closes WHERE day=?', params.day);
    if (!c) throw notFound('این روز بسته نشده است.');
    const data = JSON.parse(c.data_json);
    const hashOk = sha(`${c.prev_hash ?? ''}|${canon(data)}`) === c.hash;
    const sigOk = edVerify(null, Buffer.from(c.hash), createPublicKey(shopKey().pub), Buffer.from(c.signature, 'base64'));
    return { day: c.day, valid: hashOk && sigOk, hashOk, sigOk, signer: c.signer_name, at: c.created_at, reopened: c.reopened_at ? { at: c.reopened_at, reason: c.reopen_reason } : null, data };
  });
  on('POST', '/api/books/close/:day/reopen', 'auth', ({ user, params, body }) => {
    if (user.role !== 'owner') throw forbid('روز بسته را فقط مالک باز می‌کند.');
    const c = db.get('SELECT * FROM bk_closes WHERE day=?', params.day);
    if (!c || c.reopened_at) throw notFound('روز بسته‌ای با این تاریخ نیست.');
    const reason = txt(body.reason, 300);
    if (reason.length < 3) throw bad('دلیل باز کردن روز را بنویسید.');
    db.run('UPDATE bk_closes SET reopened_at=?, reopen_reason=?, reopened_by=? WHERE day=?', now(), reason, user.id, c.day);
    log(user, 'day.reopen', c.day, { reason });
    return { ok: true };
  });

  /** بستن خودکار: the nightly reconciliation found nothing open, so the day is closed with the shop's key. */
  function closeSystem(day, recon) {
    const cur = db.get('SELECT * FROM bk_closes WHERE day=?', day);
    if (cur && !cur.reopened_at) return { ok: false, already: true };
    const view = closeView(day);
    const prev = db.get('SELECT hash FROM bk_closes WHERE day<? ORDER BY day DESC LIMIT 1', day);
    const data = { day, totals: view.totals, entries: view.entries, cash: view.cash, count: view.counts[0]?.lines ?? null, checks: view.checks.map((c) => ({ key: c.key, ok: c.ok, warn: c.warn })), acknowledged: [], note: 'بستن خودکار شبانه: تطبیق بدون مغایرت', recon, signer: { id: null, name: 'بستن خودکار', role: 'system' }, at: now(), shop: shopId, auto: true };
    const hash = sha(`${prev?.hash ?? ''}|${canon(data)}`);
    const signature = edSign(null, Buffer.from(hash), createPrivateKey(shopKey().priv)).toString('base64');
    db.tx(() => {
      db.run('DELETE FROM bk_closes WHERE day=?', day);
      db.run('INSERT INTO bk_closes(day,data_json,hash,prev_hash,signature,signer,signer_name,created_at) VALUES (?,?,?,?,?,?,?,?)', day, JSON.stringify(data), hash, prev?.hash ?? null, signature, 'system', 'بستن خودکار', data.at);
      log(SYS, 'day.close', day, { hash, auto: true });
    });
    return { ok: true, day, hash };
  }
  return { hooks, risk, closeSystem, closeView };
}
