// کنسول ارائه‌دهنده (spec 0022): the shops that bought the app, their people and their subscriptions. Nobody gets a
// username or a password: an account is a name, a mobile and a role, and that mobile signs in with an SMS code. Here
// the vendor also connects the Iranian SMS panel that sends those codes, tests it, and opens or closes sign-up.
import { html, raw, api, fa, $, toast, busy, auth, store, ROLE_FA } from '../core.mjs';
import { jd, parseDay, today, addDays, modal, confirmBox, timeFa } from '../bk.mjs';
import { askBox } from '../dialog.mjs';

const PLAN_FA = { base: 'نسخه پایه (سکه، آبشده، شمش، ارز)', full: 'نسخه کامل (با فروش مصنوعات)' };
const daysLeft = (iso) => (iso ? Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today()}T00:00:00Z`)) / 864e5) : null);
const loginUrl = () => `${location.origin}/login`;
const phoneFa = (p) => (p ? fa(`${p.slice(0, 4)} ${p.slice(4, 7)} ${p.slice(7)}`) : '');
const toLatin = (s) => String(s ?? '').replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));

/** What the vendor sends the new customer: where to go and which number signs in. */
function handoff(shop, name, phone, email = '') {
  const text = `${shop}\n${name ? `${name} عزیز، ` : ''}حساب بئاتریس شما آماده است.\nورود: ${loginUrl()}\n${email ? `با ایمیل ${email} وارد شوید؛ کد ورود به همان ایمیل می‌رسد.` : `ایمیل‌تان را برای ما بفرستید تا ثبت شود؛ ورود با ایمیل و کدی است که به همان ایمیل می‌رسد.`} نام کاربری و رمز لازم نیست.`;
  modal(
    String(html`<h3 class="bk-h">فروشگاه ساخته شد</h3><div class="vd-hand"><p class="small">این متن را برای صاحب فروشگاه بفرستید. با همان ایمیل روی گوشی و کامپیوتر وارد می‌شود و همکارانش را خودش در «تیم» با ایمیل و موبایل اضافه می‌کند.</p><pre>${text}</pre></div>
      <div class="actions"><button class="btn" data-copy>کپی متن</button>${navigator.share ? html`<button class="btn ghost" data-share>ارسال</button>` : ''}<button class="btn ghost" data-close>بستن</button></div>`),
    (m) => {
      m.querySelector('[data-copy]').addEventListener('click', () =>
        navigator.clipboard.writeText(text).then(
          () => toast('کپی شد.', 'ok'),
          () => toast('کپی انجام نشد؛ متن را دستی بردارید.', 'error'),
        ),
      );
      m.querySelector('[data-share]')?.addEventListener('click', () => navigator.share({ title: 'حساب بئاتریس', text }).catch(() => {}));
    },
  );
}

export async function vendorPage(root) {
  const S = { items: [], open: null, users: {}, sms: null, test: null };
  root.innerHTML = String(html`<div class="vd">
    <header class="bk-head"><div><h1>کنسول ارائه‌دهنده</h1><p class="small">فروشگاه‌ها، کاربران و اشتراک‌ها. هر کس با ایمیل خودش و کدی که Supabase به همان ایمیل می‌فرستد وارد می‌شود؛ نام کاربری و رمزی صادر نمی‌شود.</p></div>
      <div class="actions"><a class="btn ghost" href="/ops" data-link>عملیات و سلامت سرور</a><button class="btn" data-act="new">+ فروشگاه تازه</button></div></header>
    <section class="tray vd-sms" id="vdMail"><div class="loading"><span></span></div></section>
    <section class="tray vd-sms" id="vdSms"><div class="loading"><span></span></div></section>
    <section class="vd-kpis" id="vdK"></section>
    <section class="vd-list" id="vdL"><div class="loading"><span></span></div></section></div>`);

  /* ---------------- پیامک ورود ---------------- */
  async function loadSms() {
    S.sms = await api('/api/vendor/sms');
    drawMail();
    drawSms();
  }
  /* ---------------- ورود با ایمیل (spec 0034) ---------------- */
  function drawMail() {
    const m = S.sms.email ?? {};
    const state = m.ready
      ? html`<span class="vd-sms-state ok">فعال · Supabase · <bdi dir="ltr">${m.host}</bdi></span>`
      : html`<span class="vd-sms-state warn">${m.error ?? (m.ownerPin ? 'هنوز تنظیم نشده — تا آن موقع فقط شما با ایمیل و رمز متغیرهای سرور وارد می‌شوید' : 'هنوز تنظیم نشده — BEATRIS_SUPABASE_URL و BEATRIS_SUPABASE_KEY را در متغیرهای سرور بگذارید')}</span>`;
    $('#vdMail', root).innerHTML = String(html`<div class="vd-sms-head"><h2 class="bk-h" style="margin:0">ورود با ایمیل</h2>${state}</div>
      <p class="small">کد ${fa(m.len ?? 6)} رقمی و پیوند ورود را Supabase به ایمیل هر کاربر می‌فرستد. ${m.sent24h || m.failed24h ? `۲۴ ساعت گذشته: ${fa(m.sent24h)} ایمیل رفت${m.failed24h ? `، ${fa(m.failed24h)} ناموفق` : ''}.` : ''}</p>
      ${m.lastError ? html`<p class="small vd-sms-out bad">آخرین خطا (${jd(m.lastError.at.slice(0, 10))} ${timeFa(m.lastError.at)}): ${m.lastError.error}</p>` : ''}
      <details class="small"><summary>تنظیم یک‌باره در داشبورد Supabase</summary><ol>
        <li>Authentication → Emails → Templates: در «Magic Link» و «Confirm signup» عبارت <code dir="ltr">{{ .Token }}</code> را بگذارید تا کد هم در ایمیل بیاید.</li>
        <li>Authentication → URL Configuration: Site URL را <code dir="ltr">${location.origin}</code> بگذارید تا پیوند ایمیل به همین‌جا برگردد.</li>
        <li>Authentication → Emails → SMTP Settings: ایمیل پیش‌فرض Supabase فقط به اعضای تیم پروژه و چند نامه در ساعت می‌رسد؛ برای همکاران، SMTP اختصاصی (مثلاً Resend یا Gmail) را وصل کنید.</li></ol></details>`);
  }
  function drawSms() {
    const v = S.sms;
    const c = v.config;
    const prov = v.providers.find((p) => p.id === (S.pick ?? c.provider)) ?? null;
    const st = v.stats;
    const state = v.ready
      ? html`<span class="vd-sms-state ok">فعال · ${c.label}${c.fromEnv ? ' · از متغیرهای سرور' : ''}${c.relay ? ' · از راه واسط' : ''}</span>`
      : html`<span class="vd-sms-state warn">${v.envError ?? (v.ownerPin ? 'هنوز تنظیم نشده — تا آن موقع فقط شما با رمز متغیرهای سرور وارد می‌شوید' : v.prod ? 'هنوز تنظیم نشده — کسی جز حساب‌های نمایشی وارد نمی‌شود' : 'تنظیم نشده — محیط توسعه: کد روی صفحه ورود نشان داده می‌شود')}</span>`;
    const field = (k, type = 'text') =>
      prov?.fields[k]
        ? html`<label class="field">${prov.fields[k]}<input class="input ltr" name="${k}" type="${type}" autocomplete="off" spellcheck="false" value="${type === 'password' ? '' : k === 'param' ? (c.provider === prov.id && c.param) || prov.param : (c.provider === prov.id ? c[k] : '') ?? ''}" placeholder="${type === 'password' && c.hasKey && c.provider === prov.id ? '•••••• (ذخیره‌شده؛ خالی = همان)' : k === 'param' ? prov.param : k === 'sender' ? '+983000505' : ''}"></label>`
        : '';
    $('#vdSms', root).innerHTML = String(html`<div class="vd-sms-head"><h2 class="bk-h" style="margin:0">پیامک ورود</h2>${state}</div>
      <p class="small">کد ورود از پنل پیامک خودتان می‌رود. ${st.sent24h || st.failed24h ? `۲۴ ساعت گذشته: ${fa(st.sent24h)} پیامک رفت${st.failed24h ? `، ${fa(st.failed24h)} ناموفق` : ''}.` : ''}</p>
      ${st.lastError ? html`<p class="small vd-sms-out bad">آخرین خطا (${jd(st.lastError.at.slice(0, 10))} ${timeFa(st.lastError.at)}): ${st.lastError.error}</p>` : ''}
      ${c.fromEnv
        ? html`<p class="small">سرویس از متغیرهای سرور خوانده می‌شود (${c.label || 'خاموش'})؛ برای تغییر، همان‌جا عوض کنید: <span class="ltr-num">BEATRIS_SMS_PROVIDER، BEATRIS_SMS_API_KEY، BEATRIS_SMS_TEMPLATE</span>.</p>`
        : html`<form class="vd-sms-form" id="smsF" autocomplete="off">
          <label class="field">سرویس<select class="input" name="provider"><option value="">— خاموش —</option>${v.providers.map((p) => html`<option value="${p.id}" ${prov?.id === p.id ? 'selected' : ''}>${p.label}</option>`)}</select></label>
          ${prov?.need.includes('username') ? field('username') : ''}${field('key', 'password')}${field('template')}${prov?.need.includes('sender') ? field('sender') : ''}${prov?.param ? field('param') : ''}
          ${prov ? html`<p class="small vd-sms-wide">${prov.hint}</p>` : ''}
          <div class="actions vd-sms-wide"><button class="btn small" type="submit">ذخیره</button></div></form>`}
      ${v.ready
        ? html`<form class="vd-sms-test" id="smsT"><label class="field">پیامک آزمایشی به<input class="input ltr" name="phone" inputmode="tel" value="${fa(store.me?.user?.phone ?? '')}" placeholder="۰۹۱۲…"></label><button class="btn small ghost" type="submit">ارسال پیامک آزمایشی</button></form>`
        : ''}
      ${S.test ? html`<p class="small vd-sms-out ${S.test.ok ? 'good' : 'bad'}">${S.test.ok ? `رسید ✓ ${S.test.provider} پیامک را پذیرفت${S.test.id ? ` (شناسه ${S.test.id})` : ''} · ${fa(S.test.ms)} میلی‌ثانیه` : S.test.error}${!S.test.ok && S.test.reach === false ? ' — بسیاری از پنل‌های ایرانی به سرورهای بیرون از ایران پاسخ نمی‌دهند. در آزمایش ما از بیرون ایران، SMS.ir پاسخ داد؛ یا BEATRIS_SMS_BASE_URL را روی یک واسط داخل ایران بگذارید.' : ''}</p>` : ''}
      <form class="vd-sms-form" id="signF"><label class="check vd-sms-wide"><input type="checkbox" name="open" ${v.signup.open ? 'checked' : ''}> ثبت‌نام آزاد: هر ایمیل یا موبایل تازه پس از کد ورود، فروشگاه خودش را بسازد</label>
        <label class="field">نسخه فروشگاه‌های تازه<select class="input" name="plan">${Object.entries(PLAN_FA).map(([k, l]) => html`<option value="${k}" ${v.signup.plan === k ? 'selected' : ''}>${l}</option>`)}</select></label>
        <label class="field">روزهای آزمایشی (۰ = بی‌پایان)<input class="input ltr" name="trialDays" inputmode="numeric" value="${fa(v.signup.trialDays)}"></label>
        <div class="actions"><button class="btn small ghost" type="submit">ذخیره ثبت‌نام</button></div></form>`);
  }

  /* ---------------- shops ---------------- */
  async function load() {
    S.items = (await api('/api/vendor/tenants')).items;
    draw();
  }
  function draw() {
    const shops = S.items.filter((t) => t.id !== 'main');
    const soon = shops.filter((t) => t.status === 'active' && t.expiresAt && daysLeft(t.expiresAt) >= 0 && daysLeft(t.expiresAt) <= 14).length;
    const noPhone = S.items.reduce((s, t) => s + (t.stats.noPhone ?? 0), 0);
    $('#vdK', root).innerHTML = String(html`<div class="vd-k"><small>فروشگاه‌ها</small><b>${fa(shops.length)}</b></div><div class="vd-k"><small>فعال</small><b>${fa(shops.filter((t) => t.status === 'active' && !t.expired).length)}</b></div><div class="vd-k ${soon ? 'warn' : ''}"><small>پایان اشتراک تا ۱۴ روز</small><b>${fa(soon)}</b></div><div class="vd-k"><small>کاربران فعال</small><b>${fa(S.items.reduce((s, t) => s + (t.stats.users ?? 0), 0))}</b></div>${noPhone ? html`<div class="vd-k warn"><small>کاربر بدون موبایل</small><b>${fa(noPhone)}</b></div>` : ''}`);
    $('#vdL', root).innerHTML = S.items.map((t) => String(shopCard(t))).join('');
    if (S.open) drawUsers(S.open);
  }
  function shopCard(t) {
    const d = daysLeft(t.expiresAt);
    const state = t.status !== 'active' ? ['off', 'غیرفعال'] : t.expired ? ['bad', 'اشتراک تمام شده'] : d != null && d <= 14 ? ['warn', `${fa(d)} روز تا پایان`] : ['ok', 'فعال'];
    return html`<article class="tray vd-shop" data-id="${t.id}">
      <header><div><h3>${t.name}</h3><p class="small">${PLAN_FA[t.plan] ?? t.plan}${t.contact ? ` · ${fa(t.contact)}` : ''}${t.selfMade ? ' · با ثبت‌نام آزاد' : ''}</p></div><span class="vd-st ${state[0]}">${state[1]}</span></header>
      <dl class="vd-stats"><div><dt>کاربران</dt><dd>${fa(t.stats.users ?? 0)}${t.maxUsers ? ` از ${fa(t.maxUsers)}` : ' · نامحدود'}</dd></div><div><dt>اسناد قطعی</dt><dd>${fa(t.stats.docs ?? 0)}</dd></div><div><dt>مشتریان</dt><dd>${fa(t.stats.parties ?? 0)}</dd></div><div><dt>پایان اشتراک</dt><dd>${t.expiresAt ? jd(t.expiresAt) : 'نامحدود'}</dd></div><div><dt>آخرین ورود</dt><dd>${t.stats.lastLogin ? `${jd(t.stats.lastLogin.slice(0, 10))} ${timeFa(t.stats.lastLogin)}` : '—'}</dd></div></dl>
      ${t.stats.noPhone ? html`<p class="vd-nophone">${fa(t.stats.noPhone)} کاربر هنوز موبایل ندارد؛ با ایمیل وارد می‌شود، ولی ورود پیامکی ندارد. در «کاربران» برایش موبایل بنویسید.</p>` : ''}
      ${t.note ? html`<p class="small vd-note">${t.note}</p>` : ''}
      <footer class="vd-act">
        <button class="chip" data-act="users" data-id="${t.id}" aria-expanded="${S.open === t.id}">کاربران</button>
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
    box.innerHTML = String(html`<div class="scrollx"><table class="table-plain vd-ut"><thead><tr><th>نام</th><th>ایمیل (ورود)</th><th>موبایل</th><th>نقش</th><th>آخرین ورود</th><th>دستگاه</th><th></th></tr></thead><tbody>${list.map(
      (u) => html`<tr class="${u.active ? '' : 'off'}"><td>${u.name}</td><td>${u.email ? html`<bdi dir="ltr">${u.email}</bdi>` : html`<span class="vd-nophone">بدون ایمیل — نمی‌تواند وارد شود</span>`}</td><td class="ltr-num">${u.noPhone ? html`<span class="vd-nophone">${u.email ? 'بدون موبایل' : 'بدون موبایل — نمی‌تواند وارد شود'}</span>` : phoneFa(u.phone)}</td><td>${ROLE_FA[u.role]}</td><td>${u.lastLoginAt ? `${jd(u.lastLoginAt.slice(0, 10))} ${timeFa(u.lastLoginAt)}` : 'هنوز وارد نشده'}</td><td>${u.lastDevice || '—'}</td>
        <td class="vd-uact"><button class="chip" data-act="email" data-t="${id}" data-u="${u.id}">${u.email ? 'ایمیل' : 'افزودن ایمیل'}</button><button class="chip" data-act="phone" data-t="${id}" data-u="${u.id}">${u.noPhone ? 'افزودن موبایل' : 'موبایل'}</button><button class="chip" data-act="out" data-t="${id}" data-u="${u.id}">خروج از همه دستگاه‌ها</button><button class="chip ${u.active ? 'danger' : ''}" data-act="uact" data-t="${id}" data-u="${u.id}" data-on="${u.active ? 0 : 1}">${u.active ? 'غیرفعال' : 'فعال'}</button></td></tr>`,
    )}</tbody></table></div>
      <form class="vd-add" data-t="${id}"><b>کاربر تازه</b><input class="input" name="name" placeholder="نام و نام خانوادگی" required><input class="input ltr" name="email" type="email" inputmode="email" autocapitalize="off" spellcheck="false" placeholder="ایمیل (ورود)" required><input class="input ltr" name="phone" inputmode="tel" placeholder="موبایل ۰۹…" required><select class="input" name="role">${['employee', 'manager', 'owner', 'trainer'].map((r) => html`<option value="${r}">${ROLE_FA[r]}</option>`)}</select><button class="btn small">افزودن</button></form>`);
  }
  function shopForm(t = null) {
    modal(
      String(html`<h3 class="bk-h">${t ? `ویرایش ${t.name}` : 'فروشگاه تازه'}</h3><form class="form vd-form" id="sf">
        <label class="field">نام فروشگاه<input class="input" name="name" value="${t?.name ?? ''}" required></label>
        <label class="field">نسخه<select class="input" name="plan">${Object.entries(PLAN_FA).map(([k, l]) => html`<option value="${k}" ${t?.plan === k ? 'selected' : ''}>${l}</option>`)}</select></label>
        ${t ? '' : html`<label class="field">نام مدیر فروشگاه<input class="input" name="ownerName" placeholder="مثلاً حسن کریمی"></label>
        <label class="field">ایمیل مدیر (با همین ایمیل وارد می‌شود)<input class="input ltr" name="ownerEmail" type="email" inputmode="email" autocapitalize="off" spellcheck="false" placeholder="name@gmail.com" required></label>
        <label class="field">موبایل مدیر<input class="input ltr" name="phone" inputmode="tel" placeholder="۰۹۱۲…" required></label>`}
        <label class="field">پایان اشتراک (خالی = نامحدود)<input class="input ltr" name="expires" placeholder="${jd(addDays(today(), 365))}" value="${t?.expiresAt ? jd(t.expiresAt) : ''}"></label>
        <label class="field">سقف کاربران (۰ = نامحدود)<input class="input ltr" name="maxUsers" inputmode="numeric" value="${fa(t?.maxUsers ?? 0)}"></label>
        <label class="field">تماس<input class="input" name="contact" value="${t?.contact ?? ''}"></label>
        <label class="field">یادداشت<input class="input" name="note" value="${t?.note ?? ''}"></label>
        <p class="err" id="sfe" role="alert"></p>
        <div class="actions"><button class="btn">${t ? 'ذخیره' : 'ساخت فروشگاه'}</button><button class="btn ghost" type="button" data-close>انصراف</button></div></form>`),
      (m, close) =>
        m.querySelector('#sf').addEventListener('submit', async (e) => {
          e.preventDefault();
          const f = Object.fromEntries(new FormData(e.target));
          const exp = f.expires ? parseDay(f.expires) : null;
          if (f.expires && !exp) return (m.querySelector('#sfe').textContent = 'تاریخ را به شکل ۱۴۰۵/۰۷/۰۱ وارد کنید.');
          const body = { name: f.name, plan: f.plan, expiresAt: exp ?? (t ? '' : null), maxUsers: Number(toLatin(f.maxUsers)) || 0, contact: f.contact, note: f.note };
          try {
            if (t) {
              await api(`/api/vendor/tenants/${t.id}`, { method: 'PATCH', body });
              close();
              toast('ذخیره شد.', 'ok');
            } else {
              const r = await api('/api/vendor/tenants', { method: 'POST', body: { ...body, ownerName: f.ownerName, phone: f.phone, ownerEmail: f.ownerEmail } });
              close();
              handoff(r.tenant.name, r.owner.name, r.owner.phone, r.owner.email);
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
      if (act === 'email') {
        const u = S.users[tn]?.find((x) => x.id === uid);
        const next = await askBox('ایمیل', 'این ایمیل کلید ورود همین حساب است؛ کد ورود به آن می‌رسد. با عوض شدنش، دستگاه‌هایی که با ایمیل قبلی وارد شده‌اند خارج می‌شوند. خالی = برداشتن ایمیل.', { label: 'ایمیل', value: u?.email ?? '', placeholder: 'name@gmail.com', dir: 'ltr', ok: 'ثبت' });
        if (next === null) return;
        const r = await api(`/api/vendor/tenants/${tn}/users/${uid}`, { method: 'PATCH', body: { email: next } });
        if (r.token) auth.token = r.token; // your own email: this device stays signed in
        delete S.users[tn];
        toast(next.trim() ? 'ایمیل ثبت شد.' : 'ایمیل برداشته شد.', 'ok');
        return load();
      }
      if (act === 'phone') {
        const u = S.users[tn]?.find((x) => x.id === uid);
        const next = await askBox('موبایل', 'موبایل شناسه این حساب در فروشگاه است؛ با عوض شدنش، دستگاه‌هایی که با شماره قبلی وارد شده‌اند خارج می‌شوند.', { label: 'شماره موبایل', value: u?.phone ? fa(u.phone) : '', placeholder: '۰۹۱۲…', dir: 'ltr', ok: 'ثبت' });
        if (next === null) return;
        const r = await api(`/api/vendor/tenants/${tn}/users/${uid}`, { method: 'PATCH', body: { phone: next } });
        if (r.token) auth.token = r.token; // your own number: this device stays signed in
        delete S.users[tn];
        toast('موبایل ثبت شد.', 'ok');
        return load();
      }
      if (act === 'out') {
        await api(`/api/vendor/tenants/${tn}/users/${uid}`, { method: 'PATCH', body: { logoutAll: true } });
        return toast('از همه دستگاه‌ها خارج شد.', 'ok');
      }
      if (act === 'uact') {
        await api(`/api/vendor/tenants/${tn}/users/${uid}`, { method: 'PATCH', body: { active: b.dataset.on === '1' } });
        delete S.users[tn];
        return load();
      }
    } catch (err) {
      toast(err.message, 'error');
    }
  });
  root.addEventListener('change', (e) => {
    if (e.target.name === 'provider' && e.target.closest('#smsF')) {
      S.pick = e.target.value || null;
      drawSms();
    }
  });
  root.addEventListener('submit', async (e) => {
    const f = e.target;
    if (f.id === 'smsF' || f.id === 'smsT' || f.id === 'signF') e.preventDefault();
    const btn = f.querySelector('button[type=submit], button:not([type])');
    try {
      if (f.id === 'smsF') {
        busy(btn, true);
        const d = Object.fromEntries(new FormData(f));
        S.sms = { ...S.sms, ...(await api('/api/vendor/sms', { method: 'PUT', body: d })) };
        S.pick = null;
        S.test = null;
        toast(d.provider ? 'سرویس پیامک ذخیره شد؛ با «پیامک آزمایشی» امتحانش کنید.' : 'پیامک ورود خاموش شد.', 'ok');
        return drawSms();
      }
      if (f.id === 'smsT') {
        busy(btn, true);
        S.test = await api('/api/vendor/sms/test', { method: 'POST', body: { phone: toLatin(f.phone.value) } });
        return loadSms();
      }
      if (f.id === 'signF') {
        busy(btn, true);
        const r = await api('/api/vendor/signup', { method: 'PUT', body: { open: f.open.checked, plan: f.plan.value, trialDays: Number(toLatin(f.trialDays.value)) || 0 } });
        S.sms.signup = r.signup;
        toast(r.signup.open ? 'ثبت‌نام آزاد است.' : 'ثبت‌نام بسته شد؛ فقط حساب‌هایی که ثبت کرده‌اید وارد می‌شوند.', 'ok');
        return drawSms();
      }
      const add = f.closest('.vd-add');
      if (!add) return;
      e.preventDefault();
      const d = Object.fromEntries(new FormData(add));
      await api(`/api/vendor/tenants/${add.dataset.t}/users`, { method: 'POST', body: d });
      delete S.users[add.dataset.t];
      toast(`${d.name} اضافه شد؛ با ایمیل خودش و کد ایمیل‌شده وارد می‌شود.`, 'ok');
      await load();
    } catch (err) {
      toast(err.message, 'error');
      busy(btn, false);
    }
  });
  await Promise.all([load(), loadSms()]);
}
