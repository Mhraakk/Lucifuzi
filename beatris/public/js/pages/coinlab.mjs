import { html, fa, api, toast, store, $ } from '../core.mjs';
import { ICON } from '../ui.mjs';
import { fmt } from '../calc.mjs';
import {
  COIN_TYPES, SPECIMENS, LEVELS, RHO, RHO_750, makeSpecimen, pickSpecimen, assessCoin,
  COIN_TESTS, COIN_CONTEXTS, coinLikelihood, coinEvidence, coinTestAccuracy, levelPrior,
  SEAL_TYPES, SEAL_SCENARIOS, SEAL_TESTS, SEAL_CONTEXTS, sealPrior, sealLikelihood, sealAccuracy,
  makePack, pickPack, packEvidence, inquire, PACK_TOL, bayes, rankTests, decide, withFraudRate,
} from '../coins.mjs';

const BEST_KEY = 'beatris.coinlab.best';
const PHOTO_KEY = 'beatris.coinlab.photo';
const COIN_TOOLS = [
  ['scale', 'ترازوی ۰٫۰۰۱'],
  ['caliper', 'کولیس'],
  ['water', 'وزن در آب'],
  ['magnet', 'آهنربا'],
  ['ring', 'صدای ضربه'],
  ['xrf', 'XRF سطح'],
  ['loupe', 'ذره‌بین'],
  ['edge', 'نمای لبه'],
  ['flip', 'پشت و رو'],
  ['rake', 'نور مورب'],
];
const SEAL_TOOLS = Object.entries(SEAL_TESTS).map(([k, v]) => [k, v.label]);
const REAL_TOOLS = [
  ['flip', 'پشت و رو'],
  ['loupe', 'ذره‌بین'],
  ['rake', 'نور مورب'],
  ['edge', 'نمای لبه'],
  ['hq', 'بافت ۴K'],
];
const COMPOSITIONS = [
  ['طلای ۹۰۰ (سکه)', null],
  ['طلای ۷۵۰', RHO_750],
  ['تنگستن', RHO.tungsten],
  ['برنج', RHO.brass],
  ['فولاد', RHO.steel],
  ['سرب', RHO.lead],
];
const f3 = (n) => fmt(n, 3);
const f2 = (n) => fmt(n, 2);
/** Probability as a Persian percentage; never prints a false 0 % or 100 %. */
const pct = (p) => (p < 0.001 ? 'کمتر از ۰٫۱٪' : p > 0.999 ? 'بیش از ۹۹٫۹٪' : `${fmt(p * 100, p < 0.1 || p > 0.9 ? 1 : 0)}٪`);

/** Stamp the training label and the photo credit (required by the photo's licence) onto an exported still. */
async function creditStamp(blob, lines) {
  const bmp = await createImageBitmap(blob);
  const cv = document.createElement('canvas');
  cv.width = bmp.width;
  cv.height = bmp.height;
  const g = cv.getContext('2d');
  g.drawImage(bmp, 0, 0);
  bmp.close?.();
  const fs = Math.round(cv.height * 0.017);
  g.font = `500 ${fs}px Vazirmatn`;
  g.direction = 'rtl';
  g.textAlign = 'right';
  const w = Math.max(...lines.map((l) => g.measureText(l).width)) + fs * 1.6;
  const h = lines.length * fs * 1.55 + fs * 0.8;
  g.fillStyle = 'rgba(8, 7, 5, 0.55)';
  g.fillRect(cv.width - w - fs, cv.height - h - fs, w, h);
  g.fillStyle = 'rgba(247, 230, 176, 0.92)';
  lines.forEach((l, i) => g.fillText(l, cv.width - fs * 1.8, cv.height - h - fs + fs * 1.45 + i * fs * 1.55));
  return new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('encode'))), 'image/png'));
}

/** A URL parameter is used only if it names one of the table's own keys (never "toString" and the like). */
const pickKey = (table, key, fallback) => (key != null && Object.hasOwn(table, key) ? key : fallback);

function disposeTree(obj) {
  obj.traverse((o) => {
    o.geometry?.dispose?.();
    for (const m of [].concat(o.material ?? [])) {
      m.map?.dispose?.();
      m.dispose?.();
    }
  });
}

export async function coinLabPage(root) {
  const q = new URLSearchParams(location.search);
  const mode = q.get('mode');
  const S = {
    area: mode === 'seal' || mode === 'sealgame' ? 'seal' : mode === 'real' ? 'real' : 'coin',
    game: mode === 'game' || mode === 'sealgame',
    photo: q.get('item'),
    photos: null,
    realSide: 'obv',
    photoMode: true, // render coins from real photographs where the app has them
    coin: pickKey(COIN_TYPES, q.get('coin'), 'emami'),
    kind: pickKey(SPECIMENS, q.get('kind'), 'genuine'),
    sealType: pickKey(SEAL_TYPES, q.get('seal'), 'bank'),
    scenario: pickKey(SEAL_SCENARIOS, q.get('scenario'), 'S0'),
    coinCtx: 'counter',
    sealCtx: 'market',
    rate: null, // user override of the overall fraud rate (study only)
    level: 1,
    seed: Number(q.get('seed')) > 0 ? Math.floor(Number(q.get('seed'))) : Math.floor(Math.random() * 1e6),
    specimen: null,
    pack: null,
    measured: {},
    answered: false,
    score: 0,
    streak: 0,
    rounds: 0,
  };
  if (!SEAL_TYPES[S.sealType].scenarios.includes(S.scenario)) S.scenario = 'S0';
  try {
    S.best = Number(localStorage.getItem(BEST_KEY)) || 0;
    S.photoMode = localStorage.getItem(PHOTO_KEY) !== 'off';
  } catch {
    S.best = 0;
  }

  root.innerHTML = String(html`<div class="studio3d coinlab">
    <div class="viewport" id="vp">
      <div class="hud">
        <div class="chips"><a class="iconbtn" href="/learn/c-coins" data-link title="دوره تشخیص سکه">${ICON.learn}</a><button class="iconbtn" data-act="frame" title="نمای کامل">${ICON.orbit}</button><button class="iconbtn" data-act="spin" title="چرخش خودکار" aria-pressed="false">${ICON.rotate}</button></div>
        <div class="lab-title" id="ltitle"></div>
      </div>
      <div class="readout" id="readout"></div>
      <div class="toolbar"><button class="iconbtn" data-act="shot" title="عکس ۴K">${ICON.camera}</button></div>
    </div>
    <aside class="panel" id="panel"><div class="loading"><span></span></div></aside>
  </div>`);
  const vp = $('#vp', root);
  const panel = $('#panel', root);

  const [{ createStage, T }, C3] = await Promise.all([import('../three/stage.mjs'), import('../three/coins3d.mjs')]);
  const stage = createStage(vp, { env: 'room', backdrop: 'vault' });
  if (!stage) return;
  stage.controls.minDistance = 4;
  stage.setExposure(0.85);
  const coinGroup = new T.Group();
  coinGroup.rotation.x = -0.32;
  stage.root.add(coinGroup);
  const fx = new T.Group(); // tool props (magnet, caliper lines)
  stage.scene.add(fx);
  const rake = new T.DirectionalLight(0xfff1dc, 0);
  stage.scene.add(rake, rake.target);

  if (q.has('debuglab')) window.__lab = { stage, coinGroup, T }; // TMPDEBUG
  const seal = () => S.area === 'seal';
  const real = () => S.area === 'real';
  const urlFor = () => (real() ? `/coins?mode=real${S.photo ? `&item=${encodeURIComponent(S.photo)}` : ''}` : seal() ? (S.game ? '/coins?mode=sealgame' : '/coins?mode=seal') : S.game ? '/coins?mode=game' : '/coins');
  // 4K textures load by themselves on desktops; phones fetch them when the loupe or a 4K still needs them
  const autoHQ = () => stage.renderer.capabilities.maxTextureSize >= 4096 && !matchMedia('(pointer: coarse)').matches;
  const photoSpec = (coinId) => {
    const c = COIN_TYPES[coinId];
    return { coinId, kind: 'genuine', seed: 1, diameter: c.diameter, thickness: c.thickness, weight: c.weight, magnetic: false, reeds: { count: c.reeds, depth: 1, regular: true }, look: { soft: 0, pores: 0, plug: false, seam: false, beads: 72, font: 'Markazi', tint: 0 } };
  };
  const currentPhoto = () => S.photos?.find((p) => p.id === S.photo) ?? null;
  // uploaded photographs come first in the list, so a branch's own photo wins over the built-in one
  const photoFor = (coinId) => (S.photoMode && S.photos ? S.photos.find((p) => p.coin === coinId) ?? null : null);
  const isPhoto = () => !!photoObj && coinMesh === photoObj.mesh;

  /* ---------------- specimen / pack ---------------- */
  let coinMesh = null;
  let sealMesh = null;
  let buildId = 0;
  let photoObj = null;
  const dropPhoto = () => {
    if (!photoObj) return;
    coinGroup.remove(photoObj.mesh);
    photoObj.dispose();
    if (coinMesh === photoObj.mesh) coinMesh = null;
    photoObj = null;
  };
  async function build({ reframe = true, quality = 1 } = {}) {
    if (real()) return buildReal({ reframe });
    const id = ++buildId;
    if (seal()) {
      S.pack = S.game ? pickPack(S.seed) : makePack(S.sealType, S.scenario, S.seed);
      S.specimen = S.pack.coin;
    } else {
      S.pack = null;
      S.specimen = S.game ? pickSpecimen(S.level, S.seed) : makeSpecimen(S.coin, S.kind, S.seed);
    }
    S.measured = {};
    S.answered = false;
    S.lastTool = null;
    setTitle(); // the title belongs to the specimen, not to its (possibly slow) 3D model
    await document.fonts.load('700 50px Markazi', 'نمونه ۱۴۰۵');
    await document.fonts.load('700 50px Vazirmatn', 'نمونه ۱۴۰۵');
    if (id !== buildId) return;
    // the real photograph (altered per counterfeit) where the app has one; the stylised coin otherwise
    const photo = photoFor(S.specimen.coinId);
    let pc = null;
    if (photo) {
      S.loading = true;
      updateReadout();
      pc = await C3.photoCoin(photo, S.specimen, { quality, anisotropy: stage.renderer.capabilities.getMaxAnisotropy() }).catch(() => null);
      S.loading = false;
      if (id !== buildId) return pc?.dispose();
    }
    dropPhoto();
    if (coinMesh) {
      coinGroup.remove(coinMesh);
      coinMesh.geometry.dispose();
      coinMesh = null;
    }
    if (pc) {
      photoObj = pc;
      coinMesh = pc.mesh;
    } else {
      coinMesh = new T.Mesh(C3.coinGeometry(S.specimen, { quality }), C3.coinMaterial(S.specimen));
      coinMesh.castShadow = true;
    }
    coinGroup.add(coinMesh);
    if (sealMesh) {
      coinGroup.remove(sealMesh);
      disposeTree(sealMesh);
      sealMesh = null;
    }
    if (S.pack) {
      sealMesh = C3.sealPackage(S.pack);
      coinGroup.add(sealMesh);
    }
    coinGroup.rotation.set(-0.32, 0, 0);
    coinGroup.position.set(0, 0, 0);
    rakeOff();
    stage.ground();
    if (reframe) home();
    stage.invalidate();
    renderPanel();
  }
  async function buildReal({ reframe = true } = {}) {
    const id = ++buildId;
    S.measured = {};
    S.lastTool = null;
    S.answered = false;
    S.realSide = 'obv';
    if (!S.photos) {
      renderPanel();
      S.photos = await api('/api/coin-photos').then((r) => r.items, () => []);
      if (id !== buildId) return;
    }
    const item = currentPhoto() ?? S.photos[0] ?? null;
    S.photo = item?.id ?? null;
    history.replaceState({}, '', urlFor());
    if (coinMesh && coinMesh !== photoObj?.mesh) {
      coinGroup.remove(coinMesh);
      coinMesh.geometry.dispose();
      coinMesh = null;
    }
    if (sealMesh) {
      coinGroup.remove(sealMesh);
      disposeTree(sealMesh);
      sealMesh = null;
    }
    S.pack = null;
    if (!item) {
      dropPhoto();
      renderPanel();
      return;
    }
    S.specimen = photoSpec(item.coin);
    S.loading = true;
    renderPanel();
    let pc;
    try {
      pc = await C3.photoCoin(item, S.specimen, { anisotropy: stage.renderer.capabilities.getMaxAnisotropy() });
    } catch {
      if (id === buildId) {
        S.loading = false;
        updateReadout();
        toast('بارگذاری عکس‌های این سکه ممکن نشد؛ دوباره تلاش کنید.', 'error');
      }
      return;
    }
    if (id !== buildId) return pc.dispose();
    S.loading = false;
    dropPhoto();
    photoObj = pc;
    coinMesh = pc.mesh;
    coinGroup.add(coinMesh);
    coinGroup.rotation.set(-0.32, 0, 0);
    coinGroup.position.set(0, 0, 0);
    rakeOff();
    stage.ground();
    // place the camera at once: texture uploads may hold the main thread for a moment
    if (reframe) stage.frame(stage.root, { pitch: 0.25, yaw: 0.35, pad: 1.35, instant: true });
    stage.invalidate();
    renderPanel();
    if (autoHQ()) setTimeout(() => photoObj === pc && upgradeHQ(false), 900);
  }
  async function upgradeHQ(tell = true) {
    const pc = photoObj;
    if (!pc || pc.hi) return;
    if (tell) toast('بافت ۴K در حال بارگذاری است…');
    await pc.upgrade().catch(() => {});
    if (photoObj !== pc) return;
    stage.invalidate();
    if (real()) renderPanel();
  }

  const home = () => (seal() ? stage.frame(stage.root, { pitch: 0.15, yaw: 0.2, pad: 1.2 }) : stage.frame(stage.root, { pitch: 0.25, yaw: 0.35, pad: 1.35 }));

  /* ---------------- probability model for the current item ---------------- */
  function model() {
    if (seal()) {
      const type = S.pack.type;
      const ctx = S.game ? 'drill' : S.sealCtx;
      const prior = sealPrior(ctx, type, S.game ? null : S.rate);
      const tests = Object.keys(SEAL_TESTS).filter((t) => S.measured[t]);
      return {
        prior,
        lik: sealLikelihood(type),
        ev: packEvidence(S.pack, tests),
        all: Object.keys(SEAL_TESTS),
        safe: 'S0',
        name: (h) => SEAL_SCENARIOS[h].short,
        testName: (t) => SEAL_TESTS[t].label,
        acc: (t) => sealAccuracy(t, type),
        ctxLabel: SEAL_CONTEXTS[ctx].label,
      };
    }
    const s = S.specimen;
    const base = S.game ? levelPrior(S.level) : COIN_CONTEXTS[S.coinCtx].prior;
    const prior = Object.fromEntries(Object.entries(S.game || S.rate == null ? base : withFraudRate(base, 'genuine', S.rate)).filter(([, p]) => p > 0));
    const tests = Object.keys(COIN_TESTS).filter((t) => S.measured[t]);
    return {
      prior,
      lik: coinLikelihood(s.coinId),
      ev: coinEvidence(s, tests),
      all: Object.keys(COIN_TESTS),
      safe: 'genuine',
      name: (h) => SPECIMENS[h].label,
      testName: (t) => COIN_TESTS[t].label,
      acc: (t) => coinTestAccuracy(t, s.coinId),
      ctxLabel: S.game ? `آزمون سطح ${LEVELS.find((l) => l.id === S.level).label}` : COIN_CONTEXTS[S.coinCtx].label,
    };
  }

  function meterHtml() {
    const M = model();
    const post = bayes(M.prior, M.lik, M.ev);
    const pf = 1 - post[M.safe];
    const d = decide(pf);
    const top = Object.entries(post).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const next = rankTests(M.prior, M.lik, M.ev, M.all, M.safe)[0];
    const baseFraud = 1 - M.prior[M.safe];
    const used = Object.keys(M.ev);
    const ctxs = seal() ? Object.entries(SEAL_CONTEXTS).filter(([k]) => k !== 'drill') : Object.entries(COIN_CONTEXTS);
    const ctxNow = seal() ? S.sealCtx : S.coinCtx;
    return html`<div class="grp meter" id="meter">
      <h3><span>سنجه احتمال تقلب</span><span class="small">${M.ctxLabel}</span></h3>
      <div class="pf"><b data-pf="${pf.toFixed(6)}">${pct(pf)}</b><span class="band ${d.key}">${d.label}</span></div>
      <div class="pbar"><i style="width:${Math.max(0.5, pf * 100).toFixed(2)}%"></i><em style="inset-inline-start:${(baseFraud * 100).toFixed(2)}%" title="پیش از هر آزمون"></em></div>
      <p class="small note">${d.note} پیش از آزمون: ${pct(baseFraud)}.</p>
      <div class="hyp">${top.map(([h, p]) => html`<span>${M.name(h)}</span><i><b style="width:${(p * 100).toFixed(2)}%"></b></i><em>${pct(p)}</em>`)}</div>
      ${next
        ? html`<div class="next"><span class="small">آزمون پیشنهادی بعدی</span><button class="chip" data-tool="${next.test}">${M.testName(next.test)}</button><p class="small">اگر هشدار دهد: ${pct(next.ifFlag)} · اگر پاک باشد: ${pct(next.ifClear)}</p></div>`
        : html`<p class="small next">همه آزمون‌ها انجام شده است.</p>`}
      ${S.game
        ? ''
        : html`<div class="ctx"><div class="chips">${ctxs.map(([k, v]) => html`<button class="chip" data-ctx="${k}" aria-pressed="${k === ctxNow && S.rate == null}">${v.label}</button>`)}</div>
          <label class="param"><span class="lbl"><span>نرخ پایه تقلب در این بازار</span><b>${pct(baseFraud)}</b></span><input type="range" min="-3" max="-0.301" step="0.01" value="${Math.log10(Math.max(0.001, Math.min(0.5, baseFraud))).toFixed(2)}" data-rate aria-label="نرخ پایه تقلب"></label></div>`}
      <details class="coef"><summary>ضرایب و محاسبه (بیز)</summary>
        <p class="small">P(هشدار | فرضیه) = a × حساسیت + (۱ − a) × هشدار کاذب؛ a یعنی احتمال آنکه آن فرضیه واقعاً این نشانه را داشته باشد. پسین = پیشین × حاصل‌ضرب درست‌نمایی‌ها، سپس نرمال‌سازی.</p>
        <table class="ctab"><thead><tr><th>آزمون</th><th>حساسیت</th><th>هشدار کاذب</th><th>نتیجه</th><th>ضریب اثر</th></tr></thead><tbody>
          ${M.all.map((t) => {
            const a = M.acc(t);
            const lr = t in M.ev ? (M.ev[t] ? a.sens / a.fp : (1 - a.sens) / (1 - a.fp)) : null;
            return html`<tr class="${t in M.ev ? 'on' : ''}"><td>${M.testName(t)}</td><td>${pct(a.sens)}</td><td>${pct(a.fp)}</td><td>${t in M.ev ? (M.ev[t] ? 'هشدار' : 'پاک') : '—'}</td><td>${lr == null ? '—' : lr >= 1 ? `×${fmt(lr, lr < 10 ? 1 : 0)}` : `÷${fmt(1 / lr, 1 / lr < 10 ? 1 : 0)}`}</td></tr>`;
          })}
        </tbody></table>
        <p class="small">«ضریب اثر» نسبت درست‌نمایی همان آزمون (حساسیت به هشدار کاذب) است برای شهود؛ عدد بالا با همه فرضیه‌ها جداگانه و دقیق حساب می‌شود. ضرایب آموزشی‌اند و آمار رسمی بازار نیستند. ${used.length ? `تاکنون ${fa(used.length)} آزمون در محاسبه آمده.` : 'هنوز آزمونی انجام نشده.'}</p>
      </details>
    </div>`;
  }

  /* ---------------- panel ---------------- */
  function renderPanel() {
    const keep = panel.scrollTop;
    queueMicrotask(() => (panel.scrollTop = keep));
    setTitle();
    const game = S.game;
    panel.innerHTML = String(html`
      <div class="sheet-handle" data-sheet role="button" aria-label="باز و بسته کردن"></div>
      <div class="grp">
        <div class="seg" role="group" style="width:100%"><button data-area="coin" aria-pressed="${S.area === 'coin'}">سکه</button><button data-area="seal" aria-pressed="${seal()}">پلمپ و بسته</button><button data-area="real" aria-pressed="${real()}">سکه واقعی</button></div>
        ${real() ? '' : html`<div class="seg" role="group" style="width:100%;margin-top:8px"><button data-game="0" aria-pressed="${!game}">مطالعه</button><button data-game="1" aria-pressed="${game}">${seal() ? 'آزمون: سالم یا دستکاری؟' : 'آزمون: اصل یا تقلبی؟'}</button></div>`}
        ${!real() && S.photos?.length ? html`<div class="chips" style="margin-top:8px"><button class="chip" data-photomode="1" aria-pressed="${S.photoMode}">عکس واقعی</button><button class="chip" data-photomode="0" aria-pressed="${!S.photoMode}">طرح آموزشی</button><span class="small" style="align-self:center">${S.photoMode ? (isPhoto() ? 'این سکه از عکس واقعی ساخته شده' : 'برای این نوع سکه هنوز عکسی ثبت نشده') : ''}</span></div>` : ''}
      </div>
      ${real() ? realPanel() : html`${seal() ? sealChooser() : coinChooser()}
      <div class="grp">
        <h3><span>${seal() ? 'بازرسی بسته (بدون باز کردن)' : 'ابزار بازرسی'}</span>${seal() && !game ? html`<span class="small">${SEAL_TYPES[S.sealType].label}</span>` : ''}</h3>
        <div class="lab-tools">${(seal() ? SEAL_TOOLS : COIN_TOOLS).map(([k, l]) => html`<button data-tool="${k}" class="${S.measured[k] ? 'done' : ''}">${l}</button>`)}</div>
        <label class="param" style="margin-top:12px" ${S.measured.rake || S.measured.holo ? '' : 'hidden'}><span class="lbl"><span>زاویه نور مورب</span></span><input type="range" min="0" max="360" step="1" value="${S.rakeAngle ?? 40}" data-rake aria-label="زاویه نور"></label>
      </div>
      <div class="grp">
        <h3><span>نتیجه‌ها</span><span class="small">${seal() ? `مرجع: بسته سالم ${SEAL_TYPES[S.pack.type].label}` : `مرجع: ${COIN_TYPES[S.specimen.coinId].label}`}</span></h3>
        ${seal() ? sealTable() : measuredTable()}
        <canvas id="ringplot" width="600" height="150" style="width:100%;height:auto;margin-top:10px" ${S.measured.ring && !seal() ? '' : 'hidden'}></canvas>
      </div>
      ${!game || S.answered ? meterHtml() : ''}
      ${game ? answerHtml() : seal() ? html`<div class="grp"><h3><span>استعلام درست</span></h3><p class="small">${SEAL_TYPES[S.sealType].inquiry}</p></div>` : html`<div class="grp"><h3><span>مشخصات مرجع</span></h3>${refTable(COIN_TYPES[S.specimen.coinId])}</div>`}`}
    `);
    if (S.measured.ring && S.area === 'coin') drawRingPlot();
    updateReadout();
  }
  function setTitle() {
    const t = $('#ltitle', root);
    if (real()) {
      t.textContent = currentPhoto()?.label ?? 'سکه واقعی';
      return;
    }
    if (seal()) {
      const p = S.pack;
      t.textContent = S.game && !S.answered ? `بسته ناشناس · ${SEAL_TYPES[p.type].label}` : `${SEAL_TYPES[p.type].label} · ${SEAL_SCENARIOS[p.scenario].short}`;
    } else {
      const s = S.specimen;
      t.textContent = S.game && !S.answered ? 'سکه ناشناس' : `${COIN_TYPES[s.coinId].short} · ${SPECIMENS[s.kind].label}`;
    }
  }

  function realPanel() {
    if (!S.photos) return html`<div class="grp"><p class="small">در حال بارگذاری عکس‌ها…</p></div>`;
    const admin = store.isAdmin();
    const add = admin ? html`<div class="actions" style="margin-top:10px"><a class="btn small ghost" href="/coins/manage" data-link>افزودن یا مدیریت عکس‌ها</a></div>` : '';
    if (!S.photos.length) return html`<div class="grp"><p class="small">هنوز عکسی ثبت نشده است.</p>${add}</div>`;
    const it = currentPhoto();
    const side = it?.sides[S.realSide];
    const c = it ? COIN_TYPES[it.coin] : null;
    return html`<div class="grp">
        <h3><span>سکه‌های واقعی</span><span class="small">${fa(S.photos.length)} مرجع</span></h3>
        <div class="chips">${S.photos.map((p) => html`<button class="chip" data-photo="${p.id}" aria-pressed="${p.id === S.photo}">${p.label}</button>`)}</div>
        ${add}
      </div>
      <div class="grp">
        <h3><span>بازرسی</span></h3>
        <div class="lab-tools">${REAL_TOOLS.map(([k, l]) => html`<button data-tool="${k}" class="${(k === 'hq' ? photoObj?.hi : S.measured[k]) ? 'done' : ''}">${l}</button>`)}</div>
        <label class="param" style="margin-top:12px" ${S.measured.rake || S.measured.loupe ? '' : 'hidden'}><span class="lbl"><span>زاویه نور مورب</span></span><input type="range" min="0" max="360" step="1" value="${S.rakeAngle ?? 40}" data-rake aria-label="زاویه نور"></label>
      </div>
      ${it
        ? html`<div class="grp">
        <h3><span>${S.realSide === 'obv' ? 'جلوی سکه' : 'پشت سکه'}</span><span class="small">${photoObj?.hi ? 'بافت ۴۰۹۶' : 'بافت ۲۰۴۸'}</span></h3>
        <p class="small">${side.label ?? ''}</p>
        <div class="kv" style="margin-top:8px"><span>وضوح واقعی عکس</span><b>${fa(side.px)} پیکسل در قطر</b><span>بافت نمایش</span><b>${photoObj?.hi ? '۴۰۹۶ × ۴۰۹۶' : '۲۰۴۸ × ۲۰۴۸'}</b></div>
        <p class="small" style="margin-top:8px">جزئیات نقش دقیقاً همان عکس است: تصویر ۴K فقط بازنمونه‌گیری دقیق است و هیچ جزئیاتی ساخته یا حدس زده نشده. برجستگی سه‌بعدی از خود عکس تخمین زده شده تا نور مورب روی آن بنشیند؛ مرجع شمارش دانه‌ها و قلم نوشته‌ها خود عکس است.</p>
      </div>
      <div class="grp"><h3><span>مشخصات مرجع</span></h3>${refTable(c)}</div>
      <div class="grp"><h3><span>منبع عکس</span></h3><p class="small">${it.credit?.text || 'عکس ثبت‌شده در شعبه'}${it.credit?.url ? html` · <a href="${it.credit.url}" target="_blank" rel="noopener noreferrer">صفحه منبع</a>` : ''}</p></div>`
        : ''}`;
  }

  function coinChooser() {
    if (S.game) {
      const L = LEVELS.find((l) => l.id === S.level);
      return html`<div class="grp">
        <h3><span>سطح</span><span class="small">امتیاز ${fa(S.score)} از ${fa(S.rounds)} · زنجیره ${fa(S.streak)} · بهترین ${fa(S.best)}</span></h3>
        <div class="chips">${LEVELS.map((l) => html`<button class="chip" data-level="${l.id}" aria-pressed="${l.id === S.level}">${l.label}</button>`)}</div>
        <p class="small" style="margin-top:8px">در این سطح: سکه اصل، ${L.kinds.filter((k) => k !== 'genuine').map((k) => SPECIMENS[k].label).join('، ')}. سنجه احتمال پس از رأی شما نشان داده می‌شود.</p>
      </div>`;
    }
    return html`<div class="grp">
      <h3><span>سکه</span></h3>
      <div class="chips">${Object.entries(COIN_TYPES).map(([k, v]) => html`<button class="chip" data-coin="${k}" aria-pressed="${k === S.coin}">${v.short}</button>`)}</div>
      <h3 style="margin-top:14px"><span>نمونه</span></h3>
      <div class="chips">${Object.entries(SPECIMENS).map(([k, v]) => html`<button class="chip" data-kind="${k}" aria-pressed="${k === S.kind}">${v.label}</button>`)}</div>
      <div class="tell"><b>${SPECIMENS[S.kind].label}</b><p>${SPECIMENS[S.kind].tell}</p></div>
    </div>`;
  }
  function sealChooser() {
    if (S.game)
      return html`<div class="grp">
        <h3><span>آزمون پلمپ</span><span class="small">امتیاز ${fa(S.score)} از ${fa(S.rounds)} · زنجیره ${fa(S.streak)}</span></h3>
        <p class="small">هر بسته از یکی از سناریوهای واقعی می‌آید (در این آزمون حدود نیمی سالم‌اند). با کمترین آزمون لازم تصمیم بگیرید؛ سنجه احتمال پس از رأی نشان می‌دهد شواهد شما چقدر قطعی بود.</p>
      </div>`;
    const p = S.pack;
    const present = Object.entries(p.anomalies).filter(([, v]) => v).map(([k]) => SEAL_TESTS[k].label);
    return html`<div class="grp">
      <h3><span>نوع بسته</span></h3>
      <div class="chips">${Object.entries(SEAL_TYPES).map(([k, v]) => html`<button class="chip" data-stype="${k}" aria-pressed="${k === S.sealType}">${v.label}</button>`)}</div>
      <h3 style="margin-top:14px"><span>سناریو</span></h3>
      <div class="chips">${SEAL_TYPES[S.sealType].scenarios.map((k) => html`<button class="chip" data-scen="${k}" aria-pressed="${k === S.scenario}">${SEAL_SCENARIOS[k].short}</button>`)}</div>
      <div class="tell"><b>${SEAL_SCENARIOS[S.scenario].label}</b><p>${SEAL_SCENARIOS[S.scenario].tell}</p>
        <p><b>در این نمونه:</b> ${present.length ? present.join('، ') : 'هیچ نشانه بیرونی ندارد'} · سکه داخل: ${p.note}${p.coin.coinId !== p.card ? ` (${COIN_TYPES[p.coin.coinId].short})` : ''}</p>
        <div class="actions" style="margin-top:8px"><button class="btn small ghost" data-act="another">نمونه دیگر از همین سناریو</button></div>
      </div>
    </div>`;
  }

  const row = (label, val, ref, bad) => html`<span>${label}</span><b>${val}${ref ? html`<small class="ref"> / ${ref}</small>` : ''}${!S.game && bad !== undefined ? html` <i class="dot ${bad ? 'bad' : 'on'}"></i>` : ''}</b>`;
  function measuredTable() {
    const s = S.specimen;
    const c = COIN_TYPES[s.coinId];
    const m = S.measured;
    const flags = new Set(assessCoin(s).map((f) => f.key));
    const rows = [];
    if (m.scale) rows.push(row('وزن', `${f3(s.weight)} گرم`, `${f3(c.weight)}`, flags.has('weight')));
    if (m.caliper) rows.push(row('قطر', `${f2(s.diameter)} mm`, `≈ ${f2(c.diameter)}`, flags.has('diameter')), row('ضخامت لبه', `${f2(s.thickness)} mm`, `≈ ${f2(c.thickness)}`));
    if (m.water) {
      const guess = nearestComposition(s.density, c);
      rows.push(row('وزن در هوا / آب', `${f3(s.airWeight)} / ${f3(s.waterWeight)}`), row('چگالی', `${f2(s.density)} g/cm³`, `${f2(c.density)}`, flags.has('density')), row('نزدیک‌ترین ترکیب', guess));
    }
    if (m.magnet) rows.push(row('آهنربا', s.magnetic ? 'جذب می‌کند' : 'واکنشی ندارد', 'واکنشی ندارد', flags.has('magnet')));
    if (m.ring) rows.push(row('طنین صدا', `${f2(s.ring.decay)} ثانیه${s.ring.dull ? ' (خفه)' : ''}`, 'حدود ۱٫۶', flags.has('ring')));
    if (m.xrf) rows.push(row('XRF سطح', `${fa(s.xrf.fineness)} · ${s.xrf.elements.join('، ')}`, `${fa(c.fineness)} · طلا، مس`, flags.has('xrf')));
    if (m.edge) rows.push(row('دندانه لبه', `${fa(s.reeds.count)} عدد · ${s.reeds.regular && s.reeds.depth >= 0.8 ? 'منظم و عمیق' : 'کم‌عمق / نامنظم'}${s.look.seam ? ' · خط درز' : ''}`, `${fa(c.reeds)} منظم`, flags.has('reeds')));
    if (m.loupe) rows.push(row('ذره‌بین', loupeText(s), 'لبه‌های تیز، بدون حفره', flags.has('detail') || flags.has('plug') || flags.has('die')));
    return rows.length ? html`<div class="kv">${rows}</div>` : html`<p class="small">یک ابزار را بزنید. هر ابزار فقط بخشی از حقیقت را نشان می‌دهد؛ سنجه احتمال نشان می‌دهد هر نتیجه چقدر باور شما را جابه‌جا می‌کند.</p>`;
  }
  function sealTable() {
    const p = S.pack;
    const ev = packEvidence(p);
    const rows = [];
    for (const [t, v] of Object.entries(SEAL_TESTS)) {
      if (!S.measured[t]) continue;
      let val = ev[t] ? v.flag : v.clear;
      let ref = '';
      if (t === 'weight') {
        val = `${f3(p.packWeight)} گرم`;
        ref = `بسته مرجع ${f3(p.expectedWeight)} ± ${fa(Math.round(PACK_TOL * 1000))} میلی‌گرم`;
      } else if (t === 'serial') val = `${fa(p.serial)} — ${inquire(p).text}`;
      else if (t === 'link' && p.link) val = `${v.flag}: ${p.link}`;
      rows.push(row(v.label, val, ref, ev[t]));
    }
    return rows.length ? html`<div class="kv">${rows}</div>` : html`<p class="small">بسته را باز نکنید. از بیرون بازرسی کنید: هولوگرام را زیر نور بچرخانید، لبه پرس را با ذره‌بین ببینید، کارت را با سکه داخل تطبیق دهید، کل بسته را وزن کنید و سریال را فقط از مسیر رسمی استعلام کنید.</p>`;
  }
  function loupeText(s) {
    const bits = [];
    if (isPhoto()) {
      if (s.look.soft) bits.push('جزئیات نرم و گرد');
      if (s.look.pores) bits.push('حفره‌های ریز');
      if (s.look.plug) bits.push('حلقه پرشده روی زمینه');
      if (s.look.beads !== 72) bits.push('نقش مرکزی کمی کوچک‌تر و چرخیده نسبت به حاشیه (قالب کپی)');
      return bits.length ? bits.join('، ') : 'لبه‌های نقش تیز، زمینه یکدست، نقش هم‌تراز با مرجع';
    }
    if (s.look.soft) bits.push('جزئیات نرم و گرد');
    if (s.look.pores) bits.push('حفره‌های ریز');
    if (s.look.plug) bits.push('حلقه پرشده روی زمینه');
    if (s.look.beads !== 72) bits.push(`${fa(s.look.beads)} دانه در حاشیه (مرجع ۷۲)`);
    if (s.look.font !== 'Markazi') bits.push('قلم نوشته متفاوت');
    return bits.length ? bits.join('، ') : 'لبه‌های نقش تیز، زمینه یکدست، ۷۲ دانه حاشیه';
  }
  function nearestComposition(d, c) {
    const list = COMPOSITIONS.map(([l, v]) => [l, v ?? c.density]);
    list.sort((a, b) => Math.abs(a[1] - d) - Math.abs(b[1] - d));
    return `${list[0][0]} (${f2(list[0][1])})`;
  }
  function refTable(c) {
    return html`<div class="kv">
      <span>وزن اسمی</span><b>${f3(c.weight)} گرم</b>
      <span>عیار</span><b>${fa(c.fineness)} (${c.fineness === 900 ? '۲۱٫۶ عیار' : '۱۸ عیار'})</b>
      <span>طلای خالص</span><b>${f3(c.pure)} گرم</b>
      <span>چگالی آلیاژ (محاسبه‌شده)</span><b>${f2(c.density)}</b>
      <span>قطر (تقریبی آموزشی)</span><b>${f2(c.diameter)} mm</b>
      <span>وضعیت</span><b>${c.legal ? 'سکه رسمی بانک مرکزی' : 'قطعه طلای غیررسمی؛ قیمت با وزن و اجرت'}</b>
    </div><p class="small" style="margin-top:8px">قطرها و شمار دندانه در این آزمایشگاه عددهای آموزشی‌اند؛ پیش از داوری، همیشه با یک سکه مرجع سالم کنار هم مقایسه کنید.</p>`;
  }

  function answerHtml() {
    if (S.answered) return html`<div class="grp" id="answer">${verdictHtml()}</div>`;
    if (seal())
      return html`<div class="grp" id="answer"><h3><span>رأی شما</span></h3>
        <div class="actions" style="margin-top:0"><button class="btn small" data-verdict="S0">بسته سالم است</button></div>
        <div class="small" style="margin:10px 0 6px">یا نوع دستکاری را انتخاب کنید:</div>
        <div class="chips">${SEAL_TYPES[S.pack.type].scenarios.filter((k) => k !== 'S0').map((k) => html`<button class="chip" data-verdict="${k}">${SEAL_SCENARIOS[k].short}</button>`)}</div></div>`;
    const L = LEVELS.find((l) => l.id === S.level);
    return html`<div class="grp" id="answer"><h3><span>رأی شما</span></h3>
      <div class="actions" style="margin-top:0"><button class="btn small" data-verdict="genuine">اصل است</button></div>
      <div class="small" style="margin:10px 0 6px">یا نوع تقلب را انتخاب کنید:</div>
      <div class="chips">${L.kinds.filter((k) => k !== 'genuine').map((k) => html`<button class="chip" data-verdict="${k}">${SPECIMENS[k].label}</button>`)}</div></div>`;
  }
  function verdictHtml() {
    const ok = S.lastCorrect;
    const M = model();
    const pf = 1 - bayes(M.prior, M.lik, M.ev)[M.safe];
    const bayesSaysFraud = decide(pf).key !== 'accept';
    const verdictFraud = S.lastGuess !== M.safe;
    const bayesLine = html`<p class="small">با شواهدی که گرفتید، سنجه احتمال تقلب را ${pct(pf)} می‌داد (${decide(pf).label}). ${verdictFraud === bayesSaysFraud ? 'رأی شما با منطق شواهد هم‌خوان بود.' : bayesSaysFraud ? 'شواهد برای «سالم» گفتن کافی نبود؛ آزمون بیشتری لازم بود.' : 'شواهد شما تقلب را نشان نمی‌داد؛ رأی باید بر پایه شواهد باشد، نه حدس.'}</p>`;
    if (seal()) {
      const p = S.pack;
      const hidden = p.fraud && !Object.values(packEvidence(p)).some(Boolean);
      return html`<div class="verdict ${ok || hidden ? 'good' : 'badv'}">
        <b>${ok ? 'درست تشخیص دادید' : hidden ? 'این دستکاری از بیرون پیدا نبود' : 'تشخیص نادرست'}</b>
        <p>این بسته: <strong>${SEAL_SCENARIOS[p.scenario].label}</strong></p>
        ${ok && p.fraud ? html`<p class="small">${S.typeRight ? 'نوع دستکاری را هم درست گفتید.' : `دستکاری را درست گرفتید؛ اما سناریو «${SEAL_SCENARIOS[p.scenario].short}» بود، نه «${SEAL_SCENARIOS[S.lastGuess].short}».`}</p>` : ''}
        ${hidden && !ok ? html`<p class="small">هیچ نشانه بیرونی نداشت؛ امتیاز منفی نمی‌گیرد. در معامله واقعی، همین احتمال باقی‌مانده دلیل استعلام رسمی و خرید از منبع معتبر است.</p>` : ''}
        <p class="small">${SEAL_SCENARIOS[p.scenario].tell} سکه داخل: ${p.note}.</p>
        ${bayesLine}
        <div class="actions"><button class="btn small" data-act="next">بسته بعدی</button></div></div>`;
    }
    const s = S.specimen;
    const flags = assessCoin(s);
    return html`<div class="verdict ${ok ? 'good' : 'badv'}">
      <b>${ok ? 'درست تشخیص دادید' : 'تشخیص نادرست'}</b>
      <p>این سکه: <strong>${COIN_TYPES[s.coinId].short} · ${SPECIMENS[s.kind].label}</strong></p>
      ${ok && s.kind !== 'genuine' ? html`<p class="small">${S.typeRight ? 'نوع تقلب را هم درست گفتید.' : `تقلبی بودنش را درست گفتید؛ اما نوعش «${SPECIMENS[s.kind].label}» بود، نه «${SPECIMENS[S.lastGuess].label}».`}</p>` : ''}
      <p class="small">${SPECIMENS[s.kind].tell}</p>
      ${flags.length ? html`<ul>${flags.map((f) => html`<li>${fa(f.text)}</li>`)}</ul>` : html`<p class="small">هیچ نشانه تقلبی نداشت.</p>`}
      ${bayesLine}
      <div class="actions"><button class="btn small" data-act="next">سکه بعدی</button></div></div>`;
  }

  function updateReadout() {
    const s = S.specimen;
    const last = S.lastTool;
    let big = '';
    let sub = '';
    if (real()) {
      const it = currentPhoto();
      if (S.loading) (big = '<span class="spin"></span>'), (sub = 'در حال بارگذاری عکس‌ها و ساخت مدل سه‌بعدی…');
      else if (it && S.lastTool) (big = S.realSide === 'obv' ? 'جلو' : 'پشت'), (sub = `عکس واقعی · ${fa(it.sides[S.realSide].px)} پیکسل در قطر`);
    } else if (seal()) {
      const p = S.pack;
      const ev = packEvidence(p);
      if (last === 'weight') (big = `${f3(p.packWeight)}<small>گرم</small>`), (sub = `بسته مرجع هم‌نوع ${f3(p.expectedWeight)} گرم`);
      else if (last === 'serial') (big = { valid: 'ثبت‌شده', notfound: 'یافت نشد', duplicate: 'تکراری' }[inquire(p).status]), (sub = 'استعلام از درگاه رسمی (شبیه‌سازی)');
      else if (last === 'magnet') (big = p.coin.magnetic ? 'جذب شد' : 'بدون واکنش'), (sub = 'آهنربای قوی روی بسته');
      else if (last && SEAL_TESTS[last]) (big = ev[last] ? 'هشدار' : 'پاک'), (sub = SEAL_TESTS[last].label);
    } else if (last === 'scale') (big = `${f3(s.weight)}<small>گرم</small>`), (sub = 'ترازوی ۰٫۰۰۱ گرم');
    else if (last === 'caliper') (big = `${f2(s.diameter)}<small>mm</small>`), (sub = `ضخامت لبه ${f2(s.thickness)} میلی‌متر`);
    else if (last === 'water') (big = `${f2(s.density)}<small>g/cm³</small>`), (sub = `هوا ${f3(s.airWeight)} · آب ${f3(s.waterWeight)}`);
    else if (last === 'magnet') (big = s.magnetic ? 'جذب شد' : 'بدون واکنش'), (sub = 'طلا و مس آهنربایی نیستند');
    else if (last === 'ring') (big = `${f2(s.ring.decay)}<small>ثانیه</small>`), (sub = 'طول طنین صدای ضربه (شبیه‌سازی)');
    else if (last === 'xrf') (big = `${fa(s.xrf.fineness)}<small>سطح</small>`), (sub = 'XRF فقط چند ده میکرون سطح را می‌بیند');
    else if (last === 'edge') (big = `${fa(s.reeds.count)}<small>دندانه</small>`), (sub = 'نمای لبه — با سکه مرجع مقایسه کنید');
    $('#readout', root).innerHTML = big ? `<b>${big}</b><div>${sub}</div>` : '';
  }

  /* ---------------- tools ---------------- */
  const tweens = new Set();
  const stopTick = stage.onTick((t) => {
    for (const tw of tweens) if (tw(t) === false) tweens.delete(tw);
  });
  const tween = (ms, fn, done) => {
    const t0 = performance.now();
    tweens.add((t) => {
      const k = Math.min(1, (t - t0) / ms);
      fn(1 - (1 - k) ** 3);
      if (k >= 1) {
        done?.();
        return false;
      }
    });
  };
  const clearFx = () => {
    disposeTree(fx);
    fx.clear();
    stage.invalidate();
  };

  function caliperLines() {
    clearFx();
    const s = S.specimen;
    const R = s.diameter / 2;
    const mat = new T.LineBasicMaterial({ color: 0xf7e6b0 });
    const g = new T.BufferGeometry().setFromPoints([new T.Vector3(-R, 0, 0), new T.Vector3(R, 0, 0), new T.Vector3(-R, -1, 0), new T.Vector3(-R, 1, 0), new T.Vector3(R, -1, 0), new T.Vector3(R, 1, 0)]);
    const lines = new T.LineSegments(g, mat);
    lines.position.copy(coinGroup.position);
    lines.rotation.copy(coinGroup.rotation);
    lines.translateZ(s.thickness / 2 + 0.6);
    fx.add(lines);
    stage.invalidate();
  }

  function magnetTest() {
    clearFx();
    const s = S.specimen;
    const R = seal() && sealMesh ? sealMesh.userData.size.W / 2 : s.diameter / 2;
    const mag = new T.Group();
    const body = new T.Mesh(new T.BoxGeometry(6, 5, 5), new T.MeshStandardMaterial({ color: 0xb42a1f, roughness: 0.4 }));
    const tip = new T.Mesh(new T.BoxGeometry(1.4, 5.2, 5.2), new T.MeshStandardMaterial({ color: 0xd8d8d8, metalness: 1, roughness: 0.25 }));
    tip.position.x = -3.6;
    mag.add(body, tip);
    const start = R + 30, end = R + 5;
    mag.position.set(start, 0, 0);
    fx.add(mag);
    tween(900, (k) => {
      mag.position.x = start + (end - start) * k;
      stage.invalidate();
    }, () => {
      if (s.magnetic) tween(350, (k) => {
        coinGroup.position.x = 2.2 * k;
        coinGroup.rotation.z = -0.25 * k;
        stage.invalidate();
      });
    });
  }

  let audio = null;
  function ringTest() {
    const s = S.specimen;
    try {
      audio ??= new AudioContext();
      const now = audio.currentTime + 0.02;
      const out = audio.createGain();
      out.gain.value = 0.22;
      out.connect(audio.destination);
      const modes = [1, 1.593, 2.136, 2.653, 3.156];
      modes.forEach((m, i) => {
        const o = audio.createOscillator();
        o.frequency.value = s.ring.f0 * m;
        const g = audio.createGain();
        const amp = [1, 0.55, 0.35, 0.22, 0.12][i];
        const dec = Math.max(0.06, s.ring.decay * (1 - i * 0.14));
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(amp, now + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0001, now + dec);
        o.connect(g).connect(out);
        o.start(now);
        o.stop(now + dec + 0.05);
      });
      // the strike itself; a dull composite adds a low thud
      const len = Math.floor(audio.sampleRate * (s.ring.dull ? 0.09 : 0.012));
      const buf = audio.createBuffer(1, len, audio.sampleRate);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = audio.createBufferSource();
      src.buffer = buf;
      const lp = audio.createBiquadFilter();
      lp.type = s.ring.dull ? 'lowpass' : 'highpass';
      lp.frequency.value = s.ring.dull ? 700 : 3000;
      const ng = audio.createGain();
      ng.gain.value = s.ring.dull ? 0.9 : 0.25;
      src.connect(lp).connect(ng).connect(out);
      src.start(now);
    } catch {
      toast('پخش صدا در این مرورگر ممکن نشد؛ نتیجه در جدول آمده است.');
    }
    // vibrate the coin visually
    const base = coinGroup.rotation.z;
    tween(Math.min(1400, s.ring.decay * 700), (k) => {
      coinGroup.rotation.z = base + Math.sin(k * 60) * 0.01 * (1 - k);
      stage.invalidate();
    });
  }
  function drawRingPlot() {
    const cv = $('#ringplot', panel);
    if (!cv) return;
    const g = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    g.clearRect(0, 0, W, H);
    g.strokeStyle = 'rgba(227,184,98,.25)';
    g.beginPath();
    g.moveTo(0, H - 20);
    g.lineTo(W, H - 20);
    g.stroke();
    const curve = (decay, color, dash) => {
      g.strokeStyle = color;
      g.setLineDash(dash);
      g.lineWidth = 3;
      g.beginPath();
      for (let x = 0; x <= W; x += 4) {
        const t = (x / W) * 2; // 2 seconds
        const y = H - 20 - (H - 34) * Math.exp((-t * 4.6) / decay);
        x === 0 ? g.moveTo(W - x, y) : g.lineTo(W - x, y);
      }
      g.stroke();
      g.setLineDash([]);
    };
    curve(1.6, 'rgba(92,194,177,.8)', [8, 6]);
    curve(S.specimen.ring.decay, '#f7e6b0', []);
    g.fillStyle = '#a2977f';
    g.font = '22px Vazirmatn';
    g.direction = 'rtl';
    g.textAlign = 'right';
    g.fillText('— این سکه    - - مرجع اصل', W - 8, 22);
  }

  const part = (name) => sealMesh?.children.find((o) => o.userData.part === name);
  function useSealTool(k) {
    tweens.clear(); // e.g. a running hologram light sweep must not re-light the scene for the next tool
    S.lastTool = k;
    S.measured[k] = true;
    if (k === 'magnet') magnetTest();
    else clearFx();
    if (k !== 'holo') rakeOff();
    if (k === 'holo') {
      // sweep the light: a real hologram changes colour with angle, flat ink does not
      const a0 = S.rakeAngle ?? 40;
      rakeOn(a0);
      tween(2400, (x) => rakeOn(a0 + 300 * x));
      stage.frame(part('holo'), { pitch: 0.12, yaw: 0.05, pad: 1.4 });
    } else if (k === 'seam') stage.frame(sealMesh, { pitch: 0.12, yaw: 1.15, pad: 0.75 });
    else if (k === 'swell') stage.frame(sealMesh, { pitch: 0.02, yaw: Math.PI / 2, pad: 0.95 });
    else if (k === 'print') stage.frame(part('card'), { pitch: 0.05, yaw: 0, pad: 0.72 });
    else if (k === 'match') stage.frame(coinMesh, { pitch: 0.1, yaw: 0, pad: 1.25 });
    else home();
    renderPanel();
  }
  function useRealTool(k) {
    if (!photoObj) return;
    S.lastTool = k;
    if (k === 'hq') return upgradeHQ(true);
    if (k === 'flip') {
      const r0 = coinGroup.rotation.y;
      S.realSide = S.realSide === 'obv' ? 'rev' : 'obv';
      tween(800, (x) => {
        coinGroup.rotation.y = r0 + Math.PI * x;
        stage.invalidate();
      });
      return renderPanel();
    }
    S.measured[k] = true;
    if (k === 'loupe') {
      upgradeHQ(false);
      rakeOn(S.rakeAngle ?? 40);
      stage.frame(coinGroup, { pitch: 0.2, yaw: 0.1, pad: 0.55 });
    } else if (k === 'rake') rakeOn(S.rakeAngle ?? 40);
    else if (k === 'edge') {
      rakeOff();
      stage.frame(coinGroup, { pitch: 0.05, yaw: Math.PI / 2, pad: 0.42 });
    }
    renderPanel();
  }
  function useTool(k) {
    if (real()) return useRealTool(k);
    if (seal()) return useSealTool(k);
    if (k !== 'rake' && k !== 'flip') S.lastTool = k;
    if (k === 'flip') {
      const r0 = coinGroup.rotation.y;
      tween(800, (x) => {
        coinGroup.rotation.y = r0 + Math.PI * x;
        stage.invalidate();
      });
      return;
    }
    S.measured[k] = true;
    if (k === 'caliper') caliperLines();
    else if (k === 'magnet') magnetTest();
    else if (k === 'ring') ringTest();
    else if (k === 'loupe') {
      clearFx();
      rakeOn(S.rakeAngle ?? 40);
      stage.frame(coinGroup, { pitch: 0.2, yaw: 0.1, pad: 0.55 });
    } else if (k === 'edge') {
      clearFx();
      stage.frame(coinGroup, { pitch: 0.05, yaw: Math.PI / 2, pad: 0.42 });
    } else if (k === 'rake') rakeOn(S.rakeAngle ?? 40);
    else clearFx();
    if (k === 'scale' || k === 'water' || k === 'xrf') home();
    renderPanel();
  }
  function rakeOn(deg) {
    S.rakeAngle = Math.round(deg) % 360;
    if (!seal()) S.measured.rake = true;
    const a = (deg * Math.PI) / 180;
    const R = S.specimen.diameter / 2;
    if (!rake.intensity) stage.setEnv('dark');
    rake.intensity = 3.2;
    rake.position.set(Math.cos(a) * R * 6, R * 0.8, Math.sin(a) * R * 6);
    rake.target.position.set(0, 0, 0);
    stage.invalidate();
  }
  // the sealed pack faces the camera square-on; a softer tent keeps the card and coin from washing out
  const baseEnv = () => (seal() ? 'studio' : 'room');
  function rakeOff() {
    rake.intensity = 0;
    stage.setEnv(baseEnv());
    stage.setExposure(seal() ? 0.75 : 0.85);
  }
  const reset = () => {
    tweens.clear();
    rakeOff();
    clearFx();
  };

  /* ---------------- events ---------------- */
  function record(correct) {
    S.rounds++;
    if (correct) {
      S.score++;
      S.streak++;
      if (S.streak > S.best) {
        S.best = S.streak;
        try {
          localStorage.setItem(BEST_KEY, String(S.best));
        } catch {
          /* storage unavailable */
        }
      }
    } else S.streak = 0;
    api('/api/drills', { method: 'POST', body: { kind: seal() ? 'sealauth' : 'coinauth', correct } }).catch(() => {});
  }
  panel.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const d = b.dataset;
    if ((d.area && d.area !== S.area) || (d.game && (d.game === '1') !== S.game)) {
      if (d.area) S.area = d.area;
      if (d.game) S.game = d.game === '1';
      S.seed = Math.floor(Math.random() * 1e6);
      S.score = S.rounds = S.streak = 0;
      history.replaceState({}, '', urlFor());
      reset();
      await build();
    } else if (d.photomode) {
      S.photoMode = d.photomode === '1';
      try {
        localStorage.setItem(PHOTO_KEY, S.photoMode ? 'on' : 'off');
      } catch {
        /* storage unavailable */
      }
      reset();
      await build({ reframe: false });
    } else if (d.photo) {
      if (d.photo === S.photo) return;
      S.photo = d.photo;
      reset();
      await build();
    } else if (d.coin) {
      S.coin = d.coin;
      reset();
      await build();
    } else if (d.kind) {
      S.kind = d.kind;
      reset();
      await build({ reframe: false });
    } else if (d.stype) {
      S.sealType = d.stype;
      if (!SEAL_TYPES[S.sealType].scenarios.includes(S.scenario)) S.scenario = 'S0';
      reset();
      await build();
    } else if (d.scen) {
      S.scenario = d.scen;
      reset();
      await build({ reframe: false });
    } else if (d.ctx) {
      if (seal()) S.sealCtx = d.ctx;
      else S.coinCtx = d.ctx;
      S.rate = null;
      renderPanel();
    } else if (d.level) {
      S.level = Number(d.level);
      S.seed = Math.floor(Math.random() * 1e6);
      reset();
      await build();
    } else if (d.tool) useTool(d.tool);
    else if (d.verdict && !S.answered) {
      const truth = seal() ? S.pack.scenario : S.specimen.kind;
      const safe = seal() ? 'S0' : 'genuine';
      // the judgement that matters at the counter is genuine vs not; naming the trick is a bonus
      const correct = (d.verdict === safe) === (truth === safe);
      const hidden = seal() && S.pack.fraud && !Object.values(packEvidence(S.pack)).some(Boolean);
      S.lastCorrect = correct;
      S.typeRight = d.verdict === truth;
      S.lastGuess = d.verdict;
      S.answered = true;
      if (correct || !hidden) record(correct);
      renderPanel();
    } else if (d.act === 'next' || d.act === 'another') {
      S.seed = Math.floor(Math.random() * 1e6);
      reset();
      await build({ reframe: d.act === 'next' });
    }
  });
  panel.addEventListener('input', (e) => {
    if (e.target.matches('[data-rake]')) rakeOn(Number(e.target.value));
    else if (e.target.matches('[data-rate]')) {
      S.rate = 10 ** Number(e.target.value);
      const m = $('#meter', panel);
      if (!m) return;
      // redraw the meter except the slider itself, so the drag is not interrupted
      const tmp = document.createElement('div');
      tmp.innerHTML = String(meterHtml());
      const fresh = tmp.firstElementChild;
      for (const sel of ['.pf', '.pbar', '.note', '.hyp', '.next', '.ctx .chips', '.ctx .lbl', 'details.coef']) {
        const a = m.querySelector(sel);
        const n = fresh.querySelector(sel);
        if (a && n) {
          if (a.tagName === 'DETAILS') n.open = a.open;
          a.replaceWith(n);
        }
      }
    }
  });
  vp.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.act === 'frame') {
      rakeOff();
      home();
    } else if (b.dataset.act === 'spin') {
      stage.controls.autoRotate = !stage.controls.autoRotate;
      b.setAttribute('aria-pressed', String(stage.controls.autoRotate));
    } else if (b.dataset.act === 'shot') {
      if (b.classList.contains('is-busy') || !coinMesh) return;
      b.classList.add('is-busy');
      toast('در حال ساخت تصویر ۴K با بیشترین جزئیات…');
      const had = coinMesh;
      const pc = isPhoto() ? photoObj : null;
      let hi = null;
      try {
        if (pc) await pc.upgrade();
        if (coinMesh !== had) return; // the user switched coins meanwhile
        hi = new T.Mesh(pc ? pc.hiGeometry() : C3.coinGeometry(S.specimen, { quality: 2 }), had.material);
        hi.castShadow = true;
        coinGroup.remove(had);
        coinGroup.add(hi);
        const r = await stage.snapshot({ width: 3840, height: 2160 });
        const it = pc ? (real() ? currentPhoto() : photoFor(S.specimen.coinId)) : null;
        const blob = it ? await creditStamp(r.blob, [`بئاتریس · تصویر آموزشی${real() ? ` — ${it.label}` : ''}`, it.credit?.text].filter(Boolean)) : r.blob;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        const unknown = S.game && !S.answered;
        a.download = `beatris-${real() ? `real-${S.photo}-${S.realSide}` : seal() ? `seal-${S.pack.type}-${unknown ? 'unknown' : S.pack.scenario}` : `coin-${S.specimen.coinId}-${unknown ? 'unknown' : S.specimen.kind}`}.png`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      } catch {
        toast('ساخت تصویر ممکن نشد؛ دوباره تلاش کنید.', 'error');
      } finally {
        if (hi) {
          coinGroup.remove(hi);
          hi.geometry.dispose();
          if (coinMesh === had) coinGroup.add(had);
        }
        b.classList.remove('is-busy');
        stage.invalidate();
      }
    }
  });
  // bottom sheet on phones
  let drag = null;
  panel.addEventListener('pointerdown', (e) => {
    if (!e.target.closest('[data-sheet]')) return;
    drag = { y: e.clientY, moved: false };
    panel.classList.add('dragging');
  });
  panel.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dy = e.clientY - drag.y;
    if (Math.abs(dy) > 6) drag.moved = true;
    const base = panel.classList.contains('open') ? 0 : panel.offsetHeight - 190;
    panel.style.transform = `translateY(${Math.max(0, base + dy)}px)`;
  });
  panel.addEventListener('pointerup', (e) => {
    if (!drag) return;
    const dy = e.clientY - drag.y;
    panel.classList.remove('dragging');
    panel.style.transform = '';
    if (!drag.moved) panel.classList.toggle('open');
    else if (dy < -40) panel.classList.add('open');
    else if (dy > 40) panel.classList.remove('open');
    drag = null;
  });

  // real photographs (built-in and the branch's own); the lab never waits more than a few seconds for them
  const photosReady = api('/api/coin-photos').then(
    (r) => (S.photos = r.items),
    () => (S.photos = S.photos ?? []),
  );
  let built = false, gone = false;
  // a slow list must not leave the lab on the stylised coin: once it arrives, the current specimen switches to its photo
  photosReady.then(() => {
    if (!built || gone || real()) return; // the real-coin area fetches the list itself
    if (S.specimen && photoFor(S.specimen.coinId) && !isPhoto()) build({ reframe: false });
    else renderPanel();
  });
  await Promise.race([photosReady, new Promise((r) => setTimeout(r, 4000))]);
  await build();
  built = true;
  return () => {
    gone = true;
    stopTick();
    tweens.clear();
    audio?.close?.();
    buildId++;
    dropPhoto();
    stage.dispose();
  };
}
