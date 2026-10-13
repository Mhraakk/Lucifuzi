import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../public/js/melt.mjs';
import { MESGHAL_G, MAZANEH_TO_G750, moltenPiecePrice, makeDrill, checkNumeric, DRILL_KINDS, parseNum } from '../public/js/calc.mjs';

const near = (a, b, eps) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);

test('آب‌شده: یک مثقال ۷۰۵ دقیقاً یک مظنه می‌ارزد و با موتور قبلی یکی است', () => {
  for (const maz of [30e6, 40e6, 52.37e6]) {
    near(M.valueOf(MESGHAL_G, 705, maz), maz, 1e-6 * maz);
    near(M.gram18(maz) * MAZANEH_TO_G750, maz, 1e-6);
    near(M.valueOf(12.34, 742, maz), moltenPiecePrice(12.34, 742, maz), 1e-6 * maz);
  }
  near(M.eq750(10, 740), 9.8666667, 1e-6);
  assert.equal(M.r3(19.73333), 19.733);
  assert.equal(M.rT(182215123), 182215000);
  assert.equal(parseNum('−۵۰۰٬۰۰۰'), -500000);
});

test('تمرین‌گر دفتر: هر معامله با پاسخ خودش کاملاً درست است و علامت‌ها سازگارند', () => {
  const seen = new Set();
  for (const L of M.LEDGER_LEVELS)
    for (let seed = 1; seed <= 400; seed++) {
      const t = M.makeTrade(seed, L.id, 8500000);
      seen.add(t.kind);
      assert.ok(L.kinds.includes(t.kind));
      assert.deepEqual(M.makeTrade(seed, L.id, 8500000), t);
      const exact = Object.fromEntries(t.fields.map((f) => [f.id, f.answer]));
      assert.equal(M.gradeTrade(t, exact).correct, true, `${t.kind}#${seed}`);
      for (const f of t.fields) {
        assert.ok(Number.isFinite(f.answer) && f.tol > 0, `${t.kind}.${f.id}`);
        const wrong = { ...exact, [f.id]: f.answer + f.tol * 3 + (f.unit === 'گرم' ? 0.01 : 10000) };
        assert.equal(M.gradeTrade(t, wrong).correct, false, `${t.kind}.${f.id} must reject a wrong value`);
      }
      const byId = Object.fromEntries(t.fields.map((f) => [f.id, f.answer]));
      if (t.kind === 'buy') assert.ok(byId.gold > 0 && byId.cash < 0 && byId.cash === -byId.value);
      if (t.kind === 'sell') assert.ok(byId.gold < 0 && byId.cash > 0 && byId.cash === byId.value);
      if (t.kind === 'buy' || t.kind === 'sell') assert.equal(byId.value, M.ledgerValue(t.given.w, t.given.ayar, t.given.maz));
      if (t.kind === 'assay') assert.ok(byId.diff < 0);
      if (t.kind === 'credit') assert.equal(byId.due, byId.value - byId.cash);
      if (t.kind === 'settle') near(byId.left + byId.settled, t.given.debt, 0.0015);
    }
  assert.deepEqual([...seen].sort(), ['assay', 'buy', 'credit', 'sell', 'settle']);
});

test('تمرین‌های سرعت آب‌شده: پاسخ‌ها درست و قطعی‌اند', () => {
  for (const kind of ['eq750', 'melt', 'assay', 'mesghal']) {
    assert.ok(DRILL_KINDS[kind]);
    for (let seed = 1; seed < 60; seed++) {
      const d = makeDrill(kind, seed, 8500000);
      assert.ok(Number.isFinite(d.answer) && d.answer > 0, `${kind}#${seed}`);
      assert.ok(checkNumeric(d.answer, d.answer, d.tol));
      assert.deepEqual(makeDrill(kind, seed, 8500000), d);
    }
  }
});
