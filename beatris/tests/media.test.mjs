import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRange } from '../server/index.mjs';

test('byte ranges for tutorial video seeking', () => {
  assert.deepEqual(parseRange('bytes=0-', 1000), [0, 999]);
  assert.deepEqual(parseRange('bytes=0-1', 1000), [0, 1]);
  assert.deepEqual(parseRange('bytes=500-99999', 1000), [500, 999]);
  assert.deepEqual(parseRange('bytes=-100', 1000), [900, 999]);
  assert.deepEqual(parseRange('bytes=-5000', 1000), [0, 999]);
  assert.equal(parseRange('bytes=1000-', 1000), null);
  assert.equal(parseRange('bytes=5-2', 1000), null);
  assert.equal(parseRange('bytes=-', 1000), null);
  assert.equal(parseRange('items=0-1', 1000), null);
  assert.equal(parseRange(undefined, 1000), null);
});
