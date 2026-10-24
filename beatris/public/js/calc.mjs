// Beatris — shared domain math (used by browser UI, server and tests).
// Units: weight in grams, prices in Toman, density in g/cm³, lengths in mm.

export const MESGHAL_G = 4.6083; // one mesghal in grams
export const MAZANEH_FINENESS = 705; // Iranian مظنه is quoted for 705-fine molten gold
export const MAZANEH_TO_G750 = (MESGHAL_G * MAZANEH_FINENESS) / 750; // ≈ 4.3318
export const MAZANEH_TO_G1000 = (MESGHAL_G * MAZANEH_FINENESS) / 1000; // ≈ 3.2489

export const KARATS = [
  { karat: 24, fineness: 999, use: 'شمش و طلای خالص' },
  { karat: 22, fineness: 916, use: 'زیورآلات حاشیه خلیج فارس و هند' },
  { karat: 21, fineness: 875, use: 'زیورآلات عربی' },
  { karat: 18, fineness: 750, use: 'استاندارد زیورآلات ایران و اروپا' },
  { karat: 14, fineness: 585, use: 'رایج در آمریکا و اروپا' },
  { karat: 9, fineness: 375, use: 'رایج در بریتانیا' },
];

// Approximate densities (g/cm³). Real values depend on the exact alloy recipe.
export const ALLOYS = [
  { id: 'au24', label: '۲۴ عیار', fineness: 999, density: 19.3, color: [1.0, 0.8, 0.36] },
  { id: 'au22', label: '۲۲ عیار', fineness: 916, density: 17.8, color: [1.0, 0.77, 0.38] },
  { id: 'au21', label: '۲۱ عیار', fineness: 875, density: 17.2, color: [0.99, 0.76, 0.4] },
  { id: 'au18y', label: '۱۸ عیار زرد', fineness: 750, density: 15.5, color: [0.97, 0.75, 0.44] },
  { id: 'au18r', label: '۱۸ عیار رز', fineness: 750, density: 15.1, color: [0.95, 0.63, 0.53] },
  { id: 'au18w', label: '۱۸ عیار سفید', fineness: 750, density: 15.9, color: [0.87, 0.87, 0.85] },
  { id: 'au14y', label: '۱۴ عیار زرد', fineness: 585, density: 13.4, color: [0.93, 0.76, 0.5] },
  { id: 'ag925', label: 'نقره ۹۲۵', fineness: 0, density: 10.4, color: [0.94, 0.94, 0.94] },
  { id: 'pt950', label: 'پلاتین ۹۵۰', fineness: 0, density: 20.5, color: [0.84, 0.85, 0.87] },
];
export const alloyById = (id) => ALLOYS.find((a) => a.id === id) ?? ALLOYS[3];

export const COINS = [
  { id: 'full', label: 'سکه تمام بهار آزادی', weight: 8.133, fineness: 900 },
  { id: 'half', label: 'نیم سکه', weight: 4.0665, fineness: 900 },
  { id: 'quarter', label: 'ربع سکه', weight: 2.03325, fineness: 900 },
];

const FA = '۰۱۲۳۴۵۶۷۸۹';
const AR = '٠١٢٣٤٥٦٧٨٩';
function num(v) {
  if (typeof v === 'number') return v;
  const s = String(v ?? '')
    .replace(/[۰-۹]/g, (d) => String(FA.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(AR.indexOf(d)))
    .replace(/٫/g, '.')
    .replace(/[−–]/g, '-')
    .replace(/[,٬\s]/g, '');
  return s === '' ? NaN : Number(s);
}
export const parseNum = (v) => {
  const n = num(v);
  return Number.isFinite(n) ? n : NaN;
};

export const g750FromMazaneh = (mazaneh) => num(mazaneh) / MAZANEH_TO_G750;
export const mazanehFromG750 = (p750) => num(p750) * MAZANEH_TO_G750;
export const pricePerGramAt = (p750, fineness) => (num(p750) * num(fineness)) / 750;
export const pureGold = (weight, fineness) => (num(weight) * num(fineness)) / 1000;

/** Price of a molten-gold (آب‌شده) piece from its assay fineness and today's مظنه. */
export const moltenPiecePrice = (weight, fineness, mazaneh) =>
  num(weight) * (num(fineness) / MAZANEH_FINENESS) * (num(mazaneh) / MESGHAL_G);

/**
 * Retail invoice for a finished piece (Iranian market convention).
 * VAT applies only to making charge + seller profit; the gold itself is exempt.
 */
export function invoice({ weight, p750, fineness = 750, ojratMode = 'percent', ojrat = 0, profitPct = 7, vatPct = 10 }) {
  const w = num(weight);
  const goldValue = w * pricePerGramAt(num(p750), fineness);
  const o = num(ojrat) || 0;
  const ojratAmount = ojratMode === 'percent' ? (goldValue * o) / 100 : ojratMode === 'perGram' ? w * o : o;
  const profit = ((goldValue + ojratAmount) * num(profitPct)) / 100;
  const taxable = ojratAmount + profit;
  const vat = (taxable * num(vatPct)) / 100;
  const total = goldValue + ojratAmount + profit + vat;
  return { goldValue, ojrat: ojratAmount, profit, taxable, vat, total };
}

/** Buying back used gold: value of the gold content minus the shop's declared deduction. No VAT. */
export function buyback({ weight, p750, testedFineness = 750, deductPct = 0, nonGoldWeight = 0 }) {
  const net = Math.max(0, num(weight) - (num(nonGoldWeight) || 0));
  const gross = net * pricePerGramAt(num(p750), num(testedFineness));
  const deduction = (gross * (num(deductPct) || 0)) / 100;
  return { netWeight: net, gross, deduction, payout: gross - deduction };
}

export const coinIntrinsic = (coin, p750) => coin.weight * pricePerGramAt(num(p750), coin.fineness);

/** Hydrostatic (Archimedes) density. Weights in grams. */
export function densityFromWeighing(airWeight, waterWeight, waterDensity = 0.9982) {
  const a = num(airWeight);
  const w = num(waterWeight);
  if (!(a > 0) || !(w >= 0) || a <= w) return NaN;
  return (a * waterDensity) / (a - w);
}

/**
 * Estimate the fineness of a yellow Au-Ag-Cu alloy from its density (mass-fraction mixing).
 * Indication only: stones, hollows, solder and tungsten break the assumption.
 */
export function finenessFromDensity(rho, rhoAu = 19.32, rhoRest = 9.66) {
  const r = num(rho);
  if (!(r > 0)) return NaN;
  const x = (1 / r - 1 / rhoRest) / (1 / rhoAu - 1 / rhoRest);
  return Math.max(0, Math.min(1000, x * 1000));
}
export function nearestKarat(fineness) {
  let best = KARATS[0];
  for (const k of KARATS) if (Math.abs(k.fineness - fineness) < Math.abs(best.fineness - fineness)) best = k;
  return best;
}

/** Ring sizes. ISO 8653 size = inner circumference in mm. US: d = 11.63 + 0.8128·size. */
export function ringFromCircumference(c) {
  const circ = num(c);
  const d = circ / Math.PI;
  return { iso: circ, diameter: d, us: (d - 11.63) / 0.8128 };
}
export const ringFromDiameter = (d) => ringFromCircumference(num(d) * Math.PI);
export const ringFromUS = (us) => ringFromDiameter(11.63 + 0.8128 * num(us));

export const weightInOtherAlloy = (weight, fromDensity, toDensity) => (num(weight) * num(toDensity)) / num(fromDensity);

/* ---------- workshop mathematics (the rare part of the trade) ---------- */

/**
 * Change the fineness of a melt by adding metal of fineness `addFineness`.
 * Returns grams to add (x) and the new total weight. Lowering: add master alloy (fineness 0).
 * Raising: add pure gold (999.9). Mass balance: (w·f + x·fa) / (w + x) = target.
 */
export function alloyAdjust({ weight, fineness, target, addFineness }) {
  const w = num(weight), f = num(fineness), t = num(target);
  const fa = addFineness ?? (t < f ? 0 : 999.9);
  if (!(w > 0) || !(t > 0) || t === fa || (t - f) * (fa - t) < 0) return { add: NaN, total: NaN, addFineness: fa };
  const add = (w * (t - f)) / (fa - t);
  return { add, total: w + add, addFineness: fa, pureBefore: (w * f) / 1000, pureAfter: ((w + add) * t) / 1000 };
}

export const WAX_DENSITY = 0.95; // g/cm³, typical carving/injection wax
export const RESIN_DENSITY = 1.12; // g/cm³, castable photopolymer
/** Metal weight of a casting from its wax (or resin) model weight. sprue = extra fraction for sprue and button. */
export function waxToMetal({ waxWeight, metalDensity, modelDensity = WAX_DENSITY, sprue = 0.35 }) {
  const metal = (num(waxWeight) * num(metalDensity)) / num(modelDensity);
  return { metal, melt: metal * (1 + num(sprue)), ratio: num(metalDensity) / num(modelDensity) };
}

/** Plating: mass (g) of a layer = area (cm²) × thickness (µm → cm) × density. */
export const PLATING = { rhodium: 12.41, gold: 19.32, palladium: 12.02, silver: 10.49 };
export function platingMass({ areaCm2, microns, density }) {
  return num(areaCm2) * num(microns) * 1e-4 * num(density);
}

/**
 * Estimated carat weight from millimetre measurements (industry formulas for diamond),
 * scaled by specific gravity for other stones. L = length, W = width, D = depth (mm).
 */
export const STONE_FACTORS = {
  round: { k: 0.0061, label: 'برلیان گرد (قطر² × عمق)' },
  oval: { k: 0.0062, label: 'بیضی' },
  princess: { k: 0.0083, label: 'پرنسس / مربعی' },
  emerald: { k: 0.0092, label: 'زمردی (نسبت ~۱٫۵)' },
  cushion: { k: 0.0081, label: 'کوسن' },
  pear: { k: 0.0059, label: 'اشکی' },
  marquise: { k: 0.00565, label: 'مارکیز' },
  heart: { k: 0.0059, label: 'قلب' },
};
export function stoneCarat({ cut = 'round', L, W, D, sg = 3.52 }) {
  const f = STONE_FACTORS[cut] ?? STONE_FACTORS.round;
  const l = num(L), d = num(D);
  const w = cut === 'round' ? l : num(W);
  return f.k * l * w * d * (num(sg) / 3.52);
}

/** Metal to add (positive) or remove (negative) when resizing a band. Sizes as ISO circumference (mm). */
export function resizeMetal({ fromSize, toSize, width, thickness, density }) {
  const dc = num(toSize) - num(fromSize);
  const grams = (dc * num(width) * num(thickness) * num(density)) / 1000;
  return { deltaMm: dc, grams };
}

/** Length of round wire (mm) obtainable from a weight; and sheet area (mm²) for a given thickness. */
export function wireLength({ weight, diameter, density }) {
  const r = num(diameter) / 2;
  return ((num(weight) / num(density)) * 1000) / (Math.PI * r * r);
}
export function sheetArea({ weight, thickness, density }) {
  return ((num(weight) / num(density)) * 1000) / num(thickness);
}

/* ---------- formatting ---------- */
export const faDigits = (s) => String(s).replace(/\d/g, (d) => FA[Number(d)]);
export function fmt(n, digits = 0) {
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('fa-IR', { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(n);
}
export const fmtT = (n) => (Number.isFinite(n) ? `${fmt(Math.round(n))} تومان` : '—');

/* ---------- practice drill generator (deterministic per seed) ---------- */
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}
const pick = (r, a) => a[Math.floor(r() * a.length)];
const roundTo = (x, step) => Math.round(x / step) * step;

export const DRILL_KINDS = {
  invoice: 'قیمت نهایی فاکتور',
  mazaneh: 'مظنه به گرم ۱۸',
  pure: 'طلای خالص قطعه',
  buyback: 'خرید طلای مستعمل',
  coin: 'ارزش ذاتی سکه',
  density: 'چگالی از وزن در آب',
  ring: 'سایز انگشتر',
  eq750: 'آب‌شده: معادل ۷۵۰',
  melt: 'آب‌شده: مبلغ با مظنه',
  assay: 'آب‌شده: اختلاف ری‌گیری',
  mesghal: 'گرم به مثقال',
};
/** Everything the server may record as a practice result (drills page kinds + interactive labs). */
export const RECORD_KINDS = { ...DRILL_KINDS, coinauth: 'تشخیص سکه اصل و تقلبی', sealauth: 'بازرسی پلمپ سکه', ledger: 'تمرین‌گر دفتر آب‌شده' };

export function makeDrill(kind, seed, basePrice = 8500000) {
  const r = rng(seed);
  r();
  const p750 = roundTo(basePrice * (0.85 + r() * 0.3), 10000);
  switch (kind) {
    case 'invoice': {
      const weight = roundTo(1.5 + r() * 18, 0.01);
      const ojrat = pick(r, [7, 10, 12, 15, 18, 20, 25]);
      const res = invoice({ weight, p750, ojrat, profitPct: 7, vatPct: 10 });
      return {
        kind,
        prompt: `وزن ${fmt(weight, 2)} گرم، قیمت هر گرم ۱۸ عیار ${fmt(p750)} تومان، اجرت ${fmt(ojrat)}٪، سود ۷٪، مالیات ۱۰٪ فقط بر اجرت و سود. مبلغ نهایی فاکتور؟`,
        answer: res.total,
        tol: 0.003,
        unit: 'تومان',
        steps: [
          ['ارزش طلا', res.goldValue],
          ['اجرت', res.ojrat],
          ['سود', res.profit],
          ['مالیات', res.vat],
        ],
      };
    }
    case 'mazaneh': {
      const m = roundTo(p750 * MAZANEH_TO_G750, 10000);
      return { kind, prompt: `مظنه ${fmt(m)} تومان است. قیمت هر گرم طلای ۱۸ عیار؟`, answer: g750FromMazaneh(m), tol: 0.003, unit: 'تومان', steps: [['مظنه ÷ ۴٫۳۳۱۸', g750FromMazaneh(m)]] };
    }
    case 'pure': {
      const k = pick(r, KARATS.slice(1));
      const weight = roundTo(2 + r() * 30, 0.01);
      return { kind, prompt: `قطعه ${fmt(k.karat)} عیار (${fmt(k.fineness)} هزارم) به وزن ${fmt(weight, 2)} گرم. چند گرم طلای خالص دارد؟`, answer: pureGold(weight, k.fineness), tol: 0.002, unit: 'گرم', steps: [['وزن × هزارم ÷ ۱۰۰۰', pureGold(weight, k.fineness)]] };
    }
    case 'buyback': {
      const weight = roundTo(3 + r() * 25, 0.01);
      const f = pick(r, [700, 720, 735, 740, 745, 750]);
      const d = pick(r, [0, 1, 2]);
      const res = buyback({ weight, p750, testedFineness: f, deductPct: d });
      return {
        kind,
        prompt: `طلای مستعمل ${fmt(weight, 2)} گرم، عیار سنجیده‌شده ${fmt(f)}، قیمت گرم ۱۸ عیار ${fmt(p750)} تومان، کسر اعلام‌شده فروشگاه ${fmt(d)}٪. مبلغ پرداختی به مشتری؟`,
        answer: res.payout,
        tol: 0.003,
        unit: 'تومان',
        steps: [
          ['ارزش طلا به عیار سنجیده', res.gross],
          ['کسر', res.deduction],
        ],
      };
    }
    case 'coin': {
      const c = pick(r, COINS);
      return { kind, prompt: `ارزش ذاتی ${c.label} (${fmt(c.weight, 3)} گرم، عیار ۹۰۰) با قیمت گرم ۱۸ عیار ${fmt(p750)} تومان؟`, answer: coinIntrinsic(c, p750), tol: 0.003, unit: 'تومان', steps: [['وزن × ۹۰۰ ÷ ۷۵۰ × قیمت گرم', coinIntrinsic(c, p750)]] };
    }
    case 'density': {
      const f = pick(r, [585, 750, 875, 916]);
      const rho = 1 / (f / 1000 / 19.32 + (1 - f / 1000) / 9.66);
      const air = roundTo(4 + r() * 20, 0.01);
      const water = roundTo(air - (air * 0.9982) / rho, 0.01);
      const d = densityFromWeighing(air, water);
      return { kind, prompt: `وزن قطعه در هوا ${fmt(air, 2)} گرم و در آب ${fmt(water, 2)} گرم است. چگالی تقریبی چند گرم بر سانتی‌متر مکعب است؟`, answer: d, tol: 0.02, unit: 'g/cm³', steps: [['وزن هوا × ۰٫۹۹۸ ÷ (هوا − آب)', d], ['هزارم تخمینی', finenessFromDensity(d)]] };
    }
    case 'eq750': {
      const w = roundTo(3 + r() * 80, 0.01);
      const a = pick(r, [705, 720, 735, 740, 742, 745, 748, 900]);
      const eq = Math.round(((w * a) / 750) * 1000) / 1000;
      return { kind, prompt: `قطعه آب‌شده ${fmt(w, 2)} گرم با عیار ${fmt(a)}. معادل ۷۵۰ آن چند گرم است؟ (تا سه رقم اعشار)`, answer: eq, tol: 0.0003, unit: 'گرم', steps: [['وزن × عیار ÷ ۷۵۰', eq]] };
    }
    case 'melt': {
      const w = roundTo(3 + r() * 60, 0.01);
      const a = pick(r, [720, 735, 740, 742, 745, 750]);
      const m = roundTo(p750 * MAZANEH_TO_G750, 10000);
      const eq = Math.round(((w * a) / 750) * 1000) / 1000;
      const value = Math.round((eq * (m / MAZANEH_TO_G750)) / 1000) * 1000;
      return { kind, prompt: `قطعه آب‌شده ${fmt(w, 2)} گرم عیار ${fmt(a)} با مظنه ${fmt(m)} تومان. مبلغ طبق قاعده دفتر (معادل ۷۵۰ تا سه رقم، سپس گرد به هزار تومان)؟`, answer: value, tol: 0.0005, unit: 'تومان', steps: [['معادل ۷۵۰', eq], ['گرم ۱۸ = مظنه ÷ ۴٫۳۳۱۸', m / MAZANEH_TO_G750], ['مبلغ', value]] };
    }
    case 'assay': {
      const w = roundTo(10 + r() * 190, 0.01);
      const d = pick(r, [740, 745, 750]);
      const mm = d - pick(r, [2, 3, 4, 5, 6, 8, 10]);
      const diff = Math.round(((w * (d - mm)) / 750) * 1000) / 1000;
      return { kind, prompt: `قطعه ${fmt(w, 2)} گرمی «عیار ${fmt(d)}» معرفی شده و ری‌گیری ${fmt(mm)} داده است. چند گرم ۷۵۰ کمتر از ادعاست؟`, answer: diff, tol: 0.004, unit: 'گرم', steps: [['وزن × اختلاف عیار ÷ ۷۵۰', diff]] };
    }
    case 'mesghal': {
      const w = roundTo(2 + r() * 120, 0.01);
      return { kind, prompt: `${fmt(w, 2)} گرم چند مثقال است؟`, answer: w / MESGHAL_G, tol: 0.001, unit: 'مثقال', steps: [['گرم ÷ ۴٫۶۰۸۳', w / MESGHAL_G]] };
    }
    case 'ring': {
      const d = roundTo(15 + r() * 6, 0.1);
      return { kind, prompt: `قطر داخلی انگشتر ${fmt(d, 1)} میلی‌متر است. سایز ISO (محیط داخلی به میلی‌متر) چند است؟`, answer: d * Math.PI, tol: 0.012, unit: 'mm', steps: [['قطر × π', d * Math.PI]] };
    }
    default:
      throw new Error('unknown drill kind');
  }
}

export function checkNumeric(answer, expected, tol) {
  const a = num(answer);
  if (!Number.isFinite(a)) return false;
  const diff = Math.abs(a - expected);
  return diff <= Math.abs(expected) * tol || diff <= 1e-9;
}
