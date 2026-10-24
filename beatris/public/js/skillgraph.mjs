// گراف مهارت مشترک (spec 0016): one mastery model for every domain of Beatris — accounting, studio/CAD,
// manufacturing, and the domains to come. A domain declares its skills (id, parent, prerequisites); everything else
// — the Beta posterior per skill, decay of old evidence, streaks, difficulty, the next focus, readiness — is shared.

export const DIFFICULTIES = ['beginner', 'intermediate', 'advanced', 'expert'];
export const DIFFICULTY_FA = { beginner: 'مقدماتی', intermediate: 'متوسط', advanced: 'پیشرفته', expert: 'خبره' };
/** The competency areas a person is measured in (a domain may add skills under any of them). */
export const COMPETENCIES = { accounting: 'حسابداری', sales: 'فروش', knowledge: 'دانش طلا و جواهر', cad: 'طراحی و CAD', manufacturing: 'ساخت', setting: 'سنگ‌گذاری', inventory: 'موجودی', operations: 'عملیات' };

const r3 = (x) => Math.round(x * 1000) / 1000;
const HALF_LIFE_DAYS = 30;
const PRIOR = 1;

export const emptyMastery = (skillId) => ({ skillId, attempts: 0, correct: 0, alpha: PRIOR, beta: PRIOR, confidence: 0, mastery: 0, streakWrong: 0, lastPracticedAt: null });

/** One graded attempt (score ∈ [0, 1]); old evidence decays, little evidence is shrunk toward zero. */
export function updateMastery(m, score, at = new Date()) {
  const s = Math.max(0, Math.min(1, Number(score) || 0));
  const prev = m ?? emptyMastery('');
  const days = prev.lastPracticedAt ? Math.max(0, (Date.parse(at) - Date.parse(prev.lastPracticedAt)) / 86400000) : 0;
  const keep = 0.5 ** (days / HALF_LIFE_DAYS);
  const alpha = PRIOR + (prev.alpha - PRIOR) * keep + s;
  const beta = PRIOR + (prev.beta - PRIOR) * keep + (1 - s);
  const n = alpha + beta - 2 * PRIOR;
  const mean = alpha / (alpha + beta);
  const variance = (alpha * beta) / ((alpha + beta) ** 2 * (alpha + beta + 1));
  return {
    ...prev,
    attempts: prev.attempts + 1,
    correct: prev.correct + (s >= 0.999 ? 1 : 0),
    alpha: r3(alpha),
    beta: r3(beta),
    mastery: r3(mean * (n / (n + 2))),
    confidence: r3(Math.max(0, 1 - Math.sqrt(variance) / Math.sqrt(1 / 12)) * Math.min(1, n / 8)),
    streakWrong: s >= 0.8 ? 0 : prev.streakWrong + 1,
    lastPracticedAt: new Date(at).toISOString(),
  };
}

/** The difficulty that fits a mastery level; a run of mistakes steps one level down. */
export function difficultyFor(m) {
  const x = m?.mastery ?? 0;
  let i = x < 0.35 ? 0 : x < 0.6 ? 1 : x < 0.8 ? 2 : 3;
  if ((m?.streakWrong ?? 0) >= 2) i = Math.max(0, i - 1);
  return DIFFICULTIES[i];
}

/** A domain's graph: its skills and the policies over them. */
export function createGraph(skills, { domain = '', start = null } = {}) {
  const SKILL = Object.fromEntries(skills.map((s) => [s.id, { domain, ...s }]));
  const LEAF = skills.filter((s) => s.parent).map((s) => s.id);
  const unlocked = (ms) => LEAF.filter((id) => SKILL[id].needs.length === 0 || SKILL[id].needs.every((n) => (ms[n]?.mastery ?? 0) >= 0.45 || (ms[n]?.attempts ?? 0) >= 3));
  function nextFocus(ms, now = new Date()) {
    let best = null;
    for (const id of unlocked(ms)) {
      const m = ms[id] ?? emptyMastery(id);
      const idle = m.lastPracticedAt ? (Date.parse(now) - Date.parse(m.lastPracticedAt)) / 86400000 : 30;
      const need = (1 - m.mastery) + (1 - m.confidence) * 0.35 + Math.min(1, m.streakWrong / 3) * 0.6 + Math.min(1, idle / 14) * 0.15;
      if (!best || need > best.need + 1e-9) best = { skillId: id, need, m };
    }
    if (!best) return { skillId: start ?? LEAF[0], difficulty: 'beginner', reason: 'start', remedial: false };
    const remedial = best.m.streakWrong >= 2;
    return { skillId: best.skillId, difficulty: difficultyFor(best.m), reason: remedial ? 'repeated-mistakes' : best.m.attempts === 0 ? 'new-skill' : best.m.mastery < 0.5 ? 'weak' : 'practice', remedial };
  }
  const readiness = (ms) => r3(LEAF.reduce((s, id) => s + (ms[id]?.mastery ?? 0), 0) / LEAF.length);
  return { domain, SKILLS: skills, SKILL, LEAF, unlocked, nextFocus, readiness };
}
