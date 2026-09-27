import { html, store, api, fa, $, actions, toast, busy } from '../core.mjs';
import { ringEl, nextLesson, courseTitle, faTime, faDate, ICON } from '../ui.mjs';
import { fmt, fmtT, alloyById } from '../calc.mjs';

const HERO_ALLOYS = [
  ['au18y', '۱۸ زرد'],
  ['au18r', '۱۸ رز'],
  ['au18w', '۱۸ سفید'],
  ['au24', '۲۴ عیار'],
  ['pt950', 'پلاتین'],
];

export async function homePage(root) {
  const { user, progress: p, pricing, attendance } = store.me;
  const next = nextLesson();
  const first = user.name.split(' ')[0];
  const floorPending = p.floor.filter((f) => f.status === 'requested').length;
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'صبح بخیر' : hour < 17 ? 'روز بخیر' : 'عصر بخیر';

  root.innerHTML = String(html`
    <section class="home-hero">
      <div class="stage" id="stage"></div>
      <a class="era" href="/history" data-link style="pointer-events:auto;text-decoration:none">۵۱۵ پیش از میلاد<b>دریک</b>نخستین سکه زر ایران ←</a>
      <div class="copy">
        <span class="eyebrow">${greet}، ${first}</span>
        <h1>طلا،<br><span class="gold-text">زبانی سه‌هزارساله.</span></h1>
        <div class="weight">
          <div><div class="w gold-text" id="w">—</div><div class="small" id="wcap">انگشتر تک‌نگین · سایز ۵۴ · الماس ۶٫۵ میلی‌متر</div></div>
          <div class="seg" role="group" aria-label="آلیاژ">${HERO_ALLOYS.map(([id, l], i) => html`<button data-act="alloy" data-id="${id}" aria-pressed="${i === 0}">${l}</button>`)}</div>
        </div>
        <div class="actions" style="margin-top:4px">
          ${next ? html`<a class="btn" href="/lesson/${next.lesson.id}" data-link>ادامه درس</a>` : html`<a class="btn" href="/learn" data-link>مرور دوره‌ها</a>`}
          <a class="btn ghost" href="/studio" data-link>${ICON.cube} استودیوی سه‌بعدی</a>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="bento">
        ${next
          ? html`<a class="tile engraved s8" href="/lesson/${next.lesson.id}" data-link>
              <span class="k">ادامه · ${next.course.title}</span>
              <h3>${next.lesson.title}</h3>
              <p>درس ${fa(next.index + 1)} از ${fa(next.course.lessons.length)} · ${fa(next.lesson.minutes)} دقیقه</p>
              <div class="foot">${ringEl((next.index / next.course.lessons.length) * 100)}<span class="chev">${ICON.chev}</span></div>
            </a>`
          : html`<div class="tile engraved s8"><span class="k">دوره‌ها</span><h3>همه درس‌ها خوانده شده</h3><p>آزمون دوره‌های بدون گواهی را بدهید و با کارت‌های مرور دانسته‌ها را تازه نگه دارید.</p></div>`}
        <div class="tile s4">
          <span class="k">آمادگی کلی</span>
          <div class="big gold-text">${fa(p.overall)}٪</div>
          <p>${fa(p.lessonsDone.length)} از ${fa(p.totals.lessons)} درس · ${fa(p.certificates.length)} گواهی</p>
          <div class="foot" style="width:100%"><div class="bar" style="flex:1"><i style="width:${p.overall}%"></i></div></div>
        </div>
        <a class="tile rosette s4" href="/history" data-link>
          <span class="k">گنجینه</span>
          <h3>سه هزار سال طلا</h3>
          <p>از نوب مصری تا دریک هخامنشی و دریای نور؛ هر دوره، یک درس برای ویترین.</p>
          <div class="foot"><span class="small">۹ دوره</span><span class="chev">${ICON.chev}</span></div>
        </a>
        <a class="tile s4" href="/cards" data-link>
          <span class="k">مرور</span>
          <div class="big">${fa(p.cards.due)}</div>
          <p>${p.cards.due ? 'کارت منتظر مرور امروز' : 'کارت تازه از درس‌های خوانده‌شده'}</p>
          <div class="foot"><span class="small">${fa(p.cards.mastered)} کارت تسلط‌یافته</span><span class="chev">${ICON.chev}</span></div>
        </a>
        <a class="tile s4" href="/drill" data-link>
          <span class="k">محاسبه</span>
          <h3>تمرین با اعداد تازه</h3>
          <p>فاکتور، مظنه، خرید مستعمل، چگالی و ذوب.</p>
          <div class="foot"><span class="small">${fa(p.drills.correct)} از ${fa(p.drills.total)} درست</span><span class="chev">${ICON.chev}</span></div>
        </a>

        <a class="tile engraved" href="/coins" data-link style="grid-column:1/-1;min-height:170px">
          <span class="k">آزمایشگاه سکه · جدید</span>
          <h3>اصل یا تقلبی؟</h3>
          <p>سکه‌های تمام، نیم، ربع، گرمی و پارسیان را سه‌بعدی وارسی کنید: ترازو، کولیس، آب، آهنربا، صدا، XRF و ذره‌بین؛ هشت نوع تقلب، سه سطح بازی.</p>
          <div class="foot"><span class="small">همراه دوره «تشخیص سکه اصل از تقلبی»</span><span class="chev">${ICON.chev}</span></div>
        </a>
        <div class="tile s6">
          <span class="k">امروز</span>
          <ul class="rows" style="border:0">
            <li style="border-color:var(--hair)"><a class="row" href="/practice" data-link><span class="row-main"><span class="row-t">شبیه‌ساز مشتری</span><span class="row-s">${fa(p.scenarios.length)} از ${fa(p.totals.scenarios)} سناریو تمرین شده</span></span><span class="chev">${ICON.chev}</span></a></li>
            ${p.sopMissing.length ? html`<li><a class="row" href="/library" data-link><span class="row-main"><span class="row-t">دستورالعمل‌های تأییدنشده</span><span class="row-s">${fa(p.sopMissing.length)} مورد منتظر مطالعه و تأیید</span></span><span class="stamp red">لازم</span></a></li>` : ''}
            ${p.assignments.map((a) => html`<li><a class="row" href="/learn/${a.courseId}" data-link><span class="row-main"><span class="row-t">${courseTitle(a.courseId)}</span><span class="row-s">تکلیف مدیر${a.dueDate ? ` · مهلت ${faDate(a.dueDate)}` : ''}${a.note ? ` · ${a.note}` : ''}</span></span><span class="stamp">تکلیف</span></a></li>`)}
            ${floorPending ? html`<li><div class="row"><span class="row-main"><span class="row-t">کار عملی در انتظار تأیید</span><span class="row-s">${fa(floorPending)} مورد برای بررسی مدیر ارسال شده</span></span></div></li>` : ''}
            <li style="border-bottom:0"><a class="row" href="/learn/c-rare" data-link><span class="row-main"><span class="row-t">دانش نایاب زرگری</span><span class="row-s">عیارسنجی، آلیاژسازی، ریخته‌گری، آبکاری و وزن سنگ</span></span><span class="stamp">ویژه</span></a></li>
          </ul>
        </div>
        <div class="tile s6">
          <span class="k">حضور</span>
          <h3 id="att">${attText(attendance)}</h3>
          <p>ورود و خروج روزانه برای مدیر شعبه ثبت می‌شود.</p>
          <div class="foot"><div class="actions" style="margin:0">
            <button class="btn small" data-act="in" ${attendance?.inAt ? 'disabled' : ''}>ثبت ورود</button>
            <button class="btn small ghost" data-act="out" ${!attendance?.inAt || attendance?.outAt ? 'disabled' : ''}>ثبت خروج</button>
          </div></div>
        </div>
      </div>
      <p class="small" style="margin:22px 0 10px">قیمت مرجع هر گرم ۱۸ عیار در ابزارها: <b class="num">${fmtT(pricing.p750)}</b>${pricing.updatedAt ? ` · به‌روزرسانی ${faDate(pricing.updatedAt)}` : ''}. ${pricing.priceNote ?? ''}</p>
    </section>
  `);

  let stage = null;
  let J, Mt, meshes;
  const show = (alloy) => {
    if (!meshes) return;
    for (const m of meshes) if (m.userData.role === 'metal') m.material = Mt.metalMaterial(alloy, 'polish');
    const a = alloyById(alloy);
    const vol = meshes.filter((m) => m.userData.role === 'metal').reduce((s, m) => s + Math.abs(J.signedVolume(m.geometry)), 0);
    $('#w', root).innerHTML = `${fmt((vol / 1000) * a.density, 2)}<small>گرم</small>`;
    stage?.invalidate();
  };
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

  // live hero: a solitaire turning slowly under studio light
  const mods = await Promise.all([import('../three/stage.mjs'), import('../three/jewelry.mjs'), import('../three/materials.mjs')]);
  const { createStage, T } = mods[0];
  [, J, Mt] = mods;
  const host = $('#stage', root);
  if (!host) return;
  stage = createStage(host, { controls: false, transparent: true, env: 'studio' });
  if (!stage) return;
  const P = J.PIECES.solitaire;
  meshes = await P.build({ ...Object.fromEntries(Object.entries(P.params).map(([k, v]) => [k, v[0]])), ...P.opts, setting: 'prong6' });
  const g = new T.Group();
  for (const m of meshes) {
    m.material = m.userData.role === 'gem' ? Mt.gemMaterial('diamond') : Mt.metalMaterial('au18y');
    g.add(m);
  }
  stage.root.add(g);
  stage.ground();
  const wide = () => host.clientWidth > 900;
  // push the ring toward the empty side of the hero
  const place = () => {
    stage.frame(stage.root, { instant: true, pitch: 0.28, yaw: 0.5, pad: wide() ? 1.9 : 1.6 });
    if (wide()) {
      const off = new T.Vector3(-1, 0, 0).applyQuaternion(stage.camera.quaternion).multiplyScalar(-16);
      stage.camera.position.add(off);
    }
  };
  place();
  addEventListener('resize', place);
  const t0 = performance.now();
  const stop = stage.onTick((t) => {
    g.rotation.y = ((t - t0) / 1000) * 0.35;
  });
  show('au18y');
  return () => {
    stop();
    removeEventListener('resize', place);
    stage.dispose();
  };
}

const attText = (a) =>
  a?.inAt ? html`<span class="dot on"></span>ورود ${faTime(a.inAt)}${a.outAt ? html` · خروج ${faTime(a.outAt)}` : ''}` : html`<span class="dot"></span>ورود امروز ثبت نشده`;
