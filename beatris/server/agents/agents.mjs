// عامل‌ها (spec 0015): three agents with deterministic plans over the typed tools.
//   • AccountingTutorAgent — picks the next exercise, grades an attempt, updates mastery, explains, turns a
//     sentence of the counter into a proposed entry; never shows the answer before the trainee has tried.
//   • AuditAgent — runs the deterministic audit rules and explains what they found.
//   • TrainingCoachAgent (manager mode) — the weekly staff summary, the weak-skill report and recommendations.
// A model, when the shop has one, only rephrases finished explanations (see training.rephrase); it never decides.
import { SKILL, DIFFICULTIES } from '../../public/js/acct/skills.mjs';

const fa = (n) => Number(n).toLocaleString('fa-IR', { maximumFractionDigits: 0 });
const pct = (x) => `${fa(Math.round((x ?? 0) * 100))}٪`;
const week = (iso) => {
  const d = new Date(iso);
  const start = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return `${d.getUTCFullYear()}-w${Math.ceil(((d - start) / 86400000 + start.getUTCDay() + 1) / 7)}`;
};

/** Feedback after an attempt, from the graded mistakes (deterministic; no figures of the answer before it is due). */
export function feedbackOf(ev) {
  if (ev.correct) return 'درست است. همه ردیف‌ها، مبالغ و وزن‌ها با محاسبه موتور حسابداری می‌خواند.';
  const byCode = new Map();
  for (const m of ev.mistakes) byCode.set(m.code, [...(byCode.get(m.code) ?? []), m]);
  const lines = [];
  for (const [code, list] of byCode) {
    const first = list[0];
    lines.push(code === 'WRONG_AMOUNT' && !ev.done ? `مبلغ «${first.detail.replace(/^مبلغ «|» درست نیست\.$/g, '')}» را دوباره حساب کنید.` : first.detail);
  }
  return `${pct(ev.score)} درست. ${lines.slice(0, 4).join(' ')}${ev.done ? '' : ' دوباره تلاش کنید یا راهنمایی بخواهید.'}`;
}

export const AGENTS = {
  tutor: {
    name: 'AccountingTutorAgent',
    fa: 'مربی حسابداری',
    tools: ['training.getProgress', 'training.nextExercise', 'training.createScenario', 'training.evaluateAttempt', 'training.updateMastery', 'training.explain', 'memory.note', 'accounting.parseIntent', 'accounting.proposeEntry', 'accounting.validateEntry', 'accounting.getLedger', 'accounting.getTrialBalance', 'accounting.getInventory', 'accounting.postTrainingEntry', 'books.postDocument'],
    async plan(ctx) {
      const i = ctx.input;
      switch (i.mode) {
        case 'next':
        case 'closing':
        case 'remedial': {
          let args;
          if (i.mode === 'closing') args = { template: 'close_day', difficulty: 'advanced', reason: 'routine:closing' };
          else if (i.template) args = { template: i.template, ...(i.difficulty ? { difficulty: i.difficulty } : {}), reason: 'chosen' };
          else if (i.mode === 'remedial') {
            const prog = await ctx.tool('training.getProgress');
            const s = prog.skills.find((x) => x.id === i.skillId);
            const lv = Math.max(0, DIFFICULTIES.indexOf(prog.next.skillId === i.skillId ? prog.next.difficulty : 'intermediate') - 1);
            args = { skillId: i.skillId, difficulty: DIFFICULTIES[lv], reason: `remedial:${i.skillId}` };
            await ctx.tool('memory.note', { kind: 'style', key: `explain:${i.skillId}`, value: { more: true, mastery: s?.mastery ?? 0 } });
          } else {
            const next = await ctx.tool('training.nextExercise');
            args = { skillId: next.skillId, difficulty: next.difficulty, reason: `${next.reason}:${next.skillId}` };
            if (next.remedial) await ctx.tool('memory.note', { kind: 'weak_skill', key: next.skillId, value: { reason: next.reason } });
          }
          if (i.key) args.key = i.key;
          const scenario = await ctx.tool('training.createScenario', args);
          return { scenario, message: i.mode === 'remedial' ? `تمرین ساده‌تری برای «${SKILL[i.skillId]?.fa ?? i.skillId}» آماده شد؛ این بار توضیح مرحله‌به‌مرحله هم دارد.` : `تمرین «${scenario.title}» (${scenario.difficulty}) آماده است.` };
        }
        case 'check': {
          const ev = await ctx.tool('training.evaluateAttempt', { scenarioId: i.scenarioId, answer: i.answer, key: i.key });
          const mastery = ev.replayed ? null : await ctx.tool('training.updateMastery', { skills: ev.skills, key: `m-${i.key}` });
          for (const [skill, m] of Object.entries(mastery ?? {})) if (m.after < 0.5 && m.streakWrong >= 2) await ctx.tool('memory.note', { kind: 'weak_skill', key: skill, value: { mastery: m.after, streak: m.streakWrong } });
          if (ev.correct) await ctx.tool('memory.note', { kind: 'completed', key: i.scenarioId, value: { score: ev.score } });
          const explanation = ev.done ? await ctx.tool('training.explain', { scenarioId: i.scenarioId }) : null;
          return { evaluation: ev, mastery, feedback: feedbackOf(ev), explanation };
        }
        case 'review': {
          const prog = await ctx.tool('training.getProgress');
          await ctx.tool('memory.note', { kind: 'progress', key: week(ctx.input.at ?? new Date().toISOString()), value: { readiness: prog.readiness, weak: prog.weak.map((w) => w.id) } });
          return { readiness: prog.readiness, weak: prog.weak, message: `آمادگی شما ${pct(prog.readiness)} است.${prog.weak.length ? ` مهارت‌های ضعیف: ${prog.weak.map((w) => w.fa).join('، ')}.` : ''}` };
        }
        case 'intent': {
          // a sentence of the counter → typed intent → the kernel's entry → validation (a proposal; nothing posted)
          const { action } = await ctx.tool('accounting.parseIntent', { text: i.text, ...(i.price750 ? { price750: i.price750 } : {}) });
          if (!action) return { understood: false, message: 'این جمله به یک عملیات حسابداری شناخته‌شده نرسید.' };
          const proposal = await ctx.tool('accounting.proposeEntry', { action: Object.fromEntries(Object.entries(action).filter(([, v]) => v != null)), bookId: i.bookId });
          if (!proposal.ok) return { understood: true, action, proposal, message: proposal.error };
          const check = await ctx.tool('accounting.validateEntry', { entry: proposal.entry, bookId: i.bookId });
          if (i.post && check.ok) {
            const posted = await ctx.tool('accounting.postTrainingEntry', { bookId: i.bookId, entry: proposal.entry, key: i.key });
            return { understood: true, action, proposal, check, posted };
          }
          return { understood: true, action, proposal, check };
        }
        case 'real': {
          // the real books: the tool itself waits for a manager's approval
          const r = await ctx.tool('books.postDocument', { doc: i.doc, summary: i.summary });
          return r?.denied ? { posted: false, message: `مدیر رد کرد: ${r.reason}` } : { posted: true, document: r };
        }
        default:
          throw new Error('حالت مربی شناخته نیست.');
      }
    },
  },
  auditor: {
    name: 'AuditAgent',
    fa: 'حسابرس',
    tools: ['audit.runChecks', 'audit.explainFinding', 'memory.note', 'training.createScenario'],
    async plan(ctx) {
      const i = ctx.input;
      if (i.mode === 'challenge') {
        const scenario = await ctx.tool('training.createScenario', { template: 'audit_challenge', difficulty: 'expert', reason: 'routine:audit', ...(i.key ? { key: i.key } : {}) });
        return { scenario, message: 'چالش حسابرسی این هفته آماده است.' };
      }
      const run = await ctx.tool('audit.runChecks', i.scenarioId ? { scenarioId: i.scenarioId } : { bookId: i.bookId });
      const explained = [];
      for (const f of run.findings.slice(0, 5)) explained.push(await ctx.tool('audit.explainFinding', { findingId: f.id }));
      if (run.findings.length) await ctx.tool('memory.note', { kind: 'finding', key: run.id, value: { codes: [...new Set(run.findings.map((f) => f.code))], score: run.score } });
      return { score: run.score, findings: explained, more: Math.max(0, run.findings.length - explained.length), message: run.findings.length ? `${fa(run.findings.length)} یافته؛ امتیاز حسابرسی ${fa(run.score)} از ۱۰۰.` : 'دفتر پاک است؛ قاعده‌ای نقض نشده.' };
    },
  },
  coach: {
    name: 'TrainingCoachAgent',
    fa: 'هماهنگ‌کننده آموزش',
    tools: ['training.teamReport', 'memory.note'],
    async plan(ctx) {
      const i = ctx.input;
      const team = await ctx.tool('training.teamReport');
      const active = team.filter((p) => p.last);
      let report;
      if (i.mode === 'weak') {
        const count = new Map();
        for (const p of team) for (const w of p.weak) count.set(w, (count.get(w) ?? 0) + 1);
        report = { title: 'گزارش مهارت‌های ضعیف', rows: [...count].sort((a, b) => b[1] - a[1]).map(([skill, n]) => ({ skill, people: n })) };
      } else if (i.mode === 'recommend') {
        report = { title: 'پیشنهاد آموزش', rows: team.filter((p) => p.weak.length || !p.last).map((p) => ({ name: p.name, action: !p.last ? 'شروع تمرین روزانه' : `تمرین متمرکز: ${p.weak.join('، ')}` })) };
      } else {
        report = { title: 'خلاصه هفتگی مهارت کارکنان', rows: team.map((p) => ({ name: p.name, readiness: p.readiness, mastery: p.mastery, completion: p.completion })), active: active.length, total: team.length };
      }
      await ctx.tool('memory.note', { kind: 'report', key: `${i.mode}:${week(i.at ?? new Date().toISOString())}`, value: report });
      return report;
    },
  },
};
