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
      <span class="eyebrow">آکادمی گالری طلا</span>
      <h1 class="gold-text" style="margin:10px 0 6px">بئاتریس</h1>
      <p class="lead">آموزش پشت ویترین: فلز و عیار، فاکتور، سنگ، فروش، امنیت و طراحی سه‌بعدی.</p>
      <form class="form" id="f" novalidate>
        <label class="field">شماره موبایل
          <input class="input ltr" name="phone" inputmode="tel" autocomplete="username" placeholder="۰۹۱۲۰۰۰۰۰۰۰" required>
        </label>
        <label class="field">رمز عددی
          <input class="input ltr" name="pin" type="password" inputmode="numeric" autocomplete="current-password" maxlength="12" required>
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
    </section>
    </div>`);

  const form = $('#f', root);
  const cleanupArt = await coinArt($('#art', root));
  const submit = async (phone, pin) => {
    const btn = $('button[type=submit]', form);
    busy(btn, true);
    $('#err', root).textContent = '';
    try {
      const r = await api('/api/auth/login', { method: 'POST', body: { phone, pin } });
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
