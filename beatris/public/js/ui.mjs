import { crownSvg } from './crown.mjs';
import { html, raw, fa, store } from './core.mjs';

const P = (d) => raw(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`);
/* Tab icons (spec 0021): two layers each — a soft fill (.tf) that comes in when the tab is current and the line art.
 * Drawn for this app's meanings: a house with a Persian arch, an open book with a gem marker, practice as a loop
 * round a target, the market as candles, the books as a ruled ledger, the studio as a ring with its stone, tools as a
 * goldsmith's balance. Same 24-unit grid and 1.6 stroke as the rest of the icon set. */
const T = (fill, line) => raw(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><g class="tf" fill="currentColor" stroke="none">${fill}</g><g class="tl">${line}</g></svg>`);
export const TAB_ICON = {
  home: T('<path d="M6 10.6 12 5.4l6 5.2V19.5H6Z" opacity=".22"/>', '<path d="M3.8 11.2 12 4.2l8.2 7"/><path d="M6 9.8v9.7h12V9.8"/><path class="ta" d="M10 19.5v-4.2a2 2 0 0 1 4 0v4.2"/>'),
  learn: T('<path d="M12 6.4C10 5 7.6 4.6 4.5 4.8v13.4c3.1-.2 5.5.2 7.5 1.6 2-1.4 4.4-1.8 7.5-1.6V4.8c-3.1-.2-5.5.2-7.5 1.6Z" opacity=".2"/>', '<path d="M12 6.4C10 5 7.6 4.6 4.5 4.8v13.4c3.1-.2 5.5.2 7.5 1.6M12 6.4c2-1.4 4.4-1.8 7.5-1.6v13.4c-3.1-.2-5.5.2-7.5 1.6M12 6.4v13.4"/><path class="ta" d="m15.2 8.6 1.3-1.4 1.3 1.4-1.3 1.6Z"/>'),
  practice: T('<circle cx="12" cy="12" r="3.1" opacity=".3"/>', '<path d="M19.4 9.2A7.8 7.8 0 0 0 5.1 8.1"/><path d="m19.6 4.9-.2 4.3-4.3-.2"/><path d="M4.6 14.8a7.8 7.8 0 0 0 14.3 1.1"/><path d="m4.4 19.1.2-4.3 4.3.2"/><circle class="ta" cx="12" cy="12" r="1.2"/>'),
  market: T('<rect x="6.2" y="8.5" width="3.6" height="6.5" rx=".8" opacity=".25"/><rect x="14.2" y="6" width="3.6" height="8" rx=".8" opacity=".25"/>', '<path d="M8 5v3.5M8 15v4M16 3.8V6M16 14v3.5"/><rect x="6.2" y="8.5" width="3.6" height="6.5" rx=".8"/><rect x="14.2" y="6" width="3.6" height="8" rx=".8"/><path class="ta" d="M3.5 20.2h17"/>'),
  books: T('<path d="M5 4.5h11.5a2 2 0 0 1 2 2v13H7a2 2 0 0 1-2-2Z" opacity=".2"/>', '<path d="M5 17.5v-13h11.5a2 2 0 0 1 2 2v13H7a2 2 0 0 1-2-2 2 2 0 0 1 2-2h11.5"/><path d="M9 4.5v11"/><path class="ta" d="M11.5 8.2h4.3M11.5 11h4.3"/>'),
  studio: T('<path d="m9.4 6.6 2.6-2.9 2.6 2.9-2.6 2.1Z" opacity=".35"/>', '<path d="m9.4 6.6 2.6-2.9 2.6 2.9-2.6 2.1Z"/><circle cx="12" cy="15" r="5.6"/><path class="ta" d="M9.2 9.9a5.6 5.6 0 0 1 5.6 0"/>'),
  tools: T('<path d="M4 14.2h5.4a2.7 2.7 0 0 1-5.4 0ZM14.6 14.2H20a2.7 2.7 0 0 1-5.4 0Z" opacity=".25"/>', '<path d="M12 4.2v15.3M8.2 19.5h7.6M5.2 6.8h13.6"/><path d="M6.7 6.8 4 14.2h5.4ZM17.3 6.8 14.6 14.2H20Z"/><circle class="ta" cx="12" cy="4.2" r="1"/>'),
  team: T('<circle cx="9" cy="8.6" r="3" opacity=".22"/>', '<circle cx="9" cy="8.6" r="3"/><path d="M3.6 19a5.4 5.4 0 0 1 10.8 0"/><path class="ta" d="M15.4 6a3 3 0 0 1 0 5.4M17.4 13.8A5.4 5.4 0 0 1 20.4 19"/>'),
  me: T('<circle cx="12" cy="8.2" r="3.6" opacity=".22"/>', '<circle cx="12" cy="8.2" r="3.6"/><path class="ta" d="M5.2 19.8a6.8 6.8 0 0 1 13.6 0"/>'),
};
export const ICON = {
  home: P('<path d="M4 11 12 4l8 7"/><path d="M6 10v9h12v-9"/>'),
  learn: P('<path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H19v15H7.5A2.5 2.5 0 0 0 5 20.5Z"/><path d="M5 20.5V5.5M19 18H8"/>'),
  practice: P('<path d="M4 6.5h9a3 3 0 0 1 3 3V14"/><path d="M20 17.5h-9a3 3 0 0 1-3-3V10"/><path d="m13 4 2.5 2.5L13 9M11 15l-2.5 2.5L11 20"/>'),
  tools: P('<rect x="5" y="3.5" width="14" height="17" rx="2"/><path d="M8 7.5h8M8.5 12h1M12 12h1M15.5 12h0M8.5 15.5h1M12 15.5h1M15.5 15.5h0"/>'),
  me: P('<circle cx="12" cy="8" r="3.8"/><path d="M5 20a7 7 0 0 1 14 0"/>'),
  team: P('<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><path d="M15.5 6a3.2 3.2 0 0 1 0 5.8M17.5 14a5.5 5.5 0 0 1 3 5"/>'),
  chev: P('<path d="m14.5 6-6 6 6 6"/>'),
  back: P('<path d="m9.5 6 6 6-6 6"/>'),
  check: P('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
  lock: P('<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>'),
  ring: P('<circle cx="12" cy="14.5" r="6.5"/><path d="M9.5 8.5 8 5l4-2 4 2-1.5 3.5"/>'),
  cube: P('<path d="M12 3 20 7.5v9L12 21l-8-4.5v-9Z"/><path d="M4 7.5 12 12l8-4.5M12 12v9"/>'),
  scroll: P('<path d="M7 4h11a2 2 0 0 1 2 2v1h-4"/><path d="M16 7v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-1h10v1a2 2 0 0 0 2 2"/><path d="M7 4a2 2 0 0 0-2 2v11"/><path d="M9 9h4M9 12.5h4"/>'),
  download: P('<path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5"/><path d="M5 19h14"/>'),
  camera: P('<path d="M4 8h3l1.8-2.5h6.4L17 8h3v11H4Z"/><circle cx="12" cy="13.2" r="3.6"/>'),
  move: P('<path d="M12 3v18M3 12h18M12 3 9.5 5.5M12 3l2.5 2.5M12 21l-2.5-2.5M12 21l2.5-2.5M3 12l2.5-2.5M3 12l2.5 2.5M21 12l-2.5-2.5M21 12l-2.5 2.5"/>'),
  rotate: P('<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4v5h-5"/>'),
  scale: P('<rect x="4" y="11" width="9" height="9" rx="1"/><path d="M13 11V4h7v7h-7"/><path d="m13 11 7-7"/>'),
  orbit: P('<circle cx="12" cy="12" r="2.2"/><ellipse cx="12" cy="12" rx="9" ry="4"/><ellipse cx="12" cy="12" rx="4" ry="9"/>'),
  plus: P('<path d="M12 5v14M5 12h14"/>'),
  video: P('<rect x="3.5" y="6" width="12" height="12" rx="2"/><path d="m15.5 10.5 5-3v9l-5-3"/>'),
  grid: P('<path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>'),
  chart: P('<path d="M4 20h16"/><path d="m5 15 4.5-5 3.5 3.5L19 6"/><path d="M15 6h4v4"/>'),
  sun: P('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>'),
  undo: P('<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>'),
  trash: P('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),
  book: P('<path d="M4 5h6a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H4ZM20 5h-6a2 2 0 0 0-2 2v13a2 2 0 0 1 2-2h6Z"/>'),
};

/** Brand: the crown of «خانه سکه و شمش تاج» (coin for the jewel, gold bar for the base). */
export const brandMark = raw(crownSvg({ size: 34, ring: false, id: 'bm', cls: 'crown brand-crown' }));

export const ringEl = (pct, cls = '') => html`<div class="ring ${cls}" style="--p:${Math.max(0, Math.min(100, pct ?? 0))}" data-v="${fa(Math.round(pct ?? 0))}" role="img" aria-label="${fa(Math.round(pct ?? 0))} درصد"></div>`;
export const barEl = (pct) => html`<div class="bar" role="progressbar" aria-valuenow="${Math.round(pct)}" aria-valuemin="0" aria-valuemax="100"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></div>`;
export const back = (href, label) => html`<a class="back" href="${href}" data-link>${ICON.back}${label}</a>`;

export const faDate = (iso) => (iso ? new Date(iso).toLocaleDateString('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' }) : '—');
export const faTime = (iso) => (iso ? new Date(iso).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }) : '—');

export function nextLesson() {
  const done = new Set(store.me.progress.lessonsDone);
  for (const cid of store.content.path) {
    const c = store.course(cid);
    const l = c?.lessons.find((x) => !done.has(x.id));
    if (l) return { course: c, lesson: l, index: c.lessons.indexOf(l) };
  }
  return null;
}
export const courseTitle = (id) => store.course(id)?.title ?? id;
