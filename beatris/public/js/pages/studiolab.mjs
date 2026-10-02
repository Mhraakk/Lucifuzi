// آزمایشگاه وارسی در استودیو (spec 0009): raking light, height map, cross-section, point-to-point measure,
// and the alloy from hydrostatic weighing checked against the scanned volume.
import { html, fa, toast, $ } from '../core.mjs';
import { ALLOYS, fmt, densityFromWeighing, finenessFromDensity, nearestKarat } from '../calc.mjs';
import { COIN_TYPES } from '../coins.mjs';
import { inspectCoin } from '../inspect.mjs';
import { colorHint } from '../photoscan.mjs';

const WATER = 0.9982;
const ramp = (t) => {
  // blue → cyan → green → yellow → red
  const s = [[0.1, 0.2, 0.9], [0.1, 0.8, 0.9], [0.2, 0.85, 0.3], [0.95, 0.85, 0.2], [0.9, 0.2, 0.15]];
  const x = Math.min(0.9999, Math.max(0, t)) * 4, i = Math.floor(x), f = x - i;
  return s[i].map((v, k) => v + (s[i + 1][k] - v) * f);
};

export function labHtml(p, st) {
  const info = p.type === 'scan' ? st.info(p) : null;
  const w = st.weigh.get(p.id) ?? {};
  return html`<div class="grp" id="lab">
    <h3><span>آزمایشگاه وارسی</span></h3>
    ${info
      ? html`<div class="chips"><button class="chip" data-look="photo" aria-pressed="${p.opts.look !== 'metal'}">رنگ واقعی عکس</button><button class="chip" data-look="metal" aria-pressed="${p.opts.look === 'metal'}">فلز آلیاژ</button></div>
      <p class="small">${info.method === 'relief' ? `اسکن نور چندجهته از ${fa(info.photos)} عکس؛ ضخامت ${fmt(info.thickness, 2)} mm (${info.thicknessFrom}).${info.coin ? ' مقیاس از قطر اسمی سکه؛ قطر را با کولیس جدا بسنجید.' : ''}` : `اسکن دور تا دور از ${fa(info.photos)} عکس؛ دقت ${fmt(info.vox, 2)} mm؛ مقیاس از حلقه ${fa(140)} میلی‌متری صفحه. فرورفتگی‌هایی که در هیچ سایه‌نمایی دیده نشوند پر می‌مانند.`}</p>`
      : ''}
    <div class="small cad-k">ابزار دید</div>
    <div class="chips"><button class="chip" data-lab="rake" aria-pressed="${st.rake.on}">نور مایل</button><button class="chip" data-lab="heat" aria-pressed="${st.heat === p.id}">نقشه ارتفاع</button><button class="chip" data-lab="measure" aria-pressed="${st.measuring}">اندازه‌گیری دو نقطه</button></div>
    <label class="param"><span class="lbl"><span>جهت نور مایل</span><b data-out="rakeAz">${fa(st.rake.az)}°</b></span><input type="range" min="0" max="355" step="5" value="${st.rake.az}" data-labr="az"></label>
    <label class="param"><span class="lbl"><span>برش مقطع</span><b data-out="cut">${st.cut >= 100 ? 'خاموش' : `${fa(st.cut)}٪`}</b></span><input type="range" min="0" max="100" step="1" value="${st.cut}" data-labr="cut"></label>
    <div class="small cad-k">آلیاژ از وزن (روش ارشمیدس)</div>
    <div class="cad-row"><label class="field xs">وزن در هوا (g)<input class="input ltr" id="labWa" type="number" step="0.001" min="0" value="${w.wa ?? ''}"></label><label class="field xs">وزن در آب (g)<input class="input ltr" id="labWw" type="number" step="0.001" min="0" value="${w.ww ?? ''}"></label></div>
    <div class="cad-row"><label class="field xs">عیار XRF (اختیاری)<input class="input ltr" id="labXrf" type="number" step="1" min="0" max="1000" value="${w.xrf ?? ''}"></label><button class="btn small" data-lab="weigh" style="align-self:end">سنجش</button></div>
    <div class="small" id="labOut" aria-live="polite">${w.out ? w.out : ''}</div>
  </div>`;
}

/** ctx: { T, S, cur, objs, stage, scene, camera, rebuild, metricsFor, renderPanel, pushHistory, setAlloy } */
export function wireLab(panel, ctx) {
  const { T, stage } = ctx;
  const st = {
    rake: { on: false, az: 135 },
    heat: null,
    cut: 100,
    measuring: false,
    weigh: new Map(),
    info: (p) => ctx.objs.get(p.id)?.group.children[0]?.userData.scanInfo ?? {},
  };
  const light = new T.DirectionalLight(0xffffff, 0);
  ctx.scene.add(light, light.target);
  let envBefore = null;
  const placeRake = () => {
    const box = new T.Box3().setFromObject(ctx.objs.get(ctx.S.sel)?.group ?? stage.root);
    const c = box.isEmpty() ? new T.Vector3() : box.getCenter(new T.Vector3());
    const a = (st.rake.az * Math.PI) / 180, el = (12 * Math.PI) / 180, R = 120;
    // raking across the face that looks at the camera: azimuth in the plane facing the viewer
    const cam = ctx.camera.position.clone().sub(c).normalize(), up = new T.Vector3(0, 1, 0);
    const right = new T.Vector3().crossVectors(up, cam).normalize(), upv = new T.Vector3().crossVectors(cam, right).normalize();
    const dir = right.multiplyScalar(Math.cos(a) * Math.cos(el)).add(upv.multiplyScalar(Math.sin(a) * Math.cos(el))).add(cam.clone().multiplyScalar(Math.sin(el)));
    light.position.copy(c).addScaledVector(dir, R);
    light.target.position.copy(c);
    stage.invalidate();
  };
  const setRake = (on) => {
    st.rake.on = on;
    if (on) {
      envBefore ??= ctx.scene.environmentIntensity ?? 1;
      ctx.scene.environmentIntensity = 0.12;
      light.intensity = 4;
      placeRake();
    } else {
      if (envBefore != null) ctx.scene.environmentIntensity = envBefore;
      envBefore = null;
      light.intensity = 0;
    }
    stage.invalidate();
  };
  const out = (s) => {
    const o = $('#labOut', panel);
    if (o) o.innerHTML = s;
  };
  function heatMap(p) {
    const g = ctx.objs.get(p.id)?.group;
    if (!g) return;
    let lo = Infinity, hi = -Infinity;
    const meshes = [];
    g.traverse((m) => m.isMesh && m.userData.role !== 'gem' && meshes.push(m));
    // relief scans: height along the face normal (z); other parts: height above their base (y)
    const ax = p.type === 'scan' && st.info(p).method === 'relief' ? 2 : 1;
    for (const m of meshes) {
      const a = m.geometry.attributes.position;
      for (let i = 0; i < a.count; i++) (lo = Math.min(lo, a.array[i * 3 + ax])), (hi = Math.max(hi, a.array[i * 3 + ax]));
    }
    // a relief: colour the front face from the field (rim and lettering), not from the full thickness
    for (const m of meshes) {
      const a = m.geometry.attributes.position, col = new Float32Array(a.count * 3);
      let flo = lo, fhi = hi;
      if (ax === 2) {
        flo = Infinity;
        fhi = -Infinity;
        for (let i = 0; i < a.count; i++) {
          const v = Math.abs(a.array[i * 3 + 2]);
          (flo = Math.min(flo, v)), (fhi = Math.max(fhi, v));
        }
      }
      for (let i = 0; i < a.count; i++) {
        const v = ax === 2 ? Math.abs(a.array[i * 3 + 2]) : a.array[i * 3 + 1];
        const c = ramp((v - flo) / (fhi - flo || 1));
        col.set(c, i * 3);
      }
      m.geometry.setAttribute('color', new T.BufferAttribute(col, 3));
      m.material = new T.MeshLambertMaterial({ vertexColors: true });
    }
    st.heat = p.id;
    stage.invalidate();
    out(ax === 2 ? `نقشه ارتفاع رو و پشت: آبی = زمینه، قرمز = بلندترین نقش. اختلاف کل ${fmt(hi - lo, 2)} mm (با ضخامت).` : `نقشه ارتفاع: آبی = پایین، قرمز = بالا (${fmt(hi - lo, 2)} mm).`);
  }
  function section(p) {
    const g = ctx.objs.get(p.id)?.group;
    if (!g) return;
    stage.renderer.localClippingEnabled = true;
    const box = new T.Box3().setFromObject(g);
    const x = box.min.x + ((box.max.x - box.min.x) * st.cut) / 100;
    const plane = new T.Plane(new T.Vector3(-1, 0, 0), x);
    g.traverse((m) => {
      if (!m.isMesh) return;
      if (!m.userData.ownMat) (m.material = m.material.clone()), (m.userData.ownMat = true);
      m.material.clippingPlanes = st.cut >= 100 ? null : [plane];
      m.material.clipShadows = true;
      m.material.side = st.cut >= 100 ? T.FrontSide : T.DoubleSide;
      m.material.needsUpdate = true;
    });
    stage.invalidate();
  }

  /* point-to-point measuring on the model surface */
  const marks = new T.Group();
  ctx.scene.add(marks);
  let pts = [];
  const canvas = stage.renderer.domElement;
  let downAt = null;
  canvas.addEventListener('pointerdown', (e) => st.measuring && (downAt = [e.clientX, e.clientY]), true);
  canvas.addEventListener('pointerup', (e) => {
    if (!st.measuring || !downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 4) return;
    e.stopImmediatePropagation();
    const r = canvas.getBoundingClientRect(), ray = new T.Raycaster();
    ray.setFromCamera(new T.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), ctx.camera);
    const hit = ray.intersectObjects(stage.root.children, true).find((h) => h.object.isMesh);
    if (!hit) return;
    const dot = new T.Mesh(new T.SphereGeometry(0.15, 10, 8), new T.MeshBasicMaterial({ color: 0xff3b30, depthTest: false }));
    dot.position.copy(hit.point);
    dot.renderOrder = 11;
    marks.add(dot);
    pts.push(hit.point.clone());
    if (pts.length === 2) {
      const line = new T.Line(new T.BufferGeometry().setFromPoints(pts), new T.LineBasicMaterial({ color: 0xff3b30, depthTest: false }));
      line.renderOrder = 11;
      marks.add(line);
      const d = pts[0].distanceTo(pts[1]);
      out(`فاصله دو نقطه: <b>${fa(fmt(d, 3))} mm</b> (برای نقطه‌های تازه دوباره کلیک کنید).`);
      toast(`فاصله: ${fmt(d, 3)} mm`, 'ok');
      pts = [];
    } else if (marks.children.length > 3) {
      marks.children.slice(0, -1).forEach((c) => (marks.remove(c), c.geometry.dispose()));
    }
    stage.invalidate();
  }, true);
  const onKey = (e) => {
    if (st.measuring && e.key === 'Escape') {
      st.measuring = false;
      pts = [];
      marks.children.slice().forEach((c) => (marks.remove(c), c.geometry.dispose()));
      ctx.renderPanel();
      e.stopImmediatePropagation();
    }
  };
  addEventListener('keydown', onKey, true);

  function weigh(p) {
    const wa = Number($('#labWa', panel)?.value), ww = Number($('#labWw', panel)?.value), xrf = Number($('#labXrf', panel)?.value) || null;
    const m = ctx.metricsFor(p);
    const rows = [];
    let rho = NaN;
    if (wa > 0 && ww > 0 && wa > ww) {
      rho = densityFromWeighing(wa, ww, WATER);
      const vReal = ((wa - ww) / WATER) * 1000; // mm³ — Archimedes: the true outer volume
      const fin = finenessFromDensity(rho), k = nearestKarat(fin);
      rows.push(['چگالی اندازه‌گیری‌شده', `${fmt(rho, 2)} g/cm³`], ['عیار تخمینی از چگالی (طلا+مس/نقره)', `${fmt(fin, 0)} در هزار ≈ ${fa(k.karat)} عیار`]);
      if (rho > 19.45) rows.push(['هشدار', 'چگال‌تر از طلای خالص: احتمال تنگستن یا پلاتین درون قطعه']);
      if (rho < 11) rows.push(['هشدار', 'برای آلیاژ طلا بسیار سبک است: توخالی، پرشده با مواد سبک یا آلیاژ دیگر']);
      const inf = p.type === 'scan' ? st.info(p) : {};
      if (inf.method === 'relief' && inf.tKind !== 'caliper' && inf.tKind !== 'archimedes') {
        // the photos fix the outline and relief; the true volume fixes the thickness
        const nj = ctx.rethick(p.opts.scan, vReal);
        if (nj) {
          p.opts.scan = nj;
          ctx.rebuild(p).then(() => ctx.renderPanel());
          ctx.pushHistory();
          rows.push(['ضخامت مدل', `از حجم ارشمیدس: ${fmt(JSON.parse(nj).t, 2)} mm (پیش‌تر ${fmt(inf.thickness, 2)} mm فرضی بود)`]);
        }
      } else if (m?.vol) {
        const dev = ((m.vol - vReal) / vReal) * 100;
        rows.push(['حجم اسکن / حجم ارشمیدس', `${fmt(m.vol, 1)} / ${fmt(vReal, 1)} mm³ (${dev > 0 ? '+' : ''}${fmt(dev, 1)}٪)`]);
        rows.push(['همخوانی اسکن با قطعه', Math.abs(dev) <= 5 ? 'خوب (زیر ۵٪)' : Math.abs(dev) <= 12 ? 'متوسط؛ ضخامت یا مقیاس را بازبینی کنید' : 'ضعیف؛ عکس‌ها یا مقیاس را بازبینی کنید']);
      }
      // the model's alloy: nearest fineness; colour variant from the scan's photo colour (a hint only)
      const same = ALLOYS.filter((a) => a.fineness && Math.abs(a.fineness - k.fineness) < 30);
      const hint = p.type === 'scan' && st.info(p).albedo ? colorHint(st.info(p).albedo, same.length ? same : ALLOYS) : same[0];
      if (hint) {
        ctx.setAlloy(p, hint.id);
        rows.push(['آلیاژ مدل', `${hint.label}${same.length > 1 ? ' (رنگ از عکس، فقط نشانه)' : ''}`]);
      }
    } else if (wa > 0 && m?.vol) {
      rows.push(['وزن مدل با آلیاژ فعلی', `${fmt((m.vol / 1000) * m.a.density, 3)} g در برابر ترازو ${fmt(wa, 3)} g`]);
    } else return out('وزن در هوا و در آب را وارد کنید (ترازوی ۰٫۰۰۱ گرم، قطعه آویزان در لیوان آب، بدون تماس با دیواره).');
    if (xrf) rows.push(['عیار سطح (XRF)', `${fa(xrf)} در هزار`]);
    const coin = p.type === 'scan' ? st.info(p).coin : null;
    if (coin && COIN_TYPES[coin]) {
      const r = inspectCoin(coin, { weight: wa || undefined, density: Number.isFinite(rho) ? rho : undefined, xrf: xrf ?? undefined });
      rows.push(['احتمال تقلب (برگه بازرسی سکه)', `${fmt(r.pFraud * 100, r.pFraud < 0.01 ? 2 : 1)}٪ — ${r.decision.label}`]);
    }
    const s = String(html`<div class="kv">${rows.map(([a, b]) => html`<span>${a}</span><b>${fa(b)}</b>`)}</div>`);
    st.weigh.set(p.id, { wa: wa || '', ww: ww || '', xrf: xrf ?? '', out: s });
    out(s);
  }

  panel.addEventListener('click', (e) => {
    const b = e.target.closest('[data-lab], [data-look]');
    if (!b || !b.closest('#lab')) return;
    const p = ctx.cur();
    if (!p) return;
    if (b.dataset.look) {
      p.opts.look = b.dataset.look;
      st.heat = null;
      ctx.rebuild(p).then(() => ctx.renderPanel());
      ctx.pushHistory();
      return;
    }
    const a = b.dataset.lab;
    if (a === 'rake') (setRake(!st.rake.on), b.setAttribute('aria-pressed', String(st.rake.on)));
    else if (a === 'heat') {
      if (st.heat === p.id) (st.heat = null), ctx.rebuild(p), out('');
      else heatMap(p);
      b.setAttribute('aria-pressed', String(st.heat === p.id));
    } else if (a === 'measure') {
      st.measuring = !st.measuring;
      pts = [];
      b.setAttribute('aria-pressed', String(st.measuring));
      out(st.measuring ? 'روی دو نقطه از سطح قطعه کلیک کنید. Esc: پایان.' : '');
    } else if (a === 'weigh') weigh(p);
  });
  panel.addEventListener('input', (e) => {
    const k = e.target.dataset?.labr;
    if (!k) return;
    const p = ctx.cur();
    if (k === 'az') {
      st.rake.az = Number(e.target.value);
      panel.querySelector('[data-out="rakeAz"]').textContent = `${fa(st.rake.az)}°`;
      if (!st.rake.on) setRake(true), panel.querySelector('[data-lab="rake"]')?.setAttribute('aria-pressed', 'true');
      placeRake();
    } else if (k === 'cut' && p) {
      st.cut = Number(e.target.value);
      panel.querySelector('[data-out="cut"]').textContent = st.cut >= 100 ? 'خاموش' : `${fa(st.cut)}٪`;
      section(p);
    }
  });
  return {
    state: st,
    /** called after a part is rebuilt (its materials are new): re-apply the active view tools */
    after(p) {
      if (st.cut < 100 && p.id === ctx.S.sel) section(p);
    },
    onSelect() {
      st.heat = null;
      if (st.cut < 100) st.cut = 100;
      if (st.rake.on) placeRake();
    },
    dispose() {
      removeEventListener('keydown', onKey, true);
      ctx.scene.remove(light, light.target, marks);
    },
  };
}
