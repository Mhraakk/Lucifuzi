// انتخابگر پوسته (spec 0014): a panel beside the skin button (a bottom sheet on a phone). Hovering or focusing a card
// shows the whole app in that skin at once; leaving or Esc returns; a click or Enter keeps it. The mode (fixed, with
// the device, with the sun) and the live light are in the same panel. The choice lives on this device only.
import { SKINS, SKIN, MODES, readPref, writePref, resolveSkin, choose, flipTone, paint, paintSky } from './skins.mjs';

const MODE_FA = { fixed: 'ثابت', os: 'همراه دستگاه', sun: 'همراه خورشید' };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
let pref = readPref();
let previewing = false;
let darkQuery = null;
const osDark = () => (typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)').matches : true);
export const currentSkin = () => resolveSkin(pref, { osDark: osDark() });
const ambient = () => {
  document.documentElement.dataset.amb = pref.amb ? '1' : '0';
};

/** Put the chosen skin on at start, and keep the automatic modes and the light in step with the clock and the device. */
export function initSkins({ onChange = () => {} } = {}) {
  paint(currentSkin());
  paintSky();
  ambient();
  const follow = () => {
    if (previewing) return;
    const id = currentSkin();
    if (document.documentElement.dataset.skin !== id) {
      paint(id);
      onChange(id);
    }
    paintSky();
  };
  setInterval(follow, 60000);
  // kept in a module variable: a MediaQueryList nobody holds may be collected along with its listener
  if (typeof matchMedia === 'function') (darkQuery = matchMedia('(prefers-color-scheme: dark)')).addEventListener?.('change', follow);
}

/** The dashboard's light/dark switch: the other member of the pair, as a fixed choice. */
export function flipSkin() {
  pref = writePref(flipTone(pref, { osDark: osDark() }));
  return paint(currentSkin());
}

const mini = (s) => `<span class="sk-mini" data-mini="${s.id}" aria-hidden="true"><i class="sk-bar"></i><i class="sk-line"></i><i class="sk-line short"></i><span class="sk-card"><i class="sk-btn"></i><b class="sk-up">۱۲</b><b class="sk-down">۸</b></span></span>`;
const card = (s, on) => `<button class="sk-card-btn" role="option" data-pick="${s.id}" aria-selected="${on}" tabindex="${on ? 0 : -1}">${mini(s)}<span class="sk-name">${esc(s.fa)}</span><small>${esc(s.note)}</small></button>`;

let pop = null;
/** Open (or close) the panel beside `anchor`. `onPick(id)` runs after a skin is kept (to animate the switch). */
export function toggleSkinPicker(anchor, { onPick = (id, apply) => apply() } = {}) {
  if (pop) return closePicker();
  const cur = currentSkin();
  pop = document.createElement('div');
  pop.className = 'sk-pop';
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-label', 'پوسته');
  const group = (tone, title) => `<h3>${title}</h3><div class="sk-grid" role="listbox" aria-label="${title}">${SKINS.filter((s) => s.tone === tone).map((s) => card(s, s.id === cur)).join('')}</div>`;
  pop.innerHTML = `<div class="sk-head"><div class="sk-seg" role="radiogroup" aria-label="حالت">${MODES.map((m) => `<button role="radio" data-mode="${m}" aria-checked="${pref.mode === m}">${MODE_FA[m]}</button>`).join('')}</div>
    <label class="sk-amb"><input type="checkbox" data-amb ${pref.amb ? 'checked' : ''}> نور زنده</label></div>
    ${pref.mode !== 'fixed' ? `<p class="sk-note">در حالت خودکار، یک پوسته روشن و یک پوسته تیره انتخاب کنید.</p>` : ''}
    ${group('light', 'روشن')}${group('dark', 'تیره')}`;
  document.body.append(pop);
  for (const el of pop.querySelectorAll('[data-mini]')) paint(el.dataset.mini, el);
  if (anchor) {
    const r = anchor.getBoundingClientRect();
    const w = pop.offsetWidth;
    pop.style.top = `${Math.round(r.bottom + 8)}px`;
    pop.style.left = `${Math.max(12, Math.min(Math.round(r.left), innerWidth - w - 12))}px`;
  }
  const back = () => {
    previewing = false;
    paint(currentSkin());
  };
  const preview = (id) => {
    previewing = true;
    paint(id);
  };
  const keep = (id) => {
    pref = writePref(choose(pref, id));
    previewing = false;
    const target = currentSkin();
    back();
    onPick(target, () => paint(target));
    for (const b of pop.querySelectorAll('[data-pick]')) {
      const on = b.dataset.pick === id;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
    }
  };
  pop.addEventListener('pointerover', (e) => {
    const b = e.target.closest('[data-pick]');
    if (b) preview(b.dataset.pick);
  });
  pop.addEventListener('pointerleave', back);
  pop.addEventListener('focusin', (e) => {
    const b = e.target.closest('[data-pick]');
    if (b) preview(b.dataset.pick);
  });
  pop.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pick]');
    if (b) return keep(b.dataset.pick);
    const m = e.target.closest('[data-mode]');
    if (m) {
      pref = writePref({ ...pref, mode: m.dataset.mode, skin: currentSkin() });
      closePicker();
      paint(currentSkin());
      return toggleSkinPicker(anchor, { onPick });
    }
  });
  pop.addEventListener('change', (e) => {
    if (e.target.matches('[data-amb]')) {
      pref = writePref({ ...pref, amb: e.target.checked });
      ambient();
    }
  });
  pop.addEventListener('keydown', (e) => {
    const cards = [...pop.querySelectorAll('[data-pick]')];
    const i = cards.indexOf(document.activeElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      back();
      closePicker();
      anchor?.focus();
    } else if (i >= 0 && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      e.preventDefault();
      // RTL: the right arrow goes back
      const step = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? -1 : 1;
      cards[(i + step + cards.length) % cards.length].focus();
    } else if (i >= 0 && e.key === 'Enter') {
      e.preventDefault();
      keep(cards[i].dataset.pick);
    }
  });
  setTimeout(() => {
    document.addEventListener('pointerdown', outside, true);
    (pop?.querySelector('[aria-selected="true"]') ?? pop?.querySelector('[data-pick]'))?.focus({ preventScroll: true });
  });
  return pop;
}
function outside(e) {
  if (pop && !pop.contains(e.target) && !e.target.closest('#themeBtn,[data-skin-open]')) closePicker();
}
export function closePicker() {
  if (!pop) return;
  if (previewing) {
    previewing = false;
    paint(currentSkin());
  }
  document.removeEventListener('pointerdown', outside, true);
  pop.remove();
  pop = null;
}
export const skinName = (id = currentSkin()) => SKIN[id]?.fa ?? '';
