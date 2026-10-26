// Model gateway (spec 0001 #12): the one door every call to a language model goes through.
//   • timeout per call; one retry after a short pause on 429 / 5xx / network failure;
//   • circuit breaker per provider: after 3 failures in a row it is skipped for 5 minutes, so a dead service does
//     not make every question wait for its timeout;
//   • usage metering per day and provider (calls, errors, tokens in/out) in the shop's own database (ai_usage);
//   • a span per call for the owner's trace tools (spec 0048): model, provider, tokens, attempts, error — it only watches.
import { getTracer, KIND } from './otel.mjs';

export const USAGE_SCHEMA = `
CREATE TABLE IF NOT EXISTS ai_usage (day TEXT NOT NULL, provider TEXT NOT NULL, calls INTEGER NOT NULL DEFAULT 0, errors INTEGER NOT NULL DEFAULT 0, tokens_in INTEGER NOT NULL DEFAULT 0, tokens_out INTEGER NOT NULL DEFAULT 0, ms INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, provider));
`;

export class GatewayError extends Error {
  constructor(message, { status = 0, retryable = false, open = false } = {}) {
    super(message);
    this.status = status;
    this.retryable = retryable;
    this.circuitOpen = open;
  }
}

const FAILS_TO_OPEN = 3;
const OPEN_MS = 5 * 60 * 1000;

/** Tokens reported by either dialect. */
export function tokensOf(data) {
  const u = data?.usage ?? {};
  return { in: Number(u.input_tokens ?? u.prompt_tokens ?? 0) || 0, out: Number(u.output_tokens ?? u.completion_tokens ?? 0) || 0 };
}

// the provider as the GenAI conventions name it, from the host the call goes to (else the shop's own id for it)
const PROVIDER_HOSTS = [[/anthropic\.com$/, 'anthropic'], [/openai\.com$/, 'openai'], [/googleapis\.com$/, 'gcp.gemini'], [/x\.ai$/, 'x_ai'], [/deepseek\.com$/, 'deepseek'], [/mistral\.ai$/, 'mistral_ai'], [/groq\.com$/, 'groq']];
function callAttrs(id, url, body) {
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    /* a bad base reaches the fetch and fails there */
  }
  const provider = PROVIDER_HOSTS.find(([re]) => re.test(host))?.[1] ?? String(id);
  return { 'gen_ai.operation.name': 'chat', 'gen_ai.provider.name': provider, 'gen_ai.system': provider, 'gen_ai.request.model': body?.model, 'gen_ai.request.max_tokens': body?.max_tokens, 'gen_ai.request.temperature': body?.temperature, 'server.address': host, 'beatris.provider.id': String(id), 'langfuse.observation.type': 'generation' };
}

export function createGateway({ db: dbIn = null, fetchImpl = fetch, clock = () => Date.now(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)), timeoutMs = 60000, retryPauseMs = 1500, onEvent = () => {}, tracer = getTracer() } = {}) {
  const db = dbIn?.raw ? dbIn : null; // metering needs a real database; stubs in tests simply skip it
  if (db) db.raw.exec(USAGE_SCHEMA);
  const circuits = new Map(); // provider id → { fails, openUntil }
  const day = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(new Date(clock()));
  function meter(provider, { ok, tin = 0, tout = 0, ms = 0 }) {
    if (!db) return;
    db.run('INSERT INTO ai_usage(day,provider,calls,errors,tokens_in,tokens_out,ms) VALUES (?,?,?,?,?,?,?) ON CONFLICT(day,provider) DO UPDATE SET calls=calls+excluded.calls, errors=errors+excluded.errors, tokens_in=tokens_in+excluded.tokens_in, tokens_out=tokens_out+excluded.tokens_out, ms=ms+excluded.ms', day(), provider, 1, ok ? 0 : 1, tin, tout, Math.round(ms));
  }
  async function once(url, headers, body) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      let r;
      try {
        r = await fetchImpl(url, { method: 'POST', signal: ctl.signal, headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
      } catch (e) {
        throw new GatewayError(e?.name === 'AbortError' ? 'پاسخ نداد (زمان تمام شد)' : 'به سرویس وصل نشد', { retryable: e?.name !== 'AbortError' });
      }
      if (!r.ok) throw new GatewayError(`موتور هوش مصنوعی خطای HTTP ${r.status} داد.`, { status: r.status, retryable: r.status === 429 || r.status >= 500 });
      try {
        return await r.json();
      } catch {
        throw new GatewayError('پاسخ نامعتبر از موتور.');
      }
    } finally {
      clearTimeout(timer);
    }
  }
  /** POST JSON to a model endpoint on behalf of provider `id`. */
  const post = (id, url, headers, body) => tracer.run(`chat ${body?.model ?? id}`, tracer.on ? { kind: KIND.client, attrs: callAttrs(id, url, body) } : null, (span) => call(id, url, headers, body, span));
  async function call(id, url, headers, body, span) {
    const c = circuits.get(id) ?? { fails: 0, openUntil: 0 };
    if (c.openUntil > clock()) {
      onEvent('circuit.skip', id);
      throw new GatewayError('موقتاً کنار گذاشته شد (چند خطای پیاپی)', { open: true });
    }
    if (span.on && tracer.content) {
      const prompt = tracer.text(body?.system ? [{ role: 'system', content: body.system }, ...(body.messages ?? [])] : body?.messages ?? []);
      span.set('gen_ai.input.messages', prompt);
      span.set('gen_ai.prompt', prompt);
    }
    const t0 = clock();
    let err;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        span.set('beatris.attempts', attempt);
        const data = await once(url, headers, body);
        const tk = tokensOf(data);
        circuits.set(id, { fails: 0, openUntil: 0 });
        meter(id, { ok: true, tin: tk.in, tout: tk.out, ms: clock() - t0 });
        onEvent('call.ok', id);
        if (span.on) {
          span.set('gen_ai.usage.input_tokens', tk.in);
          span.set('gen_ai.usage.output_tokens', tk.out);
          span.set('gen_ai.response.model', data?.model);
          span.set('gen_ai.response.id', data?.id);
          const finish = data?.stop_reason ?? data?.choices?.[0]?.finish_reason;
          if (finish) span.set('gen_ai.response.finish_reasons', [String(finish)]);
          if (tracer.content) {
            const answer = tracer.text(data?.content ?? data?.choices?.map((ch) => ch.message) ?? []);
            span.set('gen_ai.output.messages', answer);
            span.set('gen_ai.completion', answer);
          }
        }
        return data;
      } catch (e) {
        err = e;
        if (!(e instanceof GatewayError) || !e.retryable || attempt === 2) break;
        onEvent('call.retry', id);
        span.event('retry', { 'error.type': e.status ? String(e.status) : 'network' });
        await sleep(retryPauseMs);
      }
    }
    c.fails++;
    if (c.fails >= FAILS_TO_OPEN) {
      c.openUntil = clock() + OPEN_MS;
      onEvent('circuit.open', id);
    }
    circuits.set(id, c);
    meter(id, { ok: false, ms: clock() - t0 });
    onEvent('call.fail', id);
    throw err;
  }
  function usage(days = 30) {
    if (!db) return [];
    const since = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(new Date(clock() - days * 864e5));
    return db.all('SELECT provider, SUM(calls) AS calls, SUM(errors) AS errors, SUM(tokens_in) AS tokensIn, SUM(tokens_out) AS tokensOut, SUM(ms) AS ms FROM ai_usage WHERE day>=? GROUP BY provider ORDER BY calls DESC', since);
  }
  const circuit = (id) => {
    const c = circuits.get(id);
    return c && c.openUntil > clock() ? { open: true, until: new Date(c.openUntil).toISOString(), fails: c.fails } : { open: false, fails: c?.fails ?? 0 };
  };
  return { post, usage, circuit };
}
