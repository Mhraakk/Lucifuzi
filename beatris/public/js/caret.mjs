// نشانگر نرم (spec 0021): in the boxes where people type sentences (the desk's one-line box, the assistant) the text
// cursor glides to its new place on a spring instead of jumping. Its place is measured, not computed: a hidden mirror
// of the input holds the same text with a marker at the cursor, so right-to-left Persian mixed with digits (bidi) is
// laid out by the browser exactly as the input lays it out. Any input with [data-caret] gets it on first focus.
import { spring, still } from './motion.mjs';

function attach(input) {
  if (input._caret || still()) return;
  const host = input.parentElement;
  if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
  const caret = document.createElement('i');
  caret.className = 'sc-caret';
  caret.setAttribute('aria-hidden', 'true');
  host.append(caret);
  const mirror = document.createElement('div');
  mirror.setAttribute('aria-hidden', 'true');
  mirror.className = 'sc-mirror';
  host.append(mirror);
  input.classList.add('sc-input');
  let moveT = 0;
  const sx = spring(0, (x) => (caret.style.transform = `translate(${x.toFixed(2)}px, -50%)`), { stiffness: 520, damping: 34, mass: 0.6, rest: 0.05 });
  let placed = false;

  function measure() {
    const cs = getComputedStyle(input);
    for (const k of ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontStretch', 'fontKerning', 'fontFeatureSettings', 'fontVariationSettings', 'fontVariantNumeric', 'letterSpacing', 'wordSpacing', 'textTransform', 'paddingLeft', 'paddingRight', 'borderLeftWidth', 'borderRightWidth', 'direction', 'textAlign', 'boxSizing', 'unicodeBidi']) mirror.style[k] = cs[k];
    mirror.style.width = `${input.clientWidth}px`;
    mirror.style.left = `${input.offsetLeft + input.clientLeft}px`;
    const i = input.selectionDirection === 'backward' ? input.selectionStart : input.selectionEnd;
    const v = input.value;
    mirror.textContent = v.slice(0, i ?? v.length);
    const mark = document.createElement('span');
    mark.textContent = '​';
    mirror.append(mark, document.createTextNode(v.slice(i ?? v.length) || '​'));
    // the marker's place in the mirror, minus how far the input has scrolled its text
    const x = mark.offsetLeft - input.scrollLeft + input.offsetLeft + input.clientLeft;
    const left = input.offsetLeft + input.clientLeft + parseFloat(cs.paddingLeft) - 1;
    const right = input.offsetLeft + input.clientLeft + input.clientWidth - parseFloat(cs.paddingRight) + 1;
    caret.style.top = `${input.offsetTop + input.offsetHeight / 2}px`;
    caret.style.height = `${parseFloat(cs.fontSize) * 1.15}px`;
    return { x: Math.max(left, Math.min(right, x)), hidden: input.selectionStart !== input.selectionEnd || document.activeElement !== input };
  }
  function update() {
    const m = measure();
    caret.classList.toggle('on', !m.hidden);
    if (m.hidden) return;
    sx.set(m.x, { jump: !placed });
    placed = true;
    caret.classList.add('moving'); // steady while it moves, blinking once it rests
    clearTimeout(moveT);
    moveT = setTimeout(() => caret.classList.remove('moving'), 500);
  }
  const later = () => requestAnimationFrame(update);
  input.addEventListener('input', later);
  input.addEventListener('keyup', later);
  input.addEventListener('click', later);
  input.addEventListener('scroll', later);
  input.addEventListener('focus', () => ((placed = false), later()));
  input.addEventListener('blur', () => caret.classList.remove('on'));
  document.addEventListener('selectionchange', () => document.activeElement === input && later());
  addEventListener('resize', () => document.activeElement === input && ((placed = false), later()));
  input._caret = { update };
  update();
}

/** Called once: every [data-caret] input gets the smooth cursor the first time it is focused. */
export function initCaret() {
  document.addEventListener('focusin', (e) => {
    if (e.target.matches?.('input[data-caret]')) attach(e.target);
  });
}
