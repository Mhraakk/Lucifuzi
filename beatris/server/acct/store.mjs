// دفتر آموزشی در دیتابیس (spec 0015): the training kernel's journal, persisted in the shop's own SQLite file. The
// database enforces the invariants by itself, so no code path (and no agent) can get around them:
//   • a posted entry and its lines can never be updated or deleted (triggers);
//   • an entry can only become «posted» when Σdr = Σcr in every unit and it has at least two lines;
//   • posting derives the ledger rows and the inventory movements, and the stock table refuses to go below zero;
//   • one idempotency key per book; an optimistic version per book makes two concurrent posts collide, not mix.
// Amounts are integers: rial for IRR, milligrams for G750 and for weights (fine 750 and grams).
import { randomUUID } from 'node:crypto';
import { ACCOUNTS } from '../../public/js/acct/coa.mjs';
import { validateEntry, createBook, AcctError } from '../../public/js/acct/kernel.mjs';

const MG = 1000;
const toMg = (g) => (g == null ? null : Math.round(g * MG));
const fromMg = (m) => (m == null ? null : m / MG);

/** Migrations of the training ledger, numbered; meta key «acct_schema» records the last one applied. */
export const ACCT_MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS acc_accounts (
    code TEXT PRIMARY KEY, name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('asset','liability','equity','revenue','contra','expense')),
    normal TEXT NOT NULL CHECK (normal IN ('dr','cr')), unit TEXT NOT NULL CHECK (unit IN ('IRR','G750')),
    tag TEXT, measure TEXT CHECK (measure IN ('weight','count') OR measure IS NULL)
  );
  CREATE TABLE IF NOT EXISTS acc_books (
    id TEXT PRIMARY KEY, owner_id TEXT, kind TEXT NOT NULL CHECK (kind IN ('practice','scenario')), scenario_id TEXT,
    version INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_acc_books_owner ON acc_books(owner_id, kind);
  CREATE TABLE IF NOT EXISTS acc_journal_entries (
    id TEXT PRIMARY KEY, book_id TEXT NOT NULL REFERENCES acc_books(id), no INTEGER NOT NULL, date TEXT NOT NULL,
    kind TEXT, memo TEXT NOT NULL DEFAULT '', ref TEXT, idem_key TEXT, operator_id TEXT, branch TEXT,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','posted')),
    created_at TEXT NOT NULL, posted_at TEXT,
    UNIQUE (book_id, no), UNIQUE (book_id, idem_key)
  );
  CREATE TABLE IF NOT EXISTS acc_journal_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT, entry_id TEXT NOT NULL REFERENCES acc_journal_entries(id), n INTEGER NOT NULL,
    account TEXT NOT NULL REFERENCES acc_accounts(code), unit TEXT NOT NULL,
    dr INTEGER NOT NULL DEFAULT 0 CHECK (dr >= 0), cr INTEGER NOT NULL DEFAULT 0 CHECK (cr >= 0),
    party TEXT, product TEXT, grams_mg INTEGER, fineness REAL, fine_mg INTEGER, qty INTEGER, adjust TEXT,
    CHECK ((dr > 0) <> (cr > 0)), UNIQUE (entry_id, n)
  );
  CREATE TABLE IF NOT EXISTS acc_ledger_entries (
    line_id INTEGER PRIMARY KEY REFERENCES acc_journal_lines(id), entry_id TEXT NOT NULL, book_id TEXT NOT NULL,
    account TEXT NOT NULL, date TEXT NOT NULL, unit TEXT NOT NULL, amount INTEGER NOT NULL, party TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_acc_ledger ON acc_ledger_entries(book_id, account, date);
  CREATE TABLE IF NOT EXISTS acc_inventory_movements (
    line_id INTEGER PRIMARY KEY REFERENCES acc_journal_lines(id), entry_id TEXT NOT NULL, book_id TEXT NOT NULL,
    account TEXT NOT NULL, product TEXT, date TEXT NOT NULL, grams_mg INTEGER NOT NULL, fine_mg INTEGER NOT NULL, qty INTEGER NOT NULL, value INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS acc_gold_inventory (
    book_id TEXT NOT NULL, account TEXT NOT NULL,
    fine_mg INTEGER NOT NULL DEFAULT 0 CHECK (fine_mg >= 0), grams_mg INTEGER NOT NULL DEFAULT 0,
    qty INTEGER NOT NULL DEFAULT 0 CHECK (qty >= 0), cost INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (book_id, account)
  );
  CREATE TRIGGER IF NOT EXISTS acc_entry_post_check BEFORE UPDATE OF status ON acc_journal_entries
  WHEN NEW.status = 'posted' AND OLD.status = 'draft' BEGIN
    SELECT RAISE(ABORT, 'E_LINES: entry needs two lines')
      WHERE (SELECT COUNT(*) FROM acc_journal_lines WHERE entry_id = NEW.id) < 2;
    SELECT RAISE(ABORT, 'E_BALANCE: debit and credit differ')
      WHERE EXISTS (SELECT 1 FROM acc_journal_lines WHERE entry_id = NEW.id GROUP BY unit HAVING SUM(dr) <> SUM(cr));
  END;
  CREATE TRIGGER IF NOT EXISTS acc_entry_posted AFTER UPDATE OF status ON acc_journal_entries
  WHEN NEW.status = 'posted' AND OLD.status = 'draft' BEGIN
    INSERT INTO acc_ledger_entries(line_id, entry_id, book_id, account, date, unit, amount, party)
      SELECT l.id, l.entry_id, NEW.book_id, l.account, NEW.date, l.unit, l.dr - l.cr, l.party FROM acc_journal_lines l WHERE l.entry_id = NEW.id;
    INSERT INTO acc_inventory_movements(line_id, entry_id, book_id, account, product, date, grams_mg, fine_mg, qty, value)
      SELECT l.id, l.entry_id, NEW.book_id, l.account, l.product, NEW.date,
        CASE WHEN l.adjust = 'purity' THEN 0 ELSE (CASE WHEN l.dr > 0 THEN 1 ELSE -1 END) * COALESCE(l.grams_mg, 0) END,
        (CASE WHEN l.dr > 0 THEN 1 ELSE -1 END) * COALESCE(l.fine_mg, 0),
        (CASE WHEN l.dr > 0 THEN 1 ELSE -1 END) * COALESCE(l.qty, 0), l.dr - l.cr
      FROM acc_journal_lines l JOIN acc_accounts a ON a.code = l.account WHERE l.entry_id = NEW.id AND a.measure IS NOT NULL;
    INSERT OR IGNORE INTO acc_gold_inventory(book_id, account) SELECT DISTINCT NEW.book_id, m.account FROM acc_inventory_movements m WHERE m.entry_id = NEW.id;
    UPDATE acc_gold_inventory SET
      fine_mg = fine_mg + (SELECT COALESCE(SUM(m.fine_mg), 0) FROM acc_inventory_movements m WHERE m.entry_id = NEW.id AND m.account = acc_gold_inventory.account),
      grams_mg = grams_mg + (SELECT COALESCE(SUM(m.grams_mg), 0) FROM acc_inventory_movements m WHERE m.entry_id = NEW.id AND m.account = acc_gold_inventory.account),
      qty = qty + (SELECT COALESCE(SUM(m.qty), 0) FROM acc_inventory_movements m WHERE m.entry_id = NEW.id AND m.account = acc_gold_inventory.account),
      cost = cost + (SELECT COALESCE(SUM(m.value), 0) FROM acc_inventory_movements m WHERE m.entry_id = NEW.id AND m.account = acc_gold_inventory.account)
    WHERE book_id = NEW.book_id AND account IN (SELECT m.account FROM acc_inventory_movements m WHERE m.entry_id = NEW.id);
  END;
  CREATE TRIGGER IF NOT EXISTS acc_entry_frozen BEFORE UPDATE ON acc_journal_entries WHEN OLD.status = 'posted' BEGIN
    SELECT RAISE(ABORT, 'E_IMMUTABLE: a posted entry cannot change');
  END;
  CREATE TRIGGER IF NOT EXISTS acc_entry_nodelete BEFORE DELETE ON acc_journal_entries WHEN OLD.status = 'posted' BEGIN
    SELECT RAISE(ABORT, 'E_IMMUTABLE: a posted entry cannot be deleted');
  END;
  CREATE TRIGGER IF NOT EXISTS acc_line_frozen BEFORE UPDATE ON acc_journal_lines
  WHEN (SELECT status FROM acc_journal_entries WHERE id = OLD.entry_id) = 'posted' BEGIN
    SELECT RAISE(ABORT, 'E_IMMUTABLE: a posted line cannot change');
  END;
  CREATE TRIGGER IF NOT EXISTS acc_line_nodelete BEFORE DELETE ON acc_journal_lines
  WHEN (SELECT status FROM acc_journal_entries WHERE id = OLD.entry_id) = 'posted' BEGIN
    SELECT RAISE(ABORT, 'E_IMMUTABLE: a posted line cannot be deleted');
  END;
  CREATE TRIGGER IF NOT EXISTS acc_line_noadd BEFORE INSERT ON acc_journal_lines
  WHEN (SELECT status FROM acc_journal_entries WHERE id = NEW.entry_id) = 'posted' BEGIN
    SELECT RAISE(ABORT, 'E_IMMUTABLE: no lines can be added to a posted entry');
  END;
  CREATE TRIGGER IF NOT EXISTS acc_ledger_frozen BEFORE UPDATE ON acc_ledger_entries BEGIN SELECT RAISE(ABORT, 'E_IMMUTABLE: ledger rows are derived'); END;
  CREATE TRIGGER IF NOT EXISTS acc_ledger_nodelete BEFORE DELETE ON acc_ledger_entries BEGIN SELECT RAISE(ABORT, 'E_IMMUTABLE: ledger rows are derived'); END;
  CREATE TRIGGER IF NOT EXISTS acc_moves_frozen BEFORE UPDATE ON acc_inventory_movements BEGIN SELECT RAISE(ABORT, 'E_IMMUTABLE: movements are derived'); END;
  CREATE TRIGGER IF NOT EXISTS acc_moves_nodelete BEFORE DELETE ON acc_inventory_movements BEGIN SELECT RAISE(ABORT, 'E_IMMUTABLE: movements are derived'); END;`,
];

export function migrateAcct(db) {
  const cur = Number(db.get("SELECT value FROM meta WHERE key='acct_schema'")?.value ?? 0);
  for (let i = cur; i < ACCT_MIGRATIONS.length; i++) {
    db.tx(() => {
      db.raw.exec(ACCT_MIGRATIONS[i]);
      db.run("INSERT INTO meta(key,value) VALUES ('acct_schema',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", String(i + 1));
    });
  }
  // the chart of accounts follows the code (names may be refined; codes never change meaning)
  for (const a of ACCOUNTS)
    db.run('INSERT INTO acc_accounts(code,name,type,normal,unit,tag,measure) VALUES (?,?,?,?,?,?,?) ON CONFLICT(code) DO UPDATE SET name=excluded.name, tag=excluded.tag', a.code, a.fa, a.type, a.normal, a.unit ?? 'IRR', a.tag ?? null, a.measure ?? null);
}

export function createAcctStore({ db, clock = () => new Date() }) {
  migrateAcct(db);
  const now = () => clock().toISOString();

  function newBook({ ownerId = null, kind = 'practice', scenarioId = null } = {}) {
    const id = `bk_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    db.run('INSERT INTO acc_books(id,owner_id,kind,scenario_id,created_at) VALUES (?,?,?,?,?)', id, ownerId, kind, scenarioId, now());
    return id;
  }
  const getBook = (id) => db.get('SELECT * FROM acc_books WHERE id=?', id);
  /** The user's own practice book (created on first use). */
  function practiceBook(userId) {
    const b = db.get("SELECT id FROM acc_books WHERE owner_id=? AND kind='practice' ORDER BY created_at LIMIT 1", userId);
    return b?.id ?? newBook({ ownerId: userId, kind: 'practice' });
  }

  /** The kernel's view of a stored book (posted entries only, in order). */
  function load(bookId) {
    const entries = db.all("SELECT * FROM acc_journal_entries WHERE book_id=? AND status='posted' ORDER BY no", bookId);
    const lines = db.all("SELECT l.* FROM acc_journal_lines l JOIN acc_journal_entries e ON e.id=l.entry_id WHERE e.book_id=? AND e.status='posted' ORDER BY l.entry_id, l.n", bookId);
    const by = new Map();
    for (const l of lines) {
      const list = by.get(l.entry_id) ?? [];
      const o = { account: l.account, unit: l.unit, dr: l.unit === 'G750' ? fromMg(l.dr) : l.dr, cr: l.unit === 'G750' ? fromMg(l.cr) : l.cr };
      if (l.party != null) o.party = l.party;
      if (l.product != null) o.product = l.product;
      if (l.grams_mg != null) o.grams = fromMg(l.grams_mg);
      if (l.fineness != null) o.fineness = l.fineness;
      if (l.fine_mg != null) o.fine750 = fromMg(l.fine_mg);
      if (l.qty != null) o.qty = l.qty;
      if (l.adjust != null) o.adjust = l.adjust;
      list.push(o);
      by.set(l.entry_id, list);
    }
    const book = createBook(entries.map((e) => ({ id: e.id, no: e.no, date: e.date, kind: e.kind, memo: e.memo, ...(e.ref ? { ref: e.ref } : {}), ...(e.idem_key ? { key: e.idem_key } : {}), ...(e.operator_id ? { operator: e.operator_id } : {}), lines: by.get(e.id) ?? [] })));
    return { ...book, version: getBook(bookId)?.version ?? 0, id: bookId };
  }

  /**
   * Post one entry: the kernel validates it against the current book, the database checks it again while posting.
   * Idempotent by key; `expectedVersion` (optional) makes a stale writer fail with E_CONFLICT instead of posting
   * on top of something it has not seen. Returns { id, no, replayed, version }.
   */
  function postEntry(bookId, entry, { operatorId = null, expectedVersion = null } = {}) {
    return db.tx(() => {
      const b = getBook(bookId);
      if (!b) throw new AcctError('E_BOOK', 'دفتر پیدا نشد.');
      if (entry.key) {
        const seen = db.get('SELECT id, no FROM acc_journal_entries WHERE book_id=? AND idem_key=?', bookId, entry.key);
        if (seen) return { id: seen.id, no: seen.no, replayed: true, version: b.version };
      }
      if (expectedVersion != null && expectedVersion !== b.version) throw new AcctError('E_CONFLICT', 'دفتر همین حالا تغییر کرد؛ دوباره بارگذاری کنید.');
      const book = load(bookId);
      const v = validateEntry(entry, { book });
      if (!v.ok) throw new AcctError('E_INVALID', v.errors[0].msg, { errors: v.errors });
      const e = v.entry;
      // claim the next number with the version bump: a concurrent writer that read the same version fails here
      const bumped = db.run('UPDATE acc_books SET version=version+1 WHERE id=? AND version=?', bookId, b.version);
      if (!bumped.changes) throw new AcctError('E_CONFLICT', 'دفتر همین حالا تغییر کرد؛ دوباره بارگذاری کنید.');
      const no = (db.get('SELECT MAX(no) AS n FROM acc_journal_entries WHERE book_id=?', bookId)?.n ?? 0) + 1;
      const id = `${bookId}:J${String(no).padStart(5, '0')}`;
      db.run('INSERT INTO acc_journal_entries(id,book_id,no,date,kind,memo,ref,idem_key,operator_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)', id, bookId, no, e.date, e.kind ?? null, e.memo ?? '', e.ref ?? null, e.key ?? null, operatorId, now());
      e.lines.forEach((l, n) => {
        const g = l.unit === 'G750';
        db.run('INSERT INTO acc_journal_lines(entry_id,n,account,unit,dr,cr,party,product,grams_mg,fineness,fine_mg,qty,adjust) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)', id, n, l.account, l.unit, g ? toMg(l.dr) : l.dr, g ? toMg(l.cr) : l.cr, l.party ?? null, l.product ?? null, toMg(l.grams), l.fineness ?? null, toMg(l.fine750), l.qty ?? null, l.adjust ?? null);
      });
      db.run("UPDATE acc_journal_entries SET status='posted', posted_at=? WHERE id=?", now(), id);
      return { id, no, replayed: false, version: b.version + 1 };
    });
  }

  /** Stock as the database keeps it (the trigger-maintained table). */
  const stock = (bookId) => db.all('SELECT account, fine_mg, grams_mg, qty, cost FROM acc_gold_inventory WHERE book_id=? ORDER BY account', bookId).map((r) => ({ account: r.account, fine750: fromMg(r.fine_mg), grams: fromMg(r.grams_mg), qty: r.qty, cost: r.cost }));
  /** Ledger as the database derived it: balance per account (debit − credit). */
  const ledgerTotals = (bookId) => db.all('SELECT account, unit, SUM(amount) AS amount FROM acc_ledger_entries WHERE book_id=? GROUP BY account, unit ORDER BY account', bookId).map((r) => ({ ...r, amount: r.unit === 'G750' ? fromMg(r.amount) : r.amount }));

  return { newBook, getBook, practiceBook, load, postEntry, stock, ledgerTotals };
}
