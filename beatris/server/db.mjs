import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('employee','trainer','manager','owner')),
  branch TEXT NOT NULL DEFAULT '',
  pin_hash TEXT NOT NULL,
  token_version INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1,
  demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  last_login_at TEXT
);
CREATE TABLE IF NOT EXISTS lesson_done (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id TEXT NOT NULL,
  done_at TEXT NOT NULL,
  PRIMARY KEY (user_id, lesson_id)
);
CREATE TABLE IF NOT EXISTS quiz_answers (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL,
  correct INTEGER NOT NULL,
  first_correct INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, question_id)
);
CREATE TABLE IF NOT EXISTS exam_attempts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL,
  score REAL NOT NULL,
  passed INTEGER NOT NULL,
  detail_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_exam_user ON exam_attempts(user_id, course_id);
CREATE TABLE IF NOT EXISTS certificates (
  code TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL,
  score REAL NOT NULL,
  issued_at TEXT NOT NULL,
  UNIQUE (user_id, course_id)
);
CREATE TABLE IF NOT EXISTS scenario_attempts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scenario_id TEXT NOT NULL,
  score INTEGER NOT NULL,
  max INTEGER NOT NULL,
  path_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scen_user ON scenario_attempts(user_id, scenario_id);
CREATE TABLE IF NOT EXISTS cards (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  card_id TEXT NOT NULL,
  box INTEGER NOT NULL DEFAULT 1,
  due_at TEXT NOT NULL,
  reviews INTEGER NOT NULL DEFAULT 0,
  lapses INTEGER NOT NULL DEFAULT 0,
  first_seen TEXT NOT NULL,
  PRIMARY KEY (user_id, card_id)
);
CREATE TABLE IF NOT EXISTS drills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  correct INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_drills_user ON drills(user_id);
CREATE TABLE IF NOT EXISTS floor_tasks (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('requested','verified','rejected')),
  note TEXT NOT NULL DEFAULT '',
  reviewer_note TEXT NOT NULL DEFAULT '',
  reviewer_id TEXT,
  requested_at TEXT NOT NULL,
  reviewed_at TEXT,
  PRIMARY KEY (user_id, task_id)
);
CREATE TABLE IF NOT EXISTS sop_acks (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sop_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  acked_at TEXT NOT NULL,
  PRIMARY KEY (user_id, sop_id)
);
CREATE TABLE IF NOT EXISTS assignments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL,
  due_date TEXT,
  note TEXT NOT NULL DEFAULT '',
  assigned_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (user_id, course_id)
);
CREATE TABLE IF NOT EXISTS attendance (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  in_at TEXT,
  out_at TEXT,
  PRIMARY KEY (user_id, day)
);
CREATE TABLE IF NOT EXISTS activity (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT);
CREATE TABLE IF NOT EXISTS designs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  project_json TEXT NOT NULL,
  thumb TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_designs_created ON designs(created_at);
CREATE TABLE IF NOT EXISTS coin_photos (
  id TEXT PRIMARY KEY,
  coin TEXT NOT NULL,
  label TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT '',
  sides_json TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS market_bars (
  symbol TEXT NOT NULL,
  day TEXT NOT NULL,
  o REAL NOT NULL,
  h REAL NOT NULL,
  l REAL NOT NULL,
  c REAL NOT NULL,
  src TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (symbol, day)
);
CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  shop TEXT NOT NULL,
  city TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL,
  branches INTEGER NOT NULL DEFAULT 1,
  message TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','won','lost')),
  ip TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  action TEXT NOT NULL,
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
`;

export function openDb(dir = process.env.BEATRIS_DATA_DIR || path.resolve('data'), file = 'beatris-v2.db', { snapshot = false } = {}) {
  if (dir !== ':memory:') mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(dir === ':memory:' ? ':memory:' : path.join(dir, file));
  db.exec(snapshot ? SCHEMA.replace('PRAGMA journal_mode = WAL;', 'PRAGMA journal_mode = DELETE;') : SCHEMA);
  db.prepare("INSERT OR IGNORE INTO meta(key,value) VALUES ('schema_version','2')").run();
  migrate(db);
  return wrap(db);
}

/** Additive migrations for databases created by earlier versions. */
function migrate(db) {
  const cols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  if (!cols.includes('username')) db.exec('ALTER TABLE users ADD COLUMN username TEXT');
  if (!cols.includes('last_login_ua')) db.exec('ALTER TABLE users ADD COLUMN last_login_ua TEXT');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username) WHERE username IS NOT NULL');
}

function wrap(db) {
  const cache = new Map();
  let depth = 0;
  const stmt = (sql) => {
    let s = cache.get(sql);
    if (!s) {
      s = db.prepare(sql);
      cache.set(sql, s);
    }
    return s;
  };
  return {
    raw: db,
    all: (sql, ...p) => stmt(sql).all(...p),
    get: (sql, ...p) => stmt(sql).get(...p),
    run: (sql, ...p) => stmt(sql).run(...p),
    // nested calls become savepoints, so a helper that opens a transaction can run inside a bigger one
    tx(fn) {
      const sp = depth ? `sp${depth}` : null;
      db.exec(sp ? `SAVEPOINT ${sp}` : 'BEGIN');
      depth++;
      try {
        const r = fn();
        depth--;
        db.exec(sp ? `RELEASE ${sp}` : 'COMMIT');
        return r;
      } catch (e) {
        depth--;
        db.exec(sp ? `ROLLBACK TO ${sp}; RELEASE ${sp}` : 'ROLLBACK');
        throw e;
      }
    },
    close: () => db.close(),
  };
}
