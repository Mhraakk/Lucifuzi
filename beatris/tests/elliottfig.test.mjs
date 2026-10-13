// spec 0030: the wave rig never judges by itself. Every verdict, ratio and score it shows is ta.elliott's impulse-done
// candidate for the six prices on its rails, and every stop sits exactly at the price where its rule flips.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { elliott } from '../public/js/ta.mjs';
import { EXAMPLES, STOPS, judge, fromStudio } from '../public/js/figures/wave-model.mjs';
import { sceneSvg, readoutOf } from '../public/js/figures/wave.mjs';

const engine = (prices) => elliott(prices.map((price, i) => ({ i: i * 10, price, kind: i % 2 ? 'H' : 'L' }))).find((c) => c.kind === 'impulse-done');
const ex = (id) => EXAMPLES.find((e) => e.id === id).prices;
const close = (a, b, eps = 1e-3) => Math.abs(a - b) < eps;

test("every example's verdict is the engine's own", () => {
  for (const e of EXAMPLES) {
    const v = judge(e.prices), c = engine(e.prices);
    assert.deepEqual(v.rules, c.rules, e.id);
    assert.deepEqual(v.guides, c.guides, e.id);
    assert.equal(v.score, c.score, e.id);
    assert.equal(v.valid, c.valid, e.id);
  }
});

test('each broken example breaks exactly its one rule; the valid one breaks none', () => {
  assert.deepEqual(judge(ex('valid')).broken, []);
  assert.deepEqual(judge(ex('deep2')).broken, ['w2']);
  assert.deepEqual(judge(ex('short3')).broken, ['w3short']);
  assert.deepEqual(judge(ex('overlap4')).broken, ['w4']);
  assert.equal(judge(ex('valid')).score, 100);
  for (const id of ['deep2', 'short3', 'overlap4']) assert.equal(judge(ex(id)).score, 0, `${id} scores 0: a broken rule voids the count`);
});

test('the textbook impulse has the textbook ratios', () => {
  const g = Object.fromEntries(judge(ex('valid')).guides.map((x) => [x.label, x.ratio]));
  assert.ok(close(g['موج ۲ ÷ موج ۱'], 0.618));
  assert.ok(close(g['موج ۳ ÷ موج ۱'], 1.618));
  assert.ok(close(g['موج ۴ ÷ موج ۳'], 0.382));
  assert.ok(close(g['موج ۵ ÷ موج ۱'], 1));
});

test("each stop sits at the price where the engine's rule flips", () => {
  // the swing point a stop guards: rail 2 holds P2 against P0, rails 3 and 4 hold P3 and P4 against P1
  for (const e of EXAMPLES) {
    for (const s of STOPS) {
      const h = s.at(e.prices), eps = 1e-6 * Math.max(1, Math.abs(h));
      const above = e.prices.slice(), below = e.prices.slice();
      above[s.rail] = h + eps;
      below[s.rail] = h - eps;
      const ruleOf = (p) => engine(p).rules.find((r) => r.id === s.rule).ok;
      assert.equal(ruleOf(above), true, `${e.id}: ${s.rule} holds just above its stop`);
      assert.equal(ruleOf(below), false, `${e.id}: ${s.rule} breaks just below its stop`);
    }
  }
});

test('the gauge rods are waves 1, 3 and 5, and the shortest-wave-3 rule is the engine’s', () => {
  const v = judge(ex('short3'));
  const [w1, , w3, , w5] = v.waves;
  assert.ok(w3 < w1 && w3 < w5, 'wave 3 is the shortest rod');
  assert.ok(v.broken.includes('w3short'));
  const ok = judge(ex('valid'));
  assert.ok(!(ok.waves[2] < ok.waves[0] && ok.waves[2] < ok.waves[4]));
});

test("the studio's count goes on the machine only when it is a five-wave impulse", () => {
  const pts = (prices) => prices.map((price, i) => ({ i, price }));
  const up = fromStudio({ kind: 'impulse-done', up: true, points: pts([100, 130, 111.46, 160, 141.46, 171.46]) });
  assert.equal(up.ok, true);
  assert.deepEqual(up.prices, [100, 130, 111.46, 160, 141.46, 171.46]);
  // a falling impulse is mirrored about P0, so the machine reads it rising with the same wave lengths
  const down = fromStudio({ kind: 'impulse-done', up: false, points: pts([200, 170, 188.54, 140, 158.54, 128.54]) });
  assert.equal(down.ok, true);
  assert.equal(down.up, false);
  assert.deepEqual(down.raw, [200, 170, 188.54, 140, 158.54, 128.54]);
  const dv = judge(down.prices), uv = judge([100, 130, 111.46, 160, 141.46, 171.46]);
  dv.waves.forEach((w, i) => assert.ok(close(w, uv.waves[i]), `wave ${i + 1} keeps its length`));
  assert.deepEqual(dv.broken, []);
  // the engine's own verdict on the falling count (as a down impulse) agrees with the mirrored one
  const real = elliott(down.raw.map((price, i) => ({ i: i * 10, price, kind: i % 2 ? 'L' : 'H' }))).find((c) => c.kind === 'impulse-done');
  assert.deepEqual(real.rules.map((r) => r.ok), dv.rules.map((r) => r.ok));
  assert.equal(real.score, dv.score);
  for (const kind of ['wave5', 'wave3', 'abc-done']) {
    const r = fromStudio({ kind, up: true, points: pts([1, 2, 3, 4, 5]) });
    assert.equal(r.ok, false);
    assert.match(r.why, /پنج موج/);
  }
  assert.equal(fromStudio(null).ok, false);
});

test('the drawing is whole: six rails with sliders, three stops, no broken numbers', () => {
  const s = sceneSvg();
  assert.equal((s.match(/class="wv-slider"/g) || []).length, 6);
  assert.equal((s.match(/class="wv-stop"/g) || []).length, 3);
  assert.deepEqual([...s.matchAll(/data-rule="([^"]+)"/g)].map((m) => m[1]), STOPS.map((x) => x.rule));
  assert.ok(!/NaN|undefined|Infinity/.test(s));
});

test('the readout says the verdict first, then the ratios, with no middle dot beside a digit', () => {
  const valid = readoutOf(judge(ex('valid')), { prices: ex('valid') });
  assert.equal(valid, 'قواعد ۴ از ۴، امتیاز ۱۰۰ — نسبت‌ها: ۲ به ۱ = ۰٫۶۱۸، ۳ به ۱ = ۱٫۶۱۸، ۴ به ۳ = ۰٫۳۸۲، ۵ به ۱ = ۱');
  assert.match(readoutOf(judge(ex('deep2')), { prices: ex('deep2') }), /^قواعد ۳ از ۴، شکسته: موج ۲ — /);
  assert.match(readoutOf(judge(ex('short3')), { prices: ex('short3') }), /شکسته: موج ۳ \(کوتاه‌ترین\)/);
  assert.equal(readoutOf(judge(ex('overlap4')), { prices: ex('overlap4'), pick: 4 }), 'نقطه ۴ = ۱۲۶ — شکسته: موج ۴');
  // a flat wave 1 has no ratio: a dash, never NaN or Infinity
  const flat = [100, 100, 90, 140, 120, 150];
  assert.ok(!/NaN|Infinity/.test(readoutOf(judge(flat), { prices: flat })));
  for (const e of EXAMPLES) assert.ok(!readoutOf(judge(e.prices), { prices: e.prices }).includes('·'), e.id);
});
