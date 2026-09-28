import { html, raw, store, api, fa, $, $$, actions, toast, busy, navigate } from '../core.mjs';
import { ringEl, barEl, back, ICON, faDate } from '../ui.mjs';
import { fmt, parseNum } from '../calc.mjs';

export async function learnPage(root) {
  const { progress: p } = store.me;
  const done = new Set(p.lessonsDone);
  root.innerHTML = String(html`
    <div class="head"><div><h1>آموزش</h1><p class="lead">${fa(store.content.courses.length)} دوره به ترتیب پیشنهادی برای همکار تازه. هر دوره: درس، پرسش کوتاه، کار عملی در شعبه و آزمون گواهی.</p></div></div>
    <a class="tile rosette" href="/history" data-link style="min-height:0;margin-bottom:18px"><span class="k">گنجینه</span><h3>سه هزار سال طلا</h3><p>تاریخ طلا از مصر و مارلیک تا دریک و بهار آزادی؛ هر دوره، یک درس برای ویترین.</p></a>
    <ul class="rows">
      ${store.content.path.map((cid, i) => {
        const c = store.course(cid);
        const cp = store.courseProgress(cid);
        const finished = c.lessons.every((l) => done.has(l.id));
        const started = c.lessons.some((l) => done.has(l.id));
        return html`<li><a class="row course-row ${cp.cert ? 'done' : started ? 'current' : ''}" href="/learn/${c.id}" data-link>
          <span class="idx">${cp.cert ? ICON.check : fa(i + 1)}</span>
          <span class="row-main"><span class="row-t">${c.title}</span>
            <span class="row-s">${fa(cp.lessonsDone)} از ${fa(cp.lessons)} درس · ${fa(c.minutes)} دقیقه${cp.examBest != null ? ` · بهترین آزمون ${fa(cp.examBest)}٪` : ''}</span>
            <span style="display:block;margin-top:6px;max-width:260px">${barEl(cp.readiness)}</span></span>
          ${cp.cert ? html`<span class="stamp jade">گواهی</span>` : finished ? html`<span class="stamp">آماده آزمون</span>` : c.level === 'الزامی' ? html`<span class="stamp red">الزامی</span>` : ''}
        </a></li>`;
      })}
    </ul>`);
}

export async function coursePage(root, { id }) {
  const c = store.course(id);
  if (!c) return navigate('/learn', { replace: true });
  const { progress: p } = store.me;
  const cp = store.courseProgress(id);
  const done = new Set(p.lessonsDone);
  const floor = new Map(p.floor.map((f) => [f.taskId, f]));
  const tasks = store.content.floorTasks.filter((t) => t.courseId === id);
  const refs = store.content.references.filter((r) => c.refs.includes(r.id));
  const allDone = c.lessons.every((l) => done.has(l.id));
  root.innerHTML = String(html`
    ${back('/learn', 'همه دوره‌ها')}
    <div class="head"><div><span class="stamp ${c.level === 'الزامی' ? 'red' : ''}">${c.level}</span><h1 style="margin-top:8px">${c.title}</h1><p class="lead">${c.summary}</p></div>${ringEl(cp.readiness, 'lg')}</div>
    <div class="stats">
      <div><b>${fa(cp.lessonsDone)}/${fa(cp.lessons)}</b><span>درس</span></div>
      <div><b>${fa(cp.quizCorrect)}/${fa(cp.quizTotal)}</b><span>پرسش درست</span></div>
      <div><b>${cp.examBest != null ? `${fa(cp.examBest)}٪` : '—'}</b><span>بهترین آزمون</span></div>
    </div>
    <h2>درس‌ها</h2>
    <ul class="rows">${c.lessons.map((l, i) => html`<li><a class="row course-row ${done.has(l.id) ? 'done' : ''}" href="/lesson/${l.id}" data-link>
      <span class="idx">${done.has(l.id) ? ICON.check : fa(i + 1)}</span>
      <span class="row-main"><span class="row-t">${l.title}</span><span class="row-s">${fa(l.minutes)} دقیقه${l.floor.length ? ' · کار عملی دارد' : ''}</span></span><span class="chev">${ICON.chev}</span></a></li>`)}</ul>

    ${tasks.length ? html`<h2>کار عملی در شعبه</h2><p class="small">هر کار را در شعبه انجام دهید و از داخل درس برای تأیید مدیر بفرستید.</p>
      <ul class="rows">${tasks.map((t) => {
        const f = floor.get(t.id);
        return html`<li><a class="row" href="/lesson/${t.lessonId}#${t.id}" data-link><span class="row-main"><span class="row-t">${t.title}</span>${f?.reviewerNote ? html`<span class="row-s">نظر مدیر: ${f.reviewerNote}</span>` : ''}</span>${statusStamp(f?.status)}</a></li>`;
      })}</ul>` : ''}

    <h2>آزمون گواهی</h2>
    <div class="tray">
      ${cp.cert ? html`<p>گواهی این دوره صادر شده: <b class="num" dir="ltr">${cp.cert}</b></p>` : ''}
      <p class="small">${fa(Math.min(12, c.questionCount))} پرسش تصادفی از بانک ${fa(c.questionCount)} پرسشی دوره. حد قبولی ${fa(store.me.pricing.passPct)}٪. ${allDone ? '' : 'آزمون پس از تمام کردن همه درس‌ها باز می‌شود.'}</p>
      <div class="actions"><a class="btn ${allDone ? '' : 'ghost'}" href="/exam/${c.id}" data-link ${allDone ? '' : raw('aria-disabled="true"')}>${cp.examAttempts ? 'آزمون دوباره' : 'شروع آزمون'}</a></div>
    </div>

    <h2>منابع معتبر این دوره</h2>
    <ul class="rows">${refs.map((r) => html`<li><div class="row"><span class="row-main"><span class="row-t">${r.url ? html`<a href="${r.url}" target="_blank" rel="noopener">${r.title}</a>` : r.title}</span><span class="row-s">${r.org} — ${r.use}</span></span></div></li>`)}</ul>`);
}

export const statusStamp = (s) =>
  s === 'verified' ? html`<span class="stamp jade">تأیید شد</span>` : s === 'requested' ? html`<span class="stamp">در انتظار</span>` : s === 'rejected' ? html`<span class="stamp red">نیاز به تکرار</span>` : html`<span class="stamp mute">انجام نشده</span>`;

/* ---------------- lesson reader ---------------- */
function block(b, ctx) {
  switch (b.t) {
    case 'p':
      return html`<div class="blk blk-p"><p>${fa(b.text)}</p></div>`;
    case 'points':
      return html`<div class="blk blk-points">${b.title ? html`<h3>${fa(b.title)}</h3>` : ''}<ul>${b.items.map((x) => html`<li>${fa(x)}</li>`)}</ul></div>`;
    case 'table':
      return html`<div class="blk">${b.title ? html`<h3>${fa(b.title)}</h3>` : ''}<div class="tablewrap" tabindex="0"><table><thead><tr>${b.head.map((h) => html`<th>${fa(h)}</th>`)}</tr></thead><tbody>${b.rows.map((r) => html`<tr>${r.map((c) => html`<td>${fa(c)}</td>`)}</tr>`)}</tbody></table></div></div>`;
    case 'formula':
      return html`<div class="blk blk-formula"><h3>${fa(b.title)}</h3><pre>${fa(b.expr)}</pre>${b.note ? html`<p class="note">${fa(b.note)}</p>` : ''}</div>`;
    case 'example':
      return html`<div class="blk"><h3>${fa(b.title)}</h3><div class="ledger">${b.lines.map(([k, v]) => html`<div><span>${fa(k)}</span><span>${fa(v)}</span></div>`)}</div></div>`;
    case 'warn':
      return html`<div class="blk blk-warn"><span class="stamp red">هشدار</span><p>${fa(b.text)}</p></div>`;
    case 'tip':
      return html`<div class="blk blk-tip"><span class="stamp">پشت ویترین</span><p>${fa(b.text)}</p></div>`;
    case 'floor': {
      const f = ctx.floor.get(b.id);
      return html`<div class="blk blk-floor" id="${b.id}"><div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><span class="stamp">کار عملی در شعبه</span>${statusStamp(f?.status)}</div>
        <h3 style="margin-top:8px">${fa(b.title)}</h3><ol>${b.steps.map((s) => html`<li>${fa(s)}</li>`)}</ol>
        ${f?.reviewerNote ? html`<p class="small" style="color:var(--ink-2)">نظر مدیر: ${f.reviewerNote}</p>` : ''}
        ${f?.status === 'verified' ? '' : html`<label class="field" style="color:var(--ink-2)">یادداشت برای مدیر (اختیاری)<textarea class="input" rows="2" data-note="${b.id}" style="background:#fffdf8;color:var(--ink);border-color:#d9ccb2"></textarea></label>
          <div class="actions"><button class="btn small" data-act="floor" data-id="${b.id}">${f?.status === 'requested' ? 'ارسال دوباره' : 'انجام دادم؛ برای تأیید بفرست'}</button></div>`}</div>`;
    }
    case 'model':
      return html`<div class="blk blk-model"><div class="stage" data-model="${b.view}"></div><p class="cap">${fa(b.caption ?? '')}</p></div>`;
    case 'viz':
      return html`<div class="blk blk-viz" data-viz="${JSON.stringify(b)}"><div class="vz-body"></div>${b.caption ? html`<p class="cap">${fa(b.caption)}</p>` : ''}</div>`;
    case 'tool': {
      const href = b.tool === 'studio' ? '/studio' : b.tool === 'coinlab' ? `/coins${b.q ?? ''}` : b.tool === 'ledger' ? '/ledger' : b.tool === 'sop' ? `/sop/${b.ref}` : `/tools/${b.tool}`;
      return html`<div class="blk blk-tool"><a href="${href}" data-link><span>${fa(b.label)}</span>${ICON.chev}</a></div>`;
    }
    default:
      return '';
  }
}

function question(q, state) {
  const answered = state[q.id];
  return html`<div class="q" data-q="${q.id}">
    <p class="q-t">${fa(q.q)} ${answered === true ? html`<span class="stamp jade">درست</span>` : ''}</p>
    ${q.o
      ? html`<div class="opts" role="group">${q.o.map((o, i) => html`<button class="opt" data-act="choose" data-q="${q.id}" data-i="${i}">${fa(o)}</button>`)}</div>`
      : html`<form class="numq" data-numq="${q.id}"><input class="input ltr" inputmode="decimal" placeholder="عدد" aria-label="پاسخ عددی"><button class="btn small" type="submit">بررسی</button></form><p class="small" style="color:var(--ink-2)">واحد: ${q.unit}. جداکننده هزارگان اختیاری است.</p>`}
    <div class="why-slot"></div></div>`;
}

export async function lessonPage(root, { id }) {
  const { lesson: l, done, answered } = await api(`/api/lessons/${id}`);
  const floor = new Map(store.me.progress.floor.map((f) => [f.taskId, f]));
  root.innerHTML = String(html`<article class="paper"><div class="inner">
    ${back(`/learn/${l.courseId}`, l.courseTitle)}
    <h1>${fa(l.title)}</h1>
    <div class="meta"><span class="stamp">درس ${fa(l.position)} از ${fa(l.total)}</span><span>${fa(l.minutes)} دقیقه</span>${done ? html`<span class="stamp jade">خوانده شده</span>` : ''}</div>
    ${l.blocks.map((b) => block(b, { floor }))}
    <section class="quiz" aria-labelledby="qh"><h2 id="qh" style="margin-top:0">بسنجید</h2>
      <p class="small" style="color:var(--ink-2)">پاسخ‌ها ثبت می‌شوند؛ اشتباه، فرصت یادگیری است و می‌توانید دوباره امتحان کنید.</p>
      ${l.quiz.map((q) => question(q, answered))}
    </section>
    <div class="lesson-foot">
      ${l.prev ? html`<a class="btn ghost" href="/lesson/${l.prev}" data-link>درس قبل</a>` : html`<span></span>`}
      <button class="btn" data-act="complete">${done ? (l.next ? 'درس بعد' : 'بازگشت به دوره') : l.next ? 'تمام شد؛ درس بعد' : 'تمام شد؛ بازگشت به دوره'}</button>
    </div>
  </div></article>`);

  const qmap = Object.fromEntries(l.quiz.map((q) => [q.id, q]));
  const showWhy = (qid, r) => {
    const slot = $(`[data-q="${qid}"] .why-slot`, root);
    slot.innerHTML = String(html`<div class="why ${r.correct ? 'right' : 'wrong'}"><b>${r.correct ? 'درست.' : 'نه هنوز.'}</b> ${fa(r.why)}${!r.correct && qmap[qid].numeric ? html`<br>پاسخ: <b class="num">${fmt(r.answer, 2)}</b> ${r.unit}` : ''}</div>`);
  };
  const answer = async (qid, value) => {
    try {
      const r = await api('/api/quiz/answer', { method: 'POST', body: { questionId: qid, answer: value } });
      showWhy(qid, r);
      return r;
    } catch (e) {
      toast(e.message, 'error');
      return null;
    }
  };
  actions(root, {
    choose: async (el) => {
      const qid = el.dataset.q;
      const btns = $$(`[data-act=choose][data-q="${qid}"]`, root);
      btns.forEach((b) => (b.disabled = true));
      const r = await answer(qid, Number(el.dataset.i));
      if (!r) return btns.forEach((b) => (b.disabled = false));
      btns.forEach((b) => b.classList.remove('right', 'wrong'));
      el.classList.add(r.correct ? 'right' : 'wrong');
      btns[r.answer]?.classList.add('right');
      if (!r.correct) setTimeout(() => btns.forEach((b) => (b.disabled = false)), 600);
    },
    floor: async (el) => {
      busy(el, true);
      try {
        const note = $(`[data-note="${el.dataset.id}"]`, root)?.value ?? '';
        await api(`/api/floor/${el.dataset.id}`, { method: 'POST', body: { note } });
        const f = store.me.progress.floor.find((x) => x.taskId === el.dataset.id);
        if (f) f.status = 'requested';
        else store.me.progress.floor.push({ taskId: el.dataset.id, status: 'requested' });
        el.textContent = 'ارسال شد؛ منتظر تأیید مدیر';
        toast('برای مدیر ارسال شد', 'ok');
      } catch (e) {
        toast(e.message, 'error');
      } finally {
        busy(el, false);
      }
    },
    complete: async (el) => {
      busy(el, true);
      try {
        if (!done) {
          await api(`/api/lessons/${l.id}/complete`, { method: 'POST' });
          store.me.progress.lessonsDone.push(l.id);
          store.loadMe().catch(() => {});
        }
        navigate(l.next ? `/lesson/${l.next}` : `/learn/${l.courseId}`);
      } catch (e) {
        toast(e.message, 'error');
        busy(el, false);
      }
    },
  });
  root.addEventListener('submit', async (e) => {
    const f = e.target.closest('[data-numq]');
    if (!f) return;
    e.preventDefault();
    const v = parseNum(f.querySelector('input').value);
    if (!Number.isFinite(v)) return toast('یک عدد وارد کنید', 'error');
    const btn = f.querySelector('button');
    busy(btn, true);
    await answer(f.dataset.numq, v);
    busy(btn, false);
  });

  // 3D model blocks
  const stages = $$('[data-model]', root);
  const cleanups = [];
  if (stages.length) {
    const { mountModelBlock } = await import('./models.mjs');
    for (const st of stages) cleanups.push(mountModelBlock(st, st.dataset.model));
  }
  // interactive diagrams
  if ($$('[data-viz]', root).length) (await import('../viz.mjs')).mountViz(root);
  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: 'center' });
  return () => cleanups.forEach((fn) => fn());
}
export { faDate };
