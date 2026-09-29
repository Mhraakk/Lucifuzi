// Ledger replay (spec 0001 #17): rebuild every final document's postings from its stored data with the same engine
// (B.postings) and compare them with what bk_postings holds. Read-only — it reports, it never repairs. A clean book
// gives zero differences; a posting changed by hand, a lost row or an orphan row shows up with its document.
import * as B from '../public/js/books.mjs';

const TOL = 1e-6;
const key = (acct, unit) => `${acct}|${unit}`;

/**
 * cache (optional, a Map kept by the caller): the expected postings of a document are rebuilt only when its version,
 * time, hash or stored text length changed. The stored postings are always read again, so a hand-changed posting is
 * found on every run; the explicit replay endpoint runs without a cache.
 */
export function replayLedger(db, cache = null) {
  const t0 = Date.now();
  const stored = new Map(); // src → Map(acct|unit → amt)
  for (const r of db.all("SELECT src, acct, unit, SUM(amt) AS amt FROM bk_postings WHERE src NOT LIKE 'chq:%' GROUP BY src, acct, unit")) {
    if (!stored.has(r.src)) stored.set(r.src, new Map());
    stored.get(r.src).set(key(r.acct, r.unit), r.amt);
  }
  const diffs = [];
  let docs = 0;
  let rows = 0;
  const seen = new Set();
  const expected = (d) => {
    const want = new Map();
    if (d.status === 'final' && d.type !== 'proforma') {
      const doc = { ...JSON.parse(d.data_json), type: d.type, date: d.date };
      for (const p of B.postings(doc, JSON.parse(d.calc_json))) want.set(key(p.acct, p.unit), (want.get(key(p.acct, p.unit)) ?? 0) + p.amt);
    }
    return want;
  };
  const rowsOf = () => {
    if (!cache) return db.all('SELECT id, type, fy, no, status, date, data_json, calc_json FROM bk_docs');
    const heads = db.all('SELECT id, type, fy, no, status, date, version, updated_at, hash, length(data_json) AS ld, length(calc_json) AS lc FROM bk_docs');
    const stale = heads.filter((h) => cache.get(h.id)?.v !== `${h.status}|${h.version}|${h.updated_at}|${h.hash}|${h.ld}|${h.lc}`);
    for (let i = 0; i < stale.length; i += 400) {
      const ids = stale.slice(i, i + 400).map((h) => h.id);
      for (const d of db.all(`SELECT id, status, type, date, version, updated_at, hash, length(data_json) AS ld, length(calc_json) AS lc, data_json, calc_json FROM bk_docs WHERE id IN (${ids.map(() => '?').join(',')})`, ...ids))
        cache.set(d.id, { v: `${d.status}|${d.version}|${d.updated_at}|${d.hash}|${d.ld}|${d.lc}`, want: expected(d) });
    }
    return heads;
  };
  for (const d of rowsOf()) {
    seen.add(d.id);
    const want = cache ? cache.get(d.id).want : expected(d);
    if (d.status === 'final' && d.type !== 'proforma') docs++;
    const have = stored.get(d.id) ?? new Map();
    for (const k of new Set([...want.keys(), ...have.keys()])) {
      rows++;
      const w = want.get(k) ?? 0, h = have.get(k) ?? 0;
      if (Math.abs(w - h) > TOL) {
        const [acct, unit] = k.split('|');
        diffs.push({ doc: d.id, track: B.trackCode(d.type, d.fy, d.no), status: d.status, acct, unit, expected: w, stored: h });
      }
    }
  }
  for (const [src, m] of stored) if (!seen.has(src)) for (const [k, h] of m) {
    const [acct, unit] = k.split('|');
    diffs.push({ doc: src, track: null, status: 'missing', acct, unit, expected: 0, stored: h });
  }
  return { ok: diffs.length === 0, docs, rows, diffs: diffs.slice(0, 200), count: diffs.length, ms: Date.now() - t0 };
}
