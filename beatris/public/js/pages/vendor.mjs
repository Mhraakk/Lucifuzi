// کنسول ارائه‌دهنده — the vendor issues every shop and every account: username and password are created here only,
// shown once, and work the same on a phone and on a desktop. Suspend, extend the subscription, reset a password,
// sign a user out of every device.
import { html, raw, api, fa, $, $$, toast, ROLE_FA } from '../core.mjs';
import { jd, parseDay, today, addDays, modal, confirmBox, timeFa } from '../bk.mjs';

const PLAN_FA = { base: 'نسخه پایه (سکه، آبشده، شمش، ارز)', full: 'نسخه کامل (با فروش مصنوعات)' };
const daysLeft = (iso) => (iso ? Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today()}T00:00:00Z`)) / 864e5) : null);
const loginUrl = () => `${location.origin}/login`;

export async function vendorPage(root) {
  const S = { items: [], open: null, users: {} };
  root.innerHTML = String(html`<div class="vd">
    <header class="bk-head"><div><h1>کنسول ارائه‌دهنده</h1><p class="small">فروشگاه‌های خریدار، حساب‌های کاربری و اشتراک‌ها. نام کاربری و رمز فقط از همین‌جا صادر می‌شود.</p></div>
      <button class="btn" data-act="new">+ فروشگاه تازه</button></header>
    <section class="vd-kpis" id="vdK"></section>
    <section class="vd-list" id="vdL"><div class="loading"><span></span></div></section></div>`);

  async function load() {
    S.items = (await api('/api/vendor/tenants')).items;
    draw();
  }
  function draw() {
    const shops = S.items.filter((t) => t.id !== 'main');
    const soon = shops.filter((t) => t.status === 'active' && t.expiresAt && daysLeft(t.expiresAt) >= 0 && daysLeft(t.expiresAt) <= 14).length;
    $('#vdK', root).innerHTML = String(html`<div class="vd-k"><small>فروشگاه‌ها</small><b>${fa(shops.length)}</b></div><div class="vd-k"><small>فعال</small><b>${fa(shops.filter((t) => t.status === 'active' && !t.expired).length)}</b></div><div class="vd-k ${soon ? 'warn' : ''}"><small>پایان اشتراک تا ۱۴ روز</small><b>${fa(soon)}</b></div><div class="vd-k"><small>کاربران</small><b>${fa(S.items.reduce((s, t) => s + (t.stats.users ?? 0), 0))}</b></div>`);
    $('#vdL', root).innerHTML = S.items.map((t) => String(shopCard(t))).join('');
    if (S.open) drawUsers(S.open);
  }
  function shopCard(t) {
    const d = daysLeft(t.expiresAt);
    const state = t.status !== 'active' ? ['off', 'غیرفعال'] : t.expired ? ['bad', 'اشتراک تمام شده'] : d != null && d <= 14 ? ['warn', `${fa(d)} روز تا پایان`] : ['ok', 'فعال'];
    return html`<article class="tray vd-shop" data-id="${t.id}">
      <header><div><h3>${t.name}</h3><p class="small">${PLAN_FA[t.plan] ?? t.plan}${t.contact ? ` · ${t.contact}` : ''}</p></div><span class="vd-st ${state[0]}">${state[1]}</span></header>
      <dl class="vd-stats"><div><dt>کاربران</dt><dd>${fa(t.stats.users ?? 0)} از ${fa(t.maxUsers)}</dd></div><div><dt>اسناد قطعی</dt><dd>${fa(t.stats.docs ?? 0)}</dd></div><div><dt>مشتریان</dt><dd>${fa(t.stats.parties ?? 0)}</dd></div><div><dt>پایان اشتراک</dt><dd>${t.expiresAt ? jd(t.expiresAt) : 'نامحدود'}</dd></div><div><dt>آخرین ورود</dt><dd>${t.stats.lastLogin ? `${jd(t.stats.lastLogin.slice(0, 10))} ${timeFa(t.stats.lastLogin)}` : '—'}</dd></div></dl>
      ${t.note ? html`<p class="small vd-note">${t.note}</p>` : ''}
      <footer class="vd-act">
        <button class="chip" data-act="users" data-id="${t.id}" aria-expanded="${S.open === t.id}">کاربران و رمزها</button>
        ${t.id !== 'main' ? html`<button class="chip" data-act="extend" data-id="${t.id}" data-days="30">+۳۰ روز</button><button class="chip" data-act="extend" data-id="${t.id}" data-days="365">+۱ سال</button>
        <button class="chip" data-act="edit" data-id="${t.id}">ویرایش</button>
        <button class="chip ${t.status === 'active' ? 'danger' : ''}" data-act="toggle" data-id="${t.id}">${t.status === 'active' ? 'تعلیق' : 'فعال‌سازی'}</button>` : ''}
      </footer>
      <div class="vd-users" id="u-${t.id}" ${S.open === t.id ? '' : raw('hidden')}></div></article>`;
  }
  async function drawUsers(id) {
    const box = $(`#u-${id}`, root);
    if (!box) return;
    box.hidden = false;
    const list = S.users[id] ?? (S.users[id] = (await api(`/api/vendor/tenants/${id}/users`)).items);
    box.innerHTML = String(html`<div class="scrollx"><table class="table-plain vd-ut"><thead><tr><th>نام</th><th>نام کاربری</th><th>نقش</th><th>آخرین ورود</th><th>دستگاه</th><th></th></tr></thead><tbody>${list.map(
      (u) => html`<tr class="${u.active ? '' : 'off'}"><td>${u.name}</td><td class="ltr-num">${u.username ?? (u.phone ? fa(u.phone) : '—')}</td><td>${ROLE_FA[u.role]}</td><td>${u.lastLoginAt ? `${jd(u.lastLoginAt.slice(0, 10))} ${timeFa(u.lastLoginAt)}` : 'هنوز وارد نشده'}</td><td>${u.lastDevice || '—'}</td>
        <td class="vd-uact"><button class="chip" data-act="reset" data-t="${id}" data-u="${u.id}">رمز تازه</button>${u.username ? '' : html`<button class="chip" data-act="uname" data-t="${id}" data-u="${u.id}">نام کاربری</button>`}<button class="chip" data-act="out" data-t="${id}" data-u="${u.id}">خروج از همه دستگاه‌ها</button><button class="chip ${u.active ? 'danger' : ''}" data-act="uact" data-t="${id}" data-u="${u.id}" data-on="${u.active ? 0 : 1}">${u.active ? 'غیرفعال' : 'فعال'}</button></td></tr>`,
    )}</tbody></table></div>
      <form class="vd-add" data-t="${id}"><b>کاربر تازه</b><input class="input" name="name" placeholder="نام و نام خانوادگی" required><input class="input ltr" name="username" placeholder="username" autocapitalize="none" required><select class="input" name="role">${['employee', 'manager', 'owner', 'trainer'].map((r) => html`<option value="${r}">${ROLE_FA[r]}</option>`)}</select><input class="input ltr" name="password" placeholder="رمز (خالی = ساخت خودکار)" autocomplete="new-password"><button class="btn small">ساخت حساب</button></form>`);
  }
  /** Credentials are shown once, ready to copy or print for the customer. */
  function credentials(title, shop, user, password) {
    const text = `${shop}\nنشانی ورود: ${loginUrl()}\nنام کاربری: ${user}\nرمز: ${password}`;
    modal(
      String(html`<h3 class="bk-h">${title}</h3><p class="small">این رمز فقط همین یک بار نمایش داده می‌شود. آن را به صاحب حساب بدهید؛ با همین نام کاربری و رمز روی گوشی و کامپیوتر وارد می‌شود.</p>
        <div class="vd-cred" id="cred"><div><small>فروشگاه</small><b>${shop}</b></div><div><small>نشانی ورود</small><b class="ltr-num">${loginUrl()}</b></div><div><small>نام کاربری</small><b class="ltr-num">${user}</b></div><div><small>رمز</small><b class="ltr-num vd-pw">${password}</b></div></div>
        <div class="actions"><button class="btn" data-copy>کپی</button><button class="btn ghost" data-print>چاپ برگه تحویل</button><button class="btn ghost" data-close>بستن</button></div>`),
      (m) => {
        m.querySelector('[data-copy]').addEventListener('click', async () => {
          try {
            await navigator.clipboard.writeText(text);
            toast('کپی شد.', 'ok');
          } catch {
            toast('کپی انجام نشد؛ متن را دستی بردارید.', 'error');
          }
        });
        m.querySelector('[data-print]').addEventListener('click', () => {
          const w = window.open('', '_blank', 'width=720,height=900');
          if (!w) return toast('پنجره چاپ باز نشد.', 'error');
          w.document.write(`<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8"><title>برگه تحویل حساب</title><style>body{font:16px/2 Tahoma,sans-serif;padding:40px;color:#111}h1{font-size:22px}table{border-collapse:collapse;width:100%}td{border:1px solid #999;padding:8px 12px}td:first-child{width:30%;background:#f4f1ea}.l{direction:ltr;text-align:left;font-family:monospace;font-size:18px}</style><h1>برگه تحویل حساب نرم‌افزار</h1><table><tr><td>فروشگاه</td><td>${html`${shop}`}</td></tr><tr><td>نشانی ورود</td><td class="l">${loginUrl()}</td></tr><tr><td>نام کاربری</td><td class="l">${html`${user}`}</td></tr><tr><td>رمز</td><td class="l">${html`${password}`}</td></tr><tr><td>تاریخ</td><td>${jd(today())}</td></tr></table><p>با همین حساب روی گوشی، تبلت و کامپیوتر وارد شوید. رمز را به کسی ندهید.</p><script>print()</script>`);
          w.document.close();
        });
      },
    );
  }
  function shopForm(t = null) {
    modal(
      String(html`<h3 class="bk-h">${t ? `ویرایش ${t.name}` : 'فروشگاه تازه'}</h3><form class="form vd-form" id="sf">
        <label class="field">نام فروشگاه<input class="input" name="name" value="${t?.name ?? ''}" required></label>
        <label class="field">نسخه<select class="input" name="plan">${Object.entries(PLAN_FA).map(([k, l]) => html`<option value="${k}" ${t?.plan === k ? 'selected' : ''}>${l}</option>`)}</select></label>
        ${t ? '' : html`<label class="field">نام مدیر فروشگاه<input class="input" name="ownerName" placeholder="مثلاً حسن کریمی"></label>
        <label class="field">نام کاربری مدیر<input class="input ltr" name="username" autocapitalize="none" placeholder="hassan.karimi" required></label>
        <label class="field">رمز مدیر (خالی = ساخت خودکار ۱۰ نویسه‌ای)<input class="input ltr" name="password" autocomplete="new-password"></label>
        <label class="field">موبایل مدیر (اختیاری)<input class="input ltr" name="phone" inputmode="tel"></label>`}
        <label class="field">پایان اشتراک (خالی = نامحدود)<input class="input ltr" name="expires" placeholder="${jd(addDays(today(), 365))}" value="${t?.expiresAt ? jd(t.expiresAt) : ''}"></label>
        <label class="field">سقف کاربران<input class="input ltr" name="maxUsers" inputmode="numeric" value="${t?.maxUsers ?? 10}"></label>
        <label class="field">تماس<input class="input" name="contact" value="${t?.contact ?? ''}"></label>
        <label class="field">یادداشت<input class="input" name="note" value="${t?.note ?? ''}"></label>
        <label class="check"><input type="checkbox" name="allowPw" ${t?.allowPasswordChange ? 'checked' : ''}> کاربران این فروشگاه بتوانند رمز خود را عوض کنند</label>
        <p class="err" id="sfe" role="alert"></p>
        <div class="actions"><button class="btn">${t ? 'ذخیره' : 'ساخت فروشگاه و حساب مدیر'}</button><button class="btn ghost" type="button" data-close>انصراف</button></div></form>`),
      (m, close) =>
        m.querySelector('#sf').addEventListener('submit', async (e) => {
          e.preventDefault();
          const f = Object.fromEntries(new FormData(e.target));
          const exp = f.expires ? parseDay(f.expires) : null;
          if (f.expires && !exp) return (m.querySelector('#sfe').textContent = 'تاریخ را به شکل ۱۴۰۵/۰۷/۰۱ وارد کنید.');
          const body = { name: f.name, plan: f.plan, expiresAt: exp ?? (t ? '' : null), maxUsers: Number(f.maxUsers) || 10, contact: f.contact, note: f.note, allowPasswordChange: !!f.allowPw };
          try {
            if (t) {
              await api(`/api/vendor/tenants/${t.id}`, { method: 'PATCH', body });
              close();
              toast('ذخیره شد.', 'ok');
            } else {
              const r = await api('/api/vendor/tenants', { method: 'POST', body: { ...body, ownerName: f.ownerName, username: f.username, password: f.password || undefined, phone: f.phone } });
              close();
              credentials('فروشگاه ساخته شد', r.tenant.name, r.owner.username, r.password);
            }
            await load();
          } catch (err) {
            m.querySelector('#sfe').textContent = err.message;
          }
        }),
    );
  }

  const byId = (id) => S.items.find((t) => t.id === id);
  root.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    try {
      if (act === 'new') return shopForm();
      if (act === 'edit') return shopForm(byId(b.dataset.id));
      if (act === 'users') {
        S.open = S.open === b.dataset.id ? null : b.dataset.id;
        return draw();
      }
      if (act === 'extend') {
        const t = byId(b.dataset.id);
        const from = t.expiresAt && t.expiresAt > today() ? t.expiresAt : today();
        await api(`/api/vendor/tenants/${t.id}`, { method: 'PATCH', body: { expiresAt: addDays(from, Number(b.dataset.days)) } });
        toast(`اشتراک ${t.name} تا ${jd(addDays(from, Number(b.dataset.days)))} تمدید شد.`, 'ok');
        return load();
      }
      if (act === 'toggle') {
        const t = byId(b.dataset.id);
        const off = t.status === 'active';
        if (off && !(await confirmBox(`تعلیق ${t.name}`, 'همه کاربران این فروشگاه تا فعال‌سازی دوباره نمی‌توانند وارد شوند. داده‌ها دست نمی‌خورد.', { danger: true, ok: 'تعلیق' }))) return;
        await api(`/api/vendor/tenants/${t.id}`, { method: 'PATCH', body: { status: off ? 'suspended' : 'active' } });
        return load();
      }
      const tn = b.dataset.t, uid = b.dataset.u;
      if (act === 'reset') {
        if (!(await confirmBox('رمز تازه', 'رمز فعلی باطل و کاربر از همه دستگاه‌ها خارج می‌شود.', { ok: 'ساخت رمز تازه' }))) return;
        const r = await api(`/api/vendor/tenants/${tn}/users/${uid}`, { method: 'PATCH', body: { resetPassword: true } });
        delete S.users[tn];
        await drawUsers(tn);
        return credentials('رمز تازه', byId(tn).name, r.user.username ?? r.user.phone, r.password);
      }
      if (act === 'uname') {
        modal(String(html`<h3 class="bk-h">نام کاربری</h3><form id="un"><label class="field">نام کاربری تازه<input class="input ltr" name="u" autocapitalize="none" required></label><p class="err" id="une"></p><div class="actions"><button class="btn">ثبت</button><button class="btn ghost" type="button" data-close>انصراف</button></div></form>`), (m, close) =>
          m.querySelector('#un').addEventListener('submit', async (ev) => {
            ev.preventDefault();
            try {
              await api(`/api/vendor/tenants/${tn}/users/${uid}`, { method: 'PATCH', body: { username: new FormData(ev.target).get('u') } });
              close();
              delete S.users[tn];
              drawUsers(tn);
            } catch (err) {
              m.querySelector('#une').textContent = err.message;
            }
          }),
        );
        return;
      }
      if (act === 'out') {
        await api(`/api/vendor/tenants/${tn}/users/${uid}`, { method: 'PATCH', body: { logoutAll: true } });
        return toast('از همه دستگاه‌ها خارج شد.', 'ok');
      }
      if (act === 'uact') {
        await api(`/api/vendor/tenants/${tn}/users/${uid}`, { method: 'PATCH', body: { active: b.dataset.on === '1' } });
        delete S.users[tn];
        return drawUsers(tn);
      }
    } catch (err) {
      toast(err.message, 'error');
    }
  });
  root.addEventListener('submit', async (e) => {
    const f = e.target.closest('.vd-add');
    if (!f) return;
    e.preventDefault();
    const d = Object.fromEntries(new FormData(f));
    try {
      const r = await api(`/api/vendor/tenants/${f.dataset.t}/users`, { method: 'POST', body: { ...d, password: d.password || undefined } });
      delete S.users[f.dataset.t];
      await load();
      credentials('حساب ساخته شد', byId(f.dataset.t).name, r.user.username, r.password);
    } catch (err) {
      toast(err.message, 'error');
    }
  });
  await load();
}
