// ارزیابی پاسخ (spec 0015): a trainee's entries against the kernel's expected entries, criterion by criterion. Each
// mistake has a code, the skill it belongs to and a deterministic explanation; hints come in levels and never give
// the figures away before the trainee has tried (unless they ask for the answer).
import { ACCOUNT, accountName } from './coa.mjs';
import { validateEntry, normalizeEntry, r3, fine750Of } from './kernel.mjs';
import { CRITERIA } from './scenarios.mjs';
import { RULES } from './auditrules.mjs';

const fa = (n) => Math.round(n).toLocaleString('fa-IR');
const side = (l) => (l.dr > 0 ? 'dr' : 'cr');
const amt = (l) => l.dr || l.cr;
const SIDE_FA = { dr: 'بدهکار', cr: 'بستانکار' };
/** The skill a mistake on an account points at. */
function skillOfAccount(code) {
  const t = ACCOUNT[code]?.tag;
  if (t === 'cash') return 'cash';
  if (t === 'bank') return 'bank';
  if (t === 'receivable' || t === 'deposit') return 'customers';
  if (t === 'payable' || t === 'prepaid') return 'suppliers';
  if (t === 'inventory' || t === 'cogs') return 'inventory';
  if (t === 'tax') return 'tax';
  if (t === 'making' || t === 'profit' || t === 'discount' || t === 'sales' || t === 'returns') return 'making';
  if (t === 'shortage' || t === 'overage' || t === 'gold-loss') return 'recon';
  return 'journal';
}

/** Collapse an entry's lines to account+side+party → amount and weight, the way the ledger would see them. */
function bag(entry) {
  const m = new Map();
  for (const l of normalizeEntry(entry).lines) {
    if (!(l.dr > 0 || l.cr > 0)) continue;
    const k = `${l.account}|${side(l)}`;
    const x = m.get(k) ?? { account: l.account, side: side(l), amount: 0, fine750: 0, grams: 0, fineness: l.fineness ?? null, parties: new Set() };
    x.amount = ACCOUNT[l.account]?.unit === 'G750' ? r3(x.amount + amt(l)) : x.amount + amt(l);
    x.fine750 = r3(x.fine750 + (l.fine750 ?? 0));
    x.grams = r3(x.grams + (l.grams ?? 0));
    if (l.party) x.parties.add(l.party);
    m.set(k, x);
  }
  return m;
}

/**
 * Grade an attempt. scenario: the full scenario (with hiddenExpectedResult). attempt: { entries: [{ lines }] } |
 * { decision } | { findings: [codes] }. Returns { score (0..1), criteria, mistakes, skills: { id: score }, correct }.
 */
export function evaluateAttempt(scenario, attempt) {
  const exp = scenario.hiddenExpectedResult;
  const mistakes = [];
  const crit = {};
  const miss = (code, skill, detail, extra = {}) => mistakes.push({ code, skill, detail, ...extra });
  if (scenario.answerKind === 'decision') {
    const ok = attempt?.decision === exp.decision;
    crit.decision = ok ? 1 : 0;
    if (!ok) miss('WRONG_DECISION', 'inventory', exp.decision === 'reject' ? 'موجودی کافی نیست؛ این فروش موجودی را منفی می‌کند و نباید ثبت شود.' : 'موجودی کافی است و سند قابل ثبت بود.');
  } else if (scenario.answerKind === 'findings') {
    const want = new Set(exp.findings);
    const got = new Set((attempt?.findings ?? []).filter((c) => RULES[c]));
    const hit = [...want].filter((c) => got.has(c)).length;
    const wrong = [...got].filter((c) => !want.has(c));
    for (const c of want) if (!got.has(c)) miss('MISSED_FINDING', 'audit', `یافته «${RULES[c].fa}» دیده نشد.`, { finding: c });
    for (const c of wrong) miss('FALSE_FINDING', 'audit', `«${RULES[c].fa}» در این دفتر نیست.`, { finding: c });
    crit.findings = want.size ? Math.max(0, (hit - wrong.length * 0.5) / want.size) : wrong.length ? 0 : 1;
  } else {
    const given = (attempt?.entries ?? []).filter((e) => e?.lines?.length);
    const want = exp.entries;
    if (given.length !== want.length) miss('ENTRY_COUNT', 'journal', `${fa(want.length)} سند لازم است؛ ${fa(given.length)} سند ثبت شد.`);
    let bal = 0, acc = 0, amo = 0, wt = 0, par = 0, wtN = 0, parN = 0;
    want.forEach((we, i) => {
      const ge = given[i] ?? { lines: [] };
      const v = validateEntry({ date: scenario.date, kind: we.kind, ref: we.ref, ...ge });
      const unbalanced = v.errors.some((x) => x.code === 'E_BALANCE');
      if (unbalanced) miss('UNBALANCED', 'dc', `سند ${fa(i + 1)}: جمع بدهکار با جمع بستانکار برابر نیست.`, { entry: i });
      bal += unbalanced || !ge.lines.length ? 0 : 1;
      const W = bag(we), G = bag(ge);
      let okAcc = 0, okAmt = 0;
      for (const [k, w] of W) {
        const g = G.get(k);
        if (!g) {
          const flip = G.get(`${w.account}|${w.side === 'dr' ? 'cr' : 'dr'}`);
          if (flip) miss('WRONG_SIDE', 'dc', `«${accountName(w.account)}» باید ${SIDE_FA[w.side]} شود، نه ${SIDE_FA[flip.side]}.`, { entry: i, account: w.account });
          else miss('MISSING_LINE', skillOfAccount(w.account), `ردیف «${accountName(w.account)}» (${SIDE_FA[w.side]}) جا افتاده است.`, { entry: i, account: w.account });
          continue;
        }
        okAcc++;
        if (g.amount === w.amount) okAmt++;
        else miss('WRONG_AMOUNT', skillOfAccount(w.account), `مبلغ «${accountName(w.account)}» درست نیست.`, { entry: i, account: w.account, expected: w.amount, given: g.amount });
        if (ACCOUNT[w.account]?.measure === 'weight') {
          wtN++;
          if (g.fine750 === w.fine750) wt++;
          else miss('WEIGHT_MISMATCH', 'weight', `معادل ۷۵۰ «${accountName(w.account)}» باید ${w.fine750} گرم باشد (وزن × عیار ÷ ۷۵۰، گرد به سه رقم).`, { entry: i, expected: w.fine750, given: g.fine750 });
        }
        if (w.parties.size) {
          parN++;
          if ([...w.parties].every((p) => g.parties.has(p))) par++;
          else miss('WRONG_PARTY', skillOfAccount(w.account), `طرف حساب «${accountName(w.account)}» باید «${[...w.parties].join('، ')}» باشد.`, { entry: i });
        }
      }
      for (const [k, g] of G) if (!W.has(k) && !W.has(`${g.account}|${g.side === 'dr' ? 'cr' : 'dr'}`)) miss(ACCOUNT[g.account] ? 'EXTRA_LINE' : 'UNKNOWN_ACCOUNT', skillOfAccount(g.account), `ردیف «${accountName(g.account)}» در این سند جایی ندارد.`, { entry: i, account: g.account });
      acc += W.size ? okAcc / W.size : 1;
      amo += W.size ? okAmt / W.size : 1;
      if (NEEDS_REF_KIND(we) && !ge.ref && !ge.memo) miss('MISSING_REFERENCE', 'settlement', `سند ${fa(i + 1)} باید به مدرک مرجع (${we.ref}) ارجاع دهد.`, { entry: i });
    });
    const n = Math.max(1, want.length);
    crit.balanced = bal / n;
    crit.accounts = acc / n;
    crit.amounts = amo / n;
    crit.weight = wtN ? wt / wtN : 1;
    crit.party = parN ? par / parN : 1;
    if (given.length > want.length) for (let k = want.length; k < given.length; k++) miss('EXTRA_ENTRY', 'journal', `سند ${fa(k + 1)} اضافه است.`);
    const extra = Math.max(0, given.length - want.length) * 0.1;
    for (const k of Object.keys(crit)) crit[k] = Math.max(0, crit[k] - extra);
  }
  let wsum = 0, ssum = 0;
  for (const [k, v] of Object.entries(crit)) {
    wsum += CRITERIA[k].weight;
    ssum += CRITERIA[k].weight * v;
  }
  const score = Math.round((ssum / wsum) * 1000) / 1000;
  // per skill: the scenario's skills share the score; a skill with its own mistakes gets less
  const skills = {};
  for (const s of scenario.skills) {
    const own = mistakes.filter((m) => m.skill === s).length;
    skills[s] = Math.max(0, Math.round((score - own * 0.15) * 1000) / 1000);
  }
  for (const m of mistakes) if (!(m.skill in skills)) skills[m.skill] = Math.max(0, Math.round((score - 0.3) * 1000) / 1000);
  return { score, correct: score >= 0.999, criteria: crit, mistakes, skills };
}
const NEEDS_REF_KIND = (e) => ['settle_customer', 'settle_supplier'].includes(e.kind) && !!e.ref;

/**
 * Hints in levels: 1 which accounts move, 2 which side each takes, 3 how each amount is computed (no figures),
 * 4 the full answer — only when asked for it.
 */
export function hint(scenario, level = 1) {
  const exp = scenario.hiddenExpectedResult;
  if (scenario.answerKind === 'decision') return level < 4 ? { level, text: 'پیش از هر فروش، معادل ۷۵۰ موجودی مصنوعات را با معادل ۷۵۰ قطعه مقایسه کنید.' } : { level, text: exp.decision === 'reject' ? 'رد: موجودی کافی نیست.' : 'ثبت: موجودی کافی است.', reveal: true };
  if (scenario.answerKind === 'findings') return level < 4 ? { level, text: ['هر سند را جدا جمع بزنید.', 'وزن × عیار ÷ ۷۵۰ را برای ردیف‌های موجودی دوباره حساب کنید.', 'مانده مشتری پیش از تسویه، سندهای تکراری و صندوق شمرده‌شده را ببینید.'][Math.min(2, level - 1)] } : { level, text: exp.findings.map((c) => RULES[c].fa).join('، '), reveal: true };
  const entries = exp.entries;
  const accounts = [...new Set(entries.flatMap((e) => e.lines.map((l) => l.account)))];
  if (level <= 1) return { level, text: `${entries.length > 1 ? `${fa(entries.length)} سند لازم است. ` : ''}حساب‌های درگیر: ${accounts.map(accountName).join('، ')}.` };
  if (level === 2) return { level, text: entries.map((e, i) => `${entries.length > 1 ? `سند ${fa(i + 1)}: ` : ''}${e.lines.map((l) => `${accountName(l.account)} ${SIDE_FA[side(l)]}`).join('، ')}`).join(' — ') };
  if (level === 3) return { level, text: formulas(scenario) };
  return { level, reveal: true, text: entries.map((e, i) => `${entries.length > 1 ? `سند ${fa(i + 1)}: ` : ''}${e.lines.map((l) => `${accountName(l.account)} ${SIDE_FA[side(l)]} ${fa(amt(l))}${l.fine750 ? ` (معادل ۷۵۰: ${l.fine750.toLocaleString('fa-IR')} گرم)` : ''}`).join('؛ ')}`).join(' — '), entries };
}
function formulas(s) {
  const t = s.expectedActions[0];
  const rows = ['معادل ۷۵۰ = وزن × عیار ÷ ۷۵۰، گرد به سه رقم؛ ارزش = معادل ۷۵۰ × قیمت گرم ۷۵۰.'];
  if (/sell|exchange|return|fix_sale/.test(t.type)) rows.push('سود = درصد سود × (ارزش طلا + اجرت)؛ مالیات = ۱۰٪ × (اجرت + سود)؛ بهای تمام‌شده = معادل ۷۵۰ فروخته‌شده × میانگین بهای هر گرم ۷۵۰ موجودی.');
  if (/settle/.test(t.type)) rows.push('تسویه از مانده حساب طرف کم می‌کند و هرگز بیشتر از مانده نیست.');
  if (/count|close/.test(t.type)) rows.push('مغایرت = شمارش − دفتر؛ کسری هزینه است و اضافه درآمد.');
  if (t.type === 'assay') rows.push('کاهش طلای خالص = وزن × (عیار اعلامی − عیار واقعی) ÷ ۷۵۰؛ به میانگین بهای موجودی.');
  if (/fix|reverse/.test(t.type)) rows.push('سند معکوس همان ردیف‌ها با جای بدهکار و بستانکار عوض‌شده است.');
  return rows.join(' ');
}

/** What an entry does, in words (deterministic): for the tutor's explanation after an attempt. */
export function explainEntry(entry, effect = null) {
  const e = normalizeEntry(entry);
  const parts = e.lines.map((l) => {
    const a = ACCOUNT[l.account];
    const up = (a.normal === 'dr') === (l.dr > 0);
    return `${a.fa} ${SIDE_FA[side(l)]} ${fa(amt(l))}${l.fine750 ? ` و ${l.fine750.toLocaleString('fa-IR')} گرم ۷۵۰ ${l.dr > 0 ? 'وارد موجودی' : 'خارج از موجودی'}` : ''} — یعنی ${a.fa} ${up ? 'زیاد' : 'کم'} می‌شود`;
  });
  const fx = effect ? [
    effect.cash ? `صندوق ${effect.cash > 0 ? '+' : ''}${fa(effect.cash)}` : null,
    effect.bank ? `بانک ${effect.bank > 0 ? '+' : ''}${fa(effect.bank)}` : null,
    effect.receivable ? `طلب از مشتریان ${effect.receivable > 0 ? '+' : ''}${fa(effect.receivable)}` : null,
    effect.payable ? `بدهی به تأمین‌کنندگان ${effect.payable > 0 ? '+' : ''}${fa(effect.payable)}` : null,
    effect.goldFine ? `طلای موجودی ${effect.goldFine > 0 ? '+' : '−'}${Math.abs(effect.goldFine).toLocaleString('fa-IR')} گرم ۷۵۰` : null,
    effect.vat ? `مالیات پرداختنی ${effect.vat > 0 ? '+' : ''}${fa(effect.vat)}` : null,
    effect.result ? `سود دوره ${effect.result > 0 ? '+' : ''}${fa(effect.result)}` : null,
  ].filter(Boolean) : [];
  return { lines: parts, effect: fx, text: `${parts.join('. ')}.${fx.length ? ` اثر روی دفتر: ${fx.join('، ')}.` : ''}` };
}

/** Recheck a weight dimension the way the kernel does (used by the UI as the trainee types). */
export const fineCheck = (grams, fineness) => (grams > 0 && fineness > 0 ? fine750Of(grams, fineness) : null);
