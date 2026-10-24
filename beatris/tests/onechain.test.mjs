// spec 0028: the one-chain figure shows only what the app's own rules say. Its model records eight real events with
// the trade engine, sorts them with sectionsOf (روزنگار's filter) and links them with the event log's SHA-256 rule;
// tampering with one link breaks the chain exactly where verifyLog would say.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { DRAWERS, exampleDocs, chainOf, verify, tamper, drawerCounts } from '../public/js/figures/onechain-model.mjs';
import { calcTrade } from '../public/js/trade.mjs';
import { sectionsOf } from '../public/js/daysearch.mjs';
import { canonical } from '../public/js/books.mjs';
import { EVENTS } from '../public/js/shopevents.mjs';

const sha = async (s) => createHash('sha256').update(s).digest('hex');

test('every link is a real catalogue event, recorded by the engine and sorted by sectionsOf', async () => {
  const links = await chainOf(exampleDocs(), sha);
  assert.equal(links.length, 8);
  for (const l of links) {
    const ev = EVENTS.find((e) => e.id === l.event);
    assert.ok(ev, `${l.event} is in the catalogue`);
    assert.equal(l.title, ev.t);
    const secs = sectionsOf({ type: l.body.doc.type, calc: calcTrade(l.body.doc) });
    assert.deepEqual(l.secs, DRAWERS.map(([k]) => k).filter((k) => secs.has(k)), `sections of ${l.event}`);
    assert.ok(l.secs.length >= 1);
  }
  // each drawer holds exactly the documents whose sections include it, and every section is used
  const counts = drawerCounts(links);
  for (const [k] of DRAWERS) {
    assert.equal(counts[k], links.filter((l) => l.secs.includes(k)).length);
    assert.ok(counts[k] >= 1, `${k} has a document`);
  }
});

test("each code is the event log's rule: SHA-256(prev + canonical(body)), the first prev GENESIS", async () => {
  const links = await chainOf(exampleDocs(), sha);
  let prev = 'GENESIS';
  for (const l of links) {
    assert.equal(l.prev, prev);
    assert.equal(l.hash, createHash('sha256').update(prev + canonical(l.body)).digest('hex'));
    assert.equal(l.code, l.hash.slice(0, 4));
    prev = l.hash;
  }
  assert.deepEqual(await verify(links, sha), { ok: true, brokenAt: null, checked: 8 });
});

test('tampering with link k breaks the chain at k, as verifyLog reports; mending makes it whole', async () => {
  const links = await chainOf(exampleDocs(), sha);
  for (const k of [1, 4, 8]) {
    const bad = links.map((l) => (l.no === k ? tamper(l) : l));
    assert.notEqual(canonical(bad[k - 1].body), canonical(links[k - 1].body), 'one figure changed');
    assert.deepEqual(await verify(bad, sha), { ok: false, brokenAt: k, checked: k - 1 });
  }
  assert.equal((await verify(links, sha)).ok, true);
});
