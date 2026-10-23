// بلوک‌های تعاملی (spec 0040): small behaviours for an app without a framework, built from scratch after the interactions
// shown on bencho.dev (no code taken; its hold-delete block is under the Bencho Pro licence and was not read). Each one
// sits where the shop's daily work needs it, works from the keyboard and with a screen reader, and settles at once under
// «حرکت کمتر». The pure parts live in blockmath.mjs (tested in tests/blocks.test.mjs).
import { esc, fa, toast } from './core.mjs';
import { still } from './motion.mjs';
import { slideProgress, SLIDE_AT, rollPlan, isFigure, acceptFile, penWidth, inkBounds } from './blockmath.mjs';

/* ---------------- رها کردن فایل ---------------- */
const UPLOAD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V4m0 0-4 4m4-4 4 4"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg>';
/**
 * A file input becomes a zone that also takes files dragged in from the computer. It lights while files hover; a drop
 * becomes the input's own files and fires its change event, so the page's handler runs exactly as for a pick. A click
 * (or Enter on the input, which stays focusable) still opens the picker; files the place does not take are refused.
 */
let strayGuard = false;
export function dropzone(input, { text = 'فایل را این‌جا رها کنید یا بزنید تا انتخاب شود', hint = '', max = Infinity } = {}) {
  // a file that misses the zone must not replace the app (the browser opens a dropped file in the tab): it is ignored.
  // A drop someone else takes (a zone, a plain file input) is left alone.
  if (!strayGuard) {
    strayGuard = true;
    const stray = (e) => !e.defaultPrevented && [...(e.dataTransfer?.types ?? [])].includes('Files') && !e.target.closest?.('input[type=file]');
    document.addEventListener('dragover', (e) => {
      if (!stray(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'none'; // the pointer says «not here»
    });
    document.addEventListener('drop', (e) => stray(e) && e.preventDefault());
  }
  const zone = document.createElement('div');
  zone.className = 'u-dz';
  zone.innerHTML = `<span class="u-dz-i" aria-hidden="true">${UPLOAD}</span><span class="u-dz-t">${esc(text)}</span>${hint ? `<small class="u-dz-h">${esc(hint)}</small>` : ''}<span class="u-dz-f" aria-live="polite"></span>`;
  input.before(zone);
  zone.append(input);
  input.classList.add('u-dz-in');
  const hasFiles = (e) => [...(e.dataTransfer?.types ?? [])].includes('Files');
  let depth = 0;
  zone.addEventListener('dragenter', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth++;
    zone.classList.add('on');
  });
  zone.addEventListener('dragover', (e) => hasFiles(e) && e.preventDefault());
  zone.addEventListener('dragleave', () => {
    depth = Math.max(0, depth - 1);
    if (!depth) zone.classList.remove('on');
  });
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    depth = 0;
    zone.classList.remove('on');
    const files = [...(e.dataTransfer?.files ?? [])];
    const ok = files.filter((f) => acceptFile(f, input.accept, max)).slice(0, input.multiple ? files.length : 1);
    if (!ok.length) return toast(files.length ? 'این نوع فایل این‌جا پذیرفته نمی‌شود.' : 'فایلی رها نشد.', 'error');
    const dt = new DataTransfer();
    for (const f of ok) dt.items.add(f);
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  // inside a <label> the label itself opens the picker; elsewhere the zone does
  if (!zone.closest('label')) zone.addEventListener('click', (e) => e.target !== input && input.click());
  input.addEventListener('change', () => (zone.querySelector('.u-dz-f').textContent = input.files?.length ? fa([...input.files].map((f) => f.name).join('، ')) : ''));
  return zone;
}

/* ---------------- نگه داشتن برای حذف ---------------- */
const HOLD_MS = 900;
const hint = (b) => toast(`برای ${b.dataset.hold || 'این کار'}، دکمه را نگه دارید تا پر شود.${b.dataset.holdWhat ? ` ${b.dataset.holdWhat}` : ''}`, 'info');
/**
 * Every [data-hold] button acts only when held: a fill runs for 900 ms and the button's own click fires at its end;
 * letting go earlier does nothing but say so. Enter or Space held from the keyboard does the same. The click a finger
 * makes coming up after a full hold is not a second request, and a page handler confirms with held(b).
 */
export function initHold(root = document) {
  let active = null;
  let timer = 0;
  let swallow = null;
  const start = (b) => {
    if (active || b.disabled) return;
    active = b;
    if (!b.querySelector(':scope > .u-hold-fill')) b.insertAdjacentHTML('beforeend', '<i class="u-hold-fill" aria-hidden="true"></i>');
    void b.offsetWidth;
    b.classList.add('holding');
    timer = setTimeout(() => {
      b.classList.remove('holding');
      active = null;
      swallow = b;
      b.dataset.heldAt = String(Date.now());
      b.click();
    }, HOLD_MS);
  };
  const stop = () => {
    if (!active) return false;
    clearTimeout(timer);
    active.classList.remove('holding');
    active = null;
    return true;
  };
  root.addEventListener('pointerdown', (e) => {
    const b = e.target.closest?.('[data-hold]');
    if (!b || (e.pointerType === 'mouse' && e.button !== 0)) return;
    start(b);
    b.addEventListener('pointerleave', stop, { once: true });
  });
  root.addEventListener('pointerup', () => (stop(), setTimeout(() => (swallow = null))));
  root.addEventListener('pointercancel', stop);
  root.addEventListener('contextmenu', (e) => e.target.closest?.('[data-hold]') && e.preventDefault());
  root.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const b = e.target.closest?.('[data-hold]');
    if (!b) return;
    e.preventDefault(); // no click on the key going down
    if (!e.repeat) start(b);
  });
  root.addEventListener('keyup', (e) => {
    const b = (e.key === 'Enter' || e.key === ' ') && e.target.closest?.('[data-hold]');
    if (!b) return;
    e.preventDefault(); // nor on Space coming up
    if (stop()) hint(b);
    setTimeout(() => (swallow = null));
  });
  // a click from the hand reaches the page only as the end of a full hold (fired above); a plain one gets the hint
  root.addEventListener(
    'click',
    (e) => {
      const b = e.target.closest?.('[data-hold]');
      if (!b || !e.isTrusted) return;
      e.stopImmediatePropagation();
      e.preventDefault();
      if (swallow === b) swallow = null;
      else hint(b);
    },
    true,
  );
}
/** In a click handler of a [data-hold] button: true only for the click a full hold made. */
export function held(b) {
  const t = Number(b?.dataset.heldAt || 0);
  if (b) delete b.dataset.heldAt;
  return t > 0 && Date.now() - t < 1500;
}

/* ---------------- کشیدن برای ثبت ---------------- */
const PHONE = '(pointer: coarse) and (max-width: 700px)';
const CHEVRON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m14.5 6-6 6 6 6"/></svg>';
/**
 * On a touch phone the button that books for good becomes a track: the knob slides to the far end to confirm, and a
 * tap alone does nothing. The button stays in the page (hidden), so Ctrl+Enter, a desktop and the page's own handler
 * are unchanged: a full slide clicks it.
 */
export function slideConfirm(btn, { label = 'برای ثبت، دستگیره را تا انتها بکشید' } = {}) {
  const mq = matchMedia(PHONE);
  const name = btn.textContent.replace(/Ctrl\+Enter/i, '').replace(/\s+/g, ' ').trim();
  const box = document.createElement('div');
  box.className = 'u-slide';
  box.innerHTML = `<span class="u-slide-t" aria-hidden="true">${esc(label)}</span><button type="button" class="u-slide-k" aria-label="${esc(name)}: ${esc(label)}">${CHEVRON}</button>`;
  btn.after(box);
  const knob = box.querySelector('.u-slide-k');
  let x0 = 0;
  let len = 0;
  let p = 0;
  let dragging = false;
  const set = (v) => {
    p = v;
    box.style.setProperty('--slide', `${(v * len).toFixed(1)}px`);
    box.classList.toggle('near', v >= SLIDE_AT);
  };
  const book = () => {
    box.classList.add('done');
    set(1);
    btn.click();
    setTimeout(() => (box.classList.remove('done'), set(0)), 900);
  };
  knob.addEventListener('pointerdown', (e) => {
    if (btn.disabled) return;
    knob.setPointerCapture?.(e.pointerId);
    len = box.clientWidth - knob.offsetWidth - 8;
    x0 = e.clientX;
    dragging = true;
    box.classList.add('drag');
  });
  knob.addEventListener('pointermove', (e) => dragging && set(slideProgress(e.clientX, x0, len, getComputedStyle(box).direction === 'rtl')));
  const end = () => {
    if (!dragging) return;
    dragging = false;
    box.classList.remove('drag');
    if (p >= SLIDE_AT) book();
    else set(0);
  };
  knob.addEventListener('pointerup', end);
  knob.addEventListener('pointercancel', end);
  // the keyboard is never in a pocket: Enter or Space on the knob confirms
  knob.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), book()));
  const apply = () => {
    btn.classList.toggle('u-slide-off', mq.matches);
    box.hidden = !mq.matches;
  };
  mq.addEventListener?.('change', apply);
  apply();
  const sync = () => (knob.disabled = btn.disabled);
  new MutationObserver(sync).observe(btn, { attributes: true, attributeFilter: ['disabled'] });
  sync();
  return box;
}

/* ---------------- امضا ---------------- */
const INK = '#1d1a15';
/**
 * A pen on a canvas: the stroke follows a finger, a stylus or the mouse with a curve through the midpoints, a little
 * finer when fast. The picture is a transparent PNG cropped to the ink; the points themselves are never kept.
 */
export function signaturePad(canvas, { onChange } = {}) {
  const ctx = canvas.getContext('2d');
  let strokes = [];
  let cur = null;
  let dpr = 1;
  // points are kept in the canvas's own CSS pixels: a dialog still scaling in (u-dialog) changes the drawn box, not them
  const at = (e) => {
    const r = canvas.getBoundingClientRect();
    const k = r.width ? canvas.clientWidth / r.width : 1;
    return { x: (e.clientX - r.left) * k, y: (e.clientY - r.top) * k, t: e.timeStamp };
  };
  const segment = (g, a, b, c) => {
    // from the midpoint before b to the midpoint after it, bent through b
    g.lineWidth = b.w;
    g.beginPath();
    g.moveTo((a.x + b.x) / 2, (a.y + b.y) / 2);
    g.quadraticCurveTo(b.x, b.y, (b.x + c.x) / 2, (b.y + c.y) / 2);
    g.stroke();
  };
  const paint = (g, s) => {
    if (s.length === 1) {
      g.beginPath();
      g.arc(s[0].x, s[0].y, s[0].w / 2, 0, Math.PI * 2);
      g.fill();
      return;
    }
    for (let i = 0; i < s.length - 1; i++) segment(g, s[Math.max(0, i - 1)], s[i], s[i + 1]);
  };
  const pen = (g) => {
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.strokeStyle = g.fillStyle = INK;
  };
  const redraw = () => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pen(ctx);
    for (const s of strokes) paint(ctx, s);
  };
  const size = () => {
    dpr = Math.min(3, devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr));
    canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr));
    redraw();
  };
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    canvas.setPointerCapture?.(e.pointerId);
    const p = at(e);
    cur = [{ ...p, w: penWidth(0) }];
    strokes.push(cur);
    redraw();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!cur) return;
    const p = at(e);
    const q = cur[cur.length - 1];
    const dist = Math.hypot(p.x - q.x, p.y - q.y);
    if (dist < 1.5) return;
    const speed = dist / Math.max(1, p.t - q.t);
    cur.push({ ...p, w: q.w * 0.65 + penWidth(speed) * 0.35 });
    redraw();
  });
  const end = () => {
    if (!cur) return;
    cur = null;
    onChange?.(strokes.length);
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  addEventListener('resize', size);
  size();
  return {
    isEmpty: () => !strokes.length,
    clear() {
      strokes = [];
      redraw();
      onChange?.(0);
    },
    /** The ink as a PNG data URL, cropped and drawn at twice the size for print; null when nothing was signed. */
    toPNG() {
      const box = inkBounds(strokes);
      if (!box) return null;
      const k = 2;
      const out = document.createElement('canvas');
      out.width = Math.ceil(box.w * k);
      out.height = Math.ceil(box.h * k);
      const g = out.getContext('2d');
      g.setTransform(k, 0, 0, k, -box.x * k, -box.y * k);
      pen(g);
      for (const s of strokes) paint(g, s);
      return out.toDataURL('image/png');
    },
    destroy: () => removeEventListener('resize', size),
  };
}

/* ---------------- رقم غلتان ---------------- */
/**
 * Sets a figure in el; when it replaces another of the same shape, each changed digit rolls to its new value and the
 * rest stay still. The whole figure is read by screen readers and by innerText from one hidden copy; the columns are
 * drawn by CSS (their digits are not text), so copying or reading the element gives the figure once.
 */
const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
export function rollTo(el, value) {
  const next = fa(String(value));
  const prev = el.dataset.roll;
  if (prev === next && el.firstChild) return;
  el.dataset.roll = next;
  if (!isFigure(next)) {
    el.textContent = next; // words read in their own direction; only a figure is cut into columns
    return;
  }
  const plan = rollPlan(prev, next);
  const roll = prev != null && !still() && plan.some((c) => c.rolls);
  el.innerHTML = `<span class="sr">${esc(next)}</span><span class="u-roll-w" aria-hidden="true">${plan
    .map((c) => ('d' in c ? `<span class="u-roll" data-d="${FA_DIGITS[c.d]}"><span class="u-roll-s" style="--d:${roll ? c.from : c.d}"></span></span>` : `<span class="u-roll-c" data-c="${esc(c.ch)}"></span>`))
    .join('')}</span>`;
  if (!roll) return;
  void el.offsetWidth;
  const to = plan.filter((c) => 'd' in c).map((c) => c.d);
  el.querySelectorAll('.u-roll-s').forEach((s, i) => s.style.setProperty('--d', String(to[i])));
}
