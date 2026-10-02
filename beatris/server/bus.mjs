// Event bus and job queue (spec 0001 #8). Two parts, no dependencies:
//   • publish/subscribe inside the process — for things that happen now (a price tick, a saved document);
//   • a durable job queue in SQLite (ops_jobs) — for work that must survive a restart: retried with exponential
//     backoff, idempotent by key, parked as «dead» after its last attempt, and recurring jobs on a fixed period.
// One server process owns the queue (Railway runs one instance); a job left «running» by a crash is re-queued on start.
import { randomUUID } from 'node:crypto';

export const BUS_SCHEMA = `
CREATE TABLE IF NOT EXISTS ops_jobs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  key TEXT UNIQUE,
  payload_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','dead')),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  run_at INTEGER NOT NULL,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  done_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_ops_jobs_due ON ops_jobs(status, run_at);
`;

const BACKOFF_MAX = 10 * 60 * 1000;
const KEEP_DONE = 2 * 24 * 3600 * 1000;

/** Delay before retry n (1-based): 2s, 4s, 8s … capped at 10 minutes. */
export const backoff = (n) => Math.min(BACKOFF_MAX, 1000 * 2 ** n);

export function createBus({ db, clock = () => Date.now(), onError = () => {} }) {
  db.raw.exec(BUS_SCHEMA);
  db.run("UPDATE ops_jobs SET status='queued' WHERE status='running'"); // crash recovery
  const subs = new Map();
  const handlers = new Map();
  const recurring = new Map();
  const counts = { published: 0, delivered: 0, subscriberErrors: 0, ran: 0, failed: 0, dead: 0 };
  let timer = null;
  let busy = false;

  function subscribe(topic, fn) {
    if (!subs.has(topic)) subs.set(topic, new Set());
    subs.get(topic).add(fn);
    return () => subs.get(topic)?.delete(fn);
  }
  /** Synchronous fan-out; one failing subscriber never stops the others or the publisher. */
  function publish(topic, data) {
    counts.published++;
    for (const fn of [...(subs.get(topic) ?? [])]) {
      try {
        fn(data, topic);
        counts.delivered++;
      } catch (e) {
        counts.subscriberErrors++;
        onError(e, { topic });
      }
    }
  }
  const handle = (type, fn) => handlers.set(type, fn);

  /** Adds a job; with a key, the same key is only queued once (the existing id comes back). */
  function enqueue(type, payload = {}, { key = null, delay = 0, maxAttempts = 5 } = {}) {
    if (key) {
      const cur = db.get('SELECT id FROM ops_jobs WHERE key=?', key);
      if (cur) return cur.id;
    }
    const id = randomUUID();
    const t = clock();
    db.run('INSERT INTO ops_jobs(id,type,key,payload_json,max_attempts,run_at,created_at) VALUES (?,?,?,?,?,?,?)', id, type, key, JSON.stringify(payload), Math.max(1, maxAttempts), t + Math.max(0, delay), t);
    return id;
  }
  /** A job every `ms`; the period slot is the idempotency key, so a restart never runs the same slot twice. */
  function every(name, ms, type, payload = {}, opts = {}) {
    recurring.set(name, { ms, type, payload, opts });
  }
  function scheduleRecurring() {
    const t = clock();
    for (const [name, r] of recurring) enqueue(r.type, r.payload, { ...r.opts, key: `${name}@${Math.floor(t / r.ms)}` });
  }

  /** Runs the due jobs (at most `limit`), one at a time. Returns how many ran. */
  async function tick(limit = 10) {
    if (busy) return 0;
    busy = true;
    let n = 0;
    try {
      scheduleRecurring();
      const due = db.all("SELECT * FROM ops_jobs WHERE status='queued' AND run_at<=? ORDER BY run_at LIMIT ?", clock(), limit);
      for (const job of due) {
        const fn = handlers.get(job.type);
        if (!fn) continue; // a handler registered later (or by another build) will pick it up
        db.run("UPDATE ops_jobs SET status='running', attempts=attempts+1 WHERE id=?", job.id);
        const attempt = job.attempts + 1;
        try {
          await fn(JSON.parse(job.payload_json), { id: job.id, attempt });
          db.run("UPDATE ops_jobs SET status='done', done_at=?, last_error=NULL WHERE id=?", clock(), job.id);
          counts.ran++;
        } catch (e) {
          const dead = attempt >= job.max_attempts;
          db.run('UPDATE ops_jobs SET status=?, run_at=?, last_error=? WHERE id=?', dead ? 'dead' : 'queued', clock() + backoff(attempt), String(e?.message ?? e).slice(0, 500), job.id);
          counts.failed++;
          if (dead) counts.dead++;
          onError(e, { job: job.type, attempt, dead });
        }
        n++;
      }
      db.run("DELETE FROM ops_jobs WHERE status='done' AND done_at<?", clock() - KEEP_DONE);
    } finally {
      busy = false;
    }
    return n;
  }
  function start(ms = 1000) {
    if (timer) return;
    timer = setInterval(() => tick().catch((e) => onError(e, {})), ms);
    timer.unref?.();
  }
  function stop() {
    clearInterval(timer);
    timer = null;
  }
  /** Re-queue a dead job (operator action). */
  function retry(id) {
    return db.run("UPDATE ops_jobs SET status='queued', attempts=0, run_at=?, last_error=NULL WHERE id=? AND status='dead'", clock(), id).changes > 0;
  }
  function stats() {
    const by = Object.fromEntries(db.all('SELECT status, COUNT(*) AS n FROM ops_jobs GROUP BY status').map((r) => [r.status, r.n]));
    return {
      queued: by.queued ?? 0,
      running: by.running ?? 0,
      dead: by.dead ?? 0,
      done: by.done ?? 0,
      ...counts,
      topics: [...subs].map(([t, s]) => ({ topic: t, subscribers: s.size })),
      recurring: [...recurring].map(([name, r]) => ({ name, every: r.ms, type: r.type })),
      deadJobs: db.all("SELECT id, type, attempts, last_error, created_at FROM ops_jobs WHERE status='dead' ORDER BY created_at DESC LIMIT 20"),
    };
  }
  return { subscribe, publish, handle, enqueue, every, tick, start, stop, retry, stats };
}
