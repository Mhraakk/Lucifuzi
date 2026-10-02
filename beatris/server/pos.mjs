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
`;
export const POS_STATES = ['approved', 'declined', 'cancelled', 'unknown', 'error'];
const clip = (v, n) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);

export function makePos({ db, on, bad, notFound, tehranDay, log }) {
  db.raw.exec(SCHEMA);
  const row = (r) => r && { id: r.id, at: r.at, day: r.day, userId: r.user_id, amount: r.amount, driver: r.driver, state: r.state, rrn: r.rrn, stan: r.stan, card: r.card, terminal: r.terminal, code: r.code, message: r.message, docId: r.doc_id, orphan: r.state === 'approved' && !r.doc_id };

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
    const amount = Number(body.amount);
    if (!Number.isSafeInteger(amount) || amount < 1000 || amount > 999999999999) throw bad('مبلغ تراکنش کارتخوان نامعتبر است.');
    // an approved charge never turns back into something else (the bank already took the money)
    if (cur?.state === 'approved' && body.state !== 'approved') return row(cur);
    const v = [clip(body.driver, 12) || 'sep', body.state, clip(body.rrn, 20), clip(body.stan, 12), String(body.card ?? '').replace(/\D/g, '').slice(-4), clip(body.terminal, 16), clip(body.code, 4), clip(body.message, 200)];
    if (cur) db.run('UPDATE bk_pos SET driver=?, state=?, rrn=?, stan=?, card=?, terminal=?, code=?, message=?, updated_at=? WHERE id=?', ...v, t, id);
    else db.run('INSERT INTO bk_pos(id,at,day,user_id,amount,driver,state,rrn,stan,card,terminal,code,message,doc_id,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,?)', id, t, tehranDay(), user.id, amount, ...v, t);
    if (body.state === 'approved' && cur?.state !== 'approved') log(user, 'pos.approved', id, { amount, rrn: v[2], terminal: v[5], driver: v[0] });
    return row(db.get('SELECT * FROM bk_pos WHERE id=?', id));
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
