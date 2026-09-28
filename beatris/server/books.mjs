// Shop books on the server: customers, stock, documents with full version history, cheques, cash and bank
// accounts, derived postings, reports and a hash-chained event log. The arithmetic lives in public/js/books.mjs;
// this module only stores, validates against the database, and derives.
import { createHash, randomUUID } from 'node:crypto';
import * as B from '../public/js/books.mjs';
import { jalaliOf } from '../public/js/ta.mjs';
import { COIN_TYPES } from '../public/js/coins.mjs';

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
};

export function registerBooks({ on, db, bad, notFound, HttpError, pricing, getSetting, saveSetting, isAdmin, market }) {
  db.raw.exec(BOOKS_SCHEMA);
  if (!db.get('SELECT 1 FROM bk_accounts LIMIT 1')) {
    db.run("INSERT INTO bk_accounts(id,kind,title,created_at) VALUES ('main','cash','صندوق اصلی',?)", now());
    db.run("INSERT INTO bk_accounts(id,kind,title,created_at) VALUES ('bank-main','bank','حساب بانکی اصلی',?)", now());
  }
  const settings = () => ({ ...DEFAULT_BOOKS, ...getSetting('books', {}), vatPct: pricing().vatPct ?? 10 });
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
  const partyOut = (p) => p && { id: p.id, code: p.code, kind: p.kind, name: p.name, nid: p.nid, eco: p.eco, mobile: p.mobile, phone: p.phone, postal: p.postal, address: p.address, birth: p.birth, tags: p.tags, note: p.note, creditLimit: p.credit_limit, sms: !!p.sms, createdAt: p.created_at, updatedAt: p.updated_at, deleted: !!p.deleted_at };
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
    const creditLimit = Math.max(0, B.rnd(B.num(body.creditLimit || 0) * 10) || 0);
    for (const [col, v, label] of [['mobile', mobile, 'این موبایل'], ['nid', nid, 'این کد ملی']]) {
      if (!v) continue;
      const dup = db.get(`SELECT code, name FROM bk_parties WHERE ${col}=? AND deleted_at IS NULL AND id<>?`, v, id ?? '');
      if (dup) throw new HttpError(409, `${label} قبلاً برای «${dup.name}» (کد ${dup.code}) ثبت شده است.`);
    }
    return { kind, name, mobile, nid, eco, postal, birth, phone: txt(body.phone, 30), address: txt(body.address, 300), tags: txt(body.tags, 120), note: txt(body.note, 600), creditLimit, sms: body.sms === false ? 0 : 1 };
  }
  const balOf = (acct) => {
    const o = {};
    for (const r of db.all('SELECT unit, SUM(amt) AS s FROM bk_postings WHERE acct=? GROUP BY unit', acct)) if (Math.abs(r.s) > 1e-9) o[r.unit] = r.unit === 'G750' ? B.r3(r.s) : Math.round(r.s);
    return o;
  };
  on('GET', '/api/books/parties', 'auth', ({ url }) => {
    const q = txt(url.searchParams.get('q'), 60);
    const d = B.digitsOnly(q);
    let rows;
    if (q) {
      const or = ['name LIKE ?', 'tags LIKE ?'], args = [`%${q}%`, `%${q}%`];
      if (d) or.push('mobile LIKE ?', 'nid LIKE ?', 'CAST(code AS TEXT)=?'), args.push(`%${d}%`, `%${d}%`, d);
      rows = db.all(`SELECT * FROM bk_parties WHERE deleted_at IS NULL AND (${or.join(' OR ')}) ORDER BY name LIMIT 200`, ...args);
    } else rows = db.all('SELECT * FROM bk_parties WHERE deleted_at IS NULL ORDER BY updated_at DESC LIMIT 500');
    const bal = new Map();
    for (const r of db.all("SELECT acct, unit, SUM(amt) AS s FROM bk_postings WHERE acct LIKE 'party:%' GROUP BY acct, unit")) {
      if (Math.abs(r.s) < 1e-9) continue;
      const id = r.acct.slice(6);
      bal.set(id, { ...(bal.get(id) ?? {}), [r.unit]: r.unit === 'G750' ? B.r3(r.s) : Math.round(r.s) });
    }
    return { items: rows.map((p) => ({ ...partyOut(p), balance: bal.get(p.id) ?? {} })) };
  });
  on('POST', '/api/books/parties', 'auth', ({ user, body }) => {
    const p = cleanParty(body);
    const id = randomUUID();
    const t = now();
    db.tx(() => {
      const code = (db.get('SELECT MAX(code) AS m FROM bk_parties').m ?? 1000) + 1;
      db.run('INSERT INTO bk_parties(id,code,kind,name,nid,eco,mobile,phone,postal,address,birth,tags,note,credit_limit,sms,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', id, code, p.kind, p.name, p.nid, p.eco, p.mobile, p.phone, p.postal, p.address, p.birth, p.tags, p.note, p.creditLimit, p.sms, t, t);
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
      db.run('UPDATE bk_parties SET kind=?,name=?,nid=?,eco=?,mobile=?,phone=?,postal=?,address=?,birth=?,tags=?,note=?,credit_limit=?,sms=?,updated_at=? WHERE id=?', p.kind, p.name, p.nid, p.eco, p.mobile, p.phone, p.postal, p.address, p.birth, p.tags, p.note, p.creditLimit, p.sms, now(), cur.id);
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
    const rows = db.all('SELECT src, unit, SUM(amt) AS amt, MIN(date) AS date FROM bk_postings WHERE acct=? GROUP BY src, unit ORDER BY date, src', acct);
    const docs = new Map(db.all("SELECT id, type, fy, no, date, status, calc_json FROM bk_docs WHERE party_id=? AND status<>'void'", p.id).map((d) => [d.id, d]));
    const run = {};
    const statement = rows.map((r) => {
      run[r.unit] = (run[r.unit] ?? 0) + r.amt;
      const d = docs.get(r.src);
      return { src: r.src, date: r.date, unit: r.unit, amt: r.unit === 'G750' ? B.r3(r.amt) : Math.round(r.amt), balance: r.unit === 'G750' ? B.r3(run[r.unit]) : Math.round(run[r.unit]), doc: d ? { id: d.id, type: d.type, no: d.no, fy: d.fy } : null };
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
    return { ...s, taxReady: B.validMemoryId(s.memoryId) && !!s.economicCode };
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
      for (const k of ['kind', 'side', 'tpl', 'itemId', 'title', 'weight', 'fineness', 'p750', 'ojratMode', 'ojrat', 'profitPct', 'bros', 'stones', 'discount', 'coin', 'count', 'price', 'mazaneh', 'stoneWeight', 'deductPct', 'amount', 'qty', 'vatPct', 'code']) if (l[k] !== undefined && l[k] !== '') o[k] = typeof l[k] === 'string' ? txt(l[k], 120) : l[k];
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
      balances: type === 'opening' ? cleanBalances(body.balances) : undefined,
    };
    let calc;
    try {
      calc = B.calcDoc(doc, { vatPct: s.vatPct });
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
  function cleanBalances(list) {
    if (!Array.isArray(list)) return [];
    return list.slice(0, 500).map((b) => {
      const acct = String(b.acct ?? '');
      if (!/^(party:[\w-]{8,40}|cash:[\w-]{1,40}|bank:[\w-]{1,40}|gold|coin:\w+)$/.test(acct)) throw bad(`حساب ${acct} نامعتبر است.`);
      if (acct.startsWith('party:') && !db.get('SELECT 1 FROM bk_parties WHERE id=?', acct.slice(6))) throw bad('مشتری مانده افتتاحیه پیدا نشد.');
      if (/^(cash|bank):/.test(acct) && !db.get('SELECT 1 FROM bk_accounts WHERE id=? AND kind=?', acct.split(':')[1], acct.split(':')[0])) throw bad(`حساب ${acct} پیدا نشد.`);
      if (acct.startsWith('coin:') && !COIN_TYPES[acct.slice(5)]) throw bad('نوع سکه نامعتبر است.');
      const unit = acct === 'gold' ? 'G750' : acct.startsWith('coin:') ? 'COUNT' : b.unit === 'G750' && acct.startsWith('party:') ? 'G750' : 'IRR';
      const v = B.num(b.amount);
      if (!Number.isFinite(v) || v === 0) throw bad('مبلغ یا مقدار مانده نامعتبر است.');
      const amt = unit === 'IRR' ? B.rnd(v * 10) : unit === 'G750' ? B.r3(v) : Math.round(v);
      return { acct, unit, amt };
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
    return { id: r.id, type: r.type, fy: r.fy, no: r.no, serial: r.serial, status: r.status, version: r.version, date: r.date, partyId: r.party_id, ...data, calc, tax: JSON.parse(r.tax_json), hash: r.hash, verify: verifyCode(r.hash), createdBy: r.created_by, createdAt: r.created_at, updatedBy: r.updated_by, updatedAt: r.updated_at, issuedAt: r.issued_at, ...extra };
  };
  const summary = (r) => {
    const c = JSON.parse(r.calc_json);
    return { id: r.id, type: r.type, fy: r.fy, no: r.no, status: r.status, version: r.version, date: r.date, partyId: r.party_id, partyName: r.party_name ?? null, sales: c.sales, tradeIn: c.tradeIn, net: c.net, vat: c.vat, credit: c.credit, paidIn: c.paidIn, paidOut: c.paidOut, tax: JSON.parse(r.tax_json).status ?? null, updatedAt: r.updated_at, createdBy: r.created_by_name ?? null };
  };

  function save(user, body, prevRow = null, reason = '') {
    const prev = prevRow ? docOut(prevRow) : null;
    const { doc, calc, warn } = prepare(user, body, prev);
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

  return { verifyLog, settings };
}
