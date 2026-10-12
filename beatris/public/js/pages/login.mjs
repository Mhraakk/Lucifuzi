// ورود با ایمیل (spec 0034): an email, then the code Supabase sends to it — or the link in the same email. No username,
// no password, no shop code. The email finds its shop by itself; an email in several shops picks one; an email with no
// account may open its own shop. Demo accounts and development servers show the code on the screen instead of sending it.
import { html, api, auth, store, navigate, $, busy, fa, actions } from '../core.mjs';
import { brandMark } from '../ui.mjs';
import { install, canInstall } from '../install.mjs';
import { ROLE_FA } from '../core.mjs';
import { codeBox, initCodeBox } from '../otp.mjs';

const toLatin = (s) => String(s ?? '').replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
/** «09121234567», «+98 912 123 4567», «۹۱۲۱۲۳۴۵۶۷» → 09121234567 (or what was typed, for the server to refuse). */
export function phoneOf(raw) {
  const d = toLatin(raw).replace(/\D/g, '');
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

export async function loginPage(root) {
  if (auth.token) return navigate('/', { replace: true });
  const link = emailLink();
  const cfg = await api('/api/config').catch(() => ({ demo: false, demoAccounts: [] }));
  const demos = (cfg.demoAccounts ?? []).filter((a) => a.email);
  root.innerHTML = String(html`
    <div class="login-wrap">
    <div class="login-art" id="art"><p class="quote">«دریک، سکه زر داریوش، با وزن و عیار یکسان در سراسر شاهنشاهی پذیرفته می‌شد.»<small>اعتماد، از دقت در وزن و عیار آغاز می‌شود</small></p></div>
    <section class="login">
      <div class="mark">${brandMark}</div>
      <span class="eyebrow">${cfg.shopName ? cfg.shopName : 'آکادمی گالری طلا'}</span>
      <h1 class="gold-text" style="margin:10px 0 6px">بئاتریس</h1>
      <div class="lg-step" id="step" aria-live="polite"></div>
      <p class="small"><a href="/intro" data-link>آشنایی با بئاتریس برای فروشگاه شما</a> · <a href="/downloads/Beatris-Setup-x64.exe" download>نسخه ویندوز ۱۱ (۶۴ بیت)</a>${canInstall() ? html` · <button type="button" class="linkish" data-act="install">نصب وب‌اپ روی همین دستگاه</button>` : ''}</p>
      ${cfg.demo && demos.length
        ? html`<div class="demo tray"><h3>حساب‌های نمایشی</h3><p class="small">کد ورود این حساب‌ها روی همین صفحه نشان داده می‌شود.</p>
            <ul class="rows">${demos.map((a) => html`<li><button class="row btn ghost small" style="border:0;border-radius:0" data-act="demo" data-email="${a.email}">
              <span class="row-main"><span class="row-t">${a.name}</span><span class="row-s">${ROLE_FA[a.role]} · <bdi dir="ltr">${a.email}</bdi></span></span></button></li>`)}</ul></div>`
        : ''}
    </section>
    </div>`);

  const step = $('#step', root);
  const S = { email: '', timer: 0, code: null, left: false, ticket: null };
  // the turning coin is decoration: it is built only after the form is on screen and the page is idle, so the email
  // field never waits for it (building its geometry takes a moment on a slow phone)
  let cleanupArt = null;
  const startArt = () => !S.left && coinArt($('#art', root)).then((c) => (S.left ? c?.() : (cleanupArt = c)));
  requestAnimationFrame(() => setTimeout(() => ('requestIdleCallback' in window ? requestIdleCallback(startArt, { timeout: 1500 }) : startArt()), 60));
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
    cleanupArt?.();
    navigate('/', { replace: true });
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
    cleanupArt?.();
  };
}

/** A daric-like gold coin with the Persepolis rosette, turning slowly. */
async function coinArt(host) {
  try {
    const [{ createStage, T }, J, Mt] = await Promise.all([import('../three/stage.mjs'), import('../three/jewelry.mjs'), import('../three/materials.mjs')]);
    const stage = createStage(host, { controls: false, transparent: true, env: 'studio', hero: true });
    if (!stage) return null;
    const P = J.PIECES.coin;
    const meshes = await P.build({ ...Object.fromEntries(Object.entries(P.params).map(([k, v]) => [k, v[0]])), ...P.opts, design: 'rosette', relief: 0.5 });
    const g = new T.Group();
    meshes.forEach((m) => ((m.material = Mt.metalMaterial('au24', 'polish')), g.add(m)));
    const box = new T.Box3().setFromObject(g);
    g.position.set(0, -box.getCenter(new T.Vector3()).y, -box.getCenter(new T.Vector3()).z);
    const pivot = new T.Group();
    pivot.add(g);
    stage.root.add(pivot);
    stage.setShadow(false);
    stage.frame(stage.root, { instant: true, pitch: 0.05, yaw: 0, pad: innerWidth < 900 ? 2.3 : 1.6 });
    // asked for less motion: the coin rests at a three-quarter turn, and its still frame is drawn at the sharpest
    const t0 = performance.now();
    pivot.rotation.y = 0.45;
    const stop = stage.quality.motion
      ? stage.onTick((t) => {
          const k = (t - t0) / 1000;
          pivot.rotation.y = Math.sin(k * 0.45) * 0.9;
          pivot.rotation.x = Math.sin(k * 0.3) * 0.12;
        })
      : () => {};
    return () => (stop(), stage.dispose());
  } catch {
    return null;
  }
}
