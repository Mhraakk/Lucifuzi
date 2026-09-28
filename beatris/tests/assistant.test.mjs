import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.mjs';
import { createServer } from '../server/index.mjs';
import { seedUsers } from '../server/api.mjs';
import { makeAssistant } from '../server/assistant.mjs';

let server, base, M, E;
const call = async (method, path, body, token) => {
  const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const ok = async (...a) => {
  const r = await call(...a);
  assert.ok(r.status < 300, `${a[0]} ${a[1]} → ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
};
const ask = async (question, token = M) => (await ok('POST', '/api/books/assistant', { question }, token)).answer;
const login = async (phone) => (await call('POST', '/api/auth/login', { phone, pin: '1234' })).body.token;
const MAZ = 400000000;

before(async () => {
  const db = openDb(':memory:');
  seedUsers(db, {}, true);
  server = createServer({ db, secret: 'test-secret-0123456789', demo: true, quiet: true, marketOpts: { fetchImpl: async () => new Response('{}', { status: 404 }), defaultMode: 'off' } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  M = await login('09120000002');
  E = await login('09120000004');
});
after(() => server.close());

let mehran, bank, t1;
test('نام خانه روی سربرگ و فاکتور', async () => {
  assert.equal((await ok('GET', '/api/config')).shopName, 'خانه سکه و شمش تاج');
  assert.equal((await ok('GET', '/api/books/settings', null, M)).legalName, 'خانه سکه و شمش تاج');
});

test('ممیز: فروش بیش از موجودی، شماره پیگیری تکراری و ثبت تکراری را می‌گیرد', async () => {
  mehran = await ok('POST', '/api/books/parties', { name: 'مهران رضایی', mobile: '09121112233' }, E);
  bank = (await ok('GET', '/api/books/accounts', null, M)).items.find((a) => a.kind === 'bank');
  const clean = await ok('GET', '/api/books/audit', null, M);
  assert.equal(clean.count.high, 0, JSON.stringify(clean.findings));
  assert.ok(clean.findings.some((f) => f.code === 'chain.ok'));
  const doc = { type: 'trade', partyId: mehran.id, lines: [{ kind: 'coin', dir: 'out', coin: 'emami', count: 5, price: 985000000 }], payments: [{ method: 'pos', dir: 'in', amount: 925000000, account: bank.id, ref: '99887766' }] };
  t1 = await ok('POST', '/api/books/docs', doc, E);
  await ok('POST', '/api/books/docs', doc, E); // typed twice by mistake
  const a = await ok('GET', '/api/books/audit', null, M);
  const codes = a.findings.map((f) => f.code);
  assert.ok(codes.includes('stock.neg'), codes.join());
  assert.ok(codes.includes('dup.ref'), codes.join());
  assert.ok(codes.includes('dup.doc'), codes.join());
  assert.ok(a.score < 50);
  assert.equal(a.findings[0].sev, 'high');
  const one = await ok('GET', `/api/books/audit?doc=${t1.id}`, null, E);
  assert.ok(one.findings.some((f) => f.code === 'dup.doc'));
  // staff see the audit too (bank reconciliation lines only for managers)
  assert.equal((await call('GET', '/api/books/audit', null, E)).status, 200);
});

test('ته حساب با اصطلاح بازار: ۵ سکه بدهکار جنسی و مانده مالی جدا', async () => {
  const r = await ok('GET', `/api/books/parties/${mehran.id}`, null, M);
  // two sales of 5 coins each on account: 10 × 985,000,000 − 2 × 925,000,000 paid
  assert.deepEqual(r.balance, { IRR: 8000000000 });
  const s = r.statement.at(-1);
  assert.ok(s.what.lines.length === 1 && s.what.pays[0].method === 'pos');
  // goods on account: the customer leaves 5 coins with the shop
  await ok('POST', '/api/books/docs', { type: 'trade', partyId: mehran.id, lines: [{ kind: 'coin', dir: 'in', coin: 'emami', count: 5, priced: false }] }, E);
  const ans = await ask('مانده مهران رضایی');
  assert.match(ans, /۸٬۰۰۰٬۰۰۰٬۰۰۰ ریال بدهکار مالی/);
  assert.match(ans, /۵ عدد تمام امامی بستانکار جنسی \(طلبکار\)/);
});

test('دستیار بدون مدل: محاسبه، روزنگار، بدهکاران، گاوصندوق، ممیز، سریال، راهنما', async () => {
  const calc = await ask('محاسبه ۲ گرم عیار ۷۴۰ مظنه ۴۰۰٬۰۰۰٬۰۰۰');
  assert.match(calc, /معادل ۷۵۰: ۱٫۹۷۳/);
  assert.match(calc, /۱۸۲٬۱۹۰٬۰۰۰ ریال/);
  assert.match(calc, /چیزی ثبت نشد/);
  assert.match(await ask('۳ تمام امامی به ۹۸۵۰۰۰۰۰۰ محاسبه'), /۲٬۹۵۵٬۰۰۰٬۰۰۰ ریال/);
  assert.match(await ask('روزنگار امروز', E), /سند قطعی/);
  assert.match(await ask('بدهکاران'), /مهران رضایی/);
  assert.match(await ask('طلبکاران'), /تمام امامی/);
  assert.match(await ask('گاوصندوق'), /طلا/);
  assert.match(await ask('ممیز'), /امتیاز سلامت/);
  assert.match(await ask('سریال 12345'), /در دفتر نیست/);
  assert.match(await ask('سود و زیان', E), /مخصوص مدیر/);
  assert.match(await ask('راهنما'), /بدهکاران/);
  const info = await ok('GET', '/api/books/assistant', null, E);
  assert.equal(info.engine, 'books');
});

test('موتور مدل محلی (سازگار با OpenAI): ابزار فقط‌خواندنی صدا زده می‌شود و پاسخ برمی‌گردد', async () => {
  const seen = [];
  const fakeFetch = async (url, init) => {
    const body = JSON.parse(init.body);
    seen.push({ url, body });
    const last = body.messages.at(-1);
    if (last.role === 'user') return Response.json({ choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'find_parties', arguments: JSON.stringify({ q: 'مهران' }) } }] } }] });
    const data = JSON.parse(last.content);
    return Response.json({ choices: [{ message: { role: 'assistant', content: `پیدا شد: ${data[0].label}` } }] });
  };
  const stubCall = (m, p) => (p === '/api/books/parties' ? { items: [{ id: 'x', code: 1, label: 'مهران رضایی', balance: { IRR: 5 } }] } : {});
  const a = makeAssistant({ db: { all: () => [] }, call: stubCall, audit: {}, settings: () => ({}), tehranDay: () => '2026-01-01', livePrices: () => ({ price: {} }), isAdmin: () => true, env: { AGENT_LLM_URL: 'http://127.0.0.1:11434/v1/', AGENT_LLM_MODEL: 'local-accounting' }, fetchImpl: fakeFetch });
  assert.equal(a.info().engine, 'local-llm');
  const r = await a.ask({ id: 'u' }, { question: 'مانده مهران؟' });
  assert.deepEqual([r.engine, r.answer], ['local-llm', 'پیدا شد: مهران رضایی']);
  assert.equal(seen[0].url, 'http://127.0.0.1:11434/v1/chat/completions');
  assert.ok(seen[0].body.tools.every((t) => !/save|post|void|delete/.test(t.function.name)));
  // the model is unreachable → the books engine answers instead
  const down = makeAssistant({ db: { all: () => [] }, call: stubCall, audit: {}, settings: () => ({}), tehranDay: () => '2026-01-01', livePrices: () => ({ price: {} }), isAdmin: () => true, env: { AGENT_LLM_URL: 'http://127.0.0.1:9/v1', AGENT_LLM_MODEL: 'm' }, fetchImpl: async () => { throw new Error('ECONNREFUSED'); } });
  const f = await down.ask({ id: 'u' }, { question: 'راهنما' });
  assert.equal(f.engine, 'books');
  assert.ok(f.fallback);
});
