// درخواست حساب (spec 0011): a colleague asks with the shop's invite code; the shop's owner or manager approves inside
// the app; then this same device shows the username and a password minted at that moment, once. The device keeps only
// a random ticket (the server stores its hash).
import { html, api, $, busy, navigate, store } from '../core.mjs';
import { brandMark } from '../ui.mjs';
import { morphLabel } from '../light.mjs';

const KEY = 'beatris.join';
const ROLES = [
  ['employee', 'فروشنده'],
  ['trainer', 'مربی'],
  ['manager', 'مدیر'],
];
export const joinTicket = {
  get() {
    try {
      return JSON.parse(localStorage.getItem(KEY) || 'null');
    } catch {
      return null;
    }
  },
  set(v) {
    try {
      v ? localStorage.setItem(KEY, JSON.stringify(v)) : localStorage.removeItem(KEY);
    } catch {
      /* private mode: the ticket lives for this page only */
    }
  },
};
const normCode = (s) => String(s ?? '').replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).toUpperCase().replace(/[^A-Z0-9]/g, '');

export async function joinPage(root) {
  let mem = joinTicket.get(); // also kept in memory when storage is blocked
  let poll = null;
  const shell = (body) =>
    String(html`<div class="login-wrap join-wrap">
      <div class="login-art join-art" aria-hidden="true"><ol class="join-steps"><li><b>۱</b><span>درخواست با کد فروشگاه</span></li><li><b>۲</b><span>تأیید مدیر فروشگاه در اپ</span></li><li><b>۳</b><span>نام کاربری و رمز، همین‌جا روی همین دستگاه</span></li></ol></div>
      <section class="login join">
        <div class="mark">${brandMark}</div>
        <span class="eyebrow">درخواست حساب</span>
        ${body}
        <p class="small"><a href="/login" data-link>بازگشت به ورود</a></p>
      </section></div>`);

  function form(prefill = '') {
    clearInterval(poll);
    root.innerHTML = shell(html`<h1 class="gold-text join-h">حساب تازه</h1>
      <p class="lead">کد فروشگاه را از مدیر بگیرید. پس از تأیید او، نام کاربری و رمز همین‌جا نشان داده می‌شود.</p>
      <form class="form" id="jf" novalidate>
        <label class="field">کد فروشگاه<input class="input ltr join-code" name="code" required maxlength="12" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX" value="${prefill}"></label>
        <p class="small join-shop" id="jshop" aria-live="polite"></p>
        <label class="field">نام و نام خانوادگی<input class="input" name="name" required maxlength="60" autocomplete="name"></label>
        <label class="field">موبایل<input class="input ltr" name="phone" required inputmode="tel" autocomplete="tel" placeholder="۰۹۱۲۰۰۰۰۰۰۰"></label>
        <label class="field">نقش<select class="input" name="role">${ROLES.map(([v, l]) => html`<option value="${v}">${l}</option>`)}</select></label>
        <label class="field">نام کاربری دلخواه (لاتین، اختیاری)<input class="input ltr" name="username" maxlength="32" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="maryam.k"></label>
        <label class="field">توضیح برای مدیر (اختیاری)<input class="input" name="note" maxlength="300" placeholder="مثلاً شعبه یا ساعت کاری"></label>
        <label class="hp" aria-hidden="true">وب‌سایت<input name="website" tabindex="-1" autocomplete="off"></label>
        <p class="err" id="jerr" role="alert"></p>
        <button class="btn block" type="submit">ارسال درخواست</button>
      </form>`);
    const f = $('#jf', root), shopEl = $('#jshop', root);
    let seq = 0;
    const lookup = async () => {
      const c = normCode(f.code.value);
      shopEl.textContent = '';
      shopEl.classList.remove('bad');
      if (c.length !== 8) return;
      const my = ++seq;
      try {
        const r = await api(`/api/access/shop?code=${encodeURIComponent(c)}`);
        if (my === seq) shopEl.textContent = `فروشگاه: ${r.shop}`;
      } catch (e) {
        if (my === seq) (shopEl.textContent = e.message), shopEl.classList.add('bad');
      }
    };
    f.code.addEventListener('input', () => {
      const c = normCode(f.code.value);
      if (c.length === 8 && f.code.value !== `${c.slice(0, 4)}-${c.slice(4)}`) f.code.value = `${c.slice(0, 4)}-${c.slice(4)}`;
      lookup();
    });
    if (prefill) lookup();
    (prefill ? f.name : f.code).focus({ preventScroll: true });
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(f));
      const err = $('#jerr', root), btn = $('button[type=submit]', f);
      err.textContent = '';
      if (normCode(d.code).length !== 8) return (err.textContent = 'کد ۸ نویسه‌ای فروشگاه را وارد کنید.');
      busy(btn, true);
      try {
        const r = await api('/api/access/requests', { method: 'POST', body: { ...d, code: normCode(d.code) } });
        mem = { ticket: r.ticket, shop: r.shop, name: d.name, at: Date.now() };
        joinTicket.set(mem);
        status();
      } catch (e2) {
        err.textContent = e2.message;
        busy(btn, false);
      }
    });
  }

  async function status() {
    clearInterval(poll);
    let s;
    try {
      s = await api('/api/access/status', { method: 'POST', body: { ticket: mem.ticket } });
    } catch (e) {
      if (/پیدا نشد/.test(e.message)) {
        joinTicket.set(null);
        mem = null;
        return form(code0);
      }
      root.innerHTML = shell(html`<h1 class="gold-text join-h">درخواست حساب</h1><p class="err">${e.message}</p><button class="btn ghost block" data-j="check">دوباره</button>`);
      return;
    }
    if (s.status === 'pending') {
      root.innerHTML = shell(html`<h1 class="gold-text join-h">در انتظار تأیید</h1>
        <div class="join-wait" role="status"><span class="join-pulse" aria-hidden="true"></span><p>درخواست <b>${s.name}</b> برای <b>${s.shop}</b> ثبت شد. همین‌که مدیر تأیید کند، نام کاربری و رمز در همین صفحه نمایش داده می‌شود.</p></div>
        <div class="actions"><button class="btn block" data-j="check">بررسی وضعیت</button><button class="btn ghost block" data-j="new">لغو و درخواست تازه</button></div>`);
      poll = setInterval(() => document.visibilityState === 'visible' && status(), 20000);
      return;
    }
    if (s.status === 'rejected') {
      joinTicket.set(null);
      root.innerHTML = shell(html`<h1 class="gold-text join-h">درخواست رد شد</h1><p class="lead">مدیر ${s.shop} این درخواست را تأیید نکرد. با او صحبت کنید و در صورت نیاز دوباره درخواست دهید.</p><button class="btn block" data-j="new">درخواست تازه</button>`);
      return;
    }
    // approved
    joinTicket.set(null);
    if (s.password) {
      root.innerHTML = shell(html`<h1 class="gold-text join-h">حساب شما آماده است</h1>
        <p class="lead">${s.shop} درخواست شما را تأیید کرد. این رمز <b>فقط همین یک بار</b> نمایش داده می‌شود؛ آن را یادداشت کنید.</p>
        <div class="vd-cred join-cred"><div><small>نام کاربری</small><b class="ltr-num">${s.username}</b></div><div><small>رمز</small><b class="ltr-num vd-pw">${s.password}</b></div></div>
        <div class="actions"><button class="btn block" data-j="login">ورود با همین حساب</button><button class="btn ghost block" data-j="copy">کپی</button></div>`);
      const go = () => {
        store.joinHandoff = { login: s.username, password: s.password };
        navigate('/login');
      };
      root.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-j]');
        if (b?.dataset.j === 'login') go();
        if (b?.dataset.j === 'copy') {
          try {
            await navigator.clipboard.writeText(`نام کاربری: ${s.username}\nرمز: ${s.password}`);
            morphLabel(b, 'کپی شد');
          } catch {
            morphLabel(b, 'کپی نشد؛ دستی بردارید');
          }
        }
      });
      return;
    }
    root.innerHTML = shell(html`<h1 class="gold-text join-h">حساب شما ساخته شد</h1>
      <div class="vd-cred join-cred"><div><small>نام کاربری</small><b class="ltr-num">${s.username}</b></div></div>
      <p class="lead">رمز را مدیر ${s.shop} به شما تحویل می‌دهد.</p><a class="btn block" href="/login" data-link>رفتن به ورود</a>`);
  }

  const code0 = new URLSearchParams(location.search).get('code') ?? '';
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-j]');
    if (!b) return;
    if (b.dataset.j === 'check') status();
    if (b.dataset.j === 'new') {
      joinTicket.set(null);
      mem = null;
      form(code0);
    }
  });
  if (mem?.ticket) await status();
  else form(normCode(code0).length === 8 ? `${normCode(code0).slice(0, 4)}-${normCode(code0).slice(4)}` : code0.slice(0, 12));
  return () => clearInterval(poll);
}
