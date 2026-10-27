// spec 0051: the network of the server the film's screens are taken from, loaded with `node --import`. forgod's
// /api/all is answered from a saved real answer (FORGOD_ANSWER, kept outside the repository; it holds prices, never a
// key), any other forgod address is refused, and tgju fails at once. FAKE_NOW moves the server's clock to the moment of
// that answer, so the app reads it as it did that afternoon. Nothing is sent to forgod: its allowance is the shop's.
import { readFileSync } from 'node:fs';

const answer = readFileSync(process.env.FORGOD_ANSWER, 'utf8');
if (/api_key/i.test(answer)) throw new Error('the saved answer mentions a key: not used');

const shift = process.env.FAKE_NOW ? Date.parse(process.env.FAKE_NOW) - Date.now() : 0;
if (shift) {
  const Real = Date;
  globalThis.Date = class extends Real {
    constructor(...a) {
      if (a.length) super(...a);
      else super(Real.now() + shift);
    }
    static now() {
      return Real.now() + shift;
    }
  };
}

const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const u = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (u.hostname === 'forgod.qzz.io' || u.hostname.endsWith('.forgod.qzz.io')) {
    if (u.pathname === '/api/all') return new Response(answer, { status: 200, headers: { 'content-type': 'application/json' } });
    return new Response('{"error":"only /api/all is replayed"}', { status: 404, headers: { 'content-type': 'application/json' } });
  }
  if (u.hostname.endsWith('tgju.org')) throw new Error('tgju is not reached from the film capture');
  return realFetch(input, init);
};
