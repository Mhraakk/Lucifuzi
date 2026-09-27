import { html, fa, api, toast, $ } from '../core.mjs';
import { ICON } from '../ui.mjs';
import { fmt } from '../calc.mjs';
import { COIN_TYPES, SPECIMENS, LEVELS, RHO, RHO_750, makeSpecimen, pickSpecimen, assessCoin } from '../coins.mjs';

const BEST_KEY = 'beatris.coinlab.best';
const TOOLS = [
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
  const S = {
    mode: q.get('mode') === 'game' ? 'game' : 'study',
    coin: COIN_TYPES[q.get('coin')] ? q.get('coin') : 'emami',
    kind: SPECIMENS[q.get('kind')] ? q.get('kind') : 'genuine',
    seal: 'none',
    level: 1,
    seed: Math.floor(Math.random() * 1e6),
    specimen: null,
    measured: {},
    answered: false,
    score: 0,
    streak: 0,
    rounds: 0,
  };
  try {
    S.best = Number(localStorage.getItem(BEST_KEY)) || 0;
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

  /* ---------------- specimen ---------------- */
  let coinMesh = null;
  let sealMesh = null;
  let buildId = 0;
  async function build({ reframe = true, quality = 1 } = {}) {
    const id = ++buildId;
    S.specimen = S.mode === 'game' ? pickSpecimen(S.level, S.seed) : makeSpecimen(S.coin, S.kind, S.seed);
    S.measured = {};
    S.answered = false;
    await document.fonts.load('700 50px Markazi', 'نمونه ۱۴۰۵');
    await document.fonts.load('700 50px Vazirmatn', 'نمونه ۱۴۰۵');
    if (id !== buildId) return;
    const geo = C3.coinGeometry(S.specimen, { quality });
    if (coinMesh) {
      coinGroup.remove(coinMesh);
      coinMesh.geometry.dispose();
    }
    coinMesh = new T.Mesh(geo, C3.coinMaterial(S.specimen));
    coinMesh.castShadow = true;
    coinGroup.add(coinMesh);
    if (sealMesh) {
      coinGroup.remove(sealMesh);
      disposeTree(sealMesh);
      sealMesh = null;
    }
    if (S.mode === 'study' && S.seal !== 'none') {
      sealMesh = C3.sealPackage(S.specimen, { fake: S.seal === 'fake' });
      coinGroup.add(sealMesh);
    }
    coinGroup.rotation.set(-0.32, 0, 0);
    coinGroup.position.set(0, 0, 0);
    stage.ground();
    if (reframe) stage.frame(stage.root, { pitch: 0.25, yaw: 0.35, pad: 1.35 });
    stage.invalidate();
    renderPanel();
  }

  /* ---------------- panel ---------------- */
  function renderPanel() {
    const keep = panel.scrollTop;
    queueMicrotask(() => (panel.scrollTop = keep));
    const s = S.specimen;
    const c = COIN_TYPES[s.coinId];
    const game = S.mode === 'game';
    const L = LEVELS.find((l) => l.id === S.level);
    $('#ltitle', root).textContent = game && !S.answered ? 'سکه ناشناس' : `${c.short} · ${SPECIMENS[s.kind].label}`;
    panel.innerHTML = String(html`
      <div class="sheet-handle" data-sheet role="button" aria-label="باز و بسته کردن"></div>
      <div class="grp">
        <div class="seg" role="group" style="width:100%"><button data-mode="study" aria-pressed="${!game}">مطالعه</button><button data-mode="game" aria-pressed="${game}">آزمون: اصل یا تقلبی؟</button></div>
      </div>
      ${game
        ? html`<div class="grp">
          <h3><span>سطح</span><span class="small">امتیاز ${fa(S.score)} از ${fa(S.rounds)} · زنجیره ${fa(S.streak)} · بهترین ${fa(S.best)}</span></h3>
          <div class="chips">${LEVELS.map((l) => html`<button class="chip" data-level="${l.id}" aria-pressed="${l.id === S.level}">${l.label}</button>`)}</div>
          <p class="small" style="margin-top:8px">در این سطح: سکه اصل، ${L.kinds.filter((k) => k !== 'genuine').map((k) => SPECIMENS[k].label).join('، ')}.</p>
        </div>`
        : html`<div class="grp">
          <h3><span>سکه</span></h3>
          <div class="chips">${Object.entries(COIN_TYPES).map(([k, v]) => html`<button class="chip" data-coin="${k}" aria-pressed="${k === S.coin}">${v.short}</button>`)}</div>
          <h3 style="margin-top:14px"><span>نمونه</span></h3>
          <div class="chips">${Object.entries(SPECIMENS).map(([k, v]) => html`<button class="chip" data-kind="${k}" aria-pressed="${k === S.kind}">${v.label}</button>`)}</div>
          <h3 style="margin-top:14px"><span>بسته‌بندی</span></h3>
          <div class="chips"><button class="chip" data-seal="none" aria-pressed="${S.seal === 'none'}">بدون پلمپ</button><button class="chip" data-seal="ok" aria-pressed="${S.seal === 'ok'}">پلمپ سالم</button><button class="chip" data-seal="fake" aria-pressed="${S.seal === 'fake'}">پلمپ تقلبی</button></div>
          ${S.seal === 'fake' ? html`<p class="small" style="margin-top:8px">در پلمپ تقلبی نوار هولوگرام رنگین‌کمانی نیست، چاپ کمی جابه‌جاست، واحد «گرام» غلط نوشته شده و سریال حرف لاتین دارد. پلمپ را همیشه با نور مورب و ذره‌بین نگاه کنید.</p>` : ''}
          <div class="tell"><b>${SPECIMENS[S.kind].label}</b><p>${SPECIMENS[S.kind].tell}</p></div>
        </div>`}
      <div class="grp">
        <h3><span>ابزار بازرسی</span></h3>
        <div class="lab-tools">${TOOLS.map(([k, l]) => html`<button data-tool="${k}" class="${S.measured[k] ? 'done' : ''}">${l}</button>`)}</div>
        <label class="param" style="margin-top:12px" ${S.measured.rake ? '' : 'hidden'}><span class="lbl"><span>زاویه نور مورب</span></span><input type="range" min="0" max="360" step="1" value="${S.rakeAngle ?? 40}" data-rake></label>
      </div>
      <div class="grp">
        <h3><span>نتیجه اندازه‌گیری‌ها</span><span class="small">مرجع: ${c.label}</span></h3>
        ${measuredTable()}
        <canvas id="ringplot" width="600" height="150" style="width:100%;height:auto;margin-top:10px" ${S.measured.ring ? '' : 'hidden'}></canvas>
      </div>
      ${game
        ? html`<div class="grp" id="answer">${S.answered ? verdictHtml() : html`<h3><span>رأی شما</span></h3>
            <div class="actions" style="margin-top:0"><button class="btn small" data-verdict="genuine">اصل است</button></div>
            <div class="small" style="margin:10px 0 6px">یا نوع تقلب را انتخاب کنید:</div>
            <div class="chips">${L.kinds.filter((k) => k !== 'genuine').map((k) => html`<button class="chip" data-verdict="${k}">${SPECIMENS[k].label}</button>`)}</div>`}
          </div>`
        : html`<div class="grp"><h3><span>مشخصات مرجع</span></h3>${refTable(c)}</div>`}
    `);
    if (S.measured.ring) drawRingPlot();
    updateReadout();
  }

  const row = (label, val, ref, bad) => html`<span>${label}</span><b>${val}${ref ? html`<small class="ref"> / ${ref}</small>` : ''}${S.mode === 'study' && bad !== undefined ? html` <i class="dot ${bad ? 'bad' : 'on'}"></i>` : ''}</b>`;
  function measuredTable() {
    const s = S.specimen;
    const c = COIN_TYPES[s.coinId];
    const m = S.measured;
    const flags = new Set(assessCoin(s).map((f) => f.key));
    const rows = [];
    if (m.scale) rows.push(row('وزن', `${fa(f3(s.weight))} گرم`, `${fa(f3(c.weight))}`, flags.has('weight')));
    if (m.caliper) rows.push(row('قطر', `${fa(f2(s.diameter))} mm`, `≈ ${fa(f2(c.diameter))}`, flags.has('diameter')), row('ضخامت لبه', `${fa(f2(s.thickness))} mm`, `≈ ${fa(f2(c.thickness))}`));
    if (m.water) {
      const guess = nearestComposition(s.density, c);
      rows.push(row('وزن در هوا / آب', `${fa(f3(s.airWeight))} / ${fa(f3(s.waterWeight))}`), row('چگالی', `${fa(f2(s.density))} g/cm³`, `${fa(f2(c.density))}`, flags.has('density')), row('نزدیک‌ترین ترکیب', guess));
    }
    if (m.magnet) rows.push(row('آهنربا', s.magnetic ? 'جذب می‌کند' : 'واکنشی ندارد', 'واکنشی ندارد', flags.has('magnet')));
    if (m.ring) rows.push(row('طنین صدا', `${fa(f2(s.ring.decay))} ثانیه${s.ring.dull ? ' (خفه)' : ''}`, 'حدود ۱٫۶', flags.has('ring')));
    if (m.xrf) rows.push(row('XRF سطح', `${fa(s.xrf.fineness)} · ${s.xrf.elements.join('، ')}`, `${fa(c.fineness)} · طلا، مس`, flags.has('xrf')));
    if (m.edge) rows.push(row('دندانه لبه', `${fa(s.reeds.count)} عدد · ${s.reeds.regular && s.reeds.depth >= 0.8 ? 'منظم و عمیق' : 'کم‌عمق / نامنظم'}${s.look.seam ? ' · خط درز' : ''}`, `${fa(c.reeds)} منظم`, flags.has('reeds')));
    if (m.loupe) rows.push(row('ذره‌بین', loupeText(s), 'لبه‌های تیز، بدون حفره', flags.has('detail') || flags.has('plug') || flags.has('die')));
    return rows.length ? html`<div class="kv">${rows}</div>` : html`<p class="small">یک ابزار را بزنید. هر ابزار فقط بخشی از حقیقت را نشان می‌دهد؛ رأی درست از کنار هم گذاشتن چند نشانه به دست می‌آید.</p>`;
  }
  function loupeText(s) {
    const bits = [];
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
    return `${list[0][0]} (${fa(f2(list[0][1]))})`;
  }
  function refTable(c) {
    return html`<div class="kv">
      <span>وزن اسمی</span><b>${fa(f3(c.weight))} گرم</b>
      <span>عیار</span><b>${fa(c.fineness)} (${c.fineness === 900 ? '۲۱٫۶ عیار' : '۱۸ عیار'})</b>
      <span>طلای خالص</span><b>${fa(f3(c.pure))} گرم</b>
      <span>چگالی آلیاژ (محاسبه‌شده)</span><b>${fa(f2(c.density))}</b>
      <span>قطر (تقریبی آموزشی)</span><b>${fa(f2(c.diameter))} mm</b>
      <span>وضعیت</span><b>${c.legal ? 'سکه رسمی بانک مرکزی' : 'قطعه طلای غیررسمی؛ قیمت با وزن و اجرت'}</b>
    </div><p class="small" style="margin-top:8px">قطرها و شمار دندانه در این آزمایشگاه عددهای آموزشی‌اند؛ پیش از داوری، همیشه با یک سکه مرجع سالم کنار هم مقایسه کنید.</p>`;
  }
  function verdictHtml() {
    const s = S.specimen;
    const flags = assessCoin(s);
    const ok = S.lastCorrect;
    return html`<div class="verdict ${ok ? 'good' : 'badv'}">
      <b>${ok ? 'درست تشخیص دادید' : 'تشخیص نادرست'}</b>
      <p>این سکه: <strong>${COIN_TYPES[s.coinId].short} · ${SPECIMENS[s.kind].label}</strong></p>
      ${ok && s.kind !== 'genuine' ? html`<p class="small">${S.typeRight ? 'نوع تقلب را هم درست گفتید.' : `تقلبی بودنش را درست گفتید؛ اما نوعش «${SPECIMENS[s.kind].label}» بود، نه «${SPECIMENS[S.lastGuess].label}».`}</p>` : ''}
      <p class="small">${SPECIMENS[s.kind].tell}</p>
      ${flags.length ? html`<ul>${flags.map((f) => html`<li>${fa(f.text)}</li>`)}</ul>` : html`<p class="small">هیچ نشانه تقلبی نداشت.</p>`}
      <div class="actions"><button class="btn small" data-act="next">سکه بعدی</button></div></div>`;
  }
  function updateReadout() {
    const s = S.specimen;
    const last = S.lastTool;
    let big = '';
    let sub = '';
    if (last === 'scale') (big = `${fa(f3(s.weight))}<small>گرم</small>`), (sub = 'ترازوی ۰٫۰۰۱ گرم');
    else if (last === 'caliper') (big = `${fa(f2(s.diameter))}<small>mm</small>`), (sub = `ضخامت لبه ${fa(f2(s.thickness))} میلی‌متر`);
    else if (last === 'water') (big = `${fa(f2(s.density))}<small>g/cm³</small>`), (sub = `هوا ${fa(f3(s.airWeight))} · آب ${fa(f3(s.waterWeight))}`);
    else if (last === 'magnet') (big = s.magnetic ? 'جذب شد' : 'بدون واکنش'), (sub = 'طلا و مس آهنربایی نیستند');
    else if (last === 'ring') (big = `${fa(f2(s.ring.decay))}<small>ثانیه</small>`), (sub = 'طول طنین صدای ضربه (شبیه‌سازی)');
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
    const R = s.diameter / 2;
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

  function useTool(k) {
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
    if (k === 'scale' || k === 'water' || k === 'xrf') stage.frame(stage.root, { pitch: 0.25, yaw: 0.35, pad: 1.35 });
    renderPanel();
  }
  function rakeOn(deg) {
    S.rakeAngle = deg;
    S.measured.rake = true;
    const a = (deg * Math.PI) / 180;
    const R = S.specimen.diameter / 2;
    rake.intensity = 3.2;
    rake.position.set(Math.cos(a) * R * 6, R * 0.8, Math.sin(a) * R * 6);
    rake.target.position.set(0, 0, 0);
    stage.setEnv('dark');
    stage.invalidate();
  }
  function rakeOff() {
    rake.intensity = 0;
    stage.setEnv('room');
  }

  /* ---------------- events ---------------- */
  panel.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const d = b.dataset;
    if (d.mode && d.mode !== S.mode) {
      S.mode = d.mode;
      S.seed = Math.floor(Math.random() * 1e6);
      history.replaceState({}, '', S.mode === 'game' ? '/coins?mode=game' : '/coins');
      rakeOff();
      clearFx();
      await build();
    } else if (d.coin) {
      S.coin = d.coin;
      await build();
    } else if (d.kind) {
      S.kind = d.kind;
      await build({ reframe: false });
    } else if (d.seal) {
      S.seal = d.seal;
      await build({ reframe: false });
      if (S.seal !== 'none') stage.frame(stage.root, { pitch: 0.15, yaw: 0.2, pad: 1.2 });
    } else if (d.level) {
      S.level = Number(d.level);
      S.seed = Math.floor(Math.random() * 1e6);
      await build();
    } else if (d.tool) useTool(d.tool);
    else if (d.verdict && !S.answered) {
      const truth = S.specimen.kind;
      // the judgement that matters at the counter is genuine vs fake; naming the fake is a bonus
      const correct = (d.verdict === 'genuine') === (truth === 'genuine');
      S.lastCorrect = correct;
      S.typeRight = d.verdict === truth;
      S.lastGuess = d.verdict;
      S.answered = true;
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
      api('/api/drills', { method: 'POST', body: { kind: 'coinauth', correct } }).catch(() => {});
      renderPanel();
      $('#ltitle', root).textContent = `${COIN_TYPES[S.specimen.coinId].short} · ${SPECIMENS[truth].label}`;
    } else if (d.act === 'next') {
      S.seed = Math.floor(Math.random() * 1e6);
      rakeOff();
      clearFx();
      S.lastTool = null;
      await build();
    }
  });
  panel.addEventListener('input', (e) => {
    if (e.target.matches('[data-rake]')) rakeOn(Number(e.target.value));
  });
  vp.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.act === 'frame') {
      rakeOff();
      stage.frame(stage.root, { pitch: 0.25, yaw: 0.35, pad: 1.35 });
    } else if (b.dataset.act === 'spin') {
      stage.controls.autoRotate = !stage.controls.autoRotate;
      b.setAttribute('aria-pressed', String(stage.controls.autoRotate));
    } else if (b.dataset.act === 'shot') {
      b.classList.add('is-busy');
      toast('در حال ساخت تصویر ۴K با بیشترین جزئیات…');
      const had = coinMesh;
      coinMesh = null;
      const hi = new T.Mesh(C3.coinGeometry(S.specimen, { quality: 2 }), had.material);
      coinGroup.remove(had);
      coinGroup.add(hi);
      const r = await stage.snapshot({ width: 3840, height: 2160 });
      coinGroup.remove(hi);
      hi.geometry.dispose();
      coinGroup.add(had);
      coinMesh = had;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(r.blob);
      a.download = `beatris-coin-${S.specimen.coinId}-${S.mode === 'game' && !S.answered ? 'unknown' : S.specimen.kind}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      b.classList.remove('is-busy');
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

  await build();
  return () => {
    stopTick();
    audio?.close?.();
    stage.dispose();
  };
}
