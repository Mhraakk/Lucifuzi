// The Odyssée editorial grammar (spec 0043), built on the app's own pictures:
// - a statement whose first line is indented;
// - numbered chapters over a hairline that fills with the chapter;
// - pictures cut by a shifted strip;
// - a counter that follows the chapter on screen.
// Used on /intro's paper chapter and on /history. No framework; nothing runs while nothing moves.
import { html, fa } from './core.mjs';

const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * A picture with one horizontal band moved sideways (`cut` = the band as [top %, bottom %] left uncovered; `shift` in % of
 * the width). The band is a second layer of the same picture, so the <img> keeps the alternative text. `fit` follows the
 * picture: `cover` for photographs and renders on their own ground, `contain` for cut-out 3D renders.
 */
export const pic = ({ src = '', alt = '', cut = [38, 36], shift = -2.5, cls = '', words = [], fit = 'cover', lazy = true }) =>
  html`<figure class="od-pic ${cls}" style="--src:url(${src});--a:${cut[0]}%;--b:${cut[1]}%;--shift:${shift}%;--fit:${fit}">${src ? html`<img src="${src}" alt="${alt}" ${lazy ? html`loading="lazy"` : ''} decoding="async">` : ''}<span class="od-cut" aria-hidden="true"></span>${words.length ? html`<figcaption class="od-words">${words.map((w) => html`<span>${w}</span>`)}</figcaption>` : ''}</figure>`;

/** A statement: a large serif paragraph (its first line indented), a short line, a link that is plain text. */
export const statement = ({ text, sub = '', link = null, thumb = null, cls = '' }) =>
  html`<div class="od-statement ${cls}">${thumb ? html`<img class="od-thumb" src="${thumb.src}" alt="${thumb.alt ?? ''}" loading="lazy" decoding="async">` : html`<span aria-hidden="true"></span>`}<div><p class="od-big">${text}</p>${sub ? html`<p class="od-sub">${sub}</p>` : ''}${link ? html`<a class="od-link" href="${link.href}" data-link>${link.text}</a>` : ''}</div></div>`;

/** The counter, the chapter's name and the hairline (its dark part grows with the chapter). */
export const bar = (i, n, name, extra = '') =>
  html`<div class="od-bar"><span class="od-count"><b>${fa(i + 1)}</b> : ${fa(n)}</span><span class="od-name">${name}</span>${extra}</div><div class="od-line" aria-hidden="true"><i style="--p:${(i + 1) / n}"></i></div>`;
const setBar = (host, i, n, name) => {
  host.querySelector('.od-count b').textContent = fa(i + 1);
  host.querySelector('.od-line i').style.setProperty('--p', String((i + 1) / n));
  if (name != null) host.querySelector('.od-name').textContent = name;
};

/** Numbered chapters: tiles are tabs; the chosen one's text shows under it. `items`: [{ src, title, text }]. */
export const chapters = ({ id, label, items }) =>
  html`<section class="od-chapters" id="${id}" aria-label="${label}" style="--col:1">${bar(0, items.length, label, html`<button type="button" class="od-pause" aria-pressed="false">توقف</button>`)}
    <div class="od-tiles" role="tablist" aria-label="${label}">${items.map((it, i) => html`<button type="button" role="tab" class="od-tile" id="${id}-t${i}" aria-controls="${id}-p" aria-selected="${String(!i)}" tabindex="${i ? '-1' : '0'}"><span class="od-tile-pic"><img src="${it.src}" alt="" loading="lazy" decoding="async"></span><span class="od-cap"><i>(${fa(i + 1)}).</i>${it.title}</span></button>`)}</div>
    <div class="od-panel" id="${id}-p" role="tabpanel" aria-labelledby="${id}-t0"><p>${items[0].text}</p></div></section>`;

/**
 * Wires a chapters section: click, arrow keys (in RTL, left is next), Home and End. It advances by itself every
 * `every` ms only while it is on screen, nobody hovers or focuses it, «توقف» is off and motion is not reduced.
 */
export function wireChapters(el, items, { every = 7000 } = {}) {
  const tabs = [...el.querySelectorAll('[role=tab]')], panel = el.querySelector('[role=tabpanel]'), pause = el.querySelector('.od-pause');
  let cur = 0, timer = 0, seen = false, hold = false, stopped = still();
  if (stopped) pause.hidden = true; // nothing moves by itself, so there is nothing to stop
  const show = (i, focus = false) => {
    cur = (i + tabs.length) % tabs.length;
    tabs.forEach((t, k) => {
      t.setAttribute('aria-selected', String(k === cur));
      t.tabIndex = k === cur ? 0 : -1;
    });
    panel.firstElementChild.textContent = items[cur].text;
    panel.setAttribute('aria-labelledby', tabs[cur].id);
    el.style.setProperty('--col', String(cur + 1));
    setBar(el, cur, tabs.length);
    if (focus) tabs[cur].focus();
  };
  const tick = () => {
    clearTimeout(timer);
    if (stopped || hold || !seen || document.hidden) return;
    timer = setTimeout(() => (show(cur + 1), tick()), every);
  };
  el.addEventListener('click', (e) => {
    const t = e.target.closest('[role=tab]');
    if (t) return show(tabs.indexOf(t)), tick();
    if (e.target.closest('.od-pause')) {
      stopped = !stopped;
      pause.setAttribute('aria-pressed', String(stopped));
      pause.textContent = stopped ? 'ادامه' : 'توقف';
      tick();
    }
  });
  el.addEventListener('keydown', (e) => {
    if (!e.target.closest('[role=tab]')) return;
    const to = { ArrowLeft: cur + 1, ArrowRight: cur - 1, Home: 0, End: tabs.length - 1 }[e.key];
    if (to == null) return;
    e.preventDefault();
    show(to, true);
  });
  el.addEventListener('pointerenter', () => ((hold = true), clearTimeout(timer)));
  el.addEventListener('pointerleave', () => ((hold = false), tick()));
  el.addEventListener('focusin', () => ((hold = true), clearTimeout(timer)));
  el.addEventListener('focusout', (e) => !el.contains(e.relatedTarget) && ((hold = false), tick()));
  const io = new IntersectionObserver(([en]) => ((seen = en.isIntersecting), tick()), { threshold: 0.3 });
  io.observe(el);
  document.addEventListener('visibilitychange', tick);
  return () => {
    clearTimeout(timer);
    io.disconnect();
    document.removeEventListener('visibilitychange', tick);
  };
}

/** The strips slide into place once each picture comes on screen (under reduced motion they simply stand moved). */
export function watchPics(root) {
  const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && (e.target.classList.add('in'), io.unobserve(e.target))), { rootMargin: '0px 0px -12% 0px' });
  for (const el of root.querySelectorAll('.od-pic')) io.observe(el);
  return () => io.disconnect();
}

/** A counter that follows the section crossing the middle of the screen; each section names itself in `data-name`. */
export function wireCounter(host, sections) {
  const n = sections.length;
  const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && setBar(host, sections.indexOf(e.target), n, e.target.dataset.name)), { rootMargin: '-45% 0px -50% 0px' });
  sections.forEach((s) => io.observe(s));
  return () => io.disconnect();
}
