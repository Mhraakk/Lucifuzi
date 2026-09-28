// برگه ته حساب مشتری (public): the customer opens the shop's link on a phone, sees the balance in market words and
// the last 60 days, and confirms or reports a difference. No login, nothing else of the shop is exposed.
import { html, raw, api, fa, $ } from '../core.mjs';
import * as B from '../books.mjs';
import { jd, balSentence, balUnits, sideWord, unitAmt, unitLabel, timeFa, prefs } from '../bk.mjs';
import { crownSvg } from '../crown.mjs';

export async function statementPage(root, { token }) {
  prefs.money = 'rial';
  let v;
  try {
    v = await api(`/api/public/statement/${encodeURIComponent(token)}`);
  } catch (e) {
    root.innerHTML = String(html`<section class="st-page"><div class="st-card"><span class="st-crown">${raw(crownSvg({ size: 48, ring: false, id: 'stc' }))}</span><h1>برگه در دسترس نیست</h1><p>${e.message}</p></div></section>`);
    return;
  }
  const draw = () => {
    root.innerHTML = String(html`<section class="st-page"><div class="st-card">
      <header><span class="st-crown">${raw(crownSvg({ size: 48, ring: false, id: 'stc' }))}</span><div><b>${v.shop}</b><small>برگه ته حساب · ${jd(v.asOf.slice(0, 10))} ساعت ${timeFa(v.asOf)}</small></div></header>
      <h1>${v.party}</h1>
      <p class="st-say">${balSentence('حساب شما', v.balance).replace('حساب شما', 'مانده شما')}</p>
      <ul class="st-bal">${balUnits(v.balance).length ? balUnits(v.balance).map((u) => html`<li class="${v.balance[u] > 0 ? 'd' : 'c'}"><span>${sideWord(u, v.balance[u])}</span><b>${u.startsWith('BAR:') ? unitLabel(u) : unitAmt(u, Math.abs(v.balance[u]))}</b></li>`) : html`<li><span>حساب شما تسویه است</span><b>—</b></li>`}</ul>
      <h2>گردش ۶۰ روز اخیر</h2>
      ${v.lines.length ? html`<ol class="st-lines">${[...v.lines].reverse().map((l) => html`<li><time>${jd(l.date)}</time><span>${l.what ?? ''}${l.track ? html` <small class="ltr-num">${l.track}</small>` : ''}</span><b class="${l.amt > 0 ? 'd' : 'c'}">${l.amt > 0 ? '+' : '−'}${unitAmt(l.unit, Math.abs(l.amt))}</b></li>`)}</ol>` : html`<p class="small">در این مدت گردشی نبوده است.</p>`}
      <p class="small">«+» یعنی بر بدهی شما افزوده شده، «−» یعنی از بدهی شما کم شده یا طلب شما بیشتر شده است.</p>
      ${v.answer
        ? html`<div class="st-done ${v.answer.answer}"><b>${v.answer.answer === 'agree' ? 'مانده را تأیید کرده‌اید.' : 'مغایرت را اعلام کرده‌اید.'}</b><small>${jd(v.answer.at.slice(0, 10))} ${timeFa(v.answer.at)}${v.answer.note ? ` · ${v.answer.note}` : ''}</small></div>`
        : html`<form class="st-form" id="stf"><button class="btn block" name="a" value="agree">مانده را تأیید می‌کنم</button><details><summary>مغایرت دارم</summary><textarea class="input" name="note" rows="3" maxlength="500" placeholder="مثلاً: پرداخت ۵۰ میلیون ریالی روز ۲۰ مهر ثبت نشده است"></textarea><button class="btn ghost block" name="a" value="dispute">ثبت مغایرت</button></details><p class="err" id="sterr" role="alert"></p></form>`}
      <footer class="small">اعتبار این برگه تا ${jd(v.expiresAt.slice(0, 10))}. برای هر پرسش با فروشگاه تماس بگیرید.</footer></div></section>`);
    $('#stf', root)?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const answer = e.submitter?.value;
      const note = new FormData(e.target).get('note') ?? '';
      try {
        await api(`/api/public/statement/${encodeURIComponent(token)}`, { method: 'POST', body: { answer, note } });
        v = { ...v, answer: { answer, note, at: new Date().toISOString() } };
        draw();
      } catch (err) {
        $('#sterr', root).textContent = err.message;
      }
    });
  };
  draw();
}
