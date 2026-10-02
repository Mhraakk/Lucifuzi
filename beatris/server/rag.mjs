// Retrieval over the app's own knowledge (spec 0001 #11): lessons, SOPs, the glossary and the video guide's written
// steps, indexed with BM25 and Persian-aware normalisation. Local and exact — no embeddings service, so no shop text
// leaves the server to build it. The assistant gets it as the read-only tool `search_knowledge`.
import { readFileSync } from 'node:fs';
import { COURSES, SOPS, GLOSSARY } from '../content/index.mjs';

const STOP = new Set('و در به از که این آن با را است برای یا تا می هم نیز یک بر شود شده کند کرد کنید باید اگر هر چه چی را؟ ها های ای یعنی دارد نمی بود باشد روی پس بعد قبل همه خود ما شما او آنها'.split(' '));

/** One spelling for the same word: Arabic ي/ك, diacritics, ZWNJ joins, Persian digits. */
export function normalize(s) {
  return String(s ?? '')
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[ۀة]/g, 'ه')
    .replace(/[أإآ]/g, 'ا')
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/‌/g, '')
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .toLowerCase();
}
const stem = (t) => (t.length > 4 ? t.replace(/(ترین|های|ها|تر)$/, '') : t);
export const tokens = (s) => normalize(s).split(/[^\p{L}\p{N}]+/u).filter((t) => t.length > 1 && !STOP.has(t)).map(stem);

/** Every string inside a lesson block (text, tables, formulas, quizzes). */
const strings = (v) => (typeof v === 'string' ? [v] : Array.isArray(v) ? v.flatMap(strings) : v && typeof v === 'object' ? Object.values(v).flatMap(strings) : []);

export function corpus({ chaptersFile = new URL('../public/media/tutorial/chapters.json', import.meta.url) } = {}) {
  const docs = [];
  for (const c of COURSES) for (const l of c.lessons ?? []) docs.push({ id: `lesson:${l.id}`, kind: 'درس', title: l.title, url: `/lesson/${l.id}`, text: strings(l.blocks).join('\n') });
  for (const s of SOPS) docs.push({ id: `sop:${s.id}`, kind: 'دستورالعمل', title: s.title, url: `/sop/${s.id}`, text: [s.summary, ...(s.steps ?? [])].join('\n') });
  for (const g of GLOSSARY) docs.push({ id: `term:${g.id}`, kind: 'واژه', title: g.term, url: '/library', text: g.def });
  try {
    for (const ch of JSON.parse(readFileSync(chaptersFile, 'utf8')).chapters ?? []) docs.push({ id: `help:${ch.n}`, kind: 'فیلم آموزشی', title: ch.title, url: `/help?ch=${ch.n}`, text: [ch.sub, ...(ch.steps ?? [])].join('\n') });
  } catch {
    /* the video guide is optional */
  }
  return docs;
}

/** BM25 (k1 1.5, b 0.75); titles count three times. */
export function buildIndex(docs, { k1 = 1.5, b = 0.75 } = {}) {
  const df = new Map();
  const rows = docs.map((d) => {
    const toks = [...tokens(d.title), ...tokens(d.title), ...tokens(d.title), ...tokens(d.text)];
    const tf = new Map();
    for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1);
    for (const t of tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
    return { d, tf, len: toks.length };
  });
  const N = rows.length;
  const avg = rows.reduce((a, r) => a + r.len, 0) / Math.max(1, N);
  const idf = (t) => Math.log(1 + (N - (df.get(t) ?? 0) + 0.5) / ((df.get(t) ?? 0) + 0.5));
  function search(q, k = 5) {
    const qt = [...new Set(tokens(q))];
    if (!qt.length) return [];
    const hits = [];
    for (const r of rows) {
      let score = 0;
      for (const t of qt) {
        const f = r.tf.get(t);
        if (f) score += idf(t) * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * r.len) / avg)));
      }
      if (score > 0) hits.push({ r, score });
    }
    return hits
      .sort((x, y) => y.score - x.score)
      .slice(0, k)
      .map(({ r, score }) => ({ id: r.d.id, kind: r.d.kind, title: r.d.title, url: r.d.url, score: Math.round(score * 100) / 100, snippet: snippet(r.d.text, qt) }));
  }
  return { search, size: N };
}

/** The sentence that holds the most query words (≤ 280 chars). */
function snippet(text, qt) {
  const parts = text.split(/(?<=[.!؟?\n])\s*/).filter((p) => p.trim().length > 8);
  let best = parts[0] ?? '';
  let bestN = -1;
  for (const p of parts) {
    const pt = new Set(tokens(p));
    const n = qt.filter((t) => pt.has(t)).length;
    if (n > bestN) {
      best = p;
      bestN = n;
    }
  }
  return best.trim().slice(0, 280);
}

let shared = null;
/** The process-wide index over the built-in knowledge (built on first use). */
export const knowledge = () => (shared ??= buildIndex(corpus()));
