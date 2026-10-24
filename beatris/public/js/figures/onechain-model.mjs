// The one-chain figure's model (spec 0028). Pure, and shared by the page and its test: eight real kinds of event from
// the catalogue, each recorded as the document the trade desk makes (calcTrade, the engine itself), linked into one
// chain by the event log's own rule — code = SHA-256(prev + canonical(body)), the first prev «GENESIS» — and sorted
// into the five sections by sectionsOf, the function روزنگار filters with. Nothing in the figure is drawn from
// anything else.
import { canonical } from '../books.mjs';
import { calcTrade, coinEq750 } from '../trade.mjs';
import { sectionsOf } from '../daysearch.mjs';
import { EVENTS } from '../shopevents.mjs';

/** The drawers, in reading order (right to left): the sections of روزنگار without «همه». */
export const DRAWERS = [
  ['melt', 'آبشده'],
  ['coin', 'سکه'],
  ['bar', 'شمش'],
  ['fx', 'ارز'],
  ['money', 'وجه'],
];

const MAZ = 405000000; // مظنه of the example (rial)
const r3 = (x) => Math.round(x * 1000) / 1000;
const melt = (dir, weight, fineness = 750) => ({ kind: 'melt', dir, weight, fineness, mazaneh: MAZ });
const value = (l) => calcTrade({ type: 'trade', lines: [l] }).lines[0].value;
const cash = (dir, amount) => ({ method: 'cash', dir, amount });

/** What the operator records for each example event: the same inputs as the event's recipe in tests/shopevents. */
const INPUTS = [
  ['melt-buy-cash', () => { const l = melt('in', 12.345, 740); return { type: 'trade', lines: [l], payments: [cash('out', value(l))] }; }],
  ['coin-sell', () => ({ type: 'trade', lines: [{ kind: 'coin', dir: 'out', coin: 'emami', count: 2, price: 1000000000 }], payments: [{ method: 'c2c', dir: 'in', amount: 2000000000, ref: '998877', card: '7890' }] })],
  ['bar-sell', () => { const l = { kind: 'bar', dir: 'out', serial: 'ZB-1001', weight: 100, fineness: 995, mazaneh: MAZ + 2000000 }; return { type: 'trade', lines: [l], payments: [{ method: 'pos', dir: 'in', amount: value(l), ref: '332211' }] }; }],
  ['fx-buy', () => ({ type: 'trade', lines: [{ kind: 'fx', dir: 'in', code: 'USD', fxAmount: 1000, rate: 820000 }], payments: [cash('out', 820000000)] })],
  ['melt-settle-gold', () => ({ type: 'trade', lines: [melt('in', 2.5, 750)], payments: [] })],
  ['coin-melt', () => ({ type: 'transform', lines: [{ kind: 'coin', dir: 'out', coin: 'quarter', count: 2 }, melt('in', r3(2 * coinEq750('quarter') * 0.99), 750)], payments: [] })],
  ['fx-pay-gold', () => {
    const lines = [{ kind: 'fx', dir: 'in', code: 'USD', fxAmount: 2000, rate: 820000 }, melt('out', 18, 750)];
    const net = value(lines[1]) - value(lines[0]);
    return { type: 'trade', lines, payments: net > 0 ? [cash('in', net)] : net < 0 ? [cash('out', -net)] : [] };
  }],
  ['money-cheque-in', () => ({ type: 'trade', lines: [], payments: [{ method: 'cheque', dir: 'in', amount: 200000000, chequeNo: '123456', bank: 'ملی', due: '2026-11-11' }] })],
];

/** The example documents: number, event, its title in the catalogue, what was recorded, the engine's figures, sections. */
export function exampleDocs() {
  return INPUTS.map(([event, make], i) => {
    const input = make();
    const calc = calcTrade(input);
    const secs = sectionsOf({ type: input.type, calc });
    return {
      no: i + 1,
      event,
      title: EVENTS.find((e) => e.id === event)?.t ?? event,
      body: { no: i + 1, action: 'doc.create', event, doc: input },
      secs: DRAWERS.map(([k]) => k).filter((k) => secs.has(k)),
    };
  });
}

/** Link the documents: each code is SHA-256(prev + canonical(body)). sha: async (text) → hex. */
export async function chainOf(docs, sha) {
  let prev = 'GENESIS';
  const links = [];
  for (const d of docs) {
    const hash = await sha(prev + canonical(d.body));
    links.push({ ...d, prev, hash, code: hash.slice(0, 4) });
    prev = hash;
  }
  return links;
}

/** verifyLog's walk over the links as they stand now (bodies may have been altered): ok, or the first link that breaks. */
export async function verify(links, sha) {
  let prev = 'GENESIS';
  for (const l of links) {
    if (l.prev !== prev || (await sha(prev + canonical(l.body))) !== l.hash) return { ok: false, brokenAt: l.no, checked: l.no - 1 };
    prev = l.hash;
  }
  return { ok: true, brokenAt: null, checked: links.length };
}

/** One figure changed in one link's body, as a person editing the database behind the app would. */
export function tamper(link) {
  const body = structuredClone(link.body);
  const l = body.doc.lines[0] ?? null;
  if (l?.weight) l.weight = r3(l.weight + 1);
  else if (l?.count) l.count += 1;
  else if (l?.fxAmount) l.fxAmount += 100;
  else body.doc.payments[0].amount += 10000000;
  return { ...link, body };
}

/** How many documents each drawer holds. */
export const drawerCounts = (links) => Object.fromEntries(DRAWERS.map(([k]) => [k, links.filter((l) => l.secs.includes(k)).length]));

/** SHA-256 in the browser, hex, over the UTF-8 text (the same bytes node's createHash hashes). */
export const browserSha = async (text) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map((b) => b.toString(16).padStart(2, '0')).join('');
