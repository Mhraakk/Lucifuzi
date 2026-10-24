// کد شش‌رقمی (spec 0022): one real input — so pasting, the phone's «one-time-code» suggestion, Persian digits and screen
// readers all just work — under six cells that show what was typed. The cells read left to right like any code, the
// next empty cell glows, a new digit lands with a small spring, and a wrong code shakes the row once.
import { html, raw, esc } from './core.mjs';

const toLatin = (s) => String(s ?? '').replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/\D/g, '');
const faDigit = (d) => '۰۱۲۳۴۵۶۷۸۹'[d] ?? '';

/** The markup: a label, six cells and the input that owns the value. */
export function codeBox({ name = 'code', length = 6, label = 'کد پیامک‌شده', id = '' } = {}) {
  return html`<label class="otp" data-otp data-len="${length}" style="--otp-n:${length}"><span class="otp-label">${label}</span>
    <span class="otp-cells" dir="ltr" aria-hidden="true">${Array.from({ length }, () => html`<i></i>`)}</span>
    <input class="otp-input"${id ? raw(` id="${esc(id)}"`) : ''} name="${name}" dir="ltr" inputmode="numeric" autocomplete="one-time-code" maxlength="${length * 2}" spellcheck="false" aria-label="${label}، ${length} رقم" required></label>`;
}

/**
 * Wires every [data-otp] inside root. onComplete(code) runs when all cells are full. Returns { value, clear, fail, focus,
 * fill } for the page: fail() shakes the row and empties it; fill(code) types a code (the demo chip, the phone's WebOTP).
 */
export function initCodeBox(root, { onComplete } = {}) {
  const box = root.querySelector('[data-otp]');
  if (!box) return null;
  const input = box.querySelector('input');
  const cells = [...box.querySelectorAll('.otp-cells i')];
  const len = cells.length;
  let last = '';
  const draw = () => {
    const v = toLatin(input.value).slice(0, len);
    if (input.value !== v) input.value = v;
    cells.forEach((c, i) => {
      c.textContent = faDigit(v[i]);
      c.classList.toggle('on', i === Math.min(v.length, len - 1) && document.activeElement === input);
      c.classList.toggle('full', i < v.length);
      if (i === v.length - 1 && v.length > last.length) c.classList.remove('pop'), void c.offsetWidth, c.classList.add('pop');
    });
    box.classList.remove('bad');
    const done = v.length === len && v !== last;
    last = v;
    if (done) onComplete?.(v);
  };
  input.addEventListener('input', draw);
  input.addEventListener('focus', draw);
  input.addEventListener('blur', draw);
  // the caret always sits at the end: the cells show a code, not an editable text
  input.addEventListener('keydown', () => requestAnimationFrame(() => input.setSelectionRange(input.value.length, input.value.length)));
  draw();
  return {
    get value() {
      return toLatin(input.value).slice(0, len);
    },
    clear() {
      input.value = '';
      last = '';
      draw();
    },
    fail() {
      input.value = '';
      last = '';
      draw();
      box.classList.add('bad');
      input.focus({ preventScroll: true });
    },
    focus: () => input.focus({ preventScroll: true }),
    fill(code) {
      input.value = toLatin(code).slice(0, len);
      draw();
    },
  };
}
