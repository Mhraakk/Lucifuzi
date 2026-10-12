// سرنخ‌یاب (spec 0032): one box for any clue — part of a name, a piece of a figure, a code, a cheque, a phone, a serial,
// a day, an hour, a kind of trade. The page shows how every clue was read, and every result says why it was found;
// when nothing holds every clue, the closest documents are listed with the clue they miss.
import { html, fa, api, $ } from '../core.mjs';
import { booksPrefs, jd, timeFa } from '../bk.mjs';
import { booksNav } from './books.mjs';
import { SECTIONS, SECTION_IDS } from '../daysearch.mjs';

const EXAMPLES = ['رض… حدود ۴۹ میلیون', 'آخرش ۷۸۰', 'چک ۸۸۹', 'دیروز عصر سکه امامی', 'موبایلش ۴۵۶۷', 'فروش به رضا کارت به کارت', 'شمش HR12', 'مهر حواله'];

export async function findPage(root) {
  await booksPrefs();
  const qs = new URLSearchParams(location.search);
  let sec = SECTION_IDS.has(qs.get('sec') ?? '') ? qs.get('sec') : 'all';
  root.innerHTML = String(html`${booksNav('find')}
    <div class="bk-head"><div><h1>سرنخ‌یاب</h1><span class="small">هر چه یادتان مانده بنویسید: تکه‌ای از نام، بخشی از یک عدد یا کد، شماره چک یا موبایل، روز، ساعت یا نوع معامله. هر سرنخ با قاعده‌ای روشن خوانده می‌شود و هر نتیجه می‌گوید چرا پیدا شد.</span></div></div>
    <form class="cf-find" id="cfF" role="search"><input class="input" id="cfQ" value="${qs.get('q') ?? ''}" placeholder="مثلاً «رض… حدود ۴۹ میلیون، کارت به کارت» یا «آخرش ۷۸۰»" autocomplete="off" aria-label="سرنخ"><button class="btn">بگرد</button></form>
    <p class="cf-ex small"><span>نمونه:</span>${EXAMPLES.map((e) => html`<button type="button" class="chip ghost" data-ex="${e}">${e}</button>`)}</p>
    <nav class="chips dy-secs" id="cfSec" aria-label="بخش">${SECTIONS.map(([k, l]) => html`<button type="button" class="chip" data-sec="${k}" aria-pressed="${sec === k}">${l}</button>`)}</nav>
    <div id="cfR" aria-live="polite"></div>`);
  const input = $('#cfQ', root), box = $('#cfR', root);
  let seq = 0, timer = 0;
  const keepUrl = (q) => {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (sec !== 'all') p.set('sec', sec);
    history.replaceState(history.state, '', `/books/find${p.size ? `?${p}` : ''}`);
  };
  async function run() {
    const q = input.value.trim();
    keepUrl(q);
    if (!q) return (box.innerHTML = String(html`<p class="small cf-hint">یک سرنخ بنویسید؛ هر چه کوچک‌تر، نتیجه‌ها بیشتر. چند سرنخ با هم، نتیجه دقیق‌تر.</p>`));
    const my = ++seq;
    box.setAttribute('aria-busy', 'true');
    try {
      const r = await api(`/api/books/find?q=${encodeURIComponent(q)}&limit=60${sec !== 'all' ? `&sec=${sec}` : ''}`);
      if (my !== seq) return;
      box.innerHTML = String(view(r));
    } catch (e) {
      if (my === seq) box.innerHTML = String(html`<p class="notice">${e.message}</p>`);
    } finally {
      if (my === seq) box.removeAttribute('aria-busy');
    }
  }
  const why = (w) => html`<ul class="cf-why">${w.map((x) => html`<li><b>«${x.said}»</b><span>${x.field}${x.value ? html`: <bdi>${x.value}</bdi>` : ''}</span>${x.how ? html`<em>${x.how}</em>` : ''}</li>`)}</ul>`;
  function doc(d) {
    return html`<a class="cf-doc ${d.status}" href="/books/doc/${d.id}" data-link data-doc="${d.id}">
      <div class="cf-doc-h"><b class="ltr-num">${d.track}</b><span>${d.typeLabel}</span><span class="small">${jd(d.date)} ${d.at ? timeFa(d.at) : ''}</span>${d.status === 'void' ? html`<span class="bk-st void">${d.superseded ? 'جایگزین‌شده' : 'باطل'}</span>` : ''}${d.matched < d.of ? html`<span class="cf-n">${fa(d.matched)} از ${fa(d.of)} سرنخ</span>` : ''}</div>
      <p class="cf-doc-s">${d.party ? html`<span>${d.party.label}</span> · ` : ''}${d.summary}</p>
      ${why(d.why)}
      ${d.missing.length ? html`<p class="cf-miss small">بدون: ${d.missing.map((m) => `«${m}»`).join('، ')}</p>` : ''}
    </a>`;
  }
  function view(r) {
    const all = r.items.filter((d) => d.matched === d.of), near = r.items.filter((d) => d.matched < d.of);
    return html`<section class="cf-read" aria-label="سرنخ‌ها"><h2 class="bk-h">چه فهمیدم</h2>${r.clues.length ? html`<ul class="cf-clues">${r.clues.map((c) => html`<li><b>${c.said}</b><span>${c.label}</span></li>`)}</ul>` : html`<p class="small">در این متن سرنخی نبود؛ نام، عدد، کد، روز یا نوع معامله بنویسید.</p>`}
      <p class="small cf-meta">${fa(r.searched.docs)} سند و ${fa(r.searched.parties)} مشتری گشته شد${r.limited ? '؛ با دسترسی شما فقط اسناد امروز' : ''} · ${fa(r.ms)} میلی‌ثانیه</p></section>
      ${r.people.length ? html`<section class="cf-people" aria-label="مشتری"><h2 class="bk-h">مشتری</h2>${r.people.map((p) => html`<a class="cf-person" href="/books/party/${p.id}" data-link><b>${p.label}</b><span class="small">کد ${fa(p.code)}</span>${why(p.why)}</a>`)}</section>` : ''}
      ${all.length ? html`<section class="cf-docs" aria-label="سند"><h2 class="bk-h">${all.length === r.items.length && r.total <= r.items.length ? `${fa(all.length)} سند با همه سرنخ‌ها` : `سندهایی با همه سرنخ‌ها (${fa(r.all)})`}</h2>${all.map(doc)}</section>` : ''}
      ${near.length ? html`<section class="cf-docs cf-near" aria-label="نزدیک‌ترین‌ها"><h2 class="bk-h">نزدیک‌ترین‌ها</h2><p class="small">${all.length ? 'این سندها بیشتر سرنخ‌ها را دارند، نه همه را.' : 'هیچ سندی همه سرنخ‌ها را ندارد؛ شاید یکی از آن‌ها درست به یاد نمانده. این‌ها بیشترین سرنخ را دارند:'}</p>${near.map(doc)}</section>` : ''}
      ${!r.items.length && !r.people.length && r.clues.length ? html`<p class="notice">با این سرنخ‌ها چیزی${sec !== 'all' ? ` در بخش ${SECTIONS.find(([k]) => k === sec)?.[1]}` : ''} پیدا نشد.${sec !== 'all' ? ' بخش «همه» را بزنید.' : ' سرنخ کوتاه‌تری بنویسید؛ مثلاً سه حرف اول نام یا سه رقم آخر عدد.'}</p>` : ''}
      ${r.total > r.items.length ? html`<p class="small cf-more">${fa(r.items.length)} سند از ${fa(r.total)} نشان داده شد؛ سرنخ دیگری اضافه کنید تا دقیق‌تر شود.</p>` : ''}`;
  }
  $('#cfF', root).addEventListener('submit', (e) => {
    e.preventDefault();
    clearTimeout(timer);
    run();
  });
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(run, 280);
  });
  root.querySelector('.cf-ex').addEventListener('click', (e) => {
    const b = e.target.closest('[data-ex]');
    if (!b) return;
    input.value = b.dataset.ex;
    run();
  });
  $('#cfSec', root).addEventListener('click', (e) => {
    const b = e.target.closest('[data-sec]');
    if (!b) return;
    sec = b.dataset.sec;
    $('#cfSec', root).querySelectorAll('[data-sec]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    run();
  });
  input.focus();
  await run();
  return () => clearTimeout(timer);
}
