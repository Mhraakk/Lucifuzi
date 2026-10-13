// spec 0015: scenarios (reproducible, answer computed by the kernel), grading (each mistake classified to a skill),
// hints that do not give the figures away, mastery (Beta posterior, decay, streak), the adaptive policy, and the
// deterministic audit rules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TEMPLATES, buildScenario, publicView } from '../public/js/acct/scenarios.mjs';
import { evaluateAttempt, hint, explainEntry } from '../public/js/acct/evaluate.mjs';
import { DIFFICULTIES, updateMastery, emptyMastery, nextFocus, difficultyFor, readiness, unlocked } from '../public/js/acct/skills.mjs';
import { runAuditRules, auditScore, RULES } from '../public/js/acct/auditrules.mjs';
import { createBook, post } from '../public/js/acct/kernel.mjs';
import { buildEntry } from '../public/js/acct/actions.mjs';

const answerOf = (s) => {
  const h = s.hiddenExpectedResult;
  if (s.answerKind === 'decision') return { decision: h.decision };
  if (s.answerKind === 'findings') return { findings: h.findings };
  return { entries: h.entries.map((e) => ({ lines: e.lines, ref: e.ref })) };
};

test('هر سناریو در هر سطح ساخته می‌شود، تکرارپذیر است و پاسخ موتور نمره کامل می‌گیرد', () => {
  let n = 0;
  for (const t of TEMPLATES)
    for (const lv of t.diff)
      for (const seed of [1, 13, 4242]) {
        const id = `${t.id}:${seed}:${DIFFICULTIES[lv]}`;
        const s = buildScenario(id);
        const again = buildScenario(id);
        assert.deepEqual(again.hiddenExpectedResult, s.hiddenExpectedResult, `${id} is reproducible`);
        assert.ok(s.context.length > 20 && s.evaluationCriteria.length);
        const ev = evaluateAttempt(s, answerOf(s));
        assert.equal(ev.score, 1, `${id}: ${JSON.stringify(ev.mistakes)}`);
        n++;
      }
  assert.ok(n >= 60);
  assert.ok(TEMPLATES.length >= 22, 'every case of the brief has a template');
});

test('نمای کارآموز پاسخ را ندارد', () => {
  const s = buildScenario('sell_jewelry:5:intermediate');
  const v = JSON.stringify(publicView(s));
  assert.ok(!v.includes('hiddenExpectedResult') && !v.includes('expectedActions'));
  assert.equal(s.hiddenExpectedResult.entries[0].lines.some((l) => l.account === '2130'), true);
});

test('ارزیابی: سمت اشتباه، مبلغ اشتباه، ردیف جاافتاده، نامتوازن، وزن اشتباه، طرف حساب اشتباه، سند اضافه', () => {
  const s = buildScenario('sell_to_customer:9:intermediate');
  const right = s.hiddenExpectedResult.entries[0].lines;
  const codes = (lines, extra = []) => evaluateAttempt(s, { entries: [{ lines }, ...extra] }).mistakes.map((m) => m.code);
  assert.ok(codes(right.map((l) => (l.account === '4110' ? { ...l, dr: l.cr, cr: 0 } : l))).includes('WRONG_SIDE'));
  assert.ok(codes(right.map((l) => (l.account === '2130' ? { ...l, cr: l.cr + 10 } : l))).includes('WRONG_AMOUNT'));
  assert.ok(codes(right.map((l) => (l.account === '2130' ? { ...l, cr: l.cr + 10 } : l))).includes('UNBALANCED'));
  assert.ok(codes(right.filter((l) => l.account !== '5110' && l.account !== '1320')).includes('MISSING_LINE'));
  assert.ok(codes(right.map((l) => (l.account === '1320' ? { ...l, fine750: l.fine750 + 0.1 } : l))).includes('WEIGHT_MISMATCH'));
  assert.ok(codes(right.map((l) => (l.party ? { ...l, party: 'کس دیگر' } : l))).includes('WRONG_PARTY'));
  assert.ok(codes(right, [{ lines: right }]).includes('EXTRA_ENTRY'));
  const tax = evaluateAttempt(s, { entries: [{ lines: right.map((l) => (l.account === '2130' ? { ...l, cr: l.cr * 2 } : l)) }] });
  assert.ok(tax.skills.tax < tax.score, 'a tax mistake costs the tax skill more');
  assert.ok(tax.score < 1 && tax.score > 0.5);
});

test('تصمیم موجودی منفی و یافته‌های حسابرسی ارزیابی می‌شوند', () => {
  const neg = buildScenario('negative_inventory:3:intermediate');
  assert.equal(neg.hiddenExpectedResult.decision, 'reject');
  assert.equal(evaluateAttempt(neg, { decision: 'post' }).score, 0);
  const au = buildScenario('audit_challenge:11:expert');
  const want = au.hiddenExpectedResult.findings;
  assert.ok(want.length >= 2);
  const half = evaluateAttempt(au, { findings: want.slice(0, 1) });
  assert.ok(half.score > 0 && half.score < 1 && half.mistakes.some((m) => m.code === 'MISSED_FINDING'));
  assert.ok(evaluateAttempt(au, { findings: [...want, 'OPERATOR_BEHAVIOR'] }).mistakes.some((m) => m.code === 'FALSE_FINDING'));
});

test('راهنمایی سطح‌به‌سطح؛ تا سطح ۴ (درخواست پاسخ) هیچ مبلغی گفته نمی‌شود', () => {
  const s = buildScenario('tax:2:advanced');
  const amounts = s.hiddenExpectedResult.entries[0].lines.map((l) => (l.dr || l.cr).toLocaleString('fa-IR'));
  for (const lv of [1, 2, 3]) {
    const h = hint(s, lv);
    assert.ok(!amounts.some((a) => h.text.includes(a)), `level ${lv} hides the figures`);
    assert.ok(!h.reveal);
  }
  const full = hint(s, 4);
  assert.ok(full.reveal && amounts.every((a) => full.text.includes(a)));
  assert.match(explainEntry(s.hiddenExpectedResult.entries[0], s.hiddenExpectedResult.effects).text, /اثر روی دفتر/);
});

test('تسلط: شانس اول تسلط نیست، شواهد قدیمی کم‌رنگ می‌شود، اشتباه پشت‌سرهم سطح را پایین می‌آورد', () => {
  let m = updateMastery(emptyMastery('tax'), 1, '2026-10-01T10:00:00Z');
  assert.ok(m.mastery < 0.5 && m.confidence < 0.3, 'one right answer is not mastery');
  for (let i = 0; i < 13; i++) m = updateMastery(m, 1, '2026-10-01T10:00:00Z');
  assert.ok(m.mastery > 0.8 && m.attempts === 14 && m.correct === 14);
  assert.equal(difficultyFor(m), 'expert');
  const later = updateMastery(m, 1, '2027-01-01T10:00:00Z');
  assert.ok(later.alpha < m.alpha + 1, 'three months later the old evidence weighs less');
  let w = m;
  w = updateMastery(w, 0.2, '2026-10-02T10:00:00Z');
  w = updateMastery(w, 0.1, '2026-10-02T10:05:00Z');
  assert.equal(w.streakWrong, 2);
  assert.ok(DIFFICULTIES.indexOf(difficultyFor(w)) < DIFFICULTIES.indexOf(difficultyFor({ ...w, streakWrong: 0 })), 'two misses step the level down');
});

test('سیاست تمرین بعدی: ضعیف‌ترین مهارت باز، با پیش‌نیاز؛ اشتباه تکراری = تمرین جبرانی', () => {
  const start = nextFocus({}, new Date('2026-10-01'));
  assert.ok(['dc', 'cash', 'bank'].includes(start.skillId), `starts from a skill without prerequisites (${start.skillId})`);
  assert.equal(start.difficulty, 'beginner');
  assert.ok(!unlocked({}).includes('closing'), 'closing waits for its prerequisites');
  const ms = {};
  for (const id of ['dc', 'cash', 'bank', 'journal']) {
    let m = emptyMastery(id);
    for (let i = 0; i < 8; i++) m = updateMastery(m, 1, '2026-10-01T10:00:00Z');
    ms[id] = m;
  }
  let tax = emptyMastery('customers');
  for (let i = 0; i < 3; i++) tax = updateMastery(tax, 0.1, '2026-10-01T10:00:00Z');
  ms.customers = tax;
  const f = nextFocus(ms, new Date('2026-10-01T12:00:00Z'));
  assert.equal(f.skillId, 'customers');
  assert.equal(f.remedial, true);
  assert.equal(f.reason, 'repeated-mistakes');
  assert.ok(readiness(ms) > 0 && readiness(ms) < 1);
});

test('قواعد حسابرسی: هر قاعده روی خطای کاشته‌شده فعال می‌شود و روی دفتر سالم ساکت است', () => {
  let b = createBook();
  const add = (a) => (b = post(b, buildEntry({ date: '2026-10-01', ...a }, b).entry).book);
  add({ type: 'capital', amount: 10_000_000_000, pay: 'bank' });
  add({ type: 'capital', amount: 1_000_000_000, pay: 'cash' });
  add({ type: 'buy_supplier', party: 'S', grams: 40, fineness: 750, price750: 80_000_000, making: 0, pay: 'bank' });
  add({ type: 'sell_jewelry', party: 'C', grams: 4, fineness: 750, price750: 82_000_000, making: 4_000_000, profitPct: 7, pay: 'credit' });
  const clean = runAuditRules(b.entries);
  assert.deepEqual(clean, [], JSON.stringify(clean));
  assert.equal(auditScore(clean), 100);
  const j = b.entries.map((e) => ({ ...e, lines: e.lines.map((l) => ({ ...l })) }));
  const at = (id, fault) => runAuditRules(fault(structuredClone(j))).map((f) => f.code);
  assert.ok(at(1, (x) => [...x, { ...x[3], id: 'D1' }]).includes('DUPLICATE'));
  assert.ok(at(2, (x) => [...x, { id: 'U', date: '2026-10-01', kind: 'expense', lines: [{ account: '6190', dr: 5, cr: 0 }, { account: '1110', dr: 0, cr: 4 }] }]).includes('UNBALANCED'));
  assert.ok(at(3, (x) => [...x, { id: 'W', date: '2026-10-01', kind: 'buy_melt', lines: [{ account: '1310', dr: 100, cr: 0, grams: 2, fineness: 740, fine750: 2.1 }, { account: '1110', dr: 0, cr: 100 }] }]).includes('WEIGHT_MISMATCH'));
  assert.ok(at(4, (x) => [...x, { id: 'P', date: '2026-10-01', kind: 'buy_melt', lines: [{ account: '1310', dr: 100, cr: 0, grams: 2, fineness: 1200, fine750: 3.2 }, { account: '1110', dr: 0, cr: 100 }] }]).includes('PURITY_MISMATCH'));
  assert.ok(at(5, (x) => [...x, { id: 'N', date: '2026-10-01', kind: 'sell_jewelry', lines: [{ account: '5110', dr: 100, cr: 0 }, { account: '1320', dr: 0, cr: 100, grams: 999, fineness: 750 }, { account: '1110', dr: 100, cr: 0 }, { account: '4110', dr: 0, cr: 100 }] }]).includes('NEGATIVE_INVENTORY'));
  assert.ok(at(6, (x) => [...x, { id: 'S', date: '2026-10-01', kind: 'settle_customer', ref: 'r', lines: [{ account: '1120', dr: 9e9, cr: 0 }, { account: '1210', dr: 0, cr: 9e9, party: 'C' }] }]).includes('INCORRECT_SETTLEMENT'));
  assert.ok(at(7, (x) => [...x, { id: 'R', date: '2026-10-01', kind: 'settle_supplier', lines: [{ account: '2110', dr: 1, cr: 0, party: 'S' }, { account: '1120', dr: 0, cr: 1 }] }]).includes('MISSING_REFERENCE'));
  assert.ok(at(8, (x) => [...x, { id: 'C', date: '2026-10-01', kind: 'buy_melt', lines: [{ account: '1310', dr: 2.5e9, cr: 0, grams: 30, fineness: 750, fine750: 30 }, { account: '1110', dr: 0, cr: 2.5e9 }] }]).includes('SUSPICIOUS_AMOUNT'));
  const vat = structuredClone(j);
  vat[3].lines.find((l) => l.account === '2130').cr += 1_000_000;
  vat[3].lines.find((l) => l.account === '1210').dr += 1_000_000;
  assert.ok(runAuditRules(vat).some((f) => f.code === 'ACCOUNT_MAPPING'));
  assert.ok(runAuditRules(j, { cashCounted: 1 }).some((f) => f.code === 'CASH_DISCREPANCY'));
  assert.ok(runAuditRules(j, { counts: { 1320: { fine750: 1 } } }).some((f) => f.code === 'INVENTORY_MISMATCH'));
  const below = structuredClone(j);
  below[3].lines.find((l) => l.account === '5110').dr = 9e9;
  below[3].lines.find((l) => l.account === '1320').cr = 9e9;
  assert.ok(runAuditRules(below).some((f) => f.code === 'UNEXPECTED_PNL'));
  const ops = [];
  for (let i = 0; i < 6; i++) ops.push({ id: `o${i}`, date: '2026-10-02', kind: 'reverse', operator: 'op1', lines: [{ account: '6190', dr: 10 + i, cr: 0 }, { account: '1110', dr: 0, cr: 10 + i }] });
  for (let i = 0; i < 6; i++) ops.push({ id: `p${i}`, date: '2026-10-02', kind: 'expense', operator: 'op2', lines: [{ account: '6190', dr: 20 + i, cr: 0 }, { account: '1110', dr: 0, cr: 20 + i }] });
  assert.ok(runAuditRules(ops).some((f) => f.code === 'OPERATOR_BEHAVIOR' && f.evidence.operator === 'op1'));
  assert.equal(Object.keys(RULES).length, 13);
});
