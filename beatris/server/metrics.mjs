// Request metrics and counters (spec 0001 #18): per route (ids folded to «:id») count, 4xx, 5xx and latency
// percentiles from a bounded reservoir; free-form counters for the rest (AI calls, backups, feed ticks).
// In memory only: a restart starts from zero, which is fine for «how is it now».

const RESERVOIR = 512;
const ID_SEG = /^(?:[0-9a-f]{8}-[0-9a-f-]{27}|t_[0-9a-f]{12}|\d+|[0-9a-f]{12,}|[A-Za-z0-9_-]{20,}|main~.+|t_[0-9a-f]{12}~.+)$/;

/** «/api/books/parties/3f2a…» → «/api/books/parties/:id». */
export function routeKey(method, pathname) {
  const p = pathname.split('/').map((s) => (s && ID_SEG.test(decodeURIComponent(s)) ? ':id' : s)).join('/');
  return `${method} ${p}`;
}

export function quantile(sorted, q) {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[i];
}

export function createMetrics({ clock = () => Date.now() } = {}) {
  const routes = new Map();
  const counters = new Map();
  const started = clock();
  function record(method, pathname, status, ms) {
    const k = routeKey(method, pathname);
    let r = routes.get(k);
    if (!r) {
      if (routes.size > 400) return; // unbounded paths never grow the map without limit
      r = { n: 0, c4: 0, c5: 0, lat: [], i: 0, max: 0 };
      routes.set(k, r);
    }
    r.n++;
    if (status >= 500) r.c5++;
    else if (status >= 400) r.c4++;
    if (r.lat.length < RESERVOIR) r.lat.push(ms);
    else r.lat[r.i++ % RESERVOIR] = ms;
    if (ms > r.max) r.max = ms;
  }
  const inc = (name, by = 1) => counters.set(name, (counters.get(name) ?? 0) + by);
  const get = (name) => counters.get(name) ?? 0;
  function snapshot() {
    const list = [...routes].map(([route, r]) => {
      const s = [...r.lat].sort((a, b) => a - b);
      return { route, count: r.n, errors4xx: r.c4, errors5xx: r.c5, p50: Math.round(quantile(s, 0.5)), p95: Math.round(quantile(s, 0.95)), max: Math.round(r.max) };
    });
    const total = list.reduce((a, r) => a + r.count, 0);
    const e5 = list.reduce((a, r) => a + r.errors5xx, 0);
    return {
      since: new Date(started).toISOString(),
      uptimeSec: Math.round((clock() - started) / 1000),
      requests: total,
      errorRate5xx: total ? e5 / total : 0,
      routes: list.sort((a, b) => b.count - a.count),
      counters: Object.fromEntries([...counters].sort()),
      memoryMB: Math.round(process.memoryUsage().rss / 1048576),
    };
  }
  return { record, inc, get, snapshot };
}
