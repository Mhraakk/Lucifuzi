import { html, store, api, fa, $, actions, toast, busy, auth, navigate, ROLE_FA } from '../core.mjs';
import { ICON, ringEl, courseTitle, faDate } from '../ui.mjs';
import { statusStamp } from './learn.mjs';

export function mePage(root) {
  const { user, progress: p } = store.me;
  const tasks = store.content.floorTasks;
  const fl = new Map(p.floor.map((f) => [f.taskId, f]));
  root.innerHTML = String(html`
    <div class="head"><div><h1>${user.name}</h1><p class="lead">${ROLE_FA[user.role]}${user.branch ? ` · ${user.branch}` : ''} · ${fa(user.phone)}</p></div>${ringEl(p.overall, 'lg')}</div>
    <ul class="rows">
      <li><a class="row" href="/library" data-link><span class="row-main"><span class="row-t">کتابخانه</span><span class="row-s">دستورالعمل‌ها، واژه‌نامه بازار، منابع معتبر</span></span>${p.sopMissing.length ? html`<span class="stamp red">${fa(p.sopMissing.length)} تأیید لازم</span>` : html`<span class="chev">${ICON.chev}</span>`}</a></li>
      ${store.isStaff() ? html`<li><a class="row" href="/staff" data-link><span class="row-main"><span class="row-t">تیم و گزارش‌ها</span><span class="row-s">پیشرفت همکاران، تأیید کار عملی، تنظیمات</span></span><span class="chev">${ICON.chev}</span></a></li>` : ''}
    </ul>

    <h2>گواهی‌ها</h2>
    ${p.certificates.length
      ? html`<div class="grid2">${p.certificates.map((c) => html`<div class="cert"><span class="stamp">گواهی</span><h3 style="margin-top:8px">${courseTitle(c.courseId)}</h3><p class="code">${c.code}</p><p class="small">نمره ${fa(c.score)}٪ · ${faDate(c.issuedAt)}</p></div>`)}</div>`
      : html`<p class="small">هنوز گواهی ندارید. هر دوره با آزمون پایانی گواهی می‌دهد.</p>`}

    <h2>کارهای عملی</h2>
    <ul class="rows">${tasks.map((t) => html`<li><a class="row" href="/lesson/${t.lessonId}#${t.id}" data-link><span class="row-main"><span class="row-t">${t.title}</span><span class="row-s">${courseTitle(t.courseId)}${fl.get(t.id)?.reviewerNote ? ` · ${fl.get(t.id).reviewerNote}` : ''}</span></span>${statusStamp(fl.get(t.id)?.status)}</a></li>`)}</ul>

    <h2>امنیت حساب</h2>
    <form class="tray form cols" id="pin">
      <label class="field">رمز فعلی<input class="input ltr" name="current" type="password" inputmode="numeric" maxlength="8" autocomplete="current-password"></label>
      <label class="field">رمز جدید (۴ تا ۸ رقم)<input class="input ltr" name="next" type="password" inputmode="numeric" maxlength="8" autocomplete="new-password"></label>
      <div style="align-self:end"><button class="btn block" type="submit">تغییر رمز</button></div>
    </form>
    <div class="actions"><button class="btn ghost" data-act="logout">خروج از این دستگاه</button><button class="btn danger" data-act="logoutAll">خروج از همه دستگاه‌ها</button></div>`);

  $('#pin', root).addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const btn = f.querySelector('button');
    busy(btn, true);
    try {
      const r = await api('/api/auth/pin', { method: 'POST', body: { current: f.current.value, next: f.next.value } });
      auth.token = r.token;
      f.reset();
      toast('رمز تغییر کرد', 'ok');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      busy(btn, false);
    }
  });
  const out = () => {
    auth.token = null;
    store.me = null;
    store.content = null;
    navigate('/login', { replace: true });
  };
  actions(root, {
    logout: out,
    logoutAll: async () => {
      if (!confirm('از همه دستگاه‌ها خارج شوید؟')) return;
      await api('/api/auth/logout-all', { method: 'POST' }).catch(() => {});
      out();
    },
  });
}
