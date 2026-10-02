import { html, store, api, fa, $, $$, actions, toast, busy } from '../core.mjs';
import { back } from '../ui.mjs';
import { fmt, parseNum } from '../calc.mjs';
import { confirmBox } from '../dialog.mjs';

export async function examPage(root, { id }) {
  const c = store.course(id);
  let exam;
  try {
    exam = await api(`/api/exams/${id}`);
  } catch (e) {
    root.innerHTML = String(html`${back(`/learn/${id}`, c?.title ?? 'دوره')}<section class="empty"><h1>آزمون هنوز باز نیست</h1><p>${e.message}</p><a class="btn" href="/learn/${id}" data-link>رفتن به درس‌ها</a></section>`);
    return;
  }
  const answers = {};
  root.innerHTML = String(html`<div class="exam">
    ${back(`/learn/${id}`, exam.course.title)}
    <h1>آزمون ${exam.course.title}</h1>
    <p class="lead">${fa(exam.questions.length)} پرسش · حد قبولی ${fa(exam.passPct)}٪ · بدون محدودیت زمان تا یک ساعت. نتیجه و توضیح هر پرسش پس از ثبت نمایش داده می‌شود.</p>
    <form id="ex">${exam.questions.map((q, i) => html`<fieldset class="exam-q" style="border:0;margin:0;padding:16px 0" data-q="${q.id}">
      <legend class="q-t" style="padding:0">${fa(i + 1)}. ${fa(q.q)}</legend>
      ${q.o
        ? html`<div class="opts">${q.o.map((o, k) => html`<button type="button" class="opt" data-act="pick" data-q="${q.id}" data-i="${k}" aria-pressed="false">${fa(o)}</button>`)}</div>`
        : html`<div class="numq"><input class="input ltr" inputmode="decimal" data-num="${q.id}" aria-label="پاسخ عددی" placeholder="عدد به ${q.unit}"></div>`}
      <div class="why-slot"></div></fieldset>`)}
      <p class="err" id="err" role="alert"></p>
      <div class="actions"><button class="btn block" type="submit">ثبت پاسخ‌ها</button></div>
    </form></div>`);

  actions(root, {
    pick: (el) => {
      if (el.disabled) return;
      $$(`[data-act=pick][data-q="${el.dataset.q}"]`, root).forEach((b) => b.setAttribute('aria-pressed', String(b === el)));
      answers[el.dataset.q] = Number(el.dataset.i);
    },
  });
  $('#ex', root).addEventListener('submit', async (e) => {
    e.preventDefault();
    $$('[data-num]', root).forEach((inp) => {
      const v = parseNum(inp.value);
      if (Number.isFinite(v)) answers[inp.dataset.num] = v;
    });
    const missing = exam.questions.filter((q) => answers[q.id] === undefined).length;
    if (missing && !(await confirmBox('ثبت آزمون', `${fa(missing)} پرسش بی‌پاسخ است و غلط حساب می‌شود. ثبت شود؟`, { ok: 'ثبت' }))) return;
    const btn = e.submitter ?? $('button[type=submit]', root);
    busy(btn, true);
    try {
      const r = await api(`/api/exams/${id}`, { method: 'POST', body: { token: exam.token, answers } });
      store.loadMe().catch(() => {});
      showResult(r);
    } catch (err) {
      $('#err', root).textContent = err.message;
      busy(btn, false);
    }
  });

  function showResult(r) {
    $$('button, input', $('#ex', root)).forEach((b) => (b.disabled = true));
    for (const res of r.results) {
      const box = $(`[data-q="${res.id}"]`, root);
      const q = exam.questions.find((x) => x.id === res.id);
      if (q.o) {
        $$('[data-act=pick]', box).forEach((b, k) => {
          if (k === res.answer) b.classList.add('right');
          else if (b.getAttribute('aria-pressed') === 'true') b.classList.add('wrong');
        });
      }
      $('.why-slot', box).innerHTML = String(html`<div class="fb" style="margin-top:8px">${res.correct ? '✓ ' : '✗ '}${fa(res.why)}${!res.correct && !q.o ? html` پاسخ: <b class="num">${fmt(res.answer, 2)}</b> ${res.unit}` : ''}</div>`);
    }
    $('.actions', root).remove();
    const top = document.createElement('section');
    top.innerHTML = String(html`<div class="result"><div class="big">${fa(r.score)}٪</div><p>${r.passed ? 'قبول شدید.' : `برای قبولی ${fa(r.passPct)}٪ لازم است. توضیح پرسش‌های نادرست را بخوانید و دوباره تلاش کنید.`}</p></div>
      ${r.certificate ? html`<div class="cert"><span class="stamp">گواهی دوره</span><h2 style="margin:10px 0 4px">${store.me.user.name}</h2><p>${exam.course.title}</p><p class="code">${r.certificate}</p><p class="small">نمره ${fa(r.score)}٪ — در بخش «من» قابل مشاهده است.</p></div>` : ''}
      <div class="actions" style="justify-content:center"><a class="btn ghost" href="/learn/${id}" data-link>بازگشت به دوره</a>${r.passed ? '' : html`<a class="btn" href="/exam/${id}" data-link>آزمون دوباره</a>`}</div>`);
    root.querySelector('.exam').prepend(top);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    toast(r.passed ? 'آزمون قبول شد' : 'آزمون ثبت شد', r.passed ? 'ok' : 'info');
  }
}
