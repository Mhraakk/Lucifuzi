// Shop books on the server: customers, stock, documents with full version history, cheques, cash and bank
// accounts, derived postings, reports and a hash-chained event log. The arithmetic lives in public/js/books.mjs;
// this module only stores, validates against the database, and derives.
import { createHash, randomUUID } from 'node:crypto';
import * as B from '../public/js/books.mjs';
import { jalaliOf } from '../public/js/ta.mjs';
import { TRADE_COINS as COIN_TYPES, shownCoins } from '../public/js/coins.mjs';
import { makeAudit } from './audit.mjs';
import { makeTrace } from './trace.mjs';
import { makeLearn } from './learn.mjs';
import { makeDashboard } from './dashboard.mjs';
import { makeAssistant } from './assistant.mjs';
import { makeSetup } from './setup.mjs';
import { makeIdeas } from './ideas.mjs';
import { PROVIDERS, checkBaseUrl, keyHint } from './providers.mjs';
import * as TR from '../public/js/trade.mjs';

export const BOOKS_SCHEMA = `
CREATE TABLE IF NOT EXISTS bk_parties (
  id TEXT PRIMARY KEY, code INTEGER NOT NULL UNIQUE, kind TEXT NOT NULL DEFAULT 'person' CHECK (kind IN ('person','company')),
  name TEXT NOT NULL, nid TEXT NOT NULL DEFAULT '', eco TEXT NOT NULL DEFAULT '', mobile TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '',
  postal TEXT NOT NULL DEFAULT '', address TEXT NOT NULL DEFAULT '', birth TEXT NOT NULL DEFAULT '', tags TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '',
  credit_limit INTEGER NOT NULL DEFAULT 0, sms INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_bkp_mobile ON bk_parties(mobile);
CREATE INDEX IF NOT EXISTS idx_bkp_nid ON bk_parties(nid);
CREATE TABLE IF NOT EXISTS bk_accounts (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK (kind IN ('cash','bank')), title TEXT NOT NULL, bank TEXT NOT NULL DEFAULT '',
  number TEXT NOT NULL DEFAULT '', card TEXT NOT NULL DEFAULT '', sheba TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS bk_items (
  id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, tpl TEXT NOT NULL, title TEXT NOT NULL, weight REAL NOT NULL, fineness REAL NOT NULL DEFAULT 750,
  stone_w REAL NOT NULL DEFAULT 0, stones REAL NOT NULL DEFAULT 0, ojrat_mode TEXT NOT NULL DEFAULT 'pct', ojrat REAL NOT NULL DEFAULT 0, profit_pct REAL NOT NULL DEFAULT 7,
  showcase TEXT NOT NULL DEFAULT '', supplier_id TEXT, cost_ojrat REAL NOT NULL DEFAULT 0, note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'stock' CHECK (status IN ('stock','sold','reserved','out')), sold_doc TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bki_status ON bk_items(status);
CREATE TABLE IF NOT EXISTS bk_docs (
  id TEXT PRIMARY KEY, type TEXT NOT NULL, fy INTEGER NOT NULL, no INTEGER NOT NULL, serial INTEGER UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('draft','final','void')), version INTEGER NOT NULL DEFAULT 1, date TEXT NOT NULL, party_id TEXT,
  data_json TEXT NOT NULL, calc_json TEXT NOT NULL, tax_json TEXT NOT NULL DEFAULT '{}', hash TEXT NOT NULL,
  created_by TEXT, created_at TEXT NOT NULL, updated_by TEXT, updated_at TEXT NOT NULL, issued_at TEXT,
  UNIQUE (type, fy, no)
);
CREATE INDEX IF NOT EXISTS idx_bkd_date ON bk_docs(date);
CREATE INDEX IF NOT EXISTS idx_bkd_party ON bk_docs(party_id);
CREATE TABLE IF NOT EXISTS bk_versions (
  doc_id TEXT NOT NULL, version INTEGER NOT NULL, status TEXT NOT NULL, data_json TEXT NOT NULL, calc_json TEXT NOT NULL, hash TEXT NOT NULL,
  by TEXT, at TEXT NOT NULL, reason TEXT NOT NULL DEFAULT '', PRIMARY KEY (doc_id, version)
);
CREATE TABLE IF NOT EXISTS bk_postings (src TEXT NOT NULL, acct TEXT NOT NULL, unit TEXT NOT NULL, amt REAL NOT NULL, date TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_bkpo_src ON bk_postings(src);
CREATE INDEX IF NOT EXISTS idx_bkpo_acct ON bk_postings(acct, date);
CREATE TABLE IF NOT EXISTS bk_cheques (
  id TEXT PRIMARY KEY, dir TEXT NOT NULL CHECK (dir IN ('in','out')), party_id TEXT, amount INTEGER NOT NULL, no TEXT NOT NULL DEFAULT '', sayad TEXT NOT NULL DEFAULT '',
  bank TEXT NOT NULL DEFAULT '', owner TEXT NOT NULL DEFAULT '', due TEXT NOT NULL, status TEXT NOT NULL, account_id TEXT, to_party TEXT, doc_id TEXT NOT NULL,
  history_json TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bkc_due ON bk_cheques(due);
CREATE TABLE IF NOT EXISTS bk_recon (src TEXT NOT NULL, acct TEXT NOT NULL, ref TEXT NOT NULL DEFAULT '', at TEXT NOT NULL, by TEXT, PRIMARY KEY (src, acct));
CREATE TABLE IF NOT EXISTS bk_log (
  seq INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, user_id TEXT, action TEXT NOT NULL, ref TEXT NOT NULL DEFAULT '', detail_json TEXT NOT NULL, prev TEXT NOT NULL, hash TEXT NOT NULL
);
`;

const now = () => new Date().toISOString();
const tehranDay = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(d);
const sha = (s) => createHash('sha256').update(s).digest('hex');
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const txt = (v, max = 200) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

export const DEFAULT_BOOKS = {
  legalName: '', economicCode: '', nationalId: '', regNo: '', address: '', postal: '', phone: '', memoryId: '', branchCode: '',
  sstid: {}, mu: {}, templates: {}, footer: 'کالای فروخته‌شده با ارائه همین فاکتور و در صورت سالم بودن، طبق مقررات صنف پس گرفته می‌شود.',
  staffCanDiscount: true, staffCanEditPrice: true, staffCanEditFinal: false, staffBackdate: false, roundTo: 0, lowStockDays: 0,
  // base edition (coin and molten gold desk)
  edition: 'full', money: 'rial', tradeRound: 10000, spreadBuy: 0, spreadSell: 0, coinSpreadBuy: 0, coinSpreadSell: 0, groups: {},
};

export function registerBooks({ on: onRoute, db, bad, notFound, HttpError, pricing, getSetting, saveSetting, isAdmin, market, sealer = null, shopId = 'main' }) {
  // every handler is also kept by name, so the auditor and the assistant reuse exactly the logic (and the checks) of the API
  const handlers = new Map();
  let ideas = null; // the seven tools hook into saving (locked quotes, closed days); set once they are registered
  const on = (method, path, guard, fn) => {
    handlers.set(`${method} ${path}`, fn);
    onRoute(method, path, guard, fn);
  };
  const call = (method, path, user, { params = {}, query = {}, body = {} } = {}) => {
    const fn = handlers.get(`${method} ${path}`);
    if (!fn) throw new Error(`no handler ${method} ${path}`);
    const url = new URL(`http://local${path}`);
    for (const [k, v] of Object.entries(query)) if (v != null) url.searchParams.set(k, v);
    return fn({ user, params, query, url, body });
  };
  db.raw.exec(BOOKS_SCHEMA);
  for (const col of ['alias', 'father', 'city', 'grp']) {
    try {
      db.raw.exec(`ALTER TABLE bk_parties ADD COLUMN ${col} TEXT NOT NULL DEFAULT ''`);
    } catch {
      /* column exists */
    }
  }
  if (!db.get('SELECT 1 FROM bk_accounts LIMIT 1')) {
    db.run("INSERT INTO bk_accounts(id,kind,title,created_at) VALUES ('main','cash','صندوق اصلی',?)", now());
    db.run("INSERT INTO bk_accounts(id,kind,title,created_at) VALUES ('bank-main','bank','حساب بانکی اصلی',?)", now());
  }
  const settings = () => {
    const s = { ...DEFAULT_BOOKS, ...getSetting('books', {}), vatPct: pricing().vatPct ?? 10 };
    if (!s.legalName) s.legalName = getSetting('brand', {}).shopName || B.SHOP_NAME; // the house name until the owner types the registered one
    return s;
  };
  const forbid = (m) => new HttpError(403, m);
  const guardAdmin = (user) => {
    if (!isAdmin(user)) throw forbid('این کار مخصوص مدیر است.');
  };

  /* ---------------- event log with a hash chain ---------------- */
  function log(user, action, ref, detail = {}) {
    const prev = db.get('SELECT hash FROM bk_log ORDER BY seq DESC LIMIT 1')?.hash ?? 'GENESIS';
    const at = now();
    const body = { at, user: user?.id ?? null, action, ref, detail };
    const hash = sha(prev + B.canonical(body));
    db.run('INSERT INTO bk_log(at,user_id,action,ref,detail_json,prev,hash) VALUES (?,?,?,?,?,?,?)', at, user?.id ?? null, action, ref, JSON.stringify(detail), prev, hash);
  }
  function verifyLog() {
    let prev = 'GENESIS', n = 0;
    for (const r of db.all('SELECT * FROM bk_log ORDER BY seq')) {
      const body = { at: r.at, user: r.user_id, action: r.action, ref: r.ref, detail: JSON.parse(r.detail_json) };
      if (r.prev !== prev || sha(prev + B.canonical(body)) !== r.hash) return { ok: false, brokenAt: r.seq, checked: n };
      prev = r.hash;
      n++;
    }
    return { ok: true, checked: n, head: prev };
  }

  /* ---------------- parties ---------------- */
  const partyOut = (p) => p && { id: p.id, code: p.code, kind: p.kind, name: p.name, nid: p.nid, eco: p.eco, mobile: p.mobile, phone: p.phone, postal: p.postal, address: p.address, birth: p.birth, tags: p.tags, note: p.note, creditLimit: p.credit_limit, sms: !!p.sms, createdAt: p.created_at, updatedAt: p.updated_at, deleted: !!p.deleted_at, alias: p.alias ?? '', father: p.father ?? '', city: p.city ?? '', group: p.grp ?? '', label: TR.partyLabel({ name: p.name, alias: p.alias, father: p.father, city: p.city, mobile: p.mobile }) };
  function cleanParty(body, id = null) {
    const kind = body.kind === 'company' ? 'company' : 'person';
    const name = txt(body.name, 120);
    if (name.length < 2) throw bad('نام مشتری را بنویسید.');
    const mobile = body.mobile ? B.normalizeMobile(body.mobile) : '';
    if (mobile && !B.validMobile(mobile)) throw bad('موبایل باید ۱۱ رقم و با ۰۹ باشد.');
    const nid = B.digitsOnly(body.nid);
    if (nid && !(kind === 'person' ? B.validNationalCode(nid) : B.validNationalId(nid))) throw bad(kind === 'person' ? 'کد ملی درست نیست (رقم کنترل نمی‌خواند).' : 'شناسه ملی شرکت درست نیست.');
    const eco = B.digitsOnly(body.eco);
    if (eco && !B.validEconomic(eco)) throw bad('شماره اقتصادی باید ۱۰، ۱۱، ۱۲ یا ۱۴ رقم باشد.');
    const postal = B.digitsOnly(body.postal);
    if (postal && !B.validPostal(postal)) throw bad('کد پستی ۱۰ رقم است.');
    const birth = body.birth ? String(body.birth) : '';
    if (birth && !DAY_RE.test(birth)) throw bad('تاریخ تولد نامعتبر است.');
    const creditLimit = Math.max(0, B.rnd(B.num(body.creditLimit || 0) * (body.money === 'rial' ? 1 : 10)) || 0);
    for (const [col, v, label] of [['mobile', mobile, 'این موبایل'], ['nid', nid, 'این کد ملی']]) {
      if (!v) continue;
      const dup = db.get(`SELECT code, name FROM bk_parties WHERE ${col}=? AND deleted_at IS NULL AND id<>?`, v, id ?? '');
      if (dup) throw new HttpError(409, `${label} قبلاً برای «${dup.name}» (کد ${dup.code}) ثبت شده است.`);
    }
    const alias = txt(body.alias, 60), father = txt(body.father, 60), city = txt(body.city, 40), grp = txt(body.group, 40);
    // same-name customers must be told apart by an alias, father's name, city or mobile
    const twins = db.all('SELECT * FROM bk_parties WHERE deleted_at IS NULL AND id<>?', id ?? '').filter((x) => TR.normName(x.name) === TR.normName(name));
    for (const t of twins) {
      const same = (a, b) => TR.normName(a) === TR.normName(b);
      const differs = (alias && !same(alias, t.alias)) || (father && !same(father, t.father)) || (city && !same(city, t.city)) || (mobile && mobile !== t.mobile);
      if (!differs) throw new HttpError(409, `«${t.name}» با کد ${t.code}${t.mobile ? ` و موبایل …${t.mobile.slice(-4)}` : ''}${t.alias ? ` («${t.alias}»)` : ''} ثبت است. برای مشتری هم‌نام، لقب، نام پدر، شهر یا موبایل متفاوت وارد کنید.`);
    }
    return { kind, name, mobile, nid, eco, postal, birth, phone: txt(body.phone, 30), address: txt(body.address, 300), tags: txt(body.tags, 120), note: txt(body.note, 600), creditLimit, sms: body.sms === false ? 0 : 1, alias, father, city, grp };
  }
  const roundUnit = (u, v) => (u === 'G750' ? B.r3(v) : u === 'FX' || u.startsWith('FX:') ? Math.round(v * 100) / 100 : Math.round(v));
  const balOf = (acct) => {
    const o = {};
    for (const r of db.all('SELECT unit, SUM(amt) AS s FROM bk_postings WHERE acct=? GROUP BY unit', acct)) if (Math.abs(r.s) > 1e-9) o[r.unit] = roundUnit(r.unit, r.s);
    return o;
  };
  on('GET', '/api/books/parties', 'auth', ({ url }) => {
    const q = txt(url.searchParams.get('q'), 60);
    const d = B.digitsOnly(q);
    let rows;
    if (q) {
      const or = ['name LIKE ?', 'tags LIKE ?', 'alias LIKE ?', 'father LIKE ?', 'city LIKE ?', 'grp LIKE ?'], args = [`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`];
      if (d) or.push('mobile LIKE ?', 'nid LIKE ?', 'CAST(code AS TEXT)=?'), args.push(`%${d}%`, `%${d}%`, d);
      rows = db.all(`SELECT * FROM bk_parties WHERE deleted_at IS NULL AND (${or.join(' OR ')}) ORDER BY name LIMIT 200`, ...args);
    } else if (url.searchParams.get('group')) rows = db.all('SELECT * FROM bk_parties WHERE deleted_at IS NULL AND grp=? ORDER BY name LIMIT 2000', txt(url.searchParams.get('group'), 40));
    else rows = db.all('SELECT * FROM bk_parties WHERE deleted_at IS NULL ORDER BY updated_at DESC LIMIT 2000');
    const bal = new Map();
    for (const r of db.all("SELECT acct, unit, SUM(amt) AS s FROM bk_postings WHERE acct LIKE 'party:%' GROUP BY acct, unit")) {
      if (Math.abs(r.s) < 1e-9) continue;
      const id = r.acct.slice(6);
      bal.set(id, { ...(bal.get(id) ?? {}), [r.unit]: roundUnit(r.unit, r.s) });
    }
    return { items: rows.map((p) => ({ ...partyOut(p), balance: bal.get(p.id) ?? {} })) };
  });
  on('POST', '/api/books/parties', 'auth', ({ user, body }) => {
    const p = cleanParty(body);
    const id = randomUUID();
    const t = now();
    db.tx(() => {
      const code = (db.get('SELECT MAX(code) AS m FROM bk_parties').m ?? 1000) + 1;
      db.run('INSERT INTO bk_parties(id,code,kind,name,nid,eco,mobile,phone,postal,address,birth,tags,note,credit_limit,sms,alias,father,city,grp,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', id, code, p.kind, p.name, p.nid, p.eco, p.mobile, p.phone, p.postal, p.address, p.birth, p.tags, p.note, p.creditLimit, p.sms, p.alias, p.father, p.city, p.grp, t, t);
      log(user, 'party.create', id, p);
    });
    return partyOut(db.get('SELECT * FROM bk_parties WHERE id=?', id));
  });
  on('PUT', '/api/books/parties/:id', 'auth', ({ user, params, body }) => {
    const cur = db.get('SELECT * FROM bk_parties WHERE id=? AND deleted_at IS NULL', params.id);
    if (!cur) throw notFound('این مشتری پیدا نشد.');
    const p = cleanParty(body, cur.id);
    if (p.creditLimit !== cur.credit_limit) guardAdmin(user);
    db.tx(() => {
      db.run('UPDATE bk_parties SET kind=?,name=?,nid=?,eco=?,mobile=?,phone=?,postal=?,address=?,birth=?,tags=?,note=?,credit_limit=?,sms=?,alias=?,father=?,city=?,grp=?,updated_at=? WHERE id=?', p.kind, p.name, p.nid, p.eco, p.mobile, p.phone, p.postal, p.address, p.birth, p.tags, p.note, p.creditLimit, p.sms, p.alias, p.father, p.city, p.grp, now(), cur.id);
      log(user, 'party.update', cur.id, { before: partyOut(cur), after: p });
    });
    return partyOut(db.get('SELECT * FROM bk_parties WHERE id=?', cur.id));
  });
  on('DELETE', '/api/books/parties/:id', 'auth', ({ user, params }) => {
    guardAdmin(user);
    const cur = db.get('SELECT * FROM bk_parties WHERE id=? AND deleted_at IS NULL', params.id);
    if (!cur) throw notFound('این مشتری پیدا نشد.');
    if (Object.keys(balOf(`party:${cur.id}`)).length) throw new HttpError(409, 'حساب این مشتری مانده دارد؛ اول تسویه کنید.');
    db.tx(() => {
      db.run('UPDATE bk_parties SET deleted_at=? WHERE id=?', now(), cur.id); // documents keep pointing at it
      log(user, 'party.delete', cur.id, { name: cur.name });
    });
    return { ok: true };
  });
  on('GET', '/api/books/parties/:id', 'auth', ({ params }) => {
    const p = db.get('SELECT * FROM bk_parties WHERE id=?', params.id);
    if (!p) throw notFound('این مشتری پیدا نشد.');
    const acct = `party:${p.id}`;
    // in the order things happened (date, then the time the document was issued), so the running balance is true
    const rows = db.all("SELECT p.src, p.unit, SUM(p.amt) AS amt, MIN(p.date) AS date, COALESCE(d.issued_at, d.created_at, MIN(p.date)) AS ts FROM bk_postings p LEFT JOIN bk_docs d ON d.id=p.src WHERE p.acct=? GROUP BY p.src, p.unit ORDER BY date, ts, p.src", acct);
    // a trade the customer settled in full leaves nothing on the account, but it is still part of their story
    const settled = db.all("SELECT id AS src, 'IRR' AS unit, 0 AS amt, date, COALESCE(issued_at, created_at) AS ts FROM bk_docs WHERE party_id=? AND status='final' AND id NOT IN (SELECT DISTINCT src FROM bk_postings WHERE acct=?)", p.id, acct);
    if (settled.length) {
      rows.push(...settled);
      rows.sort((a, b) => a.date.localeCompare(b.date) || String(a.ts).localeCompare(String(b.ts)) || a.src.localeCompare(b.src));
    }
    const docs = new Map(db.all("SELECT id, type, fy, no, date, status, issued_at, created_at, data_json, calc_json FROM bk_docs WHERE id IN (SELECT DISTINCT src FROM bk_postings WHERE acct=?) OR (party_id=? AND status='final')", acct, p.id).map((d) => [d.id, d]));
    const run = {};
    // what the document did to this account in this unit, for the «شرح» column
    const what = (d, unit) => {
      if (!d) return null;
      const c = JSON.parse(d.calc_json), data = JSON.parse(d.data_json);
      if (d.type === 'trade') {
        const lines = (c.lines ?? []).filter((l) => (unit === 'IRR' ? l.priced : !l.priced && l.unit === unit));
        const pays = unit === 'IRR' ? (c.payments ?? []).map((x, i) => ({ method: x.method, dir: x.dir, value: x.value, ref: data.payments?.[i]?.ref ?? '' })) : [];
        return { lines, pays };
      }
      if (d.type === 'hawala') {
        const h = c.hawala;
        const other = partyRow(h.from === p.id ? h.to : h.from);
        return { hawala: { ...h, out: h.from === p.id, other: other ? TR.partyLabel(other) : '' } };
      }
      if (d.type === 'convert') return { convert: c.convert };
      return { note: data.note ?? '' };
    };
    const statement = rows.map((r) => {
      run[r.unit] = (run[r.unit] ?? 0) + r.amt;
      const d = docs.get(r.src);
      return { src: r.src, date: r.date, at: d ? d.issued_at ?? d.created_at : null, unit: r.unit, amt: roundUnit(r.unit, r.amt), balance: roundUnit(r.unit, run[r.unit]), doc: d ? { id: d.id, type: d.type, no: d.no, fy: d.fy, track: B.trackCode(d.type, d.fy, d.no) } : null, what: what(d, r.unit) };
    });
    return { party: partyOut(p), balance: balOf(acct), statement, docs: db.all('SELECT id, type, fy, no, date, status FROM bk_docs WHERE party_id=? ORDER BY date DESC, created_at DESC LIMIT 300', p.id) };
  });

  /* ---------------- accounts ---------------- */
  const acctOut = (a) => ({ id: a.id, kind: a.kind, title: a.title, bank: a.bank, number: a.number, card: a.card, sheba: a.sheba, active: !!a.active, balance: balOf(`${a.kind}:${a.id}`).IRR ?? 0 });
  on('GET', '/api/books/accounts', 'auth', () => ({ items: db.all('SELECT * FROM bk_accounts ORDER BY kind, created_at').map(acctOut) }));
  function cleanAccount(body) {
    const kind = body.kind === 'bank' ? 'bank' : 'cash';
    const title = txt(body.title, 60);
    if (title.length < 2) throw bad('نام حساب را بنویسید.');
    const card = B.digitsOnly(body.card);
    if (card && !B.validCard(card)) throw bad('شماره کارت درست نیست.');
    const sheba = String(body.sheba ?? '').toUpperCase().replace(/\s/g, '');
    if (sheba && !B.validSheba(sheba)) throw bad('شماره شبا درست نیست.');
    return { kind, title, bank: txt(body.bank, 40), number: txt(body.number, 40), card, sheba, active: body.active === false ? 0 : 1 };
  }
  on('POST', '/api/books/accounts', 'auth', ({ user, body }) => {
    guardAdmin(user);
    const a = cleanAccount(body);
    const id = randomUUID().slice(0, 8);
    db.run('INSERT INTO bk_accounts(id,kind,title,bank,number,card,sheba,active,created_at) VALUES (?,?,?,?,?,?,?,?,?)', id, a.kind, a.title, a.bank, a.number, a.card, a.sheba, a.active, now());
    log(user, 'account.create', id, a);
    return acctOut(db.get('SELECT * FROM bk_accounts WHERE id=?', id));
  });
  on('PUT', '/api/books/accounts/:id', 'auth', ({ user, params, body }) => {
    guardAdmin(user);
    const cur = db.get('SELECT * FROM bk_accounts WHERE id=?', params.id);
    if (!cur) throw notFound('این حساب پیدا نشد.');
    const a = cleanAccount({ ...body, kind: cur.kind });
    db.run('UPDATE bk_accounts SET title=?,bank=?,number=?,card=?,sheba=?,active=? WHERE id=?', a.title, a.bank, a.number, a.card, a.sheba, a.active, cur.id);
    log(user, 'account.update', cur.id, a);
    return acctOut(db.get('SELECT * FROM bk_accounts WHERE id=?', cur.id));
  });

  /* ---------------- stock items ---------------- */
  const itemOut = (i) => ({ id: i.id, code: i.code, tpl: i.tpl, title: i.title, weight: i.weight, fineness: i.fineness, stoneWeight: i.stone_w, stones: i.stones, ojratMode: i.ojrat_mode, ojrat: i.ojrat, profitPct: i.profit_pct, showcase: i.showcase, supplierId: i.supplier_id, costOjrat: i.cost_ojrat, note: i.note, status: i.status, soldDoc: i.sold_doc, createdAt: i.created_at, updatedAt: i.updated_at });
  function cleanItem(body, cur = {}) {
    const tpl = B.templateById(body.tpl ?? cur.tpl);
    if (!tpl || tpl.kind !== 'jewel') throw bad('قالب کالا نامعتبر است (فقط کارساخته موجودی تک‌قطعه دارد).');
    const v = (k, d) => (body[k] === undefined ? cur[k] ?? d : body[k]);
    const weight = B.num(v('weight'));
    if (!(weight > 0 && weight < 1e5)) throw bad('وزن نامعتبر است.');
    const fineness = B.num(v('fineness', 750));
    if (!(fineness >= 1 && fineness <= 1000)) throw bad('عیار نامعتبر است.');
    const stoneWeight = B.num(v('stoneWeight', 0) || 0);
    if (!(stoneWeight >= 0 && stoneWeight < weight)) throw bad('وزن سنگ نامعتبر است.');
    const stones = B.num(v('stones', 0) || 0);
    const ojratMode = ['pct', 'gram', 'fixed'].includes(v('ojratMode', tpl.ojratMode)) ? v('ojratMode', tpl.ojratMode) : 'pct';
    const ojrat = B.num(v('ojrat', tpl.ojrat) ?? 0);
    const profitPct = B.num(v('profitPct', tpl.profitPct ?? 7) ?? 7);
    if (!(stones >= 0) || !(ojrat >= 0) || !(profitPct >= 0 && profitPct <= 100)) throw bad('اجرت، سود یا مبلغ سنگ نامعتبر است.');
    return { tpl: tpl.id, title: txt(v('title', tpl.label), 120) || tpl.label, weight: B.r3(weight), fineness, stoneWeight: B.r3(stoneWeight), stones, ojratMode, ojrat, profitPct, showcase: txt(v('showcase', ''), 40), supplierId: v('supplierId', null) || null, costOjrat: B.num(v('costOjrat', 0) || 0) || 0, note: txt(v('note', ''), 300) };
  }
  const nextCode = () => String(Math.max(100000, ...db.all("SELECT code FROM bk_items WHERE code GLOB '[0-9]*'").map((r) => Number(r.code) || 0)) + 1);
  on('GET', '/api/books/items', 'auth', ({ url }) => {
    const st = url.searchParams.get('status') || 'stock';
    const q = txt(url.searchParams.get('q'), 60);
    const where = ['1=1'], args = [];
    if (st !== 'all') where.push('status=?'), args.push(st);
    if (q) where.push('(code=? OR title LIKE ? OR showcase=?)'), args.push(B.digitsOnly(q) || q, `%${q}%`, q);
    const rows = db.all(`SELECT * FROM bk_items WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT 2000`, ...args);
    return { items: rows.map(itemOut) };
  });
  on('GET', '/api/books/items/code/:code', 'auth', ({ params }) => {
    const i = db.get('SELECT * FROM bk_items WHERE code=?', B.digitsOnly(params.code) || params.code);
    if (!i) throw notFound('کالایی با این بارکد نیست.');
    return itemOut(i);
  });
  // one piece, or a batch of pieces from one template with different weights (automatic barcodes)
  on('POST', '/api/books/items', 'auth', ({ user, body }) => {
    const { batch, ...base } = body;
    const list = Array.isArray(batch) ? batch.map((w) => (w && typeof w === 'object' ? { ...base, code: undefined, ...w } : { ...base, code: undefined, weight: w })) : [base];
    if (!list.length || list.length > 500) throw bad('تعداد قطعه‌ها باید ۱ تا ۵۰۰ باشد.');
    const out = [];
    db.tx(() => {
      for (const b of list) {
        const it = cleanItem(b);
        const code = b.code ? B.digitsOnly(b.code) || txt(b.code, 30) : nextCode();
        if (db.get('SELECT 1 FROM bk_items WHERE code=?', code)) throw new HttpError(409, `بارکد ${code} تکراری است.`);
        const id = randomUUID(), t = now();
        db.run('INSERT INTO bk_items(id,code,tpl,title,weight,fineness,stone_w,stones,ojrat_mode,ojrat,profit_pct,showcase,supplier_id,cost_ojrat,note,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', id, code, it.tpl, it.title, it.weight, it.fineness, it.stoneWeight, it.stones, it.ojratMode, it.ojrat, it.profitPct, it.showcase, it.supplierId, it.costOjrat, it.note, t, t);
        out.push(itemOut(db.get('SELECT * FROM bk_items WHERE id=?', id)));
      }
      log(user, 'item.create', out.map((i) => i.code).join(','), { n: out.length, tpl: out[0].tpl });
    });
    return { items: out };
  });
  on('PUT', '/api/books/items/:id', 'auth', ({ user, params, body }) => {
    const cur = db.get('SELECT * FROM bk_items WHERE id=?', params.id);
    if (!cur) throw notFound('این کالا پیدا نشد.');
    if (cur.status === 'sold') throw new HttpError(409, 'کالای فروخته‌شده را از خود فاکتور ویرایش کنید.');
    const it = cleanItem(body, itemOut(cur));
    db.tx(() => {
      db.run('UPDATE bk_items SET tpl=?,title=?,weight=?,fineness=?,stone_w=?,stones=?,ojrat_mode=?,ojrat=?,profit_pct=?,showcase=?,supplier_id=?,cost_ojrat=?,note=?,updated_at=? WHERE id=?', it.tpl, it.title, it.weight, it.fineness, it.stoneWeight, it.stones, it.ojratMode, it.ojrat, it.profitPct, it.showcase, it.supplierId, it.costOjrat, it.note, now(), cur.id);
      log(user, 'item.update', cur.code, { before: itemOut(cur), after: it });
    });
    return itemOut(db.get('SELECT * FROM bk_items WHERE id=?', cur.id));
  });
  // multi-edit: the same change on many pieces at once (making charge, profit, showcase, status, template)
  on('POST', '/api/books/items/bulk', 'auth', ({ user, body }) => {
    guardAdmin(user);
    const ids = Array.isArray(body.ids) ? body.ids.slice(0, 2000) : [];
    if (!ids.length) throw bad('هیچ کالایی انتخاب نشده است.');
    const set = body.set ?? {};
    if (body.delete) {
      const n = db.tx(() => {
        let n = 0;
        for (const id of ids) {
          const i = db.get('SELECT * FROM bk_items WHERE id=?', id);
          if (!i) continue;
          if (i.status === 'sold' || db.get("SELECT 1 FROM bk_docs WHERE data_json LIKE ? LIMIT 1", `%"itemId":"${i.id}"%`)) throw new HttpError(409, `کالای ${i.code} در سند ثبت شده و حذف نمی‌شود؛ وضعیتش را «خارج از موجودی» کنید.`);
          db.run('DELETE FROM bk_items WHERE id=?', id);
          n++;
        }
        log(user, 'item.delete', ids.join(','), { n });
        return n;
      });
      return { changed: n };
    }
    if (set.status && !['stock', 'reserved', 'out'].includes(set.status)) throw bad('وضعیت نامعتبر است.');
    const n = db.tx(() => {
      let n = 0;
      for (const id of ids) {
        const cur = db.get('SELECT * FROM bk_items WHERE id=?', id);
        if (!cur || cur.status === 'sold') continue;
        const next = cleanItem(set, itemOut(cur));
        db.run('UPDATE bk_items SET tpl=?,title=?,ojrat_mode=?,ojrat=?,profit_pct=?,showcase=?,status=?,updated_at=? WHERE id=?', next.tpl, set.title !== undefined ? next.title : cur.title, next.ojratMode, next.ojrat, next.profitPct, next.showcase, set.status ?? cur.status, now(), id);
        n++;
      }
      log(user, 'item.bulk', ids.join(','), { set, n });
      return n;
    });
    return { changed: n };
  });
  // stock count (انبارگردانی): scanned codes against the system, per showcase or whole shop
  on('POST', '/api/books/stocktake', 'auth', ({ user, body }) => {
    const codes = [...new Set((Array.isArray(body.codes) ? body.codes : []).map((c) => B.digitsOnly(c) || txt(c, 30)).filter(Boolean))];
    const showcase = txt(body.showcase, 40);
    const expected = db.all(`SELECT * FROM bk_items WHERE status IN ('stock','reserved')${showcase ? ' AND showcase=?' : ''}`, ...(showcase ? [showcase] : []));
    const exp = new Map(expected.map((i) => [i.code, i]));
    const seen = new Set(codes);
    const missing = expected.filter((i) => !seen.has(i.code)).map(itemOut);
    const extra = codes.filter((c) => !exp.has(c)).map((c) => ({ code: c, item: (() => { const i = db.get('SELECT * FROM bk_items WHERE code=?', c); return i ? itemOut(i) : null; })() }));
    const found = expected.filter((i) => seen.has(i.code));
    log(user, 'stocktake', showcase || 'all', { scanned: codes.length, missing: missing.length, extra: extra.length });
    return { expected: expected.length, found: found.length, weightFound: B.r3(found.reduce((s, i) => s + i.weight, 0)), weightExpected: B.r3(expected.reduce((s, i) => s + i.weight, 0)), missing, extra };
  });

  /* ---------------- templates and settings ---------------- */
  on('GET', '/api/books/templates', 'auth', () => ({ groups: B.TEMPLATE_GROUPS, items: B.templatesWith(settings().templates) }));
  on('GET', '/api/books/settings', 'auth', () => {
    const s = settings();
    return { ...s, products: catalogue(), taxReady: B.validMemoryId(s.memoryId) && !!s.economicCode };
  });

  /* ---------------- محصولات: the shop's own list of what it trades ---------------- */
  // { custom: { id: { label, short, weight, fineness, price? } }, order: [ids], hidden: [ids], labels: { id: short }, fxHidden: [codes] }
  const catalogue = () => ({ custom: {}, order: [], hidden: [], labels: {}, fxHidden: [], ...getSetting('products', {}) });
  const saveCatalogue = (c, user) => {
    saveSetting('products', c, user.id);
    log(user, 'settings', 'products', c);
  };
  const productUse = (id) => db.get("SELECT COUNT(*) AS n FROM bk_postings WHERE acct=? OR unit=?", `coin:${id}`, `COIN:${id}`).n + db.get("SELECT COUNT(*) AS n FROM bk_docs WHERE data_json LIKE ?", `%"coin":"${id}"%`).n;
  function cleanProduct(body, cur = {}) {
    const label = txt(body.label ?? cur.label, 80);
    const short = txt(body.short ?? cur.short ?? label, 30);
    const weight = B.num(body.weight ?? cur.weight);
    const fineness = B.num(body.fineness ?? cur.fineness ?? 750);
    if (label.length < 2) throw bad('نام محصول را بنویسید.');
    if (!(weight > 0 && weight < 10000)) throw bad('وزن هر عدد (گرم) را درست وارد کنید.');
    if (!(fineness >= 1 && fineness <= 1000)) throw bad('عیار باید بین ۱ و ۱۰۰۰ باشد.');
    const price = body.price === '' || body.price == null ? (body.price === undefined ? cur.price : undefined) : Math.round(B.num(body.price));
    if (price != null && !(price > 0 && price < 1e15)) throw bad('قیمت دستی نامعتبر است.');
    return { label, short, weight: B.r3(weight), fineness, custom: true, ...(price ? { price } : {}) };
  }
  on('GET', '/api/books/products', 'auth', () => {
    const c = catalogue();
    const v = call('GET', '/api/books/vault', null);
    const lp = livePrices();
    const hidden = new Set(c.hidden);
    return {
      items: Object.entries(COIN_TYPES).map(([id, p]) => ({ id, label: p.label, short: p.short, weight: p.weight, fineness: p.fineness, custom: !!p.custom, price: lp.price[`COIN:${id}`] ?? null, manualPrice: p.price ?? null, hidden: hidden.has(id), stock: v.coins[id] ?? 0, custody: v.custody[`COIN:${id}`] ?? null, used: productUse(id) })),
      fx: Object.entries(TR.FX_CODES).map(([code, label]) => ({ code, label, hidden: c.fxHidden.includes(code), stock: v.fx[code] ?? 0 })),
      gold: v.gold,
      goldPrice: lp.price.G750,
      bars: v.bars.map((b) => ({ serial: b.serial, weight: b.weight, fineness: b.fineness, brand: b.brand })),
    };
  });
  on('POST', '/api/books/products', 'auth', ({ user, body }) => {
    guardAdmin(user);
    const c = catalogue();
    if (Object.keys(c.custom).length >= 60) throw bad('حداکثر ۶۰ محصول سفارشی.');
    const id = `u${randomUUID().replace(/-/g, '').slice(0, 7)}`;
    c.custom = { ...c.custom, [id]: cleanProduct(body) };
    c.order = [...c.order.filter((k) => k !== id), id];
    saveCatalogue(c, user);
    return { id, product: c.custom[id] };
  });
  on('PUT', '/api/books/products/:id', 'auth', ({ user, params, body }) => {
    guardAdmin(user);
    const c = catalogue();
    const id = params.id;
    if (c.custom[id]) c.custom = { ...c.custom, [id]: cleanProduct(body, c.custom[id]) };
    else if (COIN_TYPES[id]) {
      // an official coin keeps its weight and fineness; only its name on the desk can change
      const short = txt(body.short ?? body.label, 30);
      c.labels = { ...c.labels };
      if (short) c.labels[id] = short;
      else delete c.labels[id];
    } else throw notFound('این محصول پیدا نشد.');
    if (body.hidden !== undefined) c.hidden = body.hidden ? [...new Set([...c.hidden, id])] : c.hidden.filter((k) => k !== id);
    saveCatalogue(c, user);
    return { ok: true };
  });
  on('PUT', '/api/books/products', 'auth', ({ user, body }) => {
    guardAdmin(user);
    const c = catalogue();
    const known = new Set(Object.keys(COIN_TYPES));
    if (Array.isArray(body.order)) c.order = body.order.map(String).filter((k) => known.has(k));
    if (Array.isArray(body.hidden)) c.hidden = body.hidden.map(String).filter((k) => known.has(k));
    if (Array.isArray(body.fxHidden)) c.fxHidden = body.fxHidden.map(String).filter((k) => TR.FX_CODES[k]);
    saveCatalogue(c, user);
    return { ok: true, products: c };
  });
  on('DELETE', '/api/books/products/:id', 'auth', ({ user, params }) => {
    guardAdmin(user);
    const c = catalogue();
    if (!c.custom[params.id]) throw bad(COIN_TYPES[params.id] ? 'سکه‌های رسمی حذف نمی‌شوند؛ می‌توانید پنهانشان کنید.' : 'این محصول پیدا نشد.');
    if (productUse(params.id)) throw new HttpError(409, 'این محصول در اسناد یا موجودی آمده است؛ حذفش سابقه را خراب می‌کند. به‌جای حذف پنهانش کنید.');
    const { [params.id]: _gone, ...rest } = c.custom;
    c.custom = rest;
    c.order = c.order.filter((k) => k !== params.id);
    c.hidden = c.hidden.filter((k) => k !== params.id);
    saveCatalogue(c, user);
    return { ok: true };
  });
  on('PUT', '/api/books/settings', 'auth', ({ user, body }) => {
    guardAdmin(user);
    const cur = settings();
    const next = { ...cur };
    for (const k of ['legalName', 'address', 'phone', 'regNo', 'footer', 'branchCode']) if (body[k] !== undefined) next[k] = txt(body[k], k === 'footer' ? 600 : 200);
    if (body.economicCode !== undefined) {
      const e = B.digitsOnly(body.economicCode);
      if (e && !B.validEconomic(e)) throw bad('شماره اقتصادی فروشگاه نامعتبر است.');
      next.economicCode = e;
    }
    if (body.nationalId !== undefined) {
      const n = B.digitsOnly(body.nationalId);
      if (n && !(B.validNationalCode(n) || B.validNationalId(n))) throw bad('کد ملی / شناسه ملی فروشگاه نامعتبر است.');
      next.nationalId = n;
    }
    if (body.postal !== undefined) {
      const p = B.digitsOnly(body.postal);
      if (p && !B.validPostal(p)) throw bad('کد پستی ۱۰ رقم است.');
      next.postal = p;
    }
    if (body.memoryId !== undefined) {
      const m = String(body.memoryId).trim().toUpperCase();
      if (m && !B.validMemoryId(m)) throw bad('شناسه یکتای حافظه مالیاتی ۶ کاراکتر لاتین است.');
      next.memoryId = m;
    }
    if (body.sstid && typeof body.sstid === 'object') next.sstid = Object.fromEntries(Object.entries(body.sstid).filter(([k]) => ['jewel', 'coin', 'melt', 'service', 'goods', 'stone'].includes(k)).map(([k, v]) => [k, B.digitsOnly(v).slice(0, 13)]).filter(([, v]) => v));
    if (body.mu && typeof body.mu === 'object') next.mu = Object.fromEntries(Object.entries(body.mu).filter(([k]) => ['gram', 'count'].includes(k)).map(([k, v]) => [k, txt(v, 8)]).filter(([, v]) => v));
    if (body.templates && typeof body.templates === 'object') {
      const t = {};
      for (const [id, o] of Object.entries(body.templates)) {
        const tpl = B.templateById(id);
        if (!tpl || tpl.kind !== 'jewel') continue;
        const e = {};
        if (['pct', 'gram', 'fixed'].includes(o.ojratMode)) e.ojratMode = o.ojratMode;
        if (B.num(o.ojrat) >= 0) e.ojrat = B.num(o.ojrat);
        if (B.num(o.profitPct) >= 0 && B.num(o.profitPct) <= 100) e.profitPct = B.num(o.profitPct);
        if (o.hidden) e.hidden = true;
        if (Object.keys(e).length) t[id] = e;
      }
      next.templates = t;
    }
    for (const k of ['staffCanDiscount', 'staffCanEditPrice', 'staffCanEditFinal', 'staffBackdate']) if (body[k] !== undefined) next[k] = !!body[k];
    if (body.edition !== undefined) next.edition = body.edition === 'base' ? 'base' : 'full';
    if (body.money !== undefined) next.money = body.money === 'toman' ? 'toman' : 'rial';
    if (body.tradeRound !== undefined) {
      if (!TR.ROUND_STEPS.includes(Number(body.tradeRound))) throw bad('گام گرد کردن نامعتبر است.');
      next.tradeRound = Number(body.tradeRound);
    }
    for (const k of ['spreadBuy', 'spreadSell', 'coinSpreadBuy', 'coinSpreadSell']) if (body[k] !== undefined) {
      const v = B.num(body[k] || 0);
      if (!Number.isFinite(v) || v < 0 || v > 1e12) throw bad('اختلاف نرخ خرید و فروش نامعتبر است.');
      next[k] = Math.round(v);
    }
    if (body.groups && typeof body.groups === 'object') {
      const g = {};
      for (const [name, o] of Object.entries(body.groups).slice(0, 100)) {
        const n = txt(name, 40);
        if (!n) continue;
        g[n] = { spreadBuy: Math.max(0, Math.round(B.num(o?.spreadBuy || 0)) || 0), spreadSell: Math.max(0, Math.round(B.num(o?.spreadSell || 0)) || 0), note: txt(o?.note, 120) };
      }
      next.groups = g;
    }
    if (body.roundTo !== undefined) next.roundTo = [0, 1000, 10000, 100000].includes(Number(body.roundTo)) ? Number(body.roundTo) : 0;
    const { vatPct, ...store } = next;
    saveSetting('books', store, user.id);
    log(user, 'settings', 'books', store);
    return { ...settings(), taxReady: B.validMemoryId(next.memoryId) && !!next.economicCode };
  });

  /* ---------------- documents ---------------- */
  const fyOf = (iso) => jalaliOf(iso)[0];
  const docHash = (d) => sha(B.canonical(d)).slice(0, 32);
  const verifyCode = (hash) => hash.slice(0, 12).toUpperCase();

  function prepare(user, body, prev = null) {
    const s = settings();
    const type = body.type ?? prev?.type;
    if (!B.DOC_TYPES[type]) throw bad('نوع سند نامعتبر است.');
    if (prev && type !== prev.type) throw bad('نوع سند را نمی‌توان عوض کرد؛ سند را باطل و دوباره صادر کنید.');
    const today = tehranDay();
    const date = body.date ?? prev?.date ?? today;
    if (!DAY_RE.test(date) || Number.isNaN(Date.parse(date))) throw bad('تاریخ سند نامعتبر است.');
    if (date > today) throw bad('تاریخ سند نمی‌تواند در آینده باشد.');
    if (date !== today && !isAdmin(user) && !s.staffBackdate && date !== prev?.date) throw forbid('ثبت سند با تاریخ گذشته مخصوص مدیر است.');
    const partyId = body.partyId === undefined ? prev?.partyId ?? null : body.partyId || null;
    const party = partyId ? db.get('SELECT * FROM bk_parties WHERE id=?', partyId) : null;
    if (partyId && (!party || (party.deleted_at && partyId !== prev?.partyId))) throw bad('مشتری انتخاب‌شده پیدا نشد.');
    const lines = (Array.isArray(body.lines) ? body.lines : []).slice(0, 300).map((l) => {
      const o = {};
      for (const k of ['kind', 'side', 'tpl', 'itemId', 'title', 'weight', 'fineness', 'p750', 'ojratMode', 'ojrat', 'profitPct', 'bros', 'stones', 'discount', 'coin', 'count', 'price', 'mazaneh', 'stoneWeight', 'deductPct', 'amount', 'qty', 'vatPct', 'code', 'dir', 'priced', 'basis', 'g750', 'gramPrice', 'serial', 'brand', 'gallery', 'sealDate', 'fee', 'fxAmount', 'rate', 'conditional', 'assay', 'note', 'quote']) if (l[k] !== undefined && l[k] !== '') o[k] = typeof l[k] === 'string' ? txt(l[k], 120) : typeof l[k] === 'object' ? l[k] : l[k];
      if (o.kind === 'bar' && o.serial) o.serial = TR.normSerial(o.serial);
      return o;
    });
    const payments = (Array.isArray(body.payments) ? body.payments : []).slice(0, 50).map((p) => {
      const o = {};
      for (const k of ['method', 'dir', 'amount', 'account', 'ref', 'card', 'sheba', 'terminal', 'chequeId', 'chequeNo', 'sayad', 'bank', 'owner', 'due', 'weight', 'fineness', 'p750', 'coin', 'count', 'price', 'fxCode', 'fxAmount', 'fxRate', 'note']) if (p[k] !== undefined && p[k] !== '') o[k] = typeof p[k] === 'string' ? txt(p[k], 80) : p[k];
      return o;
    });
    const doc = {
      type, date, partyId, lines, payments,
      creditUnit: body.creditUnit === 'G750' ? 'G750' : 'IRR',
      creditP750: body.creditP750 ?? null,
      category: txt(body.category ?? prev?.category, 40) || undefined,
      note: txt(body.note ?? prev?.note, 600),
      seller: txt(body.seller ?? prev?.seller ?? user.name, 60),
      ref: body.ref ?? prev?.ref ?? null, // the document this one returns or came from
      balances: type === 'opening' ? cleanBalances(body.balances, body.money ?? prev?.money ?? 'toman') : type === 'adjust' ? adjustBalances(body.balances, body.money ?? prev?.money ?? 'rial') : undefined,
      money: type === 'opening' || type === 'adjust' ? (body.money ?? prev?.money ?? (type === 'adjust' ? 'rial' : 'toman')) : undefined,
      round: B.DOC_TYPES[type].base ? prev?.round ?? s.tradeRound : undefined,
      hawala: type === 'hawala' ? { from: String(body.hawala?.from ?? ''), to: String(body.hawala?.to ?? ''), unit: String(body.hawala?.unit ?? ''), amount: body.hawala?.amount } : undefined,
      convert: type === 'convert' ? { unit: String(body.convert?.unit ?? ''), amount: body.convert?.amount, basis: body.convert?.basis === 'gram750' ? 'gram750' : 'mazaneh', mazaneh: body.convert?.mazaneh, g750: body.convert?.g750, price: body.convert?.price } : undefined,
    };
    if (type === 'adjust') {
      guardAdmin(user);
      if (doc.note.length < 3) throw bad('دلیل اصلاح موجودی را بنویسید (مثلاً «شمارش پایان روز»).');
    }
    let calc;
    try {
      calc = B.calcDoc(doc, { vatPct: s.vatPct, round: s.tradeRound });
    } catch (e) {
      if (e instanceof B.BookError) throw bad(e.message);
      throw e;
    }
    // counter rules
    if (calc.credit && !partyId) throw bad('برای نسیه یا مانده، مشتری را انتخاب کنید (فروش نقدی بی‌نام باید کامل تسویه شود).');
    if (['receipt', 'payment'].includes(type) && !partyId) throw bad('طرف حساب را انتخاب کنید.');
    if (payments.some((p) => p.method === 'offset') && !partyId) throw bad('تهاتر فقط با حساب مشتری ممکن است.');
    if (payments.some((p) => p.method === 'cheque') && !partyId) throw bad('برای چک، صادرکننده یا گیرنده را به‌عنوان طرف حساب انتخاب کنید.');
    if (type === 'return' && body.ref) {
      const o = db.get("SELECT type, status FROM bk_docs WHERE id=?", String(body.ref));
      if (!o || o.type !== 'sale' || o.status !== 'final') throw bad('فاکتور فروش مرجع برگشت پیدا نشد یا قطعی نیست.');
    }
    if (doc.creditUnit === 'G750' && !partyId) throw bad('نسیه طلایی فقط برای مشتری ثبت‌شده ممکن است.');
    // base edition rules
    if (type === 'trade' && calc.lines.some((l) => !l.priced) && !partyId) throw bad('ورود یا خروج جنس بدون قیمت روی حساب مشتری می‌نشیند؛ مشتری را انتخاب کنید.');
    if (type === 'convert' && !partyId) throw bad('تبدیل مانده برای یک طرف حساب است؛ مشتری را انتخاب کنید.');
    if (type === 'hawala') {
      for (const id of [doc.hawala.from, doc.hawala.to]) if (!db.get('SELECT 1 FROM bk_parties WHERE id=? AND deleted_at IS NULL', id)) throw bad('طرف حساب حواله پیدا نشد.');
      doc.partyId = null;
    }
    if (type === 'trade')
      for (const [i, l] of calc.lines.entries()) {
        if (l.kind !== 'bar') continue;
        // a sealed bar is one physical object: it can be in the shop's vault once, and leave only if it is there
        const held = db.get("SELECT COALESCE(SUM(amt),0) AS s FROM bk_postings WHERE acct=? AND src<>?", `bar:${l.serial}`, prev?.id ?? '').s;
        const sameDoc = calc.lines.slice(0, i).filter((x) => x.kind === 'bar' && x.serial === l.serial).reduce((a, x) => a + (x.dir === 'in' ? 1 : -1), 0);
        if (l.dir === 'in' && held + sameDoc >= 1) throw new HttpError(409, `شمش با سریال ${l.serial} هم‌اکنون در صندوق ثبت است؛ یک سریال دو بار وارد نمی‌شود (احتمال شمش تکراری یا جعلی).`);
        if (l.dir === 'out' && held + sameDoc < 1) throw new HttpError(409, `شمش با سریال ${l.serial} در صندوق نیست که تحویل یا فروخته شود.`);
      }
    if (!isAdmin(user)) {
      if (!s.staffCanDiscount && lines.some((l) => B.num(l.discount) > 0)) throw forbid('تخفیف دادن برای فروشنده بسته است.');
      if (!s.staffCanEditPrice)
        for (const l of lines.filter((x) => x.itemId)) {
          const it = db.get('SELECT * FROM bk_items WHERE id=?', l.itemId);
          if (it && (B.num(l.ojrat) !== it.ojrat || (l.ojratMode ?? 'pct') !== it.ojrat_mode || B.num(l.profitPct ?? 7) !== it.profit_pct)) throw forbid(`اجرت و سود کالای ${it.code} فقط با اجازه مدیر تغییر می‌کند.`);
        }
    }
    // accounts named by the payments must exist and be of the right kind
    for (const [i, p] of payments.entries()) {
      const m = B.payMethod(p.method);
      if (m.acct === 'cash' || m.acct === 'bank') {
        if (!p.account) p.account = db.get("SELECT id FROM bk_accounts WHERE kind=? AND active=1 ORDER BY created_at LIMIT 1", m.acct)?.id;
        const a = db.get('SELECT * FROM bk_accounts WHERE id=?', p.account ?? '');
        if (!a || a.kind !== m.acct) throw bad(`پرداخت ${i + 1}: ${m.acct === 'cash' ? 'صندوق' : 'حساب بانکی'} معتبر انتخاب کنید.`);
      }
    }
    // stock pieces: must exist and be free (or already belong to this document)
    const warn = [];
    for (const [i, l] of lines.entries()) {
      if (!l.itemId) continue;
      const it = db.get('SELECT * FROM bk_items WHERE id=?', l.itemId);
      if (!it) throw bad(`ردیف ${i + 1}: کالای انبار پیدا نشد.`);
      if (type === 'sale' || type === 'proforma') {
        if (it.status === 'sold' && it.sold_doc !== prev?.id) throw new HttpError(409, `کالای ${it.code} قبلاً فروخته شده است.`);
        if (it.status === 'out') throw new HttpError(409, `کالای ${it.code} از موجودی خارج شده است.`);
        if (Math.abs(B.num(l.weight) - it.weight) > 0.0005) throw bad(`ردیف ${i + 1}: وزن با وزن ثبت‌شده کالای ${it.code} (${it.weight} گرم) یکی نیست.`);
      }
      if (type === 'return' && it.status !== 'sold' && prev?.id == null) throw new HttpError(409, `کالای ${it.code} فروخته‌شده نیست که برگردد.`);
    }
    if (party?.credit_limit > 0 && calc.credit > 0 && calc.creditUnit === 'IRR') {
      const cur = (balOf(`party:${party.id}`).IRR ?? 0) - (prev ? prevPartyIrr(prev.id, party.id) : 0);
      if (cur + calc.credit > party.credit_limit && !(isAdmin(user) && body.force)) throw new HttpError(409, `سقف اعتبار این مشتری ${B.fmtRial(party.credit_limit)} است؛ با این سند مانده به ${B.fmtRial(cur + calc.credit)} می‌رسد.`);
    }
    return { doc, calc, warn };
  }
  const prevPartyIrr = (src, partyId) => db.get("SELECT COALESCE(SUM(amt),0) AS s FROM bk_postings WHERE src=? AND acct=? AND unit='IRR'", src, `party:${partyId}`).s;
  function cleanBalances(list, money = 'toman') {
    if (!Array.isArray(list)) return [];
    const k = money === 'rial' ? 1 : 10;
    return list.slice(0, 500).map((b) => {
      const acct = String(b.acct ?? '');
      if (!/^(party:[\w-]{8,40}|cash:[\w-]{1,40}|bank:[\w-]{1,40}|gold|coin:\w+|fx:[A-Z]+|bar:[A-Z0-9-]{3,30})$/.test(acct)) throw bad(`حساب ${acct} نامعتبر است.`);
      if (acct.startsWith('fx:') && !TR.FX_CODES[acct.slice(3)]) throw bad('نوع ارز نامعتبر است.');
      if (acct.startsWith('party:') && b.unit && b.unit !== 'IRR') {
        if (!TR.validUnit(b.unit)) throw bad('واحد مانده نامعتبر است.');
        if (!db.get('SELECT 1 FROM bk_parties WHERE id=?', acct.slice(6))) throw bad('مشتری مانده افتتاحیه پیدا نشد.');
        const v = B.num(b.amount);
        if (!Number.isFinite(v) || v === 0) throw bad('مقدار مانده نامعتبر است.');
        return { acct, unit: b.unit, amt: b.unit === 'G750' ? B.r3(v) : b.unit.startsWith('FX:') ? Math.round(v * 100) / 100 : Math.round(v) };
      }
      if (acct.startsWith('fx:') || acct.startsWith('bar:')) {
        const v = B.num(b.amount);
        if (!Number.isFinite(v) || v === 0) throw bad('مقدار مانده نامعتبر است.');
        const cost = b.cost ? B.rnd(B.num(b.cost) * k) : undefined;
        // a sealed bar keeps its card (weight, fineness, maker) so the vault and the bar registry know it from day one
        const meta = acct.startsWith('bar:') && B.num(b.weight) > 0 ? { weight: B.r3(B.num(b.weight)), fineness: Math.min(1000, Math.max(1, B.num(b.fineness ?? 995) || 995)), brand: txt(b.brand, 40), gallery: txt(b.gallery, 40), sealDate: txt(b.sealDate, 20) } : {};
        return { acct, unit: acct.startsWith('fx:') ? 'FX' : 'COUNT', amt: acct.startsWith('fx:') ? Math.round(v * 100) / 100 : Math.round(v), cost, ...meta };
      }
      if (acct.startsWith('party:') && !db.get('SELECT 1 FROM bk_parties WHERE id=?', acct.slice(6))) throw bad('مشتری مانده افتتاحیه پیدا نشد.');
      if (/^(cash|bank):/.test(acct) && !db.get('SELECT 1 FROM bk_accounts WHERE id=? AND kind=?', acct.split(':')[1], acct.split(':')[0])) throw bad(`حساب ${acct} پیدا نشد.`);
      if (acct.startsWith('coin:') && !COIN_TYPES[acct.slice(5)]) throw bad('نوع سکه نامعتبر است.');
      const unit = acct === 'gold' ? 'G750' : acct.startsWith('coin:') ? 'COUNT' : b.unit === 'G750' && acct.startsWith('party:') ? 'G750' : 'IRR';
      const v = B.num(b.amount);
      if (!Number.isFinite(v) || v === 0) throw bad('مبلغ یا مقدار مانده نامعتبر است.');
      const amt = unit === 'IRR' ? B.rnd(v * k) : unit === 'G750' ? B.r3(v) : Math.round(v);
      const cost = b.cost && (acct === 'gold' || acct.startsWith('coin:')) ? B.rnd(B.num(b.cost) * k) : undefined;
      return { acct, unit, amt, cost };
    });
  }

  /** Stock corrections: only what sits in the shop (melt, coins, currency, sealed bars, cash); every line is ± from the
   *  books, and a bar that leaves carries its card so the trading result knows its gold. */
  function adjustBalances(list, money) {
    const rows = cleanBalances(list, money);
    if (!rows.length) throw bad('دست‌کم یک قلم اصلاحی لازم است.');
    return rows.map((b) => {
      if (!/^(gold|coin:\w+|fx:[A-Z]+|bar:[A-Z0-9-]{3,30}|cash:[\w-]{1,40})$/.test(b.acct)) throw bad('اصلاح موجودی فقط برای طلا، سکه، ارز، شمش و صندوق نقد است؛ مانده مشتری و بانک با سند خودشان اصلاح می‌شود.');
      if (b.acct.startsWith('bar:')) {
        const info = barInfo(b.acct.slice(4));
        if (b.amt < 0 && !info.inVault) throw bad(`شمش ${b.acct.slice(4)} در گاوصندوق نیست.`);
        if (b.amt > 0 && info.inVault) throw bad(`شمش ${b.acct.slice(4)} همین حالا در گاوصندوق است.`);
        if (Math.abs(b.amt) !== 1) throw bad('هر ردیف شمش یک عدد است.');
        if (b.amt < 0) return { ...b, weight: info.weight, fineness: info.fineness };
        if (!b.weight) throw bad(`وزن شمش ${b.acct.slice(4)} را وارد کنید.`);
      }
      return b;
    });
  }

  // cheques named by the document's payments: create new ones, update untouched ones, refuse to drop cheques in motion
  function syncCheques(docId, doc, prevDoc) {
    const prevIds = new Set((prevDoc?.payments ?? []).map((p) => p.chequeId).filter(Boolean));
    const keep = new Set();
    for (const p of doc.payments) {
      if (p.method !== 'cheque') continue;
      const amount = B.rnd(B.num(p.amount) * 10);
      const dir = p.dir === 'out' ? 'out' : 'in';
      if (p.chequeId && prevIds.has(p.chequeId)) {
        const c = db.get('SELECT * FROM bk_cheques WHERE id=?', p.chequeId);
        if (c && !['hand', 'issued'].includes(c.status) && (c.amount !== amount || c.dir !== dir)) throw new HttpError(409, `چک ${c.no || c.sayad} در جریان است (${B.CHEQUE_STATUS[c.status]})؛ مبلغ آن را نمی‌توان تغییر داد.`);
        if (c) {
          db.run('UPDATE bk_cheques SET amount=?,dir=?,no=?,sayad=?,bank=?,owner=?,due=?,party_id=?,updated_at=? WHERE id=?', amount, dir, txt(p.chequeNo, 30), B.digitsOnly(p.sayad), txt(p.bank, 40), txt(p.owner, 60), p.due, doc.partyId, now(), c.id);
          keep.add(c.id);
          continue;
        }
      }
      const id = randomUUID();
      db.run('INSERT INTO bk_cheques(id,dir,party_id,amount,no,sayad,bank,owner,due,status,doc_id,history_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)', id, dir, doc.partyId, amount, txt(p.chequeNo, 30), B.digitsOnly(p.sayad), txt(p.bank, 40), txt(p.owner, 60), p.due, dir === 'in' ? 'hand' : 'issued', docId, JSON.stringify([{ at: now(), status: dir === 'in' ? 'hand' : 'issued' }]), now(), now());
      p.chequeId = id;
      keep.add(id);
    }
    for (const id of prevIds) {
      if (keep.has(id)) continue;
      const c = db.get('SELECT * FROM bk_cheques WHERE id=?', id);
      if (!c) continue;
      if (!['hand', 'issued'].includes(c.status)) throw new HttpError(409, `چک ${c.no || c.sayad} در جریان است؛ اول وضعیتش را برگردانید.`);
      db.run('DELETE FROM bk_cheques WHERE id=?', id);
      db.run('DELETE FROM bk_postings WHERE src=?', `chq:${id}`);
    }
  }
  // undo what a document did to stock pieces, before it is re-applied (edit) or dropped (void)
  function releaseItems(docId, prev = null) {
    db.run("UPDATE bk_items SET status='stock', sold_doc=NULL, updated_at=? WHERE sold_doc=?", now(), docId);
    for (const l of prev?.lines ?? []) {
      if (!l.itemId) continue;
      if (prev.type === 'return') db.run("UPDATE bk_items SET status='sold', sold_doc=?, updated_at=? WHERE id=?", prev.ref ?? 'returned', now(), l.itemId);
      if (prev.type === 'proforma') db.run("UPDATE bk_items SET status='stock', updated_at=? WHERE id=? AND status='reserved'", now(), l.itemId);
    }
  }
  function applyItems(docId, doc) {
    for (const l of doc.lines) {
      if (!l.itemId) continue;
      if (doc.type === 'sale') db.run("UPDATE bk_items SET status='sold', sold_doc=?, updated_at=? WHERE id=?", docId, now(), l.itemId);
      if (doc.type === 'return') db.run("UPDATE bk_items SET status='stock', sold_doc=NULL, updated_at=? WHERE id=?", now(), l.itemId);
      if (doc.type === 'proforma') db.run("UPDATE bk_items SET status='reserved', updated_at=? WHERE id=? AND status='stock'", now(), l.itemId);
    }
  }
  function writePostings(docId, doc, calc, status) {
    db.run('DELETE FROM bk_postings WHERE src=?', docId);
    if (status !== 'final') return;
    for (const p of B.postings(doc, calc)) db.run('INSERT INTO bk_postings(src,acct,unit,amt,date) VALUES (?,?,?,?,?)', docId, p.acct, p.unit, p.amt, doc.date);
  }
  const docOut = (r, extra = {}) => {
    const data = JSON.parse(r.data_json);
    const calc = JSON.parse(r.calc_json);
    return { id: r.id, type: r.type, fy: r.fy, no: r.no, track: B.trackCode(r.type, r.fy, r.no), serial: r.serial, status: r.status, version: r.version, date: r.date, partyId: r.party_id, ...data, calc, tax: JSON.parse(r.tax_json), hash: r.hash, verify: verifyCode(r.hash), createdBy: r.created_by, createdAt: r.created_at, updatedBy: r.updated_by, updatedAt: r.updated_at, issuedAt: r.issued_at, ...extra };
  };
  const summary = (r) => {
    const c = JSON.parse(r.calc_json);
    return { id: r.id, type: r.type, fy: r.fy, no: r.no, track: B.trackCode(r.type, r.fy, r.no), status: r.status, version: r.version, date: r.date, partyId: r.party_id, partyName: r.party_name ?? null, sales: c.sales, tradeIn: c.tradeIn, net: c.net, vat: c.vat, credit: c.credit, paidIn: c.paidIn, paidOut: c.paidOut, tax: JSON.parse(r.tax_json).status ?? null, updatedAt: r.updated_at, createdBy: r.created_by_name ?? null };
  };

  function save(user, body, prevRow = null, reason = '') {
    const prev = prevRow ? docOut(prevRow) : null;
    const { doc, calc, warn } = prepare(user, body, prev);
    const usedQuotes = ideas ? ideas.hooks.check(user, doc, calc, prev) : [];
    const wantStatus = body.status === 'draft' || doc.type === 'proforma' ? (doc.type === 'proforma' ? 'final' : 'draft') : 'final';
    if (prev?.status === 'final' && wantStatus === 'draft') throw bad('سند قطعی را نمی‌توان به پیش‌نویس برگرداند؛ ویرایش کنید یا باطل کنید.');
    if (prev?.status === 'void') throw bad('سند باطل‌شده ویرایش نمی‌شود.');
    return db.tx(() => {
      const id = prev?.id ?? randomUUID();
      const t = now();
      const fy = fyOf(doc.date);
      let no = prev?.no, serial = prev?.serial ?? null;
      if (!prev || fy !== prev.fy) no = (db.get('SELECT MAX(no) AS m FROM bk_docs WHERE type=? AND fy=?', doc.type, fy).m ?? 0) + 1;
      if (wantStatus === 'final' && serial == null && (doc.type === 'sale' || doc.type === 'return')) serial = (db.get('SELECT MAX(serial) AS m FROM bk_docs').m ?? 0) + 1;
      if (prev) releaseItems(id, prev);
      syncCheques(id, doc, prev);
      if (wantStatus === 'final' || doc.type === 'proforma') applyItems(id, doc);
      const version = (prev?.version ?? 0) + 1;
      const issuedAt = prev?.issuedAt ?? (wantStatus === 'final' ? t : null);
      // tax-system state: an edit of an invoice already sent must go as a correction (اصلاحی) referring to it
      const tax = { ...(prev?.tax ?? {}) };
      if (prev && (tax.status === 'sent' || tax.status === 'accepted')) tax.pending = 'correction';
      const s = settings();
      if (serial != null && B.validMemoryId(s.memoryId) && !tax.taxId) tax.taxId = B.taxId(s.memoryId, issuedAt ?? t, serial);
      const hash = docHash({ id, type: doc.type, fy, no, version, doc, totals: { sales: calc.sales, net: calc.net, vat: calc.vat, credit: calc.credit } });
      const data = JSON.stringify(doc), cj = JSON.stringify(calc);
      if (prev) db.run('UPDATE bk_docs SET fy=?,no=?,serial=?,status=?,version=?,date=?,party_id=?,data_json=?,calc_json=?,tax_json=?,hash=?,updated_by=?,updated_at=?,issued_at=? WHERE id=?', fy, no, serial, wantStatus, version, doc.date, doc.partyId, data, cj, JSON.stringify(tax), hash, user.id, t, issuedAt, id);
      else db.run('INSERT INTO bk_docs(id,type,fy,no,serial,status,version,date,party_id,data_json,calc_json,tax_json,hash,created_by,created_at,updated_by,updated_at,issued_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', id, doc.type, fy, no, serial, wantStatus, version, doc.date, doc.partyId, data, cj, JSON.stringify(tax), hash, user.id, t, user.id, t, issuedAt);
      db.run('INSERT INTO bk_versions(doc_id,version,status,data_json,calc_json,hash,by,at,reason) VALUES (?,?,?,?,?,?,?,?,?)', id, version, wantStatus, data, cj, hash, user.id, t, txt(reason, 300));
      writePostings(id, doc, calc, doc.type === 'proforma' ? 'draft' : wantStatus);
      if (usedQuotes.length && wantStatus === 'final') ideas.hooks.commit(id, usedQuotes);
      log(user, prev ? 'doc.update' : 'doc.create', id, { type: doc.type, fy, no, version, status: wantStatus, net: calc.net, hash, reason: txt(reason, 300) || undefined });
      return docOut(db.get('SELECT * FROM bk_docs WHERE id=?', id), { warnings: warn });
    });
  }

  on('POST', '/api/books/preview', 'auth', ({ user, body }) => {
    const { calc } = prepare(user, { ...body, date: body.date ?? tehranDay() });
    return { calc };
  });
  on('POST', '/api/books/docs', 'auth', ({ user, body }) => save(user, body));
  on('PUT', '/api/books/docs/:id', 'auth', ({ user, params, body }) => {
    const cur = db.get('SELECT * FROM bk_docs WHERE id=?', params.id);
    if (!cur) throw notFound('سند پیدا نشد.');
    const s = settings();
    if (cur.status === 'final' && !isAdmin(user) && !(s.staffCanEditFinal && cur.created_by === user.id && cur.date === tehranDay())) throw forbid('ویرایش سند قطعی مخصوص مدیر است.');
    if (cur.status === 'final' && String(body.reason ?? '').trim().length < 3) throw bad('دلیل ویرایش را بنویسید؛ در تاریخچه سند می‌ماند.');
    return save(user, body, cur, body.reason);
  });
  function voidDoc(user, id, reason) {
    const cur = db.get('SELECT * FROM bk_docs WHERE id=?', id);
    if (!cur) throw notFound('سند پیدا نشد.');
    ideas?.hooks.voiding(user, cur);
    if (cur.status === 'void') throw bad('این سند قبلاً باطل شده است.');
    if (String(reason ?? '').trim().length < 3) throw bad('دلیل ابطال را بنویسید.');
    const d = docOut(cur);
    const t = now();
    releaseItems(cur.id, d);
    syncCheques(cur.id, { ...d, payments: [] }, d);
    db.run('DELETE FROM bk_postings WHERE src=?', cur.id);
    const tax = JSON.parse(cur.tax_json);
    if (tax.status === 'sent' || tax.status === 'accepted') tax.pending = 'cancel';
    const version = cur.version + 1;
    db.run("UPDATE bk_docs SET status='void', version=?, tax_json=?, updated_by=?, updated_at=? WHERE id=?", version, JSON.stringify(tax), user.id, t, cur.id);
    db.run('INSERT INTO bk_versions(doc_id,version,status,data_json,calc_json,hash,by,at,reason) VALUES (?,?,?,?,?,?,?,?,?)', cur.id, version, 'void', cur.data_json, cur.calc_json, cur.hash, user.id, t, txt(reason, 300));
    log(user, 'doc.void', cur.id, { type: cur.type, fy: cur.fy, no: cur.no, reason: txt(reason, 300) });
  }
  on('POST', '/api/books/docs/:id/void', 'auth', ({ user, params, body }) => {
    guardAdmin(user);
    db.tx(() => voidDoc(user, params.id, body.reason));
    return docOut(db.get('SELECT * FROM bk_docs WHERE id=?', params.id));
  });
  on('POST', '/api/books/docs/:id/finalize', 'auth', ({ user, params }) => {
    const cur = db.get('SELECT * FROM bk_docs WHERE id=?', params.id);
    if (!cur) throw notFound('سند پیدا نشد.');
    const d = docOut(cur);
    if (cur.status === 'draft') return save(user, { ...d, status: 'final' }, cur, 'قطعی شد');
    if (cur.type === 'proforma' && cur.status === 'final') {
      // a pro-forma becomes a new sale invoice; the pro-forma stays as it was, linked
      for (const l of d.lines) if (l.itemId) db.run("UPDATE bk_items SET status='stock' WHERE id=? AND status='reserved'", l.itemId);
      const sale = save(user, { ...d, type: 'sale', status: 'final', ref: cur.id, date: tehranDay(), payments: [] });
      db.run('UPDATE bk_docs SET tax_json=? WHERE id=?', JSON.stringify({ ...JSON.parse(cur.tax_json), convertedTo: sale.id }), cur.id);
      return sale;
    }
    throw bad('این سند پیش‌نویس یا پیش‌فاکتور نیست.');
  });
  on('GET', '/api/books/docs', 'auth', ({ url }) => {
    const sp = url.searchParams;
    const where = ['1=1'], args = [];
    if (sp.get('type')) where.push('d.type=?'), args.push(sp.get('type'));
    if (sp.get('status')) where.push('d.status=?'), args.push(sp.get('status'));
    if (sp.get('party')) where.push('d.party_id=?'), args.push(sp.get('party'));
    if (DAY_RE.test(sp.get('from') ?? '')) where.push('d.date>=?'), args.push(sp.get('from'));
    if (DAY_RE.test(sp.get('to') ?? '')) where.push('d.date<=?'), args.push(sp.get('to'));
    const q = txt(sp.get('q'), 60);
    if (q) {
      const d = B.digitsOnly(q);
      const or = ['p.name LIKE ?', 'd.data_json LIKE ?'];
      args.push(`%${q}%`, `%${q}%`);
      if (d) or.push('p.mobile LIKE ?', 'd.no=?'), args.push(`%${d}%`, Number(d));
      where.push(`(${or.join(' OR ')})`);
    }
    const limit = Math.min(2000, Math.max(1, Number(sp.get('limit')) || 300));
    const rows = db.all(`SELECT d.*, p.name AS party_name, u.name AS created_by_name FROM bk_docs d LEFT JOIN bk_parties p ON p.id=d.party_id LEFT JOIN users u ON u.id=d.created_by WHERE ${where.join(' AND ')} ORDER BY d.date DESC, d.created_at DESC LIMIT ?`, ...args, limit);
    return { items: rows.map(summary) };
  });
  on('GET', '/api/books/docs/:id', 'auth', ({ params }) => {
    const r = db.get('SELECT * FROM bk_docs WHERE id=?', params.id);
    if (!r) throw notFound('سند پیدا نشد.');
    const party = r.party_id ? partyOut(db.get('SELECT * FROM bk_parties WHERE id=?', r.party_id)) : null;
    const versions = db.all('SELECT v.version, v.status, v.hash, v.at, v.reason, u.name AS by_name FROM bk_versions v LEFT JOIN users u ON u.id=v.by WHERE doc_id=? ORDER BY version DESC', r.id).map((v) => ({ version: v.version, status: v.status, hash: v.hash, at: v.at, reason: v.reason, by: v.by_name }));
    const names = Object.fromEntries(db.all('SELECT id, name FROM users WHERE id IN (?,?)', r.created_by ?? '', r.updated_by ?? '').map((u) => [u.id, u.name]));
    const cheques = db.all('SELECT * FROM bk_cheques WHERE doc_id=?', r.id).map(chequeOut);
    const returns = db.all("SELECT id, fy, no, status FROM bk_docs WHERE type='return' AND data_json LIKE ?", `%"ref":"${r.id}"%`);
    return docOut(r, { party, versions, cheques, returns, createdByName: names[r.created_by] ?? null, updatedByName: names[r.updated_by] ?? null });
  });
  on('GET', '/api/books/docs/:id/versions/:v', 'auth', ({ params }) => {
    const v = db.get('SELECT * FROM bk_versions WHERE doc_id=? AND version=?', params.id, Number(params.v));
    if (!v) throw notFound('این نسخه پیدا نشد.');
    return { version: v.version, status: v.status, at: v.at, reason: v.reason, hash: v.hash, ...JSON.parse(v.data_json), calc: JSON.parse(v.calc_json) };
  });
  // multi-edit of documents: void many, move to another customer, change the seller or note, record tax status
  on('POST', '/api/books/docs/bulk', 'auth', ({ user, body }) => {
    guardAdmin(user);
    const ids = Array.isArray(body.ids) ? body.ids.slice(0, 500) : [];
    if (!ids.length) throw bad('هیچ سندی انتخاب نشده است.');
    const op = body.op;
    const results = [];
    db.tx(() => {
      for (const id of ids) {
        const cur = db.get('SELECT * FROM bk_docs WHERE id=?', id);
        if (!cur) throw notFound('سندی پیدا نشد.');
        if (op === 'void') {
          if (cur.status !== 'void') voidDoc(user, id, body.reason);
        } else if (op === 'party' || op === 'seller' || op === 'note' || op === 'date') {
          if (cur.status === 'void') continue;
          const d = docOut(cur);
          const patch = op === 'party' ? { partyId: body.value || null } : op === 'seller' ? { seller: body.value } : op === 'note' ? { note: body.value } : { date: body.value };
          if (String(body.reason ?? '').trim().length < 3 && cur.status === 'final') throw bad('دلیل ویرایش گروهی را بنویسید.');
          save(user, { ...d, ...patch }, cur, body.reason || 'ویرایش گروهی');
        } else if (op === 'tax') {
          if (!['sent', 'accepted', 'rejected', 'none'].includes(body.value)) throw bad('وضعیت مالیاتی نامعتبر است.');
          const tax = JSON.parse(cur.tax_json);
          tax.status = body.value === 'none' ? undefined : body.value;
          tax.at = now();
          if (body.value === 'sent' || body.value === 'accepted') delete tax.pending;
          db.run('UPDATE bk_docs SET tax_json=? WHERE id=?', JSON.stringify(tax), id);
          log(user, 'doc.tax', id, { status: body.value });
        } else throw bad('عملیات گروهی نامعتبر است.');
        results.push(id);
      }
    });
    return { changed: results.length };
  });
  on('GET', '/api/books/docs/:id/moadian', 'auth', ({ params }) => {
    const r = db.get('SELECT * FROM bk_docs WHERE id=?', params.id);
    if (!r) throw notFound('سند پیدا نشد.');
    if (r.status !== 'final') throw bad('فقط سند قطعی به سامانه مودیان می‌رود.');
    const d = docOut(r);
    const s = settings();
    const party = r.party_id ? db.get('SELECT * FROM bk_parties WHERE id=?', r.party_id) : null;
    let invoices;
    try {
      invoices = B.moadianInvoices({ ...d, serial: r.serial, issuedAt: r.issued_at, corrects: d.tax.pending === 'correction', refTaxId: d.tax.pending ? d.tax.taxId : d.type === 'return' && d.ref ? JSON.parse(db.get('SELECT tax_json FROM bk_docs WHERE id=?', d.ref)?.tax_json ?? '{}').taxId ?? null : null }, d.calc, s, party);
    } catch (e) {
      if (e instanceof B.BookError) throw bad(e.message);
      throw e;
    }
    // each invoice of a document needs its own number: the second (pattern 1) uses serial + 1e9 so it never collides
    invoices.forEach((inv, i) => {
      const ser = r.serial + i * 1e9;
      inv.header.taxid = B.validMemoryId(s.memoryId) ? B.taxId(s.memoryId, r.issued_at, ser) : null;
      if (i) inv.header.inno = String(ser).slice(-10).padStart(10, '0');
    });
    const missing = [];
    if (!B.validMemoryId(s.memoryId)) missing.push('شناسه حافظه مالیاتی');
    if (!s.economicCode) missing.push('شماره اقتصادی فروشگاه');
    const noId = invoices.flatMap((inv) => inv.body).filter((r) => !r.sstid).map((r) => r.sstt);
    if (noId.length) missing.push(`شناسه کالا/خدمت برای: ${[...new Set(noId)].join('، ')}`);
    return { invoices, missing, pending: d.tax.pending ?? null };
  });

  /* ---------------- cheques ---------------- */
  const chequeOut = (c) => ({ id: c.id, dir: c.dir, partyId: c.party_id, amount: c.amount, no: c.no, sayad: c.sayad, bank: c.bank, owner: c.owner, due: c.due, status: c.status, accountId: c.account_id, toParty: c.to_party, docId: c.doc_id, history: JSON.parse(c.history_json), createdAt: c.created_at });
  const CHQ_NEXT = { in: { hand: ['deposited', 'returned', 'spent', 'cleared'], deposited: ['cleared', 'bounced', 'hand'], bounced: ['hand', 'returned', 'deposited'], cleared: [], returned: [], spent: ['bounced'] }, out: { issued: ['paid', 'bounced'], paid: [], bounced: ['issued', 'paid'] } };
  // replay a cheque's history after its last reset to the start: each step moves money between the cheque,
  // a bank account and parties. held = the amount still sits on the cheque account.
  function chequePostings(c, H) {
    db.run('DELETE FROM bk_postings WHERE src=?', `chq:${c.id}`);
    const add = (acct, amt, date) => db.run("INSERT INTO bk_postings(src,acct,unit,amt,date) VALUES (?,?,'IRR',?,?)", `chq:${c.id}`, acct, amt, date);
    const from = H.map((h) => h.status).lastIndexOf(c.dir === 'in' ? 'hand' : 'issued');
    const k = c.dir === 'in' ? 1 : -1;
    const party = c.party_id ? `party:${c.party_id}` : 'walkin';
    let held = true, spentTo = null;
    for (const h of H.slice(from + 1)) {
      const day = h.day ?? h.at.slice(0, 10);
      if (h.status === 'cleared' || h.status === 'paid') {
        if (held) add(`chq:${c.id}`, -k * c.amount, day), add(`bank:${h.account}`, k * c.amount, day);
        held = false;
      } else if (h.status === 'bounced' || h.status === 'returned') {
        if (held) add(`chq:${c.id}`, -k * c.amount, day), add(party, k * c.amount, day);
        else if (spentTo) add(`party:${spentTo}`, -c.amount, day), add(party, c.amount, day); // the supplier gave it back
        held = false;
        spentTo = null;
      } else if (h.status === 'deposited' || h.status === 'hand') {
        if (!held && !spentTo) add(`chq:${c.id}`, k * c.amount, day), add(party, -k * c.amount, day); // a bounced cheque presented again
        held = true;
      } else if (h.status === 'spent') {
        if (held) add(`chq:${c.id}`, -c.amount, day), add(`party:${h.toParty}`, c.amount, day);
        held = false;
        spentTo = h.toParty;
      }
    }
  }
  on('GET', '/api/books/cheques', 'auth', ({ url }) => {
    const sp = url.searchParams;
    const where = ['1=1'], args = [];
    if (sp.get('dir')) where.push('c.dir=?'), args.push(sp.get('dir'));
    if (sp.get('status')) where.push('c.status=?'), args.push(sp.get('status'));
    if (DAY_RE.test(sp.get('dueTo') ?? '')) where.push('c.due<=?'), args.push(sp.get('dueTo'));
    const rows = db.all(`SELECT c.*, p.name AS party_name, d.status AS doc_status FROM bk_cheques c LEFT JOIN bk_parties p ON p.id=c.party_id LEFT JOIN bk_docs d ON d.id=c.doc_id WHERE ${where.join(' AND ')} ORDER BY c.due LIMIT 1000`, ...args);
    return { items: rows.filter((r) => r.doc_status === 'final').map((r) => ({ ...chequeOut(r), partyName: r.party_name })) };
  });
  on('PATCH', '/api/books/cheques/:id', 'auth', ({ user, params, body }) => {
    guardAdmin(user);
    const c = db.get('SELECT * FROM bk_cheques WHERE id=?', params.id);
    if (!c) throw notFound('چک پیدا نشد.');
    const next = body.status;
    if (!(CHQ_NEXT[c.dir][c.status] ?? []).includes(next)) throw bad(`تغییر وضعیت از «${B.CHEQUE_STATUS[c.status]}» به «${B.CHEQUE_STATUS[next] ?? next}» مجاز نیست.`);
    const step = { at: now(), day: DAY_RE.test(body.day ?? '') ? body.day : tehranDay(), status: next, note: txt(body.note, 200) || undefined };
    if (['deposited', 'cleared', 'paid'].includes(next)) {
      const acc = body.accountId || c.account_id;
      if (!db.get("SELECT 1 FROM bk_accounts WHERE id=? AND kind='bank'", acc ?? '')) throw bad('حساب بانکی را انتخاب کنید.');
      step.account = acc;
    }
    if (next === 'spent') {
      if (!db.get('SELECT 1 FROM bk_parties WHERE id=? AND deleted_at IS NULL', body.toParty ?? '')) throw bad('گیرنده چک (طرف حساب) را انتخاب کنید.');
      step.toParty = body.toParty;
    }
    const H = [...JSON.parse(c.history_json), step];
    db.tx(() => {
      db.run('UPDATE bk_cheques SET status=?, account_id=?, to_party=?, history_json=?, updated_at=? WHERE id=?', next, step.account ?? c.account_id, step.toParty ?? c.to_party, JSON.stringify(H), now(), c.id);
      chequePostings(c, H);
      log(user, 'cheque.status', c.id, { from: c.status, to: next, amount: c.amount });
    });
    return chequeOut(db.get('SELECT * FROM bk_cheques WHERE id=?', c.id));
  });

  /* ---------------- reports ---------------- */
  const priceBoard = () => {
    const p750 = pricing().p750;
    const coins = {};
    try {
      for (const x of market?.board().items ?? []) coins[x.id] = x.c;
    } catch {
      /* market not available */
    }
    const COIN_MAP = { bahar: 'sekeb', emami: 'sekee', halfOld: 'nim', half: 'nim', quarterOld: 'rob', quarter: 'rob', gerami: 'gerami', parsian: null };
    const coinPrice = Object.fromEntries(Object.keys(COIN_TYPES).map((k) => [k, COIN_MAP[k] && coins[COIN_MAP[k]] ? coins[COIN_MAP[k]] : Math.round((COIN_TYPES[k].weight * COIN_TYPES[k].fineness * p750) / 750)]));
    return { p750, coinPrice };
  };
  on('GET', '/api/books/summary', 'auth', ({ user, url }) => {
    const from = DAY_RE.test(url.searchParams.get('from') ?? '') ? url.searchParams.get('from') : tehranDay();
    const to = DAY_RE.test(url.searchParams.get('to') ?? '') ? url.searchParams.get('to') : from;
    if (!isAdmin(user) && (from !== tehranDay() || to !== tehranDay())) throw forbid('گزارش دوره‌ای مخصوص مدیر است.');
    const docs = db.all("SELECT * FROM bk_docs WHERE status='final' AND date BETWEEN ? AND ?", from, to);
    const T = { sales: 0, principal: 0, consfee: 0, spro: 0, bros: 0, vat: 0, stones: 0, tradeIn: 0, buys: 0, returns: 0, expenses: 0, count: {}, byMethod: {}, credit: 0, soldWeight: 0 };
    for (const r of docs) {
      const c = JSON.parse(r.calc_json);
      T.count[r.type] = (T.count[r.type] ?? 0) + 1;
      if (r.type === 'sale') {
        for (const k of ['sales', 'principal', 'consfee', 'spro', 'bros', 'vat', 'stones', 'tradeIn']) T[k] += c[k];
        T.credit += c.credit;
        T.soldWeight += c.lines.filter((l) => l.side === 'out' && l.kind === 'jewel').reduce((s, l) => s + l.weight, 0);
      }
      if (r.type === 'buy') T.buys += c.tradeIn;
      if (r.type === 'return') {
        T.returns += c.sales;
        T.vat -= c.vat;
      }
      if (r.type === 'expense') T.expenses += c.paidOut;
      for (const p of c.payments) {
        const k = `${p.method}:${p.dir}`;
        T.byMethod[k] = (T.byMethod[k] ?? 0) + p.value;
      }
    }
    T.soldWeight = B.r3(T.soldWeight);
    const accounts = db.all('SELECT * FROM bk_accounts WHERE active=1').map(acctOut);
    const flows = {};
    for (const r of db.all("SELECT acct, SUM(CASE WHEN amt>0 THEN amt ELSE 0 END) AS inflow, SUM(CASE WHEN amt<0 THEN -amt ELSE 0 END) AS outflow FROM bk_postings WHERE (acct LIKE 'cash:%' OR acct LIKE 'bank:%') AND date BETWEEN ? AND ? GROUP BY acct", from, to)) flows[r.acct] = { in: r.inflow, out: r.outflow };
    const dueSoon = db.all("SELECT c.*, p.name AS party_name FROM bk_cheques c LEFT JOIN bk_parties p ON p.id=c.party_id JOIN bk_docs d ON d.id=c.doc_id AND d.status='final' WHERE c.status IN ('hand','deposited','issued') AND c.due<=? ORDER BY c.due LIMIT 50", addDays(tehranDay(), 7)).map((r) => ({ ...chequeOut(r), partyName: r.party_name }));
    return { from, to, totals: T, accounts: accounts.map((a) => ({ ...a, flow: flows[`${a.kind}:${a.id}`] ?? { in: 0, out: 0 } })), gold: balOf('gold').G750 ?? 0, coins: Object.fromEntries(Object.keys(COIN_TYPES).map((k) => [k, balOf(`coin:${k}`).COUNT ?? 0]).filter(([, v]) => v)), stock: db.get("SELECT COUNT(*) AS n, COALESCE(SUM(weight),0) AS w FROM bk_items WHERE status IN ('stock','reserved')"), dueSoon };
  });
  // trial balance of assets at today's price (تراز دارایی)
  on('GET', '/api/books/report/balance', 'auth', ({ user }) => {
    guardAdmin(user);
    const { p750, coinPrice } = priceBoard();
    const all = {};
    for (const r of db.all('SELECT acct, unit, SUM(amt) AS s FROM bk_postings GROUP BY acct, unit')) if (Math.abs(r.s) > 1e-9) (all[r.acct] ??= {})[r.unit] = r.unit === 'G750' ? B.r3(r.s) : Math.round(r.s);
    const sumWhere = (pred, unit = 'IRR') => Object.entries(all).filter(([a]) => pred(a)).reduce((s, [, v]) => s + (v[unit] ?? 0), 0);
    const g = (grams) => B.rnd(grams * p750 * 10);
    const stock = db.all("SELECT weight, fineness, stones FROM bk_items WHERE status IN ('stock','reserved')");
    const stockG = B.r3(stock.reduce((s, i) => s + (i.weight * i.fineness) / 750, 0));
    const recv = Object.entries(all).filter(([a]) => a.startsWith('party:'));
    const lines = {
      cash: sumWhere((a) => a.startsWith('cash:')),
      bank: sumWhere((a) => a.startsWith('bank:')),
      chequesIn: sumWhere((a) => a.startsWith('chq:') && (all[a].IRR ?? 0) > 0),
      chequesOut: sumWhere((a) => a.startsWith('chq:') && (all[a].IRR ?? 0) < 0),
      goldBoxG: all.gold?.G750 ?? 0,
      goldBox: g(all.gold?.G750 ?? 0),
      coins: Object.fromEntries(Object.keys(COIN_TYPES).map((k) => [k, all[`coin:${k}`]?.COUNT ?? 0]).filter(([, v]) => v)),
      coinsValue: Object.keys(COIN_TYPES).reduce((s, k) => s + (all[`coin:${k}`]?.COUNT ?? 0) * coinPrice[k] * 10, 0),
      stockG,
      stockValue: g(stockG) + B.rnd(stock.reduce((s, i) => s + i.stones, 0) * 10),
      receivable: recv.reduce((s, [, v]) => s + Math.max(0, v.IRR ?? 0), 0),
      payable: recv.reduce((s, [, v]) => s + Math.min(0, v.IRR ?? 0), 0),
      goldReceivableG: B.r3(recv.reduce((s, [, v]) => s + Math.max(0, v.G750 ?? 0), 0)),
      goldPayableG: B.r3(recv.reduce((s, [, v]) => s + Math.min(0, v.G750 ?? 0), 0)),
      vatPayable: all.vat?.IRR ?? 0,
      walkin: all.walkin?.IRR ?? 0,
    };
    lines.goldReceivable = g(lines.goldReceivableG);
    lines.goldPayable = g(lines.goldPayableG);
    lines.assets = lines.cash + lines.bank + lines.chequesIn + lines.goldBox + lines.coinsValue + lines.stockValue + lines.receivable + lines.goldReceivable;
    lines.liabilities = -lines.payable - lines.goldPayable - lines.chequesOut + lines.vatPayable;
    lines.net = lines.assets - lines.liabilities;
    // gold position: grams the shop is long (stock + box + gold owed to it) minus grams it owes
    lines.goldPositionG = B.r3(lines.stockG + lines.goldBoxG + lines.goldReceivableG + lines.goldPayableG);
    return { p750, coinPrice, ...lines };
  });
  // VAT return helper: taxable base and VAT per Jalali month of the period (اظهارنامه ارزش افزوده)
  on('GET', '/api/books/report/vat', 'auth', ({ user, url }) => {
    guardAdmin(user);
    const from = url.searchParams.get('from'), to = url.searchParams.get('to');
    if (!DAY_RE.test(from ?? '') || !DAY_RE.test(to ?? '')) throw bad('بازه تاریخ لازم است.');
    const months = new Map();
    for (const r of db.all("SELECT type, date, calc_json FROM bk_docs WHERE status='final' AND type IN ('sale','return') AND date BETWEEN ? AND ? ORDER BY date", from, to)) {
      const c = JSON.parse(r.calc_json);
      const [jy, jm] = jalaliOf(r.date);
      const k = `${jy}-${String(jm).padStart(2, '0')}`;
      const m = months.get(k) ?? { month: k, invoices: 0, returns: 0, principal: 0, consfee: 0, spro: 0, bros: 0, tcpbs: 0, goodsBase: 0, vat: 0 };
      const s = r.type === 'return' ? -1 : 1;
      if (s > 0) m.invoices++;
      else m.returns++;
      for (const l of c.lines) {
        if (l.side !== 'out') continue;
        if (l.kind === 'goods') m.goodsBase += s * (l.principal - l.discount);
        else {
          m.principal += s * (l.principal + l.stones);
          m.consfee += s * l.consfee;
          m.spro += s * l.spro;
          m.bros += s * l.bros;
          m.tcpbs += s * l.tcpbs;
        }
        m.vat += s * l.vat;
      }
      months.set(k, m);
    }
    const rows = [...months.values()];
    const total = rows.reduce((t, m) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, typeof v === 'number' ? (t[k] ?? 0) + v : 'جمع'])), {});
    return { rows, total };
  });
  // sales analysis grouped by template, seller, day, payment method or customer
  on('GET', '/api/books/report/sales', 'auth', ({ user, url }) => {
    guardAdmin(user);
    const from = url.searchParams.get('from'), to = url.searchParams.get('to'), by = url.searchParams.get('by') ?? 'tpl';
    if (!DAY_RE.test(from ?? '') || !DAY_RE.test(to ?? '')) throw bad('بازه تاریخ لازم است.');
    if (!['tpl', 'seller', 'day', 'method', 'party', 'kind'].includes(by)) throw bad('گروه‌بندی نامعتبر است.');
    const g = new Map();
    const put = (key, label, o) => {
      const x = g.get(key) ?? { key, label, count: 0, weight: 0, principal: 0, consfee: 0, spro: 0, vat: 0, total: 0 };
      for (const k of Object.keys(o)) x[k] += o[k];
      g.set(key, x);
    };
    const tplLabel = Object.fromEntries(B.TEMPLATES.map((t) => [t.id, t.label]));
    for (const r of db.all("SELECT d.*, p.name AS party_name FROM bk_docs d LEFT JOIN bk_parties p ON p.id=d.party_id WHERE d.status='final' AND d.type IN ('sale','return') AND d.date BETWEEN ? AND ?", from, to)) {
      const data = JSON.parse(r.data_json), c = JSON.parse(r.calc_json);
      const s = r.type === 'return' ? -1 : 1;
      if (by === 'method') {
        for (const p of c.payments) put(p.method, B.payMethod(p.method)?.label ?? p.method, { count: 1, weight: 0, principal: 0, consfee: 0, spro: 0, vat: 0, total: (p.dir === 'in' ? 1 : -1) * p.value });
        continue;
      }
      c.lines.forEach((l, i) => {
        if (l.side !== 'out') return;
        const src = data.lines[i];
        const key = by === 'tpl' ? src.tpl ?? l.kind : by === 'kind' ? l.kind : by === 'seller' ? data.seller ?? '—' : by === 'day' ? r.date : r.party_id ?? 'walkin';
        const label = by === 'tpl' ? tplLabel[src.tpl] ?? B.KIND_LABEL[l.kind] : by === 'kind' ? B.KIND_LABEL[l.kind] : by === 'party' ? r.party_name ?? 'مشتری گذری' : key;
        put(key, label, { count: s, weight: s * (l.weight || 0), principal: s * (l.principal + l.stones), consfee: s * l.consfee, spro: s * l.spro, vat: s * l.vat, total: s * l.total });
      });
    }
    const rows = [...g.values()].map((x) => ({ ...x, weight: B.r3(x.weight) })).sort((a, b) => b.total - a.total);
    return { by, rows };
  });

  /* ---------------- base edition: day book, trading result, vault, bars, bank, conditional assay ---------------- */
  const docLabel = (d) => `${B.DOC_TYPES[d.type].short} ${d.no}`;
  const userNames = () => Object.fromEntries(db.all('SELECT id, name FROM users').map((u) => [u.id, u.name]));
  const partyRow = (id) => (id ? db.get('SELECT * FROM bk_parties WHERE id=?', id) : null);
  // balance of every customer account after each document, in the order documents happened
  function balancesAfter(partyIds, uptoDay) {
    const snap = new Map(); // `${docId}|${partyId}` -> balance object
    for (const pid of partyIds) {
      const rows = db.all("SELECT p.src, p.unit, p.amt, p.date, COALESCE(d.issued_at, d.created_at, p.date || 'T23:59:59Z') AS ts FROM bk_postings p LEFT JOIN bk_docs d ON d.id=p.src WHERE p.acct=? AND p.date<=? ORDER BY p.date, ts, p.src", `party:${pid}`, uptoDay);
      const run = {};
      let last = null;
      const flush = (src) => snap.set(`${src}|${pid}`, Object.fromEntries(Object.entries(run).filter(([, v]) => Math.abs(v) > 1e-9).map(([u, v]) => [u, roundUnit(u, v)])));
      for (const r of rows) {
        if (last && r.src !== last) flush(last);
        run[r.unit] = (run[r.unit] ?? 0) + r.amt;
        last = r.src;
      }
      if (last) flush(last);
    }
    return snap;
  }
  on('GET', '/api/books/daybook', 'auth', ({ user, url }) => {
    const day = DAY_RE.test(url.searchParams.get('day') ?? '') ? url.searchParams.get('day') : tehranDay();
    if (!isAdmin(user) && day !== tehranDay() && !settings().staffBackdate) throw forbid('روزهای گذشته را مدیر می‌بیند.');
    const docs = db.all("SELECT * FROM bk_docs WHERE date=? AND status<>'draft' ORDER BY COALESCE(issued_at, created_at)", day);
    const names = userNames();
    const pids = new Set();
    for (const d of docs) {
      if (d.party_id) pids.add(d.party_id);
      if (d.type === 'hawala') {
        const h = JSON.parse(d.data_json).hawala;
        pids.add(h.from);
        pids.add(h.to);
      }
    }
    const snap = balancesAfter([...pids], day);
    const accounts = Object.fromEntries(db.all('SELECT id, title FROM bk_accounts').map((a) => [a.id, a.title]));
    const T = { goldIn: 0, goldOut: 0, coins: {}, bars: { in: 0, out: 0 }, fx: {}, money: {}, buys: 0, sells: 0, docs: 0 };
    const entries = docs.map((d) => {
      const data = JSON.parse(d.data_json), c = JSON.parse(d.calc_json);
      const party = partyRow(d.party_id);
      const live = d.status === 'final';
      if (live) {
        T.docs++;
        for (const l of c.lines ?? []) {
          if (d.type === 'trade') {
            if (l.kind === 'melt') l.dir === 'in' ? (T.goldIn += l.eq750) : (T.goldOut += l.eq750);
            if (l.kind === 'coin') T.coins[l.coin] = (T.coins[l.coin] ?? 0) + (l.dir === 'in' ? l.count : -l.count);
            if (l.kind === 'bar') l.dir === 'in' ? T.bars.in++ : T.bars.out++;
            if (l.kind === 'fx') T.fx[l.code] = (T.fx[l.code] ?? 0) + (l.dir === 'in' ? l.amt : -l.amt);
            if (l.priced) l.dir === 'in' ? (T.buys += l.value) : (T.sells += l.value);
          }
        }
        for (const p of c.payments ?? []) T.money[`${p.method}:${p.dir}`] = (T.money[`${p.method}:${p.dir}`] ?? 0) + p.value;
      }
      const who = d.type === 'hawala' ? [data.hawala.from, data.hawala.to] : d.party_id ? [d.party_id] : [];
      return {
        id: d.id, type: d.type, no: d.no, fy: d.fy, track: B.trackCode(d.type, d.fy, d.no), status: d.status, version: d.version, at: d.issued_at ?? d.created_at, by: names[d.created_by] ?? null, note: data.note ?? '',
        party: party ? { id: party.id, code: party.code, name: party.name, label: TR.partyLabel(party), group: party.grp } : null,
        lines: (c.lines ?? []).map((l, i) => ({ ...l, src: data.lines?.[i] ?? {} })),
        payments: (c.payments ?? []).map((p, i) => ({ ...p, ref: data.payments?.[i]?.ref ?? '', card: data.payments?.[i]?.card ? String(data.payments[i].card).slice(-4) : '', account: accounts[data.payments?.[i]?.account] ?? '', chequeNo: data.payments?.[i]?.chequeNo ?? '', due: data.payments?.[i]?.due ?? '' })),
        hawala: c.hawala ? { ...c.hawala, fromName: TR.partyLabel(partyRow(c.hawala.from) ?? { name: '؟' }), toName: TR.partyLabel(partyRow(c.hawala.to) ?? { name: '؟' }) } : null,
        convert: c.convert ?? null,
        net: c.net, credit: c.credit, paidIn: c.paidIn, paidOut: c.paidOut,
        after: live ? Object.fromEntries(who.map((pid) => [pid, snap.get(`${d.id}|${pid}`) ?? {}])) : {},
      };
    });
    T.goldIn = B.r3(T.goldIn);
    T.goldOut = B.r3(T.goldOut);
    const pnl = TR.positionReport(finalEvents(day)).byDay[day] ?? 0;
    return { day, entries, totals: { ...T, realized: pnl } };
  });
  function finalEvents(upto = '9999-12-31') {
    return db.all("SELECT type, date, data_json, calc_json FROM bk_docs WHERE status='final' AND date<=? ORDER BY date, COALESCE(issued_at, created_at)", upto).map((r) => ({ type: r.type, date: r.date, data: JSON.parse(r.data_json), calc: JSON.parse(r.calc_json) }));
  }
  const livePrices = () => {
    const p750 = pricing().p750 * 10; // rial per gram of 750
    const board = {};
    try {
      for (const x of market?.board().items ?? []) if (!x.empty) board[x.id] = x.c * 10;
    } catch {
      /* no market */
    }
    const COIN_MAP = { bahar: 'sekeb', emami: 'sekee', halfOld: 'nim', half: 'nim', quarterOld: 'rob', quarter: 'rob', gerami: 'gerami' };
    const price = { G750: p750 };
    for (const k of Object.keys(COIN_TYPES)) price[`COIN:${k}`] = board[COIN_MAP[k]] ?? COIN_TYPES[k].price ?? B.rnd((COIN_TYPES[k].weight * COIN_TYPES[k].fineness * p750) / 750);
    if (board.usd) price['FX:USD'] = board.usd;
    let sample = true;
    try {
      sample = !!market?.board().sample;
    } catch {
      /* no market */
    }
    return { price, mazaneh: board.mesghal ?? null, mazanehFwd: board.mesghal_fwd ?? null, sample };
  };
  on('GET', '/api/books/report/pnl', 'auth', ({ user, url }) => {
    guardAdmin(user);
    const from = DAY_RE.test(url.searchParams.get('from') ?? '') ? url.searchParams.get('from') : '0000-01-01';
    const to = DAY_RE.test(url.searchParams.get('to') ?? '') ? url.searchParams.get('to') : tehranDay();
    const r = TR.positionReport(finalEvents(to));
    const { price } = livePrices();
    const positions = Object.entries(r.positions).map(([key, p]) => {
      const mark = price[key];
      return { key, ...p, avg: p.qty ? B.rnd(p.cost / p.qty) : 0, price: mark ?? null, value: mark != null ? B.rnd(p.qty * mark) : null, unrealized: mark != null ? B.rnd(p.qty * mark - p.cost) : null };
    });
    const days = Object.entries(r.byDay).filter(([d]) => d >= from && d <= to).sort().map(([day, realized]) => ({ day, realized }));
    const missingCost = finalEvents(to).some((e) => e.type === 'opening' && (e.data.balances ?? []).some((b) => (b.acct === 'gold' || b.acct.startsWith('coin:')) && b.amt > 0 && !b.cost));
    return { from, to, positions, days, realizedTotal: days.reduce((s2, d) => s2 + d.realized, 0), missingCost };
  });
  on('GET', '/api/books/vault', 'auth', () => {
    const rows = db.all("SELECT acct, unit, SUM(amt) AS s FROM bk_postings WHERE acct='gold' OR acct LIKE 'coin:%' OR acct LIKE 'fx:%' OR acct LIKE 'bar:%' OR acct LIKE 'cash:%' OR acct LIKE 'bank:%' GROUP BY acct, unit");
    const out = { gold: 0, coins: {}, fx: {}, bars: [], cash: {}, bank: {} };
    for (const r of rows) {
      if (Math.abs(r.s) < 1e-9) continue;
      if (r.acct === 'gold') out.gold = B.r3(r.s);
      else if (r.acct.startsWith('coin:')) out.coins[r.acct.slice(5)] = Math.round(r.s);
      else if (r.acct.startsWith('fx:')) out.fx[r.acct.slice(3)] = Math.round(r.s * 100) / 100;
      else if (r.acct.startsWith('bar:') && r.s > 0) out.bars.push(r.acct.slice(4));
      else if (r.acct.startsWith('cash:')) out.cash[r.acct.slice(5)] = Math.round(r.s);
      else if (r.acct.startsWith('bank:')) out.bank[r.acct.slice(5)] = Math.round(r.s);
    }
    out.bars = out.bars.map((serial) => barInfo(serial));
    // what customers hold with the shop (custody) and owe, per unit
    const custody = {};
    for (const r of db.all("SELECT unit, SUM(CASE WHEN amt<0 THEN amt ELSE 0 END) AS neg, SUM(CASE WHEN amt>0 THEN amt ELSE 0 END) AS pos FROM (SELECT acct, unit, SUM(amt) AS amt FROM bk_postings WHERE acct LIKE 'party:%' GROUP BY acct, unit) GROUP BY unit")) custody[r.unit] = { owedByShop: roundUnit(r.unit, -r.neg), owedToShop: roundUnit(r.unit, r.pos) };
    return { ...out, custody, prices: livePrices() };
  });
  function barInfo(serial) {
    const hist = db.all("SELECT d.id, d.type, d.no, d.fy, d.date, d.status, d.party_id, d.data_json FROM bk_docs d WHERE d.status='final' AND (d.data_json LIKE ? OR d.data_json LIKE ?) ORDER BY d.date, COALESCE(d.issued_at, d.created_at)", `%"serial":"${serial}"%`, `%"acct":"bar:${serial}"%`)
      .flatMap((d) => {
        const data = JSON.parse(d.data_json);
        if (d.type === 'opening' || d.type === 'adjust') return (data.balances ?? []).map((b, i) => ({ b, i })).filter(({ b }) => b.acct === `bar:${serial}`).map(({ b, i }) => ({ doc: d.id, no: d.no, track: `${B.trackCode(d.type, d.fy, d.no)}/L${i + 1}`, date: d.date, dir: b.amt > 0 ? 'in' : 'out', priced: true, party: null, brand: b.brand ?? '', gallery: b.gallery ?? '', weight: b.weight ? B.r3(b.weight) : null, fineness: b.fineness ?? null, sealDate: b.sealDate ?? '', [d.type]: true }));
        return (data.lines ?? []).map((l, i) => ({ l, i })).filter(({ l }) => l.kind === 'bar' && l.serial === serial).map(({ l, i }) => ({ doc: d.id, no: d.no, track: `${B.trackCode(d.type, d.fy, d.no)}/L${i + 1}`, date: d.date, dir: l.dir, priced: l.priced !== false, party: d.party_id ? TR.partyLabel(partyRow(d.party_id)) : null, brand: l.brand ?? '', gallery: l.gallery ?? '', weight: B.r3(B.num(l.weight)), fineness: B.num(l.fineness ?? 750), sealDate: l.sealDate ?? '' }));
      });
    const last = [...hist].reverse().find((h) => h.weight) ?? hist.at(-1) ?? {};
    const inVault = db.get("SELECT COALESCE(SUM(amt),0) AS s FROM bk_postings WHERE acct=?", `bar:${serial}`).s > 0;
    const holder = db.get("SELECT acct FROM bk_postings WHERE unit=? GROUP BY acct HAVING SUM(amt)<0", `BAR:${serial}`)?.acct;
    return { serial, brand: last.brand ?? '', gallery: last.gallery ?? '', weight: last.weight ?? null, fineness: last.fineness ?? null, sealDate: last.sealDate ?? '', inVault, custodyOf: holder ? TR.partyLabel(partyRow(holder.slice(6)) ?? { name: '؟' }) : null, history: hist };
  }
  on('GET', '/api/books/bars', 'auth', ({ url }) => {
    const q = TR.normSerial(url.searchParams.get('q') ?? '');
    if (q) {
      const serials = [...new Set(db.all("SELECT DISTINCT acct FROM bk_postings WHERE acct LIKE ?", `bar:%${q}%`).map((r) => r.acct.slice(4)))].slice(0, 50);
      return { items: serials.map(barInfo) };
    }
    const serials = db.all("SELECT acct FROM bk_postings WHERE acct LIKE 'bar:%' GROUP BY acct ORDER BY MAX(date) DESC LIMIT 300").map((r) => r.acct.slice(4));
    return { items: serials.map(barInfo) };
  });
  // molten gold bought on a provisional assay (آبشده شرطی): listed until the lab's fineness is recorded
  on('GET', '/api/books/conditional', 'auth', () => {
    const out = [];
    for (const d of db.all("SELECT * FROM bk_docs WHERE status='final' AND type='trade' AND data_json LIKE '%\"conditional\":true%' ORDER BY date")) {
      const data = JSON.parse(d.data_json);
      data.lines.forEach((l, i) => l.conditional && out.push({ doc: d.id, no: d.no, track: `${B.trackCode(d.type, d.fy, d.no)}/L${i + 1}`, date: d.date, line: i, weight: B.r3(B.num(l.weight)), fineness: B.num(l.fineness), dir: l.dir ?? 'in', priced: l.priced !== false, party: d.party_id ? TR.partyLabel(partyRow(d.party_id)) : null }));
    }
    return { items: out };
  });
  on('POST', '/api/books/docs/:id/assay', 'auth', ({ user, params, body }) => {
    const cur = db.get('SELECT * FROM bk_docs WHERE id=?', params.id);
    if (!cur || cur.type !== 'trade' || cur.status !== 'final') throw notFound('سند معامله پیدا نشد.');
    const d = docOut(cur);
    const i = Number(body.line);
    const l = d.lines[i];
    if (!l || l.kind !== 'melt' || !l.conditional) throw bad('این ردیف آبشده شرطی نیست.');
    const f = B.num(body.fineness);
    if (!(f >= 1 && f <= 1000)) throw bad('عیار نامعتبر است.');
    const lines = d.lines.map((x, j) => (j === i ? { ...x, fineness: f, conditional: false, assay: { from: x.fineness, to: f, at: now(), by: user.name } } : x));
    return save(user, { ...d, lines }, cur, `تعیین عیار آبشده شرطی: ${l.fineness} ← ${f}`);
  });
  // bank account ledger, one row per payment (a statement lists a card swipe and a slip of the same trade separately),
  // plus a row for any other movement of the document (transfer, cheque, opening); reconciliation marks per row
  function bankRows(a) {
    const acct = `${a.kind}:${a.id}`;
    const recon = new Map(db.all('SELECT * FROM bk_recon WHERE acct=?', acct).map((r) => [r.src, r]));
    const out = [];
    let run = 0;
    for (const r of db.all("SELECT p.src, SUM(p.amt) AS amt, p.date, COALESCE(d.issued_at, d.created_at, p.date) AS ts, d.type, d.no, d.fy, d.party_id, d.data_json, d.calc_json FROM bk_postings p LEFT JOIN bk_docs d ON d.id=p.src WHERE p.acct=? GROUP BY p.src ORDER BY p.date, ts", acct)) {
      const data = r.data_json ? JSON.parse(r.data_json) : null, calc = r.calc_json ? JSON.parse(r.calc_json) : null;
      const tr = r.type ? B.trackCode(r.type, r.fy, r.no) : '';
      const base = { date: r.date, doc: r.type ? { type: r.type, no: r.no, track: tr } : null, party: r.party_id ? TR.partyLabel(partyRow(r.party_id)) : null };
      let left = Math.round(r.amt);
      const part = (id, amt, ref, refs) => {
        run += amt;
        const rc = recon.get(id) ?? recon.get(r.src);
        out.push({ id, src: r.src, ...base, track: tr && (id.includes('#') ? `${tr}/P${Number(id.split('#')[1]) + 1}` : tr), amt, ref, refs, balance: Math.round(run), reconciled: !!rc, reconRef: rc?.ref ?? '' });
      };
      (data?.payments ?? []).forEach((p, i) => {
        const v = calc?.payments?.[i]?.value;
        if (p.account !== a.id || !v || B.payMethod(p.method)?.acct !== a.kind) return;
        const amt = Math.round(p.dir === 'out' ? -v : v);
        left -= amt;
        part(`${r.src}#${i}`, amt, p.ref ?? '', [[B.payMethod(p.method)?.label, p.ref, p.card && `کارت …${String(p.card).slice(-4)}`].filter(Boolean).join(' ')]);
      });
      if (left) part(r.src, left, '', [r.type ? B.DOC_TYPES[r.type]?.label ?? '' : 'گردش']);
    }
    return { rows: out, book: Math.round(run), recon };
  }
  on('GET', '/api/books/bank/:id', 'auth', ({ user, params }) => {
    guardAdmin(user);
    const a = db.get('SELECT * FROM bk_accounts WHERE id=?', params.id);
    if (!a) throw notFound('حساب پیدا نشد.');
    const { rows, book } = bankRows(a);
    const reconciledBalance = rows.filter((r) => r.reconciled).reduce((s2, r) => s2 + r.amt, 0);
    return { account: acctOut(a), rows, book, reconciledBalance, open: rows.filter((r) => !r.reconciled).length };
  });
  on('POST', '/api/books/bank/:id/recon', 'auth', ({ user, params, body }) => {
    guardAdmin(user);
    const a = db.get('SELECT * FROM bk_accounts WHERE id=?', params.id);
    if (!a) throw notFound('حساب پیدا نشد.');
    const acct = `${a.kind}:${a.id}`;
    const items = Array.isArray(body.items) ? body.items.slice(0, 2000) : [];
    const ids = new Set(bankRows(a).rows.map((r) => r.id));
    db.tx(() => {
      for (const it of items) {
        const id = String(it.src ?? it.id ?? '');
        if (!ids.has(id)) throw bad('ردیف بانکی پیدا نشد.');
        if (it.on) db.run('INSERT INTO bk_recon(src,acct,ref,at,by) VALUES (?,?,?,?,?) ON CONFLICT(src,acct) DO UPDATE SET ref=excluded.ref, at=excluded.at, by=excluded.by', id, acct, txt(it.ref, 60), now(), user.id);
        else db.run('DELETE FROM bk_recon WHERE (src=? OR src=?) AND acct=?', id, id.split('#')[0], acct);
      }
      log(user, 'bank.recon', a.id, { n: items.length });
    });
    return { ok: true };
  });
  on('POST', '/api/books/bank/:id/match', 'auth', ({ user, params, body }) => {
    guardAdmin(user);
    const a = db.get('SELECT * FROM bk_accounts WHERE id=?', params.id);
    if (!a) throw notFound('حساب پیدا نشد.');
    const book = bankRows(a).rows.filter((r) => !r.reconciled).map((r) => ({ id: r.id, date: r.date, amt: r.amt, ref: r.ref }));
    const rows = (Array.isArray(body.rows) ? body.rows : []).slice(0, 5000).map((r) => ({ date: String(r.date), amt: Math.round(B.num(r.amt)), ref: txt(r.ref, 40) })).filter((r) => DAY_RE.test(r.date) && r.amt);
    return { ...TR.matchStatement(book, rows), book, rows };
  });

  /* ---------------- log, backup, public verification ---------------- */
  on('GET', '/api/books/log', 'auth', ({ user, url }) => {
    guardAdmin(user);
    const ref = url.searchParams.get('ref');
    const rows = ref ? db.all('SELECT l.*, u.name FROM bk_log l LEFT JOIN users u ON u.id=l.user_id WHERE ref=? ORDER BY seq DESC LIMIT 500', ref) : db.all('SELECT l.*, u.name FROM bk_log l LEFT JOIN users u ON u.id=l.user_id ORDER BY seq DESC LIMIT 500');
    return { items: rows.map((r) => ({ seq: r.seq, at: r.at, user: r.name, action: r.action, ref: r.ref, detail: JSON.parse(r.detail_json), hash: r.hash })), chain: verifyLog() };
  });
  on('GET', '/api/books/export', 'auth', ({ user }) => {
    guardAdmin(user);
    log(user, 'export', 'all', {});
    const T = (t) => db.all(`SELECT * FROM ${t}`);
    return { app: 'beatris-books', version: 1, at: now(), settings: settings(), parties: T('bk_parties'), accounts: T('bk_accounts'), items: T('bk_items'), docs: T('bk_docs'), versions: T('bk_versions'), cheques: T('bk_cheques'), log: T('bk_log'), chain: verifyLog() };
  });
  on('GET', '/api/verify/:code', 'public', ({ params }) => {
    const code = String(params.code).toLowerCase().replace(/[^0-9a-f]/g, '');
    if (code.length !== 12) throw bad('کد اصالت ۱۲ کاراکتر است.');
    // any printed version verifies; the answer says whether a later version (edit or void) replaced it
    const v = db.get('SELECT * FROM bk_versions WHERE substr(hash,1,12)=? ORDER BY version DESC LIMIT 1', code);
    if (!v) throw notFound('سندی با این کد اصالت ثبت نشده است.');
    const r = db.get('SELECT * FROM bk_docs WHERE id=?', v.doc_id);
    const c = JSON.parse(v.calc_json);
    const s = settings();
    const latest = r.hash === v.hash && r.status !== 'void';
    return { shop: s.legalName || getSetting('brand', {}).shopName || '', type: B.DOC_TYPES[r.type].label, fy: r.fy, no: r.no, date: JSON.parse(v.data_json).date, status: r.status, total: r.type === 'return' ? c.sales : c.sales || Math.abs(c.net), vat: c.vat, version: v.version, currentVersion: r.version, latest, verify: verifyCode(v.hash) };
  });

  /* ---------------- رهگیری: any code → the document's whole life ---------------- */
  const trace = makeTrace({ db, docOut, verifyCode });
  on('GET', '/api/books/trace', 'auth', ({ url }) => trace.search(url.searchParams.get('q') ?? ''));
  // printing, sharing and exporting a document are part of its history too
  on('POST', '/api/books/docs/:id/event', 'auth', ({ user, params, body }) => {
    const r = db.get('SELECT id FROM bk_docs WHERE id=?', params.id);
    if (!r) throw notFound('سند پیدا نشد.');
    const kind = ['print', 'share', 'pdf', 'view'].includes(body.kind) ? body.kind : null;
    if (!kind) throw bad('نوع رویداد نامعتبر است.');
    log(user, `doc.${kind}`, r.id, { format: txt(body.format, 20) || undefined });
    return { ok: true };
  });

  /* ---------------- حافظه: the harness, learned habits and memories ---------------- */
  const learn = makeLearn({ db, now, log, isAdmin });
  const wrap = (fn) => {
    try {
      return fn();
    } catch (e) {
      throw bad(e.message);
    }
  };
  on('POST', '/api/books/events', 'auth', ({ user, body }) => learn.record(user, body.events));
  on('GET', '/api/books/learn/party/:id', 'auth', ({ params }) => {
    if (!db.get('SELECT 1 FROM bk_parties WHERE id=?', params.id)) throw notFound('مشتری پیدا نشد.');
    return learn.partyProfile(params.id);
  });
  on('GET', '/api/books/learn', 'auth', ({ user }) => ({ replay: learn.replay(), operators: learn.operators(user), rhythm: learn.shopRhythm(), memory: learn.allMemories(), shop: learn.memories('shop', '') }));
  on('POST', '/api/books/memory', 'auth', ({ user, body }) => wrap(() => learn.remember(user, body)));
  on('DELETE', '/api/books/memory/:id', 'auth', ({ user, params }) => wrap(() => learn.forget(user, params.id)));

  /* ---------------- داشبورد مدیریت (read-only aggregates) ---------------- */
  const dashboard = makeDashboard({ db, call, tehranDay, livePrices, market, audit: { run: (u) => audit.run(u) } });
  on('GET', '/api/books/dashboard', 'auth', ({ user, url }) => {
    guardAdmin(user);
    const range = ['today', '7', '30', '90', 'custom'].includes(url.searchParams.get('range')) ? url.searchParams.get('range') : '7';
    return dashboard.build({ range, from: url.searchParams.get('from'), to: url.searchParams.get('to') });
  });

  /* ---------------- ممیز (automatic audit) and the assistant ---------------- */
  const audit = makeAudit({ db, call, settings, verifyLog, tehranDay, livePrices, isAdmin });
  on('GET', '/api/books/audit', 'auth', ({ user, url }) => (url.searchParams.get('doc') ? audit.doc(url.searchParams.get('doc')) : audit.run(user)));
  /* ---------------- the shop's AI keys: sealed at rest, never sent back ---------------- */
  const aiStore = () => ({ providers: [], ...getSetting('ai', {}) });
  const aiOpen = (p) => ({ ...p, label: p.label || PROVIDERS[p.kind]?.label || p.kind, dialect: PROVIDERS[p.kind]?.dialect ?? 'openai', base: p.base || PROVIDERS[p.kind]?.base || '', key: sealer && p.keySealed ? sealer.open(p.keySealed, `ai:${shopId}:${p.id}`) ?? '' : '' });
  const aiProviders = () => aiStore().providers.filter((p) => p.enabled !== false && p.keySealed).sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0)).map(aiOpen).filter((p) => p.key && p.base && p.model);
  const assistant = makeAssistant({ db, call, audit, settings, tehranDay, livePrices, isAdmin, learn, providers: aiProviders, useEnv: shopId === 'main' });
  const aiOut = (p) => ({ id: p.id, kind: p.kind, label: p.label || PROVIDERS[p.kind]?.label, base: p.base || PROVIDERS[p.kind]?.base, model: p.model, enabled: p.enabled !== false, priority: p.priority ?? 0, hasKey: !!p.keySealed, keyHint: p.keyHint ?? '', lastTest: p.lastTest ?? null });
  function aiClean(body, cur = {}) {
    const kind = body.kind ?? cur.kind;
    if (!PROVIDERS[kind]) throw bad('سرویس هوش مصنوعی نامعتبر است.');
    const model = txt(body.model ?? cur.model, 120);
    if (!model) throw bad('نام مدل را از پنل همان سرویس بنویسید.');
    let base = body.base !== undefined ? txt(body.base, 300) : cur.base ?? '';
    if (kind === 'custom' || base) {
      const err = checkBaseUrl(base || PROVIDERS[kind].base);
      if (err) throw bad(err);
    }
    if (kind !== 'custom' && base === PROVIDERS[kind].base) base = '';
    return { kind, label: txt(body.label ?? cur.label, 60), model, base, enabled: body.enabled === undefined ? cur.enabled !== false : !!body.enabled, priority: Number.isFinite(Number(body.priority)) ? Number(body.priority) : cur.priority ?? 0 };
  }
  const aiSave = (list, user) => {
    saveSetting('ai', { providers: list }, user.id);
    log(user, 'settings', 'ai', { providers: list.map((p) => ({ id: p.id, kind: p.kind, model: p.model, enabled: p.enabled })) });
  };
  on('GET', '/api/books/ai', 'auth', ({ user }) => {
    guardAdmin(user);
    return { providers: aiStore().providers.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0)).map(aiOut), catalog: Object.entries(PROVIDERS).map(([id, p]) => ({ id, label: p.label, base: p.base, keyHelp: p.keyHelp, dialect: p.dialect })), chain: assistant.info().chain, sealed: !!sealer };
  });
  on('POST', '/api/books/ai', 'auth', ({ user, body }) => {
    guardAdmin(user);
    if (!sealer) throw bad('نگهداری امن کلید روی این سرور فعال نیست.');
    const store = aiStore();
    if (store.providers.length >= 12) throw bad('حداکثر ۱۲ سرویس.');
    const key = String(body.key ?? '').trim();
    if (key.length < 8 || key.length > 400 || /\s/.test(key)) throw bad('کلید API را کامل و بدون فاصله بچسبانید.');
    const id = randomUUID().slice(0, 8);
    const p = { id, ...aiClean(body), priority: body.priority ?? store.providers.length, keySealed: sealer.seal(key, `ai:${shopId}:${id}`), keyHint: keyHint(key), createdAt: now() };
    aiSave([...store.providers, p], user);
    return aiOut(p);
  });
  on('PUT', '/api/books/ai/:id', 'auth', ({ user, params, body }) => {
    guardAdmin(user);
    const store = aiStore();
    const i = store.providers.findIndex((p) => p.id === params.id);
    if (i < 0) throw notFound('این سرویس پیدا نشد.');
    const cur = store.providers[i];
    const next = { ...cur, ...aiClean(body, cur) };
    if (body.key) {
      const key = String(body.key).trim();
      if (key.length < 8 || key.length > 400 || /\s/.test(key)) throw bad('کلید API را کامل و بدون فاصله بچسبانید.');
      next.keySealed = sealer.seal(key, `ai:${shopId}:${cur.id}`);
      next.keyHint = keyHint(key);
    }
    store.providers[i] = next;
    aiSave(store.providers, user);
    return aiOut(next);
  });
  on('PUT', '/api/books/ai', 'auth', ({ user, body }) => {
    guardAdmin(user);
    const store = aiStore();
    if (Array.isArray(body.order)) for (const p of store.providers) p.priority = Math.max(0, body.order.indexOf(p.id)) + (body.order.includes(p.id) ? 0 : 100);
    aiSave(store.providers, user);
    return { providers: store.providers.sort((a, b) => a.priority - b.priority).map(aiOut) };
  });
  on('DELETE', '/api/books/ai/:id', 'auth', ({ user, params }) => {
    guardAdmin(user);
    const store = aiStore();
    if (!store.providers.some((p) => p.id === params.id)) throw notFound('این سرویس پیدا نشد.');
    aiSave(store.providers.filter((p) => p.id !== params.id), user);
    return { ok: true };
  });
  on('POST', '/api/books/ai/:id/test', 'auth', async ({ user, params }) => {
    guardAdmin(user);
    const store = aiStore();
    const p = store.providers.find((x) => x.id === params.id);
    if (!p) throw notFound('این سرویس پیدا نشد.');
    const cfg = aiOpen(p);
    let result;
    try {
      if (!cfg.key) throw new Error('کلید قابل بازخوانی نیست؛ دوباره وارد کنید.');
      result = await assistant.test(cfg);
    } catch (e) {
      result = { ok: false, error: e.name === 'AbortError' ? 'سرویس در زمان مقرر پاسخ نداد.' : e.message };
    }
    const fresh = aiStore();
    const cur = fresh.providers.find((x) => x.id === p.id);
    if (cur) {
      cur.lastTest = { at: now(), ok: result.ok, ms: result.ms ?? null, error: result.error ?? null };
      saveSetting('ai', fresh, user.id);
    }
    return result;
  });
  on('GET', '/api/books/assistant', 'auth', () => assistant.info());
  on('POST', '/api/books/assistant', 'auth', async ({ user, body }) => assistant.ask(user, body));

  /* ---------------- the seven tools: locked quotes, price-move risk, bar cards, counts, shared statements, forecast, day close ---------------- */
  ideas = makeIdeas({ db, on, call, settings, getSetting, saveSetting, livePrices, tehranDay, bad, notFound, HttpError, isAdmin, guardAdmin, log, sealer, shopId, partyRow, verifyLog });

  /* ---------------- راه‌اندازی فروشگاه: the real opening state of a new shop in one step ---------------- */
  const setup = makeSetup({ db, call, settings, getSetting, saveSetting, livePrices, tehranDay, bad, HttpError, isAdmin });
  on('GET', '/api/books/setup', 'auth', ({ user }) => setup.info(user));
  on('POST', '/api/books/setup', 'auth', ({ user, body }) => setup.run(user, body));
  on('POST', '/api/books/setup/skip', 'auth', ({ user }) => setup.skip(user));

  return { verifyLog, settings, audit, assistant, learn, catalogue };
}
