// Managers add real reference photographs of coins. Everything is processed here in the browser
// (public/js/coinphoto.mjs): the coin is found automatically, can be nudged by hand, and is turned into
// 4096/2048 faces plus a relief map; the server only stores the finished, validated textures.
import { html, fa, api, toast, store, $, $$ } from '../core.mjs';
import { back } from '../ui.mjs';
import { COIN_TYPES } from '../coins.mjs';

const VIEW = 560; // preview canvas width (CSS px scales it down on phones)

export async function coinPhotosPage(root) {
  const P = await import('../coinphoto.mjs');
  const admin = store.isAdmin();
  const S = { sources: [], circles: [], view: 0, sel: 0, obv: 0, rev: 1, invert: { obv: null, rev: null }, busy: false, list: [] };

  root.innerHTML = String(html`${back('/coins?mode=real', 'سکه واقعی')}
    <h1>عکس‌های مرجع سکه</h1>
    <p class="lead">عکس واقعی دو روی سکه را بارگذاری کنید. برنامه سکه را خودش پیدا می‌کند، صاف و وسط‌چین می‌کند، تصویر ۴K و نقشه برجستگی می‌سازد. هیچ جزئیاتی ساخته یا حدس زده نمی‌شود؛ هرچه عکس واضح‌تر باشد، مرجع دقیق‌تر است.</p>
    ${admin
      ? html`<h2>عکس جدید</h2>
    <form class="tray" id="pf" autocomplete="off">
      <div class="form cols">
        <label class="field">نوع سکه<select class="input" name="coin">${Object.entries(COIN_TYPES).map(([k, c]) => html`<option value="${k}">${c.label}</option>`)}</select></label>
        <label class="field">عنوان<input class="input" name="label" maxlength="80" required></label>
        <label class="field">منبع و حق نشر عکس<input class="input" name="source" maxlength="200" placeholder="مثلاً: عکس شعبه مرکزی از سکه خودمان"></label>
      </div>
      <label class="field">عکس (یک عکس با هر دو رو، یا دو عکس جدا؛ هرچه واضح‌تر، بهتر: نور یکنواخت، عکس از روبه‌رو، زمینه ساده)<input class="input" type="file" name="files" accept="image/jpeg,image/png,image/webp" multiple></label>
      <div id="edit" hidden>
        <div class="chips" id="srcs"></div>
        <canvas id="view" class="photo-view" width="${VIEW}" height="${VIEW}" aria-label="پیش‌نمایش عکس و دایره سکه"></canvas>
        <p class="small">روی دایره بزنید تا انتخاب شود؛ برای جابه‌جایی بکشید. اندازه و چرخش را با لغزنده‌ها دقیق کنید تا لبه دایره دقیقاً روی لبه سکه بنشیند.</p>
        <div class="chips" id="circs"></div>
        <div class="form cols" style="margin-top:10px">
          <label class="param"><span class="lbl"><span>اندازه دایره</span><b id="rv"></b></span><input type="range" id="rad" min="0.5" max="1.5" step="0.001" value="1"></label>
          <label class="param"><span class="lbl"><span>چرخش (درجه)</span><b id="av"></b></span><input type="range" id="rot" min="-180" max="180" step="0.5" value="0"></label>
        </div>
        <div class="actions" style="margin-top:6px"><button type="button" class="btn small ghost" data-act="as-obv">این سکه: جلو</button><button type="button" class="btn small ghost" data-act="as-rev">این سکه: پشت</button><button type="button" class="btn small ghost" data-act="swap">جابه‌جایی جلو و پشت</button></div>
        <div class="actions" style="margin-top:6px"><button type="button" class="btn small ghost" data-act="rot-">↺ ۹۰°</button><button type="button" class="btn small ghost" data-act="rot+">↻ ۹۰°</button><button type="button" class="btn small ghost" data-act="invert">برجستگی وارونه</button></div>
        <div class="face-pre">
          <figure><canvas id="po" width="220" height="220"></canvas><canvas id="ho" width="220" height="220"></canvas><figcaption>جلوی سکه · عکس و برجستگی</figcaption></figure>
          <figure><canvas id="pr" width="220" height="220"></canvas><canvas id="hr" width="220" height="220"></canvas><figcaption>پشت سکه · عکس و برجستگی</figcaption></figure>
        </div>
      </div>
      <div class="actions"><button class="btn" type="submit" id="save" disabled>ساخت ۴K و ذخیره</button></div>
      <p class="small" id="msg" aria-live="polite"></p>
    </form>`
      : html`<p class="small">افزودن و حذف عکس فقط برای مدیر است؛ عکس‌ها را در آزمایشگاه سکه ببینید.</p>`}
    <h2>عکس‌های ثبت‌شده</h2>
    <div id="list" class="photo-list"><p class="small">در حال بارگذاری…</p></div>`);

  const msg = (t) => {
    const m = $('#msg', root);
    if (m) m.textContent = t;
  };

  /* ---------------- list ---------------- */
  async function loadList() {
    try {
      S.list = (await api('/api/coin-photos')).items;
    } catch (e) {
      $('#list', root).innerHTML = String(html`<p class="small">${e.message}</p>`);
      return;
    }
    $('#list', root).innerHTML = String(
      S.list.length
        ? html`${S.list.map(
            (it) => html`<article class="photo-item">
              <div class="pair"><img src="${it.sides.obv.c2}" alt="جلوی ${it.label}" loading="lazy"><img src="${it.sides.rev.c2}" alt="پشت ${it.label}" loading="lazy"></div>
              <div><b>${it.label}</b><div class="small">${COIN_TYPES[it.coin]?.label ?? it.coin} · وضوح عکس ${fa(it.sides.obv.px)} پیکسل · ${it.builtin ? 'همراه برنامه' : 'بارگذاری شعبه'}</div><div class="small">${it.credit?.text || ''}</div>
              <div class="actions"><a class="btn small ghost" href="/coins?mode=real&item=${encodeURIComponent(it.id)}" data-link>مشاهده سه‌بعدی</a>${admin && !it.builtin ? html`<button class="btn small ghost" data-del="${it.id}">حذف</button>` : ''}</div></div>
            </article>`,
          )}`
        : html`<p class="small">هنوز عکسی ثبت نشده است.</p>`,
    );
  }
  $('#list', root).addEventListener('click', async (e) => {
    const b = e.target.closest('[data-del]');
    if (!b || !confirm('این عکس مرجع حذف شود؟')) return;
    try {
      await api(`/api/coin-photos/${encodeURIComponent(b.dataset.del)}`, { method: 'DELETE' });
      toast('حذف شد.');
      loadList();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
  loadList();
  if (!admin) return;

  /* ---------------- editor ---------------- */
  const form = $('#pf', root);
  const view = $('#view', root);
  const vg = view.getContext('2d');
  const setLabel = () => (form.elements.label.value = COIN_TYPES[form.elements.coin.value].label.replace(/ \(.*\)$/, ''));
  setLabel();
  form.elements.coin.addEventListener('change', setLabel);

  const scaleOf = (src) => VIEW / Math.max(src.width, src.height);
  function drawView() {
    const src = S.sources[S.view];
    if (!src) return;
    const k = scaleOf(src.canvas);
    view.width = Math.round(src.canvas.width * k); // resizing also clears the canvas
    view.height = Math.round(src.canvas.height * k);
    vg.drawImage(src.canvas, 0, 0, view.width, view.height);
    S.circles.forEach((c, i) => {
      if (c.src !== S.view) return;
      const role = i === S.obv ? 'جلو' : i === S.rev ? 'پشت' : '';
      vg.lineWidth = i === S.sel ? 3 : 1.5;
      vg.strokeStyle = i === S.sel ? '#f7e6b0' : 'rgba(227,184,98,.85)';
      vg.setLineDash(i === S.sel ? [] : [6, 4]);
      vg.beginPath();
      vg.arc(c.cx * k, c.cy * k, c.r * c.scale * k, 0, Math.PI * 2);
      vg.stroke();
      // rotation tick: where "up" of the extracted face will be
      const a = -Math.PI / 2 - c.rot;
      vg.beginPath();
      vg.moveTo(c.cx * k, c.cy * k);
      vg.lineTo((c.cx + Math.cos(a) * c.r * c.scale) * k, (c.cy + Math.sin(a) * c.r * c.scale) * k);
      vg.stroke();
      vg.setLineDash([]);
      if (role) {
        vg.font = '600 15px Vazirmatn';
        vg.fillStyle = '#f7e6b0';
        vg.textAlign = 'center';
        vg.fillText(role, c.cx * k, (c.cy - c.r * c.scale) * k + 18);
      }
    });
  }
  function syncControls() {
    const c = S.circles[S.sel];
    $('#rad', root).value = c ? c.scale : 1;
    $('#rot', root).value = c ? ((c.rot * 180) / Math.PI).toFixed(1) : 0;
    $('#rv', root).textContent = c ? `${fa(Math.round(c.r * c.scale * 2))} پیکسل` : '';
    $('#av', root).textContent = c ? `${fa(((c.rot * 180) / Math.PI).toFixed(1))}°` : '';
    $('#srcs', root).innerHTML = String(S.sources.length > 1 ? html`${S.sources.map((s, i) => html`<button type="button" class="chip" data-src="${i}" aria-pressed="${i === S.view}">عکس ${fa(i + 1)}</button>`)}` : '');
    $('#circs', root).innerHTML = String(html`${S.circles.map((c, i) => html`<button type="button" class="chip" data-circ="${i}" aria-pressed="${i === S.sel}">سکه ${fa(i + 1)}${i === S.obv ? ' · جلو' : i === S.rev ? ' · پشت' : ''}</button>`)}`);
    $('#save', root).disabled = S.busy || !(S.circles[S.obv] && S.circles[S.rev] && S.obv !== S.rev);
  }
  let previewTimer = 0;
  function schedulePreview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(renderPreviews, 160);
  }
  function renderPreviews() {
    for (const [side, face, relief] of [['obv', '#po', '#ho'], ['rev', '#pr', '#hr']]) {
      const c = S.circles[S[side]];
      const fc = $(face, root), hc = $(relief, root);
      const fg = fc.getContext('2d'), hg = hc.getContext('2d');
      fg.clearRect(0, 0, 220, 220);
      hg.clearRect(0, 0, 220, 220);
      if (!c) continue;
      const src = S.sources[c.src].canvas;
      const small = P.extractFace(src, { cx: c.cx, cy: c.cy, r: c.r * c.scale }, { size: 512, rotation: c.rot });
      fg.drawImage(small, 0, 0, 220, 220);
      const r = P.reliefMap(small, { size: 512, invert: S.invert[side], sourcePx: c.r * c.scale * 2 });
      hg.drawImage(P.shadeRelief(r.canvas, 220), 0, 0);
    }
  }
  const refresh = () => {
    drawView();
    syncControls();
    schedulePreview();
  };

  form.elements.files.addEventListener('change', async () => {
    const files = [...form.elements.files.files].slice(0, 2);
    if (!files.length) return;
    msg('در حال خواندن عکس و پیدا کردن سکه…');
    S.sources = [];
    S.circles = [];
    try {
      for (const f of files) {
        if (f.size > 40 * 1024 * 1024) throw new Error('حجم عکس بیش از ۴۰ مگابایت است.');
        S.sources.push({ canvas: await P.loadSource(f), name: f.name });
      }
    } catch (e) {
      msg(e.message && /[؀-ۿ]/.test(e.message) ? e.message : 'این فایل تصویر قابل خواندن نیست.');
      return;
    }
    S.sources.forEach((s, i) => {
      const found = P.detectCoins(s.canvas);
      if (found.length) found.forEach((c) => S.circles.push({ ...c, src: i, scale: 1, rot: 0 }));
      else S.circles.push({ cx: s.canvas.width / 2, cy: s.canvas.height / 2, r: Math.min(s.canvas.width, s.canvas.height) * 0.45, src: i, scale: 1, rot: 0 });
    });
    S.view = 0;
    S.sel = 0;
    S.obv = 0;
    S.rev = S.circles.length > 1 ? 1 : 0;
    S.invert = { obv: null, rev: null };
    $('#edit', root).hidden = false;
    const n = S.circles.length;
    msg(n >= 2 ? `${fa(n)} سکه پیدا شد. جلو و پشت را بررسی کنید (جلوی طرح قدیم: نشان بانک؛ جلوی امامی: نیم‌رخ).` : 'فقط یک سکه پیدا شد؛ عکس روی دیگر را هم انتخاب کنید (دو فایل با هم).');
    refresh();
  });

  // select / drag circles on the preview
  let drag = null;
  const toSrc = (e) => {
    const src = S.sources[S.view].canvas;
    const k = scaleOf(src);
    const box = view.getBoundingClientRect();
    return { x: ((e.clientX - box.left) * (view.width / box.width)) / k, y: ((e.clientY - box.top) * (view.height / box.height)) / k };
  };
  view.addEventListener('pointerdown', (e) => {
    if (!S.sources.length) return;
    const p = toSrc(e);
    let best = -1, bd = Infinity;
    S.circles.forEach((c, i) => {
      if (c.src !== S.view) return;
      const d = Math.hypot(p.x - c.cx, p.y - c.cy);
      if (d < c.r * c.scale && d < bd) (bd = d), (best = i);
    });
    if (best < 0) return;
    S.sel = best;
    drag = { i: best, x: p.x, y: p.y, cx: S.circles[best].cx, cy: S.circles[best].cy };
    view.setPointerCapture(e.pointerId);
    refresh();
  });
  view.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const p = toSrc(e);
    const c = S.circles[drag.i];
    c.cx = drag.cx + (p.x - drag.x);
    c.cy = drag.cy + (p.y - drag.y);
    drawView();
  });
  const endDrag = () => {
    if (!drag) return;
    drag = null;
    refresh();
  };
  view.addEventListener('pointerup', endDrag);
  view.addEventListener('pointercancel', endDrag);

  form.addEventListener('input', (e) => {
    const c = S.circles[S.sel];
    if (!c) return;
    if (e.target.id === 'rad') c.scale = Number(e.target.value);
    else if (e.target.id === 'rot') c.rot = (Number(e.target.value) * Math.PI) / 180;
    else return;
    refresh();
  });
  form.addEventListener('click', (e) => {
    const b = e.target.closest('button[type=button]');
    if (!b) return;
    const d = b.dataset;
    const c = S.circles[S.sel];
    if (d.src) S.view = Number(d.src);
    else if (d.circ) {
      S.sel = Number(d.circ);
      S.view = S.circles[S.sel].src;
    } else if (d.act === 'as-obv' && c) {
      if (S.rev === S.sel) S.rev = S.obv;
      S.obv = S.sel;
    } else if (d.act === 'as-rev' && c) {
      if (S.obv === S.sel) S.obv = S.rev;
      S.rev = S.sel;
    } else if (d.act === 'swap') [S.obv, S.rev] = [S.rev, S.obv];
    else if (d.act === 'rot-' && c) c.rot -= Math.PI / 2;
    else if (d.act === 'rot+' && c) c.rot += Math.PI / 2;
    else if (d.act === 'invert') {
      const side = S.sel === S.rev ? 'rev' : 'obv';
      const cur = S.invert[side];
      // start from the automatic choice, then flip it
      if (cur === null) {
        const cc = S.circles[S[side]];
        const small = P.extractFace(S.sources[cc.src].canvas, { cx: cc.cx, cy: cc.cy, r: cc.r * cc.scale }, { size: 512, rotation: cc.rot });
        S.invert[side] = !P.reliefMap(small, { size: 512, sourcePx: cc.r * cc.scale * 2 }).inverted;
      } else S.invert[side] = !cur;
    }
    if (c) c.rot = Math.atan2(Math.sin(c.rot), Math.cos(c.rot));
    refresh();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (S.busy) return;
    const label = form.elements.label.value.trim();
    if (label.length < 2) return msg('عنوان را بنویسید.');
    S.busy = true;
    syncControls();
    try {
      const sides = {};
      for (const side of ['obv', 'rev']) {
        msg(`در حال ساخت تصویر ۴K ${side === 'obv' ? 'جلوی' : 'پشت'} سکه…`);
        await new Promise((r) => setTimeout(r, 30)); // let the message paint
        const c = S.circles[S[side]];
        const b = P.buildSide(S.sources[c.src].canvas, { cx: c.cx, cy: c.cy, r: c.r * c.scale }, { rotation: c.rot, invert: S.invert[side] });
        sides[side] = { px: b.sourcePx, c4: P.toDataURL(b.c4, 0.92), c2: P.toDataURL(b.c2, 0.9), h: P.toDataURL(b.height, 0.95) };
      }
      msg('در حال ارسال…');
      const r = await api('/api/coin-photos', { method: 'POST', body: { coin: form.elements.coin.value, label, source: form.elements.source.value.trim(), sides } });
      toast('عکس مرجع ذخیره شد.');
      msg('');
      form.reset();
      setLabel();
      S.sources = [];
      S.circles = [];
      $('#edit', root).hidden = true;
      await loadList();
      const a = $$('.photo-item a', root).find((x) => x.href.includes(r.id));
      a?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    } catch (err) {
      msg(err.message || 'ذخیره ممکن نشد.');
    } finally {
      S.busy = false;
      syncControls();
    }
  });
}
