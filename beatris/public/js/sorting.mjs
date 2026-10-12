// Sorting for every stock and day table (spec 0027). The order is pure and tested: numbers by value (Persian digits,
// separators and signs read), dates by day, names by Persian collation (ی/ي and ک/ك are one letter), empty cells last,
// equal keys in their natural order. wireSort() turns the headers of any table[data-sort] into buttons that cycle
// ascending → descending → natural, show aria-sort and remember the choice per table for this viewer.

const FA = '۰۱۲۳۴۵۶۷۸۹', AR = '٠١٢٣٤٥٦٧٨٩';
const latin = (s) => s.replace(/[۰-۹]/g, (d) => String(FA.indexOf(d))).replace(/[٠-٩]/g, (d) => String(AR.indexOf(d)));
export const normText = (s) => String(s ?? '').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/[‌‏‎]/g, '').replace(/\s+/g, ' ').trim();
const collator = typeof Intl !== 'undefined' ? new Intl.Collator('fa', { sensitivity: 'base', numeric: true }) : null;

/**
 * What a cell holds, for sorting: { t: 'empty' } | { t: 'num', v } | { t: 'date', v } | { t: 'text', v }.
 * «−۱۲٬۵۰۰ ریال», «۱۲٫۴۵۰ گرم», «۴٪», «۱۴۰۵/۰۷/۰۶», «علی کریمی».
 */
export function cellValue(raw) {
  const s0 = String(raw ?? '').trim();
  if (!s0 || /^[—–\-]+$/.test(s0)) return { t: 'empty' };
  const s = latin(s0);
  const dm = s.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})(?!\d)/);
  if (dm) return { t: 'date', v: Number(dm[1]) * 10000 + Number(dm[2]) * 100 + Number(dm[3]) };
  const n = s.replace(/[٬,\s]/g, '').replace(/[٫]/g, '.').replace(/^[+]/, '').replace(/^[−‐–]/, '-');
  const m = n.match(/^(-?)(\d+(?:\.\d+)?)/);
  if (m) {
    // a figure followed by its unit (ریال، گرم، ٪، عدد) is a number; a name that starts with a digit is text
    const rest = n.slice(m[0].length);
    if (!rest || /^[%٪×]|^(ریال|تومان|گرم|مثقال|عدد|سکه|قیراط|برابر|بار|روز|ساعت|ردیف|سند)/.test(rest) || /^[^\p{L}]*$/u.test(rest)) return { t: 'num', v: Number(m[1] + m[2]) };
  }
  return { t: 'text', v: normText(s0) };
}

/** Compare two cell values; empty always last, whatever the direction. dir: 1 ascending, −1 descending. */
export function compareCells(a, b, dir = 1) {
  if (a.t === 'empty' || b.t === 'empty') return a.t === b.t ? 0 : a.t === 'empty' ? 1 : -1;
  if (a.t === 'text' || b.t === 'text') {
    // a column that mixes numbers and words: the words come after the numbers
    if (a.t !== b.t) return (a.t === 'text' ? 1 : -1) * dir;
    return dir * (collator ? collator.compare(a.v, b.v) : a.v < b.v ? -1 : a.v > b.v ? 1 : 0);
  }
  return dir * (a.v - b.v);
}

/** Sort items by key(item) (raw text or a number); stable; dir 0 keeps the natural order. Returns a new array. */
export function sortBy(items, key, dir = 1) {
  if (!dir) return [...items];
  const vals = items.map((x, i) => ({ x, i, k: typeof key(x) === 'number' ? { t: 'num', v: key(x) } : cellValue(key(x)) }));
  vals.sort((a, b) => compareCells(a.k, b.k, dir) || a.i - b.i);
  return vals.map((v) => v.x);
}

/** The next state of a header click: a new column starts ascending; the same column goes ↑ → ↓ → natural. */
export const nextSort = (state, col) => (state?.col === col ? { col, dir: state.dir === 1 ? -1 : state.dir === -1 ? 0 : 1 } : { col, dir: 1 });

const store = {
  get(k) {
    try {
      return JSON.parse(localStorage.getItem(`beatris.sort.${k}`) ?? 'null');
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(`beatris.sort.${k}`, JSON.stringify(v));
    } catch {
      /* storage unavailable: the sort still works for this view */
    }
  },
};

/**
 * Make a table sortable by its headers. Cells may carry data-v (the raw value) when their text is not the value. Rows
 * with data-fixed (totals) stay at the bottom. Call again after the table is drawn anew; the choice is restored.
 */
export function wireSort(table, { key = table?.dataset.sort } = {}) {
  if (!table?.tHead || !table.tBodies[0]) return;
  const head = table.tHead.rows[table.tHead.rows.length - 1];
  // the header row carries the mark, so a table drawn anew (innerHTML) is wired again and keeps its order
  if (!head || head.dataset.sortWired) return;
  head.dataset.sortWired = '1';
  const ths = [...head.cells];
  const body = table.tBodies[0];
  const natural = [...body.rows];
  let state = (key && store.get(key)) || { col: -1, dir: 0 };
  ths.forEach((th, i) => {
    if (th.hasAttribute('data-nosort') || !th.textContent.trim()) return;
    th.innerHTML = `<button type="button" class="th-sort">${th.innerHTML}<span class="th-arrow" aria-hidden="true"></span></button>`;
    th.querySelector('button').addEventListener('click', () => {
      state = nextSort(state, i);
      apply();
      if (key) store.set(key, state);
    });
  });
  function apply() {
    const fixed = natural.filter((r) => r.hasAttribute('data-fixed'));
    const rows = natural.filter((r) => !r.hasAttribute('data-fixed'));
    const sorted = state.dir && ths[state.col] ? sortBy(rows, (r) => r.cells[state.col]?.dataset.v ?? r.cells[state.col]?.textContent ?? '', state.dir) : rows;
    body.append(...sorted, ...fixed);
    ths.forEach((th, i) => (i === state.col && state.dir ? th.setAttribute('aria-sort', state.dir === 1 ? 'ascending' : 'descending') : th.removeAttribute('aria-sort')));
  }
  apply();
}

/** Every table[data-sort] under root. */
export const wireSorts = (root) => root?.querySelectorAll('table[data-sort]').forEach((t) => wireSort(t));
