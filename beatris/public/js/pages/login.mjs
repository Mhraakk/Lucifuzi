// ورود با ایمیل (spec 0034): an email, then the code Supabase sends to it — or the link in the same email. No username,
// no password, no shop code. The email finds its shop by itself; an email in several shops picks one; an email with no
// account may open its own shop. Demo accounts and development servers show the code on the screen instead of sending it.
import { html, raw, api, auth, store, navigate, $, busy, fa, actions } from '../core.mjs';
import { brandMark } from '../ui.mjs';
import { install, canInstall, WIN_SETUP, windowsSetupFor } from '../install.mjs';
import { ROLE_FA } from '../core.mjs';
import { codeBox, initCodeBox } from '../otp.mjs';
import { mountSculpture } from '../liquid.mjs';
import { flipSkin } from '../skinpicker.mjs';

const toLatin = (s) => String(s ?? '').replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
/** «09121234567», «+98 912 123 4567», «۹۱۲۱۲۳۴۵۶۷» → 09121234567 (or what was typed, for the server to refuse). */
export function phoneOf(raw) {
  let d = toLatin(raw).replace(/\D/g, '');
  if (d.startsWith('0098')) d = d.slice(2); // the international 00 prefix: 0098 912 … is +98 912 …
  if (/^989\d{9}$/.test(d)) return `0${d.slice(2)}`;
  if (/^9\d{9}$/.test(d)) return `0${d}`;
  return d;
}
/** « Name@Mail.COM » → name@mail.com: the way the server stores and compares it. */
export const emailOf = (raw) => String(raw ?? '').replace(/[\u200b-\u200f\u202a-\u202e\u2060\ufeff\s]/g, '').toLowerCase();
const EMAIL_RE = /^[^@\s]{1,64}@[^@\s]+\.[a-z]{2,24}$/i;
const clock = (s) => fa(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
/** The session Supabase hands back in the address when the link in the email is opened (taken by app.mjs at start). */
function emailLink() {
  try {
    const v = sessionStorage.getItem('beatris.emailLink');
    sessionStorage.removeItem('beatris.emailLink');
    return v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
}

/** The entrance sculpture (spec 0046): gold filaments woven into the crown's three points, the coin for its jewel. */
const SCULPTURE = '/media/hero/sculpture.webp';
const ARROW = raw('<svg class="sh-arrow" width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>');
const SUN = raw('<svg class="sh-sun" width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="3.2" stroke="currentColor" stroke-width="1.3"/><path d="M8 1.2v1.6M8 13.2v1.6M1.2 8h1.6M13.2 8h1.6M3.2 3.2l1.1 1.1M11.7 11.7l1.1 1.1M3.2 12.8l1.1-1.1M11.7 4.3l1.1-1.1" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>');
const MOON = raw('<svg class="sh-moon" width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M13.6 10.1A5.9 5.9 0 0 1 5.9 2.4a5.9 5.9 0 1 0 7.7 7.7Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>');
const toneLabel = () => (document.documentElement.dataset.tone === 'dark' ? 'پوسته‌ی روشن' : 'پوسته‌ی تیره');

export async function loginPage(root) {
  if (auth.token) return navigate('/start', { replace: true });
  const link = emailLink();
  const cfg = await api('/api/config').catch(() => ({ demo: false, demoAccounts: [] }));
  const demos = (cfg.demoAccounts ?? []).filter((a) => a.email);
  // the entrance is the prompt's hero (spec 0046): nav, the sculpture between the nav and the copy, the word behind
  // it, the headline, and in the aside — where the prompt has its body and buttons — the sign-in itself
  root.innerHTML = String(html`
    <section class="sh-root" aria-label="ورود به بئاتریس">
      <div class="sh-backdrop" aria-hidden="true">beatris</div>
      <div class="sh-stage" aria-hidden="true"><img class="sh-fallback" src="${SCULPTURE}" alt="" draggable="false"></div>
      <span class="sh-alt">مجسمه‌ای از رشته‌های درهم‌تافته‌ی طلا که به سه کنگره‌ی تاج بئاتریس می‌رسد، با سکه‌ای بر نوک آن</span>
      <nav class="sh-nav" aria-label="اصلی">
        <a class="sh-brand" href="/intro" data-link>${brandMark}<span>بئاتریس</span></a>
        <ul class="sh-links">
          <li><a class="sh-link" href="/intro" data-link>معرفی</a></li>
          <li><a class="sh-link" href="/intro/features" data-link>امکانات</a></li>
          <li><a class="sh-link" href="/intro/packages" data-link>بسته‌ها</a></li>
          <li><a class="sh-link" id="winSetup" href="${WIN_SETUP.win11}" download>نسخه ویندوز</a></li>
          ${canInstall() ? html`<li><button type="button" class="sh-link" data-act="install">نصب وب‌اپ</button></li>` : ''}
          <li class="sh-keep"><button type="button" class="sh-theme" data-act="tone" aria-label="${toneLabel()}">${SUN}${MOON}</button></li>
          <li class="sh-keep"><a class="sh-navcta" href="/intro/demo" data-link>درخواست نمایش</a></li>
        </ul>
      </nav>
      <div class="sh-hint" aria-hidden="true" data-hint="روی طلا حرکت کنید" data-touch="طلا را لمس کنید"></div>
      <div class="sh-spacer"></div>
      <div class="sh-content">
        <div>
          <p class="sh-eyebrow">${cfg.shopName ? cfg.shopName : 'آکادمی گالری طلا'}</p>
          <h1 class="sh-h1"><span class="sh-line">هر گرم طلا</span><span class="sh-line"><span class="sh-accent">حساب پس می‌دهد.</span></span></h1>
        </div>
        <div class="sh-aside">
          <div class="lg-step" id="step" aria-live="polite"></div>
          <a class="sh-txt" href="/intro" data-link>آشنایی با بئاتریس ${ARROW}</a>
        </div>
      </div>
      <a class="sh-credit" href="https://guglielmogiannattasio.it" target="_blank" rel="noopener" dir="ltr">by guglielmogiannattasio.it</a>
    </section>
    ${cfg.demo && demos.length
      ? html`<section class="sh-demos"><div class="demo tray"><h3>حساب‌های نمایشی</h3><p class="small">کد ورود این حساب‌ها روی همین صفحه نشان داده می‌شود.</p>
          <ul class="rows">${demos.map((a) => html`<li><button class="row btn ghost small" data-act="demo" data-email="${a.email}">
            <span class="row-main"><span class="row-t">${a.name}</span><span class="row-s">${ROLE_FA[a.role]} · <bdi dir="ltr">${a.email}</bdi></span></span></button></li>`)}</ul></div></section>`
      : ''}`);

  const step = $('#step', root);
  const S = { email: '', timer: 0, code: null, left: false, ticket: null };
  // the sculpture lays itself out at once; its engine starts when the page is idle, so the email field never waits
  const hero = mountSculpture($('.sh-root', root), { src: SCULPTURE });
  // the Windows link fetches the installer for this PC when the browser tells which Windows it is (11 by default)
  windowsSetupFor().then((k) => {
    const a = $('#winSetup', root);
    if (!k || !a) return;
    a.href = WIN_SETUP[k];
    a.textContent = k === 'win10' ? 'نسخه ویندوز ۱۰' : 'نسخه ویندوز ۱۱';
  });
  const stop = () => clearInterval(S.timer);
  const show = (markup) => {
    stop();
    step.classList.remove('in');
    step.innerHTML = String(markup);
    void step.offsetWidth;
    step.classList.add('in');
  };
  const err = (m) => {
    const e = $('#err', step);
    if (e) e.textContent = m ?? '';
  };
  const done = (r) => {
    auth.token = r.token;
    store.me = null;
    hero.dispose();
    // each way of working starts in its own place (spec 0038)
    navigate('/start', { replace: true });
  };
  /** After a right code or link: one shop → in; several → pick one; none → a new shop. */
  const after = (v) => (v.token ? done(v) : v.shops ? shopStep(v) : v.signup ? signupStep(v) : null);

  /* ---------- 1. the email ---------- */
  function emailStep(prefill = '') {
    show(html`<p class="lead">با ایمیل‌تان وارد شوید؛ کد ورود به همان ایمیل فرستاده می‌شود.</p>
      <form class="form" id="ef" novalidate>
        <label class="field">ایمیل<input class="input ltr lg-email" name="email" type="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false" placeholder="name@example.com" value="${prefill}" required></label>
        <p class="err" id="err" role="alert"></p>
        <button class="btn block" type="submit">دریافت کد</button>
      </form>
      <p class="small">نام کاربری و رمز لازم نیست؛ با همین ایمیل روی گوشی، تبلت و کامپیوتر وارد شوید.</p>`);
    const f = $('#ef', step);
    f.email.focus({ preventScroll: true });
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const m = emailOf(f.email.value);
      if (!EMAIL_RE.test(m)) return err('نشانی ایمیل را کامل بنویسید؛ مثل name@gmail.com');
      send(m, $('button[type=submit]', f));
    });
  }
  async function send(email, btn) {
    busy(btn, true);
    err('');
    try {
      const r = await api('/api/auth/code', { method: 'POST', body: { email } });
      S.email = r.email ?? email;
      codeStep(r);
      return r;
    } catch (e) {
      err(e.message);
      busy(btn, false);
      if (e.data?.retryAfter) countdown(e.data.retryAfter);
      return null;
    }
  }

  /* ---------- 2. the code ---------- */
  function codeStep(r) {
    const pin = r.via === 'owner-pin';
    const len = Math.min(10, Math.max(6, Number(r.len) || 6));
    show(html`<p class="lead">${pin ? html`سرویس ایمیل هنوز تنظیم نشده است؛ تا آن موقع فقط مالک، با رمز تعیین‌شده در Railway، وارد می‌شود.` : html`کد ${fa(len)} رقمی به <bdi dir="ltr" class="lg-mail">${S.email}</bdi> فرستاده شد.`} <button type="button" class="linkish" data-act="edit">ویرایش ایمیل</button></p>
      <form class="form" id="cf" novalidate>
        ${pin ? html`<label class="field">رمز مالک (BEATRIS_OWNER_PIN)<input class="input ltr" name="code" type="password" inputmode="numeric" autocomplete="current-password" maxlength="12" required></label>` : codeBox({ label: 'کد ایمیل‌شده', length: len })}
        ${r.code ? html`<button type="button" class="lg-dev" data-act="fill" data-code="${r.code}"><span>${r.via === 'demo' ? 'کد حساب نمایشی' : 'کد آزمایشی (محیط توسعه)'}</span><b class="ltr-num">${fa(r.code)}</b></button>` : ''}
        <p class="err" id="err" role="alert"></p>
        <button class="btn block" type="submit">ورود</button>
      </form>
      ${pin ? '' : html`<p class="small lg-resend"><button type="button" class="linkish" data-act="resend" disabled>ارسال دوباره</button></p>
        <p class="small lg-hint">صندوق ورودی و پوشه هرزنامه (Spam) را ببینید؛ پیوند «ورود» داخل همان ایمیل هم شما را وارد می‌کند. اگر مدیر فروشگاه ایمیل شما را هنوز در «تیم» ثبت نکرده باشد، ایمیلی نمی‌آید.</p>`}`);
    const f = $('#cf', step);
    const submit = async (code) => {
      const btn = $('button[type=submit]', f);
      if (btn.disabled) return;
      busy(btn, true);
      err('');
      try {
        after(await api('/api/auth/verify', { method: 'POST', body: { email: S.email, code } }));
      } catch (e) {
        err(e.message);
        busy(btn, false);
        if (S.code) S.code.fail();
        else f.code.select();
        // a code voided after five wrong tries needs a new one: the resend button says so at once
        if (/باطل|زمان کد|تازه بگیرید/.test(e.message)) countdown(0);
      }
    };
    S.code = pin ? null : initCodeBox(f, { onComplete: (c) => submit(c) });
    (S.code ?? { focus: () => f.code.focus() }).focus();
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const c = S.code ? S.code.value : toLatin(f.code.value).replace(/\D/g, '');
      if (S.code && c.length !== len) return err(`کد ${fa(len)} رقمی را کامل وارد کنید.`);
      if (!c) return err('رمز را وارد کنید.');
      submit(c);
    });
    if (!pin) countdown(r.resend ?? 60);
  }
  function countdown(sec) {
    clearInterval(S.timer);
    const b = $('[data-act=resend]', step);
    if (!b) return;
    let left = Math.max(0, Math.round(sec));
    const tick = () => {
      b.disabled = left > 0;
      b.textContent = left > 0 ? `ارسال دوباره تا ${clock(left)}` : 'ارسال دوباره کد';
      if (left-- <= 0) clearInterval(S.timer);
    };
    tick();
    S.timer = setInterval(tick, 1000);
  }

  /* ---------- 3a. an email in several shops ---------- */
  function shopStep(v) {
    S.ticket = v.ticket;
    show(html`<p class="lead">این ایمیل در چند فروشگاه حساب دارد؛ کدام را باز می‌کنید؟</p>
      <ul class="rows lg-shops">${v.shops.map((s) => html`<li><button type="button" class="row" data-act="pick" data-tenant="${s.tenant}"><span class="row-main"><span class="row-t">${s.shop}</span><span class="row-s">${s.name} · ${s.roleName}</span></span></button></li>`)}</ul>
      <p class="err" id="err" role="alert"></p>`);
    $('[data-act=pick]', step)?.focus({ preventScroll: true });
  }
  /* ---------- 3b. an email with no account: a new shop (its mobile too, the account's key inside the shop) ---------- */
  function signupStep(v) {
    S.ticket = v.ticket;
    if (v.email) S.email = v.email;
    show(html`<p class="lead">این ایمیل هنوز در بئاتریس حسابی ندارد.</p>
      <p class="small lg-hint">کارمند یک فروشگاه هستید؟ از مدیرتان بخواهید ایمیل <bdi dir="ltr">${S.email}</bdi> را در «تیم» ثبت کند و دوباره وارد شوید. برای راه‌اندازی فروشگاه خودتان:</p>
      <form class="form" id="sf" novalidate>
        <label class="field">نام و نام خانوادگی<input class="input" name="name" autocomplete="name" maxlength="60" required></label>
        <label class="field">شماره موبایل<input class="input ltr" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="۰۹۱۲ ۳۴۵ ۶۷۸۹" required></label>
        <label class="field">نام فروشگاه<input class="input" name="shopName" maxlength="80" placeholder="مثلاً طلا و جواهر نمونه" required></label>
        <p class="err" id="err" role="alert"></p>
        <button class="btn block" type="submit">ساخت فروشگاه و ورود</button>
      </form>
      <button type="button" class="btn ghost block" data-act="edit">ایمیل دیگری دارم</button>`);
    const f = $('#sf', step);
    f.name.focus({ preventScroll: true });
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('button[type=submit]', f);
      const phone = phoneOf(f.phone.value);
      if (f.name.value.trim().length < 2) return err('نام و نام خانوادگی را بنویسید.');
      if (!/^09\d{9}$/.test(phone)) return err('شماره موبایل ۱۱ رقمی را با ۰۹ بنویسید.');
      if (f.shopName.value.trim().length < 2) return err('نام فروشگاه را بنویسید.');
      busy(btn, true);
      err('');
      try {
        done(await api('/api/auth/finish', { method: 'POST', body: { ticket: S.ticket, name: f.name.value, phone, shopName: f.shopName.value } }));
      } catch (e2) {
        err(e2.message);
        busy(btn, false);
      }
    });
  }

  actions(root, {
    install: () => install(),
    // the prompt's light/dark switch flips the app's own skin pair (spec 0014), so the choice carries into the app
    // (at once: every line and the ground change together, so nothing is ever drawn in the new colour on the old ground)
    tone: (el) => {
      flipSkin();
      hero.refresh();
      el.setAttribute('aria-label', toneLabel());
    },
    edit: () => emailStep(S.email),
    fill: (el) => S.code?.fill(el.dataset.code),
    resend: (el) => send(S.email, el),
    pick: async (el) => {
      busy(el, true);
      try {
        done(await api('/api/auth/finish', { method: 'POST', body: { ticket: S.ticket, tenant: el.dataset.tenant } }));
      } catch (e) {
        err(e.message);
        busy(el, false);
      }
    },
    // a demo account: the email goes in, its code comes back on the screen and is typed for you
    demo: async (el) => {
      emailStep(el.dataset.email);
      const r = await send(el.dataset.email, $('#ef button[type=submit]', step));
      if (r?.code) S.code?.fill(r.code);
    },
  });
  if (link?.token) {
    // back from the link in the email: the session Supabase opened is checked on the server, then the shop opens
    show(html`<p class="lead">در حال ورود با پیوند ایمیل…</p><p class="err" id="err" role="alert"></p>`);
    try {
      after(await api('/api/auth/verify', { method: 'POST', body: { accessToken: link.token } }));
    } catch (e) {
      emailStep();
      err(e.message);
    }
  } else {
    emailStep();
    if (link?.error) err('پیوند ایمیل گذشته یا قبلاً استفاده شده است؛ ایمیل‌تان را بنویسید و کد تازه بگیرید.');
  }
  return () => {
    S.left = true;
    stop();
    hero.dispose();
  };
}
