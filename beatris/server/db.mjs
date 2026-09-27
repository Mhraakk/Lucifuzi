/**
 * Postgres access layer.
 * - Production (Vercel): Neon serverless Pool, from DATABASE_URL / POSTGRES_URL.
 * - Local dev & tests: PGlite (in-process Postgres), in memory or in a data dir.
 * SQL is written with `?` placeholders; they are rewritten to `$n` here.
 */
const SCHEMA = `
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
  score DOUBLE PRECISION NOT NULL,
  passed INTEGER NOT NULL,
  detail_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_exam_user ON exam_attempts(user_id, course_id);
CREATE TABLE IF NOT EXISTS certificates (
  code TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL,
  score DOUBLE PRECISION NOT NULL,
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
  id BIGSERIAL PRIMARY KEY,
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
CREATE TABLE IF NOT EXISTS audit (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT,
  action TEXT NOT NULL,
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);CREATE TABLE IF NOT EXISTS login_limits (
  key TEXT PRIMARY KEY,
  n INTEGER NOT NULL,
  until_ms BIGINT NOT NULL
);
`;

const INT8 = 20;
const NUMERIC = 1700;

export const databaseUrl = (env = process.env) => env.DATABASE_URL || env.POSTGRES_URL || env.DATABASE_URL_UNPOOLED || env.POSTGRES_URL_NON_POOLING || '';

const toPg = (sql) => {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
};

function wrap(query, tx) {
  const all = async (sql, ...p) => (await query(toPg(sql), p)).rows;
  return {
    all,
    get: async (sql, ...p) => (await all(sql, ...p))[0],
    run: async (sql, ...p) => ({ changes: (await query(toPg(sql), p)).affectedRows }),
    tx,
  };
}

async function openNeon(url) {
  const { Pool, types } = await import('@neondatabase/serverless');
  types.setTypeParser(INT8, Number);
  types.setTypeParser(NUMERIC, Number);
  const pool = new Pool({ connectionString: url, max: 5 });
  const query = async (text, values, client = pool) => {
    const r = await client.query(text, values);
    return { rows: r.rows, affectedRows: r.rowCount ?? 0 };
  };
  const db = wrap(query, async (fn) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const r = await fn(wrap((t, v) => query(t, v, client)));
      await client.query('COMMIT');
      return r;
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  });
  db.exec = (sql) => pool.query(sql);
  db.close = () => pool.end();
  return db;
}

async function openLocal(dataDir) {
  const { PGlite } = await import('@electric-sql/pglite');
  const pg = new PGlite(dataDir || undefined, { parsers: { [INT8]: Number, [NUMERIC]: Number } });
  const query = async (text, values, conn = pg) => {
    const r = await conn.query(text, values);
    return { rows: r.rows, affectedRows: r.affectedRows ?? 0 };
  };
  const db = wrap(query, (fn) => pg.transaction((t) => fn(wrap((s, v) => query(s, v, t)))));
  db.exec = (sql) => pg.exec(sql);
  db.close = () => pg.close();
  return db;
}

/**
 * @param {{ url?: string, dataDir?: string }} opts  url → Neon; otherwise PGlite
 *   (dataDir omitted = in-memory).
 */
export async function openDb({ url = databaseUrl(), dataDir } = {}) {
  const db = url ? await openNeon(url) : await openLocal(dataDir);
  await db.exec(SCHEMA);
  await db.run("INSERT INTO meta(key,value) VALUES ('schema_version','3') ON CONFLICT (key) DO NOTHING");
  return db;
}
