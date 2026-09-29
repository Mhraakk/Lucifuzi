// Model gateway (spec 0001 #12): the one door every call to a language model goes through.
//   • timeout per call; one retry after a short pause on 429 / 5xx / network failure;
//   • circuit breaker per provider: after 3 failures in a row it is skipped for 5 minutes, so a dead service does
//     not make every question wait for its timeout;
//   • usage metering per day and provider (calls, errors, tokens in/out) in the shop's own database (ai_usage).

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

export function createGateway({ db: dbIn = null, fetchImpl = fetch, clock = () => Date.now(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)), timeoutMs = 60000, retryPauseMs = 1500, onEvent = () => {} } = {}) {
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
  async function post(id, url, headers, body) {
    const c = circuits.get(id) ?? { fails: 0, openUntil: 0 };
    if (c.openUntil > clock()) {
      onEvent('circuit.skip', id);
      throw new GatewayError('موقتاً کنار گذاشته شد (چند خطای پیاپی)', { open: true });
    }
    const t0 = clock();
    let err;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const data = await once(url, headers, body);
        const tk = tokensOf(data);
        circuits.set(id, { fails: 0, openUntil: 0 });
        meter(id, { ok: true, tin: tk.in, tout: tk.out, ms: clock() - t0 });
        onEvent('call.ok', id);
        return data;
      } catch (e) {
        err = e;
        if (!(e instanceof GatewayError) || !e.retryable || attempt === 2) break;
        onEvent('call.retry', id);
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
