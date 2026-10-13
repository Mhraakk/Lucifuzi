// پلتفرم مشترک عامل‌ها — اجرا (spec 0015, generalised in 0016). Open Dot's ideas (a run per agent, tools that pause
// for approval, agent-to-agent consultation, routines, triggers) rebuilt as Beatris's own infrastructure, shared by
// every domain (accounting, studio/CAD, training). Agents orchestrate; domain engines compute.
//
// An agent is a registered definition with a deterministic plan: an async function that calls typed tools through
// ctx.tool() and other agents through ctx.delegate(). Every call is a stored step, so a run is durable by replay:
// after a pause (approval, a delegated run that waits, a restart, «paused»), the plan runs again from the top and
// each step already done returns its stored result instead of running twice.
//
// Run states: queued → running → (waiting_for_tool | waiting_for_approval | paused) → running →
//             completed | failed | cancelled.
import { randomUUID } from 'node:crypto';
import { parse, check } from '../../public/js/schema.mjs';

export const AGENT_SCHEMA = `
CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY, agent TEXT NOT NULL, user_id TEXT, idem_key TEXT UNIQUE, origin TEXT NOT NULL DEFAULT 'user',
  status TEXT NOT NULL CHECK (status IN ('queued','running','waiting_for_tool','waiting_for_approval','paused','completed','failed','cancelled')),
  input_json TEXT NOT NULL DEFAULT '{}', output_json TEXT, error TEXT, steps INTEGER NOT NULL DEFAULT 0,
  parent_run_id TEXT, root_run_id TEXT, depth INTEGER NOT NULL DEFAULT 0, stage TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_runs_user ON agent_runs(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_agent_runs_parent ON agent_runs(parent_run_id);
CREATE TABLE IF NOT EXISTS agent_steps (
  id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES agent_runs(id), n INTEGER NOT NULL, tool TEXT NOT NULL,
  args_json TEXT NOT NULL, result_json TEXT, status TEXT NOT NULL CHECK (status IN ('done','waiting','denied','error')),
  error TEXT, attempts INTEGER NOT NULL DEFAULT 1, duration_ms INTEGER, child_run_id TEXT, created_at TEXT NOT NULL, UNIQUE (run_id, n)
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
export const RUN_STATES = ['queued', 'running', 'waiting_for_tool', 'waiting_for_approval', 'paused', 'completed', 'failed', 'cancelled'];
const FINAL = new Set(['completed', 'failed', 'cancelled']);
const WAITING = new Set(['waiting_for_tool', 'waiting_for_approval', 'paused']);
export const MAX_DELEGATION_DEPTH = 3;
export const MAX_STEPS = 80;

/** Memory kinds and the scope each belongs to; an agent reads and writes only the scopes it declares. */
export const MEMORY_SCOPE = {
  weak_skill: 'training', mistake: 'training', style: 'training', completed: 'training', progress: 'training', finding: 'training',
  report: 'manager',
  pref_style: 'preference', pref_material: 'preference',
  tech_mistake: 'technical', tech_weak_op: 'technical', tech_overweight: 'technical', tech_setting_error: 'technical', tech_project: 'technical',
};

/** Upgrade databases made by spec 0015 (state names, delegation columns) — SQLite cannot alter a CHECK in place. */
function migrate(db) {
  const sql = db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='agent_runs'")?.sql ?? '';
  if (sql && !sql.includes('waiting_for_approval')) {
    db.tx(() => {
      db.raw.exec('ALTER TABLE agent_runs RENAME TO agent_runs_v1');
      db.raw.exec(AGENT_SCHEMA.split('CREATE INDEX IF NOT EXISTS idx_agent_runs_user')[0]);
      db.raw.exec(`INSERT INTO agent_runs(id,agent,user_id,idem_key,origin,status,input_json,output_json,error,steps,depth,created_at,updated_at)
        SELECT id, CASE agent WHEN 'tutor' THEN 'accounting-tutor' WHEN 'auditor' THEN 'audit' WHEN 'coach' THEN 'curriculum' ELSE agent END, user_id, idem_key, origin,
        CASE status WHEN 'waiting_approval' THEN 'waiting_for_approval' ELSE status END, input_json, output_json, error, steps, 0, created_at, updated_at FROM agent_runs_v1`);
      db.raw.exec('DROP TABLE agent_runs_v1');
    });
  }
  const stepCols = db.all('PRAGMA table_info(agent_steps)').map((c) => c.name);
  for (const [c, def] of [['attempts', 'INTEGER NOT NULL DEFAULT 1'], ['duration_ms', 'INTEGER'], ['child_run_id', 'TEXT']]) if (stepCols.length && !stepCols.includes(c)) db.raw.exec(`ALTER TABLE agent_steps ADD COLUMN ${c} ${def}`);
  db.raw.exec(AGENT_SCHEMA);
}

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
 * tools: { name: { input, output?, label, cap?, approver?, approval?: (args, ctx) => summary|null, retry?: { max, on(err) }, run } }
 * registry: { get(id) → definition, has(id) } (see registry.mjs). can(user, cap) decides permissions; users(id) loads a user.
 * onEvent({ runId, type, data, agent, user }) — for metrics and the bus (never secrets: only names, ids, codes, durations).
 */
export function createRuntime({ db, tools, registry, can, users, clock = () => new Date(), onEvent = () => {} }) {
  migrate(db);
  // after a restart nothing is running: a run left «running» continues on the next resume or sweep
  db.run("UPDATE agent_runs SET status='queued' WHERE status='running'");
  const now = () => clock().toISOString();
  const getRun = (id) => db.get('SELECT * FROM agent_runs WHERE id=?', id);
  const event = (runId, type, data = {}) => {
    db.run('INSERT INTO agent_events(run_id,type,data_json,at) VALUES (?,?,?,?)', runId, type, JSON.stringify(data), now());
    const r = getRun(runId);
    onEvent({ runId, type, data, agent: r?.agent, user: r?.user_id, depth: r?.depth ?? 0 });
  };
  const setStatus = (id, status, extra = {}) => {
    db.run('UPDATE agent_runs SET status=?, output_json=COALESCE(?, output_json), error=?, updated_at=? WHERE id=?', status, extra.output === undefined ? null : JSON.stringify(extra.output), extra.error ?? null, now(), id);
    const name = { running: 'agent.run.running', completed: 'agent.run.completed', failed: 'agent.run.failed', cancelled: 'agent.run.cancelled', paused: 'agent.run.paused', waiting_for_approval: 'agent.run.waiting_for_approval', waiting_for_tool: 'agent.run.waiting_for_tool', queued: 'agent.run.queued' }[status];
    event(id, name, extra.error ? { error: extra.error } : {});
  };
  const memory = memoryStore(db, now);

  /** Start (or, with the same key, return) a run. Runs it at once; returns the run view. */
  async function start(agentId, { user, input = {}, key = null, origin = 'user', parent = null }) {
    const agent = registry.get(agentId);
    if (!agent) throw new AgentError('E_AGENT', 'عامل شناخته نیست.', 404);
    if (key) {
      const seen = db.get('SELECT id FROM agent_runs WHERE idem_key=?', key);
      if (seen) return view(seen.id);
    }
    if (agent.input) {
      const errs = check(agent.input, input, 'ورودی عامل');
      if (errs.length) throw new AgentError('E_SCHEMA', errs.join(' '));
    }
    const id = `run_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    db.run('INSERT INTO agent_runs(id,agent,user_id,idem_key,origin,status,input_json,parent_run_id,root_run_id,depth,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', id, agentId, user?.id ?? null, key, origin, 'queued', JSON.stringify(input), parent?.id ?? null, parent?.root_run_id ?? parent?.id ?? id, parent ? parent.depth + 1 : 0, now(), now());
    event(id, 'agent.run.started', { agent: agentId, origin, parent: parent?.id ?? null });
    await execute(id);
    return view(id);
  }

  const running = new Set();
  /** Run (or re-run by replay) a run's plan until it completes, pauses or waits. */
  async function execute(id) {
    if (running.has(id)) return;
    const run = getRun(id);
    if (!run || FINAL.has(run.status) || WAITING.has(run.status)) return;
    const agent = registry.get(run.agent);
    const user = run.user_id ? users(run.user_id) : null;
    running.add(id);
    setStatus(id, 'running');
    let n = 0;
    const replayable = (step, name) => {
      const done = db.get('SELECT * FROM agent_steps WHERE run_id=? AND n=?', id, step);
      if (done && done.tool !== name) throw new AgentError('E_REPLAY', `اجرای دوباره با گام ثبت‌شده نمی‌خواند (${done.tool} ≠ ${name}).`);
      return done;
    };
    const guard = () => {
      const cur = getRun(id);
      if (cur.status === 'cancelled') throw new Halt('cancelled');
      if (cur.status === 'paused') throw new Halt('paused');
      if (n >= MAX_STEPS) throw new AgentError('E_STEPS', `اجرا بیش از ${MAX_STEPS} گام شد و متوقف شد.`);
    };
    const record = (step, name, args, fields) => db.run(
      `INSERT INTO agent_steps(id,run_id,n,tool,args_json,result_json,status,error,attempts,duration_ms,child_run_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(run_id,n) DO UPDATE SET result_json=excluded.result_json, status=excluded.status, error=excluded.error, attempts=excluded.attempts, duration_ms=excluded.duration_ms, child_run_id=COALESCE(excluded.child_run_id, child_run_id)`,
      randomUUID(), id, step, name, JSON.stringify(args ?? {}), fields.result === undefined ? null : JSON.stringify(fields.result), fields.status, fields.error ?? null, fields.attempts ?? 1, fields.ms ?? null, fields.child ?? null, now(),
    );
    const ctx = {
      runId: id,
      user,
      agent,
      input: JSON.parse(run.input_json),
      origin: run.origin,
      depth: run.depth,
      /** Domain memory, limited to the agent's declared scopes. */
      memory: {
        get: (userId, kind, key) => (allowed(agent, kind), memory.get(userId, kind, key)),
        set: (userId, kind, key, value) => (allowed(agent, kind), memory.set(userId, kind, key, value)),
        list: (userId, kind = null) => memory.list(userId, kind).filter((m) => agent.memoryScopes.includes(MEMORY_SCOPE[m.kind] ?? '?')),
      },
      /** A domain event (e.g. studio.geometry.created), persisted on this run and passed to the bus. */
      emit(type, data = {}) {
        if (!/^[a-z]+(\.[a-z_]+)+$/.test(type)) throw new AgentError('E_EVENT', `نام رویداد نامعتبر: ${type}`);
        // once per step position, so a replayed plan does not announce the same thing twice
        if (!db.get('SELECT 1 FROM agent_events WHERE run_id=? AND type=? AND data_json LIKE ?', id, type, `%"n":${n}}`)) event(id, type, { ...data, n });
      },
      /** Name the stage the run is in, for people watching it (e.g. «اندازه‌گیری هندسه»). */
      stage(text) {
        db.run('UPDATE agent_runs SET stage=? WHERE id=?', String(text).slice(0, 120), id);
      },
      /** Call a tool: replayed if done, paused for approval if sensitive, refused if not allowed, retried if allowed. */
      async tool(name, args = {}) {
        guard();
        const step = n++;
        const done = replayable(step, name);
        if (done?.status === 'done') return JSON.parse(done.result_json);
        if (done?.status === 'denied') return { denied: true, reason: done.error };
        if (done?.status === 'error') throw new AgentError('E_TOOL', done.error);
        const t = tools[name];
        if (!t || !agent.allowedTools.includes(name)) throw new AgentError('E_TOOL', `ابزار «${name}» برای عامل «${agent.id}» مجاز نیست.`, 403);
        const a = parse(t.input, args);
        if (t.cap && !can(user, t.cap)) throw new AgentError('E_FORBIDDEN', `اجازه «${t.label}» را ندارید.`, 403);
        const summary = t.approval?.(a, ctx) ?? (agent.approvalPolicy.includes(name) ? `${t.label}: ${JSON.stringify(a).slice(0, 160)}` : null);
        if (summary) {
          const ap = db.get('SELECT * FROM agent_approvals WHERE run_id=? AND step_n=?', id, step);
          if (!ap) {
            db.run('INSERT INTO agent_approvals(id,run_id,step_n,tool,args_json,summary,requested_by,status,created_at) VALUES (?,?,?,?,?,?,?,?,?)', `apr_${randomUUID().replace(/-/g, '').slice(0, 16)}`, id, step, name, JSON.stringify(a), summary, user?.id ?? null, 'pending', now());
            record(step, name, a, { status: 'waiting' });
            event(id, 'agent.approval.requested', { tool: name, summary });
            throw new Halt('waiting_for_approval');
          }
          if (ap.status === 'pending') throw new Halt('waiting_for_approval');
          if (ap.status !== 'approved') {
            record(step, name, a, { status: 'denied', error: ap.note ?? 'رد شد' });
            return { denied: true, reason: ap.note ?? 'رد شد' };
          }
        }
        event(id, 'agent.step.started', { n: step, kind: 'tool' });
        event(id, 'agent.tool.started', { n: step, tool: name });
        const max = Math.max(1, Math.min(5, t.retry?.max ?? 1));
        let attempt = 0;
        const t0 = Date.now();
        for (;;) {
          attempt++;
          try {
            const result = await t.run(a, ctx);
            if (t.output) {
              const errs = check(t.output, result, `خروجی ${name}`);
              if (errs.length) throw new AgentError('E_OUTPUT', errs.slice(0, 4).join(' '));
            }
            record(step, name, a, { status: 'done', result: result ?? null, attempts: attempt, ms: Date.now() - t0 });
            db.run('UPDATE agent_runs SET steps=? WHERE id=?', step + 1, id);
            event(id, 'agent.tool.completed', { n: step, tool: name, attempts: attempt, ms: Date.now() - t0 });
            return result;
          } catch (e) {
            if (attempt < max && t.retry?.on?.(e)) {
              event(id, 'agent.tool.retry', { n: step, tool: name, attempt });
              continue;
            }
            record(step, name, a, { status: 'error', error: String(e.message).slice(0, 500), attempts: attempt, ms: Date.now() - t0 });
            event(id, 'agent.tool.failed', { n: step, tool: name, attempts: attempt, code: e.code ?? null });
            throw e;
          }
        }
      },
      /**
       * Ask another agent: typed, observable (a child run), bounded (depth, no cycles), permission-checked (the
       * caller's canDelegateTo and the child's own tools and the same user's permissions).
       */
      async delegate(agentId, input = {}) {
        guard();
        const step = n++;
        const name = `delegate:${agentId}`;
        const done = replayable(step, name);
        if (done?.status === 'done') return JSON.parse(done.result_json);
        if (done?.status === 'error') throw new AgentError('E_DELEGATION', done.error);
        if (!agent.canDelegateTo.includes(agentId)) throw new AgentError('E_DELEGATION', `عامل «${agent.id}» اجازه واگذاری به «${agentId}» ندارد.`, 403);
        if (run.depth + 1 > MAX_DELEGATION_DEPTH) throw new AgentError('E_DEPTH', `عمق واگذاری از ${MAX_DELEGATION_DEPTH} گذشت.`);
        const chain = ancestors(id).map((r) => r.agent);
        if (chain.includes(agentId)) throw new AgentError('E_CYCLE', `واگذاری چرخه می‌سازد (${[...chain].reverse().join(' ← ')} ← ${agentId}).`);
        let childId = done?.child_run_id;
        if (!childId) {
          event(id, 'agent.step.started', { n: step, kind: 'delegation' });
          event(id, 'agent.delegation.started', { n: step, to: agentId });
          const parentRow = getRun(id);
          const child = await start(agentId, { user, input, origin: 'delegation', parent: parentRow, key: `deleg:${id}:${step}` });
          childId = child.id;
          record(step, name, input, { status: 'waiting', child: childId });
        } else await execute(childId);
        const child = getRun(childId);
        if (child.status === 'completed') {
          const out = JSON.parse(child.output_json ?? 'null');
          record(step, name, input, { status: 'done', result: out, child: childId });
          event(id, 'agent.delegation.completed', { n: step, to: agentId, child: childId });
          return out;
        }
        if (child.status === 'failed' || child.status === 'cancelled') {
          record(step, name, input, { status: 'error', error: `${agentId}: ${child.error ?? child.status}`, child: childId });
          throw new AgentError('E_DELEGATION', `${agentId}: ${child.error ?? child.status}`);
        }
        throw new Halt('waiting_for_tool');
      },
    };
    try {
      const output = await agent.plan(ctx);
      if (agent.output) {
        const errs = check(agent.output, output, `خروجی ${agent.id}`);
        if (errs.length) throw new AgentError('E_OUTPUT', errs.slice(0, 4).join(' '));
      }
      setStatus(id, 'completed', { output: output ?? null });
    } catch (e) {
      if (e instanceof Halt) {
        if (e.status !== 'cancelled' && getRun(id).status === 'running') setStatus(id, e.status);
      } else setStatus(id, 'failed', { error: String(e.message ?? e).slice(0, 500) });
    } finally {
      running.delete(id);
    }
    // a finished child wakes the parent that waits on it
    const after = getRun(id);
    if (after.parent_run_id && FINAL.has(after.status)) {
      const p = getRun(after.parent_run_id);
      if (p?.status === 'waiting_for_tool') {
        db.run("UPDATE agent_runs SET status='queued' WHERE id=?", p.id);
        await execute(p.id);
      }
    }
  }
  const ancestors = (id) => {
    const out = [];
    let r = getRun(id);
    while (r) {
      out.push(r);
      r = r.parent_run_id ? getRun(r.parent_run_id) : null;
    }
    return out;
  };
  const allowed = (agent, kind) => {
    if (!agent.memoryScopes.includes(MEMORY_SCOPE[kind] ?? '?')) throw new AgentError('E_MEMORY', `عامل «${agent.id}» به حافظه «${kind}» دسترسی ندارد.`, 403);
  };

  /** Approve or deny. The decider needs the tool's approver capability and must not be the requester. */
  async function decide(approvalId, user, decision, note = null) {
    const ap = db.get('SELECT * FROM agent_approvals WHERE id=?', approvalId);
    if (!ap) throw new AgentError('E_APPROVAL', 'درخواست تأیید پیدا نشد.', 404);
    if (ap.status !== 'pending') throw new AgentError('E_APPROVAL', 'این درخواست قبلاً بررسی شده است.', 409);
    if (!can(user, tools[ap.tool]?.approver ?? 'books.admin')) throw new AgentError('E_FORBIDDEN', 'تأیید این کار با مدیر است.', 403);
    if (ap.requested_by && ap.requested_by === user.id) throw new AgentError('E_FOUR_EYES', 'درخواست خودتان را نمی‌توانید تأیید کنید (کنترل چهار چشم).', 403);
    if (!['approved', 'denied'].includes(decision)) throw new AgentError('E_INPUT', 'تصمیم باید تأیید یا رد باشد.');
    db.run('UPDATE agent_approvals SET status=?, decided_by=?, decided_at=?, note=? WHERE id=? AND status=?', decision, user.id, now(), note, approvalId, 'pending');
    event(ap.run_id, 'agent.approval.resolved', { decision, tool: ap.tool });
    db.run("DELETE FROM agent_steps WHERE run_id=? AND n=? AND status='waiting'", ap.run_id, ap.step_n);
    if (getRun(ap.run_id).status === 'waiting_for_approval') db.run("UPDATE agent_runs SET status='queued' WHERE id=?", ap.run_id);
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
    event(id, 'agent.run.resumed');
    await execute(id);
    return view(id);
  }
  function cancel(id, user) {
    const r = own(id, user);
    if (FINAL.has(r.status)) return view(id);
    db.run("UPDATE agent_approvals SET status='expired' WHERE run_id=? AND status='pending'", id);
    setStatus(id, 'cancelled');
    for (const c of db.all('SELECT id FROM agent_runs WHERE parent_run_id=?', id)) if (!FINAL.has(getRun(c.id).status)) cancel(c.id, user);
    return view(id);
  }
  function own(id, user) {
    const r = getRun(id);
    if (!r) throw new AgentError('E_RUN', 'اجرا پیدا نشد.', 404);
    if (r.user_id !== user?.id && !can(user, 'books.admin')) throw new AgentError('E_FORBIDDEN', 'این اجرا مال شما نیست.', 403);
    return r;
  }
  async function sweep() {
    for (const r of db.all("SELECT id FROM agent_runs WHERE status='queued' ORDER BY depth DESC, created_at LIMIT 20")) await execute(r.id);
  }

  function view(id) {
    const r = getRun(id);
    if (!r) return null;
    const def = registry.get(r.agent);
    return {
      id: r.id, agent: r.agent, agentName: def?.name ?? r.agent, domain: def?.domain ?? null, status: r.status, stage: r.stage, origin: r.origin, userId: r.user_id,
      parentRunId: r.parent_run_id, rootRunId: r.root_run_id, depth: r.depth,
      input: JSON.parse(r.input_json), output: r.output_json ? JSON.parse(r.output_json) : null, error: r.error, createdAt: r.created_at, updatedAt: r.updated_at,
      steps: db.all('SELECT n, tool, status, error, attempts, duration_ms, child_run_id FROM agent_steps WHERE run_id=? ORDER BY n', id).map((s) => ({ n: s.n, tool: s.tool, label: tools[s.tool]?.label ?? (s.tool.startsWith('delegate:') ? `واگذاری به ${registry.get(s.tool.slice(9))?.fa ?? s.tool.slice(9)}` : s.tool), status: s.status, error: s.error, attempts: s.attempts, ms: s.duration_ms, child: s.child_run_id })),
      approvals: db.all('SELECT id, step_n, tool, summary, status, requested_by, decided_by, decided_at, note FROM agent_approvals WHERE run_id=? ORDER BY step_n', id),
      chain: ancestors(id).map((x) => x.agent).reverse(),
    };
  }
  const list = ({ userId = null, limit = 30, root = false } = {}) => db.all(`SELECT id FROM agent_runs WHERE (? IS NULL OR user_id=?) ${root ? 'AND parent_run_id IS NULL' : ''} ORDER BY created_at DESC LIMIT ?`, userId, userId, limit).map((r) => view(r.id));
  const pendingApprovals = () => db.all("SELECT a.*, r.agent FROM agent_approvals a JOIN agent_runs r ON r.id=a.run_id WHERE a.status='pending' ORDER BY a.created_at").map((a) => ({ id: a.id, runId: a.run_id, agent: a.agent, tool: a.tool, label: tools[a.tool]?.label ?? a.tool, summary: a.summary, requestedBy: a.requested_by, createdAt: a.created_at, args: JSON.parse(a.args_json) }));
  const events = (id) => db.all('SELECT type, data_json, at FROM agent_events WHERE run_id=? ORDER BY id', id).map((e) => ({ type: e.type, data: JSON.parse(e.data_json), at: e.at }));
  /** Observability: per agent and tool — runs, failures, retries, mean duration (no arguments, no secrets). */
  function stats() {
    return {
      runs: db.all('SELECT agent, status, COUNT(*) AS n FROM agent_runs GROUP BY agent, status ORDER BY agent'),
      tools: db.all("SELECT tool, COUNT(*) AS calls, SUM(status='error') AS failed, SUM(attempts-1) AS retries, ROUND(AVG(duration_ms)) AS ms FROM agent_steps GROUP BY tool ORDER BY calls DESC"),
      pendingApprovals: db.get("SELECT COUNT(*) AS n FROM agent_approvals WHERE status='pending'").n,
      delegations: db.get('SELECT COUNT(*) AS n FROM agent_runs WHERE parent_run_id IS NOT NULL').n,
    };
  }
  return { start, execute, decide, pause, resume, cancel, sweep, view, list, pendingApprovals, events, stats, memory, tools, registry };
}

function memoryStore(db, now) {
  return {
    get: (userId, kind, key) => {
      const r = db.get('SELECT value_json FROM agent_memory WHERE user_id=? AND kind=? AND key=?', userId, kind, key);
      return r ? JSON.parse(r.value_json) : null;
    },
    set: (userId, kind, key, value) => db.run('INSERT INTO agent_memory(user_id,kind,key,value_json,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(user_id,kind,key) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at', userId, kind, key, JSON.stringify(value), now()),
    list: (userId, kind = null) => (kind ? db.all('SELECT kind, key, value_json, updated_at FROM agent_memory WHERE user_id=? AND kind=? ORDER BY updated_at DESC', userId, kind) : db.all('SELECT kind, key, value_json, updated_at FROM agent_memory WHERE user_id=? ORDER BY updated_at DESC', userId)).map((r) => ({ kind: r.kind, key: r.key, value: JSON.parse(r.value_json), at: r.updated_at })),
  };
}
