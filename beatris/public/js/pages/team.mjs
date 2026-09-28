import { html, store, api, fa, $, actions, toast, busy, render, ROLE_FA } from '../core.mjs';
import { back, ICON, ringEl, barEl, courseTitle, faDate, faTime } from '../ui.mjs';
import { fmt, parseNum } from '../calc.mjs';
import { statusStamp } from './learn.mjs';

const ROLE_ORDER = { owner: 0, manager: 1, trainer: 2, employee: 3 };

export async function teamPage(root) {
  const { members, pendingFloor } = await api('/api/team');
  const list = members.sort((a, b) => b.active - a.active || ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.name.localeCompare(b.name, 'fa'));
  const active = list.filter((m) => m.active);
  const present = active.filter((m) => m.today?.inAt && !m.today?.outAt).length;
  const avg = active.length ? Math.round(active.reduce((s, m) => s + m.overall, 0) / active.length) : 0;
  root.innerHTML = String(html`
    <div class="head"><div><h1>تیم</h1><p class="lead">آمادگی هر همکار = درس‌ها ۴۰٪ + پرسش‌ها ۳۰٪ + آزمون ۳۰٪ در هر دوره.</p></div></div>
    <div class="stats">
      <div><b>${fa(active.length)}</b><span>همکار فعال</span></div>
      <div><b>${fa(present)}</b><span>حاضر در شعبه</span></div>
      <div><b>${fa(avg)}٪</b><span>میانگین آمادگی</span></div>
      <div><b>${fa(pendingFloor)}</b><span>کار عملی منتظر تأیید</span></div>
    </div>
    <div class="actions">
      <a class="btn ${pendingFloor ? '' : 'ghost'}" href="/staff/queue" data-link>بررسی کارهای عملی${pendingFloor ? ` (${fa(pendingFloor)})` : ''}</a>
      ${store.me?.vendor ? html`<a class="btn" href="/vendor" data-link>کنسول ارائه‌دهنده (فروشگاه‌ها و حساب‌ها)</a>` : ''}
      ${store.isAdmin() && store.me?.tenant?.main !== false ? html`<a class="btn ghost" href="/staff/settings" data-link>قیمت مرجع و تنظیمات</a><a class="btn ghost" href="/staff/leads" data-link>درخواست‌های نمایش</a>` : ''}
    </div>
    <h2>همکاران</h2>
    <div class="scrollx" tabindex="0"><table class="table-plain">
      <thead><tr><th>نام</th><th>آمادگی</th><th>درس</th><th>گواهی</th><th>آزمون</th><th>سناریو</th><th>عملی</th><th>SOP</th><th>امروز</th></tr></thead>
      <tbody>${list.map((m) => html`<tr style="${m.active ? '' : 'opacity:.5'}">
        <td><a href="/staff/${m.id}" data-link><b>${m.name}</b></a><br><span class="small">${ROLE_FA[m.role]}${m.branch ? ` · ${m.branch}` : ''}${m.active ? '' : ' · غیرفعال'}</span></td>
        <td style="min-width:110px"><span class="num">${fa(m.overall)}٪</span>${barEl(m.overall)}</td>
        <td class="num">${fa(m.lessonsDone)}</td><td class="num">${fa(m.certificates)}</td>
        <td class="num">${m.examAvg != null ? `${fa(m.examAvg)}٪` : '—'}</td><td class="num">${m.scenarioAvg != null ? `${fa(m.scenarioAvg)}٪` : '—'}</td>
        <td class="num">${fa(m.floorVerified)}${m.floorPending ? html` <span class="stamp">+${fa(m.floorPending)}</span>` : ''}</td>
        <td>${m.sopMissing ? html`<span class="stamp red">${fa(m.sopMissing)}</span>` : html`<span class="stamp jade">کامل</span>`}</td>
        <td class="small">${m.today?.inAt ? html`<span class="dot on"></span>${faTime(m.today.inAt)}${m.today.outAt ? ` تا ${faTime(m.today.outAt)}` : ''}` : html`<span class="dot"></span>—`}</td></tr>`)}</tbody></table></div>

    ${store.isAdmin() && store.me?.tenant?.main === false ? html`<p class="small tray">حساب همکار تازه (نام کاربری و رمز) را ارائه‌دهنده نرم‌افزار صادر می‌کند. برای افزودن همکار با او تماس بگیرید.</p>` : ''}
    ${store.isAdmin() && store.me?.tenant?.main !== false ? html`<h2>افزودن همکار</h2>
      <form class="tray form cols" id="add">
        <label class="field">نام و نام خانوادگی<input class="input" name="name" required></label>
        <label class="field">موبایل<input class="input ltr" name="phone" inputmode="tel" required placeholder="۰۹…"></label>
        <label class="field">نقش<select class="input" name="role"><option value="employee">فروشنده</option><option value="trainer">مربی</option><option value="manager">مدیر</option>${store.me.user.role === 'owner' ? html`<option value="owner">مالک</option>` : ''}</select></label>
        <label class="field">شعبه<input class="input" name="branch" value="${store.me.user.branch}"></label>
        <label class="field">رمز اولیه (۴ تا ۱۲ رقم)<input class="input ltr" name="pin" inputmode="numeric" maxlength="12" required></label>
        <div style="align-self:end"><button class="btn block" type="submit">افزودن</button></div>
      </form>` : ''}`);

  $('#add', root)?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const btn = f.querySelector('button');
    busy(btn, true);
    try {
      await api('/api/team', { method: 'POST', body: Object.fromEntries(new FormData(f)) });
      toast('همکار اضافه شد؛ شماره و رمز را به او بدهید', 'ok');
      render();
    } catch (err) {
      toast(err.message, 'error');
      busy(btn, false);
    }
  });
}

export async function memberPage(root, { id }) {
  const { user: u, progress: p, attendance, recentExams } = await api(`/api/team/${id}`);
  const fl = new Map(p.floor.map((f) => [f.taskId, f]));
  const isAdmin = store.isAdmin();
  const self = u.id === store.me.user.id;
  const assigned = new Map(p.assignments.map((a) => [a.courseId, a]));
  root.innerHTML = String(html`${back('/staff', 'تیم')}
    <div class="head"><div><h1>${u.name}</h1><p class="lead">${ROLE_FA[u.role]}${u.branch ? ` · ${u.branch}` : ''} · ${fa(u.phone)} · آخرین ورود ${u.lastLoginAt ? faDate(u.lastLoginAt) : '—'}${u.active ? '' : ' · غیرفعال'}</p></div>${ringEl(p.overall, 'lg')}</div>
    <div class="stats">
      <div><b>${fa(p.lessonsDone.length)}/${fa(p.totals.lessons)}</b><span>درس</span></div>
      <div><b>${fa(p.quiz.firstTry)}/${fa(p.quiz.answered)}</b><span>درست در اولین تلاش</span></div>
      <div><b>${fa(p.drills.correct)}/${fa(p.drills.total)}</b><span>تمرین محاسبه</span></div>
      <div><b>${fa(p.cards.mastered)}</b><span>کارت تثبیت‌شده</span></div>
    </div>
    <h2>دوره‌ها</h2>
    <ul class="rows">${store.content.path.map((cid) => {
      const c = p.courses.find((x) => x.id === cid);
      const a = assigned.get(cid);
      return html`<li><div class="row"><span class="row-main"><span class="row-t">${courseTitle(cid)}</span>
        <span class="row-s">${fa(c.lessonsDone)}/${fa(c.lessons)} درس · پرسش ${fa(c.quizCorrect)}/${fa(c.quizTotal)} · آزمون ${c.examBest != null ? `${fa(c.examBest)}٪ در ${fa(c.examAttempts)} تلاش` : '—'}${a ? ` · تکلیف${a.dueDate ? ` تا ${faDate(a.dueDate)}` : ''}` : ''}</span>
        <span style="display:block;max-width:260px;margin-top:6px">${barEl(c.readiness)}</span></span>
        ${c.cert ? html`<span class="stamp jade">گواهی</span>` : a ? html`<button class="btn small ghost" data-act="unassign" data-id="${a.id}">لغو تکلیف</button>` : html`<button class="btn small ghost" data-act="assign" data-c="${cid}">تعیین تکلیف</button>`}</div></li>`;
    })}</ul>

    <h2>کار عملی</h2>
    <ul class="rows">${store.content.floorTasks.map((t) => html`<li><div class="row"><span class="row-main"><span class="row-t">${t.title}</span><span class="row-s">${fl.get(t.id)?.note ? `یادداشت: ${fl.get(t.id).note}` : ''}</span></span>${statusStamp(fl.get(t.id)?.status)}</div></li>`)}</ul>

    <h2>شبیه‌ساز و دستورالعمل</h2>
    <p class="small">${p.scenarios.length ? p.scenarios.map((s) => `${store.content.scenarios.find((x) => x.id === s.id)?.title ?? s.id}: ${fa(s.bestPct)}٪`).join(' · ') : 'هنوز سناریویی تمرین نشده.'}</p>
    <p class="small">${p.sopMissing.length ? `تأییدنشده: ${p.sopMissing.map((sid) => store.content.sops.find((s) => s.id === sid)?.title).join('، ')}` : 'همه دستورالعمل‌ها تأیید شده.'}</p>

    ${recentExams.length ? html`<h2>آزمون‌های اخیر</h2><ul class="rows">${recentExams.map((e) => html`<li><div class="row"><span class="row-main"><span class="row-t">${courseTitle(e.courseId)}</span><span class="row-s">${faDate(e.at)}</span></span><span class="stamp ${e.passed ? 'jade' : 'red'}">${fa(e.score)}٪</span></div></li>`)}</ul>` : ''}

    <h2>حضور ۳۰ روز اخیر</h2>
    ${attendance.length ? html`<table class="table-plain"><thead><tr><th>روز</th><th>ورود</th><th>خروج</th></tr></thead><tbody>${attendance.map((a) => html`<tr><td>${faDate(`${a.day}T12:00:00`)}</td><td>${faTime(a.in_at)}</td><td>${faTime(a.out_at)}</td></tr>`)}</tbody></table>` : html`<p class="small">ثبتی وجود ندارد.</p>`}

    ${isAdmin && !self && (u.role !== 'owner' || store.me.user.role === 'owner') ? html`<h2>مدیریت حساب</h2>
      <div class="tray form cols">
        <label class="field">نقش<select class="input" id="role">${['employee', 'trainer', 'manager', ...(store.me.user.role === 'owner' ? ['owner'] : [])].map((r) => html`<option value="${r}" ${r === u.role ? 'selected' : ''}>${ROLE_FA[r]}</option>`)}</select></label>
        <label class="field">شعبه<input class="input" id="branch" value="${u.branch}"></label>
        <label class="field">رمز جدید<input class="input ltr" id="npin" inputmode="numeric" maxlength="12" placeholder="خالی = بدون تغییر"></label>
        <div style="align-self:end"><button class="btn block" data-act="save">ذخیره</button></div>
      </div>
      <div class="actions"><button class="btn ${u.active ? 'danger' : ''}" data-act="toggle">${u.active ? 'غیرفعال کردن حساب' : 'فعال کردن حساب'}</button></div>` : ''}`);

  const patch = async (el, body, msg) => {
    busy(el, true);
    try {
      await api(`/api/team/${u.id}`, { method: 'PATCH', body });
      toast(msg, 'ok');
      render();
    } catch (e) {
      toast(e.message, 'error');
      busy(el, false);
    }
  };
  actions(root, {
    assign: async (el) => {
      const due = prompt('مهلت (اختیاری) به شکل 2026-10-30:', '') ?? null;
      if (due === null) return;
      busy(el, true);
      try {
        await api('/api/assignments', { method: 'POST', body: { userId: u.id, courseId: el.dataset.c, dueDate: due.trim() } });
        toast('تکلیف ثبت شد', 'ok');
        render();
      } catch (e) {
        toast(e.message, 'error');
        busy(el, false);
      }
    },
    unassign: async (el) => {
      busy(el, true);
      await api(`/api/assignments/${el.dataset.id}`, { method: 'DELETE' }).catch((e) => toast(e.message, 'error'));
      render();
    },
    save: (el) => {
      const body = { role: $('#role', root).value, branch: $('#branch', root).value };
      const pin = $('#npin', root).value.trim();
      if (pin) body.pin = pin;
      patch(el, body, pin ? 'ذخیره شد؛ همکار باید با رمز جدید وارد شود' : 'ذخیره شد');
    },
    toggle: (el) => {
      if (u.active && !confirm(`حساب ${u.name} غیرفعال شود؟ پیشرفت او حفظ می‌شود.`)) return;
      patch(el, { active: !u.active }, u.active ? 'حساب غیرفعال شد' : 'حساب فعال شد');
    },
  });
}

export async function queuePage(root) {
  const { items } = await api('/api/floor-queue');
  root.innerHTML = String(html`${back('/staff', 'تیم')}<h1>کارهای عملی منتظر تأیید</h1>
    <p class="lead">فقط کاری را تأیید کنید که انجامش را دیده‌اید. رد کردن با یادداشت، راهنمای تمرین بعدی است.</p>
    ${items.length ? html`<div style="display:grid;gap:14px;margin-top:16px">${items.map((it) => html`<div class="tray" data-item="${it.userId}:${it.taskId}">
      <div style="display:flex;justify-content:space-between;gap:10px"><b>${it.name}</b><span class="small">${faDate(it.requestedAt)}</span></div>
      <h3 style="margin-top:6px">${it.title}</h3><ol class="small">${it.steps.map((s) => html`<li>${fa(s)}</li>`)}</ol>
      ${it.note ? html`<p class="small">یادداشت همکار: ${it.note}</p>` : ''}
      <label class="field">یادداشت شما<input class="input" data-note></label>
      <div class="actions"><button class="btn small" data-act="rev" data-v="verified" data-u="${it.userId}" data-t="${it.taskId}">تأیید</button><button class="btn small danger" data-act="rev" data-v="rejected" data-u="${it.userId}" data-t="${it.taskId}">نیاز به تکرار</button></div></div>`)}</div>`
      : html`<section class="empty"><p>درخواستی در انتظار نیست.</p></section>`}`);
  actions(root, {
    rev: async (el) => {
      const box = el.closest('[data-item]');
      busy(el, true);
      try {
        await api(`/api/floor-queue/${el.dataset.u}/${el.dataset.t}`, { method: 'POST', body: { verdict: el.dataset.v, note: $('[data-note]', box).value } });
        box.remove();
        toast(el.dataset.v === 'verified' ? 'تأیید شد' : 'برای تکرار برگشت', 'ok');
      } catch (e) {
        toast(e.message, 'error');
        busy(el, false);
      }
    },
  });
}

export function settingsPage(root) {
  const pr = store.me.pricing;
  if (!store.isAdmin()) return render();
  root.innerHTML = String(html`${back('/staff', 'تیم')}<h1>قیمت مرجع و تنظیمات</h1>
    <p class="lead">این اعداد پیش‌فرض ابزارها و تمرین‌های محاسبه‌اند. قیمت روز را با مرجع اعلام‌شده فروشگاه به‌روز کنید.</p>
    <form class="tray form cols" id="sf" style="margin-top:16px">
      <label class="field">قیمت هر گرم ۱۸ عیار (تومان)<input class="input ltr" name="p750" value="${fmt(pr.p750).replace(/٬/g, ',')}"></label>
      <label class="field">سود فروشنده (٪)<input class="input ltr" name="profitPct" value="${pr.profitPct}"></label>
      <label class="field">مالیات بر ارزش افزوده (٪)<input class="input ltr" name="vatPct" value="${pr.vatPct}"></label>
      <label class="field">کسر خرید طلای مستعمل (٪)<input class="input ltr" name="buybackDeductPct" value="${pr.buybackDeductPct}"></label>
      <label class="field">حد قبولی آزمون (٪)<input class="input ltr" name="passPct" value="${pr.passPct}"></label>
      <label class="field">یادداشت قیمت<input class="input" name="priceNote" value="${pr.priceNote ?? ''}" maxlength="120"></label>
      <div style="align-self:end"><button class="btn block" type="submit">ذخیره</button></div>
    </form>
    <p class="small" style="margin-top:12px">قیمت گرم ۱۸ به‌طور پیش‌فرض هر چند دقیقه از قیمت زنده بازار به‌روز می‌شود؛ برای قیمت دستی، «به‌روزرسانی خودکار قیمت پایه» را در <a href="/market/data" data-link>مدیریت داده بازار</a> خاموش کنید.</p>
    <p class="small" style="margin-top:12px">نرخ مالیات ۱۴۰۵ برای اجرت، سود و حق‌العمل طلا ۱۰٪ است (قانون بودجه ۱۴۰۵). ابتدای هر سال با قانون بودجه همان سال تطبیق دهید.</p>
    <form class="tray form cols" id="bf" style="margin-top:16px">
      <label class="field">نام فروشگاه (روی صفحه ورود و نوار بالا)<input class="input" name="shopName" maxlength="40" value="${store.me.brand?.shopName ?? ''}" placeholder="مثلاً طلا و جواهر نمونه"></label>
      <div style="align-self:end"><button class="btn block" type="submit">ذخیره نام</button></div>
    </form>
    ${pr.updatedAt ? html`<p class="small">آخرین تغییر: ${faDate(pr.updatedAt)} ${faTime(pr.updatedAt)}</p>` : ''}
    <section class="tray" style="margin-top:22px" id="mcp">
      <h2 style="margin-top:0">اتصال به دستیار هوش مصنوعی (MCP)</h2>
      <p class="small">با این اتصال، Claude یا هر دستیار سازگار با MCP می‌تواند ابزارهای همین فروشگاه را به کار بگیرد: ارزش طلا و آب‌شده به قاعده دفتر، فاکتور، خرید مستعمل، حباب سکه، تابلو و تحلیل بازار، احتمال تقلب و فهرست دوره‌ها. اطلاعات کارکنان و مشتریان در دسترس دستیار نیست.</p>
      <div id="mcpbox"><div class="loading"><span></span></div></div>
    </section>`);
  const endpoint = `${location.origin}/mcp`;
  async function drawMcp(fresh) {
    const m = await api('/api/mcp');
    const box = $('#mcpbox', root);
    const desktop = fresh ? JSON.stringify({ mcpServers: { beatris: { command: 'npx', args: ['mcp-remote', endpoint, '--header', 'Authorization:${AUTH}'], env: { AUTH: `Bearer ${fresh}` } } } }, null, 2) : '';
    box.innerHTML = String(html`<div class="ledger" style="background:rgba(8,7,5,0.45);border-color:var(--vault-4)"><div><span>نشانی</span><span class="ltr">${endpoint}</span></div><div><span>وضعیت</span><span>${m.configured ? `فعال${m.createdAt ? ` · توکن از ${faDate(m.createdAt)}` : ''}${m.fromEnv ? ' · توکن محیطی سرور' : ''}` : 'غیرفعال (توکنی ساخته نشده)'}</span></div></div>
      ${fresh ? html`<p class="notice" style="margin-top:12px">این توکن فقط همین یک بار نمایش داده می‌شود؛ آن را جای امن نگه دارید. هر کس توکن را داشته باشد می‌تواند از ابزارهای این فروشگاه استفاده کند.</p>
        <label class="field" style="margin-top:10px">توکن<input class="input ltr" readonly value="${fresh}" data-copy></label>
        <p class="small" style="margin-top:12px">Claude Code:</p><pre class="ltr small" style="white-space:pre-wrap;word-break:break-all">claude mcp add --transport http beatris ${endpoint} --header "Authorization: Bearer ${fresh}"</pre>
        <p class="small">Claude Desktop (فایل claude_desktop_config.json):</p><pre class="ltr small" style="white-space:pre-wrap;word-break:break-all">${desktop}</pre>` : ''}
      <div class="actions" style="margin-top:12px"><button class="btn" type="button" data-mcp="new">${m.configured ? 'ساخت توکن تازه (توکن قبلی باطل می‌شود)' : 'ساخت توکن و فعال‌سازی'}</button>${m.configured && !m.fromEnv ? html`<button class="btn ghost" type="button" data-mcp="off">ابطال و غیرفعال‌سازی</button>` : ''}</div>`);
  }
  $('#mcp', root).addEventListener('click', async (e) => {
    const b = e.target.closest('[data-mcp]');
    if (e.target.matches('[data-copy]')) return e.target.select();
    if (!b) return;
    if (b.dataset.mcp === 'off' && !confirm('اتصال دستیار هوش مصنوعی قطع شود؟')) return;
    busy(b, true);
    try {
      if (b.dataset.mcp === 'new') {
        const r = await api('/api/mcp/token', { method: 'POST' });
        await drawMcp(r.token);
      } else {
        await api('/api/mcp/token', { method: 'DELETE' });
        await drawMcp();
      }
    } catch (err) {
      toast(err.message, 'error');
      busy(b, false);
    }
  });
  drawMcp().catch((err) => toast(err.message, 'error'));
  $('#bf', root).addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    busy(btn, true);
    try {
      const r = await api('/api/settings/brand', { method: 'PUT', body: { shopName: e.target.elements.shopName.value } });
      store.me.brand = r.brand;
      render();
      toast('نام فروشگاه ذخیره شد', 'ok');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      busy(btn, false);
    }
  });
  $('#sf', root).addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    const body = { priceNote: d.priceNote };
    for (const k of ['p750', 'profitPct', 'vatPct', 'buybackDeductPct', 'passPct']) body[k] = parseNum(d[k]);
    const btn = e.target.querySelector('button');
    busy(btn, true);
    try {
      const r = await api('/api/settings/pricing', { method: 'PUT', body });
      store.me.pricing = r.pricing;
      toast('ذخیره شد', 'ok');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      busy(btn, false);
    }
  });
}
const LEAD_STATUS = { new: 'تازه', contacted: 'تماس گرفته شد', won: 'مشتری شد', lost: 'منصرف شد' };
/** Demo requests from the public product page (/intro). */
export async function leadsPage(root) {
  if (!store.isAdmin()) return render();
  const draw = async () => {
    const { items } = await api('/api/leads');
    root.innerHTML = String(html`${back('/staff', 'تیم')}<h1>درخواست‌های نمایش</h1>
      <p class="lead">درخواست‌هایی که از صفحه معرفی (<a href="/intro" data-link>/intro</a>) ثبت شده‌اند.</p>
      ${items.length
        ? html`<div class="rows" style="margin-top:16px">${items.map((l) => html`<div class="tray lead-row"><div><b>${l.shop}</b> <span class="small">· ${l.name} · ${l.city || '—'} · ${fa(l.branches)} شعبه · ${faDate(l.createdAt)}</span></div>
            <div class="small ltr" style="text-align:end"><a href="tel:${l.phone}">${fa(l.phone)}</a></div>
            ${l.message ? html`<p class="small" style="grid-column:1/-1">${l.message}</p>` : ''}
            <div class="chips" style="grid-column:1/-1">${Object.entries(LEAD_STATUS).map(([k, v]) => html`<button class="chip" data-lead="${l.id}" data-status="${k}" aria-pressed="${l.status === k}">${v}</button>`)}<button class="chip" data-lead="${l.id}" data-del="1">حذف</button></div></div>`)}</div>`
        : html`<p class="small" style="margin-top:16px">هنوز درخواستی ثبت نشده است.</p>`}`);
  };
  root.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-lead]');
    if (!b) return;
    try {
      if (b.dataset.del) {
        if (!confirm('این درخواست حذف شود؟')) return;
        await api(`/api/leads/${b.dataset.lead}`, { method: 'DELETE' });
      } else await api(`/api/leads/${b.dataset.lead}`, { method: 'PATCH', body: { status: b.dataset.status } });
      await draw();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
  await draw();
}
export { ICON };
