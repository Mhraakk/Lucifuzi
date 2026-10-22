// The workspace chooser (spec 0038), the same for a person in «من» and for a manager setting a colleague's in «تیم»:
// four ways of working as cards, the screen's density, and up to eight pins. Saving goes through `save`.
import { html, fa, toast } from './core.mjs';
import { PROFILES, ACTIONS, DENSITIES, MAX_PINS, reachable } from './workspace.mjs';

export function workspaceForm(box, { workspace, admin = false, save, who = '' }) {
  let W = { ...workspace, pins: [...workspace.pins] };
  const draw = () => {
    const pinnable = Object.keys(ACTIONS).filter((k) => reachable([k], { admin }).length);
    box.innerHTML = String(html`<form class="wsf" novalidate>
      <fieldset class="wsf-profiles"><legend>${who ? `فضای کار ${who}` : 'روش کار من'}</legend>
        ${Object.entries(PROFILES).map(([id, p]) => html`<label class="wsf-card ${W.profile === id ? 'on' : ''}"><input type="radio" name="profile" value="${id}" ${W.profile === id ? 'checked' : ''}><b>${p.label}</b><span>${p.note}</span></label>`)}
      </fieldset>
      <fieldset class="wsf-density"><legend>تراکم صفحه</legend><div class="seg">${Object.entries(DENSITIES).map(([id, l]) => html`<label class="segopt"><input type="radio" name="density" value="${id}" ${W.density === id ? 'checked' : ''}><span>${l}</span></label>`)}</div></fieldset>
      <fieldset class="wsf-pins"><legend>میان‌برها <span class="small">(${fa(W.pins.length)} از ${fa(MAX_PINS)})</span></legend>
        ${pinnable.map((k) => html`<label class="chip ${W.pins.includes(k) ? 'on' : ''}"><input type="checkbox" name="pin" value="${k}" ${W.pins.includes(k) ? 'checked' : ''}> ${ACTIONS[k].label}</label>`)}
      </fieldset>
      <div class="actions"><button class="btn">ذخیره‌ی فضای کار</button>${W.chosen ? html`<button class="btn ghost" type="button" data-reset>پیش‌فرض نقش</button>` : ''}</div>
    </form>`);
  };
  draw();
  box.addEventListener('change', (e) => {
    const t = e.target;
    if (t.name === 'profile') {
      W = { ...W, profile: t.value, pins: [...PROFILES[t.value].pins].filter((k) => reachable([k], { admin }).length), density: t.value === 'operator' ? 'compact' : W.density };
      draw();
    } else if (t.name === 'density') W.density = t.value;
    else if (t.name === 'pin') {
      if (t.checked && W.pins.length >= MAX_PINS) {
        t.checked = false;
        return toast(`حداکثر ${fa(MAX_PINS)} میان‌بر.`, 'error');
      }
      W.pins = t.checked ? [...W.pins, t.value] : W.pins.filter((k) => k !== t.value);
      draw();
    }
  });
  box.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      W = { ...(await save({ profile: W.profile, density: W.density, pins: W.pins })) };
      draw();
      toast('فضای کار ذخیره شد.', 'ok');
    } catch (err) {
      toast(err.message, 'error');
    }
  });
  box.addEventListener('click', async (e) => {
    if (!e.target.closest('[data-reset]')) return;
    try {
      W = { ...(await save({ profile: null })) };
      draw();
      toast('فضای کار به پیش‌فرض نقش برگشت.', 'ok');
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}
