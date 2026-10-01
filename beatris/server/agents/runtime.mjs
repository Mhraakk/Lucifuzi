// اجرای عامل‌ها (spec 0015) — adapted from Open Dot's runtime (a run per agent, tools that pause for the user's
// approval and resume after it), rebuilt for Beatris's own stack: SQLite tables, no model in the loop by default.
//
// An agent is a deterministic plan: an async function that calls typed tools through ctx.tool(). Every tool call
// is a step stored with its result, so a run is *durable by replay*: after a pause (approval, restart, «paused»),
// the plan runs again from the top and every step already done returns its stored result instead of running
// twice. A plan must therefore take every changing fact (time, prices, balances) from tool results.
//
// Run states: queued → running → (waiting_approval | paused) → running → completed | failed | cancelled.
import { randomUUID } from 'node:crypto';
import { parse } from './schema.mjs';

export const AGENT_SCHEMA = `
CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY, agent TEXT NOT NULL, user_id TEXT, idem_key TEXT UNIQUE, origin TEXT NOT NULL DEFAULT 'user',
  status TEXT NOT NULL CHECK (status IN ('queued','running','waiting_approval','paused','completed','failed','cancelled')),
  input_json TEXT NOT NULL DEFAULT '{}', output_json TEXT, error TEXT, steps INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_runs_user ON agent_runs(user_id, created_at);
CREATE TABLE IF NOT EXISTS agent_steps (
  id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES agent_runs(id), n INTEGER NOT NULL, tool TEXT NOT NULL,
  args_json TEXT NOT NULL, result_json TEXT, status TEXT NOT NULL CHECK (status IN ('done','waiting','denied','error')),
  error TEXT, created_at TEXT NOT NULL, UNIQUE (run_id, n)
);
CREATE TABLE IF NOT EXISTS agent_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL, type TEXT NOT NULL, data_json TEXT NOT NULL DEFAULT '{}', at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_events_run ON agent_events(run_id, id);
CREATE TABLE IF NOT EXISTS agent_approvals (
  id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES agent_runs(id), step_n INTEGER NOT NULL, tool TEXT NOT NULL,
  args_json TEXT NOT NULL, summary TEXT NOT NULL, requested_by TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending','approved','denied','expired')),
  decided_by TEXT, decided_at TEXT, note TEXT, created_at TEXT NOT NULL, UNIQUE (run_id, step_n)
);
CREATE INDEX IF NOT EXISTS idx_agent_approvals_status ON agent_approvals(status, created_at);
CREATE TABLE IF NOT EXISTS agent_memory (
  user_id TEXT NOT NULL, kind TEXT NOT NULL, key TEXT NOT NULL, value_json TEXT NOT NULL, updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, kind, key)
);
`;
export const RUN_STATES = ['queued', 'running', 'waiting_approval', 'paused', 'completed', 'failed', 'cancelled'];
const FINAL = new Set(['completed', 'failed', 'cancelled']);

class Halt extends Error {
  constructor(status) {
    super(status);
    this.status = status;
  }
}
export class AgentError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/**
 * tools: { name: { input: schema, label, cap?, approval?: (args, ctx) => summary|null, run: (args, ctx) => result } }
 * agents: { id: { name, tools: [names], plan: async (ctx) => output } }
 * can(user, cap) decides permissions; users(id) loads a user row.
 */
export function createRuntime({ db, tools, agents, can, users, clock = () => new Date(), onEvent = () => {} }) {
  db.raw.exec(AGENT_SCHEMA);
  // after a restart nothing is running: a run left «running» continues on the next resume or sweep
  db.run("UPDATE agent_runs SET status='queued' WHERE status='running'");
  const now = () => clock().toISOString();
  const event = (runId, type, data = {}) => {
    db.run('INSERT INTO agent_events(run_id,type,data_json,at) VALUES (?,?,?,?)', runId, type, JSON.stringify(data), now());
    onEvent({ runId, type, data });
  };
  const setStatus = (id, status, extra = {}) => {
    db.run('UPDATE agent_runs SET status=?, output_json=COALESCE(?, output_json), error=?, updated_at=? WHERE id=?', status, extra.output === undefined ? null : JSON.stringify(extra.output), extra.error ?? null, now(), id);
    event(id, status, extra.error ? { error: extra.error } : {});
  };
  const getRun = (id) => db.get('SELECT * FROM agent_runs WHERE id=?', id);

  /** Start (or, with the same key, return) a run. Runs it at once; returns the run view. */
  async function start(agentId, { user, input = {}, key = null, origin = 'user' }) {
    const agent = agents[agentId];
    if (!agent) throw new AgentError('E_AGENT', 'عامل شناخته نیست.', 404);
    if (key) {
      const seen = db.get('SELECT id FROM agent_runs WHERE idem_key=?', key);
      if (seen) return view(seen.id);
    }
    const id = `run_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    db.run('INSERT INTO agent_runs(id,agent,user_id,idem_key,origin,status,input_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)', id, agentId, user?.id ?? null, key, origin, 'queued', JSON.stringify(input), now(), now());
    event(id, 'queued', { agent: agentId, origin });
    await execute(id);
    return view(id);
  }

  const running = new Set();
  /** Run (or re-run by replay) a run's plan until it completes, pauses or waits for an approval. */
  async function execute(id) {
    if (running.has(id)) return;
    const run = getRun(id);
    if (!run || FINAL.has(run.status) || run.status === 'paused' || run.status === 'waiting_approval') return;
    const agent = agents[run.agent];
    const user = run.user_id ? users(run.user_id) : null;
    running.add(id);
    setStatus(id, 'running');
    let n = 0;
    const ctx = {
      runId: id,
      user,
      input: JSON.parse(run.input_json),
      origin: run.origin,
      get memory() {
        return memory;
      },
      /** Call a tool: replayed if done, paused for approval if sensitive, refused if not allowed. */
      async tool(name, args = {}) {
        const step = n++;
        const cur = getRun(id);
        if (cur.status === 'cancelled') throw new Halt('cancelled');
        if (cur.status === 'paused') throw new Halt('paused');
        const done = db.get('SELECT * FROM agent_steps WHERE run_id=? AND n=?', id, step);
        if (done) {
          if (done.tool !== name) throw new AgentError('E_REPLAY', `اجرای دوباره با گام ثبت‌شده نمی‌خواند (${done.tool} ≠ ${name}).`);
          if (done.status === 'done') return JSON.parse(done.result_json);
          if (done.status === 'denied') return { denied: true, reason: done.error };
          if (done.status === 'error') throw new AgentError('E_TOOL', done.error);
        }
        const t = tools[name];
        if (!t || !agent.tools.includes(name)) throw new AgentError('E_TOOL', `ابزار «${name}» برای این عامل مجاز نیست.`, 403);
        const a = parse(t.input, args);
        if (t.cap && !can(user, t.cap)) throw new AgentError('E_FORBIDDEN', `اجازه «${t.label}» را ندارید.`, 403);
        const summary = t.approval?.(a, ctx) ?? null;
        if (summary) {
          const ap = db.get('SELECT * FROM agent_approvals WHERE run_id=? AND step_n=?', id, step);
          if (!ap) {
            db.run('INSERT INTO agent_approvals(id,run_id,step_n,tool,args_json,summary,requested_by,status,created_at) VALUES (?,?,?,?,?,?,?,?,?)', `apr_${randomUUID().replace(/-/g, '').slice(0, 16)}`, id, step, name, JSON.stringify(a), summary, user?.id ?? null, 'pending', now());
            db.run('INSERT OR IGNORE INTO agent_steps(id,run_id,n,tool,args_json,status,created_at) VALUES (?,?,?,?,?,?,?)', randomUUID(), id, step, name, JSON.stringify(a), 'waiting', now());
            event(id, 'approval_requested', { tool: name, summary });
            throw new Halt('waiting_approval');
          }
          if (ap.status === 'pending') throw new Halt('waiting_approval');
          if (ap.status !== 'approved') {
            db.run("INSERT INTO agent_steps(id,run_id,n,tool,args_json,status,error,created_at) VALUES (?,?,?,?,?,'denied',?,?) ON CONFLICT(run_id,n) DO UPDATE SET status='denied', error=excluded.error", randomUUID(), id, step, name, JSON.stringify(a), ap.note ?? 'رد شد', now());
            return { denied: true, reason: ap.note ?? 'رد شد' };
          }
        }
        event(id, 'step', { n: step, tool: name });
        try {
          const result = await t.run(a, ctx);
          db.run('INSERT INTO agent_steps(id,run_id,n,tool,args_json,result_json,status,created_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(run_id,n) DO UPDATE SET result_json=excluded.result_json, status=excluded.status', randomUUID(), id, step, name, JSON.stringify(a), JSON.stringify(result ?? null), 'done', now());
          db.run('UPDATE agent_runs SET steps=? WHERE id=?', step + 1, id);
          return result;
        } catch (e) {
          db.run('INSERT INTO agent_steps(id,run_id,n,tool,args_json,status,error,created_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(run_id,n) DO UPDATE SET status=excluded.status, error=excluded.error', randomUUID(), id, step, name, JSON.stringify(a), 'error', String(e.message).slice(0, 500), now());
          throw e;
        }
      },
      /** A note in the run's log (no effect on anything). */
      note(text) {
        if (!db.get("SELECT 1 FROM agent_events WHERE run_id=? AND type='note' AND data_json=?", id, JSON.stringify({ n, text }))) event(id, 'note', { n, text });
      },
    };
    try {
      const output = await agent.plan(ctx);
      setStatus(id, 'completed', { output: output ?? null });
    } catch (e) {
      if (e instanceof Halt) {
        if (e.status !== 'cancelled' && getRun(id).status === 'running') setStatus(id, e.status);
      } else setStatus(id, 'failed', { error: String(e.message ?? e).slice(0, 500) });
    } finally {
      running.delete(id);
    }
  }

  /** Approve or deny a pending approval. The decider needs the tool's approver capability and must not be the requester. */
  async function decide(approvalId, user, decision, note = null) {
    const ap = db.get('SELECT * FROM agent_approvals WHERE id=?', approvalId);
    if (!ap) throw new AgentError('E_APPROVAL', 'درخواست تأیید پیدا نشد.', 404);
    if (ap.status !== 'pending') throw new AgentError('E_APPROVAL', 'این درخواست قبلاً بررسی شده است.', 409);
    if (!can(user, tools[ap.tool]?.approver ?? 'books.admin')) throw new AgentError('E_FORBIDDEN', 'تأیید این کار با مدیر است.', 403);
    if (ap.requested_by && ap.requested_by === user.id) throw new AgentError('E_FOUR_EYES', 'درخواست خودتان را نمی‌توانید تأیید کنید (کنترل چهار چشم).', 403);
    if (!['approved', 'denied'].includes(decision)) throw new AgentError('E_INPUT', 'تصمیم باید تأیید یا رد باشد.');
    db.run('UPDATE agent_approvals SET status=?, decided_by=?, decided_at=?, note=? WHERE id=? AND status=?', decision, user.id, now(), note, approvalId, 'pending');
    event(ap.run_id, 'approval_decided', { decision, by: user.id });
    db.run("DELETE FROM agent_steps WHERE run_id=? AND n=? AND status='waiting'", ap.run_id, ap.step_n);
    if (getRun(ap.run_id).status === 'waiting_approval') db.run("UPDATE agent_runs SET status='queued' WHERE id=?", ap.run_id);
    await execute(ap.run_id);
    return view(ap.run_id);
  }

  function pause(id, user) {
    const r = own(id, user);
    if (FINAL.has(r.status)) throw new AgentError('E_STATE', 'این اجرا تمام شده است.', 409);
    setStatus(id, 'paused');
    return view(id);
  }
  async function resume(id, user) {
    const r = own(id, user);
    if (r.status !== 'paused' && r.status !== 'queued') throw new AgentError('E_STATE', 'فقط اجرای متوقف ادامه می‌یابد.', 409);
    db.run("UPDATE agent_runs SET status='queued' WHERE id=?", id);
    event(id, 'resumed');
    await execute(id);
    return view(id);
  }
  function cancel(id, user) {
    const r = own(id, user);
    if (FINAL.has(r.status)) return view(id);
    db.run("UPDATE agent_approvals SET status='expired' WHERE run_id=? AND status='pending'", id);
    setStatus(id, 'cancelled');
    return view(id);
  }
  function own(id, user) {
    const r = getRun(id);
    if (!r) throw new AgentError('E_RUN', 'اجرا پیدا نشد.', 404);
    if (r.user_id !== user?.id && !can(user, 'books.admin')) throw new AgentError('E_FORBIDDEN', 'این اجرا مال شما نیست.', 403);
    return r;
  }
  /** Runs left queued (after a restart, or approved while busy) go on. */
  async function sweep() {
    for (const r of db.all("SELECT id FROM agent_runs WHERE status='queued' ORDER BY created_at LIMIT 20")) await execute(r.id);
  }

  function view(id) {
    const r = getRun(id);
    if (!r) return null;
    return {
      id: r.id, agent: r.agent, agentName: agents[r.agent]?.name ?? r.agent, status: r.status, origin: r.origin, userId: r.user_id,
      input: JSON.parse(r.input_json), output: r.output_json ? JSON.parse(r.output_json) : null, error: r.error, createdAt: r.created_at, updatedAt: r.updated_at,
      steps: db.all('SELECT n, tool, status, error, result_json FROM agent_steps WHERE run_id=? ORDER BY n', id).map((s) => ({ n: s.n, tool: s.tool, label: tools[s.tool]?.label ?? s.tool, status: s.status, error: s.error })),
      approvals: db.all('SELECT id, step_n, tool, summary, status, requested_by, decided_by, decided_at, note FROM agent_approvals WHERE run_id=? ORDER BY step_n', id),
    };
  }
  const list = ({ userId = null, limit = 30 } = {}) => (userId ? db.all('SELECT id FROM agent_runs WHERE user_id=? ORDER BY created_at DESC LIMIT ?', userId, limit) : db.all('SELECT id FROM agent_runs ORDER BY created_at DESC LIMIT ?', limit)).map((r) => view(r.id));
  const pendingApprovals = () => db.all("SELECT a.*, r.agent FROM agent_approvals a JOIN agent_runs r ON r.id=a.run_id WHERE a.status='pending' ORDER BY a.created_at").map((a) => ({ id: a.id, runId: a.run_id, agent: a.agent, tool: a.tool, label: tools[a.tool]?.label ?? a.tool, summary: a.summary, requestedBy: a.requested_by, createdAt: a.created_at, args: JSON.parse(a.args_json) }));
  const events = (id) => db.all('SELECT type, data_json, at FROM agent_events WHERE run_id=? ORDER BY id', id).map((e) => ({ type: e.type, data: JSON.parse(e.data_json), at: e.at }));

  /* domain memory: weak skills, frequent mistakes, preferred explanation style, progress — never accounting data */
  const memory = {
    get: (userId, kind, key) => {
      const r = db.get('SELECT value_json FROM agent_memory WHERE user_id=? AND kind=? AND key=?', userId, kind, key);
      return r ? JSON.parse(r.value_json) : null;
    },
    set: (userId, kind, key, value) => db.run('INSERT INTO agent_memory(user_id,kind,key,value_json,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(user_id,kind,key) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at', userId, kind, key, JSON.stringify(value), now()),
    list: (userId, kind = null) => (kind ? db.all('SELECT kind, key, value_json, updated_at FROM agent_memory WHERE user_id=? AND kind=? ORDER BY updated_at DESC', userId, kind) : db.all('SELECT kind, key, value_json, updated_at FROM agent_memory WHERE user_id=? ORDER BY updated_at DESC', userId)).map((r) => ({ kind: r.kind, key: r.key, value: JSON.parse(r.value_json), at: r.updated_at })),
  };

  return { start, execute, decide, pause, resume, cancel, sweep, view, list, pendingApprovals, events, memory, tools, agents };
}
