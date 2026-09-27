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
  book: P('<path d="M4 5h6a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H4ZM20 5h-6a2 2 0 0 0-2 2v13a2 2 0 0 1 2-2h6Z"/>'),
};

export const brandMark = raw('<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="36" r="15" fill="none" stroke="#d6ad57" stroke-width="5"/><path d="M24 16l8-7 8 7-8 6z" fill="#f2e4c4"/></svg>');

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
