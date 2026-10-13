// spec 0020: the market's own sentence becomes the exact trade. «۲۰ خط پایین مظنه بازار ۱۰۹ میلیون» is a مظنه of
// 109,000,000 − 20 × 10,000 toman = 108,800,000 toman (1,088,000,000 rial). Fixed cases, then thousands of generated
// sentences in every order and number style, then the AI rewrite and its number guard.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLine, resolveMazaneh, explainMazaneh, missing, KHAT_RIAL } from '../public/js/oneline.mjs';
import { tradeLine, g750FromMazaneh } from '../public/js/trade.mjs';
import { understandLine, numbersIn } from '../server/oneline-ai.mjs';

const LIVE = 1_088_500_000; // the board's مظنه in rial (108,850,000 toman)
const mz = (t, live = LIVE, shopUnit = 'rial') => resolveMazaneh(parseLine(t).price, { liveRial: live, shopUnit });

test('one خط is 10,000 toman = 100,000 rial', () => assert.equal(KHAT_RIAL, 100000));

test('the operator’s sentence: twenty lines under a 109-million مظنه', () => {
  const r = mz('۲۰ خط پایین مظنه بازار ۱۰۹ میلیون');
  assert.equal(r.ok, true);
  assert.equal(r.baseRial, 1_090_000_000);
  assert.equal(r.offsetRial, -2_000_000);
  assert.equal(r.rial, 1_088_000_000);
  assert.equal(explainMazaneh(parseLine('۲۰ خط پایین مظنه بازار ۱۰۹ میلیون').price, r, 'toman'), 'مظنه ۱۰۹٬۰۰۰٬۰۰۰ − ۲۰ خط (۲۰۰٬۰۰۰) = ۱۰۸٬۸۰۰٬۰۰۰ تومان');
});

test('the same deal said many ways gives the same مظنه', () => {
  const same = [
    '۲۰ خط پایین مظنه بازار ۱۰۹ میلیون',
    'بیست خط زیر مظنه صد و نه میلیون',
    'مظنه ۱۰۹ میلیون منهای ۲۰ خط',
    'مظنه بازار ۱۰۹ میلیون ۲۰ خط پایین',
    'مظنه ۱۰۹ میلیون تومان ۲۰ خط کمتر',
    '۲۰خط زیرِ مظنه ۱۰۹ میلیون',
    '20 خط پایین تر از مظنه 109 میلیون',
    'مظنه ۱۰۹ منهای ۲۰ خط',
    'مظنه ۱۰۹۰۰۰۰۰۰ تومان منهای بیست خط',
    'مظنه ۱۰۹۰۰۰۰۰۰۰ ریال منهای ۲۰ خط',
    '۲۰۰ هزار تومان زیر مظنه ۱۰۹ میلیون',
    'مظنه ۱۰۹ میلیون منهای ۲ میلیون ریال',
    'مظنه ۱۰۸ میلیون و ۸۰۰',
    'مظنه ۱۰۸/۸۰۰',
  ];
  for (const t of same) assert.equal(mz(t).rial, 1_088_000_000, t);
});

test('above the مظنه, the board’s مظنه, and the shop unit when the market is unknown', () => {
  assert.equal(mz('۵ خط بالای مظنه ۱۰۹ میلیون').rial, 1_090_500_000);
  assert.equal(mz('مظنه ۱۰۹ میلیون بعلاوه ۵ خط').rial, 1_090_500_000);
  const b = mz('۲۰ خط زیر مظنه');
  assert.equal(b.live, true);
  assert.equal(b.rial, LIVE - 2_000_000);
  assert.equal(mz('۲۰ خط زیر مظنه', null).ok, false); // no board, no number: asked, never guessed
  assert.equal(mz('مظنه ۱۰۹۰۰۰۰۰۰ منهای ۲۰ خط', null, 'toman').rial, 1_088_000_000);
  assert.equal(mz('مظنه ۱۰۹۰۰۰۰۰۰۰ منهای ۲۰ خط', null, 'rial').rial, 1_088_000_000);
});

test('a خط with no up or down is a question, not a guess', () => {
  const r = mz('۲۰ خط مظنه ۱۰۹ میلیون');
  assert.equal(r.ok, false);
  assert.match(r.error, /زیر|بالای/);
});

test('the whole sentence: customer, goods, price, payment and «ثبت کن»', () => {
  const p = parseLine('خرید از رضایی ۱۲٫۴۵ گرم آبشده ۷۵۰ بیست خط زیر مظنه ۱۰۹ میلیون نقد ثبت کن');
  assert.equal(p.mode, 'buy');
  assert.equal(p.party, 'رضایی');
  assert.equal(p.kind, 'melt');
  assert.equal(p.weight, 12.45);
  assert.equal(p.fineness, 750);
  assert.equal(p.commit, true);
  assert.deepEqual(p.pays.map((x) => x.method), ['cash']);
  assert.deepEqual(p.unknown, []);
  assert.deepEqual(missing(p, { doc: true }), []);
  // the line is priced by the accounting engine from that مظنه, exactly as a typed مظنه would be
  const r = resolveMazaneh(p.price, { liveRial: LIVE });
  const line = tradeLine({ kind: 'melt', dir: 'in', priced: true, weight: p.weight, fineness: p.fineness, basis: 'mazaneh', mazaneh: r.rial }, { round: 1 });
  assert.equal(line.value, Math.round(((12.45 * 750) / 750) * g750FromMazaneh(1_088_000_000)));
  const free = parseLine('امروز از آقای کریمی ده گرم عیار ۷۴۰ خریدیم پنج خط بالای مظنه کارت به کارت');
  assert.deepEqual([free.mode, free.party, free.weight, free.fineness, free.price.offset.dir, free.price.offset.lines, free.pays[0].method], ['buy', 'کریمی', 10, 740, 1, 5, 'c2c']);
  assert.deepEqual(missing(parseLine('۲۰ خط زیر مظنه ۱۰۹ میلیون')), ['نوع معامله (خرید یا فروش)', 'وزن']);
});

// ---- generated sentences ----
const W1 = ['', 'یک', 'دو', 'سه', 'چهار', 'پنج', 'شش', 'هفت', 'هشت', 'نه'];
const TEEN = ['ده', 'یازده', 'دوازده', 'سیزده', 'چهارده', 'پانزده', 'شانزده', 'هفده', 'هجده', 'نوزده'];
const W10 = ['', '', 'بیست', 'سی', 'چهل', 'پنجاه', 'شصت', 'هفتاد', 'هشتاد', 'نود'];
const W100 = ['', 'صد', 'دویست', 'سیصد', 'چهارصد', 'پانصد', 'ششصد', 'هفتصد', 'هشتصد', 'نهصد'];
function words(n) {
  const h = Math.floor(n / 100), r = n % 100, out = [];
  if (h) out.push(W100[h]);
  if (r >= 10 && r < 20) out.push(TEEN[r - 10]);
  else {
    if (Math.floor(r / 10)) out.push(W10[Math.floor(r / 10)]);
    if (r % 10) out.push(W1[r % 10]);
  }
  return out.join(' و ');
}
const fa = (s) => String(s).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
function rng(seed) {
  let x = seed >>> 0;
  return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

for (const seed of [1405, 7, 42, 2026]) test(`5000 generated sentences (seed ${seed}): every order and number style gives the exact مظنه, weight, fineness and side`, () => {
  const R = rng(seed);
  const pick = (a) => a[Math.floor(R() * a.length)];
  const NAMES = ['رضایی', 'احمدی', 'کریمی', 'موسوی', 'حسینی'];
  const FINE = [585, 705, 740, 750, 875, 900, 916, 999];
  for (let k = 0; k < 5000; k++) {
    const lines = 1 + Math.floor(R() * 60);
    const dir = R() < 0.7 ? -1 : 1;
    const baseM = 80 + Math.floor(R() * 60); // millions of toman
    const baseK = R() < 0.5 ? 0 : 50 * Math.floor(R() * 20); // thousands after the millions
    const grams = Math.round((0.5 + R() * 400) * 100) / 100;
    const fine = pick(FINE);
    const name = pick(NAMES);
    const mode = pick([['buy', 'خرید از'], ['sell', 'فروش به']]);
    const num = (n) => (R() < 0.3 && Number.isInteger(n) && n < 1000 ? words(n) : R() < 0.5 ? fa(n) : String(n));
    const baseTxt = baseK ? pick([`${num(baseM)} میلیون و ${num(baseK)}`, `${fa(baseM)}/${fa(String(baseK).padStart(3, '0'))}`]) : pick([`${num(baseM)} میلیون`, `${num(baseM)} میلیون تومان`, fa(baseM)]);
    const down = dir < 0;
    const offTxt = pick(down ? [`${num(lines)} خط پایین`, `${num(lines)} خط زیر`, `${num(lines)} خط کمتر از`] : [`${num(lines)} خط بالای`, `${num(lines)} خط بالاتر از`, `${num(lines)} خط روی`]);
    const priceTxt = R() < 0.5 ? `${offTxt} مظنه ${pick(['', 'بازار '])}${baseTxt}` : `مظنه ${pick(['', 'بازار '])}${baseTxt} ${down ? 'منهای' : 'بعلاوه'} ${num(lines)} خط`;
    // number words next to number words are ambiguous without «و» («نهصد بیست و هفت خط»); people put a digit or a pause
    const goods = `${fa(String(grams).replace('.', '٫'))} گرم عیار ${R() < 0.5 ? fa(fine) : String(fine)}`;
    const parts = [`${mode[1]} ${name}`, goods, priceTxt, pick(['نقد', 'کارت', 'نسیه', 'حواله'])];
    if (R() < 0.3) parts.splice(1, 0, parts.splice(2, 1)[0]); // the price before the goods
    const sep = pick([' ', ' - ', '، ']);
    const text = parts.join(sep);
    const p = parseLine(text);
    const r = resolveMazaneh(p.price, { liveRial: (baseM * 1e6 + baseK * 1e3) * 10 });
    const want = (baseM * 1e6 + baseK * 1e3) * 10 + dir * lines * KHAT_RIAL;
    assert.equal(r.ok, true, `${text} → ${r.error}`);
    assert.equal(r.rial, want, text);
    assert.equal(p.weight, grams, text);
    assert.equal(p.fineness, fine, text);
    assert.equal(p.mode, mode[0], text);
    assert.equal(p.party, name, text);
    assert.deepEqual(p.unknown, [], text);
  }
});

// ---- the language engine's rewrite ----
const fake = (canonical) => ({ name: 'fake', available: () => true, run: async () => JSON.stringify({ canonical }) });

test('the rules answer first; the model is not asked for a sentence they understand', async () => {
  let asked = 0;
  const p = { name: 'spy', available: () => true, run: async () => (asked++, '{}') };
  const r = await understandLine('خرید ۱۰ گرم ۷۵۰ بیست خط زیر مظنه ۱۰۹ میلیون نقد', { provider: p });
  assert.equal(r.source, 'rules');
  assert.equal(asked, 0);
});

test('a free sentence is rewritten in the desk’s words, and its numbers are the operator’s', async () => {
  const said = 'امروز آقای رضایی دوازده گرم هفتصد و پنجاهی آورد، بیست خط زیر مظنه صد و نه گرفتیم، پولش نقد';
  const r = await understandLine(said, { provider: fake('خرید از رضایی دوازده گرم عیار هفتصد و پنجاه بیست خط زیر مظنه صد و نه میلیون نقد') });
  assert.equal(r.ok, true);
  assert.equal(r.source, 'model');
  assert.equal(resolveMazaneh(r.parsed.price, { liveRial: LIVE }).rial, 1_088_000_000);
  assert.equal(r.parsed.weight, 12);
});

test('a rewrite that invents a number is refused', async () => {
  const r = await understandLine('آقای رضایی دوازده گرم آورد بیست خط زیر مظنه گرفتیم پولش نقد', { provider: fake('خرید از رضایی ۱۳ گرم بیست خط زیر مظنه نقد') });
  assert.equal(r.ok, false);
  assert.match(r.reason, /13/);
  assert.ok(numbersIn('دوازده گرم').has(12));
});

test('no language engine: the reason is said plainly', async () => {
  const r = await understandLine('یه چیزی عجیب گفت و رفت پیش بقیه', { provider: { available: () => false } });
  assert.equal(r.ok, false);
});

test('a weight in mesghal uses the books’ own mesghal (4.6083 g), not a rounded one', () => {
  assert.equal(parseLine('خرید ۲ مثقال عیار ۷۵۰').weight, 9.217);
  assert.equal(parseLine('خرید نیم مثقال').weight, 2.304);
});
