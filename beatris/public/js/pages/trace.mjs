// رهگیری — one box for any number: the tracking code on a receipt (or a line / payment of it), the authenticity code,
// a card or slip reference, a bar serial, a cheque, a customer code or mobile. The answer is the document's whole life.
import { html, raw, fa, api, toast, $ } from '../core.mjs';
import * as B from '../books.mjs';
import * as TR from '../trade.mjs';
import { TRADE_COINS as COIN_TYPES, shownCoins } from '../coins.mjs';
import { barcodeSvg } from '../barcode.mjs';
import { booksPrefs, R, G, jd, timeFa, unitAmt, unitLabel, describeLine, lineVerb, statusChip } from '../bk.mjs';
import { booksNav, changeList } from './books.mjs';
import { SECTIONS, SECTION_IDS } from '../daysearch.mjs';

const amtOf = (unit, v) => (unit === 'IRR' ? R(Math.abs(v)) : unit === 'G750' ? `${G(Math.abs(v))} گرم` : unit === 'COUNT' || unit === 'FX' ? fa(Math.abs(v)) : unitAmt(unit, Math.abs(v)));

export async function tracePage(root) {
  await booksPrefs();
  const q0 = new URLSearchParams(location.search).get('q') ?? '';
  // inside a section (spec 0027): only that section's documents; an exact tracking code always opens
  let sec = SECTION_IDS.has(new URLSearchParams(location.search).get('sec') ?? '') ? new URLSearchParams(location.search).get('sec') : 'all';
  root.innerHTML = String(html`${booksNav('trace')}
    <div class="bk-head"><div><h1>رهگیری</h1><span class="small">هر سند، هر ردیف و هر پرداخت یک کد دارد؛ با هر شماره‌ای که در دست دارید، کل سرگذشتش را ببینید.</span></div></div>
    <form class="tc-find" id="tf"><input class="input" id="tq" value="${q0}" placeholder="کد رهگیری (M1405-00012 یا M1405-00012/P1)، کد اصالت، شماره پیگیری، سریال شمش، شماره چک، کد یا موبایل مشتری" autocomplete="off" autofocus><button class="btn">رهگیری</button></form>
    <nav class="chips dy-secs" id="tsec" aria-label="بخش">${SECTIONS.map(([k, l]) => html`<button type="button" class="chip" data-sec="${k}" aria-pressed="${sec === k}">${l}</button>`)}</nav>
    <div id="tr"></div>`);
  const box = $('#tr', root);
  async function run(q) {
    if (!q.trim()) return (box.innerHTML = String(html`<p class="small tc-hint">کد را بنویسید یا با بارکدخوان از روی رسید بخوانید.</p>`));
    box.innerHTML = '<p class="small tc-hint">در حال جستجو…</p>';
    try {
      const r = await api(`/api/books/trace?q=${encodeURIComponent(q)}${sec !== 'all' ? `&sec=${sec}` : ''}`);
      if (r.hint) return (box.innerHTML = String(html`<p class="notice">${r.hint}</p>`));
      box.innerHTML = String(html`${r.parties?.length ? html`<section class="tray tc-parties"><h3 class="bk-h">مشتری</h3>${r.parties.map((p) => html`<a class="chip" href="/books/party/${p.id}" data-link>${p.label} · کد ${fa(p.code)}</a>`)}</section>` : ''}
        ${r.items.length ? r.items.map((d, i) => card(d, i)) : r.parties?.length ? '' : html`<p class="notice">با «${q}» چیزی${sec !== 'all' ? ` در بخش ${SECTIONS.find(([k]) => k === sec)?.[1]}` : ''} پیدا نشد.${sec !== 'all' ? ' بخش «همه» را بزنید.' : ''}</p>`}`);
    } catch (e) {
      box.innerHTML = String(html`<p class="notice">${e.message}</p>`);
    }
  }
  function card(d, i) {
    const focus = d.part ? `${d.track}/${d.part.kind}${d.part.n}` : '';
    // versions and log events on one timeline
    const tl = [...d.events.map((e) => ({ at: e.at, t: e.label, who: e.by, more: e.detail?.reason || (e.detail?.format ? `قالب ${e.detail.format}` : ''), h: e.hash, changes: e.changes })), ...d.recon.map((x) => ({ at: x.at, t: `تطبیق با صورتحساب بانک (${x.trace})`, who: x.by, more: x.ref ? `مرجع ${x.ref}` : '' }))].sort((a, b) => a.at.localeCompare(b.at));
    return html`<article class="tray tc-doc ${d.status}" style="--i:${i}">
      <header class="tc-h"><div class="tc-code"><span>کد رهگیری</span><b class="ltr-num">${d.track}</b>${raw(barcodeSvg(d.track, { module: 1.6, height: 34, label: false }))}</div>
        <div class="tc-meta"><h3>${d.typeLabel}</h3><p>${statusChip(d.status)} ${d.version > 1 ? html`<span class="bk-st">نسخه ${fa(d.version)}</span>` : ''} · ${jd(d.date)} ${d.issuedAt ? timeFa(d.issuedAt) : ''} · ثبت: ${d.by || '—'}</p>
          <p>${d.party ? html`طرف حساب: <a href="/books/party/${d.party.id}" data-link>${d.party.label}</a>` : d.hawala ? html`از ${d.hawala.fromLabel} به ${d.hawala.toLabel}` : 'مشتری گذری'} · کد اصالت <b class="ltr-num">${d.verify}</b></p>
          <p class="small">یافته از: ${d.why}</p>
          ${d.supersededBy ? html`<p class="small">جایگزین‌شده با <a href="/books/doc/${d.supersededBy}" data-link>اصلاحیه</a></p>` : ''}${d.restoredBy ? html`<p class="small">برگردانده‌شده با <a href="/books/doc/${d.restoredBy}" data-link>سند تازه</a></p>` : ''}${d.restores ? html`<p class="small">برگرداندهٔ <a href="/books/doc/${d.restores}" data-link>سند باطل‌شده</a></p>` : ''}</div>
        <div class="tc-act"><a class="btn small" href="/books/doc/${d.id}" data-link>باز کردن سند</a><button class="btn small ghost" data-copy="${d.track}">کپی کد</button></div></header>
      ${d.changes?.words?.length ? html`<section class="bk-amend"><h4>تغییرات نسبت به ${d.changes.from.track}</h4>${changeList(d.changes.words)}</section>` : ''}
      ${d.lines.length ? html`<h4>ردیف‌ها</h4><div class="scrollx"><table class="table-plain bk-table tc-t"><thead><tr><th>کد ردیف</th><th>شرح</th><th>مبلغ</th></tr></thead><tbody>${d.lines.map((l) => html`<tr class="${focus === l.trace ? 'focus' : ''}"><td class="ltr-num">${l.trace}</td><td>${d.type === 'trade' ? html`<b>${lineVerb(l)} ${l.kind === 'coin' ? `سکه ${COIN_TYPES[l.coin]?.short ?? ''}` : TR.TRADE_KINDS[l.kind] ?? B.KIND_LABEL?.[l.kind] ?? l.kind}</b> <small>${describeLine(l)}</small>` : html`${l.src?.title || B.KIND_LABEL?.[l.kind] || l.kind}${l.weight ? html` <small>${G(l.weight)} گرم</small>` : ''}`}</td><td class="num">${d.type === 'trade' ? (l.priced ? R(l.value) : unitAmt(l.unit, l.amt)) : R(l.total ?? 0)}</td></tr>`)}</tbody></table></div>` : ''}
      ${d.payments.length ? html`<h4>پرداخت‌ها</h4><div class="scrollx"><table class="table-plain bk-table tc-t"><thead><tr><th>کد پرداخت</th><th>روش</th><th>جهت</th><th>حساب / مرجع</th><th>مبلغ</th><th>تطبیق بانک</th></tr></thead><tbody>${d.payments.map((p) => {
        const rc = d.recon.find((x) => x.trace === p.trace || x.trace === d.track);
        return html`<tr class="${focus === p.trace ? 'focus' : ''}"><td class="ltr-num">${p.trace}</td><td>${p.label}</td><td>${p.dir === 'in' ? 'دریافت' : 'پرداخت'}</td><td class="small">${[p.account, p.ref && `پیگیری ${fa(p.ref)}`, p.card && `کارت …${fa(p.card)}`, p.chequeNo && `چک ${fa(p.chequeNo)}`, p.due && `سررسید ${jd(p.due)}`].filter(Boolean).join(' · ')}</td><td class="num">${R(p.value)}</td><td>${rc ? html`<span class="bk-st final">✓ ${jd(rc.at)}</span>` : '—'}</td></tr>`;
      })}</tbody></table></div>` : ''}
      ${d.hawala ? html`<p>حواله ${unitAmt(d.hawala.unit, d.hawala.amount)} از حساب ${d.hawala.fromLabel} به حساب ${d.hawala.toLabel}</p>` : ''}
      ${d.convert ? html`<p>تبدیل ${unitAmt(d.convert.unit, Math.abs(d.convert.amount))} به ${R(Math.abs(d.convert.value))}</p>` : ''}
      <div class="tc-cols">
        <section><h4>اثر روی حساب‌ها</h4>${d.postings.length ? html`<table class="table-plain tc-post"><tbody>${d.postings.map((x) => html`<tr><td>${x.label}</td><td class="num ${x.amt > 0 ? 'debt' : 'cred'}">${x.amt > 0 ? 'بدهکار' : 'بستانکار'} ${amtOf(x.unit, x.amt)}</td></tr>`)}</tbody></table>` : html`<p class="small">${d.status === 'void' ? 'سند باطل است؛ اثری در حساب‌ها ندارد.' : 'اثری ثبت نشده (پیش‌نویس).'}</p>`}</section>
        <section><h4>سرگذشت</h4><ol class="tc-tl">${tl.map((x) => html`<li><b>${x.t}</b><span>${jd(x.at)} ${timeFa(x.at)}${x.who ? ` · ${x.who}` : ''}</span>${x.more ? html`<em>${x.more}</em>` : ''}${x.changes?.length ? changeList(x.changes) : ''}${x.h ? html`<code class="ltr-num">#${x.h}</code>` : ''}</li>`)}</ol></section>
      </div>
      ${d.note ? html`<p class="small">یادداشت: ${d.note}</p>` : ''}
    </article>`;
  }
  $('#tf', root).addEventListener('submit', (e) => {
    e.preventDefault();
    const q = $('#tq', root).value.trim();
    keepUrl(q);
    run(q);
  });
  function keepUrl(q) {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (sec !== 'all') p.set('sec', sec);
    history.replaceState(null, '', `/books/trace${p.size ? `?${p}` : ''}`);
  }
  $('#tsec', root).addEventListener('click', (e) => {
    const b = e.target.closest('[data-sec]');
    if (!b) return;
    sec = b.dataset.sec;
    $('#tsec', root).querySelectorAll('[data-sec]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    const q = $('#tq', root).value.trim();
    keepUrl(q);
    run(q);
  });
  root.addEventListener('click', async (e) => {
    const c = e.target.closest('[data-copy]');
    if (!c) return;
    await navigator.clipboard?.writeText(c.dataset.copy).catch(() => {});
    toast(`کد ${c.dataset.copy} کپی شد.`, 'ok');
  });
  await run(q0);
}
