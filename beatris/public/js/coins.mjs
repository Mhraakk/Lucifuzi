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
  emami: { label: 'تمام امامی (طرح جدید)', short: 'تمام امامی', weight: 8.133, fineness: 900, diameter: 22, obv: 'cameo', rev: 'shrine', legal: true },
  bahar: { label: 'تمام بهار آزادی (طرح قدیم)', short: 'تمام طرح قدیم', weight: 8.133, fineness: 900, diameter: 22, obv: 'words', rev: 'shrine', legal: true },
  half: { label: 'نیم سکه', short: 'نیم', weight: 4.0665, fineness: 900, diameter: 19, obv: 'cameo', rev: 'shrine', legal: true },
  quarter: { label: 'ربع سکه', short: 'ربع', weight: 2.03325, fineness: 900, diameter: 16.5, obv: 'cameo', rev: 'shrine', legal: true },
  quarterOld: { label: 'ربع سکه طرح قدیم', short: 'ربع قدیم', weight: 2.03325, fineness: 900, diameter: 16.5, obv: 'words', rev: 'shrine', legal: true },
  gerami: { label: 'سکه گرمی', short: 'گرمی', weight: 1.01, fineness: 900, diameter: 13.5, obv: 'words', rev: 'rosette', legal: true },
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
