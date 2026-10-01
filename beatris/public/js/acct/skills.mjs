// گراف مهارت حسابداری (spec 0015): the skills of a gold shop's books, their prerequisites, and the mastery of one
// person in each — a Beta posterior over «gets it right», so a lucky first answer is not mastery and a slip after
// many good ones is not a collapse. The policy that picks the next exercise lives here too, deterministic.

export const SKILLS = [
  { id: 'fund', fa: 'مبانی حسابداری', parent: null, needs: [] },
  { id: 'dc', fa: 'بدهکار و بستانکار', parent: 'fund', needs: [] },
  { id: 'journal', fa: 'سند روزنامه', parent: 'fund', needs: ['dc'] },
  { id: 'ledger', fa: 'دفتر کل', parent: 'fund', needs: ['journal'] },
  { id: 'trial', fa: 'تراز آزمایشی', parent: 'fund', needs: ['ledger'] },
  { id: 'customers', fa: 'حساب مشتریان', parent: 'fund', needs: ['journal'] },
  { id: 'suppliers', fa: 'حساب تأمین‌کنندگان', parent: 'fund', needs: ['journal'] },
  { id: 'cash', fa: 'صندوق', parent: 'fund', needs: ['dc'] },
  { id: 'bank', fa: 'بانک', parent: 'fund', needs: ['dc'] },
  { id: 'inventory', fa: 'موجودی طلا', parent: 'fund', needs: ['journal'] },
  { id: 'weight', fa: 'حسابداری وزنی و عیار', parent: 'fund', needs: ['inventory'] },
  { id: 'making', fa: 'اجرت و سود', parent: 'fund', needs: ['journal'] },
  { id: 'tax', fa: 'مالیات', parent: 'fund', needs: ['making'] },
  { id: 'settlement', fa: 'تسویه', parent: 'fund', needs: ['customers', 'suppliers'] },
  { id: 'recon', fa: 'مغایرت‌گیری', parent: 'fund', needs: ['weight', 'cash'] },
  { id: 'closing', fa: 'بستن روز', parent: 'fund', needs: ['recon', 'trial'] },
  { id: 'audit', fa: 'حسابرسی', parent: 'fund', needs: ['closing'] },
];
export const SKILL = Object.fromEntries(SKILLS.map((s) => [s.id, s]));
export const LEAF_SKILLS = SKILLS.filter((s) => s.parent).map((s) => s.id);
export const DIFFICULTIES = ['beginner', 'intermediate', 'advanced', 'expert'];
export const DIFFICULTY_FA = { beginner: 'مقدماتی', intermediate: 'متوسط', advanced: 'پیشرفته', expert: 'خبره' };

const r3 = (x) => Math.round(x * 1000) / 1000;
const HALF_LIFE_DAYS = 30; // evidence older than a month counts half
const PRIOR = 1; // Beta(1, 1)

/** A fresh record: nothing known. */
export const emptyMastery = (skillId) => ({ skillId, attempts: 0, correct: 0, alpha: PRIOR, beta: PRIOR, confidence: 0, mastery: 0, streakWrong: 0, lastPracticedAt: null });

/**
 * One graded attempt (score ∈ [0, 1]) of a skill. Old evidence decays; mastery is the posterior mean shrunk toward
 * zero while there is little evidence; confidence grows with the evidence and falls with the variance.
 */
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

/** Skills ready to be practised: every prerequisite at least partly learnt (or never touched at the start). */
export function unlocked(masteries) {
  const get = (id) => masteries[id]?.mastery ?? 0;
  return LEAF_SKILLS.filter((id) => SKILL[id].needs.every((n) => get(n) >= 0.45 || (masteries[n]?.attempts ?? 0) >= 3) || SKILL[id].needs.length === 0);
}

/**
 * The weakest skill worth working on now: low mastery, low confidence, a recent run of mistakes, long unpractised.
 * Returns { skillId, difficulty, reason, remedial }.
 */
export function nextFocus(masteries, now = new Date()) {
  const open = unlocked(masteries);
  let best = null;
  for (const id of open) {
    const m = masteries[id] ?? emptyMastery(id);
    const idle = m.lastPracticedAt ? (Date.parse(now) - Date.parse(m.lastPracticedAt)) / 86400000 : 30;
    const need = (1 - m.mastery) * 1.0 + (1 - m.confidence) * 0.35 + Math.min(1, m.streakWrong / 3) * 0.6 + Math.min(1, idle / 14) * 0.15;
    if (!best || need > best.need + 1e-9) best = { skillId: id, need, m };
  }
  if (!best) return { skillId: 'dc', difficulty: 'beginner', reason: 'start', remedial: false };
  const remedial = best.m.streakWrong >= 2;
  const reason = remedial ? 'repeated-mistakes' : best.m.attempts === 0 ? 'new-skill' : best.m.mastery < 0.5 ? 'weak' : 'practice';
  return { skillId: best.skillId, difficulty: difficultyFor(best.m), reason, remedial };
}

/** Overall readiness: mastery averaged over the leaf skills, each counted by its confidence. */
export function readiness(masteries) {
  let s = 0;
  for (const id of LEAF_SKILLS) s += (masteries[id]?.mastery ?? 0);
  return r3(s / LEAF_SKILLS.length);
}
