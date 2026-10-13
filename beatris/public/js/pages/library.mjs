import { html, store, api, fa, $, actions, toast, busy } from '../core.mjs';
import { back, ICON, faDate } from '../ui.mjs';

export function libraryPage(root) {
  const tab = new URLSearchParams(location.search).get('t') ?? 'sop';
  const acks = store.me.progress.acks;
  const c = store.content;
  const groups = [...new Set(c.references.map((r) => r.group))];
  const body = {
    sop: html`<p class="small">هر دستورالعمل را بخوانید و تأیید کنید. با تغییر نسخه، تأیید دوباره لازم است.</p>
      <ul class="rows">${c.sops.map((s) => html`<li><a class="row" href="/sop/${s.id}" data-link><span class="row-main"><span class="row-t">${s.title}</span><span class="row-s">${s.category} · نسخه ${fa(s.version)} — ${s.summary}</span></span>${acks[s.id] === s.version ? html`<span class="stamp jade">تأیید شده</span>` : html`<span class="stamp red">تأیید لازم</span>`}</a></li>`)}</ul>`,
    gloss: html`<label class="field" style="margin-bottom:10px">جست‌وجو<input class="input" id="gq" placeholder="مثلاً مظنه، کولت، رودیوم"></label>
      <dl class="gloss" id="gl">${c.glossary.map((g) => html`<div data-term="${g.term} ${g.def}"><dt>${fa(g.term)}</dt><dd>${fa(g.def)}</dd></div>`)}</dl>`,
    refs: html`<p class="small">منابعی که محتوای دوره‌ها بر آن‌ها تکیه دارد. برای یادگیری عمیق‌تر از همین‌ها شروع کنید.</p>
      ${groups.map((g) => html`<h3 style="margin-top:20px">${g}</h3><ul class="rows">${c.references.filter((r) => r.group === g).map((r) => html`<li><div class="row"><span class="row-main"><span class="row-t">${r.url ? html`<a href="${r.url}" target="_blank" rel="noopener">${r.title}</a>` : r.title}</span><span class="row-s">${r.org} — ${fa(r.use)}</span></span></div></li>`)}</ul>`)}`,
  };
  root.innerHTML = String(html`${back('/me', 'من')}<h1>کتابخانه</h1>
    <nav class="tabs" aria-label="بخش‌های کتابخانه">${[['sop', 'دستورالعمل‌ها'], ['gloss', 'واژه‌نامه بازار'], ['refs', 'منابع معتبر']].map(([k, l]) => html`<a href="/library?t=${k}" data-link ${k === tab ? html`aria-current="page"` : ''}>${l}</a>`)}</nav>
    ${body[tab] ?? body.sop}`);
  $('#gq', root)?.addEventListener('input', (e) => {
    const q = e.target.value.trim();
    root.querySelectorAll('[data-term]').forEach((d) => (d.hidden = q && !d.dataset.term.includes(q)));
  });
}

export async function sopPage(root, { id }) {
  const { sop, ack } = await api(`/api/sops/${id}`);
  const current = ack?.version === sop.version;
  root.innerHTML = String(html`${back('/library', 'دستورالعمل‌ها')}
    <span class="stamp">${sop.category} · نسخه ${fa(sop.version)}</span>
    <h1 style="margin-top:8px">${sop.title}</h1><p class="lead">${sop.summary}</p>
    <h2>مراحل</h2><ol style="padding-inline-start:1.4em">${sop.steps.map((s) => html`<li style="margin:8px 0">${fa(s)}</li>`)}</ol>
    ${sop.warnings.length ? html`<div class="tray" style="border-color:var(--red);margin-top:18px"><span class="stamp red">هشدار</span><ul>${sop.warnings.map((w) => html`<li>${fa(w)}</li>`)}</ul></div>` : ''}
    <div class="actions">${current ? html`<p class="small">${ICON.check} این نسخه را ${faDate(ack.at)} تأیید کرده‌اید.</p>` : html`<button class="btn" data-act="ack">خواندم و طبق آن عمل می‌کنم</button>`}</div>`);
  actions(root, {
    ack: async (el) => {
      busy(el, true);
      try {
        const r = await api(`/api/sops/${id}/ack`, { method: 'POST' });
        store.me.progress.acks[id] = r.version;
        store.me.progress.sopMissing = store.me.progress.sopMissing.filter((x) => x !== id);
        el.replaceWith(Object.assign(document.createElement('p'), { className: 'small', textContent: 'تأیید ثبت شد.' }));
        toast('تأیید ثبت شد', 'ok');
      } catch (e) {
        toast(e.message, 'error');
        busy(el, false);
      }
    },
  });
}
