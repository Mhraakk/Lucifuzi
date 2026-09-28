import { html, api, auth, store, navigate, $, busy, fa, actions } from '../core.mjs';
import { brandMark } from '../ui.mjs';
import { ROLE_FA } from '../core.mjs';

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
      <p class="lead">حسابداری معاملات طلا، سکه، شمش و ارز؛ روزنگار، گاوصندوق، مشتریان و آموزش کارکنان.</p>
      <form class="form" id="f" novalidate>
        <label class="field">نام کاربری یا شماره موبایل
          <input class="input ltr" name="login" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="username" required>
        </label>
        <label class="field">رمز عبور
          <span class="pw-box"><input class="input ltr" name="password" type="password" autocomplete="current-password" maxlength="64" required><button type="button" class="pw-eye" data-act="eye" aria-label="نمایش رمز" aria-pressed="false">نمایش</button></span>
        </label>
        <p class="err" id="err" role="alert"></p>
        <button class="btn block" type="submit">ورود</button>
      </form>
      <p class="small">نام کاربری و رمز را فقط ارائه‌دهنده نرم‌افزار صادر می‌کند. با همین حساب روی گوشی، تبلت و کامپیوتر وارد شوید. برای رمز فراموش‌شده با ارائه‌دهنده تماس بگیرید.</p>
      <p class="small"><a href="/intro" data-link>آشنایی با بئاتریس برای فروشگاه شما</a></p>
      ${cfg.demo && cfg.demoAccounts.length
        ? html`<div class="demo tray"><h3>حساب‌های نمایشی</h3><p class="small">رمز همه: ۱۲۳۴</p>
            <ul class="rows">${cfg.demoAccounts.map((a) => html`<li><button class="row btn ghost small" style="border:0;border-radius:0" data-act="demo" data-phone="${a.phone}">
              <span class="row-main"><span class="row-t">${a.name}</span><span class="row-s">${ROLE_FA[a.role]} · ${fa(a.phone)}</span></span></button></li>`)}</ul></div>`
        : ''}
    </section>
    </div>`);

  const form = $('#f', root);
  const cleanupArt = await coinArt($('#art', root));
  const submit = async (login, password) => {
    const btn = $('button[type=submit]', form);
    busy(btn, true);
    $('#err', root).textContent = '';
    try {
      const r = await api('/api/auth/login', { method: 'POST', body: { login, password } });
      auth.token = r.token;
      store.me = null;
      cleanupArt?.();
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
    if (!String(d.get('login')).trim() || !d.get('password')) {
      $('#err', root).textContent = 'نام کاربری و رمز را وارد کنید.';
      return;
    }
    submit(String(d.get('login')).trim(), String(d.get('password')));
  });
  actions(root, {
    eye: (el) => {
      const on = form.password.type === 'password';
      form.password.type = on ? 'text' : 'password';
      el.textContent = on ? 'پنهان' : 'نمایش';
      el.setAttribute('aria-pressed', String(on));
    },
    demo: (el) => {
      form.login.value = fa(el.dataset.phone);
      form.password.value = '1234';
      submit(el.dataset.phone, '1234');
    },
  });
  return cleanupArt;
}

/** A daric-like gold coin with the Persepolis rosette, turning slowly. */
async function coinArt(host) {
  try {
    const [{ createStage, T }, J, Mt] = await Promise.all([import('../three/stage.mjs'), import('../three/jewelry.mjs'), import('../three/materials.mjs')]);
    const stage = createStage(host, { controls: false, transparent: true, env: 'studio' });
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
    const t0 = performance.now();
    const stop = stage.onTick((t) => {
      const k = (t - t0) / 1000;
      pivot.rotation.y = Math.sin(k * 0.45) * 0.9;
      pivot.rotation.x = Math.sin(k * 0.3) * 0.12;
    });
    return () => (stop(), stage.dispose());
  } catch {
    return null;
  }
}
