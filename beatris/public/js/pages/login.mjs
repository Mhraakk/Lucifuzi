// ورود با پیامک (spec 0022): a mobile number, then the six-digit code it receives — no username, no password, no shop
// code. The number finds its shop by itself; a number in several shops picks one; a number with no account may open
// its own shop. Demo accounts and development servers show the code on the screen instead of sending it.
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
/** 09121234567 → «۰۹۱۲ ۱۲۳ ۴۵۶۷», the way people read a number. */
const showPhone = (p) => fa(p.length === 11 ? `${p.slice(0, 4)} ${p.slice(4, 7)} ${p.slice(7)}` : p);
const clock = (s) => fa(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);

export async function loginPage(root) {
  if (auth.token) return navigate('/', { replace: true });
  const cfg = await api('/api/config').catch(() => ({ demo: false, demoAccounts: [] }));
  root.innerHTML = String(html`
    <div class="login-wrap">
    <div class="login-art" id="art"><p class="quote">«دریک، سکه زر داریوش، با وزن و عیار یکسان در سراسر شاهنشاهی پذیرفته می‌شد.»<small>اعتماد، از دقت در وزن و عیار آغاز می‌شود</small></p></div>
    <section class="login">
      <div class="mark">${brandMark}</div>
      <span class="eyebrow">${cfg.shopName ? cfg.shopName : 'آکادمی گالری طلا'}</span>
      <h1 class="gold-text" style="margin:10px 0 6px">بئاتریس</h1>
      <div class="lg-step" id="step" aria-live="polite"></div>
      <p class="small"><a href="/intro" data-link>آشنایی با بئاتریس برای فروشگاه شما</a> · <a href="/downloads/Beatris-Setup-x64.exe" download>نسخه ویندوز ۱۱ (۶۴ بیت)</a>${canInstall() ? html` · <button type="button" class="linkish" data-act="install">نصب وب‌اپ روی همین دستگاه</button>` : ''}</p>
      ${cfg.demo && cfg.demoAccounts.length
        ? html`<div class="demo tray"><h3>حساب‌های نمایشی</h3><p class="small">کد ورود این حساب‌ها روی همین صفحه نشان داده می‌شود.</p>
            <ul class="rows">${cfg.demoAccounts.map((a) => html`<li><button class="row btn ghost small" style="border:0;border-radius:0" data-act="demo" data-phone="${a.phone}">
              <span class="row-main"><span class="row-t">${a.name}</span><span class="row-s">${ROLE_FA[a.role]} · ${fa(a.phone)}</span></span></button></li>`)}</ul></div>`
        : ''}
    </section>
    </div>`);

  const step = $('#step', root);
  const S = { phone: '', timer: 0, webotp: null, code: null, left: false };
  // the turning coin is decoration: it is built only after the form is on screen and the page is idle, so the number
  // field never waits for it (building its geometry takes a moment on a slow phone)
  let cleanupArt = null;
  const startArt = () => !S.left && coinArt($('#art', root)).then((c) => (S.left ? c?.() : (cleanupArt = c)));
  requestAnimationFrame(() => setTimeout(() => ('requestIdleCallback' in window ? requestIdleCallback(startArt, { timeout: 1500 }) : startArt()), 60));
  const stop = () => {
    clearInterval(S.timer);
    S.webotp?.abort();
    S.webotp = null;
  };
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

  /* ---------- 1. the number ---------- */
  function phoneStep(prefill = '') {
    show(html`<p class="lead">با شماره موبایل‌تان وارد شوید؛ کد ورود پیامک می‌شود.</p>
      <form class="form" id="pf" novalidate>
        <label class="field">شماره موبایل<input class="input ltr lg-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="۰۹۱۲ ۳۴۵ ۶۷۸۹" value="${prefill}" required></label>
        <p class="err" id="err" role="alert"></p>
        <button class="btn block" type="submit">دریافت کد</button>
      </form>
      <p class="small">نام کاربری و رمز لازم نیست؛ با همین شماره روی گوشی، تبلت و کامپیوتر وارد شوید.</p>`);
    const f = $('#pf', step);
    f.phone.focus({ preventScroll: true });
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const p = phoneOf(f.phone.value);
      if (!/^09\d{9}$/.test(p)) return err('شماره موبایل ۱۱ رقمی را با ۰۹ بنویسید.');
      send(p, $('button[type=submit]', f));
    });
  }
  async function send(phone, btn) {
    busy(btn, true);
    err('');
    try {
      const r = await api('/api/auth/code', { method: 'POST', body: { phone } });
      S.phone = r.phone ?? phone;
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
    show(html`<p class="lead">${pin ? html`سرویس پیامک هنوز تنظیم نشده است؛ تا آن موقع فقط مالک، با رمز تعیین‌شده در Railway، وارد می‌شود.` : html`کد ۶ رقمی به <bdi class="ltr-num">${showPhone(S.phone)}</bdi> پیامک شد.`} <button type="button" class="linkish" data-act="edit">ویرایش شماره</button></p>
      <form class="form" id="cf" novalidate>
        ${pin ? html`<label class="field">رمز مالک (BEATRIS_OWNER_PIN)<input class="input ltr" name="code" type="password" inputmode="numeric" autocomplete="current-password" maxlength="12" required></label>` : codeBox({ label: 'کد پیامک‌شده' })}
        ${r.code ? html`<button type="button" class="lg-dev" data-act="fill" data-code="${r.code}"><span>${r.via === 'demo' ? 'کد حساب نمایشی' : 'کد آزمایشی (محیط توسعه)'}</span><b class="ltr-num">${fa(r.code)}</b></button>` : ''}
        <p class="err" id="err" role="alert"></p>
        <button class="btn block" type="submit">ورود</button>
      </form>
      ${pin ? '' : html`<p class="small lg-resend"><button type="button" class="linkish" data-act="resend" disabled>ارسال دوباره</button></p>
        <p class="small lg-hint">کد نرسید؟ اگر مدیر فروشگاه شماره شما را هنوز در «تیم» ثبت نکرده باشد، پیامکی نمی‌آید.</p>`}`);
    const f = $('#cf', step);
    const submit = async (code) => {
      const btn = $('button[type=submit]', f);
      if (btn.disabled) return;
      busy(btn, true);
      err('');
      try {
        const v = await api('/api/auth/verify', { method: 'POST', body: { phone: S.phone, code } });
        if (v.token) return done(v);
        if (v.shops) return shopStep(v);
        if (v.signup) return signupStep(v);
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
      if (S.code && c.length !== 6) return err('کد ۶ رقمی را کامل وارد کنید.');
      if (!c) return err('رمز را وارد کنید.');
      submit(c);
    });
    if (!pin) countdown(r.resend ?? 60);
    // Android Chrome reads the code from an SMS that ends with «@<this site> #<code>» (WebOTP), when the template has it
    if (!pin && 'OTPCredential' in window) {
      S.webotp = new AbortController();
      navigator.credentials
        .get({ otp: { transport: ['sms'] }, signal: S.webotp.signal })
        .then((o) => {
          if (o?.code && S.code) S.code.fill(o.code);
        })
        .catch(() => {});
    }
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

  /* ---------- 3a. a number in several shops ---------- */
  function shopStep(v) {
    show(html`<p class="lead">این شماره در چند فروشگاه حساب دارد؛ کدام را باز می‌کنید؟</p>
      <ul class="rows lg-shops">${v.shops.map((s) => html`<li><button type="button" class="row" data-act="pick" data-tenant="${s.tenant}"><span class="row-main"><span class="row-t">${s.shop}</span><span class="row-s">${s.name} · ${s.roleName}</span></span></button></li>`)}</ul>
      <p class="err" id="err" role="alert"></p>`);
    S.ticket = v.ticket;
    $('[data-act=pick]', step)?.focus({ preventScroll: true });
  }
  /* ---------- 3b. a number with no account: a new shop ---------- */
  function signupStep(v) {
    S.ticket = v.ticket;
    show(html`<p class="lead">این شماره هنوز در بئاتریس حسابی ندارد.</p>
      <p class="small lg-hint">کارمند یک فروشگاه هستید؟ از مدیرتان بخواهید شماره ${showPhone(S.phone)} را در «تیم» اضافه کند و دوباره وارد شوید. برای راه‌اندازی فروشگاه خودتان:</p>
      <form class="form" id="sf" novalidate>
        <label class="field">نام و نام خانوادگی<input class="input" name="name" autocomplete="name" maxlength="60" required></label>
        <label class="field">نام فروشگاه<input class="input" name="shopName" maxlength="80" placeholder="مثلاً طلا و جواهر نمونه" required></label>
        <p class="err" id="err" role="alert"></p>
        <button class="btn block" type="submit">ساخت فروشگاه و ورود</button>
      </form>
      <button type="button" class="btn ghost block" data-act="edit">شماره دیگری دارم</button>`);
    const f = $('#sf', step);
    f.name.focus({ preventScroll: true });
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('button[type=submit]', f);
      if (f.name.value.trim().length < 2) return err('نام و نام خانوادگی را بنویسید.');
      if (f.shopName.value.trim().length < 2) return err('نام فروشگاه را بنویسید.');
      busy(btn, true);
      err('');
      try {
        done(await api('/api/auth/finish', { method: 'POST', body: { ticket: S.ticket, name: f.name.value, shopName: f.shopName.value } }));
      } catch (e2) {
        err(e2.message);
        busy(btn, false);
      }
    });
  }

  actions(root, {
    install: () => install(),
    edit: () => phoneStep(fa(S.phone)),
    fill: (el) => S.code?.fill(el.dataset.code),
    resend: (el) => send(S.phone, el),
    pick: async (el) => {
      busy(el, true);
      try {
        done(await api('/api/auth/finish', { method: 'POST', body: { ticket: S.ticket, tenant: el.dataset.tenant } }));
      } catch (e) {
        err(e.message);
        busy(el, false);
      }
    },
    // a demo account: the number goes in, its code comes back on the screen and is typed for you
    demo: async (el) => {
      phoneStep(fa(el.dataset.phone));
      const r = await send(el.dataset.phone, $('#pf button[type=submit]', step));
      if (r?.code) S.code?.fill(r.code);
    },
  });
  phoneStep();
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
