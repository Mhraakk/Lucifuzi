import { randomUUID, randomBytes } from 'node:crypto';
import * as C from '../content/index.mjs';
import { checkNumeric, DRILL_KINDS } from '../public/js/calc.mjs';
import { ROLES, STAFF_ROLES, ADMIN_ROLES, hashPin, verifyPin, validPin, normalizePhone, validPhone, makeLimiter } from './auth.mjs';

const now = () => new Date().toISOString();
const tehranDay = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(d);
const DAY = 86400000;
const CARD_INTERVAL_DAYS = [0, 0, 1, 2, 4, 8, 16, 32]; // index = box (1..7)
const NEW_CARDS_PER_DAY = 12;

export const DEFAULT_PRICING = { p750: 8500000, profitPct: 7, vatPct: 10, buybackDeductPct: 0, passPct: 70, priceNote: 'قیمت نمونه؛ مدیر قیمت روز را وارد کند.' };

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const bad = (m) => new HttpError(400, m);
const notFound = (m = 'پیدا نشد.') => new HttpError(404, m);

function shuffle(a) {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = randomBytes(4).readUInt32LE() % (i + 1);
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}
const certCode = () => `BTR-${randomBytes(3).toString('hex').toUpperCase()}-${randomBytes(3).toString('hex').toUpperCase()}`;

function grade(q, answer) {
  if (q.o) return Number(answer) === q.a;
  return checkNumeric(answer, q.n, q.tol);
}
const reveal = (q) => (q.o ? { answer: q.a, answerText: q.o[q.a] } : { answer: q.n, unit: q.unit });

export function createApi({ db, signer, demo }) {
  const loginByPhone = makeLimiter(6, 10 * 60 * 1000);
  const loginByIp = makeLimiter(30, 10 * 60 * 1000);
  const audit = (uid, action, detail = {}) => db.run('INSERT INTO audit(user_id,action,detail_json,created_at) VALUES (?,?,?,?)', uid, action, JSON.stringify(detail), now());

  const getSetting = (key, fallback) => {
    const r = db.get('SELECT value_json FROM settings WHERE key=?', key);
    return r ? { ...fallback, ...JSON.parse(r.value_json) } : { ...fallback };
  };
  const pricing = () => getSetting('pricing', DEFAULT_PRICING);

  const publicUser = (u) => ({ id: u.id, name: u.name, phone: u.phone, role: u.role, branch: u.branch, active: !!u.active, lastLoginAt: u.last_login_at, createdAt: u.created_at });

  /* ---------------- progress ---------------- */
  function progressFor(uid) {
    const lessons = new Set(db.all('SELECT lesson_id FROM lesson_done WHERE user_id=?', uid).map((r) => r.lesson_id));
    const answers = new Map(db.all('SELECT question_id, correct, first_correct, attempts FROM quiz_answers WHERE user_id=?', uid).map((r) => [r.question_id, r]));
    const exams = db.all('SELECT course_id, MAX(score) AS best, COUNT(*) AS n FROM exam_attempts WHERE user_id=? GROUP BY course_id', uid);
    const examMap = new Map(exams.map((e) => [e.course_id, e]));
    const certs = db.all('SELECT code, course_id, score, issued_at FROM certificates WHERE user_id=? ORDER BY issued_at DESC', uid);
    const certMap = new Map(certs.map((c) => [c.course_id, c]));
    const perCourse = C.COURSES.map((c) => {
      const qids = c.lessons.flatMap((l) => l.quiz.map((q) => q.id));
      const done = c.lessons.filter((l) => lessons.has(l.id)).length;
      const quizCorrect = qids.filter((id) => answers.get(id)?.correct).length;
      const examBest = examMap.get(c.id)?.best ?? null;
      const readiness = Math.round((done / c.lessons.length) * 40 + (quizCorrect / qids.length) * 30 + ((examBest ?? 0) / 100) * 30);
      return { id: c.id, lessonsDone: done, lessons: c.lessons.length, quizCorrect, quizTotal: qids.length, examBest, examAttempts: examMap.get(c.id)?.n ?? 0, cert: certMap.get(c.id)?.code ?? null, readiness };
    });
    const scen = db.all('SELECT scenario_id, MAX(CAST(score AS REAL)/max) AS bestPct, COUNT(*) AS n FROM scenario_attempts WHERE user_id=? GROUP BY scenario_id', uid);
    const floor = db.all('SELECT task_id, status, note, reviewer_note, requested_at, reviewed_at FROM floor_tasks WHERE user_id=?', uid);
    const acks = Object.fromEntries(db.all('SELECT sop_id, version FROM sop_acks WHERE user_id=?', uid).map((r) => [r.sop_id, r.version]));
    const t = new Date().toISOString();
    const cardStats = db.get('SELECT COUNT(*) AS seen, SUM(CASE WHEN box>=5 THEN 1 ELSE 0 END) AS mastered, SUM(CASE WHEN due_at<=? THEN 1 ELSE 0 END) AS due FROM cards WHERE user_id=?', t, uid);
    const drills = db.get('SELECT COUNT(*) AS total, COALESCE(SUM(correct),0) AS correct FROM drills WHERE user_id=?', uid);
    const assignments = db.all('SELECT id, course_id AS courseId, due_date AS dueDate, note, created_at AS createdAt FROM assignments WHERE user_id=? ORDER BY created_at DESC', uid);
    const sopMissing = C.SOPS.filter((s) => acks[s.id] !== s.version).map((s) => s.id);
    const totalLessons = C.LESSONS.size;
    const overall = Math.round(perCourse.reduce((s, c) => s + c.readiness, 0) / perCourse.length);
    return {
      lessonsDone: [...lessons],
      totals: { lessons: totalLessons, questions: C.QUESTIONS.size, floor: C.FLOOR_TASKS.size, scenarios: C.SCENARIOS.length, cards: C.CARDS.length },
      quiz: { answered: answers.size, correct: [...answers.values()].filter((a) => a.correct).length, firstTry: [...answers.values()].filter((a) => a.first_correct).length },
      courses: perCourse,
      overall,
      scenarios: scen.map((s) => ({ id: s.scenario_id, bestPct: Math.round(s.bestPct * 100), attempts: s.n })),
      floor: floor.map((f) => ({ taskId: f.task_id, status: f.status, note: f.note, reviewerNote: f.reviewer_note, requestedAt: f.requested_at, reviewedAt: f.reviewed_at })),
      acks,
      sopMissing,
      cards: { seen: cardStats.seen ?? 0, mastered: cardStats.mastered ?? 0, due: cardStats.due ?? 0 },
      drills,
      assignments,
      certificates: certs.map((c) => ({ code: c.code, courseId: c.course_id, score: c.score, issuedAt: c.issued_at })),
    };
  }

  /* ---------------- handlers ---------------- */
  const routes = [];
  const on = (method, pattern, guard, fn) => routes.push({ method, re: new RegExp(`^${pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)')}$`), guard, fn });

  on('GET', '/api/health', 'public', () => ({ ok: true, time: now() }));
  on('GET', '/api/config', 'public', () => ({
    demo,
    demoAccounts: demo ? db.all("SELECT name, phone, role FROM users WHERE demo=1 AND active=1 ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'manager' THEN 1 WHEN 'trainer' THEN 2 ELSE 3 END").map((u) => ({ ...u, pin: '1234' })) : [],
  }));

  on('POST', '/api/auth/login', 'public', ({ body, ip }) => {
    const phone = normalizePhone(body.phone);
    if (loginByIp.blocked(ip) || loginByPhone.blocked(phone)) throw new HttpError(429, 'تلاش‌های ناموفق زیاد بود. ده دقیقه دیگر دوباره امتحان کنید.');
    const u = db.get('SELECT * FROM users WHERE phone=?', phone);
    if (!u || !u.active || !verifyPin(String(body.pin ?? ''), u.pin_hash)) {
      loginByIp.fail(ip);
      loginByPhone.fail(phone);
      throw new HttpError(401, 'شماره یا رمز درست نیست.');
    }
    loginByPhone.reset(phone);
    db.run('UPDATE users SET last_login_at=? WHERE id=?', now(), u.id);
    const token = signer.sign({ t: 'session', uid: u.id, tv: u.token_version }, 30 * 86400);
    return { token, user: publicUser(u) };
  });

  on('POST', '/api/auth/logout-all', 'auth', ({ user }) => {
    db.run('UPDATE users SET token_version=token_version+1 WHERE id=?', user.id);
    return { ok: true };
  });

  on('POST', '/api/auth/pin', 'auth', ({ user, body }) => {
    const u = db.get('SELECT pin_hash FROM users WHERE id=?', user.id);
    if (!verifyPin(String(body.current ?? ''), u.pin_hash)) throw bad('رمز فعلی درست نیست.');
    if (!validPin(body.next)) throw bad('رمز جدید باید ۴ تا ۸ رقم باشد.');
    db.run('UPDATE users SET pin_hash=?, token_version=token_version+1 WHERE id=?', hashPin(body.next), user.id);
    const fresh = db.get('SELECT * FROM users WHERE id=?', user.id);
    return { token: signer.sign({ t: 'session', uid: fresh.id, tv: fresh.token_version }, 30 * 86400) };
  });

  on('GET', '/api/me', 'auth', ({ user }) => {
    const today = db.get('SELECT in_at, out_at FROM attendance WHERE user_id=? AND day=?', user.id, tehranDay());
    return { user: publicUser(user), pricing: pricing(), progress: progressFor(user.id), attendance: today ? { inAt: today.in_at, outAt: today.out_at } : null };
  });

  on('GET', '/api/content', 'auth', () => C.bootstrap());

  on('GET', '/api/lessons/:id', 'auth', ({ params, user }) => {
    const l = C.publicLesson(params.id);
    if (!l) throw notFound('این درس وجود ندارد.');
    const answered = db.all(`SELECT question_id, correct FROM quiz_answers WHERE user_id=? AND question_id IN (${l.quiz.map(() => '?').join(',')})`, user.id, ...l.quiz.map((q) => q.id));
    const done = !!db.get('SELECT 1 FROM lesson_done WHERE user_id=? AND lesson_id=?', user.id, l.id);
    return { lesson: l, done, answered: Object.fromEntries(answered.map((a) => [a.question_id, !!a.correct])) };
  });

  on('POST', '/api/lessons/:id/complete', 'auth', ({ params, user }) => {
    if (!C.LESSONS.has(params.id)) throw notFound();
    db.run('INSERT OR IGNORE INTO lesson_done(user_id,lesson_id,done_at) VALUES (?,?,?)', user.id, params.id, now());
    return { ok: true };
  });

  on('POST', '/api/quiz/answer', 'auth', ({ body, user }) => {
    const q = C.QUESTIONS.get(String(body.questionId));
    if (!q) throw notFound('سوال پیدا نشد.');
    const correct = grade(q, body.answer);
    const prev = db.get('SELECT attempts FROM quiz_answers WHERE user_id=? AND question_id=?', user.id, q.id);
    if (prev) db.run('UPDATE quiz_answers SET correct=MAX(correct,?), attempts=attempts+1, updated_at=? WHERE user_id=? AND question_id=?', correct ? 1 : 0, now(), user.id, q.id);
    else db.run('INSERT INTO quiz_answers(user_id,question_id,correct,first_correct,attempts,updated_at) VALUES (?,?,?,?,1,?)', user.id, q.id, correct ? 1 : 0, correct ? 1 : 0, now());
    return { correct, why: q.why, ...reveal(q) };
  });

  /* exams */
  on('GET', '/api/exams/:courseId', 'auth', ({ params, user }) => {
    const c = C.courseById(params.courseId);
    if (!c) throw notFound();
    const missing = c.lessons.filter((l) => !db.get('SELECT 1 FROM lesson_done WHERE user_id=? AND lesson_id=?', user.id, l.id));
    if (missing.length) throw new HttpError(409, `پیش از آزمون، ${missing.length} درس باقی‌مانده این دوره را تمام کنید.`);
    const pool = shuffle(c.lessons.flatMap((l) => l.quiz));
    const picked = pool.slice(0, Math.min(12, pool.length));
    const token = signer.sign({ t: 'exam', uid: user.id, cid: c.id, q: picked.map((q) => q.id) }, 3600);
    return { token, course: { id: c.id, title: c.title }, passPct: pricing().passPct, questions: picked.map((q) => (q.o ? { id: q.id, q: q.q, o: q.o } : { id: q.id, q: q.q, numeric: true, unit: q.unit })) };
  });

  on('POST', '/api/exams/:courseId', 'auth', ({ params, user, body }) => {
    const p = signer.verify(body.token);
    if (!p || p.t !== 'exam' || p.uid !== user.id || p.cid !== params.courseId) throw bad('برگه آزمون منقضی یا نامعتبر است؛ آزمون را دوباره شروع کنید.');
    const answers = body.answers && typeof body.answers === 'object' ? body.answers : {};
    const results = p.q.map((id) => {
      const q = C.QUESTIONS.get(id);
      const given = answers[id];
      const correct = given !== undefined && given !== null && given !== '' && grade(q, given);
      return { id, q: q.q, correct, given: given ?? null, why: q.why, ...reveal(q) };
    });
    const score = Math.round((results.filter((r) => r.correct).length / results.length) * 1000) / 10;
    const passed = score >= pricing().passPct;
    const attemptId = randomUUID();
    let certificate = null;
    db.tx(() => {
      db.run('INSERT INTO exam_attempts(id,user_id,course_id,score,passed,detail_json,created_at) VALUES (?,?,?,?,?,?,?)', attemptId, user.id, params.courseId, score, passed ? 1 : 0, JSON.stringify(results.map((r) => ({ id: r.id, correct: r.correct, given: r.given }))), now());
      if (passed) {
        const existing = db.get('SELECT code, score FROM certificates WHERE user_id=? AND course_id=?', user.id, params.courseId);
        if (existing) {
          if (score > existing.score) db.run('UPDATE certificates SET score=?, issued_at=? WHERE code=?', score, now(), existing.code);
          certificate = existing.code;
        } else {
          certificate = certCode();
          db.run('INSERT INTO certificates(code,user_id,course_id,score,issued_at) VALUES (?,?,?,?,?)', certificate, user.id, params.courseId, score, now());
        }
      }
    });
    return { score, passed, passPct: pricing().passPct, results, certificate };
  });

  /* scenarios */
  on('GET', '/api/scenarios/:id', 'auth', ({ params, user }) => {
    const s = C.scenarioById(params.id);
    if (!s) throw notFound();
    const best = db.get('SELECT MAX(score) AS best, COUNT(*) AS n FROM scenario_attempts WHERE user_id=? AND scenario_id=?', user.id, s.id);
    return { scenario: C.publicScenario(s), best: best.best, attempts: best.n };
  });
  on('POST', '/api/scenarios/:id/reveal', 'auth', ({ params, body }) => {
    const s = C.scenarioById(params.id);
    const st = s?.steps.find((x) => x.id === body.stepId);
    if (!st) throw notFound();
    const best = st.choices.reduce((a, b) => (b.score > a.score ? b : a));
    const ch = st.choices.find((x) => x.id === body.choiceId);
    if (!ch) return { score: 0, fb: 'زمان تمام شد و پاسخی ثبت نشد.', bestId: best.id, bestText: best.text, bestFb: best.fb };
    return { score: ch.score, fb: ch.fb, bestId: best.id, bestText: best.text, bestFb: best.fb };
  });
  on('POST', '/api/scenarios/:id/submit', 'auth', ({ params, body, user }) => {
    const s = C.scenarioById(params.id);
    if (!s) throw notFound();
    const choices = body.choices && typeof body.choices === 'object' ? body.choices : {};
    const path = s.steps.map((st) => {
      const ch = st.choices.find((c) => c.id === choices[st.id]);
      return { stepId: st.id, choiceId: ch?.id ?? null, score: ch?.score ?? 0 };
    });
    const score = path.reduce((a, b) => a + b.score, 0);
    const max = C.scenarioMax(s);
    db.run('INSERT INTO scenario_attempts(id,user_id,scenario_id,score,max,path_json,created_at) VALUES (?,?,?,?,?,?,?)', randomUUID(), user.id, s.id, score, max, JSON.stringify(path), now());
    return { score, max, pct: Math.max(0, Math.round((score / max) * 100)), violations: path.filter((p) => p.score < 0).length };
  });

  /* flashcards (Leitner) */
  on('GET', '/api/cards/due', 'auth', ({ user }) => {
    const t = now();
    const due = db.all('SELECT card_id, box FROM cards WHERE user_id=? AND due_at<=? ORDER BY due_at LIMIT 40', user.id, t);
    const introducedToday = db.get('SELECT COUNT(*) AS n FROM cards WHERE user_id=? AND first_seen>=?', user.id, `${tehranDay()}T00:00:00`).n;
    const seen = new Set(db.all('SELECT card_id FROM cards WHERE user_id=?', user.id).map((r) => r.card_id));
    const done = new Set(db.all('SELECT lesson_id FROM lesson_done WHERE user_id=?', user.id).map((r) => r.lesson_id));
    const eligible = C.CARDS.filter((c) => !seen.has(c.id) && (c.id.startsWith('gl-') || done.has(C.QUESTIONS.get(c.id.slice(2))?.lessonId)));
    const fresh = eligible.slice(0, Math.max(0, NEW_CARDS_PER_DAY - introducedToday));
    const byId = new Map(C.CARDS.map((c) => [c.id, c]));
    return {
      cards: [...due.map((d) => ({ ...byId.get(d.card_id), box: d.box })), ...fresh.map((c) => ({ ...c, box: 0 }))].filter((c) => c.front),
      remainingNew: eligible.length - fresh.length,
    };
  });
  on('POST', '/api/cards/review', 'auth', ({ user, body }) => {
    const id = String(body.cardId);
    if (!C.CARD_IDS.has(id)) throw notFound();
    const g = body.grade;
    if (!['again', 'good', 'easy'].includes(g)) throw bad('ارزیابی نامعتبر.');
    const row = db.get('SELECT box FROM cards WHERE user_id=? AND card_id=?', user.id, id);
    const box = g === 'again' ? 1 : Math.min(7, (row?.box ?? 0) + (g === 'easy' ? 2 : 1));
    const dueMs = g === 'again' ? 10 * 60 * 1000 : CARD_INTERVAL_DAYS[box] * DAY || 12 * 3600 * 1000;
    const due = new Date(Date.now() + dueMs).toISOString();
    if (row) db.run('UPDATE cards SET box=?, due_at=?, reviews=reviews+1, lapses=lapses+? WHERE user_id=? AND card_id=?', box, due, g === 'again' ? 1 : 0, user.id, id);
    else db.run('INSERT INTO cards(user_id,card_id,box,due_at,reviews,lapses,first_seen) VALUES (?,?,?,?,1,?,?)', user.id, id, box, due, g === 'again' ? 1 : 0, now());
    return { box, due };
  });

  on('POST', '/api/drills', 'auth', ({ user, body }) => {
    if (!(body.kind in DRILL_KINDS)) throw bad('نوع تمرین نامعتبر.');
    db.run('INSERT INTO drills(user_id,kind,correct,created_at) VALUES (?,?,?,?)', user.id, body.kind, body.correct ? 1 : 0, now());
    return { ok: true };
  });

  /* floor tasks */
  on('POST', '/api/floor/:taskId', 'auth', ({ user, params, body }) => {
    if (!C.FLOOR_TASKS.has(params.taskId)) throw notFound();
    const cur = db.get('SELECT status FROM floor_tasks WHERE user_id=? AND task_id=?', user.id, params.taskId);
    if (cur?.status === 'verified') throw new HttpError(409, 'این کار قبلاً تأیید شده است.');
    const note = String(body.note ?? '').slice(0, 500);
    db.run("INSERT INTO floor_tasks(user_id,task_id,status,note,requested_at) VALUES (?,?,'requested',?,?) ON CONFLICT(user_id,task_id) DO UPDATE SET status='requested', note=excluded.note, requested_at=excluded.requested_at, reviewer_note='', reviewer_id=NULL, reviewed_at=NULL", user.id, params.taskId, note, now());
    return { status: 'requested' };
  });

  /* SOPs */
  on('GET', '/api/sops/:id', 'auth', ({ params, user }) => {
    const s = C.sopById(params.id);
    if (!s) throw notFound();
    const ack = db.get('SELECT version, acked_at FROM sop_acks WHERE user_id=? AND sop_id=?', user.id, s.id);
    return { sop: s, ack: ack ? { version: ack.version, at: ack.acked_at } : null };
  });
  on('POST', '/api/sops/:id/ack', 'auth', ({ params, user }) => {
    const s = C.sopById(params.id);
    if (!s) throw notFound();
    db.run('INSERT INTO sop_acks(user_id,sop_id,version,acked_at) VALUES (?,?,?,?) ON CONFLICT(user_id,sop_id) DO UPDATE SET version=excluded.version, acked_at=excluded.acked_at', user.id, s.id, s.version, now());
    return { ok: true, version: s.version };
  });

  /* attendance */
  on('POST', '/api/attendance', 'auth', ({ user, body }) => {
    const day = tehranDay();
    const row = db.get('SELECT in_at, out_at FROM attendance WHERE user_id=? AND day=?', user.id, day);
    if (body.type === 'in') {
      if (row?.in_at) throw new HttpError(409, 'ورود امروز قبلاً ثبت شده.');
      db.run('INSERT INTO attendance(user_id,day,in_at) VALUES (?,?,?)', user.id, day, now());
    } else if (body.type === 'out') {
      if (!row?.in_at) throw new HttpError(409, 'اول ورود را ثبت کنید.');
      if (row.out_at) throw new HttpError(409, 'خروج امروز قبلاً ثبت شده.');
      db.run('UPDATE attendance SET out_at=? WHERE user_id=? AND day=?', now(), user.id, day);
    } else throw bad('نوع نامعتبر.');
    const r = db.get('SELECT in_at, out_at FROM attendance WHERE user_id=? AND day=?', user.id, day);
    return { inAt: r.in_at, outAt: r.out_at };
  });

  /* ---------------- team (trainer / manager / owner) ---------------- */
  on('GET', '/api/team', 'staff', () => {
    const day = tehranDay();
    const users = db.all('SELECT * FROM users ORDER BY active DESC, role DESC, name');
    const pending = db.get("SELECT COUNT(*) AS n FROM floor_tasks WHERE status='requested'").n;
    return {
      pendingFloor: pending,
      members: users.map((u) => {
        const p = progressFor(u.id);
        const att = db.get('SELECT in_at, out_at FROM attendance WHERE user_id=? AND day=?', u.id, day);
        const exams = p.courses.filter((c) => c.examBest != null);
        return {
          ...publicUser(u),
          overall: p.overall,
          lessonsDone: p.lessonsDone.length,
          certificates: p.certificates.length,
          examAvg: exams.length ? Math.round(exams.reduce((s, c) => s + c.examBest, 0) / exams.length) : null,
          scenarioAvg: p.scenarios.length ? Math.round(p.scenarios.reduce((s, x) => s + x.bestPct, 0) / p.scenarios.length) : null,
          floorVerified: p.floor.filter((f) => f.status === 'verified').length,
          floorPending: p.floor.filter((f) => f.status === 'requested').length,
          sopMissing: p.sopMissing.length,
          today: att ? { inAt: att.in_at, outAt: att.out_at } : null,
        };
      }),
    };
  });

  on('GET', '/api/team/:id', 'staff', ({ params }) => {
    const u = db.get('SELECT * FROM users WHERE id=?', params.id);
    if (!u) throw notFound();
    const attendance = db.all('SELECT day, in_at, out_at FROM attendance WHERE user_id=? ORDER BY day DESC LIMIT 30', u.id);
    const recentExams = db.all('SELECT course_id AS courseId, score, passed, created_at AS at FROM exam_attempts WHERE user_id=? ORDER BY created_at DESC LIMIT 10', u.id);
    return { user: publicUser(u), progress: progressFor(u.id), attendance, recentExams };
  });

  on('POST', '/api/team', 'admin', ({ user, body }) => {
    const phone = normalizePhone(body.phone);
    const name = String(body.name ?? '').trim();
    const role = String(body.role ?? 'employee');
    if (name.length < 2) throw bad('نام را کامل وارد کنید.');
    if (!validPhone(phone)) throw bad('شماره موبایل باید ۱۱ رقم و با ۰۹ شروع شود.');
    if (!ROLES.includes(role)) throw bad('نقش نامعتبر.');
    if (role === 'owner' && user.role !== 'owner') throw new HttpError(403, 'فقط مالک می‌تواند مالک جدید تعریف کند.');
    if (!validPin(body.pin)) throw bad('رمز اولیه باید ۴ تا ۸ رقم باشد.');
    if (db.get('SELECT 1 FROM users WHERE phone=?', phone)) throw new HttpError(409, 'این شماره قبلاً ثبت شده.');
    const id = randomUUID();
    db.run('INSERT INTO users(id,name,phone,role,branch,pin_hash,created_at) VALUES (?,?,?,?,?,?,?)', id, name, phone, role, String(body.branch ?? '').trim(), hashPin(body.pin), now());
    audit(user.id, 'user.create', { id, role });
    return { user: publicUser(db.get('SELECT * FROM users WHERE id=?', id)) };
  });

  on('PATCH', '/api/team/:id', 'admin', ({ user, params, body }) => {
    const u = db.get('SELECT * FROM users WHERE id=?', params.id);
    if (!u) throw notFound();
    if (u.role === 'owner' && user.role !== 'owner') throw new HttpError(403, 'اطلاعات مالک را فقط مالک تغییر می‌دهد.');
    if (body.role !== undefined) {
      if (!ROLES.includes(body.role)) throw bad('نقش نامعتبر.');
      if (body.role === 'owner' && user.role !== 'owner') throw new HttpError(403, 'فقط مالک می‌تواند نقش مالک بدهد.');
      if (u.id === user.id) throw bad('نقش خودتان را نمی‌توانید تغییر دهید.');
      db.run('UPDATE users SET role=? WHERE id=?', body.role, u.id);
    }
    if (body.name !== undefined && String(body.name).trim().length >= 2) db.run('UPDATE users SET name=? WHERE id=?', String(body.name).trim(), u.id);
    if (body.branch !== undefined) db.run('UPDATE users SET branch=? WHERE id=?', String(body.branch).trim(), u.id);
    if (body.active !== undefined) {
      if (u.id === user.id) throw bad('حساب خودتان را نمی‌توانید غیرفعال کنید.');
      db.run('UPDATE users SET active=?, token_version=token_version+1 WHERE id=?', body.active ? 1 : 0, u.id);
    }
    if (body.pin !== undefined) {
      if (!validPin(body.pin)) throw bad('رمز باید ۴ تا ۸ رقم باشد.');
      db.run('UPDATE users SET pin_hash=?, token_version=token_version+1 WHERE id=?', hashPin(body.pin), u.id);
    }
    audit(user.id, 'user.update', { id: u.id, fields: Object.keys(body) });
    return { user: publicUser(db.get('SELECT * FROM users WHERE id=?', u.id)) };
  });

  on('GET', '/api/floor-queue', 'staff', () => ({
    items: db.all("SELECT f.user_id AS userId, u.name, f.task_id AS taskId, f.note, f.requested_at AS requestedAt FROM floor_tasks f JOIN users u ON u.id=f.user_id WHERE f.status='requested' ORDER BY f.requested_at").map((r) => ({ ...r, title: C.FLOOR_TASKS.get(r.taskId)?.title ?? r.taskId, steps: C.FLOOR_TASKS.get(r.taskId)?.steps ?? [] })),
  }));
  on('POST', '/api/floor-queue/:userId/:taskId', 'staff', ({ user, params, body }) => {
    if (params.userId === user.id) throw new HttpError(403, 'کار عملی خودتان را نمی‌توانید تأیید کنید.');
    const verdict = body.verdict === 'verified' ? 'verified' : body.verdict === 'rejected' ? 'rejected' : null;
    if (!verdict) throw bad('نتیجه نامعتبر.');
    const r = db.run("UPDATE floor_tasks SET status=?, reviewer_note=?, reviewer_id=?, reviewed_at=? WHERE user_id=? AND task_id=? AND status='requested'", verdict, String(body.note ?? '').slice(0, 500), user.id, now(), params.userId, params.taskId);
    if (!r.changes) throw notFound('درخواست فعالی پیدا نشد.');
    audit(user.id, 'floor.review', { userId: params.userId, taskId: params.taskId, verdict });
    return { ok: true };
  });

  on('POST', '/api/assignments', 'staff', ({ user, body }) => {
    if (!C.courseById(body.courseId)) throw bad('دوره نامعتبر.');
    if (!db.get('SELECT 1 FROM users WHERE id=?', body.userId)) throw notFound();
    const due = /^\d{4}-\d{2}-\d{2}$/.test(String(body.dueDate ?? '')) ? body.dueDate : null;
    db.run('INSERT INTO assignments(id,user_id,course_id,due_date,note,assigned_by,created_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(user_id,course_id) DO UPDATE SET due_date=excluded.due_date, note=excluded.note, assigned_by=excluded.assigned_by', randomUUID(), body.userId, body.courseId, due, String(body.note ?? '').slice(0, 300), user.id, now());
    audit(user.id, 'assignment.set', { userId: body.userId, courseId: body.courseId });
    return { ok: true };
  });
  on('DELETE', '/api/assignments/:id', 'staff', ({ params, user }) => {
    db.run('DELETE FROM assignments WHERE id=?', params.id);
    audit(user.id, 'assignment.delete', { id: params.id });
    return { ok: true };
  });

  on('PUT', '/api/settings/pricing', 'admin', ({ user, body }) => {
    const cur = pricing();
    const n = (v, lo, hi) => {
      const x = Number(v);
      return Number.isFinite(x) && x >= lo && x <= hi ? x : null;
    };
    const next = {
      p750: n(body.p750, 1000, 1e11) ?? cur.p750,
      profitPct: n(body.profitPct, 0, 50) ?? cur.profitPct,
      vatPct: n(body.vatPct, 0, 30) ?? cur.vatPct,
      buybackDeductPct: n(body.buybackDeductPct, 0, 20) ?? cur.buybackDeductPct,
      passPct: n(body.passPct, 50, 100) ?? cur.passPct,
      priceNote: String(body.priceNote ?? '').slice(0, 120),
      updatedAt: now(),
    };
    db.run('INSERT INTO settings(key,value_json,updated_at,updated_by) VALUES (?,?,?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at, updated_by=excluded.updated_by', 'pricing', JSON.stringify(next), now(), user.id);
    audit(user.id, 'settings.pricing', next);
    return { pricing: next };
  });

  /* ---------------- dispatcher ---------------- */
  function authenticate(req) {
    const h = req.headers.authorization ?? '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : null;
    const p = token && signer.verify(token);
    if (!p || p.t !== 'session') return null;
    const u = db.get('SELECT * FROM users WHERE id=?', p.uid);
    if (!u || !u.active || u.token_version !== p.tv) return null;
    return u;
  }

  return async function handle(req, url, body, ip) {
    for (const r of routes) {
      if (r.method !== req.method) continue;
      const m = r.re.exec(url.pathname);
      if (!m) continue;
      let user = null;
      if (r.guard !== 'public') {
        user = authenticate(req);
        if (!user) throw new HttpError(401, 'ورود لازم است.');
        if (r.guard === 'staff' && !STAFF_ROLES.has(user.role)) throw new HttpError(403, 'این بخش مخصوص مدیر و مربی است.');
        if (r.guard === 'admin' && !ADMIN_ROLES.has(user.role)) throw new HttpError(403, 'این بخش مخصوص مدیر است.');
      }
      const params = Object.fromEntries(Object.entries(m.groups ?? {}).map(([k, v]) => [k, decodeURIComponent(v)]));
      return r.fn({ req, url, body: body ?? {}, params, user, ip });
    }
    throw notFound('مسیر API وجود ندارد.');
  };
}

/* ---------------- seeding ---------------- */
export function seedUsers(db, env = process.env, demo = false) {
  const count = db.get('SELECT COUNT(*) AS n FROM users').n;
  const ownerPhone = normalizePhone(env.BEATRIS_OWNER_PHONE);
  if (validPhone(ownerPhone) && validPin(env.BEATRIS_OWNER_PIN) && !db.get('SELECT 1 FROM users WHERE phone=?', ownerPhone)) {
    db.run('INSERT INTO users(id,name,phone,role,branch,pin_hash,created_at) VALUES (?,?,?,?,?,?,?)', randomUUID(), env.BEATRIS_OWNER_NAME || 'مالک', ownerPhone, 'owner', 'شعبه مرکزی', hashPin(env.BEATRIS_OWNER_PIN), now());
    console.log('[beatris] owner account created from env.');
  }
  if (demo) {
    const people = [
      ['مهرداد آریایی', '09120000001', 'owner', 'شعبه مرکزی'],
      ['سارا موسوی', '09120000002', 'manager', 'شعبه مرکزی'],
      ['نیلوفر احمدی', '09120000003', 'trainer', 'شعبه مرکزی'],
      ['نیما صالحی', '09120000004', 'employee', 'شعبه مرکزی'],
      ['زهرا حسینی', '09120000005', 'employee', 'شعبه بازار'],
      ['علی رضایی', '09120000006', 'employee', 'شعبه بازار'],
    ];
    const pin = hashPin('1234');
    for (const [name, phone, role, branch] of people) {
      if (!db.get('SELECT 1 FROM users WHERE phone=?', phone)) db.run('INSERT INTO users(id,name,phone,role,branch,pin_hash,demo,created_at) VALUES (?,?,?,?,?,?,1,?)', randomUUID(), name, phone, role, branch, pin, now());
    }
  }
  if (!count && !demo && !validPhone(ownerPhone)) console.warn('[beatris] No users. Set BEATRIS_OWNER_PHONE + BEATRIS_OWNER_PIN (or BEATRIS_DEMO=true) and restart.');
}
