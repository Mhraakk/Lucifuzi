import { html, raw, fa, store } from './core.mjs';

const P = (d) => raw(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`);
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
  sun: P('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>'),
  undo: P('<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>'),
  trash: P('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),
  book: P('<path d="M4 5h6a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H4ZM20 5h-6a2 2 0 0 0-2 2v13a2 2 0 0 1 2-2h6Z"/>'),
};

/** Brand: a twelve-petal rosette, the motif carved along the stairways of Persepolis. */
export const brandMark = raw('<svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="bm" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff3cf"/><stop offset=".45" stop-color="#e3b862"/><stop offset="1" stop-color="#8f6420"/></linearGradient></defs><circle cx="32" cy="32" r="29" fill="none" stroke="url(#bm)" stroke-width="1.6"/><circle cx="32" cy="32" r="25" fill="none" stroke="url(#bm)" stroke-width=".6" opacity=".6"/><g fill="url(#bm)" opacity=".95"><path d="M32 32 C29 24 29 16 32 9 C35 16 35 24 32 32Z" transform="rotate(0 32 32)"/><path d="M32 32 C29 24 29 16 32 9 C35 16 35 24 32 32Z" transform="rotate(30 32 32)"/><path d="M32 32 C29 24 29 16 32 9 C35 16 35 24 32 32Z" transform="rotate(60 32 32)"/><path d="M32 32 C29 24 29 16 32 9 C35 16 35 24 32 32Z" transform="rotate(90 32 32)"/><path d="M32 32 C29 24 29 16 32 9 C35 16 35 24 32 32Z" transform="rotate(120 32 32)"/><path d="M32 32 C29 24 29 16 32 9 C35 16 35 24 32 32Z" transform="rotate(150 32 32)"/><path d="M32 32 C29 24 29 16 32 9 C35 16 35 24 32 32Z" transform="rotate(180 32 32)"/><path d="M32 32 C29 24 29 16 32 9 C35 16 35 24 32 32Z" transform="rotate(210 32 32)"/><path d="M32 32 C29 24 29 16 32 9 C35 16 35 24 32 32Z" transform="rotate(240 32 32)"/><path d="M32 32 C29 24 29 16 32 9 C35 16 35 24 32 32Z" transform="rotate(270 32 32)"/><path d="M32 32 C29 24 29 16 32 9 C35 16 35 24 32 32Z" transform="rotate(300 32 32)"/><path d="M32 32 C29 24 29 16 32 9 C35 16 35 24 32 32Z" transform="rotate(330 32 32)"/></g><circle cx="32" cy="32" r="4.2" fill="#0d0b08" stroke="url(#bm)" stroke-width="1.4"/></svg>');

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
