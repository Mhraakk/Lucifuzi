// spec 0019: the thinking orb — every state draws, a frame is a pure function of time (films seek it), every live
// agent run state has an orb and a finished one has none, and the markup is safe and accessible.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ORB_STATES, RUN_ORB, orb, orbFrame } from '../public/js/orb.mjs';
import { RUN_STATES } from '../server/agent-platform/runtime.mjs';

test('the nine states all draw dots at every size', () => {
  assert.equal(Object.keys(ORB_STATES).length, 9);
  for (const s of Object.keys(ORB_STATES))
    for (const size of [20, 32, 64]) {
      const f = orbFrame(s, size, 0.8);
      assert.ok(f.dots.length > 0, `${s}@${size}`);
      for (const d of f.dots) assert.ok(Number.isFinite(d.x) && Number.isFinite(d.y) && d.r > 0, `${s}@${size} dot`);
    }
});

test('a frame is a pure function of time', () => {
  for (const s of Object.keys(ORB_STATES)) {
    assert.deepEqual(orbFrame(s, 64, 2.25), orbFrame(s, 64, 2.25));
    assert.notDeepEqual(orbFrame(s, 64, 0.3), orbFrame(s, 64, 1.9), `${s} moves`);
  }
});

test('live run states have an orb; finished ones do not', () => {
  for (const st of RUN_STATES) {
    const done = ['completed', 'failed', 'cancelled'].includes(st);
    assert.equal(st in RUN_ORB, !done, st);
    if (!done) assert.ok(ORB_STATES[RUN_ORB[st]], st);
  }
});

test('markup: escaped label, decorative hides from readers, unknown state falls back', () => {
  assert.match(orb('searching', { label: '<x>"' }), /aria-label="&lt;x&gt;&quot;"/);
  assert.match(orb('solving', { decorative: true }), /aria-hidden="true"/);
  assert.doesNotMatch(orb('solving', { decorative: true }), /role="img"/);
  assert.match(orb('nope'), /data-orb="working"/);
  assert.match(orb('working', { size: 30 }), /data-size="32"/);
});

test('the engine is vendored with its licence and pulled from no CDN', () => {
  assert.match(readFileSync(new URL('../public/vendor/thinking-orbs/NOTICE.txt', import.meta.url), 'utf8'), /MIT License/);
  assert.doesNotMatch(readFileSync(new URL('../public/js/orb.mjs', import.meta.url), 'utf8'), /https?:\/\//);
});
