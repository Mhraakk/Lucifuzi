// درخواست‌های حساب (spec 0011): the shop's invite code (link + QR) and the requests colleagues sent from the sign-in
// page. Approving creates the account with the same rules as the vendor console; the password is minted on the
// requester's own device at pickup, or here with «صدور رمز» when that device is not at hand.
import { html, raw, api, fa, $, store, toast, busy, render, ROLE_FA } from '../core.mjs';
import { back, faDate, faTime } from '../ui.mjs';
import { qrSvg } from '../qr.mjs';
import { confirmBox } from '../bk.mjs';
import { credentials } from './vendor.mjs';

export async function accessPage(root) {
  if (!store.isAdmin()) return render();
  const owner = store.me?.user?.role === 'owner';
  let S = await api('/api/access/admin');
  const link = () => `${location.origin}/join?code=${S.code}`;
  const roleSel = (r) => html`<select class="input" name="role" aria-label="نقش">${['employee', 'trainer', 'manager', ...(owner ? ['owner'] : [])].map((k) => html`<option value="${k}" ${k === r.role ? 'selected' : ''}>${ROLE_FA[k]}</option>`)}</select>`;
  const draw = () => {
    const pending = S.items.filter((r) => r.status === 'pending'), done = S.items.filter((r) => r.status !== 'pending');
    root.innerHTML = String(html`${back('/staff', 'تیم')}<h1>درخواست‌های حساب</h1>
      <p class="lead">همکار تازه در صفحه ورود با کد فروشگاه درخواست می‌دهد؛ شما نقش و نام کاربری را تعیین و تأیید می‌کنید و رمز روی دستگاه خود او ساخته می‌شود.</p>
      <section class="ac-invite ${S.enabled ? '' : 'off'}">
        <div class="ac-qr">${raw(qrSvg(link(), { size: 148, dark: '#1a140a', light: '#ffffff' }))}</div>
        <div class="ac-code"><small>کد فروشگاه</small><b class="ltr-num" id="acCode">${S.code}</b><span class="small ltr-num ac-link">${link().replace(/^https?:\/\//, '')}</span>
          <div class="actions"><button class="btn small" data-a="copy">کپی لینک</button>${navigator.share ? html`<button class="btn small ghost" data-a="share">ارسال</button>` : ''}<button class="btn small ghost" data-a="regen">کد تازه</button>
          <label class="check ac-switch"><input type="checkbox" data-a="toggle" ${S.enabled ? 'checked' : ''}> پذیرش درخواست</label></div>
          ${S.enabled ? '' : html`<p class="small">درخواست تازه فعلاً پذیرفته نمی‌شود.</p>`}</div>
      </section>
      <h2>در انتظار تأیید ${pending.length ? html`<span class="stamp">${fa(pending.length)}</span>` : ''}</h2>
      ${pending.length
        ? html`<div class="ac-list">${pending.map((r) => html`<form class="tray ac-req" data-id="${r.id}">
            <div class="ac-who"><b>${r.name}</b><span class="small">درخواست ${r.roleName} · ${faDate(r.createdAt)}، ساعت ${faTime(r.createdAt)}</span><span class="small">موبایل: <bdi><a class="ltr-num" href="tel:${r.phone}">${fa(r.phone)}</a></bdi></span>${r.note ? html`<span class="small">«${r.note}»</span>` : ''}${r.hasAccount ? html`<span class="stamp red">این شماره در فروشگاه حساب دارد</span>` : ''}</div>
            <label class="field">نقش${roleSel(r)}</label>
            <label class="field">نام کاربری<input class="input ltr" name="username" value="${r.suggested}" maxlength="32" autocapitalize="none" spellcheck="false" required></label>
            <div class="ac-do"><button class="btn small" type="submit">تأیید و ساخت حساب</button><button class="btn small ghost" type="button" data-a="reject">رد</button></div></form>`)}</div>`
        : html`<p class="small">درخواستی در انتظار نیست.</p>`}
      ${done.length
        ? html`<h2>بررسی‌شده</h2><div class="scrollx" tabindex="0"><table class="table-plain"><thead><tr><th>نام</th><th>نتیجه</th><th>نام کاربری</th><th>رمز</th><th></th></tr></thead><tbody>${done.map(
            (r) => html`<tr><td><b>${r.name}</b><br><span class="small">${faDate(r.decidedAt ?? r.createdAt)}</span></td><td>${r.status === 'approved' ? html`<span class="stamp jade">تأیید شد</span>` : html`<span class="stamp red">رد شد</span>`}</td>
              <td class="ltr-num">${r.grantedUsername ?? '—'}</td><td class="small">${r.status === 'approved' ? (r.picked ? 'تحویل شد' : 'منتظر دریافت روی دستگاه او') : '—'}</td>
              <td>${r.status === 'approved' ? html`<button class="chip" data-a="pw" data-id="${r.id}">صدور رمز و برگه تحویل</button>` : ''}</td></tr>`,
          )}</tbody></table></div>`
        : ''}`);
  };
  const reload = async () => {
    S = await api('/api/access/admin');
    draw();
  };

  root.addEventListener('submit', async (e) => {
    const f = e.target.closest('.ac-req');
    if (!f) return;
    e.preventDefault();
    const btn = $('button[type=submit]', f);
    busy(btn, true);
    try {
      const d = Object.fromEntries(new FormData(f));
      const r = await api(`/api/access/admin/requests/${f.dataset.id}`, { method: 'POST', body: { action: 'approve', role: d.role, username: d.username } });
      toast(`حساب «${r.user.username}» ساخته شد؛ نام کاربری و رمز روی دستگاه ${r.request.name} نمایش داده می‌شود.`, 'ok');
      await reload();
    } catch (err) {
      toast(err.message, 'error');
      busy(btn, false);
    }
  });
  root.addEventListener('change', async (e) => {
    if (e.target.dataset.a !== 'toggle') return;
    try {
      Object.assign(S, await api('/api/access/admin/code', { method: 'POST', body: { enabled: e.target.checked } }));
      draw();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
  root.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-a]');
    if (!b || b.dataset.a === 'toggle') return;
    try {
      if (b.dataset.a === 'copy') {
        await navigator.clipboard.writeText(link()).then(
          () => toast('لینک کپی شد.', 'ok'),
          () => toast('کپی انجام نشد؛ لینک را دستی بردارید.', 'error'),
        );
      } else if (b.dataset.a === 'share') {
        await navigator.share({ title: 'درخواست حساب', text: `کد فروشگاه: ${S.code}`, url: link() }).catch(() => {});
      } else if (b.dataset.a === 'regen') {
        if (!(await confirmBox('کد تازه', 'کد و لینک فعلی دیگر کار نمی‌کنند. درخواست‌های ثبت‌شده می‌مانند.', { ok: 'ساخت کد تازه' }))) return;
        Object.assign(S, await api('/api/access/admin/code', { method: 'POST', body: { regenerate: true } }));
        draw();
      } else if (b.dataset.a === 'reject') {
        const id = b.closest('.ac-req').dataset.id;
        if (!(await confirmBox('رد درخواست', 'درخواست‌دهنده در صفحه خود «رد شد» می‌بیند.', { ok: 'رد درخواست' }))) return;
        await api(`/api/access/admin/requests/${id}`, { method: 'POST', body: { action: 'reject' } });
        await reload();
      } else if (b.dataset.a === 'pw') {
        if (!(await confirmBox('صدور رمز', 'رمز تازه همین حالا ساخته می‌شود و فقط یک بار نمایش داده می‌شود؛ رمز قبلی و تحویل روی دستگاه او باطل می‌شود.', { ok: 'صدور رمز' }))) return;
        const r = await api(`/api/access/admin/requests/${b.dataset.id}`, { method: 'POST', body: { action: 'password' } });
        credentials('رمز حساب همکار', r.shop, r.username, r.password);
        await reload();
      }
    } catch (err) {
      toast(err.message, 'error');
    }
  });
  draw();
}
