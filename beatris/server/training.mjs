// آموزش عامل‌محور حسابداری (spec 0015): the service behind the accounting tutor — scenarios stored per person, their
// sandbox books, attempts, mastery per skill, audit runs, routines and triggers. The accounting itself lives in
// public/js/acct (pure, deterministic) and server/acct/store.mjs (the persisted journal with its invariants); the
// agents in server/agents call only the typed tools built from this service.
import { randomUUID, createHash } from 'node:crypto';
import { createAcctStore } from './acct/store.mjs';
import { buildScenario, publicView, templatesFor, TEMPLATE, FINDING_CHOICES } from '../public/js/acct/scenarios.mjs';
import { evaluateAttempt, hint as hintOf, explainEntry } from '../public/js/acct/evaluate.mjs';
import { SKILLS, SKILL, LEAF_SKILLS, updateMastery, emptyMastery, nextFocus, readiness, DIFFICULTIES } from '../public/js/acct/skills.mjs';
import { runAuditRules, auditScore, RULES } from '../public/js/acct/auditrules.mjs';
import { trialBalance, inventory, ledger, pnl, reconcileInventory } from '../public/js/acct/kernel.mjs';
import { tehranDay } from './tz.mjs';

export const TRAIN_MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS tr_skills (id TEXT PRIMARY KEY, name TEXT NOT NULL, parent TEXT, needs_json TEXT NOT NULL DEFAULT '[]');
  CREATE TABLE IF NOT EXISTS tr_user_skills (
    user_id TEXT NOT NULL, skill_id TEXT NOT NULL REFERENCES tr_skills(id), attempts INTEGER NOT NULL DEFAULT 0, correct INTEGER NOT NULL DEFAULT 0,
    alpha REAL NOT NULL DEFAULT 1, beta REAL NOT NULL DEFAULT 1, mastery REAL NOT NULL DEFAULT 0, confidence REAL NOT NULL DEFAULT 0,
    streak_wrong INTEGER NOT NULL DEFAULT 0, last_practiced_at TEXT, PRIMARY KEY (user_id, skill_id)
  );
  CREATE TABLE IF NOT EXISTS tr_mastery_events (key TEXT PRIMARY KEY, user_id TEXT NOT NULL, skill_id TEXT NOT NULL, score REAL NOT NULL, mastery_before REAL, mastery_after REAL, at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS tr_scenarios (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, scenario_key TEXT NOT NULL, template TEXT NOT NULL, difficulty TEXT NOT NULL,
    skills_json TEXT NOT NULL, public_json TEXT NOT NULL, hidden_json TEXT NOT NULL, book_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','done')), assigned_by TEXT NOT NULL DEFAULT 'user', reason TEXT,
    hints INTEGER NOT NULL DEFAULT 0, revealed INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, done_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_tr_scen_user ON tr_scenarios(user_id, status, created_at);
  CREATE TABLE IF NOT EXISTS tr_attempts (
    id TEXT PRIMARY KEY, scenario_id TEXT NOT NULL REFERENCES tr_scenarios(id), user_id TEXT NOT NULL, idem_key TEXT UNIQUE,
    answer_json TEXT NOT NULL, score REAL NOT NULL, correct INTEGER NOT NULL, criteria_json TEXT NOT NULL, mistakes_json TEXT NOT NULL,
    skills_json TEXT NOT NULL, hints INTEGER NOT NULL DEFAULT 0, posted_json TEXT, created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_tr_att_user ON tr_attempts(user_id, created_at);
  CREATE TABLE IF NOT EXISTS acc_audit_runs (id TEXT PRIMARY KEY, user_id TEXT, subject TEXT NOT NULL, score INTEGER NOT NULL, findings INTEGER NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS acc_audit_findings (
    id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES acc_audit_runs(id), code TEXT NOT NULL, severity TEXT NOT NULL,
    entry_id TEXT, detail TEXT NOT NULL, evidence_json TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS agent_routines (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, agent TEXT NOT NULL, mode TEXT NOT NULL, cadence TEXT NOT NULL CHECK (cadence IN ('daily','weekly')),
    hour INTEGER NOT NULL, weekday INTEGER, scope TEXT NOT NULL CHECK (scope IN ('staff','manager')), enabled INTEGER NOT NULL DEFAULT 1, last_slot TEXT
  );
  CREATE TABLE IF NOT EXISTS agent_triggers (id TEXT PRIMARY KEY, name TEXT NOT NULL, params_json TEXT NOT NULL DEFAULT '{}', enabled INTEGER NOT NULL DEFAULT 1);
  CREATE TABLE IF NOT EXISTS agent_trigger_fires (key TEXT PRIMARY KEY, trigger_id TEXT NOT NULL, user_id TEXT, run_id TEXT, at TEXT NOT NULL);`,
  // spec 0016: one competency model for every domain — skills carry their domain and competency area
  `ALTER TABLE tr_skills ADD COLUMN domain TEXT NOT NULL DEFAULT 'accounting';
  ALTER TABLE tr_skills ADD COLUMN competency TEXT NOT NULL DEFAULT 'accounting';
  UPDATE agent_routines SET agent = CASE agent WHEN 'tutor' THEN 'accounting-tutor' WHEN 'auditor' THEN 'audit' WHEN 'coach' THEN 'curriculum' ELSE agent END;`,
];

/** Routines (from Open Dot's cron routines, as Tehran-time slots on the job queue). weekday: 0 = Sunday … 6 = Saturday. */
export const ROUTINES = [
  { id: 'daily_exercise', name: 'تمرین روزانه حسابداری', agent: 'accounting-tutor', mode: 'next', cadence: 'daily', hour: 9, scope: 'staff' },
  { id: 'daily_closing', name: 'شبیه‌سازی بستن روز', agent: 'accounting-tutor', mode: 'closing', cadence: 'daily', hour: 19, scope: 'staff' },
  { id: 'weekly_review', name: 'مرور هفتگی تسلط', agent: 'accounting-tutor', mode: 'review', cadence: 'weekly', weekday: 6, hour: 10, scope: 'staff' },
  { id: 'weekly_audit', name: 'چالش هفتگی حسابرسی', agent: 'audit', mode: 'challenge', cadence: 'weekly', weekday: 3, hour: 12, scope: 'staff' },
  { id: 'weekly_staff_summary', name: 'خلاصه هفتگی مهارت کارکنان', agent: 'curriculum', mode: 'summary', cadence: 'weekly', weekday: 6, hour: 11, scope: 'manager' },
  { id: 'weak_skill_report', name: 'گزارش مهارت‌های ضعیف', agent: 'curriculum', mode: 'weak', cadence: 'weekly', weekday: 6, hour: 11, scope: 'manager' },
  { id: 'training_recommendation', name: 'پیشنهاد آموزش', agent: 'curriculum', mode: 'recommend', cadence: 'weekly', weekday: 6, hour: 11, scope: 'manager' },
  // studio (spec 0016) — the same scheduler, the same slots
  { id: 'studio_daily_cad', name: 'تمرین روزانه CAD', agent: 'curriculum', mode: 'studio-next', cadence: 'daily', hour: 10, scope: 'staff' },
  { id: 'studio_weekly_design', name: 'چالش هفتگی طراحی', agent: 'curriculum', mode: 'studio-challenge', cadence: 'weekly', weekday: 1, hour: 10, scope: 'staff' },
  { id: 'studio_weekly_review', name: 'مرور هفتگی مهارت CAD', agent: 'training-tutor', mode: 'studio-review', cadence: 'weekly', weekday: 6, hour: 12, scope: 'staff' },
  { id: 'studio_weekly_mfg', name: 'چالش هفتگی ساخت', agent: 'curriculum', mode: 'studio-mfg', cadence: 'weekly', weekday: 3, hour: 13, scope: 'staff' },
  { id: 'studio_unfinished', name: 'یادآوری پروژه ناتمام', agent: 'curriculum', mode: 'studio-unfinished', cadence: 'daily', hour: 18, scope: 'staff' },
];
/** Triggers: a learning signal → an intervention (a remedial exercise from the tutor). */
export const TRIGGERS = [
  { id: 'repeated_mistakes', name: 'سه اشتباه پشت‌سرهم در یک مهارت', params: { n: 3 } },
  { id: 'mastery_drop', name: 'افت تسلط زیر آستانه', params: { below: 0.4, from: 0.5 } },
  { id: 'inactive', name: 'چند روز بدون تمرین', params: { days: 7 } },
  { id: 'closing_wrong', name: 'بستن روز نادرست', params: { below: 0.8 } },
  { id: 'audit_repeated', name: 'یافته حسابرسی تکراری دیده‌نشده', params: { n: 2 } },
  { id: 'studio_geometry_failure', name: 'سه تلاش ناموفق در یک تمرین CAD', params: { n: 3 } },
  { id: 'studio_weight_over', name: 'وزن بیش از هدف در تلاش‌های پیاپی', params: { n: 3 } },
  { id: 'studio_mfg_repeat', name: 'یک خطای ساخت تکراری', params: { n: 2 } },
  { id: 'studio_project_completed', name: 'پروژه استودیو کامل شد', params: {} },
  { id: 'studio_mastery_reached', name: 'رسیدن به آستانه تسلط', params: { at: 0.8 } },
];

const hash = (s) => parseInt(createHash('sha256').update(s).digest('hex').slice(0, 8), 16);

export function createTraining({ db, clock = () => new Date(), phrase = null, extraSkills = [] }) {
  const store = createAcctStore({ db, clock });
  const now = () => clock().toISOString();
  const cur = Number(db.get("SELECT value FROM meta WHERE key='train_schema'")?.value ?? 0);
  for (let i = cur; i < TRAIN_MIGRATIONS.length; i++)
    db.tx(() => {
      db.raw.exec(TRAIN_MIGRATIONS[i]);
      db.run("INSERT INTO meta(key,value) VALUES ('train_schema',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", String(i + 1));
    });
  for (const s of SKILLS) db.run("INSERT INTO tr_skills(id,name,parent,needs_json,domain,competency) VALUES (?,?,?,?,'accounting','accounting') ON CONFLICT(id) DO UPDATE SET name=excluded.name, parent=excluded.parent, needs_json=excluded.needs_json", s.id, s.fa, s.parent, JSON.stringify(s.needs));
  for (const s of extraSkills) db.run('INSERT INTO tr_skills(id,name,parent,needs_json,domain,competency) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, parent=excluded.parent, needs_json=excluded.needs_json, domain=excluded.domain, competency=excluded.competency', s.id, s.fa, s.parent, JSON.stringify(s.needs), s.domain, s.competency ?? s.domain);
  for (const r of ROUTINES) db.run('INSERT OR IGNORE INTO agent_routines(id,name,agent,mode,cadence,hour,weekday,scope) VALUES (?,?,?,?,?,?,?,?)', r.id, r.name, r.agent, r.mode, r.cadence, r.hour, r.weekday ?? null, r.scope);
  for (const t of TRIGGERS) db.run('INSERT OR IGNORE INTO agent_triggers(id,name,params_json) VALUES (?,?,?)', t.id, t.name, JSON.stringify(t.params));

  /* ---------------- mastery ---------------- */
  function masteries(userId) {
    const out = {};
    for (const r of db.all('SELECT * FROM tr_user_skills WHERE user_id=?', userId)) out[r.skill_id] = { skillId: r.skill_id, attempts: r.attempts, correct: r.correct, alpha: r.alpha, beta: r.beta, mastery: r.mastery, confidence: r.confidence, streakWrong: r.streak_wrong, lastPracticedAt: r.last_practiced_at };
    return out;
  }
  /** Apply graded scores to skills, once per key (a retried request or a replayed agent step changes nothing). */
  function applyMastery(userId, scores, key) {
    return db.tx(() => {
      const out = {};
      for (const [skillId, score] of Object.entries(scores)) {
        if (!SKILL[skillId] && !db.get('SELECT 1 FROM tr_skills WHERE id=?', skillId)) continue;
        const k = `${key}:${skillId}`;
        const seen = db.get('SELECT * FROM tr_mastery_events WHERE key=?', k);
        if (seen) {
          out[skillId] = { before: seen.mastery_before, after: seen.mastery_after, replayed: true };
          continue;
        }
        const m0 = masteries(userId)[skillId] ?? emptyMastery(skillId);
        const m1 = updateMastery(m0, score, clock());
        db.run('INSERT INTO tr_user_skills(user_id,skill_id,attempts,correct,alpha,beta,mastery,confidence,streak_wrong,last_practiced_at) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,skill_id) DO UPDATE SET attempts=excluded.attempts, correct=excluded.correct, alpha=excluded.alpha, beta=excluded.beta, mastery=excluded.mastery, confidence=excluded.confidence, streak_wrong=excluded.streak_wrong, last_practiced_at=excluded.last_practiced_at', userId, skillId, m1.attempts, m1.correct, m1.alpha, m1.beta, m1.mastery, m1.confidence, m1.streakWrong, m1.lastPracticedAt);
        db.run('INSERT INTO tr_mastery_events(key,user_id,skill_id,score,mastery_before,mastery_after,at) VALUES (?,?,?,?,?,?,?)', k, userId, skillId, score, m0.mastery, m1.mastery, now());
        out[skillId] = { before: m0.mastery, after: m1.mastery, streakWrong: m1.streakWrong };
      }
      return out;
    });
  }

  /* ---------------- scenarios ---------------- */
  const scenRow = (id) => db.get('SELECT * FROM tr_scenarios WHERE id=?', id);
  /** The hidden part is only ever read on the server. */
  const fullScenario = (row) => ({ ...JSON.parse(row.public_json), hiddenExpectedResult: JSON.parse(row.hidden_json), expectedActions: JSON.parse(row.hidden_json).actions });
  function scenarioOut(row) {
    const p = JSON.parse(row.public_json);
    return { ...p, rowId: row.id, status: row.status, assignedBy: row.assigned_by, reason: row.reason, hints: row.hints, revealed: !!row.revealed, bookId: row.book_id, createdAt: row.created_at };
  }
  /**
   * A new scenario for a person: by template, or for a skill at a difficulty, or (default) where the adaptive policy
   * points. The case is built by the kernel; its opening state is posted into a sandbox book of its own.
   */
  function createScenario(user, { template = null, skillId = null, difficulty = null, assignedBy = 'user', reason = null, key = null } = {}) {
    if (key) {
      const seen = db.get('SELECT id FROM tr_scenarios WHERE user_id=? AND reason=?', user.id, `key:${key}`);
      if (seen) return scenarioOut(scenRow(seen.id));
    }
    let tid = template, level = difficulty;
    let why = reason;
    if (!tid) {
      const focus = skillId ? { skillId, difficulty: difficulty ?? 'beginner', reason: 'chosen' } : nextFocus(masteries(user.id), clock());
      const opts = templatesFor(focus.skillId, difficulty ?? focus.difficulty);
      const n = db.get('SELECT COUNT(*) AS n FROM tr_scenarios WHERE user_id=?', user.id).n;
      const pick = opts[hash(`${user.id}:${n}`) % opts.length];
      tid = pick.id;
      level = DIFFICULTIES[pick.level];
      why ??= `${focus.reason}:${focus.skillId}`;
    }
    if (!TEMPLATE[tid]) throw Object.assign(new Error('سناریو شناخته نیست.'), { status: 400 });
    const lv = DIFFICULTIES.includes(level) ? level : DIFFICULTIES[TEMPLATE[tid].diff[0]];
    const count = db.get('SELECT COUNT(*) AS n FROM tr_scenarios WHERE user_id=?', user.id).n;
    const seed = (hash(`${user.id}:${tid}:${count}`) % 99991) + 1;
    const s = buildScenario(`${tid}:${seed}:${lv}`, { date: tehranDay(clock()) });
    const id = `sc_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    return db.tx(() => {
      const bookId = store.newBook({ ownerId: user.id, kind: 'scenario', scenarioId: id });
      for (const e of s.book.entries) store.postEntry(bookId, { ...e, key: e.key ?? `open-${e.no}-${id.slice(3, 11)}` }, { operatorId: 'system' });
      const hidden = { ...s.hiddenExpectedResult, actions: s.expectedActions };
      db.run('INSERT INTO tr_scenarios(id,user_id,scenario_key,template,difficulty,skills_json,public_json,hidden_json,book_id,assigned_by,reason,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', id, user.id, s.id, s.template, s.difficulty, JSON.stringify(s.skills), JSON.stringify(publicView(s)), JSON.stringify(hidden), bookId, assignedBy, key ? `key:${key}` : why, now());
      return scenarioOut(scenRow(id));
    });
  }
  function ownScenario(user, id) {
    const row = scenRow(id);
    if (!row || row.user_id !== user.id) throw Object.assign(new Error('سناریو پیدا نشد.'), { status: 404 });
    return row;
  }

  /**
   * Grade an attempt. The trainee's own entries are posted into the scenario's sandbox when the kernel accepts them,
   * so the ledger, stock and result they produce can be seen — right or wrong. Idempotent by key.
   */
  function evaluate(user, scenarioId, answer, key) {
    const row = ownScenario(user, scenarioId);
    if (key) {
      const seen = db.get('SELECT * FROM tr_attempts WHERE idem_key=?', key);
      if (seen) return attemptOut(seen, row, true);
    }
    const s = fullScenario(row);
    const ev = evaluateAttempt(s, answer);
    const posted = [];
    if (s.answerKind === 'entry') {
      for (const [i, e] of (answer.entries ?? []).entries()) {
        try {
          posted.push(store.postEntry(row.book_id, { date: s.date, kind: s.hiddenExpectedResult.entries[i]?.kind ?? 'manual', memo: 'پاسخ کارآموز', ...e, key: `${key ?? randomUUID().slice(0, 12)}-${i}`.replace(/[^A-Za-z0-9:_-]/g, '').slice(0, 90).padEnd(6, '0') }, { operatorId: user.id }).id);
        } catch (err) {
          posted.push({ rejected: err.message, errors: err.errors ?? null });
        }
      }
    }
    const id = `at_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    db.tx(() => {
      db.run('INSERT INTO tr_attempts(id,scenario_id,user_id,idem_key,answer_json,score,correct,criteria_json,mistakes_json,skills_json,hints,posted_json,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)', id, row.id, user.id, key, JSON.stringify(answer), ev.score, ev.correct ? 1 : 0, JSON.stringify(ev.criteria), JSON.stringify(ev.mistakes), JSON.stringify(ev.skills), row.hints, JSON.stringify(posted), now());
      const tries = db.get('SELECT COUNT(*) AS n FROM tr_attempts WHERE scenario_id=?', row.id).n;
      if (ev.correct || tries >= 3) db.run("UPDATE tr_scenarios SET status='done', done_at=? WHERE id=?", now(), row.id);
    });
    return attemptOut(db.get('SELECT * FROM tr_attempts WHERE id=?', id), scenRow(row.id), false);
  }
  function attemptOut(a, row, replayed) {
    const tries = db.get('SELECT COUNT(*) AS n FROM tr_attempts WHERE scenario_id=?', row.id).n;
    const solved = row.status === 'done';
    return {
      id: a.id, scenarioId: row.id, score: a.score, correct: !!a.correct, criteria: JSON.parse(a.criteria_json), mistakes: JSON.parse(a.mistakes_json), skills: JSON.parse(a.skills_json),
      posted: JSON.parse(a.posted_json ?? '[]'), tries, done: solved, replayed,
      // the answer is shown once the case is closed (solved, three tries, or asked for)
      answer: solved || row.revealed ? answerOf(row) : null,
    };
  }
  function answerOf(row) {
    const s = fullScenario(row);
    const h = s.hiddenExpectedResult;
    if (s.answerKind === 'decision') return { decision: h.decision };
    if (s.answerKind === 'findings') return { findings: h.findings.map((c) => ({ code: c, fa: RULES[c].fa })) };
    return { entries: h.entries.map((e) => ({ kind: e.kind, memo: e.memo, ref: e.ref ?? null, lines: e.lines })), explanation: h.entries.map((e, i) => explainEntry(e, i === 0 ? h.effects : null).text) };
  }

  function hint(user, scenarioId, level, { reveal = false } = {}) {
    const row = ownScenario(user, scenarioId);
    const lv = Math.max(1, Math.min(reveal ? 4 : 3, Number(level) || 1));
    db.run('UPDATE tr_scenarios SET hints=MAX(hints,?), revealed=MAX(revealed,?) WHERE id=?', lv, lv >= 4 ? 1 : 0, row.id);
    return hintOf(fullScenario(row), lv);
  }

  /** How a stored entry moves the book, in words; an optional model may rephrase it, never change a number. */
  async function explain(user, scenarioId) {
    const row = ownScenario(user, scenarioId);
    const tried = db.get('SELECT COUNT(*) AS n FROM tr_attempts WHERE scenario_id=?', row.id).n;
    if (!tried && !row.revealed) return { text: 'اول خودتان سند را بزنید؛ توضیح کامل پس از اولین تلاش (یا درخواست پاسخ) می‌آید.', locked: true };
    const a = answerOf(row);
    const base = (a.explanation ?? []).join(' ');
    return { text: base, ...(await rephrase(base)), answer: a };
  }
  /** Numbers are facts of the kernel: a rephrased text that adds or changes any number is thrown away. */
  async function rephrase(text) {
    if (!phrase || !text) return { engine: 'books' };
    const r = await phrase('این متن را برای کارآموز حسابداری فروشگاه طلا ساده‌تر و آموزشی بازنویسی کن. هیچ عددی را تغییر نده، عدد تازه نساز، چیزی اضافه نکن.', text).catch(() => null);
    if (!r?.text) return { engine: 'books' };
    const digits = (s) => (s.replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٬,]/g, '').match(/\d+(?:\.\d+)?/g) ?? []);
    const allowed = new Set(digits(text));
    if (digits(r.text).some((d) => !allowed.has(d))) return { engine: 'books', rejected: 'numbers' };
    return { engine: r.engine, plain: r.text };
  }

  /* ---------------- the sandbox book ---------------- */
  function bookView(user, bookId) {
    const b = store.getBook(bookId);
    if (!b || (b.owner_id !== user.id)) throw Object.assign(new Error('دفتر پیدا نشد.'), { status: 404 });
    const book = store.load(bookId);
    return { id: bookId, kind: b.kind, version: book.version, entries: book.entries, trial: trialBalance(book), inventory: inventory(book), stock: store.stock(bookId), ledger: ledger(book), pnl: pnl(book) };
  }

  /* ---------------- audit ---------------- */
  function runAudit(user, { bookId = null, scenarioId = null, cashCounted = null, counts = null }) {
    let journal, subject;
    if (scenarioId) {
      const row = ownScenario(user, scenarioId);
      const s = fullScenario(row);
      journal = s.journal ?? store.load(row.book_id).entries;
      subject = `scenario:${row.id}`;
      if (s.hiddenExpectedResult.ctx) ({ cashCounted = cashCounted, counts = counts } = s.hiddenExpectedResult.ctx);
    } else {
      const b = store.getBook(bookId);
      if (!b || b.owner_id !== user.id) throw Object.assign(new Error('دفتر پیدا نشد.'), { status: 404 });
      journal = store.load(bookId).entries;
      subject = `book:${bookId}`;
    }
    const findings = runAuditRules(journal, { cashCounted, counts: counts ?? {} });
    const id = `ar_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    db.tx(() => {
      db.run('INSERT INTO acc_audit_runs(id,user_id,subject,score,findings,created_at) VALUES (?,?,?,?,?,?)', id, user.id, subject, auditScore(findings), findings.length, now());
      for (const f of findings) db.run('INSERT INTO acc_audit_findings(id,run_id,code,severity,entry_id,detail,evidence_json) VALUES (?,?,?,?,?,?,?)', `af_${randomUUID().replace(/-/g, '').slice(0, 16)}`, id, f.code, f.severity, f.entry, f.detail, JSON.stringify(f.evidence));
    });
    return { id, score: auditScore(findings), findings: db.all('SELECT * FROM acc_audit_findings WHERE run_id=?', id).map(findingOut) };
  }
  const findingOut = (f) => ({ id: f.id, code: f.code, fa: RULES[f.code]?.fa ?? f.code, severity: f.severity, entry: f.entry_id, detail: f.detail, evidence: JSON.parse(f.evidence_json) });
  const WHY = {
    UNBALANCED: 'در هر سند جمع بدهکار باید با جمع بستانکار برابر باشد؛ وگرنه تراز آزمایشی نمی‌بندد و یک طرف رویداد گم شده است.',
    DUPLICATE: 'یک رویداد دو بار ثبت شده؛ مانده‌ها و موجودی دو برابر اثر گرفته‌اند. یکی باید با سند معکوس خنثی شود.',
    SUSPICIOUS_AMOUNT: 'مبلغ از الگوی معمول دفتر بسیار بیشتر است یا نقدِ بزرگ است؛ مدرک و تأیید لازم دارد.',
    WEIGHT_MISMATCH: 'معادل ۷۵۰ = وزن × عیار ÷ ۷۵۰ (سه رقم اعشار). اختلاف یعنی موجودی وزنی دفتر با واقعیت نمی‌خواند.',
    PURITY_MISMATCH: 'عیار ثبت‌شده با عیار ممکن یا ری‌گیری نمی‌خواند؛ طلای خالص کمتر از دفتر است.',
    INVENTORY_MISMATCH: 'شمارش فیزیکی با دفتر برابر نیست؛ تا علت پیدا نشود، مغایرت باید با سند جدا ثبت شود.',
    NEGATIVE_INVENTORY: 'موجودی منفی ممکن نیست؛ یعنی فروش پیش از خرید ثبت شده یا خرید جا افتاده است.',
    ACCOUNT_MAPPING: 'حساب یا طرف بدهکار/بستانکار با نوع رویداد نمی‌خواند (مثلاً مالیات روی ارزش طلا).',
    INCORRECT_SETTLEMENT: 'تسویه بیشتر از بدهی طرف حساب است؛ یا طرف اشتباه است یا پیش‌دریافت باید ثبت شود.',
    MISSING_REFERENCE: 'تسویه و اصلاح بدون شماره رسید یا سند مرجع قابل پیگیری نیست.',
    UNEXPECTED_PNL: 'حرکت سود و زیان غیرعادی است، مثلاً فروش زیر بهای تمام‌شده.',
    CASH_DISCREPANCY: 'صندوق شمرده‌شده با مانده دفتر صندوق برابر نیست؛ کسری هزینه و اضافه درآمد ثبت می‌شود.',
    OPERATOR_BEHAVIOR: 'الگوی سندهای یک اپراتور (معکوس و تخفیف) با بقیه فرق زیادی دارد؛ بررسی کنید.',
  };
  async function explainFinding(user, findingId) {
    const f = db.get('SELECT f.*, r.user_id FROM acc_audit_findings f JOIN acc_audit_runs r ON r.id=f.run_id WHERE f.id=?', findingId);
    if (!f || f.user_id !== user.id) throw Object.assign(new Error('یافته پیدا نشد.'), { status: 404 });
    const text = `${RULES[f.code]?.fa}: ${f.detail} ${WHY[f.code] ?? ''}`.trim();
    return { ...findingOut(f), text, ...(await rephrase(text)) };
  }

  /* ---------------- progress and the manager's view ---------------- */
  function progress(user) {
    const m = masteries(user.id);
    const recent = db.all('SELECT a.score, a.correct, a.mistakes_json, a.created_at, s.template, s.difficulty FROM tr_attempts a JOIN tr_scenarios s ON s.id=a.scenario_id WHERE a.user_id=? ORDER BY a.created_at DESC LIMIT 12', user.id);
    const open = db.all("SELECT * FROM tr_scenarios WHERE user_id=? AND status='open' ORDER BY created_at DESC LIMIT 6", user.id).map(scenarioOut);
    return {
      readiness: readiness(m),
      skills: SKILLS.map((s) => ({ id: s.id, fa: s.fa, parent: s.parent, needs: s.needs, ...(m[s.id] ?? emptyMastery(s.id)) })),
      weak: LEAF_SKILLS.map((id) => m[id]).filter((x) => x && x.attempts && x.mastery < 0.5).sort((a, b) => a.mastery - b.mastery).slice(0, 3).map((x) => ({ id: x.skillId, fa: SKILL[x.skillId].fa, mastery: x.mastery })),
      next: nextFocus(m, clock()),
      recent: recent.map((r) => ({ template: r.template, title: TEMPLATE[r.template]?.title, difficulty: r.difficulty, score: r.score, correct: !!r.correct, mistakes: JSON.parse(r.mistakes_json).length, at: r.created_at })),
      open,
      mistakes: frequentMistakes(user.id),
    };
  }
  function frequentMistakes(userId, limit = 5) {
    const counts = new Map();
    for (const r of db.all('SELECT mistakes_json FROM tr_attempts WHERE user_id=? ORDER BY created_at DESC LIMIT 60', userId))
      for (const x of JSON.parse(r.mistakes_json)) {
        const k = `${x.code}|${x.skill}`;
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
    return [...counts].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([k, n]) => {
      const [code, skill] = k.split('|');
      return { code, skill, skillFa: SKILL[skill]?.fa ?? skill, n };
    });
  }
  /** One row per person: readiness, accounting mastery, weak skills, repeated mistakes, completion, audit, closing. */
  /** One competency model across domains: the mean mastery of the practised skills of each competency. */
  function competencies(userId) {
    const of = new Map(db.all('SELECT id, competency FROM tr_skills').map((r) => [r.id, r.competency]));
    const acc = {};
    for (const x of Object.values(masteries(userId))) {
      const c = of.get(x.skillId);
      if (!c || !x.attempts) continue;
      (acc[c] ??= []).push(x.mastery);
    }
    return Object.fromEntries(Object.entries(acc).map(([c, xs]) => [c, Math.round((xs.reduce((s, v) => s + v, 0) / xs.length) * 1000) / 1000]));
  }
  function team() {
    const people = db.all('SELECT id, name, role, branch FROM users WHERE active=1 ORDER BY name');
    return people.map((p) => {
      const m = masteries(p.id);
      const sc = db.get("SELECT COUNT(*) AS n, SUM(status='done') AS done FROM tr_scenarios WHERE user_id=?", p.id);
      const audit = db.get("SELECT AVG(a.score) AS s FROM tr_attempts a JOIN tr_scenarios s ON s.id=a.scenario_id WHERE a.user_id=? AND s.template='audit_challenge'", p.id).s;
      const closing = db.get("SELECT AVG(a.score) AS s FROM tr_attempts a JOIN tr_scenarios s ON s.id=a.scenario_id WHERE a.user_id=? AND s.template='close_day'", p.id).s;
      const leafs = LEAF_SKILLS.map((id) => m[id]).filter((x) => x?.attempts);
      return {
        id: p.id, name: p.name, role: p.role, branch: p.branch,
        readiness: readiness(m),
        mastery: leafs.length ? Math.round((leafs.reduce((s, x) => s + x.mastery, 0) / leafs.length) * 1000) / 1000 : 0,
        weak: LEAF_SKILLS.filter((id) => m[id]?.attempts && m[id].mastery < 0.5).map((id) => SKILL[id].fa).slice(0, 3),
        repeated: frequentMistakes(p.id, 3),
        completion: sc.n ? Math.round(((sc.done ?? 0) / sc.n) * 100) / 100 : null,
        audit: audit == null ? null : Math.round(audit * 100),
        closing: closing == null ? null : Math.round(closing * 100),
        last: db.get('SELECT MAX(created_at) AS t FROM tr_attempts WHERE user_id=?', p.id).t,
        competencies: competencies(p.id),
      };
    });
  }

  return { store, masteries, competencies, applyMastery, createScenario, evaluate, hint, explain, bookView, runAudit, explainFinding, progress, team, frequentMistakes, scenario: (user, id) => scenarioOut(ownScenario(user, id)), fullScenario: (id) => fullScenario(scenRow(id)), scenarioRow: scenRow, reconcile: (user, bookId, counted) => reconcileInventory(store.load(bookView(user, bookId).id), counted), findingChoices: FINDING_CHOICES };
}
