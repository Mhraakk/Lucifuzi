import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.mjs';
import { createServer } from '../server/index.mjs';
import { seedUsers } from '../server/api.mjs';

// the providers are faked at the network edge: every other request goes to the real test server
const realFetch = globalThis.fetch;
const seen = [];
let anthropicDown = false;
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (!/^https:\/\//.test(u)) return realFetch(url, opts);
  const body = opts.body ? JSON.parse(opts.body) : {};
  const h = opts.headers ?? {};
  seen.push({ url: u, auth: h.authorization ?? h['x-api-key'] ?? '', model: body.model });
  if (u.startsWith('https://api.anthropic.com/')) {
    if (anthropicDown || h['x-api-key'] !== 'sk-ant-test-0001') return new Response('{}', { status: anthropicDown ? 529 : 401 });
    return Response.json({ content: [{ type: 'text', text: 'پاسخ از Claude' }], stop_reason: 'end_turn' });
  }
  if (u.startsWith('https://api.openai.com/') || u.startsWith('https://generativelanguage.googleapis.com/') || u.startsWith('https://api.x.ai/')) {
    const who = u.includes('openai.com') ? 'OpenAI' : u.includes('googleapis') ? 'Gemini' : 'Grok';
    if (!String(h.authorization).startsWith('Bearer sk-')) return new Response('{}', { status: 401 });
    return Response.json({ choices: [{ message: { role: 'assistant', content: `پاسخ از ${who}` } }] });
  }
  return new Response('{}', { status: 404 });
};

let server, base, db, V, T, E;
const call = async (method, path, body, token) => {
  const r = await realFetch(base + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const ok = async (...a) => {
  const r = await call(...a);
  assert.ok(r.status < 300, `${a[0]} ${a[1]} → ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
};

before(async () => {
  db = openDb(':memory:');
  seedUsers(db, {}, true);
  server = createServer({ db, secret: 'test-secret-0123456789', demo: true, quiet: true, tenantsDir: ':memory:', marketOpts: { fetchImpl: async () => new Response('{}', { status: 404 }), defaultMode: 'off' } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  V = (await ok('POST', '/api/auth/login', { phone: '09120000001', pin: '1234' })).token;
  const shop = await ok('POST', '/api/vendor/tenants', { name: 'فروشگاه کلید', username: 'keys.shop' }, V);
  T = (await ok('POST', '/api/auth/login', { login: 'keys.shop', password: shop.password })).token;
  const emp = await ok('POST', `/api/vendor/tenants/${shop.tenant.id}/users`, { name: 'فروشنده', username: 'keys.emp', role: 'employee' }, V);
  E = (await ok('POST', '/api/auth/login', { login: 'keys.emp', password: emp.password })).token;
});
after(() => {
  server.close();
  globalThis.fetch = realFetch;
});

test('کلیدهای هوش مصنوعی: ذخیره رمزشده، آزمون اتصال، ترتیب و جایگزینی خودکار', async () => {
  const cat = await ok('GET', '/api/books/ai', null, T);
  for (const k of ['anthropic', 'openai', 'gemini', 'xai', 'qwen', 'opencode', 'deepseek', 'openrouter', 'custom']) assert.ok(cat.catalog.some((c) => c.id === k), k);
  assert.equal((await call('GET', '/api/books/ai', null, E)).status, 403);
  // bad inputs
  assert.equal((await call('POST', '/api/books/ai', { kind: 'openai', model: 'm', key: 'short' }, T)).status, 400);
  assert.equal((await call('POST', '/api/books/ai', { kind: 'custom', model: 'm', key: 'sk-12345678', base: 'http://example.com/v1' }, T)).status, 400);
  assert.equal((await call('POST', '/api/books/ai', { kind: 'custom', model: 'm', key: 'sk-12345678', base: 'https://localhost/v1' }, T)).status, 400);
  assert.equal((await call('POST', '/api/books/ai', { kind: 'custom', model: 'm', key: 'sk-12345678', base: 'https://10.0.0.5/v1' }, T)).status, 400);
  // Claude first, OpenAI second, Gemini third
  const c = await ok('POST', '/api/books/ai', { kind: 'anthropic', model: 'my-claude-model', key: 'sk-ant-test-0001' }, T);
  const o = await ok('POST', '/api/books/ai', { kind: 'openai', model: 'my-gpt-model', key: 'sk-openai-test-0002' }, T);
  const g = await ok('POST', '/api/books/ai', { kind: 'gemini', model: 'my-gemini-model', key: 'sk-gemini-test-0003' }, T);
  assert.equal(c.keyHint, '••••0001');
  assert.ok(!JSON.stringify(await ok('GET', '/api/books/ai', null, T)).includes('sk-ant-test'));
  // the stored settings hold no key in the clear
  const tdb = server.platform.handleFor((await ok('GET', '/api/me', null, T)).tenant.id).db;
  const raw = tdb.get("SELECT value_json FROM settings WHERE key='ai'").value_json;
  assert.ok(!raw.includes('sk-ant-test-0001') && !raw.includes('sk-openai-test-0002'));
  // connection test
  const t1 = await ok('POST', `/api/books/ai/${o.id}/test`, null, T);
  assert.equal(t1.ok, true);
  assert.equal(seen.at(-1).model, 'my-gpt-model');
  // answers come from the first engine…
  let a = await ok('POST', '/api/books/assistant', { question: 'وضعیت امروز چطور است؟' }, E);
  assert.equal(a.answer, 'پاسخ از Claude');
  assert.equal(a.engine, 'claude');
  // …and when it is down, from the next one, saying which one was skipped
  anthropicDown = true;
  a = await ok('POST', '/api/books/assistant', { question: 'وضعیت امروز چطور است؟' }, E);
  assert.equal(a.answer, 'پاسخ از OpenAI');
  assert.match(a.skipped[0], /Claude/);
  const t2 = await ok('POST', `/api/books/ai/${c.id}/test`, null, T);
  assert.equal(t2.ok, false);
  // reorder: Gemini first
  await ok('PUT', '/api/books/ai', { order: [g.id, o.id, c.id] }, T);
  a = await ok('POST', '/api/books/assistant', { question: 'سلام' }, E);
  assert.equal(a.answer, 'پاسخ از Gemini');
  // disable Gemini and OpenAI, Claude still down → the books engine answers
  await ok('PUT', `/api/books/ai/${g.id}`, { enabled: false }, T);
  await ok('PUT', `/api/books/ai/${o.id}`, { enabled: false }, T);
  a = await ok('POST', '/api/books/assistant', { question: 'کمک' }, E);
  assert.equal(a.engine, 'books');
  assert.match(a.fallback, /Claude/);
  // replace a key, delete a provider
  await ok('PUT', `/api/books/ai/${o.id}`, { key: 'sk-openai-new-9999', enabled: true }, T);
  assert.equal((await ok('GET', '/api/books/ai', null, T)).providers.find((p) => p.id === o.id).keyHint, '••••9999');
  await ok('DELETE', `/api/books/ai/${g.id}`, null, T);
  assert.equal((await ok('GET', '/api/books/ai', null, T)).providers.length, 2);
  // another shop (the main one) does not use these keys
  const before = seen.length;
  const m = await ok('POST', '/api/books/assistant', { question: 'سلام' }, V);
  assert.equal(m.engine, 'books');
  assert.equal(seen.length, before);
  // Grok through its own endpoint
  await ok('POST', '/api/books/ai', { kind: 'xai', model: 'my-grok-model', key: 'sk-xai-test-0004', priority: -1 }, T);
  a = await ok('POST', '/api/books/assistant', { question: 'سلام' }, E);
  assert.equal(a.answer, 'پاسخ از Grok');
});
