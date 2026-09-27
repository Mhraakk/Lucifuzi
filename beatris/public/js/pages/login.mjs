import { html, api, auth, store, navigate, $, busy, fa, actions } from '../core.mjs';
import { brandMark } from '../ui.mjs';
import { ROLE_FA } from '../core.mjs';

export async function loginPage(root) {
  if (auth.token) return navigate('/', { replace: true });
  const cfg = await api('/api/config').catch(() => ({ demo: false, demoAccounts: [] }));
  root.innerHTML = String(html`
    <section class="login">
      <div class="mark">${brandMark}</div>
      <h1>بئاتریس</h1>
      <p class="lead">آموزش پشت ویترین: فلز و عیار، فاکتور، سنگ، فروش و امنیت.</p>
      <form class="form" id="f" novalidate>
        <label class="field">شماره موبایل
          <input class="input ltr" name="phone" inputmode="tel" autocomplete="username" placeholder="۰۹۱۲۰۰۰۰۰۰۰" required>
        </label>
        <label class="field">رمز عددی
          <input class="input ltr" name="pin" type="password" inputmode="numeric" autocomplete="current-password" maxlength="8" required>
        </label>
        <p class="err" id="err" role="alert"></p>
        <button class="btn block" type="submit">ورود</button>
      </form>
      <p class="small">رمز را مدیر شعبه می‌دهد. اگر فراموش کرده‌اید از مدیر بخواهید آن را بازنشانی کند.</p>
      ${cfg.demo && cfg.demoAccounts.length
        ? html`<div class="demo tray"><h3>حساب‌های نمایشی</h3><p class="small">رمز همه: ۱۲۳۴</p>
            <ul class="rows">${cfg.demoAccounts.map((a) => html`<li><button class="row btn ghost small" style="border:0;border-radius:0" data-act="demo" data-phone="${a.phone}">
              <span class="row-main"><span class="row-t">${a.name}</span><span class="row-s">${ROLE_FA[a.role]} · ${fa(a.phone)}</span></span></button></li>`)}</ul></div>`
        : ''}
    </section>`);

  const form = $('#f', root);
  const submit = async (phone, pin) => {
    const btn = $('button[type=submit]', form);
    busy(btn, true);
    $('#err', root).textContent = '';
    try {
      const r = await api('/api/auth/login', { method: 'POST', body: { phone, pin } });
      auth.token = r.token;
      store.me = null;
      navigate('/', { replace: true });
    } catch (e) {
      $('#err', root).textContent = e.message;
    } finally {
      busy(btn, false);
    }
  };
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const d = new FormData(form);
    if (!d.get('phone') || !d.get('pin')) {
      $('#err', root).textContent = 'شماره و رمز را وارد کنید.';
      return;
    }
    submit(String(d.get('phone')), String(d.get('pin')));
  });
  actions(root, {
    demo: (el) => {
      form.phone.value = fa(el.dataset.phone);
      form.pin.value = '1234';
      submit(el.dataset.phone, '1234');
    },
  });
}
