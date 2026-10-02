// داک (spec 0021): the tab bar answers the hand. On a desktop rail, icons swell by the pointer's distance with a small
// jelly squash, one highlight glides behind the item under the pointer, and a tray beside the rail says what the
// place holds — its words morph and slide in the direction the pointer moved. On a phone, a press-and-hold opens the
// tray above the bar; sliding the finger across the tabs scrubs it, and letting go opens the tab under the finger.
// A quick tap is still a plain tap. Springs only (motion.mjs); nothing animates while the bar is at rest.
import { spring, springEase, morphText, still } from './motion.mjs';

const fine = () => typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches;
const rail = () => typeof matchMedia === 'function' && matchMedia('(min-width: 960px)').matches;

/** nav: the #tabbar element (re-rendered on every route); about(href) → { label, text } for the tray. */
export function initDock(nav, { about, go }) {
  if (!nav || nav.dataset.dock) return;
  nav.dataset.dock = '1';
  const tray = document.createElement('div');
  tray.className = 'dock-tray';
  tray.setAttribute('role', 'status');
  tray.setAttribute('aria-live', 'polite');
  tray.innerHTML = '<div class="dock-tray-in"><b class="dock-t"></b><span class="dock-p"></span></div>';
  tray.hidden = true;
  document.body.append(tray);
  const inner = tray.firstElementChild;

  // the hover highlight and the tray follow their target on springs
  const hl = { x: 0, y: 0, w: 0, h: 0, o: 0 };
  const paintHl = () => {
    const el = nav.querySelector(':scope > .dock-hl');
    if (el) el.style.cssText = `transform:translate(${hl.x}px,${hl.y}px);width:${hl.w}px;height:${hl.h}px;opacity:${hl.o}`;
  };
  const S = { stiffness: 380, damping: 32 };
  const sx = spring(0, (v) => ((hl.x = v), paintHl()), S);
  const sy = spring(0, (v) => ((hl.y = v), paintHl()), S);
  const sw = spring(0, (v) => ((hl.w = v), paintHl()), S);
  const sh = spring(0, (v) => ((hl.h = v), paintHl()), S);
  const so = spring(0, (v) => ((hl.o = v), paintHl()), { stiffness: 260, damping: 26 });
  const tp = { x: 0, y: 0, o: 0, s: 0.98 };
  const paintTray = () => {
    tray.style.transform = `translate(${tp.x}px, ${tp.y}px) scale(${tp.s})`;
    tray.style.opacity = String(tp.o);
    if (tp.o < 0.01 && !tray.dataset.on) tray.hidden = true;
  };
  const tx = spring(0, (v) => ((tp.x = v), paintTray()), { stiffness: 340, damping: 30 });
  const ty = spring(0, (v) => ((tp.y = v), paintTray()), { stiffness: 340, damping: 30 });
  const to = spring(0, (v) => ((tp.o = v), paintTray()), { stiffness: 300, damping: 28 });
  const ts = spring(0.98, (v) => ((tp.s = v), paintTray()), { stiffness: 340, damping: 22 });

  let cur = null, curIdx = -1, scrub = false, holdT = 0, startPt = null;
  const items = () => [...nav.querySelectorAll(':scope > a')];
  const ensureHl = () => {
    if (!nav.querySelector(':scope > .dock-hl')) nav.insertAdjacentHTML('afterbegin', '<span class="dock-hl" aria-hidden="true"></span>');
  };

  function show(a, { jump = false } = {}) {
    if (!a) return;
    ensureHl();
    const nb = nav.getBoundingClientRect(), r = a.getBoundingClientRect();
    const first = !cur;
    const opt = { jump: jump || first };
    sx.set(r.left - nb.left, opt), sy.set(r.top - nb.top, opt), sw.set(r.width, opt), sh.set(r.height, opt);
    so.set(1);
    const idx = items().indexOf(a);
    const info = about(a.getAttribute('href'), a);
    if (a !== cur && info) {
      // the words slide in from the side the hand came from (the rail: from above or below)
      const dir = curIdx < 0 ? 0 : Math.sign(idx - curIdx);
      morphText(tray.querySelector('.dock-t'), info.label);
      morphText(tray.querySelector('.dock-p'), info.text);
      if (dir && !still()) {
        const d = rail() ? `translateY(${dir * 14}px)` : `translateX(${-dir * 22}px)`; // RTL: a later tab sits to the left
        inner.animate([{ transform: d, opacity: 0.4 }, { transform: 'none', opacity: 1 }], { duration: 420, easing: springEase(0.1) });
      }
    }
    cur = a;
    curIdx = idx;
    // the tray: beside the rail, or above the phone bar, centred on the item but kept on screen
    tray.hidden = false;
    tray.dataset.on = '1';
    const tw = tray.offsetWidth, th = tray.offsetHeight;
    let x, y;
    if (rail()) (x = nb.left - tw - 14), (y = r.top + r.height / 2 - th / 2);
    else (x = r.left + r.width / 2 - tw / 2), (y = nb.top - th - 12);
    x = Math.max(10, Math.min(innerWidth - tw - 10, x));
    y = Math.max(10, Math.min(innerHeight - th - 10, y));
    if (rail() && nb.left - tw - 14 < 10) x = nb.right + 14; // a rail on the left edge
    tx.set(x, opt), ty.set(y, opt);
    to.set(1);
    ts.set(1);
  }
  function hide() {
    cur = null;
    curIdx = -1;
    delete tray.dataset.on;
    so.set(0);
    to.set(0);
    ts.set(0.98);
    for (const s of scale.values()) s.set(1);
  }

  // magnification on the rail: each icon swells by the pointer's distance, with a jelly squash from its speed
  const scale = new Map();
  const iconSpring = (a) => {
    let s = scale.get(a);
    if (s && a.isConnected) return s;
    const svg = a.querySelector('svg');
    s = spring(1, (v, vel) => {
      const j = Math.max(-0.08, Math.min(0.08, vel * 0.012));
      // back at rest the inline transform goes, so the bar's own press and hover styles apply again
      if (svg) svg.style.transform = v === 1 && vel === 0 ? '' : `scale(${(v * (1 + j)).toFixed(4)}, ${(v * (1 - j * 0.75)).toFixed(4)})`;
    }, { stiffness: 420, damping: 24, mass: 0.6, rest: 0.001 });
    scale.set(a, s);
    return s;
  };
  function magnify(e) {
    for (const a of items()) {
      const r = a.getBoundingClientRect();
      const d = rail() ? e.clientY - (r.top + r.height / 2) : e.clientX - (r.left + r.width / 2);
      const p = Math.max(0, 1 - Math.abs(d) / 120);
      iconSpring(a).set(1 + 0.32 * p * p);
    }
  }

  nav.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse' || e.pointerType === 'pen') {
      if (!fine()) return;
      magnify(e);
      const a = e.target.closest?.('a');
      if (a && nav.contains(a)) show(a);
      return;
    }
    if (!scrub) {
      // a finger that moves before the hold fires is a scroll or a tap, not a scrub
      if (startPt && Math.hypot(e.clientX - startPt.x, e.clientY - startPt.y) > 8) clearTimeout(holdT);
      return;
    }
    e.preventDefault();
    const a = document.elementFromPoint(e.clientX, Math.min(e.clientY, nav.getBoundingClientRect().bottom - 4))?.closest?.('#tabbar > a');
    magnify(e);
    if (a) show(a);
  });
  nav.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse' || e.pointerType === 'pen') hide();
  });
  nav.addEventListener('focusin', (e) => {
    const a = e.target.closest?.('a');
    if (a && e.target.matches(':focus-visible')) show(a);
  });
  nav.addEventListener('focusout', (e) => {
    if (!nav.contains(e.relatedTarget)) hide();
  });
  // the phone: hold to open the tray, slide to scrub, let go to open
  nav.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    startPt = { x: e.clientX, y: e.clientY };
    clearTimeout(holdT);
    holdT = setTimeout(() => {
      scrub = true;
      nav.classList.add('dock-scrub');
      nav.setPointerCapture?.(e.pointerId);
      navigator.vibrate?.(8);
      show(e.target.closest('a'));
      magnify(e);
    }, 280);
  });
  const end = (e) => {
    clearTimeout(holdT);
    if (!scrub) return;
    scrub = false;
    nav.classList.remove('dock-scrub');
    const target = cur;
    hide();
    if (target && e.type === 'pointerup') go(target.getAttribute('href'));
    // the click that follows a scrub must not open the tab where the finger first landed
    const stop = (ev) => (ev.preventDefault(), ev.stopPropagation());
    nav.addEventListener('click', stop, { capture: true, once: true });
    setTimeout(() => nav.removeEventListener('click', stop, { capture: true }), 400);
  };
  nav.addEventListener('pointerup', end);
  nav.addEventListener('pointercancel', end);
  nav.addEventListener('contextmenu', (e) => scrub && e.preventDefault());
  addEventListener('scroll', () => !scrub && cur && hide(), { passive: true });
  return { hide };
}
