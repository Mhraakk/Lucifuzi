import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.mjs';
import { createServer } from '../server/index.mjs';
import { seedUsers } from '../server/api.mjs';
import * as MELT from '../public/js/melt.mjs';

let server, base, token;
const call = async (method, path, body, auth) => {
  const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(auth ? { authorization: `Bearer ${auth}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null), headers: r.headers };
};
const login = async (phone) => (await call('POST', '/api/auth/login', { phone, pin: '1234' })).body.token;
const rpc = async (msg, headers = {}) => {
  const r = await fetch(`${base}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${token}`, ...headers }, body: JSON.stringify(msg) });
  return { status: r.status, body: r.status === 202 ? null : await r.json() };
};
const tool = async (name, args) => (await rpc({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name, arguments: args } })).body.result;

before(async () => {
  const db = openDb(':memory:');
  seedUsers(db, {}, true);
  server = createServer({ db, secret: 'test-secret-0123456789', demo: true, quiet: true, marketOpts: { fetchImpl: async () => new Response('{}', { status: 404 }), envMode: undefined, defaultMode: 'off' } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

test('MCP: بدون توکن ۴۰۱، فقط POST، مبدأ بیگانه ۴۰۳؛ توکن را فقط مدیر می‌سازد', async () => {
  const r = await fetch(`${base}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(r.status, 401);
  assert.match(r.headers.get('www-authenticate'), /Bearer/);
  assert.equal((await fetch(`${base}/mcp`)).status, 405);
  assert.equal((await call('POST', '/api/mcp/token', null, await login('09120000004'))).status, 403);
  const m = await login('09120000002');
  const t = await call('POST', '/api/mcp/token', null, m);
  assert.equal(t.status, 200);
  assert.match(t.body.token, /^btr_[\w-]{40,}$/);
  token = t.body.token;
  assert.equal((await call('GET', '/api/mcp', null, m)).body.configured, true);
  assert.ok(!JSON.stringify((await call('GET', '/api/mcp', null, m)).body).includes(token));
  const foreign = await rpc({ jsonrpc: '2.0', id: 1, method: 'ping' }, { origin: 'https://evil.example' });
  assert.equal(foreign.status, 403);
});

test('MCP: initialize، اعلان‌ها ۲۰۲، فهرست ابزارها و خطاهای پروتکل', async () => {
  const init = await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 't', version: '1' } } });
  assert.equal(init.status, 200);
  assert.equal(init.body.result.protocolVersion, '2025-03-26');
  assert.ok(init.body.result.capabilities.tools);
  assert.equal(init.body.result.serverInfo.name, 'beatris');
  const odd = await rpc({ jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '1999-01-01' } });
  assert.equal(odd.body.result.protocolVersion, '2025-06-18');
  assert.equal((await rpc({ jsonrpc: '2.0', method: 'notifications/initialized' })).status, 202);
  const list = (await rpc({ jsonrpc: '2.0', id: 3, method: 'tools/list' })).body.result.tools;
  assert.equal(list.length, 12);
  assert.ok(list.some((t) => t.name === 'search_knowledge'));
  for (const t of list) assert.ok(t.name && t.description && t.inputSchema?.type === 'object' && !('run' in t), t.name);
  assert.equal((await rpc({ jsonrpc: '2.0', id: 4, method: 'resources/list' })).body.error.code, -32601);
  assert.equal((await rpc({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'constructor' } })).body.error.code, -32602);
  assert.equal((await rpc({ nope: true })).body.error.code, -32600);
  const bad = await fetch(`${base}/mcp`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: '{oops' });
  assert.equal((await bad.json()).error.code, -32700);
  const batch = await rpc([{ jsonrpc: '2.0', id: 10, method: 'ping' }, { jsonrpc: '2.0', method: 'notifications/initialized' }, { jsonrpc: '2.0', id: 11, method: 'tools/list' }]);
  assert.deepEqual(batch.body.map((x) => x.id), [10, 11]);
});

test('MCP: ابزارها همان موتور برنامه را اجرا می‌کنند', async () => {
  const kb = await tool('search_knowledge', { q: 'مظنه چیست', k: 3 });
  assert.equal(kb.structuredContent.results.length, 3);
  assert.ok(kb.structuredContent.results.some((r) => r.title === 'مظنه'));
  const g = await tool('gold_value', { weight: 20, fineness: 740, mazaneh: 40000000 });
  assert.equal(g.structuredContent.value, MELT.ledgerValue(20, 740, 40e6));
  assert.equal(g.structuredContent.eq750, 19.733);
  const m = await tool('melt_trade', { side: 'buy', weight: 15.6, fineness: 745, mazaneh: 39800000 });
  assert.equal(m.structuredContent.cashDelta, -142375000);
  const inv = await tool('jewelry_invoice', { weight: 5, p750: 8e6, ojrat: 15 });
  assert.ok(inv.structuredContent.total > 40e6 && inv.structuredContent.vat > 0);
  const bad = await tool('gold_value', { weight: -1, fineness: 740 });
  assert.equal(bad.isError, true);
  const extra = await tool('gold_value', { weight: 1, fineness: 740, hack: 1 });
  assert.equal(extra.isError, true);
  const f = await tool('fraud_probability', { baseRate: 0.05, tests: [{ test: 'coin.magnet', flagged: true }] });
  assert.ok(f.structuredContent.pFraud > 0.9 && f.structuredContent.decision === 'reject');
  const unk = await tool('fraud_probability', { baseRate: 0.05, tests: [{ test: 'crystal-ball', flagged: true }] });
  assert.equal(unk.isError, true);
  // sample market: everything is computed and marked as sample
  const board = await tool('market_board', {});
  assert.equal(board.structuredContent.sample, true);
  assert.equal(board.structuredContent.prices.length, 11);
  const a = (await tool('market_analysis', { symbol: 'mesghal' })).structuredContent;
  assert.ok(a.patientBid <= a.close && a.patientAsk >= a.close && ['up', 'down', 'side'].includes(a.trend));
  const c = (await tool('coin_value', { coin: 'sekee', price: 240505000, ounce: 4200, usd: 235000 })).structuredContent;
  assert.equal(c.worldValue, 232274480);
  assert.equal(c.bubblePct, 3.54);
  const h = (await tool('market_history', { symbol: 'usd', limit: 5 })).structuredContent;
  assert.equal(h.bars.length, 5);
  assert.equal((await tool('coin_specs', {})).structuredContent.coins.length, 8);
  assert.ok((await tool('course_catalog', {})).structuredContent.courses.some((x) => x.id === 'c-market'));
});

test('MCP: ابطال توکن دسترسی را فوراً قطع می‌کند', async () => {
  await call('DELETE', '/api/mcp/token', null, await login('09120000002'));
  assert.equal((await rpc({ jsonrpc: '2.0', id: 1, method: 'ping' })).status, 401);
});
