import { COURSES_A } from './courses-a.mjs';
import { COURSES_B } from './courses-b.mjs';
import { COURSES_RARE } from './courses-rare.mjs';
import { SCENARIOS } from './scenarios.mjs';
import { SOPS } from './sops.mjs';
import { REFERENCES, GLOSSARY, PATH } from './library.mjs';

const byPath = (a, b) => PATH.indexOf(a.id) - PATH.indexOf(b.id);
export const COURSES = [...COURSES_A, ...COURSES_B, ...COURSES_RARE].sort(byPath);
export { SCENARIOS, SOPS, REFERENCES, GLOSSARY, PATH };

export const LESSONS = new Map();
export const QUESTIONS = new Map();
export const FLOOR_TASKS = new Map();
for (const c of COURSES) {
  c.lessons.forEach((l, i) => {
    LESSONS.set(l.id, { ...l, courseId: c.id, index: i });
    for (const q of l.quiz) QUESTIONS.set(q.id, { ...q, lessonId: l.id, courseId: c.id });
    for (const b of l.blocks) if (b.t === 'floor') FLOOR_TASKS.set(b.id, { ...b, lessonId: l.id, courseId: c.id });
  });
}
export const courseById = (id) => COURSES.find((c) => c.id === id) ?? null;
export const scenarioById = (id) => SCENARIOS.find((s) => s.id === id) ?? null;
export const sopById = (id) => SOPS.find((s) => s.id === id) ?? null;

// Flashcards: glossary + every choice question turned into a recall card.
export const CARDS = [
  ...GLOSSARY.map((g) => ({ id: `gl-${g.id}`, front: g.term, back: g.def })),
  ...[...QUESTIONS.values()].filter((q) => q.o).map((q) => ({ id: `q-${q.id}`, front: q.q, back: `${q.o[q.a]} — ${q.why}` })),
];
export const CARD_IDS = new Set(CARDS.map((c) => c.id));

/* ----- public views: never ship answers to the client ----- */
const publicQuestion = (q) => (q.o ? { id: q.id, q: q.q, o: q.o } : { id: q.id, q: q.q, numeric: true, unit: q.unit });

export function publicCourse(c) {
  return {
    id: c.id,
    title: c.title,
    summary: c.summary,
    level: c.level,
    refs: c.refs,
    minutes: c.lessons.reduce((s, l) => s + l.minutes, 0),
    questionCount: c.lessons.reduce((s, l) => s + l.quiz.length, 0),
    lessons: c.lessons.map((l) => ({ id: l.id, title: l.title, minutes: l.minutes, floor: l.blocks.filter((b) => b.t === 'floor').map((b) => b.id) })),
  };
}
export function publicLesson(id) {
  const l = LESSONS.get(id);
  if (!l) return null;
  const c = courseById(l.courseId);
  const next = c.lessons[l.index + 1]?.id ?? null;
  const prev = c.lessons[l.index - 1]?.id ?? null;
  return { id: l.id, title: l.title, minutes: l.minutes, courseId: c.id, courseTitle: c.title, blocks: l.blocks, quiz: l.quiz.map(publicQuestion), next, prev, position: l.index + 1, total: c.lessons.length };
}
export function publicScenario(s) {
  return { id: s.id, title: s.title, persona: s.persona, category: s.category, difficulty: s.difficulty, timeLimit: s.timeLimit, intro: s.intro, maxScore: scenarioMax(s), steps: s.steps.map((st) => ({ id: st.id, say: st.say, prompt: st.prompt, choices: st.choices.map((ch) => ({ id: ch.id, text: ch.text })) })) };
}
export const scenarioMax = (s) => s.steps.reduce((sum, st) => sum + Math.max(...st.choices.map((c) => c.score)), 0);

export function bootstrap() {
  return {
    courses: COURSES.map(publicCourse),
    path: PATH,
    scenarios: SCENARIOS.map((s) => ({ id: s.id, title: s.title, persona: s.persona, category: s.category, difficulty: s.difficulty, steps: s.steps.length, maxScore: scenarioMax(s) })),
    sops: SOPS.map(({ id, title, version, category, summary }) => ({ id, title, version, category, summary })),
    glossary: GLOSSARY,
    references: REFERENCES,
    floorTasks: [...FLOOR_TASKS.values()].map(({ id, title, steps, lessonId, courseId }) => ({ id, title, steps, lessonId, courseId })),
    cardCount: CARDS.length,
  };
}

/* ----- integrity check (used by tests and at boot) ----- */
export function validateContent() {
  const errors = [];
  const seen = new Set();
  const refIds = new Set(REFERENCES.map((r) => r.id));
  const sopIds = new Set(SOPS.map((s) => s.id));
  const uniq = (kind, id) => {
    const k = `${kind}:${id}`;
    if (seen.has(k)) errors.push(`duplicate ${k}`);
    seen.add(k);
  };
  for (const c of COURSES) {
    uniq('course', c.id);
    for (const r of c.refs) if (!refIds.has(r)) errors.push(`${c.id}: unknown ref ${r}`);
    for (const l of c.lessons) {
      uniq('lesson', l.id);
      if (!l.quiz.length) errors.push(`${l.id}: no quiz`);
      for (const b of l.blocks) {
        if (b.t === 'floor') uniq('floor', b.id);
        if (b.t === 'tool' && b.tool === 'sop' && !sopIds.has(b.ref)) errors.push(`${l.id}: unknown sop ${b.ref}`);
      }
      for (const q of l.quiz) {
        uniq('q', q.id);
        if (q.o && !(q.a >= 0 && q.a < q.o.length)) errors.push(`${q.id}: bad answer index`);
        if (!q.o && !(Number.isFinite(q.n) && q.tol > 0)) errors.push(`${q.id}: bad numeric`);
      }
    }
  }
  for (const s of SCENARIOS) {
    uniq('scenario', s.id);
    for (const st of s.steps) if (!st.choices.some((c) => c.score > 0)) errors.push(`${s.id}/${st.id}: no positive choice`);
  }
  for (const id of PATH) if (!courseById(id)) errors.push(`path: unknown ${id}`);
  return errors;
}
