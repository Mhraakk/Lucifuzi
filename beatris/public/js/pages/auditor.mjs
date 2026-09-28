// ممیز و دستیار حسابرس: the audit board (score ring, findings by severity, each one a link to the document or page
// that needs a look) and a chat with the assistant, which reads the books but never writes them.
import { html, raw, fa, api, store, toast, $, $$ } from '../core.mjs';
import { booksPrefs, jd, timeFa } from '../bk.mjs';
import { booksNav } from './books.mjs';

const SEV = { high: ['فوری', '⛔'], mid: ['مهم', '⚠'], low: ['جزئی', '•'], info: ['اطلاع', 'ℹ'] };
const ENGINE = { books: 'موتور دفاتر (بدون مدل، روی همین سرور)', 'local-llm': 'مدل هوش مصنوعی روی سیستم خود مغازه', claude: 'Claude' };
const HIST = 'beatris.assistant';
const loadHist = () => {
  try {
    return JSON.parse(sessionStorage.getItem(HIST) ?? '[]');
  } catch {
    return [];
  }
};
const saveHist = (h) => {
  try {
    sessionStorage.setItem(HIST, JSON.stringify(h.slice(-30)));
  } catch {
    /* storage unavailable */
  }
};

export async function auditPage(root) {
  await booksPrefs();
  root.innerHTML = String(html`${booksNav('audit')}
    <div class="bk-head"><div><h1>ممیز و تاجیار</h1><span class="small">هر بار که این صفحه باز شود کل دفاتر از نو وارسی می‌شود؛ ممیز فقط نشان می‌دهد و چیزی را تغییر نمی‌دهد.</span></div><button class="btn small" data-act="rerun">وارسی دوباره</button></div>
    <div class="au">
      <section class="au-board" id="board"><div class="au-load">در حال وارسی دفاتر…</div></section>
      <section class="tray au-chat"><div class="bk-head"><h3 class="bk-h">تاجیار · دستیار حسابرس</h3><span class="small" id="eng"></span></div>
        <div class="au-msgs" id="msgs" aria-live="polite"></div>
        <div class="chips au-quick">${['ممیز', 'بدهکاران', 'طلبکاران', 'روزنگار امروز', 'گاوصندوق', 'مظنه', 'چی یادته', 'محاسبه ۲ گرم عیار ۷۴۰'].map((q) => html`<button class="chip" data-q="${q}">${q}</button>`)}</div>
        <form class="au-form" id="af"><input class="input" id="aq" placeholder="بپرسید: «مانده مهران رضایی»، «سریال ۳۳۰۷۰۲۱»، «محاسبه ۱۰ گرم عیار ۷۴۵»" autocomplete="off" maxlength="2000"><button class="btn">بپرس</button></form></section>
    </div>`);
  let hist = loadHist();
  async function board() {
    const box = $('#board', root);
    try {
      const a = await api('/api/books/audit');
      const col = a.score >= 85 ? 'good' : a.score >= 60 ? 'warn' : 'bad';
      box.innerHTML = String(html`<div class="tray au-score ${col}"><div class="au-ring" style="--p:${a.score}"><b>${fa(a.score)}</b><span>از ۱۰۰</span></div>
        <div><h3 class="bk-h">سلامت دفاتر</h3><p class="small">${jd(a.day)} · ${timeFa(a.at)}</p><div class="au-counts">${['high', 'mid', 'low', 'info'].map((k) => html`<button class="au-c ${k}" data-sev="${k}"><b>${fa(a.count[k])}</b><span>${SEV[k][0]}</span></button>`)}</div></div></div>
        <ol class="au-list" id="list">${a.findings.map((f, i) => html`<li class="au-f ${f.sev}" data-s="${f.sev}" style="--i:${Math.min(i, 16)}"><span class="au-ic" aria-hidden="true">${SEV[f.sev][1]}</span><div><b>${f.title}</b><p>${f.detail}</p></div>${f.ref ? html`<a class="chip" href="/books/doc/${f.ref.doc}" data-link>${f.ref.label}</a>` : f.link ? html`<a class="chip" href="${f.link}" data-link>باز کن</a>` : ''}</li>`)}</ol>`);
    } catch (e) {
      box.innerHTML = String(html`<p class="notice">${e.message}</p>`);
    }
  }
  const drawMsgs = () => {
    const box = $('#msgs', root);
    box.innerHTML = hist.length ? hist.map((m) => String(html`<div class="au-m ${m.role}"><pre>${m.text}</pre>${m.engine ? html`<small>${ENGINE[m.engine] ?? m.engine}${m.fallback ? ' (مدل در دسترس نبود)' : ''}</small>` : ''}</div>`)).join('') : String(html`<p class="small">سلام؛ از دفاتر بپرسید. من فقط می‌خوانم و حساب می‌کنم، هیچ سندی را ثبت یا تغییر نمی‌دهم.</p>`);
    box.scrollTop = box.scrollHeight;
  };
  async function send(q) {
    q = q.trim();
    if (!q) return;
    hist.push({ role: 'user', text: q });
    drawMsgs();
    $('#msgs', root).insertAdjacentHTML('beforeend', '<div class="au-m assistant typing"><i></i><i></i><i></i></div>');
    try {
      const r = await api('/api/books/assistant', { method: 'POST', body: { question: q, history: hist.slice(-9, -1).map(({ role, text }) => ({ role, text })) } });
      hist.push({ role: 'assistant', text: r.answer, engine: r.engine, fallback: !!r.fallback });
    } catch (e) {
      hist.push({ role: 'assistant', text: e.message });
    }
    saveHist(hist);
    drawMsgs();
  }
  $('#af', root).addEventListener('submit', (e) => {
    e.preventDefault();
    const q = $('#aq', root).value;
    $('#aq', root).value = '';
    send(q);
  });
  root.addEventListener('click', (e) => {
    const q = e.target.closest('[data-q]');
    if (q) return send(q.dataset.q);
    const s = e.target.closest('[data-sev]');
    if (s) {
      const on = s.getAttribute('aria-pressed') !== 'true';
      $$('[data-sev]', root).forEach((x) => x.setAttribute('aria-pressed', String(on && x === s)));
      $$('#list [data-s]', root).forEach((li) => (li.hidden = on && li.dataset.s !== s.dataset.sev));
    }
    if (e.target.closest('[data-act=rerun]')) board().then(() => toast('دفاتر دوباره وارسی شد.', 'ok'));
  });
  api('/api/books/assistant').then((i) => ($('#eng', root).textContent = ENGINE[i.engine] ?? i.engine)).catch(() => {});
  drawMsgs();
  await board();
}
