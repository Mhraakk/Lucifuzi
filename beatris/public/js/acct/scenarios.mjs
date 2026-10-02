// شبیه‌ساز سناریو (spec 0015): practical cases of a gold shop's counter. A scenario is reproducible from its id
// (template:seed:difficulty): the opening state is posted by the kernel, the task is a typed operation, and the
// hidden expected result is what the kernel computes for it — never what a model says it should be.
import { rng } from '../calc.mjs';
import { createBook, post, effects, fine750Of, inventory } from './kernel.mjs';
import { buildEntry, dailyClose } from './actions.mjs';
import { runAuditRules, RULES } from './auditrules.mjs';
import { DIFFICULTIES } from './skills.mjs';

const fmtN = (n) => Math.round(n).toLocaleString('fa-IR');
const fmtG = (g) => Number(g).toLocaleString('fa-IR', { maximumFractionDigits: 3 });
const PEOPLE = ['آقای کریمی', 'خانم نوری', 'آقای صادقی', 'خانم رحیمی', 'آقای مرادی', 'خانم کاظمی', 'آقای جعفری', 'خانم امینی'];
const SUPPLIERS = ['کارگاه ساخت آذین', 'بنکداری زرین', 'تولیدی مهرگان'];
export const CRITERIA = {
  balanced: { fa: 'سند متوازن است (جمع بدهکار = جمع بستانکار)', weight: 2 },
  accounts: { fa: 'حساب‌ها و طرف بدهکار/بستانکار درست است', weight: 3 },
  amounts: { fa: 'مبلغ هر ردیف درست است', weight: 3 },
  weight: { fa: 'وزن، عیار و معادل ۷۵۰ ردیف‌های موجودی درست است', weight: 2 },
  party: { fa: 'طرف حساب درست انتخاب شده است', weight: 1 },
  decision: { fa: 'تصمیم درست (ثبت یا رد)', weight: 4 },
  findings: { fa: 'یافته‌های حسابرسی درست شناسایی شده‌اند', weight: 4 },
};

/** Common opening state: capital, a stock of jewelry from a supplier, melted gold and coins. */
function opening(r, date, price) {
  const sup = SUPPLIERS[Math.floor(r() * SUPPLIERS.length)];
  return [
    { type: 'capital', date, amount: 20_000_000_000, pay: 'cash', key: 'open-capital' },
    { type: 'capital', date, amount: 10_000_000_000, pay: 'bank', key: 'open-bank' },
    { type: 'buy_supplier', date, party: sup, grams: 120, fineness: 750, price750: price, making: 60_000_000, pay: 'cash', key: 'open-jewelry' },
    { type: 'buy_melt', date, grams: 80, fineness: 740, price750: price, pay: 'cash', key: 'open-melt' },
    { type: 'buy_coin', date, qty: 10, unitPrice: Math.round(price * 10.6 / 10000) * 10000, coin: 'emami', pay: 'cash', key: 'open-coin' },
  ];
}

const T = (id, title, skills, diff, build) => ({ id, title, skills, diff, build });
/** Every template: build(r, level, ctx) → { setup: actions, task, context, answer: 'entry' | 'decision' | 'findings' } */
export const TEMPLATES = [
  T('buy_melt', 'خرید طلای آبشده', ['weight', 'inventory', 'cash'], [0, 1, 2], (r, lv, c) => {
    const grams = lv ? c.g(5, 60, 2) : c.g(10, 40, 0);
    const fin = c.pick(lv ? [705, 735, 740, 745, 900] : [750, 740]);
    const pay = lv >= 2 ? [{ method: 'cash', amount: c.round(valueEst(grams, fin, c.price) * 0.4) }, { method: 'bank', amount: null }] : 'cash';
    return { task: { type: 'buy_melt', grams, fineness: fin, price750: c.price, pay }, context: `${c.who} ${fmtG(grams)} گرم طلای آبشده عیار ${fmtN(fin)} آورده است. قیمت هر گرم ۷۵۰ امروز ${fmtN(c.price)} ریال است. ${lv >= 2 ? 'حدود ۴۰٪ را نقد و بقیه را با کارت به کارت از بانک می‌پردازید.' : 'مبلغ را نقد می‌پردازید.'} سند خرید را ثبت کنید.` };
  }),
  T('buy_from_customer', 'خرید طلای کهنه از مشتری', ['weight', 'customers', 'bank'], [1, 2], (r, lv, c) => {
    const grams = c.g(3, 25, 2);
    return { task: { type: 'buy_melt', grams, fineness: 750, price750: c.price - 2_000_000, party: c.who, product: 'used', pay: lv >= 2 ? 'credit' : 'bank' }, context: `${c.who} یک دستبند کهنه ${fmtG(grams)} گرمی عیار ۷۵۰ می‌فروشد. نرخ خرید کهنه هر گرم ۷۵۰، ${fmtN(c.price - 2_000_000)} ریال است. ${lv >= 2 ? 'پول را بعداً می‌پردازید (به حساب مشتری بستانکار شود).' : 'مبلغ از بانک واریز می‌شود.'}` };
  }),
  T('sell_jewelry', 'فروش مصنوعات', ['making', 'tax', 'inventory', 'cash'], [0, 1, 2, 3], (r, lv, c) => {
    const grams = c.g(3, 20, lv ? 2 : 0);
    const making = c.round(c.g(800_000, 3_000_000, 0) * grams);
    const pct = c.pick([5, 7, 10]);
    return { task: { type: 'sell_jewelry', party: c.who, grams, fineness: 750, price750: c.price, making, profitPct: pct, pay: 'cash' }, context: `به ${c.who} یک گردنبند ${fmtG(grams)} گرمی عیار ۷۵۰ می‌فروشید. قیمت هر گرم ۷۵۰، ${fmtN(c.price)} ریال، اجرت ساخت ${fmtN(making)} ریال و سود فروش ${fmtN(pct)}٪ (از ارزش طلا و اجرت) است. مالیات ۱۰٪ فقط روی اجرت و سود است. مشتری نقد می‌پردازد. سند فروش و بهای تمام‌شده را ثبت کنید.` };
  }),
  T('sell_to_customer', 'فروش به مشتری (نسیه و نقد)', ['customers', 'making', 'tax'], [1, 2, 3], (r, lv, c) => {
    const grams = c.g(4, 18, 2);
    const making = c.round(1_500_000 * grams);
    const cash = c.round(valueEst(grams, 750, c.price) * 0.5);
    return { task: { type: 'sell_jewelry', party: c.who, grams, fineness: 750, price750: c.price, making, profitPct: 7, pay: [{ method: 'cash', amount: cash }] }, context: `${c.who} انگشتری ${fmtG(grams)} گرمی (۷۵۰) می‌خرد: قیمت گرم ۷۵۰ ${fmtN(c.price)} ریال، اجرت ${fmtN(making)} ریال، سود ۷٪. ${fmtN(cash)} ریال نقد می‌دهد و بقیه به حسابش بدهکار می‌شود.` };
  }),
  T('discount', 'تخفیف', ['making', 'dc'], [1, 2], (r, lv, c) => {
    const grams = c.g(5, 15, 1);
    const making = c.round(1_200_000 * grams);
    const disc = c.round(c.g(2_000_000, 8_000_000, 0));
    return { task: { type: 'sell_jewelry', party: c.who, grams, fineness: 750, price750: c.price, making, profitPct: 7, discount: disc, pay: 'bank' }, context: `فروش ${fmtG(grams)} گرم مصنوعات ۷۵۰ به ${c.who}: گرم ۷۵۰ ${fmtN(c.price)}، اجرت ${fmtN(making)}، سود ۷٪. ${fmtN(disc)} ریال تخفیف می‌دهید (تخفیف حساب جدا دارد). وجه با کارتخوان به بانک می‌رود.` };
  }),
  T('making', 'اجرت ساخت بدون سود', ['making', 'tax'], [0, 1], (r, lv, c) => {
    const grams = c.g(2, 10, 1);
    const making = c.round(2_500_000 * grams);
    return { task: { type: 'sell_jewelry', party: c.who, grams, fineness: 750, price750: c.price, making, profit: 0, pay: 'cash' }, context: `گوشواره ${fmtG(grams)} گرمی (۷۵۰) با اجرت ${fmtN(making)} ریال و بدون سود به ${c.who} فروخته می‌شود؛ گرم ۷۵۰ ${fmtN(c.price)} ریال. نقد.` };
  }),
  T('commission', 'کمیسیون', ['dc', 'cash', 'tax'], [0, 2], (r, lv, c) => {
    const amt = c.round(c.g(5_000_000, 40_000_000, 0));
    return lv >= 2
      ? { task: { type: 'commission_earned', amount: amt, party: c.who, pay: 'cash' }, context: `قطعه امانی ${c.who} را فروختید و ${fmtN(amt)} ریال حق‌العمل می‌گیرید؛ مالیات ۱۰٪ حق‌العمل هم نقد دریافت می‌شود.` }
      : { task: { type: 'commission_paid', amount: amt, pay: 'cash' }, context: `به واسطه‌ای که مشتری آورده، ${fmtN(amt)} ریال کمیسیون نقد پرداخت می‌کنید.` };
  }),
  T('tax', 'مالیات بر ارزش افزوده', ['tax', 'making'], [1, 2, 3], (r, lv, c) => {
    const grams = c.g(6, 30, 2);
    const making = c.round(1_800_000 * grams);
    return { task: { type: 'sell_jewelry', party: c.who, grams, fineness: 750, price750: c.price, making, profitPct: 10, pay: 'bank' }, context: `فروش ${fmtG(grams)} گرم (۷۵۰)، اجرت ${fmtN(making)}، سود ۱۰٪، گرم ۷۵۰ ${fmtN(c.price)}. دقت کنید ارزش طلا معاف است و مالیات ۱۰٪ فقط بر اجرت و سود است. واریز به بانک.` };
  }),
  T('return', 'مرجوعی', ['making', 'tax', 'inventory', 'customers'], [2, 3], (r, lv, c) => {
    const sale = { type: 'sell_jewelry', party: c.who, grams: c.g(4, 12, 1), fineness: 750, price750: c.price, making: c.round(1_500_000 * 8), profitPct: 7, pay: 'cash', key: 'setup-sale' };
    return { setup: [sale], task: { type: 'return_sale', ref: '@setup-sale', pay: 'cash' }, context: `${c.who} کالایی را که امروز خریده بود (سند فروش «setup-sale») سالم پس می‌آورد. کل مبلغ، با مالیاتش، نقد برگردانده می‌شود و کالا به موجودی برمی‌گردد.` };
  }),
  T('exchange', 'تعویض', ['making', 'inventory', 'customers'], [3], (r, lv, c) => {
    const sale = { type: 'sell_jewelry', party: c.who, grams: 6, fineness: 750, price750: c.price, making: 9_000_000, profitPct: 7, pay: 'cash', key: 'setup-sale' };
    const g2 = c.g(7, 11, 1);
    return { setup: [sale], task: { type: 'exchange', ref: '@setup-sale', party: c.who, pay: 'cash', next: { grams: g2, fineness: 750, price750: c.price, making: c.round(1_600_000 * g2), profitPct: 7 } }, context: `${c.who} قطعه ۶ گرمی امروز را با قطعه ${fmtG(g2)} گرمی عوض می‌کند (اجرت ${fmtN(c.round(1_600_000 * g2))}، سود ۷٪، همان قیمت روز). مابه‌التفاوت نقد پرداخت می‌شود. یک سند تعویض ثبت کنید.` };
  }),
  T('prepayment', 'پیش‌دریافت', ['customers', 'cash'], [0, 2], (r, lv, c) => {
    const amt = c.round(c.g(50_000_000, 300_000_000, 0));
    return lv >= 2
      ? { setup: [{ type: 'prepayment', party: c.who, amount: amt, pay: 'cash', key: 'setup-pre' }], task: { type: 'sell_jewelry', party: c.who, grams: 9, fineness: 750, price750: c.price, making: 12_000_000, profitPct: 7, prepaymentUsed: amt, pay: 'cash' }, context: `${c.who} هفته پیش ${fmtN(amt)} ریال پیش‌پرداخت داده بود. امروز قطعه ۹ گرمی (۷۵۰، اجرت ۱۲٬۰۰۰٬۰۰۰، سود ۷٪، گرم ۷۵۰ ${fmtN(c.price)}) را می‌برد؛ پیش‌دریافت کسر و بقیه نقد گرفته می‌شود.` }
      : { task: { type: 'prepayment', party: c.who, amount: amt, pay: 'cash' }, context: `${c.who} برای سفارش ساخت، ${fmtN(amt)} ریال نقد پیش‌پرداخت می‌دهد. هنوز کالایی تحویل نشده است.` };
  }),
  T('settle_customer', 'تسویه مشتری', ['settlement', 'customers', 'bank'], [1, 2], (r, lv, c) => {
    const sale = { type: 'sell_jewelry', party: c.who, grams: 10, fineness: 750, price750: c.price, making: 15_000_000, profitPct: 7, pay: [{ method: 'cash', amount: 300_000_000 }], key: 'setup-sale' };
    const part = lv >= 2;
    return { setup: [sale], task: { type: 'settle_customer', party: c.who, amount: part ? 200_000_000 : null, pay: 'bank', ref: 'رسید بانکی ۴۴۲۱' }, context: `${c.who} از خرید قبلی به شما بدهکار است. ${part ? 'امروز ۲۰۰٬۰۰۰٬۰۰۰ ریال' : 'امروز کل بدهی‌اش را'} به حساب بانکی فروشگاه واریز می‌کند (رسید بانکی ۴۴۲۱).`, fill: part ? null : 'owed' };
  }),
  T('settle_supplier', 'تسویه تأمین‌کننده', ['settlement', 'suppliers', 'bank'], [1, 2], (r, lv, c) => {
    const sup = SUPPLIERS[0];
    const buy = { type: 'buy_supplier', party: sup, grams: 30, fineness: 750, price750: c.price, making: 30_000_000, pay: 'credit', key: 'setup-buy' };
    return { setup: [buy], task: { type: 'settle_supplier', party: sup, amount: null, pay: 'bank', ref: 'حواله ۱۸۹۰' }, context: `۳۰ گرم مصنوعات (۷۵۰) نسیه از «${sup}» خریده بودید. امروز کل بدهی را با حواله ۱۸۹۰ از بانک پرداخت می‌کنید.`, fill: 'owed-supplier' };
  }),
  T('cash_shortage', 'کسری صندوق', ['cash', 'recon'], [1, 2], (r, lv, c) => {
    const short = c.round(c.g(1_000_000, 30_000_000, 0));
    return { task: { type: 'cash_count', counted: `-${short}` }, context: `در شمارش پایان روز، صندوق ${fmtN(short)} ریال کمتر از دفتر است. علت پیدا نشده. سند اصلاحی را ثبت کنید.` };
  }),
  T('cash_overage', 'اضافه صندوق', ['cash', 'recon'], [1, 2], (r, lv, c) => {
    const over = c.round(c.g(500_000, 10_000_000, 0));
    return { task: { type: 'cash_count', counted: `+${over}` }, context: `در شمارش پایان روز، صندوق ${fmtN(over)} ریال بیشتر از دفتر است. سند اصلاحی را ثبت کنید.` };
  }),
  T('weight_mismatch', 'مغایرت وزن', ['weight', 'recon'], [2, 3], (r, lv, c) => {
    const lost = c.g(0.2, 1.5, 2);
    return { task: { type: 'weight_count', account: '1310', grams: null, fineness: 740, lose: lost }, context: `در توزین پایان روز، طلای آبشده (عیار ۷۴۰) ${fmtG(lost)} گرم کمتر از دفتر است. زیان مغایرت را به بهای میانگین موجودی ثبت کنید.` };
  }),
  T('purity_mismatch', 'مغایرت عیار', ['weight', 'recon'], [2, 3], (r, lv, c) => {
    const grams = c.g(10, 40, 2);
    const actual = c.pick([725, 730, 735]);
    return { setup: [{ type: 'buy_melt', grams, fineness: 740, price750: c.price, pay: 'cash', key: 'setup-melt' }], task: { type: 'assay', grams, declared: 740, actual }, context: `${fmtG(grams)} گرم آبشده با عیار اعلامی ۷۴۰ خریده شد. ری‌گیری عیار واقعی را ${fmtN(actual)} نشان داد. کاهش طلای خالص را به بهای میانگین موجودی، زیان مغایرت ثبت کنید.` };
  }),
  T('negative_inventory', 'موجودی منفی', ['inventory', 'weight'], [1, 2], (r, lv, c) => ({ task: { type: 'sell_jewelry', party: c.who, grams: 200, fineness: 750, price750: c.price, making: 100_000_000, profitPct: 7, pay: 'cash' }, context: `فروشنده می‌خواهد فروش ۲۰۰ گرم مصنوعات (۷۵۰) به ${c.who} را ثبت کند. پیش از ثبت، موجودی را بررسی کنید و تصمیم بگیرید: ثبت یا رد؟`, answer: 'decision' })),
  T('wrong_entry', 'ثبت اشتباه', ['journal', 'dc', 'tax'], [2, 3], (r, lv, c) => {
    const grams = 5;
    const wrong = { date: c.date, kind: 'sell_jewelry', key: 'setup-wrong', memo: 'فروش (اشتباه: مبلغ اجرت دو برابر ثبت شده)', manual: true, grams, making: 8_000_000 };
    return { setup: [wrong], task: { type: 'fix_sale', grams, making: 8_000_000 }, context: `سند فروش «setup-wrong» (۵ گرم، ۷۵۰، گرم ۷۵۰ ${fmtN(c.price)}) اجرت را به جای ۸٬۰۰۰٬۰۰۰ ریال، ۱۶٬۰۰۰٬۰۰۰ ثبت کرده و مالیاتش هم غلط شده است. سند قطعی پاک نمی‌شود: اول سند معکوس، سپس سند درست با اجرت ۸٬۰۰۰٬۰۰۰ و سود ۷٪ را ثبت کنید (نقد).` };
  }),
  T('correction', 'اصلاح سند', ['journal', 'dc'], [1, 2], (r, lv, c) => {
    const g1 = c.g(10, 20, 1);
    return { setup: [{ type: 'buy_melt', grams: g1 + 1, fineness: 740, price750: c.price, pay: 'cash', key: 'setup-wrong' }], task: { type: 'fix_melt', grams: g1 }, context: `خرید آبشده با وزن ${fmtG(g1 + 1)} گرم ثبت شده ولی وزن درست ${fmtG(g1)} گرم (عیار ۷۴۰، گرم ۷۵۰ ${fmtN(c.price)}، نقد) است. سند را با یک سند معکوس و یک سند درست اصلاح کنید.` };
  }),
  T('close_day', 'بستن روز', ['closing', 'cash', 'recon', 'trial'], [2, 3], (r, lv, c) => {
    const s1 = { type: 'sell_jewelry', party: c.who, grams: 7, fineness: 750, price750: c.price, making: 10_000_000, profitPct: 7, pay: 'cash', key: 'setup-day-1' };
    const s2 = { type: 'buy_melt', grams: 15, fineness: 740, price750: c.price, pay: 'cash', key: 'setup-day-2' };
    const short = c.round(c.g(2_000_000, 15_000_000, 0));
    return { setup: [s1, s2], task: { type: 'close', short }, context: `پایان روز: یک فروش و یک خرید آبشده ثبت شده است. صندوق شمرده‌شده ${fmtN(short)} ریال کمتر از دفتر است. سندهای لازم بستن روز را ثبت کنید.` };
  }),
  T('audit_challenge', 'چالش حسابرسی', ['audit', 'recon'], [3], (r, lv, c) => ({ task: { type: 'audit' }, context: 'دفتر روزنامه زیر را بررسی کنید و همه یافته‌های حسابرسی را علامت بزنید.', answer: 'findings' })),
];
export const TEMPLATE = Object.fromEntries(TEMPLATES.map((t) => [t.id, t]));

const valueEst = (g, f, p) => Math.round(fine750Of(g, f) * p);

/** The scenario of an id «template:seed:difficulty». Deterministic: the same id always builds the same case. */
export function buildScenario(id, { date = '2026-10-01' } = {}) {
  const [tid, seedS, diff] = String(id).split(':');
  const t = TEMPLATE[tid];
  if (!t) throw new Error(`سناریوی «${tid}» شناخته نیست.`);
  const level = Math.max(0, DIFFICULTIES.indexOf(diff));
  const r = rng(Number(seedS) || 1);
  const price = Math.round((78_000_000 + r() * 18_000_000) / 10000) * 10000;
  const c = {
    date, price, who: PEOPLE[Math.floor(r() * PEOPLE.length)],
    pick: (a) => a[Math.floor(r() * a.length)],
    g: (lo, hi, dec) => Math.round((lo + r() * (hi - lo)) * 10 ** dec) / 10 ** dec,
    round: (x) => Math.round(x / 10000) * 10000,
  };
  const spec = t.build(r, level, c);
  // the opening state and the scenario's own earlier documents, posted by the kernel
  let book = createBook();
  const keys = {};
  const postA = (a) => {
    const built = a.manual ? manualWrong(a, book, price) : buildEntry({ date, ...a }, book).entry;
    const res = post(book, built);
    book = res.book;
    if (a.key) keys[a.key] = res.entry.id;
    return res.entry;
  };
  for (const a of opening(r, date, price)) postA(a);
  for (const a of spec.setup ?? []) postA(a);
  const setupCount = book.entries.length;
  // the task, resolved against the book: «@key» references, «the whole debt», a counted cash or weight
  const task = resolveTask(spec.task, { book, keys, date, fill: spec.fill });
  const answer = spec.answer ?? 'entry';
  let expected;
  if (answer === 'decision') {
    let ok = true;
    try {
      buildEntry({ date, ...task }, book);
    } catch {
      ok = false;
    }
    expected = { decision: ok ? 'post' : 'reject', entries: [] };
  } else if (answer === 'findings') {
    const j = auditJournal(r, date, price);
    expected = { findings: [...new Set(runAuditRules(j.entries, j.ctx).map((f) => f.code))].sort(), journal: j.entries, ctx: j.ctx, entries: [] };
  } else expected = { entries: expectedEntries(task, book, date, price) };
  // effect of the expected entries on the book (for the tutor's explanation)
  let after = book;
  for (const e of expected.entries) after = post(after, e).book;
  const eff = expected.entries.length ? effects(book, expected.entries[0]) : null;
  return {
    id: `${tid}:${Number(seedS) || 1}:${DIFFICULTIES[level]}`,
    template: tid,
    title: t.title,
    difficulty: DIFFICULTIES[level],
    skills: t.skills,
    context: spec.context,
    date,
    price750: price,
    opening: book.entries.slice(0, setupCount).map((e) => ({ id: e.id, kind: e.kind, memo: e.memo, key: e.key ?? null, lines: e.lines })),
    answerKind: answer,
    journal: answer === 'findings' ? expected.journal : null,
    expectedActions: [task],
    hiddenExpectedResult: { ...expected, effects: eff?.delta ?? null, inventoryAfter: inventory(after) },
    evaluationCriteria: (answer === 'decision' ? ['decision'] : answer === 'findings' ? ['findings'] : ['balanced', 'accounts', 'amounts', 'weight', 'party']).map((k) => ({ id: k, ...CRITERIA[k] })),
    book,
  };
}

/** The view a trainee gets: everything except the answer. */
export const publicView = (s) => ({ id: s.id, template: s.template, title: s.title, difficulty: s.difficulty, skills: s.skills, context: s.context, date: s.date, price750: s.price750, opening: s.opening, answerKind: s.answerKind, journal: s.journal, evaluationCriteria: s.evaluationCriteria });

/** Which templates train a skill, at a difficulty that exists for them. */
export function templatesFor(skillId, difficulty) {
  const lv = DIFFICULTIES.indexOf(difficulty);
  const list = TEMPLATES.filter((t) => t.skills.includes(skillId));
  const fit = list.filter((t) => t.diff.includes(lv));
  return (fit.length ? fit : list).map((t) => ({ id: t.id, level: fit.length ? lv : nearest(t.diff, lv) }));
}
const nearest = (arr, lv) => arr.reduce((b, x) => (Math.abs(x - lv) < Math.abs(b - lv) ? x : b), arr[0]);

function resolveTask(task, { book, keys, date, fill }) {
  const t = { ...task };
  if (typeof t.ref === 'string' && t.ref.startsWith('@')) t.ref = keys[t.ref.slice(1)];
  if (t.type === 'settle_customer' && t.amount == null) t.amount = balanceFor(book, '1210', t.party);
  if (t.type === 'settle_supplier' && t.amount == null) t.amount = balanceFor(book, '2110', t.party);
  if (t.type === 'cash_count' && typeof t.counted === 'string') t.counted = balanceFor(book, '1110') + Number(t.counted);
  if (t.type === 'close') t.counted = balanceFor(book, '1110') - t.short;
  if (t.type === 'weight_count' && t.grams == null) {
    const x = inventory(book)[t.account];
    t.grams = Math.round(((x.fine750 * 750) / t.fineness - t.lose) * 100) / 100;
    delete t.lose;
  }
  if (t.type === 'fix_sale' || t.type === 'fix_melt') t.ref = keys['setup-wrong'];
  void fill;
  void date;
  return t;
}
function balanceFor(book, code, party) {
  let b = 0;
  for (const e of book.entries) for (const l of e.lines) if (l.account === code && (!party || l.party === party)) b += code.startsWith('1') ? l.dr - l.cr : l.cr - l.dr;
  return b;
}

/** The entries the kernel expects for a task (one, or a reversal followed by the correct one, or the day's close). */
function expectedEntries(task, book, date, price) {
  if (task.type === 'fix_sale' || task.type === 'fix_melt') {
    const rev = buildEntry({ date, type: 'reverse', ref: task.ref }, book).entry;
    const b2 = post(book, rev).book;
    const right = task.type === 'fix_sale'
      ? buildEntry({ date, type: 'sell_jewelry', party: book.entries.find((e) => e.id === task.ref).lines.find((l) => l.party)?.party, grams: task.grams, fineness: 750, price750: price, making: task.making, profitPct: 7, pay: 'cash' }, b2).entry
      : buildEntry({ date, type: 'buy_melt', grams: task.grams, fineness: 740, price750: price, pay: 'cash' }, b2).entry;
    return [rev, right];
  }
  if (task.type === 'close') return dailyClose(book, { date, cashCounted: task.counted }).proposals;
  return [buildEntry({ date, ...task }, book).entry];
}

/** A sale posted with a doubled making charge (and its VAT): a real mistake for the trainee to correct. */
function manualWrong(a, book, price) {
  const right = buildEntry({ date: a.date, type: 'sell_jewelry', party: 'آقای صادقی', grams: a.grams, fineness: 750, price750: price, making: a.making * 2, profitPct: 7, pay: 'cash' }, book).entry;
  return { ...right, key: a.key, memo: a.memo };
}

/** A small journal with planted faults, for the audit challenge (the faults vary with the seed). */
function auditJournal(r, date, price) {
  let book = createBook();
  const add = (a) => (book = post(book, buildEntry({ date, ...a }, book).entry).book);
  add({ type: 'capital', amount: 30_000_000_000, pay: 'bank' });
  add({ type: 'capital', amount: 3_000_000_000, pay: 'cash' });
  add({ type: 'buy_supplier', party: 'بنکداری زرین', grams: 50, fineness: 750, price750: price, making: 20_000_000, pay: 'bank' });
  add({ type: 'buy_melt', grams: 20, fineness: 740, price750: price, pay: 'cash' });
  add({ type: 'sell_jewelry', party: 'آقای کریمی', grams: 5, fineness: 750, price750: price, making: 7_000_000, profitPct: 7, pay: 'credit' });
  const entries = book.entries.map((e) => ({ ...e, lines: e.lines.map((l) => ({ ...l })) }));
  const faults = ['dup', 'weight', 'settle', 'unbalanced', 'ref', 'cash'].filter(() => r() < 0.6);
  if (faults.length < 2) faults.push('dup', 'cash');
  const last = entries[entries.length - 1];
  let n = entries.length;
  const id = () => `J${String(++n).padStart(5, '0')}`;
  if (faults.includes('dup')) entries.push({ ...last, id: id(), lines: last.lines.map((l) => ({ ...l })) });
  if (faults.includes('weight')) entries.push({ id: id(), date, kind: 'buy_melt', memo: 'خرید آبشده', lines: [{ account: '1310', dr: 160_000_000, cr: 0, grams: 2, fineness: 740, fine750: 2.1 }, { account: '1110', dr: 0, cr: 160_000_000 }] });
  if (faults.includes('settle')) entries.push({ id: id(), date, kind: 'settle_customer', ref: 'رسید ۱۲', memo: 'تسویه', lines: [{ account: '1110', dr: 9_000_000_000, cr: 0 }, { account: '1210', dr: 0, cr: 9_000_000_000, party: 'آقای کریمی' }] });
  if (faults.includes('unbalanced')) entries.push({ id: id(), date, kind: 'expense', memo: 'هزینه', lines: [{ account: '6190', dr: 5_000_000, cr: 0 }, { account: '1110', dr: 0, cr: 4_500_000 }] });
  if (faults.includes('ref')) entries.push({ id: id(), date, kind: 'settle_supplier', memo: 'پرداخت به تأمین‌کننده', lines: [{ account: '2110', dr: 1_000_000, cr: 0, party: 'بنکداری زرین' }, { account: '1110', dr: 0, cr: 1_000_000 }] });
  const cashBook = entries.reduce((s, e) => s + e.lines.filter((l) => l.account === '1110').reduce((t, l) => t + l.dr - l.cr, 0), 0);
  const ctx = faults.includes('cash') ? { cashCounted: cashBook - 3_000_000 } : {};
  return { entries, ctx };
}

export const FINDING_CHOICES = Object.entries(RULES).map(([code, r]) => ({ code, fa: r.fa }));
