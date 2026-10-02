// The app's one dialog (spec 0019, uniformity): every question to the user — confirm, a short answer — looks and
// behaves the same in every skin. The browser's own alert/confirm/prompt are never used.
import { html, $ } from './core.mjs';

export function modal(inner, wire, onClose) {
  const m = document.createElement('div');
  m.className = 'modal';
  m.innerHTML = `<div class="tray" role="dialog" aria-modal="true">${inner}</div>`;
  let open = true;
  const close = () => {
    if (!open) return;
    open = false;
    m.remove();
    document.removeEventListener('keydown', onKey);
    onClose?.();
  };
  const onKey = (e) => e.key === 'Escape' && close();
  document.addEventListener('keydown', onKey);
  m.addEventListener('click', (e) => {
    if (e.target === m || e.target.closest('[data-close]')) close();
  });
  document.body.append(m);
  wire?.(m, close);
  $('input:not([type=hidden]), select, textarea', m)?.focus();
  return close;
}
/** Resolves true (or the typed reason) on confirm, false on cancel. */
export const confirmBox = (title, body, { danger = false, reason = false, ok = 'تأیید' } = {}) =>
  new Promise((resolve) => {
    let result = false;
    modal(
      String(html`<h3 class="bk-h">${title}</h3><p class="small">${body}</p>${reason ? html`<label class="field">دلیل (در تاریخچه سند می‌ماند)<input class="input" name="reason" maxlength="300"></label>` : ''}<div class="actions"><button class="btn ${danger ? 'danger' : ''}" data-ok>${ok}</button><button class="btn ghost" data-close>انصراف</button></div>`),
      (m, close) =>
        m.querySelector('[data-ok]').addEventListener('click', () => {
          const r = m.querySelector('[name=reason]')?.value.trim() ?? '';
          if (reason && r.length < 3) return m.querySelector('[name=reason]').focus();
          result = reason ? r : true;
          close();
        }),
      () => resolve(result),
    );
  });


/** Ask for a short answer. Resolves the trimmed text ('' allowed), or null on cancel. */
export const askBox = (title, body, { label = '', value = '', placeholder = '', ok = 'تأیید', dir = 'rtl' } = {}) =>
  new Promise((resolve) => {
    let result = null;
    modal(
      String(html`<h3 class="bk-h">${title}</h3>${body ? html`<p class="small">${body}</p>` : ''}<form data-ask><label class="field">${label}<input class="input" name="ask" maxlength="300" dir="${dir}" value="${value}" placeholder="${placeholder}"></label><div class="actions"><button class="btn" type="submit">${ok}</button><button class="btn ghost" type="button" data-close>انصراف</button></div></form>`),
      (m, close) =>
        m.querySelector('[data-ask]').addEventListener('submit', (e) => {
          e.preventDefault();
          result = m.querySelector('[name=ask]').value.trim();
          close();
        }),
      () => resolve(result),
    );
  });
