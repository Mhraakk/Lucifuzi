// کارتخوان: every card-reader charge the desk sent through the local bridge (spec 0005). Not a ledger: the payment
// itself lives on the document; this table is for reconciliation — what the terminal answered, and which document it
// ended up on. An approved charge without a document is money taken but not yet booked.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS bk_pos (
  id TEXT PRIMARY KEY, at TEXT NOT NULL, day TEXT NOT NULL, user_id TEXT, amount INTEGER NOT NULL, driver TEXT NOT NULL, state TEXT NOT NULL,
  rrn TEXT NOT NULL DEFAULT '', stan TEXT NOT NULL DEFAULT '', card TEXT NOT NULL DEFAULT '', terminal TEXT NOT NULL DEFAULT '', code TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '', doc_id TEXT, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bkpos_day ON bk_pos(day);
CREATE TABLE IF NOT EXISTS bk_pos_req (
  id TEXT PRIMARY KEY, amount INTEGER NOT NULL, state TEXT NOT NULL, from_user TEXT, from_name TEXT NOT NULL DEFAULT '', station TEXT,
  cancel INTEGER NOT NULL DEFAULT 0, result_json TEXT NOT NULL DEFAULT '{}', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bkposreq_state ON bk_pos_req(state, created_at);
CREATE TABLE IF NOT EXISTS bk_pos_station (id TEXT PRIMARY KEY, name TEXT NOT NULL, user_id TEXT, driver TEXT NOT NULL DEFAULT '', seen_at INTEGER NOT NULL);
`;
// پرداخت از گوشی و تبلت (spec 0035): a device without a card reader asks the counter computer, through this server
const ONLINE_MS = 8000; // a counter seen this recently is online
const PENDING_MS = 60_000; // a request nobody claims in a minute expires
const SILENT_MS = 45_000; // a claimed request with no report for this long: the result is unknown, never «declined»
const ACTIVE = ['connecting', 'waiting'];
export const POS_STATES = ['approved', 'declined', 'cancelled', 'unknown', 'error'];
const clip = (v, n) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);

export function makePos({ db, on, bad, notFound, HttpError, tehranDay, log, now = () => Date.now() }) {
  db.raw.exec(SCHEMA);
  const conflict = (m) => (HttpError ? new HttpError(409, m) : Object.assign(new Error(m), { status: 409 }));
  const row = (r) => r && { id: r.id, at: r.at, day: r.day, userId: r.user_id, amount: r.amount, driver: r.driver, state: r.state, rrn: r.rrn, stan: r.stan, card: r.card, terminal: r.terminal, code: r.code, message: r.message, docId: r.doc_id, orphan: r.state === 'approved' && !r.doc_id };

  /** One outcome into the reconciliation log (same id = same charge; an approval never turns back). */
  function record(userId, b) {
    const id = b.id;
    const cur = db.get('SELECT * FROM bk_pos WHERE id=?', id);
    const t = new Date().toISOString();
    if (cur?.state === 'approved' && b.state !== 'approved') return cur;
    const v = [clip(b.driver, 12) || 'sep', b.state, clip(b.rrn, 20), clip(b.stan, 12), String(b.card ?? '').replace(/\D/g, '').slice(-4), clip(b.terminal, 16), clip(b.code, 4), clip(b.message, 200)];
    if (cur) db.run('UPDATE bk_pos SET driver=?, state=?, rrn=?, stan=?, card=?, terminal=?, code=?, message=?, updated_at=? WHERE id=?', ...v, t, id);
    else db.run('INSERT INTO bk_pos(id,at,day,user_id,amount,driver,state,rrn,stan,card,terminal,code,message,doc_id,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,?)', id, t, tehranDay(), userId, b.amount, ...v, t);
    if (b.state === 'approved' && cur?.state !== 'approved') log({ id: userId }, 'pos.approved', id, { amount: b.amount, rrn: v[2], terminal: v[5], driver: v[0] });
    return db.get('SELECT * FROM bk_pos WHERE id=?', id);
  }
  const validId = (raw) => {
    const id = clip(raw, 64);
    if (!/^[A-Za-z0-9-]{8,64}$/.test(id)) throw bad('شناسه تراکنش کارتخوان نامعتبر است.');
    return id;
  };
  const validAmount = (raw) => {
    const amount = Number(raw);
    if (!Number.isSafeInteger(amount) || amount < 1000 || amount > 999999999999) throw bad('مبلغ تراکنش کارتخوان نامعتبر است.');
    return amount;
  };

  // one call per outcome: the result (and later the document it was booked on); same id = same charge
  on('POST', '/api/books/pos', 'auth', ({ user, body }) => {
    const id = clip(body.id, 64);
    if (!/^[A-Za-z0-9-]{8,64}$/.test(id)) throw bad('شناسه تراکنش کارتخوان نامعتبر است.');
    const cur = db.get('SELECT * FROM bk_pos WHERE id=?', id);
    const t = new Date().toISOString();
    if (body.docId !== undefined && !body.state) {
      if (!cur) throw notFound('تراکنش کارتخوان پیدا نشد.');
      const doc = db.get('SELECT id FROM bk_docs WHERE id=?', clip(body.docId, 64));
      if (!doc) throw notFound('سند پیدا نشد.');
      db.run('UPDATE bk_pos SET doc_id=?, updated_at=? WHERE id=?', doc.id, t, id);
      return row(db.get('SELECT * FROM bk_pos WHERE id=?', id));
    }
    if (!POS_STATES.includes(body.state)) throw bad('وضعیت تراکنش کارتخوان نامعتبر است.');
    const amount = validAmount(body.amount);
    // an approved charge never turns back into something else (the bank already took the money)
    return row(record(cur?.user_id ?? user.id, { ...body, id, amount: cur?.amount ?? amount }));
  });
  /* ---------------- the counter relay (spec 0035) ---------------- */
  const reqOut = (r) => {
    const res = JSON.parse(r.result_json || '{}');
    const st = r.station ? db.get('SELECT name FROM bk_pos_station WHERE id=?', r.station) : null;
    return { id: r.id, amount: r.amount, state: r.state, rrn: res.rrn ?? '', stan: res.stan ?? '', card: res.card ?? '', terminal: res.terminal ?? '', code: res.code ?? '', message: res.message ?? '', driver: res.driver ?? 'relay', station: st?.name ?? '', from: r.from_name, cancel: !!r.cancel };
  };
  /** Requests that time ran out on: unclaimed ones expire, claimed ones a silent counter left become «unknown». */
  function sweep() {
    const t = now();
    for (const r of db.all("SELECT * FROM bk_pos_req WHERE state='pending' AND expires_at<=?", t)) {
      db.run("UPDATE bk_pos_req SET state='expired', result_json=?, updated_at=? WHERE id=? AND state='pending'", JSON.stringify({ message: 'رایانه پیشخوان درخواست را برنداشت؛ روشن بودن بئاتریس روی آن را بررسی کنید و دوباره بزنید.' }), t, r.id);
    }
    for (const r of db.all(`SELECT * FROM bk_pos_req WHERE state IN ('connecting','waiting') AND updated_at<=?`, t - SILENT_MS)) {
      const res = { ...JSON.parse(r.result_json || '{}'), message: 'رایانه پیشخوان دیگر پاسخ نداد. رسید کارتخوان را ببینید؛ اگر موفق بود شماره پیگیری را دستی وارد کنید.' };
      db.run("UPDATE bk_pos_req SET state='unknown', result_json=?, updated_at=? WHERE id=? AND state IN ('connecting','waiting')", JSON.stringify(res), t, r.id);
      record(r.from_user, { id: r.id, amount: r.amount, state: 'unknown', driver: res.driver ?? 'relay', message: res.message });
    }
  }
  const online = () => db.all('SELECT id, name, driver, seen_at FROM bk_pos_station WHERE seen_at>? ORDER BY seen_at DESC', now() - ONLINE_MS);
  // the counter computer: alive, and the next request for it (one at a time), or the cancel of the one it is charging
  on('POST', '/api/books/pos/station', 'auth', ({ user, body }) => {
    const id = validId(body.id);
    const t = now();
    db.run('INSERT INTO bk_pos_station(id,name,user_id,driver,seen_at) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, user_id=excluded.user_id, driver=excluded.driver, seen_at=excluded.seen_at', id, clip(body.name, 40) || 'پیشخوان', user.id, clip(body.driver, 12), t);
    sweep();
    const open = db.get(`SELECT * FROM bk_pos_req WHERE station=? AND state IN ('connecting','waiting') ORDER BY created_at LIMIT 1`, id);
    if (open) return { request: null, active: reqOut(open) };
    if (body.take === false) return { request: null, active: null };
    const next = db.tx(() => {
      const r = db.get("SELECT * FROM bk_pos_req WHERE state='pending' AND expires_at>? ORDER BY created_at LIMIT 1", t);
      if (!r) return null;
      db.run("UPDATE bk_pos_req SET state='connecting', station=?, updated_at=? WHERE id=? AND state='pending'", id, t, r.id);
      return db.get('SELECT * FROM bk_pos_req WHERE id=?', r.id);
    });
    return { request: next ? reqOut(next) : null, active: null };
  });
  on('GET', '/api/books/pos/station', 'auth', () => ({ online: online().map((x) => ({ id: x.id, name: x.name, driver: x.driver, seenAt: new Date(x.seen_at).toISOString() })) }));
  // a phone or tablet asks the counter to charge an exact amount
  on('POST', '/api/books/pos/requests', 'auth', ({ user, body }) => {
    const id = validId(body.id);
    const amount = validAmount(body.amount);
    const cur = db.get('SELECT * FROM bk_pos_req WHERE id=?', id);
    if (cur) return reqOut(cur); // the same id is the same request: never a second charge
    if (!online().length) throw conflict('کارتخوان پیشخوان روشن نیست: روی رایانه پیشخوان بئاتریس را باز کنید و «این رایانه کارتخوان پیشخوان است» را در تنظیمات کارتخوان روشن کنید.');
    const t = now();
    db.run("INSERT INTO bk_pos_req(id,amount,state,from_user,from_name,created_at,updated_at,expires_at) VALUES (?,?,'pending',?,?,?,?,?)", id, amount, user.id, clip(user.name, 60), t, t, t + PENDING_MS);
    return reqOut(db.get('SELECT * FROM bk_pos_req WHERE id=?', id));
  });
  on('GET', '/api/books/pos/requests/:id', 'auth', ({ params }) => {
    sweep();
    const r = db.get('SELECT * FROM bk_pos_req WHERE id=?', params.id);
    if (!r) throw notFound('درخواست کارتخوان پیدا نشد.');
    return reqOut(r);
  });
  on('POST', '/api/books/pos/requests/:id/cancel', 'auth', ({ params }) => {
    const r = db.get('SELECT * FROM bk_pos_req WHERE id=?', params.id);
    if (!r) throw notFound('درخواست کارتخوان پیدا نشد.');
    const t = now();
    if (r.state === 'pending') db.run("UPDATE bk_pos_req SET state='cancelled', result_json=?, updated_at=? WHERE id=? AND state='pending'", JSON.stringify({ message: 'پیش از رسیدن به کارتخوان لغو شد.' }), t, r.id);
    else if (ACTIVE.includes(r.state)) db.run('UPDATE bk_pos_req SET cancel=1 WHERE id=?', r.id); // the counter cancels it on the terminal
    return reqOut(db.get('SELECT * FROM bk_pos_req WHERE id=?', r.id));
  });
  // the counter reports each step of the charge it claimed; the final one also goes to the reconciliation log
  on('POST', '/api/books/pos/requests/:id/result', 'auth', ({ params, body }) => {
    const r = db.get('SELECT * FROM bk_pos_req WHERE id=?', params.id);
    if (!r) throw notFound('درخواست کارتخوان پیدا نشد.');
    if (r.station !== validId(body.station)) throw conflict('این درخواست را رایانه دیگری برداشته است.');
    const state = String(body.state ?? '');
    if (![...ACTIVE, ...POS_STATES].includes(state)) throw bad('وضعیت تراکنش کارتخوان نامعتبر است.');
    if (r.state === 'approved' || !ACTIVE.includes(r.state)) return { ...reqOut(r), cancel: false }; // a final state is final
    const res = { rrn: clip(body.rrn, 20), stan: clip(body.stan, 12), card: String(body.card ?? '').replace(/\D/g, '').slice(-4), terminal: clip(body.terminal, 16), code: clip(body.code, 4), message: clip(body.message, 200), driver: clip(body.driver, 12) };
    db.run('UPDATE bk_pos_req SET state=?, result_json=?, updated_at=? WHERE id=?', state, JSON.stringify(res), now(), r.id);
    if (POS_STATES.includes(state)) record(r.from_user, { id: r.id, amount: r.amount, state, ...res });
    const fresh = db.get('SELECT * FROM bk_pos_req WHERE id=?', r.id);
    return { ...reqOut(fresh), cancel: !!fresh.cancel && ACTIVE.includes(fresh.state) };
  });

  on('GET', '/api/books/pos', 'auth', ({ url }) => {
    const day = url.searchParams.get('day');
    const items = (day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? db.all('SELECT * FROM bk_pos WHERE day=? ORDER BY at DESC', day) : db.all('SELECT * FROM bk_pos ORDER BY at DESC LIMIT 200')).map(row);
    // an approval booked by hand (the RRN typed on a payment) links itself
    for (const o of db.all("SELECT id, rrn FROM bk_pos WHERE state='approved' AND doc_id IS NULL AND rrn<>'' LIMIT 50")) {
      const d = db.get("SELECT id FROM bk_docs WHERE status<>'void' AND data_json LIKE ? LIMIT 1", `%"ref":"${o.rrn.replace(/[%_"\\]/g, '')}"%`);
      if (d) db.run('UPDATE bk_pos SET doc_id=? WHERE id=?', d.id, o.id);
    }
    const orphans = db.all("SELECT * FROM bk_pos WHERE state='approved' AND doc_id IS NULL ORDER BY at DESC LIMIT 50").map(row);
    const sum = (st) => items.filter((x) => x.state === st).reduce((s, x) => s + x.amount, 0);
    return { items, orphans, approved: sum('approved'), count: items.length };
  });
}
