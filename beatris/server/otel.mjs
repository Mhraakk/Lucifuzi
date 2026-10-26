// AI traces (spec 0048): every model call, assistant question and tool step as an OpenTelemetry span in the GenAI
// conventions (gen_ai.*), sent over OTLP/HTTP as protobuf to Langfuse, Traceloop (OpenLLMetry), AgentOps or any OTLP
// collector the owner names on the host. No SDK and no dependency: a small protobuf writer for the OTLP trace message,
// fetch, and AsyncLocalStorage so a model call made inside a question becomes that question's child.
//   • off unless a destination is set in the environment, and then nothing on the request path waits for it;
//   • by default no text leaves the server (names, tokens, times, flags, errors only); BEATRIS_OTEL_CONTENT=1 adds the
//     prompts and answers, always masked first, even when the shop's own model saw them as they are.
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes, createHash } from 'node:crypto';
import { BUILD } from './build.mjs';
import { redact } from './guardrails.mjs';

/* ---------------- protobuf: just what ExportTraceServiceRequest needs ---------------- */
const enc = new TextEncoder();
class Writer {
  constructor() {
    this.parts = [];
    this.size = 0;
  }
  raw(u8) {
    this.parts.push(u8);
    this.size += u8.length;
  }
  varint(v) {
    let n = BigInt.asUintN(64, BigInt(v));
    const out = [];
    do {
      let b = Number(n & 0x7fn);
      n >>= 7n;
      if (n) b |= 0x80;
      out.push(b);
    } while (n);
    this.raw(Uint8Array.from(out));
  }
  tag(field, wire) {
    this.varint((field << 3) | wire);
  }
  uint(field, v) {
    this.tag(field, 0);
    this.varint(v);
  }
  fixed64(field, v) {
    this.tag(field, 1);
    const b = new Uint8Array(8);
    new DataView(b.buffer).setBigUint64(0, BigInt.asUintN(64, BigInt(v)), true);
    this.raw(b);
  }
  double(field, v) {
    this.tag(field, 1);
    const b = new Uint8Array(8);
    new DataView(b.buffer).setFloat64(0, v, true);
    this.raw(b);
  }
  bytes(field, u8) {
    this.tag(field, 2);
    this.varint(u8.length);
    this.raw(u8);
  }
  string(field, s) {
    this.bytes(field, enc.encode(String(s)));
  }
  message(field, fill) {
    const w = new Writer();
    fill(w);
    this.bytes(field, w.done());
  }
  done() {
    const out = new Uint8Array(this.size);
    let o = 0;
    for (const p of this.parts) {
      out.set(p, o);
      o += p.length;
    }
    return out;
  }
}
function anyValue(w, v) {
  if (typeof v === 'string') w.string(1, v);
  else if (typeof v === 'boolean') w.uint(2, v ? 1 : 0);
  else if (typeof v === 'bigint' || (typeof v === 'number' && Number.isInteger(v))) w.uint(3, v);
  else if (typeof v === 'number') w.double(4, v);
  else if (Array.isArray(v)) w.message(5, (a) => v.forEach((x) => a.message(1, (b) => anyValue(b, x))));
  else w.string(1, JSON.stringify(v));
}
const keyValues = (w, field, attrs) => {
  for (const [k, v] of Object.entries(attrs ?? {})) if (v !== undefined && v !== null && !(typeof v === 'number' && !Number.isFinite(v))) w.message(field, (x) => {
    x.string(1, k);
    x.message(2, (y) => anyValue(y, v));
  });
};
/** OTLP ExportTraceServiceRequest for one resource and one scope. */
export function encodeTraces(resource, scope, spans) {
  const w = new Writer();
  w.message(1, (rs) => {
    rs.message(1, (r) => keyValues(r, 1, resource));
    rs.message(2, (ss) => {
      ss.message(1, (sc) => {
        sc.string(1, scope.name);
        if (scope.version) sc.string(2, scope.version);
      });
      for (const s of spans) ss.message(2, (x) => {
        x.bytes(1, s.traceId);
        x.bytes(2, s.spanId);
        if (s.parentId) x.bytes(4, s.parentId);
        x.string(5, s.name);
        x.uint(6, s.kind);
        x.fixed64(7, s.start);
        x.fixed64(8, s.end);
        keyValues(x, 9, s.attrs);
        for (const e of s.events) x.message(11, (y) => {
          y.fixed64(1, e.time);
          y.string(2, e.name);
          keyValues(y, 3, e.attrs);
        });
        if (s.status) x.message(15, (y) => {
          if (s.status.message) y.string(2, s.status.message);
          y.uint(3, s.status.code);
        });
      });
    });
  });
  return w.done();
}

/* ---------------- where the spans go: from the host's environment only ---------------- */
const trimUrl = (u) => String(u).replace(/\/+$/, '');
/** fetch with a deadline (a held timer: an export in flight keeps the process up until it ends or times out). */
async function within(fetchImpl, url, init, ms) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetchImpl(url, { ...init, signal: ctl.signal });
  } finally {
    clearTimeout(timer);
  }
}
/** «k=v,k2=v2» as OTEL_EXPORTER_OTLP_HEADERS writes it (values may be percent-encoded). */
export function parseHeaders(s) {
  const out = {};
  for (const part of String(s ?? '').split(',')) {
    const i = part.indexOf('=');
    if (i <= 0) continue;
    const k = part.slice(0, i).trim().toLowerCase();
    let v = part.slice(i + 1).trim();
    try {
      v = decodeURIComponent(v);
    } catch {
      /* kept as written */
    }
    if (k) out[k] = v;
  }
  return out;
}
export function destinations(env = {}, fetchImpl = fetch) {
  const out = [];
  if (env.LANGFUSE_PUBLIC_KEY && env.LANGFUSE_SECRET_KEY) {
    const base = trimUrl(env.LANGFUSE_BASE_URL || env.LANGFUSE_HOST || 'https://cloud.langfuse.com');
    const auth = Buffer.from(`${env.LANGFUSE_PUBLIC_KEY}:${env.LANGFUSE_SECRET_KEY}`).toString('base64');
    out.push({ name: 'langfuse', url: `${base}/api/public/otel/v1/traces`, headers: async () => ({ authorization: `Basic ${auth}`, 'x-langfuse-ingestion-version': '4' }) });
  }
  if (env.TRACELOOP_API_KEY) {
    const base = trimUrl(env.TRACELOOP_BASE_URL || 'https://api.traceloop.com');
    out.push({ name: 'traceloop', url: `${base}/v1/traces`, headers: async () => ({ authorization: `Bearer ${env.TRACELOOP_API_KEY}` }) });
  }
  if (env.AGENTOPS_API_KEY) {
    // as AgentOps' own SDK does: the key buys a token (v3/auth/token), the token rides as Bearer on the OTLP export
    const api = trimUrl(env.AGENTOPS_API_ENDPOINT || 'https://api.agentops.ai');
    let token = null;
    const buy = async () => {
      const r = await within(fetchImpl, `${api}/v3/auth/token`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ api_key: env.AGENTOPS_API_KEY }) }, 10000);
      if (!r.ok) throw new Error(`agentops token: HTTP ${r.status}`);
      token = (await r.json())?.token;
      if (!token) throw new Error('agentops token: none in the answer');
      return token;
    };
    out.push({ name: 'agentops', url: env.AGENTOPS_EXPORTER_ENDPOINT || 'https://otlp.agentops.ai/v1/traces', renews: true, headers: async (renew = false) => ({ authorization: `Bearer ${renew || !token ? await buy() : token}` }) });
  }
  if (env.BEATRIS_OTEL_ENDPOINT) out.push({ name: 'otlp', url: env.BEATRIS_OTEL_ENDPOINT, headers: async () => parseHeaders(env.BEATRIS_OTEL_HEADERS) });
  return out;
}

/* ---------------- the tracer ---------------- */
export const KIND = { internal: 1, server: 2, client: 3 };
const NOOP_SPAN = Object.freeze({ set() {}, event() {}, end() {}, ids: () => null, on: false });
const CUT = 8000;
/** A user, as the dashboards see them: a stable hash, never a name or a mobile. */
export const userTag = (id) => createHash('sha256').update(`beatris:${id}`).digest('hex').slice(0, 16);

export function createTracer({ env = process.env, fetchImpl = fetch, clock = () => performance.timeOrigin + performance.now(), build = BUILD, mask = redact, flushMs = 5000, maxBatch = 64, maxQueue = 2000, random = randomBytes, timeoutMs = 10000 } = {}) {
  const dests = destinations(env, fetchImpl);
  const on = dests.length > 0;
  const content = on && env.BEATRIS_OTEL_CONTENT === '1';
  const als = new AsyncLocalStorage();
  const queue = [];
  const stats = { sent: 0, dropped: 0, failed: 0, batches: 0, last: null };
  const resource = { 'service.name': 'beatris', 'service.version': build || 'dev', 'deployment.environment': env.NODE_ENV || 'development', 'telemetry.sdk.name': 'beatris-otel', 'telemetry.sdk.language': 'nodejs' };
  const scope = { name: 'beatris.ai', version: '1' };
  const ns = (ms) => BigInt(Math.round(ms * 1e6));
  let timer = null, inflight = null;

  function push(s) {
    if (queue.length >= maxQueue) {
      queue.shift();
      stats.dropped++;
    }
    queue.push(s);
    if (queue.length >= maxBatch) flushSoon(0);
    else flushSoon(flushMs);
  }
  function flushSoon(ms) {
    if (timer && ms > 0) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      flush().catch(() => {});
    }, ms);
    timer.unref?.();
  }
  async function send(d, body) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const headers = await d.headers(attempt > 1 && d.renew);
        const r = await within(fetchImpl, d.url, { method: 'POST', headers: { 'content-type': 'application/x-protobuf', ...headers }, body }, timeoutMs);
        if (r.ok) {
          d.renew = false;
          return true;
        }
        if (r.status === 401 && d.renews && attempt === 1) {
          d.renew = true; // the token ran out: buy a new one and try once more
          continue;
        }
        if (!(r.status === 429 || r.status >= 500)) return false;
      } catch {
        /* the network: one more try */
      }
    }
    return false;
  }
  async function flush() {
    if (inflight) await inflight;
    if (!queue.length) return;
    const batch = queue.splice(0, queue.length);
    const body = encodeTraces(resource, scope, batch);
    inflight = (async () => {
      const results = await Promise.all(dests.map((d) => send(d, body).catch(() => false)));
      stats.batches++;
      stats.last = new Date().toISOString();
      results.forEach((ok) => (ok ? (stats.sent += batch.length) : (stats.failed += batch.length)));
    })();
    try {
      await inflight;
    } finally {
      inflight = null;
    }
    if (queue.length) await flush();
  }

  /** A span: a child of the span this code runs inside, or of `parent` ({traceId, spanId} in hex) when given. */
  function start(name, { kind = KIND.internal, attrs = {}, parent: given = null } = {}) {
    if (!on) return NOOP_SPAN;
    const parent = given?.traceId && given?.spanId ? { traceId: Buffer.from(given.traceId, 'hex'), spanId: Buffer.from(given.spanId, 'hex') } : als.getStore();
    const s = { traceId: parent?.traceId ?? random(16), spanId: random(8), parentId: parent?.spanId ?? null, name, kind, start: ns(clock()), end: 0n, attrs: { ...attrs }, events: [], status: null, done: false };
    return Object.assign(s, {
      on: true,
      ids: () => ({ traceId: Buffer.from(s.traceId).toString('hex'), spanId: Buffer.from(s.spanId).toString('hex') }),
      set(k, v) {
        s.attrs[k] = v;
      },
      event(n, a = {}) {
        s.events.push({ time: ns(clock()), name: n, attrs: a });
      },
      end({ error = null } = {}) {
        if (s.done) return;
        s.done = true;
        s.end = ns(clock());
        if (error) {
          s.status = { code: 2, message: String(error.message ?? error).slice(0, 300) };
          s.attrs['error.type'] ??= error.status ? String(error.status) : error.circuitOpen ? 'circuit_open' : error.name || 'Error';
          s.attrs['langfuse.observation.level'] = 'ERROR';
        }
        push(s);
      },
    });
  }
  /** Runs fn inside a new span; the span ends with fn (and carries its error). Off: just runs fn. */
  async function run(name, opts, fn) {
    if (!on) return fn(NOOP_SPAN);
    const s = start(name, opts);
    try {
      const r = await als.run(s, () => fn(s));
      s.end();
      return r;
    } catch (e) {
      s.end({ error: e });
      throw e;
    }
  }
  function runSync(name, opts, fn) {
    if (!on) return fn(NOOP_SPAN);
    const s = start(name, opts);
    try {
      const r = fn(s);
      s.end();
      return r;
    } catch (e) {
      s.end({ error: e });
      throw e;
    }
  }
  /** Text for a span when the owner turned content on: masked, cut, as one JSON string. */
  const text = (v) => {
    if (!content) return undefined;
    const s = typeof v === 'string' ? v : JSON.stringify(v);
    return mask(s ?? '').slice(0, CUT);
  };
  return {
    on,
    content,
    start,
    run,
    runSync,
    text,
    flush,
    async shutdown() {
      clearTimeout(timer);
      timer = null;
      if (on) await flush().catch(() => {});
    },
    stats: () => ({ on, destinations: dests.map((d) => d.name), content, queued: queue.length, ...stats }),
  };
}

/* the server's own tracer, from its environment (tests make their own) */
let shared = null;
export const getTracer = () => (shared ??= createTracer());
