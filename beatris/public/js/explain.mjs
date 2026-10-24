// «این عدد از کجا آمد؟» (spec 0002 #14): any element with data-explain="<metric>" (and optional data-day) opens a
// plain-language account of the number — one sentence, the formula, its parts and the latest documents behind it.
import { html, api, fa } from './core.mjs';
import { modal, jd, unitAmt } from './bk.mjs';

const val = (unit, v) => (unit === 'p' ? `${fa(Math.round(v * 100))}٪` : unit === 'G750' ? `${fa((Math.round(v * 1000) / 1000).toFixed(3)).replace('.', '٫')} گرم` : unitAmt(unit ?? 'IRR', v));

export async function openExplain(metric, day = '') {
  let r;
  try {
    r = await api(`/api/books/control/explain?metric=${encodeURIComponent(metric)}${day ? `&day=${day}` : ''}`);
  } catch (e) {
    return modal(String(html`<h3 class="bk-h">این عدد از کجا آمد؟</h3><p class="err">${e.message}</p><div class="actions"><button class="btn ghost" data-close>بستن</button></div>`));
  }
  const unitOf = (p) => (p.unit ?? (r.unit === 'p' ? 'p' : r.unit));
  modal(String(html`<div class="xp" dir="rtl">
    <p class="xp-k">این عدد از کجا آمد؟</p>
    <h3 class="bk-h">${r.title}: <b class="xp-v">${val(r.unit, r.value)}</b></h3>
    <p class="xp-s">${r.sentence}</p>
    <p class="xp-f"><span>فرمول</span><code>${r.formula}</code></p>
    ${r.parts?.length ? html`<table class="table xp-t"><tbody>${r.parts.map((p) => html`<tr><td>${p.href ? html`<a href="${p.href}" data-link data-close>${p.label}</a>` : p.label}</td><td class="num">${r.unit === 'p' ? `${fa(Math.round(p.value * 100))}٪${p.weight != null ? ` × وزن ${fa(p.weight)}` : ''}` : val(unitOf(p), p.value)}</td></tr>`)}</tbody></table>` : ''}
    ${r.recent?.length ? html`<h4>آخرین اسنادی که این عدد را ساختند</h4><ul class="xp-r">${r.recent.map((x) => html`<li>${x.href ? html`<a href="${x.href}" data-link data-close>${x.label}</a>` : html`<span>${x.label}</span>`}<small>${jd(x.date)}</small><b class="num ${x.value < 0 ? 'neg' : 'pos'}">${x.value > 0 ? '+' : x.value < 0 ? '−' : ''}${val(x.unit ?? r.unit, Math.abs(x.value))}</b></li>`)}</ul>` : ''}
    <div class="actions"><button class="btn ghost" data-close>فهمیدم</button></div></div>`));
}

let wired = false;
/** One delegated listener for the whole app: click (or Enter) on [data-explain]. */
export function initExplain() {
  if (wired) return;
  wired = true;
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-explain]');
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    openExplain(el.dataset.explain, el.dataset.day ?? '');
  });
}
