// داده‌های استودیو (spec 0016): projects with their brief, intent and parameters; every model as an immutable version
// (its CAD program, inspection and findings); studio exercises and attempts. Geometry itself is not stored — the
// deterministic engine rebuilds it from the program, so a version always means the same model.
import { randomUUID } from 'node:crypto';

export const STUDIO_MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS st_projects (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT NOT NULL, brief TEXT NOT NULL DEFAULT '', intent_json TEXT NOT NULL,
    params_json TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','final','deleted')),
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_st_projects_user ON st_projects(user_id, updated_at);
  CREATE TABLE IF NOT EXISTS st_models (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES st_projects(id), version INTEGER NOT NULL, program_json TEXT NOT NULL, params_json TEXT NOT NULL,
    material TEXT NOT NULL, inspection_json TEXT, findings_json TEXT, weight_mg INTEGER, created_at TEXT NOT NULL, UNIQUE (project_id, version)
  );
  CREATE TRIGGER IF NOT EXISTS st_models_frozen BEFORE UPDATE OF program_json, params_json, version ON st_models BEGIN SELECT RAISE(ABORT, 'E_IMMUTABLE: a model version never changes'); END;
  CREATE TABLE IF NOT EXISTS st_exports (id TEXT PRIMARY KEY, model_id TEXT NOT NULL, format TEXT NOT NULL, production INTEGER NOT NULL, bytes INTEGER NOT NULL, by_user TEXT, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS st_exercises (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, exercise_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','done')),
    assigned_by TEXT NOT NULL DEFAULT 'user', reason TEXT, params_json TEXT NOT NULL, hints INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, done_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_st_ex_user ON st_exercises(user_id, status);
  CREATE TABLE IF NOT EXISTS st_attempts (
    id TEXT PRIMARY KEY, exercise_row TEXT NOT NULL REFERENCES st_exercises(id), user_id TEXT NOT NULL, idem_key TEXT UNIQUE, params_json TEXT NOT NULL,
    assessment_json TEXT NOT NULL, score REAL NOT NULL, passed INTEGER NOT NULL, weight_mg INTEGER, created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_st_att_user ON st_attempts(user_id, created_at);`,
];

export function createStudioStore({ db, clock = () => new Date() }) {
  const cur = Number(db.get("SELECT value FROM meta WHERE key='studio_schema'")?.value ?? 0);
  for (let i = cur; i < STUDIO_MIGRATIONS.length; i++)
    db.tx(() => {
      db.raw.exec(STUDIO_MIGRATIONS[i]);
      db.run("INSERT INTO meta(key,value) VALUES ('studio_schema',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", String(i + 1));
    });
  const now = () => clock().toISOString();
  const id = (p) => `${p}_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const projectOut = (r) => r && { id: r.id, userId: r.user_id, title: r.title, brief: r.brief, intent: JSON.parse(r.intent_json), params: JSON.parse(r.params_json), version: r.version, status: r.status, createdAt: r.created_at, updatedAt: r.updated_at };
  const modelOut = (r) => r && { id: r.id, projectId: r.project_id, version: r.version, program: JSON.parse(r.program_json), params: JSON.parse(r.params_json), material: r.material, inspection: r.inspection_json ? JSON.parse(r.inspection_json) : null, findings: r.findings_json ? JSON.parse(r.findings_json) : null, weightG: r.weight_mg == null ? null : r.weight_mg / 1000, createdAt: r.created_at };
  return {
    createProject(userId, { title, brief = '', intent, params }) {
      const pid = id('pj');
      db.run('INSERT INTO st_projects(id,user_id,title,brief,intent_json,params_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)', pid, userId, String(title).slice(0, 120), String(brief).slice(0, 2000), JSON.stringify(intent), JSON.stringify(params), now(), now());
      return projectOut(db.get('SELECT * FROM st_projects WHERE id=?', pid));
    },
    project: (pid) => projectOut(db.get("SELECT * FROM st_projects WHERE id=? AND status<>'deleted'", pid)),
    projects: (userId) => db.all("SELECT * FROM st_projects WHERE user_id=? AND status<>'deleted' ORDER BY updated_at DESC LIMIT 30", userId).map(projectOut),
    /** A new model version (never an overwrite): returns the model row. */
    addModel(pid, { program, params, material }) {
      return db.tx(() => {
        const v = (db.get('SELECT MAX(version) AS v FROM st_models WHERE project_id=?', pid).v ?? 0) + 1;
        const mid = id('md');
        db.run('INSERT INTO st_models(id,project_id,version,program_json,params_json,material,created_at) VALUES (?,?,?,?,?,?,?)', mid, pid, v, JSON.stringify(program), JSON.stringify(params), material, now());
        db.run('UPDATE st_projects SET version=?, params_json=?, updated_at=? WHERE id=?', v, JSON.stringify(params), now(), pid);
        return modelOut(db.get('SELECT * FROM st_models WHERE id=?', mid));
      });
    },
    setInspection(mid, inspection, findings) {
      db.run('UPDATE st_models SET inspection_json=?, findings_json=?, weight_mg=? WHERE id=?', JSON.stringify(inspection), JSON.stringify(findings ?? null), Math.round(inspection.weight.value * 1000), mid);
    },
    model: (mid) => modelOut(db.get('SELECT * FROM st_models WHERE id=?', mid)),
    latestModel: (pid) => modelOut(db.get('SELECT * FROM st_models WHERE project_id=? ORDER BY version DESC LIMIT 1', pid)),
    models: (pid) => db.all('SELECT * FROM st_models WHERE project_id=? ORDER BY version', pid).map(modelOut),
    finalize: (pid) => db.run("UPDATE st_projects SET status='final', updated_at=? WHERE id=?", now(), pid),
    softDelete: (pid) => db.run("UPDATE st_projects SET status='deleted', updated_at=? WHERE id=?", now(), pid),
    recordExport: (mid, format, production, bytes, by) => db.run('INSERT INTO st_exports(id,model_id,format,production,bytes,by_user,created_at) VALUES (?,?,?,?,?,?,?)', id('ex'), mid, format, production ? 1 : 0, bytes, by, now()),
    /* exercises */
    addExercise(userId, exerciseId, startParams, { assignedBy = 'user', reason = null } = {}) {
      const eid = id('se');
      db.run('INSERT INTO st_exercises(id,user_id,exercise_id,assigned_by,reason,params_json,created_at) VALUES (?,?,?,?,?,?,?)', eid, userId, exerciseId, assignedBy, reason, JSON.stringify(startParams), now());
      return this.exercise(eid);
    },
    exercise: (eid) => {
      const r = db.get('SELECT * FROM st_exercises WHERE id=?', eid);
      return r && { id: r.id, userId: r.user_id, exerciseId: r.exercise_id, status: r.status, assignedBy: r.assigned_by, reason: r.reason, params: JSON.parse(r.params_json), hints: r.hints, createdAt: r.created_at, attempts: db.get('SELECT COUNT(*) AS n FROM st_attempts WHERE exercise_row=?', eid).n };
    },
    openExercises: (userId) => db.all("SELECT id FROM st_exercises WHERE user_id=? AND status='open' ORDER BY created_at DESC LIMIT 10", userId).map((r) => r.id),
    addAttempt(eid, userId, { key, params, assessment, weightG }) {
      const aid = id('sa');
      db.tx(() => {
        db.run('INSERT INTO st_attempts(id,exercise_row,user_id,idem_key,params_json,assessment_json,score,passed,weight_mg,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)', aid, eid, userId, key, JSON.stringify(params), JSON.stringify(assessment), assessment.score, assessment.passed ? 1 : 0, Math.round(weightG * 1000), now());
        db.run('UPDATE st_exercises SET params_json=? WHERE id=?', JSON.stringify(params), eid);
        if (assessment.passed) db.run("UPDATE st_exercises SET status='done', done_at=? WHERE id=?", now(), eid);
      });
      return aid;
    },
    attemptByKey: (key) => {
      const r = db.get('SELECT * FROM st_attempts WHERE idem_key=?', key);
      return r && { id: r.id, exerciseRow: r.exercise_row, assessment: JSON.parse(r.assessment_json), score: r.score, passed: !!r.passed };
    },
    attempts: (eid) => db.all('SELECT * FROM st_attempts WHERE exercise_row=? ORDER BY created_at', eid).map((r) => ({ id: r.id, score: r.score, passed: !!r.passed, weightG: r.weight_mg / 1000, assessment: JSON.parse(r.assessment_json), createdAt: r.created_at })),
    userAttempts: (userId, limit = 30) => db.all('SELECT a.*, e.exercise_id FROM st_attempts a JOIN st_exercises e ON e.id=a.exercise_row WHERE a.user_id=? ORDER BY a.created_at DESC LIMIT ?', userId, limit).map((r) => ({ id: r.id, exerciseId: r.exercise_id, exerciseRow: r.exercise_row, score: r.score, passed: !!r.passed, weightG: r.weight_mg / 1000, findings: JSON.parse(r.assessment_json).findings.map((f) => f.code), createdAt: r.created_at })),
    hint: (eid) => db.run('UPDATE st_exercises SET hints=hints+1 WHERE id=?', eid),
  };
}
