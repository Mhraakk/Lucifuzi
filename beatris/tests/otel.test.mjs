// AI traces (spec 0048): the OTLP protobuf the app writes, the destinations it reads from the environment, the spans of
// a real question through the gateway and the assistant, what never leaves the server, and that a dead collector
// changes nothing for the user.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeTraces, destinations, parseHeaders, createTracer, userTag } from '../server/otel.mjs';
import { createGateway } from '../server/gateway.mjs';
import { makeAssistant } from '../server/assistant.mjs';
import { openDb } from '../server/db.mjs';
import { createServer } from '../server/index.mjs';
import { seedUsers } from '../server/api.mjs';

/* ---------------- a small protobuf reader, to read back what the app wrote ---------------- */
function fields(buf) {
  const out = [];
  let i = 0;
  const varint = () => {
    let r = 0n, s = 0n, b;
    do {
      b = buf[i++];
      r |= BigInt(b & 0x7f) << s;
      s += 7n;
    } while (b & 0x80);
    return r;
  };
  while (i < buf.length) {
    const key = Number(varint());
    const field = key >> 3, wire = key & 7;
    if (wire === 0) out.push({ field, value: varint() });
    else if (wire === 1) out.push({ field, value: buf.slice(i, (i += 8)) });
    else if (wire === 2) {
      const n = Number(varint());
      out.push({ field, value: buf.slice(i, (i += n)) });
    } else throw new Error(`wire type ${wire}`);
  }
  return out;
}
const all = (buf, f) => fields(buf).filter((x) => x.field === f).map((x) => x.value);
const one = (buf, f) => all(buf, f)[0];
const str = (u8) => new TextDecoder().decode(u8);
const hex = (u8) => Buffer.from(u8).toString('hex');
const u64 = (u8) => new DataView(u8.buffer, u8.byteOffset, 8).getBigUint64(0, true);
function anyValue(buf) {
  const [x] = fields(buf);
  if (x.field === 1) return str(x.value);
  if (x.field === 2) return x.value === 1n;
  if (x.field === 3) return Number(BigInt.asIntN(64, x.value));
  if (x.field === 4) return new DataView(x.value.buffer, x.value.byteOffset, 8).getFloat64(0, true);
  if (x.field === 5) return all(x.value, 1).map(anyValue);
  throw new Error(`value field ${x.field}`);
}
const attrs = (list) => Object.fromEntries(list.map((kv) => [str(one(kv, 1)), anyValue(one(kv, 2))]));
function readRequest(buf) {
  const rs = one(buf, 1);
  const ss = one(rs, 2);
  const sc = one(ss, 1);
  return {
    resource: attrs(all(one(rs, 1), 1)),
    scope: { name: str(one(sc, 1)), version: one(sc, 2) ? str(one(sc, 2)) : '' },
    spans: all(ss, 2).map((s) => ({
      traceId: hex(one(s, 1)),
      spanId: hex(one(s, 2)),
      parentId: one(s, 4) ? hex(one(s, 4)) : null,
      name: str(one(s, 5)),
      kind: Number(one(s, 6)),
      start: u64(one(s, 7)),
      end: u64(one(s, 8)),
      attrs: attrs(all(s, 9)),
      events: all(s, 11).map((e) => ({ time: u64(one(e, 1)), name: str(one(e, 2)), attrs: attrs(all(e, 3)) })),
      status: one(s, 15) ? { message: one(one(s, 15), 2) ? str(one(one(s, 15), 2)) : '', code: Number(one(one(s, 15), 3) ?? 0n) } : null,
    })),
  };
}

/* a collector that keeps what it gets */
const collector = (respond = () => new Response(null, { status: 200 })) => {
  const got = [];
  const fetchImpl = async (url, init) => {
    got.push({ url, headers: init.headers, body: init.body });
    return respond(url, init, got.length);
  };
  return { got, fetchImpl };
};
const ENV = { BEATRIS_OTEL_ENDPOINT: 'http://collector.test/v1/traces' };

test('protobuf: resource, scope, ids, times, every attribute kind, events and status read back as written', () => {
  const ids = { traceId: Uint8Array.from({ length: 16 }, (_, i) => i + 1), spanId: Uint8Array.from({ length: 8 }, (_, i) => 200 + i), parentId: Uint8Array.from({ length: 8 }, (_, i) => 100 + i) };
  const span = { ...ids, name: 'chat مدل', kind: 3, start: 1761200000123456789n, end: 1761200000987654321n,
    attrs: { s: 'متن', i: 42, neg: -7, big: 2 ** 40, d: 0.25, t: true, f: false, arr: ['a', 'ب'], nums: [1, 2], skip: undefined, nan: NaN },
    events: [{ time: 1761200000500000000n, name: 'retry', attrs: { 'error.type': '503' } }], status: { code: 2, message: 'خطا' } };
  const r = readRequest(encodeTraces({ 'service.name': 'beatris' }, { name: 'beatris.ai', version: '1' }, [span]));
  assert.deepEqual(r.resource, { 'service.name': 'beatris' });
  assert.deepEqual(r.scope, { name: 'beatris.ai', version: '1' });
  const s = r.spans[0];
  assert.equal(s.traceId, hex(ids.traceId));
  assert.equal(s.spanId, hex(ids.spanId));
  assert.equal(s.parentId, hex(ids.parentId));
  assert.equal(s.name, 'chat مدل');
  assert.equal(s.kind, 3);
  assert.equal(s.start, 1761200000123456789n);
  assert.equal(s.end, 1761200000987654321n);
  assert.deepEqual(s.attrs, { s: 'متن', i: 42, neg: -7, big: 2 ** 40, d: 0.25, t: true, f: false, arr: ['a', 'ب'], nums: [1, 2] });
  assert.deepEqual(s.events, [{ time: 1761200000500000000n, name: 'retry', attrs: { 'error.type': '503' } }]);
  assert.deepEqual(s.status, { code: 2, message: 'خطا' });
});

test('destinations: Langfuse, Traceloop, AgentOps and any collector, from the environment only', async () => {
  assert.deepEqual(destinations({}), []);
  const [lf] = destinations({ LANGFUSE_PUBLIC_KEY: 'pk-lf-1', LANGFUSE_SECRET_KEY: 'sk-lf-2', LANGFUSE_BASE_URL: 'https://lf.example.com/' });
  assert.equal(lf.url, 'https://lf.example.com/api/public/otel/v1/traces');
  assert.deepEqual(await lf.headers(), { authorization: `Basic ${Buffer.from('pk-lf-1:sk-lf-2').toString('base64')}`, 'x-langfuse-ingestion-version': '4' });
  assert.equal(destinations({ LANGFUSE_PUBLIC_KEY: 'a', LANGFUSE_SECRET_KEY: 'b' })[0].url, 'https://cloud.langfuse.com/api/public/otel/v1/traces');
  assert.equal(destinations({ LANGFUSE_PUBLIC_KEY: 'a' }).length, 0, 'half a key pair sends nothing');
  const [tl] = destinations({ TRACELOOP_API_KEY: 'tl-key' });
  assert.equal(tl.url, 'https://api.traceloop.com/v1/traces');
  assert.deepEqual(await tl.headers(), { authorization: 'Bearer tl-key' });
  const [g] = destinations({ BEATRIS_OTEL_ENDPOINT: 'http://c:4318/v1/traces', BEATRIS_OTEL_HEADERS: 'Authorization=Bearer%20x,x-scope = shop , bad' });
  assert.deepEqual(await g.headers(), { authorization: 'Bearer x', 'x-scope': 'shop' });
  assert.deepEqual(parseHeaders(''), {});
  // AgentOps: the key buys a token; a 401 on the export buys a new one and tries once more
  let tokens = 0;
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push([url, init.headers?.authorization ?? JSON.parse(init.body ?? '{}').api_key]);
    if (url.endsWith('/v3/auth/token')) return Response.json({ token: `jwt-${++tokens}` });
    return new Response(null, { status: seen.filter(([u]) => u.includes('otlp')).length === 1 ? 401 : 200 });
  };
  const tr = createTracer({ env: { AGENTOPS_API_KEY: 'ao-key' }, fetchImpl, flushMs: 60000 });
  assert.deepEqual(tr.stats().destinations, ['agentops']);
  tr.start('x').end();
  await tr.flush();
  assert.deepEqual(seen, [['https://api.agentops.ai/v3/auth/token', 'ao-key'], ['https://otlp.agentops.ai/v1/traces', 'Bearer jwt-1'], ['https://api.agentops.ai/v3/auth/token', 'ao-key'], ['https://otlp.agentops.ai/v1/traces', 'Bearer jwt-2']]);
  assert.equal(tr.stats().sent, 1);
  // nothing set: off, and a run is just the function
  const off = createTracer({ env: {} });
  assert.equal(off.on, false);
  assert.equal(await off.run('x', {}, async (s) => (s.set('a', 1), 7)), 7);
  assert.deepEqual(off.stats().destinations, []);
  assert.match(userTag('u1'), /^[0-9a-f]{16}$/);
  assert.equal(userTag('u1'), userTag('u1'));
});

/* a question through the real assistant and gateway: a local model that calls one read-only tool, then answers */
function shop({ tracer, modelFetch }) {
  const stubCall = (m, p) => (p === '/api/books/parties' ? { items: [{ id: 'x', code: 1, label: 'مهران رضایی', mobile: '09121234567', balance: { IRR: 1250000000 } }] } : {});
  return makeAssistant({ db: { all: () => [] }, call: stubCall, audit: {}, settings: () => ({}), tehranDay: () => '2026-01-01', livePrices: () => ({ price: {} }), isAdmin: () => true,
    env: { AGENT_LLM_URL: 'http://127.0.0.1:11434/v1', AGENT_LLM_MODEL: 'local-accounting', AGENT_LLM_KEY: 'k-secret-123' }, fetchImpl: modelFetch, tracer });
}
const modelFetch = async (url, init) => {
  const body = JSON.parse(init.body);
  const last = body.messages.at(-1);
  if (last.role === 'user') return Response.json({ id: 'r1', model: 'local-accounting', usage: { prompt_tokens: 50, completion_tokens: 7 }, choices: [{ finish_reason: 'tool_calls', message: { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'find_parties', arguments: '{"q":"مهران"}' } }] } }] });
  return Response.json({ id: 'r2', model: 'local-accounting', usage: { prompt_tokens: 90, completion_tokens: 12 }, choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'مانده ۱۲۵ میلیون تومان است.' } }] });
};
const Q = 'مانده مهران با موبایل 09121234567 چقدر است؟';

test('a question is one trace: the assistant span, its two model calls and its tool step, with tokens and names', async () => {
  const c = collector();
  const tracer = createTracer({ env: ENV, fetchImpl: c.fetchImpl, flushMs: 60000, build: 'abc1234' });
  const r = await shop({ tracer, modelFetch }).ask({ id: 'u7' }, { question: Q });
  assert.equal(r.answer, 'مانده ۱۲۵ میلیون تومان است.');
  // the answer names its trace, and a later verdict can join it (scripts/ai-trace.mjs)
  tracer.start('eval x', { parent: r.trace.otel, attrs: { 'beatris.eval.pass': true } }).end();
  await tracer.flush();
  assert.equal(c.got.length, 1);
  assert.equal(c.got[0].url, ENV.BEATRIS_OTEL_ENDPOINT);
  assert.equal(c.got[0].headers['content-type'], 'application/x-protobuf');
  const req = readRequest(c.got[0].body);
  assert.equal(req.resource['service.name'], 'beatris');
  assert.equal(req.resource['service.version'], 'abc1234');
  const by = (n) => req.spans.filter((s) => s.name === n);
  const [root] = by('assistant');
  const chats = by('chat local-accounting');
  const [tool] = by('execute_tool find_parties');
  assert.ok(root && tool && chats.length === 2, req.spans.map((s) => s.name).join());
  assert.equal(root.parentId, null);
  assert.deepEqual(r.trace.otel, { traceId: root.traceId, spanId: root.spanId });
  for (const s of [...chats, tool, ...by('eval x')]) {
    assert.equal(s.traceId, root.traceId);
    assert.equal(s.parentId, root.spanId);
  }
  assert.deepEqual([root.attrs['langfuse.observation.type'], root.attrs['gen_ai.operation.name'], root.attrs['beatris.engine']], ['agent', 'invoke_agent', 'local-llm']);
  assert.deepEqual(root.attrs['beatris.tools'], ['find_parties']);
  assert.equal(root.attrs['langfuse.user.id'], userTag('u7'));
  assert.deepEqual(chats.map((s) => [s.attrs['gen_ai.usage.input_tokens'], s.attrs['gen_ai.usage.output_tokens']]), [[50, 7], [90, 12]]);
  assert.equal(chats[0].attrs['gen_ai.request.model'], 'local-accounting');
  assert.equal(chats[0].attrs['gen_ai.response.model'], 'local-accounting');
  assert.deepEqual(chats[0].attrs['gen_ai.response.finish_reasons'], ['tool_calls']);
  assert.equal(chats[0].attrs['gen_ai.provider.name'], 'env-local');
  assert.equal(chats[0].attrs['server.address'], '127.0.0.1');
  assert.equal(chats[0].attrs['langfuse.observation.type'], 'generation');
  assert.equal(chats[0].kind, 3);
  assert.equal(tool.attrs['gen_ai.tool.name'], 'find_parties');
  assert.ok(chats[0].end >= chats[0].start && root.end >= chats[1].end);
  // by default no text of the conversation and no key leaves the server
  const bytes = Buffer.from(c.got[0].body).toString('utf8');
  for (const secret of ['09121234567', 'مهران', '1250000000', 'مانده ۱۲۵', 'k-secret-123', 'Bearer']) assert.ok(!bytes.includes(secret), `«${secret}» was exported`);
});

test('with content on, prompts and answers go out masked, even what the shop\'s own model saw as it is', async () => {
  const c = collector();
  const tracer = createTracer({ env: { ...ENV, BEATRIS_OTEL_CONTENT: '1' }, fetchImpl: c.fetchImpl, flushMs: 60000 });
  await shop({ tracer, modelFetch }).ask({ id: 'u7' }, { question: Q });
  await tracer.flush();
  const req = readRequest(c.got[0].body);
  const bytes = Buffer.from(c.got[0].body).toString('utf8');
  assert.ok(!bytes.includes('09121234567'), 'the full mobile never leaves');
  assert.ok(bytes.includes('0912***4567'));
  assert.ok(!bytes.includes('k-secret-123'));
  const root = req.spans.find((s) => s.name === 'assistant');
  assert.match(root.attrs['langfuse.observation.input'], /0912\*\*\*4567/);
  assert.equal(root.attrs['langfuse.observation.output'], 'مانده ۱۲۵ میلیون تومان است.');
  const chat = req.spans.find((s) => s.name.startsWith('chat'));
  assert.ok(JSON.parse(chat.attrs['gen_ai.input.messages']).some((m) => m.role === 'user'));
  assert.equal(chat.attrs['gen_ai.prompt'], chat.attrs['gen_ai.input.messages']);
  const tool = req.spans.find((s) => s.name.startsWith('execute_tool'));
  assert.match(tool.attrs['gen_ai.tool.call.result'], /مهران رضایی/);
  assert.deepEqual(JSON.parse(tool.attrs['gen_ai.tool.call.arguments']), { q: 'مهران' });
});

test('a dead, slow or failing collector changes nothing for the user; the queue stays bounded', async () => {
  for (const respond of [async () => {
    throw new Error('ECONNREFUSED');
  }, async () => new Response(null, { status: 500 }), (url, init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(new Error('aborted'))))]) {
    const c = collector(respond);
    const tracer = createTracer({ env: ENV, fetchImpl: c.fetchImpl, flushMs: 60000, timeoutMs: 50 });
    const r = await shop({ tracer, modelFetch }).ask({ id: 'u' }, { question: 'مانده مهران؟' });
    assert.equal(r.answer, 'مانده ۱۲۵ میلیون تومان است.');
    await tracer.flush();
    assert.equal(c.got.length, 2, 'one retry, then the batch is let go');
    assert.deepEqual([tracer.stats().sent, tracer.stats().failed, tracer.stats().queued], [0, 4, 0]);
  }
  const t = createTracer({ env: ENV, fetchImpl: async () => new Response(null, { status: 200 }), flushMs: 60000, maxQueue: 5, maxBatch: 100 });
  for (let i = 0; i < 8; i++) t.start(`s${i}`).end();
  assert.deepEqual([t.stats().queued, t.stats().dropped], [5, 3]);
  // an error in a model call is on its span, and the gateway still throws it to its caller as before
  const c = collector();
  const tracer = createTracer({ env: ENV, fetchImpl: c.fetchImpl, flushMs: 60000 });
  const gw = createGateway({ fetchImpl: async () => new Response('{}', { status: 503 }), sleep: async () => {}, tracer });
  await assert.rejects(gw.post('p1', 'https://api.openai.com/v1/chat/completions', { authorization: 'Bearer sk-hidden' }, { model: 'm' }), /HTTP 503/);
  await tracer.flush();
  const [s] = readRequest(c.got[0].body).spans;
  assert.deepEqual([s.status.code, s.attrs['error.type'], s.attrs['beatris.attempts'], s.attrs['gen_ai.provider.name'], s.events[0].name], [2, '503', 2, 'openai', 'retry']);
  assert.ok(!Buffer.from(c.got[0].body).toString('utf8').includes('sk-hidden'));
});

test('deep health says whether traces are on, by destination name only', async () => {
  const db = openDb(':memory:');
  seedUsers(db, {}, true);
  const server = createServer({ db, secret: 'test-secret-0123456789', demo: true, quiet: true, marketOpts: { fetchImpl: async () => new Response('{}', { status: 404 }), defaultMode: 'off' } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    const h = await (await fetch(`http://127.0.0.1:${server.address().port}/api/health?deep=1`)).json();
    assert.equal(h.otel, 'off'); // the tests' environment names no destination
  } finally {
    server.close();
  }
});
