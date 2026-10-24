import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.mjs';
import { createBus, backoff } from '../server/bus.mjs';

const setup = () => {
  let t = 1_000_000;
  const clock = { now: () => t, add: (ms) => (t += ms) };
  const errors = [];
  const bus = createBus({ db: openDb(':memory:'), clock: clock.now, onError: (e, ctx) => errors.push([e.message, ctx]) });
  return { bus, clock, errors };
};

test('pub/sub: every subscriber gets the event; a failing one is isolated; unsubscribe works', () => {
  const { bus, errors } = setup();
  const got = [];
  const off = bus.subscribe('market.tick', (d) => got.push(['a', d.p]));
  bus.subscribe('market.tick', () => {
    throw new Error('boom');
  });
  bus.subscribe('market.tick', (d) => got.push(['c', d.p]));
  bus.publish('market.tick', { p: 1 });
  off();
  bus.publish('market.tick', { p: 2 });
  assert.deepEqual(got, [['a', 1], ['c', 1], ['c', 2]]);
  assert.equal(errors.length, 2);
  assert.equal(bus.stats().subscriberErrors, 2);
});

test('queue: retried with backoff, then done; idempotent by key', async () => {
  const { bus, clock } = setup();
  let calls = 0;
  bus.handle('flaky', async () => {
    if (++calls < 3) throw new Error(`fail ${calls}`);
  });
  const id = bus.enqueue('flaky', {}, { key: 'k1' });
  assert.equal(bus.enqueue('flaky', {}, { key: 'k1' }), id);
  assert.equal(await bus.tick(), 1); // attempt 1 fails
  assert.equal(await bus.tick(), 0); // not due yet
  clock.add(backoff(1));
  await bus.tick(); // attempt 2 fails
  clock.add(backoff(2));
  await bus.tick(); // attempt 3 succeeds
  assert.equal(calls, 3);
  const s = bus.stats();
  assert.equal(s.done, 1);
  assert.equal(s.queued, 0);
  assert.equal(backoff(1), 2000);
  assert.equal(backoff(20), 600000);
});

test('queue: dead after the last attempt, retry re-queues it', async () => {
  const { bus, clock } = setup();
  bus.handle('never', () => {
    throw new Error('always');
  });
  const id = bus.enqueue('never', { x: 1 }, { maxAttempts: 2 });
  await bus.tick();
  clock.add(backoff(1));
  await bus.tick();
  let s = bus.stats();
  assert.equal(s.dead, 1);
  assert.equal(s.deadJobs[0].last_error, 'always');
  assert.equal(bus.retry(id), true);
  assert.equal(bus.stats().queued, 1);
});

test('recurring: one job per period slot, even if ticked many times', async () => {
  const { bus, clock } = setup();
  let runs = 0;
  bus.handle('beat', () => runs++);
  bus.every('heartbeat', 60000, 'beat');
  await bus.tick();
  await bus.tick();
  assert.equal(runs, 1);
  clock.add(60000);
  await bus.tick();
  assert.equal(runs, 2);
});
