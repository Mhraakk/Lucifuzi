import { html, store, api, fa, $, actions, toast, busy } from '../core.mjs';
import { ringEl, nextLesson, courseTitle, faTime, faDate, ICON } from '../ui.mjs';
import { fmt, fmtT } from '../calc.mjs';

const HERO_ALLOYS = [
  ['au18y', '۱۸ زرد'],
  ['au18r', '۱۸ رز'],
  ['au18w', '۱۸ سفید'],
  ['au24', '۲۴'],
];

export async function homePage(root) {
  const { user, progress: p, pricing, attendance } = store.me;
  const next = nextLesson();
  const first = user.name.split(' ')[0];
  const floorPending = p.floor.filter((f) => f.status === 'requested').length;
  root.innerHTML = String(html`
    <section class="hero">
      <div class="hero-stage" id="stage">
        <div class="hero-copy">
          <p class="small">سلام ${first}</p>
          <h1>یک انگشتر، چهار آلیاژ، چهار وزن.</h1>
        </div>
      </div>
      <div class="hero-weight">
          <div><div class="w" id="w">—</div><span class="small" id="wcap">حلقه سایز ۵۴ · پهنای ۴ · ضخامت ۱٫۸ میلی‌متر</span></div>
          <div class="seg" role="group" aria-label="آلیاژ">${HERO_ALLOYS.map(([id, l], i) => html`<button data-act="alloy" data-id="${id}" aria-pressed="${i === 0}">${l}</button>`)}</div>
        </div>
    </section>

    ${next
      ? html`<section style="margin-top:22px">
          <a class="row next tray" href="/lesson/${next.lesson.id}" data-link>
            ${ringEl((next.index / next.course.lessons.length) * 100)}
            <span class="row-main"><span class="row-s">ادامه ${next.course.title} · درس ${fa(next.index + 1)} از ${fa(next.course.lessons.length)}</span>
            <span class="row-t">${next.lesson.title}</span><span class="row-s">${fa(next.lesson.minutes)} دقیقه</span></span>
            <span class="chev">${ICON.chev}</span>
          </a></section>`
      : html`<section class="tray" style="margin-top:22px"><h3>همه درس‌ها تمام شده</h3><p class="small">آزمون دوره‌هایی که گواهی ندارند را بدهید و با کارت‌های مرور، دانسته‌ها را تازه نگه دارید.</p></section>`}

    <h2>امروز</h2>
    <ul class="rows">
      <li><a class="row" href="/cards" data-link><span class="row-main"><span class="row-t">مرور کارت‌ها</span><span class="row-s">${p.cards.due ? `${fa(p.cards.due)} کارت منتظر مرور` : 'کارت‌های تازه از درس‌هایی که خوانده‌اید'}</span></span><span class="chev">${ICON.chev}</span></a></li>
      <li><a class="row" href="/drill" data-link><span class="row-main"><span class="row-t">تمرین محاسبه</span><span class="row-s">فاکتور، مظنه، خرید مستعمل، چگالی — با اعداد تازه هر بار</span></span><span class="chev">${ICON.chev}</span></a></li>
      <li><a class="row" href="/practice" data-link><span class="row-main"><span class="row-t">شبیه‌ساز مشتری</span><span class="row-s">${fa(p.scenarios.length)} از ${fa(p.totals.scenarios)} سناریو تمرین شده</span></span><span class="chev">${ICON.chev}</span></a></li>
      ${p.sopMissing.length ? html`<li><a class="row" href="/library" data-link><span class="row-main"><span class="row-t">دستورالعمل‌های تأییدنشده</span><span class="row-s">${fa(p.sopMissing.length)} دستورالعمل منتظر مطالعه و تأیید شما</span></span><span class="stamp red">لازم</span></a></li>` : ''}
      ${p.assignments.map((a) => html`<li><a class="row" href="/learn/${a.courseId}" data-link><span class="row-main"><span class="row-t">${courseTitle(a.courseId)}</span><span class="row-s">تعیین‌شده توسط مدیر${a.dueDate ? ` · مهلت ${faDate(a.dueDate)}` : ''}${a.note ? ` · ${a.note}` : ''}</span></span><span class="stamp">تکلیف</span></a></li>`)}
      ${floorPending ? html`<li><div class="row"><span class="row-main"><span class="row-t">کار عملی در انتظار تأیید</span><span class="row-s">${fa(floorPending)} مورد برای بررسی مدیر ارسال شده</span></span></div></li>` : ''}
    </ul>

    <h2>حضور</h2>
    <div class="tray" style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
      <div id="att">${attText(attendance)}</div>
      <div class="actions" style="margin:0">
        <button class="btn small" data-act="in" ${attendance?.inAt ? 'disabled' : ''}>ثبت ورود</button>
        <button class="btn small ghost" data-act="out" ${!attendance?.inAt || attendance?.outAt ? 'disabled' : ''}>ثبت خروج</button>
      </div>
    </div>

    <h2>کارنامه</h2>
    <div class="stats">
      <div><b>${fa(p.overall)}٪</b><span>آمادگی کلی</span></div>
      <div><b>${fa(p.lessonsDone.length)}/${fa(p.totals.lessons)}</b><span>درس خوانده‌شده</span></div>
      <div><b>${fa(p.certificates.length)}</b><span>گواهی</span></div>
      <div><b>${fa(p.floor.filter((f) => f.status === 'verified').length)}/${fa(p.totals.floor)}</b><span>کار عملی تأییدشده</span></div>
    </div>
    <p class="small" style="margin-top:14px">قیمت مرجع هر گرم ۱۸ عیار در ابزارها: <b class="num">${fmtT(pricing.p750)}</b>${pricing.updatedAt ? ` · به‌روزرسانی ${faDate(pricing.updatedAt)}` : ''}. ${pricing.priceNote ?? ''}</p>
  `);

  actions(root, {
    in: (el) => att(el, 'in'),
    out: (el) => att(el, 'out'),
    alloy: (el) => {
      root.querySelectorAll('[data-act=alloy]').forEach((b) => b.setAttribute('aria-pressed', String(b === el)));
      show(el.dataset.id);
    },
  });
  async function att(el, type) {
    busy(el, true);
    try {
      const r = await api('/api/attendance', { method: 'POST', body: { type } });
      store.me.attendance = r;
      $('#att', root).innerHTML = String(attText(r));
      root.querySelector('[data-act=in]').disabled = !!r.inAt;
      root.querySelector('[data-act=out]').disabled = !r.inAt || !!r.outAt;
      toast(type === 'in' ? 'ورود ثبت شد' : 'خروج ثبت شد', 'ok');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      busy(el, false);
    }
  }

  const [{ createViewer }, { ringScene }] = await Promise.all([import('../gl/viewer.mjs'), import('../gl/pieces.mjs')]);
  const stage = $('#stage', root);
  const viewer = createViewer(stage, { pitch: 0.32, theta: 0.5, shiftY: 0.3, fit: 3.5, label: 'انگشتر طلا در حال چرخش' });
  const show = (alloy) => {
    const s = ringScene({ alloy, diameter: 54 / Math.PI, width: 4, thickness: 1.8, profile: 'comfort' });
    viewer.setScene(s.items, { refit: true });
    $('#w', root).innerHTML = `${fmt(s.grams, 2)}<small>گرم</small>`;
  };
  show('au18y');
  return () => viewer.destroy();
}

const attText = (a) =>
  a?.inAt ? html`<span class="dot on"></span>ورود ${faTime(a.inAt)}${a.outAt ? html` · خروج ${faTime(a.outAt)}` : ''}` : html`<span class="dot"></span>ورود امروز هنوز ثبت نشده`;
