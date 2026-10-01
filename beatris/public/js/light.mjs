// لایهٔ نور (spec 0012): a warm light that follows the hand, a ripple of light where a finger or the mouse presses,
// a quiet haptic tick, a sunrise when the theme changes, a thread of light while a page is on its way and a header
// that gains depth as the page scrolls. Decoration only: nothing here changes text, layout or behaviour, and nothing
// moves when the user asked for less motion.
const root = document.documentElement;
const still = matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
const quiet = () => still.matches;
const buzz = (p) => {
  if (quiet() || !navigator.vibrate || !matchMedia('(pointer: coarse)').matches) return;
  try {
    navigator.vibrate(p);
  } catch {
    /* not allowed without a gesture: silence is fine */
  }
};

/* ---------- 1. the hand light: eased toward the pointer, fades when the hand rests ---------- */
let lamp = null, raf = 0, rest = 0, tx = 0, ty = 0, x = 0, y = 0;
function follow() {
  x += (tx - x) * 0.16;
  y += (ty - y) * 0.16;
  lamp.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
  raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.5 ? requestAnimationFrame(follow) : 0;
}
addEventListener(
  'pointermove',
  (e) => {
    if (e.pointerType !== 'mouse' || quiet() || !finePointer.matches) return;
    if (!lamp) {
      lamp = Object.assign(document.createElement('div'), { className: 'lt-lamp' });
      lamp.setAttribute('aria-hidden', 'true');
      document.body.append(lamp);
      x = tx = e.clientX;
      y = ty = e.clientY;
    }
    tx = e.clientX;
    ty = e.clientY;
    root.classList.add('lt-hand');
    clearTimeout(rest);
    rest = setTimeout(() => root.classList.remove('lt-hand'), 2200);
    if (!raf) raf = requestAnimationFrame(follow);
  },
  { passive: true },
);
document.addEventListener('pointerleave', () => root.classList.remove('lt-hand'));

/* ---------- 4 + 5. a ripple of light from the pressed point, a short tick on a phone ---------- */
const PRESS = '.btn, .chip, .seg button, #tabbar a, .theme-btn';
document.addEventListener(
  'pointerdown',
  (e) => {
    if (e.button !== 0 || quiet()) return;
    const host = e.target.closest?.(PRESS);
    if (!host || host.disabled || host.closest('.paper, .printable')) return;
    if (e.pointerType === 'touch' && host.matches('.btn:not(.ghost):not(.danger)')) buzz(6);
    const r = host.getBoundingClientRect();
    if (getComputedStyle(host).position === 'static') host.classList.add('lt-host');
    const box = document.createElement('span'), dot = document.createElement('span');
    box.className = 'lt-rip-box';
    dot.className = 'lt-rip';
    const px = e.clientX - r.left, py = e.clientY - r.top;
    const d = 2 * Math.hypot(Math.max(px, r.width - px), Math.max(py, r.height - py)); // reaches the farthest corner
    dot.style.cssText = `width:${d}px;height:${d}px;left:${px - d / 2}px;top:${py - d / 2}px`;
    box.setAttribute('aria-hidden', 'true');
    box.append(dot);
    host.append(box);
    dot.addEventListener('animationend', () => box.remove(), { once: true });
    setTimeout(() => box.remove(), 1200); // a host re-rendered mid-ripple
  },
  { passive: true },
);

/* toasts: success and error each have their own tick */
const watchToasts = () => {
  const t = document.getElementById('toasts');
  if (!t) return setTimeout(watchToasts, 500);
  new MutationObserver((list) => {
    for (const m of list)
      for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        if (n.classList.contains('ok')) buzz([8, 60, 8]);
        else if (n.classList.contains('error')) buzz(24);
      }
  }).observe(t, { childList: true });
};

/* ---------- 6. sunrise: the new theme opens as a circle of light from the button that asked for it ---------- */
export function sunrise(update, cx = innerWidth / 2, cy = 0) {
  if (!document.startViewTransition || quiet()) return update();
  const t = document.startViewTransition(update);
  const r = Math.hypot(Math.max(cx, innerWidth - cx), Math.max(cy, innerHeight - cy));
  t.ready
    .then(() =>
      root.animate({ clipPath: [`circle(0px at ${cx}px ${cy}px)`, `circle(${r}px at ${cx}px ${cy}px)`] }, { duration: 900, easing: 'cubic-bezier(0.65, 0, 0.35, 1)', pseudoElement: '::view-transition-new(root)' }),
    )
    .catch(() => {});
  return t;
}

/* ---------- 7. a thread of light under the header while the next page is on its way ----------
 * core.render() announces «lt:go» and «lt:done»; a page that is ready within 140 ms shows no thread at all. */
let thread = null, wait = 0, fuse = 0, busy = false;
document.addEventListener('lt:go', () => {
  if (quiet() || busy) return;
  busy = true;
  clearTimeout(wait);
  wait = setTimeout(() => {
    if (!thread) {
      thread = Object.assign(document.createElement('div'), { className: 'lt-thread' });
      thread.setAttribute('aria-hidden', 'true');
      document.body.append(thread);
      void thread.offsetWidth;
    }
    root.classList.remove('lt-arrived');
    root.classList.add('lt-going');
    clearTimeout(fuse);
    fuse = setTimeout(() => document.dispatchEvent(new Event('lt:done')), 10000);
  }, 140);
});
document.addEventListener('lt:done', () => {
  busy = false;
  clearTimeout(wait);
  clearTimeout(fuse);
  if (!root.classList.contains('lt-going')) return;
  root.classList.replace('lt-going', 'lt-arrived');
  setTimeout(() => root.classList.remove('lt-arrived'), 700);
});

/* ---------- 8. the header gains depth once the page moves under it ---------- */
let ticking = false;
addEventListener(
  'scroll',
  () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      root.classList.toggle('lt-scrolled', scrollY > 6);
      ticking = false;
    });
  },
  { passive: true },
);

if (document.readyState === 'loading') addEventListener('DOMContentLoaded', watchToasts, { once: true });
else watchToasts();
