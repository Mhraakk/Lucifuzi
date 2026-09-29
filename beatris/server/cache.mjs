// A small TTL + LRU cache (spec 0001 #15): for derived, read-only data that is costly to rebuild (the knowledge
// index, peer comparisons). Never for books data that must be read fresh.

export function createCache({ max = 500, ttl = 60000, clock = () => Date.now() } = {}) {
  const m = new Map();
  let hits = 0;
  let misses = 0;
  function get(k) {
    const e = m.get(k);
    if (!e) return (misses++, undefined);
    if (e.exp <= clock()) {
      m.delete(k);
      misses++;
      return undefined;
    }
    m.delete(k); // refresh recency
    m.set(k, e);
    hits++;
    return e.v;
  }
  function set(k, v, ms = ttl) {
    m.delete(k);
    m.set(k, { v, exp: clock() + ms });
    while (m.size > max) m.delete(m.keys().next().value);
    return v;
  }
  /** get, or build and store. */
  const wrap = (k, build, ms) => {
    const v = get(k);
    return v !== undefined ? v : set(k, build(), ms);
  };
  return { get, set, wrap, delete: (k) => m.delete(k), clear: () => m.clear(), stats: () => ({ size: m.size, hits, misses }) };
}
