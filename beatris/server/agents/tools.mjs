// ابزارهای عامل‌ها (spec 0015): the only things an agent can do, each with a typed input schema, a label, the
// capability it needs, and — for anything that touches the shop's real books — an approval that pauses the run
// until a manager (not the requester) decides. Training tools act only on the person's own sandbox books.
// Pattern from Open Dot's tool registry (label, describe → approval card, precheck), rebuilt on Beatris's books.
import { S, ENTRY } from './schema.mjs';
import { MEMORY_SCOPE } from '../agent-platform/runtime.mjs';
import { validateEntry } from '../../public/js/acct/kernel.mjs';
import { buildEntry, ACTION_TYPES } from '../../public/js/acct/actions.mjs';
import { parseLine } from '../../public/js/oneline.mjs';
import { LEAF_SKILLS, DIFFICULTIES } from '../../public/js/acct/skills.mjs';
import { TEMPLATE } from '../../public/js/acct/scenarios.mjs';
import { tehranDay } from '../tz.mjs';
import { MAZANEH_TO_G750 } from '../../public/js/calc.mjs';

const ACTION = S.obj({
  type: S.str({ enum: Object.keys(ACTION_TYPES) }),
  date: S.str({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' }),
  party: S.str({ maxLength: 120 }), product: S.str({ maxLength: 60 }), ref: S.str({ maxLength: 120 }), memo: S.str(),
  grams: S.num({ minimum: 0 }), fineness: S.num({ minimum: 0, maximum: 1000 }), price750: S.num({ minimum: 0 }),
  making: S.num({ minimum: 0 }), profitPct: S.num({ minimum: 0, maximum: 100 }), profit: S.num({ minimum: 0 }), discount: S.num({ minimum: 0 }),
  amount: S.num({ minimum: 0 }), counted: S.num({ minimum: 0 }), qty: S.int({ minimum: 0 }), unitPrice: S.num({ minimum: 0 }),
  declared: S.num({ minimum: 0 }), actual: S.num({ minimum: 0 }), account: S.str({ pattern: '^\\d{4}$' }), coin: S.str({ maxLength: 40 }),
  pay: { type: ['string', 'array'] }, prepaymentUsed: S.num({ minimum: 0 }),
}, ['type']);
const ID = S.str({ pattern: '^[A-Za-z0-9_:-]{4,80}$' });
const KEY = S.str({ pattern: '^[A-Za-z0-9:_-]{6,96}$' });
const fa = (n) => Math.round(Number(n) || 0).toLocaleString('fa-IR');

/** Map the one-line parser's understanding of a sentence to a typed accounting action (no model involved). */
export function intentToAction(text, { price750 = null } = {}) {
  const p = parseLine(text);
  const pay = p.pays?.length === 1 ? ({ cash: 'cash', pos: 'bank', c2c: 'bank', bank: 'bank' }[p.pays[0].method] ?? 'cash') : 'cash';
  const rial = (v) => (p.price?.unit === 'toman' ? v * 10 : v);
  const g750 = p.price?.basis === 'g750' ? rial(p.price.value) : p.price?.basis === 'mazaneh' ? Math.round(rial(p.price.value) / MAZANEH_TO_G750) : price750;
  const unit = p.price?.basis === 'unit' ? rial(p.price.value) : null;
  const party = p.party ?? undefined;
  if (p.kind === 'coin') return { type: p.mode === 'sell' ? 'sell_coin' : 'buy_coin', qty: p.count ?? 1, unitPrice: unit, pay, coin: p.coin, party };
  if (p.mode === 'buy') return { type: 'buy_melt', grams: p.weight, fineness: p.fineness ?? 750, price750: g750, pay, party };
  if (p.mode === 'sell') return { type: 'sell_jewelry', grams: p.weight, fineness: p.fineness ?? 750, price750: g750, pay, party };
  return null;
}

export function buildTools({ training, books }) {
  const T = training;
  const asSystem = (user) => user;
  return {
    /* ---------------- accounting (training kernel; deterministic) ---------------- */
    'accounting.validateEntry': {
      label: 'بررسی سند', input: S.obj({ entry: ENTRY, bookId: ID }, ['entry']),
      run: ({ entry, bookId }, ctx) => {
        const book = bookId ? T.store.load(T.bookView(ctx.user, bookId).id) : null;
        const v = validateEntry({ date: entry.date ?? tehranDay(), ...entry }, { book });
        return { ok: v.ok, errors: v.errors, totals: v.totals };
      },
    },
    'accounting.parseIntent': {
      label: 'فهم جمله اپراتور', input: S.obj({ text: S.str({ minLength: 2, maxLength: 400 }), price750: S.num({ minimum: 0 }) }, ['text']),
      run: ({ text, price750 }) => ({ action: intentToAction(text, { price750 }) }),
    },
    'accounting.proposeEntry': {
      label: 'ساخت سند از عملیات', input: S.obj({ action: ACTION, bookId: ID }, ['action', 'bookId']),
      run: ({ action, bookId }, ctx) => {
        const book = T.store.load(T.bookView(ctx.user, bookId).id);
        try {
          const { entry, calc } = buildEntry({ date: tehranDay(), ...action }, book);
          return { ok: true, entry, calc };
        } catch (e) {
          return { ok: false, error: e.message, code: e.code };
        }
      },
    },
    'accounting.postTrainingEntry': {
      label: 'ثبت در دفتر آموزشی', input: S.obj({ bookId: ID, entry: ENTRY, key: KEY }, ['bookId', 'entry', 'key']),
      run: ({ bookId, entry, key }, ctx) => {
        T.bookView(ctx.user, bookId); // only the person's own sandbox
        return T.store.postEntry(bookId, { date: tehranDay(), ...entry, key }, { operatorId: ctx.user.id });
      },
    },
    'accounting.getLedger': { label: 'دفتر کل', input: S.obj({ bookId: ID }), run: ({ bookId }, ctx) => T.bookView(ctx.user, bookId).ledger },
    'accounting.getTrialBalance': { label: 'تراز آزمایشی', input: S.obj({ bookId: ID }), run: ({ bookId }, ctx) => T.bookView(ctx.user, bookId).trial },
    'accounting.getInventory': { label: 'موجودی طلا', input: S.obj({ bookId: ID }), run: ({ bookId }, ctx) => T.bookView(ctx.user, bookId).inventory },
    'accounting.reconcileInventory': {
      label: 'مغایرت‌گیری موجودی', input: S.obj({ bookId: ID, counted: { type: 'object' } }),
      run: ({ bookId, counted }, ctx) => T.reconcile(ctx.user, bookId, counted),
    },
    /* ---------------- training ---------------- */
    'training.getProgress': { label: 'پیشرفت', input: S.obj({}), run: (_a, ctx) => T.progress(ctx.user) },
    'training.nextExercise': { label: 'انتخاب تمرین بعدی', input: S.obj({}), run: (_a, ctx) => T.progress(ctx.user).next },
    'training.createScenario': {
      label: 'ساخت سناریو',
      input: S.obj({ template: S.str({ enum: Object.keys(TEMPLATE) }), skillId: S.str({ enum: LEAF_SKILLS }), difficulty: S.str({ enum: DIFFICULTIES }), reason: S.str(), key: KEY }, []),
      run: (a, ctx) => T.createScenario(ctx.user, { ...a, assignedBy: ctx.origin === 'user' ? 'tutor' : ctx.origin }),
    },
    'training.evaluateAttempt': {
      label: 'ارزیابی پاسخ',
      input: S.obj({ scenarioId: ID, answer: S.obj({ entries: S.arr(ENTRY, { maxItems: 6 }), decision: S.str({ enum: ['post', 'reject'] }), findings: S.arr(S.str({ maxLength: 40 }), { maxItems: 20 }) }, []), key: KEY }),
      run: ({ scenarioId, answer, key }, ctx) => T.evaluate(ctx.user, scenarioId, answer, key),
    },
    'training.updateMastery': {
      label: 'به‌روزرسانی تسلط', input: S.obj({ skills: { type: 'object' }, key: KEY }),
      run: ({ skills, key }, ctx) => T.applyMastery(ctx.user.id, Object.fromEntries(Object.entries(skills).filter(([k, v]) => LEAF_SKILLS.includes(k) && typeof v === 'number' && v >= 0 && v <= 1)), key),
    },
    'training.explain': { label: 'توضیح سند', input: S.obj({ scenarioId: ID }), run: ({ scenarioId }, ctx) => T.explain(ctx.user, scenarioId) },
    'training.teamReport': { label: 'گزارش تیم', input: S.obj({}), cap: 'staff.view', run: () => T.team() },
    'memory.note': {
      label: 'یادداشت حافظه', input: S.obj({ kind: S.str({ enum: Object.keys(MEMORY_SCOPE) }), key: S.str({ maxLength: 80 }), value: {} }),
      run: ({ kind, key, value }, ctx) => (ctx.memory.set(ctx.user.id, kind, key, value), { ok: true }),
    },
    /* ---------------- audit (rules decide; the agent explains) ---------------- */
    'audit.runChecks': {
      label: 'اجرای قواعد حسابرسی', input: S.obj({ bookId: ID, scenarioId: ID }, []),
      run: (a, ctx) => T.runAudit(ctx.user, a),
    },
    'audit.explainFinding': { label: 'توضیح یافته', input: S.obj({ findingId: ID }), run: ({ findingId }, ctx) => T.explainFinding(ctx.user, findingId) },
    /* ---------------- the shop's real books: every one of these waits for a manager's approval ---------------- */
    'books.postDocument': {
      label: 'ثبت سند واقعی', cap: 'books.use', approver: 'books.admin', input: S.obj({ doc: { type: 'object' }, summary: S.str({ maxLength: 300 }) }),
      approval: ({ summary }) => `ثبت سند در دفاتر واقعی: ${summary}`,
      run: ({ doc }, ctx) => books.call('POST', '/api/books/docs', asSystem(ctx.user), { body: doc }),
    },
    'books.voidDocument': {
      label: 'ابطال سند واقعی', cap: 'books.use', approver: 'books.admin', input: S.obj({ id: ID, reason: S.str({ minLength: 3, maxLength: 300 }) }),
      approval: ({ id, reason }) => `ابطال سند ${id}: ${reason}`,
      run: ({ id, reason }, ctx) => books.call('POST', '/api/books/docs/:id/void', asSystem(ctx.user), { params: { id }, body: { reason } }),
    },
    'books.adjustInventory': {
      label: 'اصلاح موجودی واقعی', cap: 'books.admin', approver: 'books.admin', input: S.obj({ balances: S.arr(S.obj({ acct: S.str({ maxLength: 60 }), unit: S.str({ maxLength: 20 }), amt: S.num() }), { minItems: 1, maxItems: 20 }), reason: S.str({ minLength: 3 }) }),
      approval: ({ balances, reason }) => `اصلاح موجودی (${balances.map((b) => `${b.acct} ${fa(b.amt)} ${b.unit}`).join('، ')}): ${reason}`,
      run: ({ balances, reason }, ctx) => books.call('POST', '/api/books/docs', asSystem(ctx.user), { body: { type: 'adjust', note: reason, balances } }),
    },
    'books.changeSettings': {
      label: 'تغییر تنظیمات حسابداری', cap: 'books.admin', approver: 'books.admin', input: S.obj({ patch: { type: 'object' }, summary: S.str({ maxLength: 300 }) }),
      approval: ({ summary }) => `تغییر تنظیمات حسابداری: ${summary}`,
      run: ({ patch }, ctx) => books.call('PUT', '/api/books/settings', asSystem(ctx.user), { body: patch }),
    },
    'books.closePeriod': {
      label: 'بستن دوره حسابداری', cap: 'books.admin', approver: 'books.admin', input: S.obj({ month: S.str({ pattern: '^\\d{4}-\\d{2}$' }) }),
      approval: ({ month }) => `قفل و بستن دوره ${month}`,
      run: ({ month }, ctx) => books.call('POST', '/api/books/control/periods/lock', asSystem(ctx.user), { body: { month } }),
    },
    'books.listRecent': { label: 'سندهای اخیر', cap: 'books.use', input: S.obj({}), run: (_a, ctx) => books.call('GET', '/api/books/docs', ctx.user, { query: { limit: 10 } }) },
  };
}
export const REAL_TOOLS = ['books.postDocument', 'books.voidDocument', 'books.adjustInventory', 'books.changeSettings', 'books.closePeriod'];
