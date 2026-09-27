// Coin authentication domain model — shared by the browser (coin lab, 3D) and the server/tests.
// Weights and fineness of Bahar Azadi / Emami coins are the Central Bank figures used across this app
// (see calc.mjs COINS). Diameters are approximate teaching values: always compare with a reference coin.
import { rng } from './calc.mjs';

export const RHO = { au: 19.32, ag: 10.49, cu: 8.96, brass: 8.5, steel: 7.85, tungsten: 19.25, lead: 11.34, solder: 8.4 };

/** Mass-fraction mixing (ideal): 1/ρ = Σ wᵢ/ρᵢ. Good to about ±1 % for gold alloys. */
export function mixDensity(parts) {
  let inv = 0, sum = 0;
  for (const [w, rho] of parts) {
    inv += w / rho;
    sum += w;
  }
  return sum / inv;
}
/** Gold–copper coin alloy (Iranian coins are gold with copper). fineness in ‰. */
export const coinAlloyDensity = (fineness) => mixDensity([[fineness / 1000, RHO.au], [1 - fineness / 1000, RHO.cu]]);
/** 18 k jewellery gold (Au 75, Ag 12.5, Cu 12.5). */
export const RHO_750 = mixDensity([[0.75, RHO.au], [0.125, RHO.ag], [0.125, RHO.cu]]);

export const COIN_TYPES = {
  // Old design (Bahar Azadi) was struck 1358–1370; the Emami design from 1370 onwards.
  emami: { label: 'تمام امامی (طرح جدید)', short: 'تمام امامی', weight: 8.133, fineness: 900, diameter: 22, obv: 'cameo', rev: 'shrine', legal: true },
  bahar: { label: 'تمام بهار آزادی (طرح قدیم)', short: 'تمام طرح قدیم', weight: 8.133, fineness: 900, diameter: 22, obv: 'words', rev: 'shrine', legal: true },
  half: { label: 'نیم سکه', short: 'نیم', weight: 4.0665, fineness: 900, diameter: 19, obv: 'cameo', rev: 'shrine', legal: true },
  quarter: { label: 'ربع سکه', short: 'ربع', weight: 2.03325, fineness: 900, diameter: 16, obv: 'cameo', rev: 'shrine', legal: true },
  quarterOld: { label: 'ربع سکه طرح قدیم', short: 'ربع قدیم', weight: 2.03325, fineness: 900, diameter: 16, obv: 'words', rev: 'shrine', legal: true },
  gerami: { label: 'سکه گرمی', short: 'گرمی', weight: 1.01, fineness: 900, diameter: 13.3, obv: 'words', rev: 'rosette', legal: true },
  parsian: { label: 'سکه پارسیان یک گرمی (غیررسمی، ۱۸ عیار)', short: 'پارسیان', weight: 1.0, fineness: 750, diameter: 14, obv: 'parsian', rev: 'rosette', legal: false },
};
for (const c of Object.values(COIN_TYPES)) {
  c.density = c.fineness === 750 ? RHO_750 : coinAlloyDensity(c.fineness);
  c.pure = (c.weight * c.fineness) / 1000;
  c.volume = c.weight / c.density; // cm³
  const area = (Math.PI * (c.diameter / 2) ** 2) / 100; // cm²
  c.thickness = (c.volume / area) * 10 * 1.12; // mm at the rim; the field sits lower than the rim
  c.reeds = Math.round(c.diameter * Math.PI * 2.2);
}

/** Specimen kinds: the genuine coin and the counterfeits a gallery actually meets. */
export const SPECIMENS = {
  genuine: {
    label: 'اصل (ضرب بانک)',
    level: 0,
    tell: 'وزن، ابعاد، چگالی، صدا، دندانه‌ها و جزئیات نقش همه با مرجع می‌خوانند.',
  },
  brass: {
    label: 'روکش طلا روی برنج',
    level: 1,
    tell: 'با همان ابعاد، تقریباً نصف وزن دارد؛ چگالی حدود ۸٫۵. صدای ضربه کوتاه‌تر و بم‌تر است.',
  },
  steel: {
    label: 'روکش طلا روی فولاد',
    level: 1,
    tell: 'آهنربا آن را جذب می‌کند؛ وزن بسیار کم است. طلا و مس آهنربایی نیستند.',
  },
  lowkarat: {
    label: 'عیار پایین (۱۸ به جای ۹۰۰)',
    level: 1,
    tell: 'هم‌اندازه ولی حدود ۱۰٪ سبک‌تر؛ رنگ زردتر و کم‌سرخی. XRF عیار ۷۵۰ نشان می‌دهد.',
  },
  shaved: {
    label: 'تراشیده / سوهان‌خورده',
    level: 2,
    tell: 'فلز اصل است اما از لبه برداشته‌اند: قطر کمتر، وزن کمتر و دندانه‌های کم‌عمق و نامنظم.',
  },
  cast: {
    label: 'ریخته‌گری (قالبی)',
    level: 2,
    tell: 'جزئیات نرم و بی‌لبه، حفره‌های ریز زیر ذره‌بین، خط درز روی لبه و عیار معمولاً کمتر.',
  },
  plugged: {
    label: 'سوراخ و پرشده',
    level: 2,
    tell: 'حلقه ریزی در زمینه نقش دیده می‌شود که رنگ و براقی متفاوت دارد؛ صدا خفه و وزن کمی کم است.',
  },
  tungsten: {
    label: 'مغزی تنگستن با پوسته طلا',
    level: 3,
    tell: 'وزن و ابعاد تقریباً درست‌اند و XRF هم فریب می‌خورد؛ چگالی کمی بالاتر از مرجع و صدای ضربه خفه لو می‌دهد. تأیید نهایی با آزمایشگاه.',
  },
  wrongdie: {
    label: 'ضرب غیررسمی (طلا اما با قالب تقلبی)',
    level: 3,
    tell: 'فلز و وزن نزدیک به اصل است، اما شمار دانه‌های حاشیه، قلم نوشته‌ها و شمار دندانه لبه با مرجع نمی‌خواند. ارزش آن فقط وزن طلاست، نه قیمت سکه.',
  },
};

/** Expected water weight of a solid piece (hydrostatic weighing). */
export const waterWeight = (air, density, water = 0.9982) => air - (air * water) / density;

/**
 * Generate the measurable properties of a specimen deterministically from a seed.
 * Instruments: 0.001 g scale, 0.01 mm caliper.
 */
export function makeSpecimen(coinId, kind, seed = 1) {
  const c = COIN_TYPES[coinId];
  if (!c || !SPECIMENS[kind]) throw new Error('unknown coin or specimen');
  const r = rng(seed * 7919 + coinId.length * 31 + kind.length);
  const jitter = (a) => (r() * 2 - 1) * a;
  let density = c.density, dScale = 1, volScale = 1, magnetic = false, xrf = c.fineness, elements = ['طلا', 'مس'];
  let ring = { f0: 4200 * (22 / c.diameter), decay: 1.6, dull: false }, reeds = { count: c.reeds, depth: 1, regular: true };
  const look = { soft: 0, pores: 0, plug: false, seam: false, beads: 72, font: 'Markazi', tint: 0 };
  switch (kind) {
    case 'brass':
      density = mixDensity([[0.985, RHO.brass], [0.015, RHO.au]]);
      xrf = 950;
      elements = ['طلا', 'مس', 'روی (از زیر لایه)'];
      ring = { ...ring, f0: ring.f0 * 0.82, decay: 0.55 };
      look.tint = 0.12;
      break;
    case 'steel':
      density = mixDensity([[0.985, RHO.steel], [0.015, RHO.au]]);
      magnetic = true;
      xrf = 940;
      elements = ['طلا', 'آهن (از زیر لایه)', 'نیکل'];
      ring = { ...ring, f0: ring.f0 * 1.1, decay: 0.8 };
      look.tint = 0.08;
      break;
    case 'lowkarat':
      density = RHO_750;
      xrf = 750;
      elements = ['طلا', 'نقره', 'مس'];
      ring = { ...ring, decay: 1.2 };
      look.tint = 0.18;
      break;
    case 'shaved':
      dScale = 1 - 0.26 / c.diameter;
      volScale = dScale ** 2 * 0.985;
      reeds = { count: c.reeds, depth: 0.3, regular: false };
      break;
    case 'cast':
      density = coinAlloyDensity(875) * 0.985; // lower fineness and porosity
      volScale = 0.995;
      xrf = 875;
      ring = { ...ring, decay: 0.7 };
      Object.assign(look, { soft: 1, pores: 1, seam: true });
      reeds = { count: c.reeds, depth: 0.7, regular: false };
      break;
    case 'plugged':
      volScale = 0.988;
      density = mixDensity([[0.985, c.density], [0.015, RHO.solder]]);
      ring = { ...ring, decay: 0.35, dull: true };
      look.plug = true;
      break;
    case 'tungsten':
      density = mixDensity([[0.13, RHO.tungsten], [0.87, c.density]]); // tuned so the weight still reads right
      volScale = 0.985;
      ring = { ...ring, f0: ring.f0 * 0.9, decay: 0.18, dull: true };
      break;
    case 'wrongdie':
      density = coinAlloyDensity(900);
      volScale = 1.004;
      reeds = { count: c.reeds - 12, depth: 1, regular: true };
      Object.assign(look, { beads: 60, font: 'Vazirmatn' });
      break;
  }
  const weight = c.volume * volScale * density + jitter(kind === 'genuine' ? 0.004 : 0.01);
  const diameter = c.diameter * dScale + jitter(0.015);
  const thickness = c.thickness * (volScale / dScale ** 2) + jitter(0.01);
  const w = Math.round(weight * 1000) / 1000;
  const water = Math.round(waterWeight(w, density) * 1000) / 1000;
  return {
    coinId,
    kind,
    seed,
    weight: w,
    diameter: Math.round(diameter * 100) / 100,
    thickness: Math.round(thickness * 100) / 100,
    airWeight: w,
    waterWeight: water,
    density: (w * 0.9982) / (w - water),
    magnetic,
    xrf: { fineness: xrf, elements },
    ring,
    reeds,
    look,
  };
}

/** Compare a specimen with its reference: returns red flags (empty = consistent with genuine). */
export function assessCoin(s) {
  const c = COIN_TYPES[s.coinId];
  const flags = [];
  const dw = s.weight - c.weight;
  if (Math.abs(dw) > Math.max(0.02, c.weight * 0.004)) flags.push({ key: 'weight', text: `وزن ${dw > 0 ? 'بیشتر' : 'کمتر'} از مرجع (${(dw > 0 ? '+' : '') + dw.toFixed(3)} گرم)` });
  if (Math.abs(s.diameter - c.diameter) > 0.12) flags.push({ key: 'diameter', text: `قطر ${(s.diameter - c.diameter).toFixed(2)} میلی‌متر با مرجع فرق دارد` });
  if (Math.abs(s.density - c.density) > 0.3) flags.push({ key: 'density', text: `چگالی ${s.density.toFixed(2)} به جای حدود ${c.density.toFixed(2)}` });
  if (s.magnetic) flags.push({ key: 'magnet', text: 'آهنربا جذبش می‌کند' });
  if (s.ring.decay < 1) flags.push({ key: 'ring', text: s.ring.dull ? 'صدای ضربه خفه و کوتاه' : 'طنین صدا کوتاه‌تر از مرجع' });
  if (Math.abs(s.xrf.fineness - c.fineness) > 15 || s.xrf.elements.some((e) => /زیر لایه|آهن|نیکل|روی/.test(e))) flags.push({ key: 'xrf', text: `XRF: عیار سطح ${s.xrf.fineness}، عناصر ${s.xrf.elements.join('، ')}` });
  if (!s.reeds.regular || s.reeds.depth < 0.8 || s.reeds.count !== c.reeds) flags.push({ key: 'reeds', text: s.reeds.count !== c.reeds ? `شمار دندانه لبه ${s.reeds.count} به جای ${c.reeds}` : 'دندانه‌های لبه کم‌عمق یا نامنظم' });
  if (s.look.soft || s.look.pores || s.look.seam) flags.push({ key: 'detail', text: 'جزئیات نرم، حفره ریز یا خط درز قالب' });
  if (s.look.plug) flags.push({ key: 'plug', text: 'اثر حلقه پرشده روی زمینه نقش' });
  if (s.look.beads !== 72 || s.look.font !== 'Markazi') flags.push({ key: 'die', text: 'شمار دانه‌های حاشیه یا قلم نوشته با مرجع نمی‌خواند' });
  return flags;
}

/** Game levels: which counterfeit kinds may appear. Genuine coins always appear too. */
export const LEVELS = [
  { id: 1, label: 'مبتدی', kinds: ['genuine', 'brass', 'steel', 'lowkarat'] },
  { id: 2, label: 'حرفه‌ای', kinds: ['genuine', 'lowkarat', 'shaved', 'cast', 'plugged'] },
  { id: 3, label: 'خبره', kinds: ['genuine', 'shaved', 'cast', 'plugged', 'tungsten', 'wrongdie'] },
];
export function pickSpecimen(level, seed) {
  const L = LEVELS.find((l) => l.id === level) ?? LEVELS[0];
  const r = rng(seed);
  const coins = Object.keys(COIN_TYPES).filter((k) => k !== 'parsian');
  const coinId = coins[Math.floor(r() * coins.length)];
  const kind = r() < 0.34 ? 'genuine' : L.kinds[1 + Math.floor(r() * (L.kinds.length - 1))];
  return makeSpecimen(coinId, kind, seed);
}

/* ============================================================================
 * Probability engine — "how sure can I be?"
 *
 * Hypotheses h (a counterfeit kind, or a seal-fraud scenario) have a prior P(h) for the context.
 * Each test looks for one anomaly. a = P(anomaly present | h). The test itself is imperfect in the
 * field: sens = P(flag | anomaly), fp = P(flag | no anomaly). So
 *     P(flag | h) = a·sens + (1 − a)·fp
 * and, with tests independent given h, the posterior is exact Bayes:
 *     P(h | E) ∝ P(h) · Π P(eₜ | h).
 * Priors and anomaly rates are teaching assumptions (editable in the lab), not market statistics.
 * ========================================================================== */

export const pFlag = (a, acc) => a * acc.sens + (1 - a) * acc.fp;

/** Exact posterior. prior: {h: p}; lik(h, test) = P(flag | h); evidence: {test: true|false}. */
export function bayes(prior, lik, evidence = {}) {
  const post = {};
  let z = 0;
  for (const h of Object.keys(prior)) {
    let p = prior[h];
    for (const [t, flag] of Object.entries(evidence)) {
      const q = lik(h, t);
      p *= flag ? q : 1 - q;
    }
    post[h] = p;
    z += p;
  }
  for (const h of Object.keys(post)) post[h] = z > 0 ? post[h] / z : 0;
  return post;
}

const H2 = (p) => (p <= 0 || p >= 1 ? 0 : -(p * Math.log2(p) + (1 - p) * Math.log2(1 - p)));

/**
 * Rank the untried tests by expected information about the question that matters at the counter:
 * "genuine or not" (binary entropy of P(fraud), in bits). Also returns what P(fraud) would become.
 */
export function rankTests(prior, lik, evidence, tests, safe) {
  const cur = bayes(prior, lik, evidence);
  const f0 = 1 - cur[safe];
  const out = [];
  for (const t of tests) {
    if (t in evidence) continue;
    let pf = 0;
    for (const h of Object.keys(cur)) pf += cur[h] * lik(h, t);
    const ifFlag = 1 - bayes(cur, lik, { [t]: true })[safe];
    const ifClear = 1 - bayes(cur, lik, { [t]: false })[safe];
    out.push({ test: t, pFlag: pf, ifFlag, ifClear, gain: H2(f0) - pf * H2(ifFlag) - (1 - pf) * H2(ifClear) });
  }
  return out.sort((a, b) => b.gain - a.gain);
}

/** Classic two-hypothesis Bayes (used in lessons): P(fraud | result). */
export function binaryPosterior(prior, sens, fp, flagged = true) {
  const a = prior * (flagged ? sens : 1 - sens);
  const b = (1 - prior) * (flagged ? fp : 1 - fp);
  // a result the model calls impossible (e.g. certainty met by contradicting evidence) carries no usable information
  return a + b > 0 ? a / (a + b) : prior;
}
/** Likelihood ratios of a test: LR+ = sens / fp, LR− = (1 − sens) / (1 − fp). */
export const likelihoodRatios = (sens, fp) => ({ pos: sens / fp, neg: (1 - sens) / (1 - fp) });

/** Decision bands on P(fraud). */
export const DECISION = [
  { max: 0.01, key: 'accept', label: 'قابل پذیرش', note: 'احتمال تقلب زیر ۱٪؛ با مستندسازی معامله کنید.' },
  { max: 0.25, key: 'more', label: 'آزمون بیشتر', note: 'هنوز مطمئن نیستید؛ آزمون پیشنهادی بعدی را انجام دهید.' },
  { max: 1.01, key: 'reject', label: 'رد یا ارجاع', note: 'نرخ پلمپ یا سکه را ندهید؛ تأیید آزمایشگاهی لازم است.' },
];
export const decide = (pFraud) => (Number.isFinite(pFraud) ? DECISION.find((d) => pFraud < d.max) : DECISION[1]);

/** Rescale a prior so the non-safe hypotheses sum to `rate`, keeping their mix. */
export function withFraudRate(prior, safe, rate) {
  const rest = 1 - prior[safe];
  const out = {};
  for (const [h, p] of Object.entries(prior)) out[h] = h === safe ? 1 - rate : rest > 0 ? (p / rest) * rate : 0;
  return out;
}

/* ---------------- unsealed coins ---------------- */

/** Field accuracy of each bench tool (sens, fp). Water weighing loses precision on small coins. */
export const COIN_TESTS = {
  scale: { label: 'ترازوی ۰٫۰۰۱', flags: ['weight'], sens: 0.99, fp: 0.01, cost: 1 },
  caliper: { label: 'کولیس', flags: ['diameter'], sens: 0.95, fp: 0.03, cost: 1 },
  magnet: { label: 'آهنربا', flags: ['magnet'], sens: 0.99, fp: 0.002, cost: 1 },
  edge: { label: 'نمای لبه', flags: ['reeds'], sens: 0.85, fp: 0.05, cost: 1 },
  ring: { label: 'صدای ضربه', flags: ['ring'], sens: 0.75, fp: 0.1, cost: 1 },
  loupe: { label: 'ذره‌بین', flags: ['detail', 'plug', 'die'], sens: 0.8, fp: 0.05, cost: 2 },
  water: { label: 'وزن در آب', flags: ['density'], sens: 0.9, fp: 0.05, cost: 3 },
  xrf: { label: 'XRF سطح', flags: ['xrf'], sens: 0.95, fp: 0.03, cost: 4 },
};
export function coinTestAccuracy(test, coinId) {
  const t = COIN_TESTS[test];
  if (test !== 'water') return t;
  const w = COIN_TYPES[coinId].weight;
  return w >= 4 ? t : w >= 2 ? { ...t, sens: 0.8, fp: 0.08 } : { ...t, sens: 0.65, fp: 0.12 };
}
/** Which tests raise a flag on this specimen (the reading a careful operator would see). */
export function coinEvidence(s, tests = Object.keys(COIN_TESTS)) {
  const keys = new Set(assessCoin(s).map((f) => f.key));
  const ev = {};
  for (const t of tests) ev[t] = COIN_TESTS[t].flags.some((k) => keys.has(k));
  return ev;
}

/** Anomaly matrix a[kind][test] for one coin type, measured by running the simulator (cached). */
const anomalyCache = new Map();
export function coinAnomalies(coinId, samples = 24) {
  const key = `${coinId}:${samples}`;
  if (anomalyCache.has(key)) return anomalyCache.get(key);
  const A = {};
  for (const kind of Object.keys(SPECIMENS)) {
    const row = Object.fromEntries(Object.keys(COIN_TESTS).map((t) => [t, 0]));
    for (let seed = 1; seed <= samples; seed++) {
      const ev = coinEvidence(makeSpecimen(coinId, kind, seed));
      for (const t of Object.keys(row)) row[t] += ev[t] ? 1 : 0;
    }
    for (const t of Object.keys(row)) row[t] /= samples;
    A[kind] = row;
  }
  anomalyCache.set(key, A);
  return A;
}
export function coinLikelihood(coinId) {
  const A = coinAnomalies(coinId);
  return (kind, test) => pFlag(A[kind][test], coinTestAccuracy(test, coinId));
}

/** Priors for a coin brought to the counter without a seal. */
export const COIN_CONTEXTS = {
  counter: { label: 'مشتری حضوری، سکه بدون پلمپ', prior: { genuine: 0.9, brass: 0.015, steel: 0.01, lowkarat: 0.015, shaved: 0.02, cast: 0.015, plugged: 0.01, tungsten: 0.005, wrongdie: 0.01 } },
  unknown: { label: 'فروشنده ناشناس یا آنلاین', prior: { genuine: 0.75, brass: 0.04, steel: 0.03, lowkarat: 0.04, shaved: 0.03, cast: 0.03, plugged: 0.02, tungsten: 0.03, wrongdie: 0.03 } },
};
/** The exact prior the coin game draws from at a level (pickSpecimen: 34 % genuine, rest uniform). */
export function levelPrior(level) {
  const L = LEVELS.find((l) => l.id === level) ?? LEVELS[0];
  const fakes = L.kinds.filter((k) => k !== 'genuine');
  return Object.fromEntries(Object.keys(SPECIMENS).map((k) => [k, k === 'genuine' ? 0.34 : fakes.includes(k) ? 0.66 / fakes.length : 0]));
}

/* ---------------- sealed packs ---------------- */

export const SEAL_TYPES = {
  bank: {
    label: 'پلمپ بانکی',
    header: '#1b2a4a',
    tare: 2.4,
    coins: ['emami', 'half', 'quarter', 'gerami'],
    inquiry: 'سریال و کد را خودتان در درگاه رسمی بانک مرکزی وارد کنید؛ نه از QR یا شماره روی بسته.',
    serial: { sens: 0.97, fp: 0.005 },
    scenarios: ['S0', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6'],
  },
  exchange: {
    label: 'پلمپ صرافی',
    header: '#1f4a3a',
    tare: 2.1,
    coins: ['emami', 'bahar', 'half', 'quarter', 'quarterOld', 'gerami'],
    inquiry: 'با شماره رسمی صرافی که خودتان از منبع مستقل پیدا کرده‌اید تماس بگیرید و سریال را بپرسید.',
    serial: { sens: 0.85, fp: 0.02 },
    scenarios: ['S0', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6'],
  },
  maker: {
    label: 'بسته تولیدکننده (پارسیان)',
    header: '#5a1f2a',
    tare: 1.6,
    coins: ['parsian'],
    inquiry: 'کد بسته را فقط از مسیر رسمی استعلام تولیدکننده/سازمان استاندارد بررسی کنید.',
    serial: { sens: 0.9, fp: 0.01 },
    scenarios: ['S0', 'S1', 'S3', 'S5', 'S6'],
  },
};

export const SEAL_SCENARIOS = {
  S0: { label: 'بسته اصل و دست‌نخورده', short: 'سالم', tell: 'همه نشانه‌ها با مرجع هم‌خوان است؛ باز هم استعلام رسمی را فراموش نکنید.' },
  S1: { label: 'بسته جعلی با سکه تقلبی', short: 'بسته و سکه جعلی', tell: 'هولوگرام چاپی، ایراد چاپ و سریالی که در سامانه نیست؛ سکه داخل معمولاً سبک است.' },
  S2: { label: 'بسته جعلی روی سکه اصل غیربانکی', short: 'بسته جعلی، سکه اصل', tell: 'سکه طلای درست است اما بسته را جعل کرده‌اند تا با نرخ بالاتر پلمپ بفروشند. وزن بسته درست است؛ هولوگرام و استعلام لو می‌دهند.' },
  S3: { label: 'بسته اصل باز و دوباره بسته‌شده، سکه عوض‌شده با تقلبی', short: 'بازپلمپ + تقلبی', tell: 'هولوگرام و سریال اصل‌اند و استعلام «معتبر» می‌گوید! لبه پرس دوبل، رد چسب، تورم و وزن کل بسته آن را لو می‌دهد.' },
  S4: { label: 'بسته اصل بازپلمپ‌شده، سکه اصلِ ارزان‌تر', short: 'بازپلمپ + سکه ارزان‌تر', tell: 'سکه داخل طلاست اما همان نیست که کارت می‌گوید (مثلاً طرح قدیم به جای امامی، پارسیان به جای گرمی یا سکه کوچک‌تر). تطبیق کارت با سکه و لبه پرس کلید است.' },
  S5: { label: 'بسته کپی با سریال یک بسته اصل (سریال تکراری)', short: 'سریال کلون', tell: 'سریال از یک بسته واقعی کپی شده؛ استعلام ممکن است «ثبت‌شده» بگوید اما سابقه استعلام تکراری یا مشخصات ناهمخوان نشان می‌دهد.' },
  S6: { label: 'بسته جعلی با QR یا لینک استعلام قلابی', short: 'استعلام قلابی', tell: 'QR روی بسته به سایت جعلی می‌رود که همیشه «اصل» می‌گوید. فقط درگاه رسمی که خودتان وارد می‌کنید معتبر است.' },
};

/** Seal tests, one anomaly each. sens/fp: field accuracy of a trained operator. */
export const SEAL_TESTS = {
  holo: { label: 'هولوگرام زیر نور', sens: 0.85, fp: 0.03, cost: 1, flag: 'نوار با چرخاندن رنگ عوض نمی‌کند؛ چاپی و تخت است', clear: 'رنگین‌کمانی است و با زاویه نور تغییر می‌کند' },
  seam: { label: 'لبه پرس و درز', sens: 0.7, fp: 0.05, cost: 1, flag: 'دو خط پرس، رد چسب یا برش روی لبه', clear: 'یک خط پرس یکنواخت، بدون چسب و برش' },
  swell: { label: 'تورم و تاب بسته', sens: 0.9, fp: 0.05, cost: 1, flag: 'بسته باد کرده یا تاب دارد', clear: 'تخت و یکنواخت' },
  print: { label: 'چاپ و املا', sens: 0.6, fp: 0.02, cost: 1, flag: 'چاپ جابه‌جا، قلم ناهمسان یا غلط املایی', clear: 'چاپ تراز، قلم یکدست و بی‌غلط' },
  match: { label: 'تطبیق کارت با سکه', sens: 0.95, fp: 0.01, cost: 1, flag: 'سکه داخل با نوع و طرح نوشته‌شده روی کارت نمی‌خواند', clear: 'نوع و طرح سکه با کارت یکی است' },
  weight: { label: 'وزن کل بسته', sens: 0.9, fp: 0.03, cost: 1, flag: 'وزن کل با بسته مرجع هم‌نوع نمی‌خواند', clear: 'وزن کل در حد تلرانس بسته مرجع است' },
  magnet: { label: 'آهنربا از روی بسته', sens: 0.99, fp: 0.001, cost: 1, flag: 'آهنربا سکه را درون بسته می‌کشد', clear: 'واکنشی ندارد' },
  link: { label: 'نشانی QR / لینک', sens: 0.8, fp: 0.01, cost: 1, flag: 'QR به دامنه‌ای غیررسمی و شبیه‌سازی‌شده می‌رود', clear: 'روی بسته لینک مشکوکی نیست یا به درگاه رسمی می‌رود' },
  serial: { label: 'استعلام رسمی سریال', sens: 0.97, fp: 0.005, cost: 2, flag: 'سامانه رسمی سریال را تأیید نمی‌کند', clear: 'سامانه رسمی سریال را با همین مشخصات تأیید می‌کند' },
};

/** a[scenario][test]: how often each scenario actually leaves that anomaly (teaching assumptions). */
export const SEAL_ANOMALY = {
  S0: { holo: 0, seam: 0, swell: 0, print: 0, match: 0, weight: 0, magnet: 0, link: 0, serial: 0 },
  S1: { holo: 0.9, seam: 0.1, swell: 0.05, print: 0.7, match: 0.1, weight: 0.75, magnet: 0.2, link: 0.3, serial: 0.85 },
  S2: { holo: 0.9, seam: 0.1, swell: 0.05, print: 0.7, match: 0.15, weight: 0.05, magnet: 0, link: 0.3, serial: 0.85 },
  S3: { holo: 0.05, seam: 0.85, swell: 0.6, print: 0.05, match: 0.2, weight: 0.7, magnet: 0.2, link: 0, serial: 0 },
  S4: { holo: 0.05, seam: 0.85, swell: 0.6, print: 0.05, match: 0.9, weight: 0.5, magnet: 0, link: 0, serial: 0 },
  S5: { holo: 0.6, seam: 0.1, swell: 0.05, print: 0.35, match: 0.05, weight: 0.5, magnet: 0.1, link: 0.1, serial: 0.6 },
  S6: { holo: 0.6, seam: 0.1, swell: 0.05, print: 0.5, match: 0.1, weight: 0.6, magnet: 0.15, link: 0.95, serial: 0.9 },
};

export const SEAL_CONTEXTS = {
  branch: { label: 'خرید مستقیم از شعبه بانک', prior: { S0: 0.995, S1: 0.001, S2: 0.0005, S3: 0.001, S4: 0.001, S5: 0.001, S6: 0.0005 } },
  market: { label: 'بازار و طلافروشی معتبر', prior: { S0: 0.93, S1: 0.015, S2: 0.015, S3: 0.015, S4: 0.01, S5: 0.01, S6: 0.005 } },
  online: { label: 'آنلاین یا فروشنده ناشناس', prior: { S0: 0.8, S1: 0.05, S2: 0.04, S3: 0.04, S4: 0.03, S5: 0.02, S6: 0.02 } },
  drill: { label: 'آزمون آموزشی (۴۰٪ سالم)', prior: { S0: 0.4, S1: 0.1, S2: 0.1, S3: 0.1, S4: 0.1, S5: 0.1, S6: 0.1 } },
};

/** Prior restricted to the scenarios that exist for a seal type (renormalised). */
export function sealPrior(context, type, rate = null) {
  const base = SEAL_CONTEXTS[context].prior;
  const allowed = SEAL_TYPES[type].scenarios;
  let z = 0;
  for (const h of allowed) z += base[h];
  const p = Object.fromEntries(allowed.map((h) => [h, base[h] / z]));
  return rate == null ? p : withFraudRate(p, 'S0', rate);
}
export const sealAccuracy = (test, type) => (test === 'serial' ? { ...SEAL_TESTS.serial, ...SEAL_TYPES[type].serial } : SEAL_TESTS[test]);
export const sealLikelihood = (type) => (h, t) => pFlag(SEAL_ANOMALY[h][t], sealAccuracy(t, type));

// same-weight swaps (price differs, weight does not) and lighter swaps
const SWAP_SAME = { emami: 'bahar', bahar: 'emami', quarter: 'quarterOld', quarterOld: 'quarter', gerami: 'parsian', parsian: 'gerami' };
const SWAP_LIGHT = { emami: 'half', bahar: 'half', half: 'quarter', quarter: 'gerami', quarterOld: 'gerami' };
export const PACK_TOL = 0.035; // g — a sealed pack weighed against a reference pack of the same type

/**
 * Build one sealed pack. Anomalies are drawn independently with the rates in SEAL_ANOMALY (so the
 * engine's posterior is exact for packs made here); the coin inside is then chosen to be physically
 * consistent with them (pack weight and magnet readings agree with the drawn anomalies).
 */
export function makePack(type, scenario, seed = 1) {
  const T = SEAL_TYPES[type];
  if (!T || !T.scenarios.includes(scenario)) throw new Error('unknown seal type or scenario');
  const r = rng(seed * 104729 + scenario.charCodeAt(1) * 131 + type.length * 7);
  const A = SEAL_ANOMALY[scenario];
  const an = {};
  for (const k of Object.keys(SEAL_TESTS)) an[k] = r() < A[k];
  const fakeCoin = ['S1', 'S3', 'S5', 'S6'].includes(scenario);
  // choose the card's coin so the drawn anomalies are physically possible
  let cards = T.coins;
  const needSame = an.match && !(scenario === 'S4' && an.weight);
  if (needSame) cards = cards.filter((c) => SWAP_SAME[c]);
  if (an.match && scenario === 'S4' && an.weight) cards = cards.filter((c) => SWAP_LIGHT[c]);
  const card = cards[Math.floor(r() * cards.length)];
  let coinId = card, kind = 'genuine', magnetic = false, note = 'سکه اصل، همان که کارت می‌گوید';
  if (fakeCoin) {
    if (an.match) coinId = SWAP_SAME[card];
    if (an.magnet && an.weight) (kind = 'steel'), (note = 'روکش طلا روی فولاد');
    else if (an.magnet) (kind = 'tungsten'), (magnetic = true), (note = 'مغزی فولاد و تنگستن با پوسته طلا (وزن تنظیم‌شده)');
    else if (an.weight) (kind = COIN_TYPES[coinId].fineness === 750 ? 'brass' : ['brass', 'lowkarat', 'brass'][Math.floor(r() * 3)]), (note = SPECIMENS[kind].label);
    else (kind = 'tungsten'), (note = SPECIMENS.tungsten.label);
    magnetic ||= kind === 'steel';
  } else if (scenario === 'S2') {
    if (an.match) coinId = SWAP_SAME[card];
    if (an.weight) kind = 'shaved';
    note = an.weight ? 'سکه اصل غیربانکی ولی تراشیده' : 'سکه اصل غیربانکی (ارزان‌تر از بانکی)';
  } else if (scenario === 'S4') {
    if (an.match) coinId = an.weight ? SWAP_LIGHT[card] : SWAP_SAME[card];
    else if (an.weight) kind = 'shaved';
    note = an.match ? `سکه اصل ${COIN_TYPES[coinId].short} به جای ${COIN_TYPES[card].short}` : an.weight ? 'سکه اصل ولی تراشیده' : 'سکه اصل کارکرده یا سال قدیمی‌تر';
  }
  const coin = makeSpecimen(coinId, kind, seed);
  coin.magnetic = magnetic;
  const expected = COIN_TYPES[card].weight + T.tare;
  const packWeight = Math.round((coin.weight + T.tare + (r() * 2 - 1) * 0.002) * 1000) / 1000;
  const digits = String(100000 + Math.floor(r() * 899999));
  return {
    type,
    scenario,
    seed,
    card,
    coin,
    note,
    anomalies: an,
    expectedWeight: Math.round(expected * 1000) / 1000,
    packWeight,
    serial: `${1400 + Math.floor(r() * 5)}-${an.print ? digits.slice(0, 2) + 'O' + digits.slice(3) : digits}`,
    link: an.link ? 'estelam-sekke.online' : null,
    fraud: scenario !== 'S0',
  };
}
/** What an operator observes with each seal test on this pack (true = red flag). */
export function packEvidence(p, tests = Object.keys(SEAL_TESTS)) {
  const ev = {};
  for (const t of tests) {
    if (t === 'weight') ev[t] = Math.abs(p.packWeight - p.expectedWeight) > PACK_TOL;
    else if (t === 'magnet') ev[t] = p.coin.magnetic;
    else ev[t] = p.anomalies[t];
  }
  return ev;
}
/** Simulated official registry lookup. Original packs (S0, S3, S4) always carry a registered serial. */
export function inquire(p) {
  if (!p.anomalies.serial) return { status: 'valid', text: 'سریال در سامانه رسمی ثبت است و نوع سکه با کارت می‌خواند.' };
  if (p.scenario === 'S5') return { status: 'duplicate', text: 'سریال ثبت شده، اما پیش‌تر برای بسته دیگری استعلام و ثبت مالکیت شده است (سریال تکراری).' };
  return { status: 'notfound', text: 'چنین سریالی در سامانه رسمی یافت نشد.' };
}
/** Seal game: packs drawn exactly with the "drill" prior, so the meter is calibrated to the game. */
export function pickPack(seed) {
  const r = rng(seed * 2654435761);
  const types = ['bank', 'bank', 'exchange', 'maker'];
  const type = types[Math.floor(r() * types.length)];
  const prior = sealPrior('drill', type);
  let u = r(), scenario = 'S0';
  for (const [h, p] of Object.entries(prior)) {
    if ((u -= p) < 0) {
      scenario = h;
      break;
    }
  }
  return makePack(type, scenario, seed);
}
