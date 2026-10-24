// spec 0015: the database enforces the accounting invariants by itself — immutability after posting, Σdr = Σcr,
// no negative stock, one idempotency key per book, optimistic concurrency — and its derived ledger and stock agree
// with the kernel's after a random history.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.mjs';
import { createAcctStore, migrateAcct } from '../server/acct/store.mjs';
import { buildEntry } from '../public/js/acct/actions.mjs';
import { inventory, ledger, trialBalance, AcctError } from '../public/js/acct/kernel.mjs';
import { rng } from '../public/js/calc.mjs';

const D = '2026-10-01';
const fresh = () => {
  const db = openDb(':memory:');
  return { db, st: createAcctStore({ db }) };
};
const P = (st, b, a) => st.postEntry(b, buildEntry({ date: D, ...a }, st.load(b)).entry);

test('مهاجرت دوباره اجرا نمی‌شود و کدینگ حساب‌ها در جدول است', () => {
  const { db } = fresh();
  migrateAcct(db);
  migrateAcct(db);
  assert.equal(db.get("SELECT value FROM meta WHERE key='acct_schema'").value, '1');
  assert.equal(db.get("SELECT name FROM acc_accounts WHERE code='1310'").name, 'موجودی طلای آبشده');
});

test('سند ثبت‌شده در دیتابیس تغییر و حذف نمی‌شود؛ ردیف تازه هم نمی‌گیرد؛ دفتر کل مشتق است', () => {
  const { db, st } = fresh();
  const b = st.newBook({ ownerId: 'u' });
  P(st, b, { type: 'capital', amount: 1_000_000_000 });
  P(st, b, { type: 'buy_melt', grams: 2, fineness: 750, price750: 80_000_000 });
  const e = db.get('SELECT id FROM acc_journal_entries');
  for (const sql of ['DELETE FROM acc_inventory_movements', 'UPDATE acc_journal_lines SET dr=dr+1', 'DELETE FROM acc_journal_lines', "UPDATE acc_journal_entries SET memo='x'", 'DELETE FROM acc_journal_entries', 'UPDATE acc_ledger_entries SET amount=0', 'DELETE FROM acc_ledger_entries', 'UPDATE acc_inventory_movements SET value=0'])
    assert.throws(() => db.run(sql), /E_IMMUTABLE/, sql);
  assert.throws(() => db.run("INSERT INTO acc_journal_lines(entry_id,n,account,unit,dr,cr) VALUES (?,9,'1110','IRR',1,0)", e.id), /E_IMMUTABLE/);
  assert.equal(db.get('SELECT COUNT(*) AS n FROM acc_ledger_entries').n, 4);
  assert.equal(db.get('SELECT COUNT(*) AS n FROM acc_inventory_movements').n, 1);
});

test('دیتابیس سند نامتوازن، تک‌ردیفی و موجودی منفی را نمی‌پذیرد، حتی اگر کسی از کنار هسته بنویسد', () => {
  const { db, st } = fresh();
  const b = st.newBook({ ownerId: 'u' });
  P(st, b, { type: 'capital', amount: 1_000_000_000 });
  const draft = (id, lines) => {
    db.run("INSERT INTO acc_journal_entries(id,book_id,no,date,created_at) VALUES (?,?,?,?, 't')", id, b, 100 + id.length, D);
    lines.forEach((l, n) => db.run('INSERT INTO acc_journal_lines(entry_id,n,account,unit,dr,cr,grams_mg,fineness,fine_mg) VALUES (?,?,?,?,?,?,?,?,?)', id, n, l[0], 'IRR', l[1], l[2], l[3] ?? null, l[4] ?? null, l[5] ?? null));
    return () => db.run("UPDATE acc_journal_entries SET status='posted' WHERE id=?", id);
  };
  assert.throws(draft('x1', [['1110', 10, 0], ['3100', 0, 9]]), /E_BALANCE/);
  assert.throws(draft('x22', [['1110', 10, 0]]), /E_LINES/);
  assert.throws(draft('x333', [['1310', 0, 500, 1000, 750, 1000], ['1110', 500, 0]]), /CHECK constraint failed/);
  assert.throws(() => db.run("INSERT INTO acc_journal_lines(entry_id,n,account,unit,dr,cr) VALUES ('x1',7,'1110','IRR',5,5)"), /CHECK constraint failed/, 'a line is debit or credit, not both');
  assert.equal(db.get("SELECT COUNT(*) AS n FROM acc_journal_entries WHERE status='posted'").n, 1);
});

test('کلید یکتا: همان سند دو بار ثبت نمی‌شود؛ نسخه کهنه با خطای تعارض رد می‌شود', () => {
  const { db, st } = fresh();
  const b = st.newBook({ ownerId: 'u' });
  const e = buildEntry({ date: D, type: 'capital', amount: 5_000_000, key: 'idem-capital-1' }, st.load(b)).entry;
  const a1 = st.postEntry(b, e);
  const a2 = st.postEntry(b, e);
  assert.equal(a2.id, a1.id);
  assert.equal(a2.replayed, true);
  assert.equal(db.get('SELECT COUNT(*) AS n FROM acc_journal_entries').n, 1);
  const v = st.load(b).version;
  P(st, b, { type: 'expense', amount: 1_000 });
  assert.throws(() => st.postEntry(b, buildEntry({ date: D, type: 'expense', amount: 2_000 }, st.load(b)).entry, { expectedVersion: v }), (err) => err instanceof AcctError && err.code === 'E_CONFLICT');
  // two writers that loaded the same version: the second one collides instead of posting on a stale view
  const stale = st.load(b);
  const w1 = buildEntry({ date: D, type: 'expense', amount: 3_000 }, stale).entry;
  const w2 = buildEntry({ date: D, type: 'expense', amount: 4_000 }, stale).entry;
  st.postEntry(b, w1, { expectedVersion: stale.version });
  assert.throws(() => st.postEntry(b, w2, { expectedVersion: stale.version }), /تغییر کرد/);
});

test('تاریخچه تصادفی: موجودی و دفتر کل دیتابیس با هسته یکی است و تراز می‌بندد', () => {
  const { st } = fresh();
  const b = st.newBook({ ownerId: 'u' });
  P(st, b, { type: 'capital', amount: 100_000_000_000 });
  const r = rng(77);
  for (let i = 0; i < 250; i++) {
    const t = ['buy_melt', 'buy_supplier', 'sell_jewelry', 'assay', 'buy_coin', 'sell_coin'][Math.floor(r() * 6)];
    const a = { type: t, grams: Math.round(r() * 1000) / 100 + 0.1, fineness: 750, price750: 80_000_000 + Math.floor(r() * 1e7), making: 1_000_000, profitPct: 5, declared: 750, actual: 745, qty: 1 + Math.floor(r() * 3), unitPrice: 900_000_000 };
    try {
      P(st, b, a);
    } catch (e) {
      assert.ok(e instanceof AcctError, e.message);
    }
  }
  const book = st.load(b);
  assert.equal(trialBalance(book).balanced, true);
  const inv = inventory(book);
  for (const s of st.stock(b)) {
    assert.equal(s.fine750, inv[s.account].fine750, `${s.account} weight`);
    assert.equal(s.qty, inv[s.account].qty, `${s.account} count`);
    assert.equal(s.cost, inv[s.account].cost, `${s.account} cost`);
  }
  const L = ledger(book);
  for (const row of st.ledgerTotals(b)) assert.equal(Math.abs(row.amount), Math.abs(L[row.account].balance), row.account);
});
