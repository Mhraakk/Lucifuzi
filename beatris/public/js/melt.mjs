// Melted-gold (آب‌شده) trading and bookkeeping: the arithmetic of the counter, the fixed patterns that make it
// fast, and a generator of realistic counter trades for the ledger trainer. Shared by browser, server and tests.
// Constants come from calc.mjs so every screen of the app agrees to the last digit.
import { MESGHAL_G, MAZANEH_FINENESS, MAZANEH_TO_G750, rng, fmt } from './calc.mjs';

/* ---------------- arithmetic ---------------- */
export const eq750 = (w, ayar) => (w * ayar) / 750; // grams of 18 k (750) equivalent
export const pureOf = (w, ayar) => (w * ayar) / 1000; // grams of pure gold
export const mesghalOf = (w) => w / MESGHAL_G;
export const gram18 = (maz) => maz / MAZANEH_TO_G750; // toman per gram of 750
export const valueOf = (w, ayar, maz) => eq750(w, ayar) * gram18(maz);
/** House rules of the ledger: grams to 3 decimals, money to the nearest thousand toman. */
export const r3 = (x) => Math.round(x * 1000) / 1000;
export const rT = (x) => Math.round(x / 1000) * 1000;
/** The ledger's own order of operations: round the 750-equivalent first, then price it. */
export const ledgerValue = (w, ayar, maz) => rT(r3(eq750(w, ayar)) * gram18(maz));

/** Coefficients a counter keeps in mind: 750-equivalent = weight × factor. */
export const AYAR_FACTORS = [705, 720, 730, 735, 740, 745, 750, 760, 900, 995, 999.9].map((ayar) => ({ ayar, factor: ayar / 750 }));

/** Fixed patterns: one formula per recurring question, always in the same order. */
export const PATTERNS = [
  { id: 'p-g18', title: 'مظنه ← قیمت گرم ۱۸', expr: 'گرم ۱۸ = مظنه ÷ ۴٫۳۳۱۸', quick: 'تقریب ذهنی: مظنه × ۰٫۲۳ (خطا کمتر از ۰٫۴٪)', check: 'وارسی: یک مثقال (۴٫۶۰۸۳ گرم) عیار ۷۰۵ دقیقاً یک مظنه می‌ارزد.' },
  { id: 'p-eq', title: 'قطعه ← معادل ۷۵۰', expr: 'معادل ۷۵۰ = وزن × عیار ÷ ۷۵۰', quick: 'ضریب ثابت هر عیار را حفظ کنید: ۷۴۰ → ۰٫۹۸۶۷ · ۷۴۵ → ۰٫۹۹۳۳ · ۷۰۵ → ۰٫۹۴ · ۹۰۰ → ۱٫۲', check: 'وارسی: عیار کمتر از ۷۵۰ یعنی معادل ۷۵۰ کمتر از وزن ترازو.' },
  { id: 'p-val', title: 'قطعه ← مبلغ', expr: 'مبلغ = معادل ۷۵۰ (گرد به ۳ رقم) × گرم ۱۸ ؛ سپس گرد به هزار تومان', quick: 'همیشه اول معادل ۷۵۰، بعد قیمت؛ هرگز عیار و مظنه را در یک ضرب قاطی نکنید.', check: 'وارسی: مبلغ ÷ وزن باید کمی کمتر از گرم ۱۸ باشد اگر عیار زیر ۷۵۰ است.' },
  { id: 'p-maz', title: 'میان‌بُر مستقیم از مظنه', expr: 'مبلغ = وزن × عیار × مظنه ÷ ۳۲۴۸٫۸۵', quick: '۳۲۴۸٫۸۵ = ۴٫۶۰۸۳ × ۷۰۵؛ برای حساب ذهنی سریع، نه برای ثبت دفتر.', check: 'نتیجه باید با روش دفتر حداکثر چند هزار تومان فرق کند.' },
  { id: 'p-assay', title: 'اختلاف ری‌گیری', expr: 'اختلاف ۷۵۰ = وزن × (عیار ری‌گیری − عیار اعلامی) ÷ ۷۵۰', quick: 'هر ۱ واحد عیار روی ۱۰۰ گرم = ۰٫۱۳۳ گرم ۷۵۰', check: 'اختلاف منفی یعنی طلای کمتر از ادعا؛ از حساب طلای مشتری کسر می‌شود.' },
  { id: 'p-settle', title: 'تسویه طلایی با پول', expr: 'گرم تسویه‌شده = مبلغ پرداختی ÷ گرم ۱۸ (با مظنه روز تسویه)', quick: 'مانده طلایی = بدهی طلایی − گرم تسویه‌شده', check: 'مانده هرگز منفی نیست مگر بیشتر از بدهی پرداخته باشید.' },
  { id: 'p-msq', title: 'گرم ↔ مثقال', expr: 'مثقال = گرم ÷ ۴٫۶۰۸۳ · گرم = مثقال × ۴٫۶۰۸۳', quick: '۱۰ مثقال ≈ ۴۶٫۰۸ گرم', check: 'مظنه قیمت یک مثقال ۷۰۵ است، نه یک گرم.' },
];

/* ---------------- counter trades for the ledger trainer ---------------- */
export const LEDGER_LEVELS = [
  { id: 1, label: 'خرید و فروش نقدی', kinds: ['buy', 'sell'] },
  { id: 2, label: 'ری‌گیری و نسیه', kinds: ['buy', 'sell', 'assay', 'credit'] },
  { id: 3, label: 'تسویه با بنکدار و ترکیبی', kinds: ['buy', 'sell', 'assay', 'credit', 'settle'] },
];
const roundTo = (x, step) => Math.round(x / step) * step;
const pick = (r, a) => a[Math.floor(r() * a.length)];
const T = (n) => `${fmt(Math.round(n))} تومان`;
const G = (n) => `${fmt(n, 3)} گرم`;

/**
 * One trade at the counter. Every field the operator must enter comes with its exact answer, tolerance and
 * the worked line. basePrice = the shop's reference price of one gram of 750 (sets a realistic mazaneh).
 * Signs: + gold = gold into the shop's stock; + cash = money into the till; customer balance + = customer owes.
 */
export function makeTrade(seed, level = 1, basePrice = 8500000) {
  const L = LEDGER_LEVELS.find((l) => l.id === level) ?? LEDGER_LEVELS[0];
  const r = rng(seed * 7 + level);
  r();
  const kind = pick(r, L.kinds);
  const maz = roundTo(basePrice * MAZANEH_TO_G750 * (0.9 + r() * 0.2), 10000);
  const spread = pick(r, [100000, 150000, 200000, 300000]);
  const buyMaz = maz - spread, sellMaz = maz + spread;
  const w = roundTo(3 + r() * 60, 0.01);
  const ayar = pick(r, [705, 720, 735, 740, 742, 745, 748, 750]);
  const f = (id, label, unit, answer, how, tol) => ({ id, label, unit, answer, how, tol: tol ?? (unit === 'گرم' ? 0.002 : Math.max(2000, Math.abs(answer) * 0.0005)) });
  const eq = r3(eq750(w, ayar));
  switch (kind) {
    case 'buy': {
      const g = gram18(buyMaz), value = rT(eq * g);
      return {
        kind, seed, level, title: 'خرید آب‌شده از مشتری (نقدی)',
        prompt: `مشتری یک قطعه آب‌شده ${fmt(w, 2)} گرمی با عیار ${fmt(ayar)} (ری‌گیری‌شده) می‌فروشد. مظنه خرید شما ${fmt(buyMaz)} تومان است. نقد پرداخت می‌کنید.`,
        given: { w, ayar, maz: buyMaz },
        fields: [
          f('eq', 'معادل ۷۵۰', 'گرم', eq, `${fmt(w, 2)} × ${fmt(ayar)} ÷ ۷۵۰ = ${G(eq)}`),
          f('value', 'مبلغ معامله', 'تومان', value, `${G(eq)} × (${fmt(buyMaz)} ÷ ۴٫۳۳۱۸ = ${T(g)}) = ${T(value)}`),
          f('gold', 'تغییر موجودی طلای مغازه (گرم ۷۵۰)', 'گرم', eq, 'طلا وارد مغازه شد: مثبت'),
          f('cash', 'تغییر صندوق (تومان)', 'تومان', -value, 'پول از صندوق رفت: منفی'),
        ],
      };
    }
    case 'sell': {
      const g = gram18(sellMaz), value = rT(eq * g);
      return {
        kind, seed, level, title: 'فروش آب‌شده به مشتری (نقدی)',
        prompt: `یک قطعه آب‌شده ${fmt(w, 2)} گرمی با عیار ${fmt(ayar)} می‌فروشید. مظنه فروش ${fmt(sellMaz)} تومان است. مشتری نقد می‌پردازد.`,
        given: { w, ayar, maz: sellMaz },
        fields: [
          f('eq', 'معادل ۷۵۰', 'گرم', eq, `${fmt(w, 2)} × ${fmt(ayar)} ÷ ۷۵۰ = ${G(eq)}`),
          f('value', 'مبلغ معامله', 'تومان', value, `${G(eq)} × (${fmt(sellMaz)} ÷ ۴٫۳۳۱۸ = ${T(g)}) = ${T(value)}`),
          f('gold', 'تغییر موجودی طلای مغازه (گرم ۷۵۰)', 'گرم', -eq, 'طلا از مغازه رفت: منفی'),
          f('cash', 'تغییر صندوق (تومان)', 'تومان', value, 'پول وارد صندوق شد: مثبت'),
        ],
      };
    }
    case 'assay': {
      const declared = pick(r, [740, 745, 750]);
      const measured = declared - pick(r, [2, 3, 5, 7, 8, 10, 12]);
      const eqD = r3(eq750(w, declared)), eqM = r3(eq750(w, measured));
      const diff = r3(eqM - eqD);
      const g = gram18(buyMaz), value = rT(eqM * g);
      return {
        kind, seed, level, title: 'ری‌گیری: عیار واقعی کمتر از ادعا',
        prompt: `مشتری قطعه ${fmt(w, 2)} گرمی را «عیار ${fmt(declared)}» معرفی کرده؛ ری‌گیری ${fmt(measured)} داده است. با مظنه خرید ${fmt(buyMaz)} تومان و بر پایه عیار ری‌گیری می‌خرید.`,
        given: { w, declared, measured, maz: buyMaz },
        fields: [
          f('eq', 'معادل ۷۵۰ (با عیار ری‌گیری)', 'گرم', eqM, `${fmt(w, 2)} × ${fmt(measured)} ÷ ۷۵۰ = ${G(eqM)}`),
          f('diff', 'اختلاف با ادعا (گرم ۷۵۰)', 'گرم', diff, `${G(eqM)} − ${G(eqD)} = ${G(diff)} (منفی: کمتر از ادعا)`),
          f('value', 'مبلغ پرداختی', 'تومان', value, `${G(eqM)} × ${T(g)} = ${T(value)}`),
        ],
      };
    }
    case 'credit': {
      const g = gram18(sellMaz), value = rT(eq * g);
      const paid = roundTo(value * (0.3 + r() * 0.5), 1000000);
      return {
        kind, seed, level, title: 'فروش نسیه (پرداخت بخشی از مبلغ)',
        prompt: `قطعه آب‌شده ${fmt(w, 2)} گرمی عیار ${fmt(ayar)} را با مظنه فروش ${fmt(sellMaz)} تومان می‌فروشید. مشتری اکنون ${fmt(paid)} تومان می‌پردازد و بقیه را بدهکار می‌شود.`,
        given: { w, ayar, maz: sellMaz, paid },
        fields: [
          f('eq', 'معادل ۷۵۰', 'گرم', eq, `${fmt(w, 2)} × ${fmt(ayar)} ÷ ۷۵۰ = ${G(eq)}`),
          f('value', 'مبلغ کل معامله', 'تومان', value, `${G(eq)} × ${T(g)} = ${T(value)}`),
          f('cash', 'تغییر صندوق (تومان)', 'تومان', paid, 'فقط مبلغ پرداخت‌شده وارد صندوق می‌شود'),
          f('due', 'بدهی ریالی مشتری', 'تومان', value - paid, `${T(value)} − ${T(paid)} = ${T(value - paid)}`),
        ],
      };
    }
    case 'settle': {
      const debt = roundTo(20 + r() * 180, 0.001);
      const g = gram18(maz);
      const pay = roundTo(debt * g * (0.35 + r() * 0.5), 1000000);
      const settled = r3(pay / g), left = r3(debt - settled);
      return {
        kind, seed, level, title: 'تسویه بخشی از بدهی طلایی به بنکدار با پول',
        prompt: `مغازه ${fmt(debt, 3)} گرم ۷۵۰ به بنکدار بدهکار است. امروز ${fmt(pay)} تومان با مظنه ${fmt(maz)} تومان تسویه می‌کنید.`,
        given: { debt, pay, maz },
        fields: [
          f('settled', 'گرم ۷۵۰ تسویه‌شده', 'گرم', settled, `${T(pay)} ÷ (${fmt(maz)} ÷ ۴٫۳۳۱۸ = ${T(g)}) = ${G(settled)}`),
          f('left', 'مانده بدهی طلایی', 'گرم', left, `${G(debt)} − ${G(settled)} = ${G(left)}`),
          f('cash', 'تغییر صندوق (تومان)', 'تومان', -pay, 'پول از صندوق رفت: منفی'),
        ],
      };
    }
    default:
      throw new Error('unknown trade kind');
  }
}

/** Grade one entry: returns per-field { ok, answer } and whether everything was right. */
export function gradeTrade(trade, values) {
  const res = {};
  let all = true;
  for (const fl of trade.fields) {
    const v = Number(values[fl.id]);
    const ok = Number.isFinite(v) && Math.abs(v - fl.answer) <= fl.tol;
    res[fl.id] = { ok, answer: fl.answer };
    if (!ok) all = false;
  }
  return { fields: res, correct: all };
}
