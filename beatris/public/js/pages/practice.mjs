import { html, store, api, fa, $, actions, toast, busy } from '../core.mjs';
import { back, ICON } from '../ui.mjs';
import { DRILL_KINDS, makeDrill, checkNumeric, fmt, parseNum } from '../calc.mjs';

export async function practicePage(root) {
  const p = store.me.progress;
  const best = new Map(p.scenarios.map((s) => [s.id, s]));
  const cats = [...new Set(store.content.scenarios.map((s) => s.category))];
  root.innerHTML = String(html`
    <h1>تمرین</h1>
    <p class="lead">دانستن کافی نیست؛ تصمیم درست زیر فشار مشتری و محاسبه بی‌خطا با اعداد تازه.</p>
    <div class="grid2" style="margin-top:18px">
      <a class="tray row" href="/cards" data-link><span class="row-main"><span class="row-t">کارت‌های مرور</span><span class="row-s">${fa(p.cards.due)} کارت منتظر · ${fa(p.cards.mastered)} کارت تثبیت‌شده</span></span><span class="chev">${ICON.chev}</span></a>
      <a class="tray row" href="/drill" data-link><span class="row-main"><span class="row-t">تمرین محاسبه</span><span class="row-s">${fa(p.drills.correct)} درست از ${fa(p.drills.total)} تمرین</span></span><span class="chev">${ICON.chev}</span></a>
      <a class="tray row" href="/ledger" data-link><span class="row-main"><span class="row-t">تمرین‌گر دفتر آب‌شده</span><span class="row-s">ثبت فیلدبه‌فیلد معامله، زمان‌دار، با آزمون و خطا</span></span><span class="chev">${ICON.chev}</span></a>
    </div>
    <h2>شبیه‌ساز مشتری</h2>
    <p class="small">هر مرحله زمان محدود دارد. گزینه‌هایی که قانون امنیت یا شفافیت را می‌شکنند امتیاز منفی می‌گیرند.</p>
    ${cats.map((cat) => html`<h3 style="margin-top:18px">${cat}</h3><ul class="rows">${store.content.scenarios.filter((s) => s.category === cat).map((s) => {
      const b = best.get(s.id);
      return html`<li><a class="row" href="/scenario/${s.id}" data-link><span class="row-main"><span class="row-t">${s.title}</span><span class="row-s">${s.persona} · ${s.difficulty}</span></span>${b ? html`<span class="stamp ${b.bestPct >= 80 ? 'jade' : ''}">${fa(b.bestPct)}٪</span>` : html`<span class="stamp mute">تازه</span>`}</a></li>`;
    })}</ul>`)}`);
}

/* ---------------- scenario ---------------- */
export async function scenarioPage(root, { id }) {
  const { scenario: s } = await api(`/api/scenarios/${id}`);
  const picks = {};
  let total = 0;
  let step = -1;
  let timer = 0;
  let deadline = 0;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const renderIntro = () => {
    root.innerHTML = String(html`${back('/practice', 'تمرین')}
      <span class="stamp">${s.category} · ${s.difficulty}</span>
      <h1 style="margin-top:8px">${s.title}</h1>
      <p class="persona">${s.persona}</p>
      <div class="bubble" style="margin-top:16px">${fa(s.intro)}</div>
      <p class="small" style="margin-top:14px">${fa(s.steps.length)} مرحله · ${fa(s.timeLimit)} ثانیه برای هر تصمیم · بیشترین امتیاز ${fa(s.maxScore)}</p>
      <div class="actions"><button class="btn" data-act="start">شروع</button></div>`);
  };
  const renderStep = () => {
    const st = s.steps[step];
    root.innerHTML = String(html`${back('/practice', 'تمرین')}
      <div class="scene">
        <div style="display:flex;justify-content:space-between;align-items:center"><span class="small">مرحله ${fa(step + 1)} از ${fa(s.steps.length)}</span><span class="score-chip">امتیاز ${fa(total)}</span></div>
        <div class="timer" aria-hidden="true"><i id="bar"></i></div>
        <p class="small" id="left" aria-live="off"></p>
        <div class="bubble">${fa(st.say)}</div>
        <h3>${fa(st.prompt)}</h3>
        <div style="display:grid;gap:10px">${st.choices.map((c) => html`<button class="choice" data-act="pick" data-id="${c.id}">${fa(c.text)}</button>`)}</div>
        <div id="fb"></div>
      </div>`);
    deadline = performance.now() + s.timeLimit * 1000;
    tick();
  };
  const tick = () => {
    const left = Math.max(0, deadline - performance.now());
    const bar = $('#bar', root);
    if (!bar) return;
    bar.style.width = `${(left / (s.timeLimit * 1000)) * 100}%`;
    $('#left', root).textContent = `${fa(Math.ceil(left / 1000))} ثانیه`;
    if (left <= 0) return choose(null);
    timer = reduced ? setTimeout(tick, 1000) : requestAnimationFrame(tick);
  };
  const stopTimer = () => (reduced ? clearTimeout(timer) : cancelAnimationFrame(timer));

  async function choose(choiceId, el) {
    stopTimer();
    const st = s.steps[step];
    root.querySelectorAll('.choice').forEach((b) => (b.disabled = true));
    try {
      const r = await api(`/api/scenarios/${id}/reveal`, { method: 'POST', body: { stepId: st.id, choiceId } });
      picks[st.id] = choiceId;
      total += r.score;
      if (el) el.classList.add(r.score >= 8 ? 'good' : 'badc');
      root.querySelector(`.choice[data-id="${r.bestId}"]`)?.classList.add('good');
      const last = step === s.steps.length - 1;
      $('#fb', root).innerHTML = String(html`<div class="fb"><b class="num">${r.score > 0 ? '+' : ''}${fa(r.score)}</b> — ${fa(r.fb)}${r.bestId !== choiceId ? html`<br><span class="small">بهترین پاسخ: ${fa(r.bestFb)}</span>` : ''}</div>
        <div class="actions"><button class="btn" data-act="${last ? 'finish' : 'next'}">${last ? 'نتیجه' : 'مرحله بعد'}</button></div>`);
      $('#fb .btn', root).focus();
    } catch (e) {
      toast(e.message, 'error');
    }
  }
  actions(root, {
    start: () => {
      step = 0;
      renderStep();
    },
    pick: (el) => !el.disabled && choose(el.dataset.id, el),
    next: () => {
      step++;
      renderStep();
    },
    finish: async (el) => {
      busy(el, true);
      try {
        const r = await api(`/api/scenarios/${id}/submit`, { method: 'POST', body: { choices: picks } });
        store.loadMe().catch(() => {});
        root.innerHTML = String(html`${back('/practice', 'تمرین')}<div class="result"><div class="big">${fa(r.pct)}٪</div><p>امتیاز ${fa(r.score)} از ${fa(r.max)}</p>
          ${r.violations ? html`<p><span class="stamp red">${fa(r.violations)} تخلف از قانون</span></p><p class="small">گزینه‌های منفی یعنی شکستن قانون امنیت یا شفافیت؛ پیش از تکرار، درس مربوط را مرور کنید.</p>` : ''}
          <div class="actions" style="justify-content:center"><a class="btn" href="/scenario/${id}" data-link>دوباره</a><a class="btn ghost" href="/practice" data-link>سناریوی دیگر</a></div></div>`);
      } catch (e) {
        toast(e.message, 'error');
        busy(el, false);
      }
    },
  });
  renderIntro();
  return stopTimer;
}

/* ---------------- flashcards ---------------- */
export async function cardsPage(root) {
  const { cards, remainingNew } = await api('/api/cards/due');
  let i = 0;
  let reviewed = 0;
  const show = () => {
    if (i >= cards.length) {
      root.innerHTML = String(html`${back('/practice', 'تمرین')}<section class="empty"><h1>${reviewed ? 'مرور امروز تمام شد' : 'فعلاً کارتی برای مرور نیست'}</h1>
        <p class="lead">${reviewed ? `${fa(reviewed)} کارت مرور شد. کارت‌ها طبق جعبه لایتنر در فاصله‌های بلندتر برمی‌گردند.` : 'با خواندن درس‌های تازه، کارت‌های جدید اضافه می‌شوند.'}${remainingNew ? ` ${fa(remainingNew)} کارت تازه برای روزهای بعد مانده است.` : ''}</p>
        <a class="btn" href="/learn" data-link>ادامه آموزش</a></section>`);
      store.loadMe().catch(() => {});
      return;
    }
    const c = cards[i];
    root.innerHTML = String(html`${back('/practice', 'تمرین')}
      <div class="head"><h1>مرور</h1><span class="small">${fa(i + 1)} از ${fa(cards.length)}${c.box ? ` · جعبه ${fa(c.box)}` : ' · تازه'}</span></div>
      <div class="card" data-act="flip" role="button" tabindex="0" aria-label="نمایش پاسخ"><div class="card-in">
        <div class="card-face card-front">${fa(c.front)}</div>
        <div class="card-face card-back">${fa(c.back)}</div></div></div>
      <p class="small" style="text-align:center">اول در ذهن جواب دهید، بعد کارت را برگردانید.</p>
      <div class="grade" hidden id="grade">
        <button class="btn ghost" data-act="grade" data-g="again">بلد نبودم</button>
        <button class="btn" data-act="grade" data-g="good">بلد بودم</button>
        <button class="btn ghost" data-act="grade" data-g="easy">خیلی راحت</button>
      </div>`);
  };
  const flip = () => {
    $('.card', root)?.classList.add('flip');
    const g = $('#grade', root);
    if (g) g.hidden = false;
  };
  actions(root, {
    flip,
    grade: async (el) => {
      busy(el, true);
      try {
        await api('/api/cards/review', { method: 'POST', body: { cardId: cards[i].id, grade: el.dataset.g } });
        reviewed++;
        i++;
        show();
      } catch (e) {
        toast(e.message, 'error');
        busy(el, false);
      }
    },
  });
  root.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('.card')) {
      e.preventDefault();
      flip();
    }
  });
  show();
}

/* ---------------- drills ---------------- */
export async function drillPage(root) {
  const params = new URLSearchParams(location.search);
  let kind = Object.hasOwn(DRILL_KINDS, params.get('k') ?? '') ? params.get('k') : 'invoice';
  let streak = 0;
  let drill;
  const base = store.me.pricing.p750;
  const fresh = () => {
    drill = makeDrill(kind, (Math.random() * 2 ** 31) | 0, base);
    root.innerHTML = String(html`${back('/practice', 'تمرین')}
      <h1>تمرین محاسبه</h1>
      <div class="seg" role="group" aria-label="نوع تمرین" style="margin:14px 0">${Object.entries(DRILL_KINDS).map(([k, l]) => html`<button data-act="kind" data-k="${k}" aria-pressed="${k === kind}">${l}</button>`)}</div>
      <div class="tray">
        <p style="font-size:18px;line-height:2">${drill.prompt}</p>
        <form id="df" class="numq"><input class="input ltr" inputmode="decimal" placeholder="پاسخ به ${drill.unit}" aria-label="پاسخ"><button class="btn" type="submit">بررسی</button></form>
        <div id="out"></div>
      </div>
      <p class="small" style="margin-top:12px">پشت‌سرهم درست: <b class="num">${fa(streak)}</b>. اعداد فرضی‌اند و حول قیمت مرجع فروشگاه ساخته می‌شوند. ماشین‌حساب ممنوع نیست؛ هدف دقت است.</p>`);
    $('input', root).focus();
    $('#df', root).addEventListener('submit', (e) => {
      e.preventDefault();
      const v = parseNum($('input', root).value);
      if (!Number.isFinite(v)) return toast('یک عدد وارد کنید', 'error');
      const ok = checkNumeric(v, drill.answer, drill.tol);
      streak = ok ? streak + 1 : 0;
      api('/api/drills', { method: 'POST', body: { kind, correct: ok } }).catch(() => {});
      $('#df button', root).disabled = true;
      $('#out', root).innerHTML = String(html`<div class="fb" style="margin-top:12px"><b>${ok ? 'درست.' : 'نادرست.'}</b> پاسخ دقیق: <b class="num">${fmt(drill.answer, drill.unit === 'تومان' ? 0 : 2)}</b> ${drill.unit}
        ${drill.steps ? html`<div class="ledger" style="margin-top:10px;background:var(--velvet);border-color:var(--velvet-3)">${drill.steps.map(([k, v2]) => html`<div><span>${k}</span><span class="num">${fmt(v2, drill.unit === 'تومان' ? 0 : 3)}</span></div>`)}</div>` : ''}</div>
        <div class="actions"><button class="btn" data-act="again">پرسش بعد</button></div>`);
      $('[data-act=again]', root).focus();
    });
  };
  actions(root, {
    kind: (el) => {
      kind = el.dataset.k;
      history.replaceState({}, '', `/drill?k=${kind}`);
      fresh();
    },
    again: fresh,
  });
  fresh();
}
