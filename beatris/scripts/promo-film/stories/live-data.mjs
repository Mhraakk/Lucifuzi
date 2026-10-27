// spec 0051: every number «تابلوی زنده» shows, worked out by the app's own code from forgod's real answer of 4 Aban 1405,
// 16:48 Tehran (FORGOD_ANSWER, kept outside the repository), plus what the app itself showed and booked on the demo
// server (live-app.json, from live-shots.mjs). Nothing here asks forgod for anything.
//   FORGOD_ANSWER=<saved /api/all answer> node scripts/promo-film/stories/live-data.mjs   → stories/live-data.json
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '../../../server/db.mjs';
import { createMarket, parseForgod, forgodPlan } from '../../../server/market.mjs';
import { impliedMesghal, impliedUsdMesghal, coinIntrinsic, bubble, COIN_PURE_G, jalaliOf } from '../../../public/js/ta.mjs';
import { MAZANEH_TO_G750 } from '../../../public/js/calc.mjs';
import { parseLine, resolveMazaneh, explainMazaneh } from '../../../public/js/oneline.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const raw = readFileSync(process.env.FORGOD_ANSWER, 'utf8');
if (/api_key/i.test(raw)) throw new Error('the saved answer mentions a key: not used');
const answer = JSON.parse(raw);
const app = JSON.parse(readFileSync(path.join(HERE, 'live-app.json'), 'utf8'));
const NOW = new Date(app.now);
const got = parseForgod(answer, { now: NOW });
const q = Object.fromEntries(Object.entries(got.live).map(([id, x]) => [id, x.p]));
const at = new Date(got.at);
const tehran = (d) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tehran', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
const [jy, jm, jd] = jalaliOf(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(at));

/* the check every update passes: the 18k gram against ounce × dollar (spec 0049) */
const fair18 = impliedMesghal(q.ons, q.usd) / MAZANEH_TO_G750;
/* the analysis on the same prices, as the market page works it out (its price hunt and fair value) */
const fairMaz = impliedMesghal(q.ons, q.usd);
const hiddenUsd = impliedUsdMesghal(q.mesghal, q.ons);
const emamiGold = coinIntrinsic(COIN_PURE_G.sekee, q.ons, q.usd);

/* 24 hours of the allowance's own schedule on a fake clock: when the app asks forgod, by the Tehran clock */
const sent = [];
let clock = Date.parse('2026-10-26T20:30:00Z'); // 00:00 in Tehran
const fresh = () => JSON.stringify({ ...answer, last_updated: new Date(clock).toISOString() });
const fetchImpl = async (url) => {
  const u = new URL(url);
  if (u.hostname === 'forgod.film') {
    sent.push(clock);
    return new Response(fresh(), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  throw new Error('not reached');
};
const m = createMarket({ db: openDb(':memory:'), fetchImpl, clock: () => new Date(clock), envMode: 'forgod', forgod: { key: 'film', base: 'https://forgod.film', daily: 50 }, pause: async () => {} });
for (let k = 0; k < 24 * 60; k++, clock += 60000) {
  const run = m.poll();
  if (run) await run;
}
const minutes = sent.map((t) => {
  const [h, mi] = tehran(new Date(t)).split(':').map(Number);
  return h * 60 + mi;
});
const plan = forgodPlan(50);

/* the other capability: the market's own words at the desk, against the board's مظنه */
const p = parseLine(app.line);
const liveRial = q.mesghal * 10;
const mz = resolveMazaneh(p.price, { liveRial, shopUnit: 'rial' });

const sections = Object.fromEntries(Object.entries(answer.sections).map(([k, v]) => [k, v.length]));
const data = {
  source: { name: 'forgod.qzz.io', at: got.at, tehran: tehran(at), jalali: [jy, jm, jd], sections, skipped: got.skipped },
  board: { usd: q.usd, geram18: q.geram18, mesghal: q.mesghal, geram24: q.geram24, ons: q.ons, btc: q.btc, btcUsd: got.fx.btcUsd, sekee: q.sekee, sekeb: q.sekeb, nim: q.nim, rob: q.rob, gerami: q.gerami },
  fx: got.fx.rates.map((r) => ({ code: r.code, name: r.name, p: r.p, per: r.per })),
  check: { fair18: Math.round(fair18), gap: bubble(q.geram18, fair18), limit: 0.25 },
  analysis: {
    fairMaz: Math.round(fairMaz),
    mazGap: bubble(q.mesghal, fairMaz),
    hiddenUsd: Math.round(hiddenUsd),
    usdGap: bubble(q.usd, hiddenUsd),
    emamiGold: Math.round(emamiGold),
    emamiGap: bubble(q.sekee, emamiGold),
    emamiPureG: COIN_PURE_G.sekee,
  },
  budget: { ...plan, sent: minutes.length, day: minutes.filter((x) => x >= 9 * 60 && x < 22 * 60), night: minutes.filter((x) => x < 9 * 60 || x >= 22 * 60) },
  line: { text: app.line, parts: p.parts.map((x) => ({ role: x.role, text: x.text })), unknown: p.unknown, mazaneh: mz.rial, base: mz.baseRial, offset: mz.offsetRial, explain: explainMazaneh(p.price, mz, 'rial') },
  desk: { euroRate: Number(app.euroRate), track: app.track, amount: app.doc?.calc?.paidOut ?? app.doc?.payments?.[0]?.amount ?? null, doc: app.doc },
  quota: app.quota,
};
writeFileSync(path.join(HERE, 'live-data.json'), `${JSON.stringify(data, null, 1)}\n`);
console.log(JSON.stringify({ check: data.check, analysis: data.analysis, budget: { sent: data.budget.sent, day: data.budget.day.length, night: data.budget.night.map((x) => `${Math.floor(x / 60)}:${String(x % 60).padStart(2, '0')}`) }, line: data.line.explain, desk: { euro: data.desk.euroRate, track: data.desk.track, amount: data.desk.amount } }, null, 1));
