import { html, raw, fa, store, toast, api, $, $$ } from '../core.mjs';
import { ICON } from '../ui.mjs';
import { ALLOYS, alloyById, fmt, fmtT, pricePerGramAt, ringFromCircumference } from '../calc.mjs';

const SAVE_KEY = 'beatris.studio.v1';
const WAX_DENSITY = 0.95; // g/cm³ — typical injection/carving wax
const RESIN_DENSITY = 1.12; // g/cm³ — castable 3D-printing resin
const SPRUE_FACTOR = 1.35; // metal to melt ≈ piece × 1.35 (sprue + button)

const PRESETS = [
  { label: 'تک‌نگین کلاسیک', parts: [{ type: 'solitaire', alloy: 'au18y', opts: { cut: 'round', setting: 'prong6' } }] },
  { label: 'حلقه ازدواج', parts: [{ type: 'band', alloy: 'au18y', params: { width: 4.5, thickness: 1.9 } }, { type: 'band', alloy: 'au18w', params: { size: 62, width: 5.5, thickness: 2.1 }, pos: [26, 0, 0], rot: [0, 0.5, 0] }] },
  { label: 'هالو بیضی رز', parts: [{ type: 'halo', alloy: 'au18r', opts: { cut: 'oval', gem: 'morganite' } }] },
  { label: 'پلاک اسم', parts: [{ type: 'name', alloy: 'au18y', opts: { text: 'نیلوفر', font: 'Vazirmatn' } }] },
  { label: 'شمسه با یاقوت', parts: [{ type: 'pendant', alloy: 'au21', params: { stone: 4.5 }, opts: { shape: 'shamseh', gem: 'ruby' } }] },
  { label: 'بته‌جقه فیروزه', parts: [{ type: 'pendant', alloy: 'au18y', finish: 'hammer', params: { size: 24, stone: 5 }, opts: { shape: 'boteh', gem: 'turquoise' } }] },
  { label: 'انگشتر مهری', parts: [{ type: 'signet', alloy: 'au18y', opts: { text: 'ع', face: 'octagon' } }] },
  { label: 'سکه یادبود', parts: [{ type: 'coin', alloy: 'au24', opts: { design: 'rosette' } }] },
  { label: 'شمش ۲۴', parts: [{ type: 'bar', alloy: 'au24' }] },
  { label: 'زنجیر کارتیه', parts: [{ type: 'chain', alloy: 'au18y', opts: { style: 'curb' } }] },
  { label: 'رکاب اترنیتی', parts: [{ type: 'eternity', alloy: 'pt950', opts: { style: 'prong' } }] },
  { label: 'گوشواره میخی', parts: [{ type: 'stud', alloy: 'au18w', pos: [-6, 0, 0] }, { type: 'stud', alloy: 'au18w', pos: [6, 0, 0] }] },
];

const PIECE_ICONS = {
  band: '<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="5.2"/>',
  solitaire: '<circle cx="12" cy="15" r="6"/><path d="m9 8 3-4 3 4-3 1.6Z"/>',
  halo: '<circle cx="12" cy="15.5" r="5.5"/><circle cx="12" cy="7" r="3.2"/><circle cx="12" cy="7" r="1.4"/>',
  eternity: '<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="4.5" r="1"/><circle cx="17.3" cy="6.7" r="1"/><circle cx="19.5" cy="12" r="1"/><circle cx="6.7" cy="6.7" r="1"/><circle cx="4.5" cy="12" r="1"/>',
  signet: '<circle cx="12" cy="15" r="5.5"/><rect x="7" y="4" width="10" height="6" rx="3"/>',
  bangle: '<ellipse cx="12" cy="12" rx="9" ry="6"/><ellipse cx="12" cy="12" rx="7" ry="4.2"/>',
  pendant: '<path d="M12 3v3"/><path d="m12 7 1.6 3.4 3.7.5-2.7 2.6.7 3.7L12 15.4l-3.3 1.8.7-3.7-2.7-2.6 3.7-.5Z"/>',
  name: '<path d="M4 15c2-4 4 2 6-2s1 4 4 0 3 3 6-1"/><circle cx="3.5" cy="13" r="1"/><circle cx="20.5" cy="11" r="1"/>',
  coin: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="6"/><path d="M12 8v8M9 10.5h6"/>',
  bar: '<path d="M4 16 7 8h10l3 8Z"/><path d="M8.5 12h7"/>',
  chain: '<ellipse cx="7" cy="12" rx="4" ry="2.5"/><ellipse cx="12" cy="12" rx="2.5" ry="4"/><ellipse cx="17" cy="12" rx="4" ry="2.5"/>',
  hoop: '<path d="M12 4a8 8 0 1 0 1 0"/><path d="M12 4v-1"/>',
  stud: '<path d="m8 9 4-5 4 5-4 2Z"/><path d="M12 11v9"/>',
  gem: '<path d="M6 9h12l-6 11Z"/><path d="m6 9 3-4h6l3 4M9 5l3 4 3-4"/>',
  relief: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m6 17 4-5 3 3 2-2 3 4"/><circle cx="15" cy="8.5" r="1.5"/>',
};
const svg = (d) => raw(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`);

const OPT_CHOICES = {
  setting: [['prong4', 'چهار پنجه'], ['prong6', 'شش پنجه'], ['bezel', 'قاب دور (بِزل)']],
  style: null, // eternity: prong / channel; chain: cable / curb / figaro / box — resolved per piece
  face: [['oval', 'بیضی'], ['octagon', 'هشت‌ضلعی'], ['rect', 'مستطیل'], ['round', 'گرد']],
  design: [['rosette', 'گل تخت‌جمشید'], ['text', 'نوشته'], ['image', 'تصویر من']],
};

export async function studioPage(root) {
  root.innerHTML = String(html`<div class="studio3d">
    <div class="viewport" id="vp">
      <div class="hud">
        <div class="chips" id="views">
          <button class="iconbtn" data-act="frame" title="قاب‌بندی">${ICON.orbit}</button>
          <button class="iconbtn" data-act="spin" title="چرخش خودکار" aria-pressed="false">${ICON.rotate}</button>
          <button class="iconbtn" data-act="grid" title="شبکه میلی‌متری" aria-pressed="false">${ICON.grid}</button>
        </div>
        <div class="chips" id="gizmo">
          <button class="iconbtn" data-mode="translate" title="جابجایی (W)">${ICON.move}</button>
          <button class="iconbtn" data-mode="rotate" title="چرخش (E)">${ICON.rotate}</button>
          <button class="iconbtn" data-mode="scale" title="مقیاس (R)">${ICON.scale}</button>
          <button class="iconbtn" data-act="undo" title="بازگشت (Ctrl+Z)">${ICON.undo}</button>
        </div>
      </div>
      <div class="readout" id="readout"></div>
      <div class="toolbar">
        <button class="iconbtn" data-act="shot" title="عکس ۴K">${ICON.camera}</button>
        <button class="iconbtn" data-act="export" title="خروجی">${ICON.download}</button>
      </div>
    </div>
    <aside class="panel" id="panel"><div class="loading"><span></span></div></aside>
  </div>`);
  const vp = $('#vp', root);
  const panel = $('#panel', root);

  const [{ createStage, ENVS, BACKDROPS, T }, J, Mt, { FONTS }] = await Promise.all([import('../three/stage.mjs'), import('../three/jewelry.mjs'), import('../three/materials.mjs'), import('../three/text.mjs')]);
  const stage = createStage(vp, { env: 'studio', backdrop: 'vault' });
  if (!stage) return;
  const { scene, camera, controls } = stage;

  const tc = new T.TransformControls(camera, stage.renderer.domElement);
  tc.setSize(0.8);
  scene.add(tc.getHelper());
  tc.addEventListener('dragging-changed', (e) => {
    controls.enabled = !e.value;
    if (!e.value) {
      commitTransform();
      pushHistory();
    }
  });
  tc.addEventListener('change', stage.invalidate);
  tc.addEventListener('objectChange', () => {
    commitTransform();
    updateReadout();
  });

  /* ---------------- state ---------------- */
  let uid = 1;
  const newPart = (type, extra = {}) => {
    const def = J.PIECES[type];
    const params = Object.fromEntries(Object.entries(def.params).map(([k, v]) => [k, v[0]]));
    return { id: uid++, type, params: { ...params, ...(extra.params ?? {}) }, opts: { ...def.opts, ...(extra.opts ?? {}) }, alloy: extra.alloy ?? 'au18y', finish: extra.finish ?? 'polish', gem: extra.opts?.gem ?? def.opts.gem ?? 'diamond', gem2: def.opts.gem2 ?? 'diamond', pos: extra.pos ?? [0, 0, 0], rot: extra.rot ?? [0, 0, 0], scale: extra.scale ?? 1 };
  };
  const S = { parts: [], sel: null, scene: { env: 'studio', backdrop: 'vault', exposure: 1, bloom: false, shadow: true } };
  const viewFor = () => (S.parts.length === 1 ? J.PIECES[S.parts[0].type].view : null) ?? {};
  const objs = new Map(); // part id → { group, metrics }
  const imgCache = new Map();
  const hist = [];

  const snapshotState = () => JSON.stringify({ parts: S.parts, sel: S.sel, scene: S.scene });
  function pushHistory() {
    const s = snapshotState();
    if (hist[hist.length - 1] !== s) hist.push(s);
    if (hist.length > 60) hist.shift();
    try {
      localStorage.setItem(SAVE_KEY, s);
    } catch {
      /* quota */
    }
  }
  async function restore(json, { record = true } = {}) {
    const d = typeof json === 'string' ? JSON.parse(json) : json;
    for (const o of objs.values()) stage.root.remove(o.group);
    objs.clear();
    S.parts = (Array.isArray(d.parts) ? d.parts : []).filter((p) => J.PIECES[p?.type]).slice(0, 24).map(sanitize);
    uid = Math.max(1, ...S.parts.map((p) => p.id + 1));
    S.sel = S.parts.find((p) => p.id === d.sel)?.id ?? S.parts[0]?.id ?? null;
    const sc = d.scene ?? {};
    if (ENVS.some(([k]) => k === sc.env)) S.scene.env = sc.env;
    if (BACKDROPS.some(([k]) => k === sc.backdrop)) S.scene.backdrop = sc.backdrop;
    if (Number.isFinite(sc.exposure)) S.scene.exposure = Math.min(2, Math.max(0.4, sc.exposure));
    if (typeof sc.bloom === 'boolean') S.scene.bloom = sc.bloom;
    if (typeof sc.shadow === 'boolean') S.scene.shadow = sc.shadow;
    applyScene();
    await Promise.all(S.parts.map((p) => rebuild(p)));
    select(S.sel);
    stage.ground();
    stage.frame(stage.root, { instant: !record, ...viewFor() });
    if (record) pushHistory();
  }
  const cur = () => S.parts.find((p) => p.id === S.sel) ?? null;
  /** Project files and saved state are untrusted: clamp every number to the piece's range. */
  function sanitize(raw) {
    const def = J.PIECES[raw.type];
    const base = newPart(raw.type);
    const num = (v, lo, hi, dflt) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : dflt);
    for (const [k, [dflt, lo, hi]] of Object.entries(def.params)) base.params[k] = num(raw.params?.[k], lo, hi, dflt);
    for (const k of Object.keys(def.opts)) {
      const v = raw.opts?.[k];
      if (typeof v === 'string') base.opts[k] = v.slice(0, 40);
      else if (typeof v === 'boolean') base.opts[k] = v;
    }
    if (typeof raw.opts?.imageData === 'string' && raw.opts.imageData.startsWith('data:image/') && raw.opts.imageData.length < 4e6) base.opts.imageData = raw.opts.imageData;
    if (Mt.METALS[raw.alloy]) base.alloy = raw.alloy;
    if (Mt.FINISHES.some(([f]) => f === raw.finish)) base.finish = raw.finish;
    if (Mt.GEMS[raw.gem]) base.gem = raw.gem;
    if (Mt.GEMS[raw.gem2]) base.gem2 = raw.gem2;
    base.pos = [0, 1, 2].map((i) => num(raw.pos?.[i], -500, 500, 0));
    base.rot = [0, 1, 2].map((i) => num(raw.rot?.[i], -10, 10, 0));
    base.scale = num(raw.scale, 0.05, 20, 1);
    base.id = Number.isInteger(raw.id) && raw.id > 0 ? raw.id : base.id;
    return base;
  }

  /* ---------------- building ---------------- */
  const loadImage = (src) => {
    if (!src) return Promise.resolve(null);
    if (imgCache.has(src)) return imgCache.get(src);
    const pr = new Promise((res) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => res(null);
      im.src = src;
    });
    imgCache.set(src, pr);
    return pr;
  };
  const buildSeq = new Map();
  async function rebuild(part) {
    const seq = (buildSeq.get(part.id) ?? 0) + 1;
    buildSeq.set(part.id, seq);
    const def = J.PIECES[part.type];
    const p = { ...part.params, ...part.opts, image: await loadImage(part.opts.imageData) };
    let meshes;
    try {
      meshes = await def.build(p);
    } catch (e) {
      console.error(e);
      toast('ساخت مدل با این مقادیر ممکن نشد.', 'error');
      return;
    }
    if (buildSeq.get(part.id) !== seq) return; // a newer build superseded this one
    const old = objs.get(part.id);
    const group = new T.Group();
    group.userData.partId = part.id;
    let metalVol = 0, area = 0;
    const gems = [];
    for (const m of meshes) {
      const role = m.userData.role;
      if (role === 'metal') {
        m.material = Mt.metalMaterial(part.alloy, part.finish);
        metalVol += Math.abs(J.signedVolume(m.geometry));
        area += J.surfaceArea(m.geometry);
      } else if (role === 'gem') {
        const kind = m.userData.slot === 'gem2' ? part.gem2 : part.gem;
        m.material = Mt.gemMaterial(kind);
        m.userData.kind = kind;
        gems.push({ kind, vol: Math.abs(J.signedVolume(m.geometry)), count: m.userData.count ?? 1, cut: m.userData.stone, size: m.userData.size });
      }
      group.add(m);
    }
    group.position.fromArray(part.pos);
    group.rotation.set(...part.rot);
    group.scale.setScalar(part.scale);
    if (old) {
      stage.root.remove(old.group);
      old.group.traverse((o) => o.geometry?.dispose());
      if (tc.object === old.group) tc.attach(group);
    }
    stage.root.add(group);
    objs.set(part.id, { group, metrics: { metalVol, area, gems, links: meshes[0]?.userData.links } });
    stage.invalidate();
    updateReadout();
  }

  function commitTransform() {
    const p = cur();
    const o = p && objs.get(p.id);
    if (!o) return;
    p.pos = o.group.position.toArray().map((v) => +v.toFixed(3));
    p.rot = [o.group.rotation.x, o.group.rotation.y, o.group.rotation.z].map((v) => +v.toFixed(4));
    p.scale = +o.group.scale.x.toFixed(4);
    if (Math.abs(o.group.scale.y - p.scale) > 1e-4 || Math.abs(o.group.scale.z - p.scale) > 1e-4) o.group.scale.setScalar(p.scale);
  }

  let gizmo = null; // transform handles only when the user picks a mode
  function setGizmo(mode) {
    gizmo = gizmo === mode ? null : mode;
    if (gizmo) tc.setMode(gizmo);
    $$('#gizmo [data-mode]', vp).forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.mode === gizmo)));
    const o = objs.get(S.sel);
    if (gizmo && o) tc.attach(o.group);
    else tc.detach();
    stage.invalidate();
  }
  function select(id) {
    S.sel = id;
    const o = objs.get(id);
    if (o && gizmo) tc.attach(o.group);
    else tc.detach();
    renderPanel();
    updateReadout();
    stage.invalidate();
  }

  /* ---------------- metrics ---------------- */
  function metricsFor(p) {
    const o = objs.get(p.id);
    if (!o) return null;
    const k = p.scale ** 3;
    const vol = o.metrics.metalVol * k; // mm³
    const a = alloyById(p.alloy);
    const grams = (vol / 1000) * a.density;
    const gems = o.metrics.gems.map((g) => {
      const sg = Mt.GEMS[g.kind]?.sg ?? 3.52;
      const ct = ((g.vol * k) / 1000) * sg / 0.2;
      return { ...g, ct, each: ct / g.count };
    });
    return { vol, grams, area: o.metrics.area * p.scale ** 2, a, gems, links: o.metrics.links };
  }
  function totals() {
    let grams = 0, vol = 0, ct = 0, gold = 0, area = 0;
    const p750 = store.me?.pricing?.p750;
    for (const p of S.parts) {
      const m = metricsFor(p);
      if (!m) continue;
      grams += m.grams;
      vol += m.vol;
      area += m.area;
      ct += m.gems.reduce((s, g) => s + g.ct, 0);
      if (m.a.fineness && p750) gold += m.grams * pricePerGramAt(p750, m.a.fineness);
    }
    return { grams, vol, ct, gold, area };
  }
  function updateReadout() {
    const t = totals();
    const p = cur();
    const m = p && metricsFor(p);
    const onlyGem = S.parts.every((x) => J.PIECES[x.type].noMetal);
    $('#readout', root).innerHTML = String(html`${onlyGem ? html`<b>${fmt(t.ct, 2)}<small>قیراط</small></b>` : html`<b>${fmt(t.grams, 2)}<small>گرم</small></b>`}
      <div>${S.parts.length > 1 ? `${fa(S.parts.length)} قطعه · ` : ''}${m ? `${m.a.label} · ` : ''}حجم ${fmt(t.vol / 1000, 3)} cm³${t.ct ? ` · سنگ ${fmt(t.ct, 2)} قیراط` : ''}${t.gold ? ` · ارزش طلا ${fmtT(t.gold)}` : ''}</div>`);
    const box = $('#measure', panel);
    if (box && p && m) box.innerHTML = String(measureHtml(p, m, t));
  }
  function measureHtml(p, m, t) {
    const rows = [];
    if (!J.PIECES[p.type].noMetal) {
      rows.push(['وزن فلز این قطعه', `${fmt(m.grams, 3)} گرم`], ['حجم فلز', `${fmt(m.vol, 1)} mm³`], ['مساحت سطح (برای آبکاری)', `${fmt(m.area / 100, 2)} cm²`], ['وزن موم ریخته‌گری', `${fmt((m.vol / 1000) * WAX_DENSITY, 3)} گرم`], ['وزن رزین چاپ سه‌بعدی', `${fmt((m.vol / 1000) * RESIN_DENSITY, 3)} گرم`], ['فلز لازم برای ذوب (با راهگاه)', `${fmt(m.grams * SPRUE_FACTOR, 2)} گرم`]);
      if (p.params.size && ['band', 'solitaire', 'halo', 'eternity', 'signet'].includes(p.type)) {
        const r = ringFromCircumference(p.params.size * p.scale);
        rows.push(['قطر داخلی / سایز آمریکا', `${fmt(r.diameter, 2)} mm / ${fmt(Math.round(r.us * 4) / 4, 2)}`]);
      }
      if (m.links) rows.push(['تعداد حلقه زنجیر', fmt(m.links)]);
    }
    for (const g of m.gems) rows.push([`${Mt.GEMS[g.kind]?.label ?? g.kind}${g.count > 1 ? ` × ${fa(g.count)}` : ''}`, `${fmt(g.each, 3)} قیراط${g.count > 1 ? ` (جمع ${fmt(g.ct, 2)})` : ''}`]);
    const cmp = J.PIECES[p.type].noMetal ? '' : html`<h3 style="margin-top:14px">همین قطعه در آلیاژهای دیگر</h3><div class="compare">${ALLOYS.map((al) => html`<button data-alloy="${al.id}" aria-pressed="${al.id === p.alloy}"><b>${fmt((m.vol / 1000) * al.density, 2)} گ</b><span>${al.label}</span></button>`)}</div>`;
    const inv = m.a.fineness ? html`<a class="btn small" style="margin-top:14px" href="/tools/invoice?weight=${m.grams.toFixed(3)}&fineness=${m.a.fineness}" data-link>پیش‌فاکتور همین قطعه</a>` : '';
    return html`<div class="kv">${rows.map(([k, v]) => html`<span>${k}</span><b>${fa(v)}</b>`)}</div>${inv}${cmp}`;
  }

  /* ---------------- panel ---------------- */
  const choiceList = (key, p) => {
    if (key === 'style') return p.type === 'chain' ? [['cable', 'کابلی (رولو)'], ['curb', 'کارتیه (کورب)'], ['figaro', 'فیگارو'], ['box', 'ونیزی (باکس)']] : [['prong', 'دانه‌ای'], ['channel', 'ریلی']];
    if (key === 'shape') return p.type === 'relief' ? [['disc', 'گرد'], ['rect', 'چهارگوش']] : J.PENDANT_SHAPES;
    if (key === 'profile') return J.PROFILES;
    if (key === 'cut') return J.CUTS;
    if (key === 'font') return FONTS.map(([f, l]) => [f, l]);
    return OPT_CHOICES[key];
  };
  const OPT_LABEL = { profile: 'مقطع رکاب', cut: 'تراش سنگ', setting: 'نوع نشاندن', style: 'بافت', shape: 'فرم', face: 'فرم صفحه', design: 'نقش', font: 'قلم' };

  function renderPanel() {
    const p = cur();
    const def = p && J.PIECES[p.type];
    const gemKinds = Object.entries(Mt.GEMS);
    panel.innerHTML = String(html`
      <div class="sheet-handle" data-sheet role="button" aria-label="باز و بسته کردن تنظیمات"></div>
      <div class="grp">
        <h3><span>نمونه‌های آماده</span></h3>
        <div class="chips">${PRESETS.map((pr, i) => html`<button class="chip" data-preset="${i}">${pr.label}</button>`)}</div>
      </div>
      <div class="grp">
        <h3><span>قطعه‌های صحنه</span><button class="btn small ghost" data-act="add">${ICON.plus} افزودن</button></h3>
        <ul class="parts">${S.parts.map((x) => html`<li data-part="${x.id}" aria-selected="${x.id === S.sel}">${svg(PIECE_ICONS[x.type])}<span>${J.PIECES[x.type].label}</span><button data-del="${x.id}" title="حذف">×</button></li>`)}</ul>
      </div>
      ${p
        ? html`<div class="grp">
        <h3><span>نوع قطعه</span></h3>
        <div class="piece-grid">${Object.entries(J.PIECES).map(([k, d]) => html`<button data-type="${k}" aria-pressed="${k === p.type}">${svg(PIECE_ICONS[k])}${d.label}</button>`)}</div>
      </div>
      <div class="grp">
        <h3><span>ابعاد (میلی‌متر)</span></h3>
        ${Object.entries(def.params).map(([k, [, min, max, step, label]]) => html`<label class="param"><span class="lbl"><span>${label}</span><b data-out="${k}">${fa(p.params[k])}</b></span><input type="range" min="${min}" max="${max}" step="${step}" value="${p.params[k]}" data-param="${k}"></label>`)}
        ${Object.keys(def.opts).filter((k) => !['gem', 'gem2', 'text', 'line1', 'line2', 'image', 'mirror', 'invert'].includes(k)).map((k) => html`<div style="margin-top:12px"><div class="small" style="margin-bottom:6px">${OPT_LABEL[k] ?? k}</div><div class="chips">${(choiceList(k, p) ?? []).map(([v, l]) => html`<button class="chip" data-opt="${k}" data-val="${v}" aria-pressed="${p.opts[k] === v}">${l}</button>`)}</div></div>`)}
        ${['text', 'line1', 'line2'].filter((k) => k in def.opts).map((k) => html`<label class="field" style="margin-top:12px">${k === 'text' ? (p.type === 'name' ? 'نام' : 'نوشته / حرف') : k === 'line1' ? 'سطر اول' : 'سطر دوم'}<input class="input" data-text="${k}" value="${p.opts[k] ?? ''}" maxlength="40"></label>`)}
        ${'mirror' in def.opts ? html`<label class="small" style="display:flex;gap:8px;margin-top:10px"><input type="checkbox" data-bool="mirror" ${p.opts.mirror ? 'checked' : ''}> نقش معکوس (برای مهر زدن روی لاک/موم)</label>` : ''}
        ${'image' in def.opts ? html`<div style="margin-top:12px;display:grid;gap:8px"><label class="btn small ghost" style="cursor:pointer">بارگذاری تصویر / لوگو<input type="file" accept="image/*" data-image hidden></label>${'invert' in def.opts ? html`<label class="small" style="display:flex;gap:8px"><input type="checkbox" data-bool="invert" ${p.opts.invert ? 'checked' : ''}> وارونه (تیره = برجسته)</label>` : ''}<span class="small">روشنی هر نقطه تصویر = ارتفاع نقش. تصاویر پرکنتراست بهترین نتیجه را می‌دهند.</span></div>` : ''}
      </div>
      ${def.noMetal
        ? ''
        : html`<div class="grp">
        <h3><span>فلز</span></h3>
        <div class="chips">${ALLOYS.map((a) => html`<button class="chip" data-alloy="${a.id}" aria-pressed="${a.id === p.alloy}"><i style="background:rgb(${Mt.METALS[a.id].f0.map((v) => Math.round(Math.pow(v, 1 / 2.2) * 255)).join(',')})"></i>${a.label}</button>`)}</div>
        <div class="small" style="margin:12px 0 6px">پرداخت سطح</div>
        <div class="chips">${Mt.FINISHES.map(([k, l]) => html`<button class="chip" data-finish="${k}" aria-pressed="${k === p.finish}">${l}</button>`)}</div>
      </div>`}
      ${'gem' in def.opts || def.noMetal
        ? html`<div class="grp">
        <h3><span>سنگ${'gem2' in def.opts ? ' مرکزی' : ''}</span></h3>
        <div class="chips">${gemKinds.map(([k, g]) => html`<button class="chip" data-gem="${k}" aria-pressed="${k === p.gem}"><i style="background:#${new T.Color(g.color).getHexString()}"></i>${g.label}</button>`)}</div>
        ${'gem2' in def.opts ? html`<div class="small" style="margin:12px 0 6px">سنگ‌های هاله</div><div class="chips">${gemKinds.map(([k, g]) => html`<button class="chip" data-gem2="${k}" aria-pressed="${k === p.gem2}"><i style="background:#${new T.Color(g.color).getHexString()}"></i>${g.label}</button>`)}</div>` : ''}
      </div>`
        : ''}
      <div class="grp">
        <h3><span>اندازه‌گیری و محاسبه</span></h3>
        <div id="measure"></div>
      </div>`
        : html`<p class="small">قطعه‌ای در صحنه نیست؛ از «افزودن» یا نمونه‌های آماده شروع کنید.</p>`}
      <div class="grp">
        <h3><span>نور و صحنه</span></h3>
        <div class="chips">${ENVS.map(([k, l]) => html`<button class="chip" data-env="${k}" aria-pressed="${k === S.scene.env}">${l}</button>`)}</div>
        <div class="chips" style="margin-top:8px">${BACKDROPS.map(([k, l, c]) => html`<button class="chip" data-bg="${k}" aria-pressed="${k === S.scene.backdrop}"><i style="background:#${c.toString(16).padStart(6, '0')}"></i>${l}</button>`)}</div>
        <label class="param" style="margin-top:12px"><span class="lbl"><span>نوردهی</span><b data-out="exposure">${fa(S.scene.exposure)}</b></span><input type="range" min="0.4" max="2" step="0.05" value="${S.scene.exposure}" data-scene="exposure"></label>
        <div class="chips"><button class="chip" data-toggle="bloom" aria-pressed="${S.scene.bloom}">درخشش نگین</button><button class="chip" data-toggle="shadow" aria-pressed="${S.scene.shadow}">سایه</button></div>
      </div>
      <div class="grp">
        <h3><span>خروجی</span></h3>
        <div class="actions" style="margin-top:0">
          <button class="btn small" data-act="export">${ICON.download} تصویر و مدل</button>
          <button class="btn small ghost" data-act="video">${ICON.video} ویدیوی ۳۶۰°</button>
          <button class="btn small ghost" data-act="card">کارت مشخصات برای مشتری</button>
          <button class="btn small ghost" data-act="publish">ذخیره در گالری تیم</button>
          <button class="btn small ghost" data-act="gallery">گالری تیم</button>
          <button class="btn small ghost" data-act="save">فایل پروژه</button>
          <label class="btn small ghost" style="cursor:pointer">بازکردن پروژه<input type="file" accept=".json,application/json" data-load hidden></label>
        </div>
        <p class="small">STL و OBJ به میلی‌متر برای چاپ سه‌بعدی و ریخته‌گری؛ GLB و USDZ به متر برای وب و واقعیت افزوده.</p>
      </div>`);
    updateReadout();
  }

  function applyScene() {
    stage.setEnv(S.scene.env);
    stage.setBackdrop(S.scene.backdrop);
    stage.setExposure(S.scene.exposure);
    stage.setBloom(S.scene.bloom);
    stage.setShadow(S.scene.shadow);
  }

  /* ---------------- events ---------------- */
  let rafId = 0;
  const schedule = (p, { reframe = false } = {}) => {
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(async () => {
      await rebuild(p);
      stage.ground();
      if (reframe) stage.frame(stage.root, viewFor());
    });
  };
  let textTimer = 0;
  panel.addEventListener('input', (e) => {
    const t = e.target;
    const p = cur();
    if (t.dataset.param && p) {
      p.params[t.dataset.param] = Number(t.value);
      panel.querySelector(`[data-out="${t.dataset.param}"]`).textContent = fa(t.value);
      schedule(p);
    } else if (t.dataset.scene === 'exposure') {
      S.scene.exposure = Number(t.value);
      panel.querySelector('[data-out="exposure"]').textContent = fa(t.value);
      stage.setExposure(S.scene.exposure);
    } else if (t.dataset.text && p) {
      p.opts[t.dataset.text] = t.value;
      clearTimeout(textTimer);
      textTimer = setTimeout(() => (schedule(p), pushHistory()), 350);
    }
  });
  panel.addEventListener('change', async (e) => {
    const t = e.target;
    const p = cur();
    if (t.dataset.param) pushHistory();
    if (t.dataset.bool && p) {
      p.opts[t.dataset.bool] = t.checked;
      schedule(p);
      pushHistory();
    }
    if (t.matches('[data-image]') && p && t.files[0]) {
      const data = await fileToDataURL(t.files[0], 1024);
      p.opts.imageData = data;
      if ('design' in p.opts) p.opts.design = 'image';
      renderPanel();
      schedule(p);
      pushHistory();
    }
    if (t.matches('[data-load]') && t.files[0]) {
      try {
        await restore(await t.files[0].text());
        toast('پروژه بارگذاری شد.', 'ok');
      } catch {
        toast('فایل پروژه معتبر نیست.', 'error');
      }
    }
  });
  panel.addEventListener('click', async (e) => {
    const b = e.target.closest('button, li[data-part]');
    if (!b) return;
    const p = cur();
    const d = b.dataset;
    if (d.del) {
      e.stopPropagation();
      const id = Number(d.del);
      const o = objs.get(id);
      if (o) stage.root.remove(o.group);
      objs.delete(id);
      S.parts = S.parts.filter((x) => x.id !== id);
      select(S.parts[0]?.id ?? null);
      pushHistory();
    } else if (d.part) select(Number(d.part));
    else if (d.preset) {
      const pr = PRESETS[Number(d.preset)];
      uid = 1;
      await restore({ parts: pr.parts.map((x) => newPart(x.type, x)), scene: S.scene });
    } else if (d.type && p) {
      const np = newPart(d.type, { alloy: p.alloy, finish: p.finish, pos: p.pos, rot: p.rot });
      np.id = p.id;
      Object.assign(p, np);
      renderPanel();
      schedule(p, { reframe: true });
      pushHistory();
    } else if (d.opt && p) {
      p.opts[d.opt] = d.val;
      $$(`[data-opt="${d.opt}"]`, panel).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      schedule(p);
      pushHistory();
    } else if (d.alloy && p) {
      p.alloy = d.alloy;
      renderPanel();
      schedule(p);
      pushHistory();
    } else if (d.finish && p) {
      p.finish = d.finish;
      $$('[data-finish]', panel).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      schedule(p);
      pushHistory();
    } else if (d.gem && p) {
      p.gem = d.gem;
      $$('[data-gem]', panel).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      schedule(p);
      pushHistory();
    } else if (d.gem2 && p) {
      p.gem2 = d.gem2;
      $$('[data-gem2]', panel).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      schedule(p);
      pushHistory();
    } else if (d.env) {
      S.scene.env = d.env;
      stage.setEnv(d.env);
      $$('[data-env]', panel).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      pushHistory();
    } else if (d.bg) {
      S.scene.backdrop = d.bg;
      stage.setBackdrop(d.bg);
      $$('[data-bg]', panel).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      pushHistory();
    } else if (d.toggle) {
      S.scene[d.toggle] = !S.scene[d.toggle];
      b.setAttribute('aria-pressed', String(S.scene[d.toggle]));
      applyScene();
      pushHistory();
    } else if (d.act) onAct(d.act, b);
  });
  // bottom sheet (phones): tap or drag the handle
  let drag = null;
  panel.addEventListener('pointerdown', (e) => {
    if (!e.target.closest('[data-sheet]')) return;
    drag = { y: e.clientY, moved: false };
    panel.classList.add('dragging');
    e.target.setPointerCapture?.(e.pointerId);
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
  vp.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.mode) setGizmo(b.dataset.mode);
    else if (b.dataset.act) onAct(b.dataset.act, b);
  });

  async function onAct(act, b) {
    if (act === 'frame') stage.frame();
    else if (act === 'spin') {
      controls.autoRotate = !controls.autoRotate;
      b.setAttribute('aria-pressed', String(controls.autoRotate));
    } else if (act === 'grid') {
      stage.grid.visible = !stage.grid.visible;
      b.setAttribute('aria-pressed', String(stage.grid.visible));
      stage.invalidate();
    } else if (act === 'undo') undo();
    else if (act === 'add') addDialog();
    else if (act === 'shot') {
      toast('در حال ساخت تصویر ۴K…');
      const r = await stage.snapshot({ width: 3840, height: 2160 });
      download(r.blob, `beatris-${Date.now()}.png`);
    } else if (act === 'export') exportDialog();
    else if (act === 'video') videoDialog();
    else if (act === 'card') specCardDialog();
    else if (act === 'publish') publishDialog();
    else if (act === 'gallery') galleryDialog();
    else if (act === 'save') download(new Blob([snapshotState()], { type: 'application/json' }), `beatris-project-${Date.now()}.json`);
  }

  function undo() {
    if (hist.length < 2) return toast('مرحله‌ای برای بازگشت نیست.');
    hist.pop();
    restore(hist[hist.length - 1], { record: false });
  }

  /* picking */
  let down = null;
  stage.renderer.domElement.addEventListener('pointerdown', (e) => (down = [e.clientX, e.clientY]));
  stage.renderer.domElement.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4 || tc.dragging) return;
    const r = stage.renderer.domElement.getBoundingClientRect();
    const ray = new T.Raycaster();
    ray.setFromCamera(new T.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    const hit = ray.intersectObjects(stage.root.children, true)[0];
    let o = hit?.object;
    while (o && o.userData.partId === undefined) o = o.parent;
    if (o) select(o.userData.partId);
  });
  const onKey = (e) => {
    if (e.target.closest('input, textarea')) return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z') {
      e.preventDefault();
      undo();
    } else if (k === 'w' || k === 'e' || k === 'r') setGizmo({ w: 'translate', e: 'rotate', r: 'scale' }[k]);
    else if (k === 'escape' && gizmo) setGizmo(gizmo); else if (k === 'f') stage.frame();
  };
  addEventListener('keydown', onKey);

  /* ---------------- dialogs ---------------- */
  function modal(inner, wire) {
    const m = document.createElement('div');
    m.className = 'modal';
    m.innerHTML = `<div class="tray">${inner}</div>`;
    document.body.append(m);
    const close = () => m.remove();
    m.addEventListener('click', (e) => e.target === m && close());
    wire(m, close);
    return close;
  }
  function addDialog() {
    modal(String(html`<h3 style="font-family:var(--display);font-size:26px;margin-bottom:12px">افزودن قطعه</h3><div class="piece-grid">${Object.entries(J.PIECES).map(([k, d]) => html`<button data-add="${k}">${svg(PIECE_ICONS[k])}${d.label}</button>`)}</div>`), (m, close) => {
      m.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-add]');
        if (!b) return;
        close();
        const box = new T.Box3().setFromObject(stage.root);
        const x = box.isEmpty() ? 0 : box.max.x + 12;
        const np = newPart(b.dataset.add, { alloy: cur()?.alloy, pos: [x, 0, 0] });
        S.parts.push(np);
        await rebuild(np);
        select(np.id);
        stage.ground();
        stage.frame();
        pushHistory();
      });
    });
  }

  const RES = [
    ['1080', 'مربع ۱۰۸۰ (اینستاگرام)', 1080, 1080],
    ['story', 'استوری ۱۰۸۰×۱۹۲۰', 1080, 1920],
    ['2k', 'مربع ۲K', 2048, 2048],
    ['4k', '۴K افقی ۳۸۴۰×۲۱۶۰', 3840, 2160],
    ['4ks', '۴K مربع ۴۰۹۶', 4096, 4096],
    ['8k', '۸K ۷۶۸۰×۴۳۲۰', 7680, 4320],
  ];
  function exportDialog() {
    modal(
      String(html`<h3 style="font-family:var(--display);font-size:26px">خروجی</h3>
      <p class="small">تصویر با همان نور و زاویه فعلی و با کیفیت بالا ساخته می‌شود.</p>
      <div class="chips" id="res" style="margin:10px 0">${RES.map(([k, l], i) => html`<button class="chip" data-res="${k}" aria-pressed="${i === 3}">${l}</button>`)}</div>
      <label class="small" style="display:flex;gap:8px;margin:6px 0 14px"><input type="checkbox" id="transp"> پس‌زمینه شفاف (PNG برای کاتالوگ و سایت)</label>
      <div class="actions" style="margin-top:0"><button class="btn small" data-x="png">تصویر PNG</button><button class="btn small ghost" data-x="jpg">JPG</button></div>
      <hr class="rule">
      <div class="small" style="margin-bottom:8px">مدل سه‌بعدی</div>
      <label class="small" style="display:flex;gap:8px;margin-bottom:10px"><input type="checkbox" id="metalOnly" checked> فقط فلز (برای موم/رزین ریخته‌گری، بدون سنگ)</label>
      <div class="actions" style="margin-top:0"><button class="btn small ghost" data-x="stl">STL</button><button class="btn small ghost" data-x="obj">OBJ</button><button class="btn small ghost" data-x="ply">PLY</button><button class="btn small ghost" data-x="glb">GLB</button><button class="btn small ghost" data-x="usdz">USDZ (آیفون AR)</button></div>`),
      (m, close) => {
        let res = RES[3];
        m.addEventListener('click', async (e) => {
          const r = e.target.closest('[data-res]');
          if (r) {
            res = RES.find((x) => x[0] === r.dataset.res);
            $$('[data-res]', m).forEach((x) => x.setAttribute('aria-pressed', String(x === r)));
            return;
          }
          const x = e.target.closest('[data-x]')?.dataset.x;
          if (!x) return;
          const btn = e.target.closest('button');
          btn.classList.add('is-busy');
          try {
            if (x === 'png' || x === 'jpg') {
              const out = await stage.snapshot({ width: res[2], height: res[3], transparent: x === 'png' && $('#transp', m).checked, type: x === 'png' ? 'image/png' : 'image/jpeg' });
              download(out.blob, `beatris-${out.width}x${out.height}.${x}`);
              if (out.width < res[2]) toast(`حداکثر وضوح این دستگاه ${fa(out.width)}×${fa(out.height)} است.`);
            } else await exportModel(x, $('#metalOnly', m).checked);
          } catch (err) {
            console.error(err);
            toast('خروجی گرفته نشد.', 'error');
          } finally {
            btn.classList.remove('is-busy');
          }
        });
      },
    );
  }

  function exportGroup({ metalOnly, meters }) {
    stage.root.updateMatrixWorld(true);
    const g = new T.Group();
    stage.root.traverse((o) => {
      if (!o.isMesh) return;
      if (metalOnly && o.userData.role === 'gem') return;
      const geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
      if (meters) geo.scale(0.001, 0.001, 0.001);
      const mesh = new T.Mesh(geo, o.material);
      mesh.name = `${o.userData.role}-${o.parent?.userData.partId ?? ''}`;
      g.add(mesh);
    });
    return g;
  }
  async function exportModel(kind, metalOnly) {
    const name = `beatris-${S.parts.map((p) => p.type).join('-')}`;
    if (kind === 'stl') {
      const data = new T.STLExporter().parse(exportGroup({ metalOnly }), { binary: true });
      download(new Blob([data], { type: 'model/stl' }), `${name}.stl`);
    } else if (kind === 'obj') {
      download(new Blob([new T.OBJExporter().parse(exportGroup({ metalOnly }))], { type: 'text/plain' }), `${name}.obj`);
    } else if (kind === 'ply') {
      const data = await new Promise((res) => new T.PLYExporter().parse(exportGroup({ metalOnly }), res, { binary: true }));
      download(new Blob([data], { type: 'application/octet-stream' }), `${name}.ply`);
    } else if (kind === 'glb') {
      const data = await new T.GLTFExporter().parseAsync(exportGroup({ metalOnly: false, meters: true }), { binary: true });
      download(new Blob([data], { type: 'model/gltf-binary' }), `${name}.glb`);
    } else if (kind === 'usdz') {
      const data = await new T.USDZExporter().parseAsync(exportGroup({ metalOnly: false, meters: true }));
      download(new Blob([data], { type: 'model/vnd.usdz+zip' }), `${name}.usdz`);
    }
    toast('فایل آماده شد.', 'ok');
  }

  const blobToDataURL = (b) => new Promise((res) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.readAsDataURL(b);
  });
  const partsLabel = () => [...new Set(S.parts.map((p) => J.PIECES[p.type].label))].join(' + ');
  function summaryLine() {
    const t = totals();
    const p = S.parts.find((x) => !J.PIECES[x.type].noMetal);
    const bits = [];
    if (p) bits.push(`${alloyById(p.alloy).label} · ${fmt(t.grams, 2)} گرم`);
    if (t.ct) bits.push(`سنگ ${fmt(t.ct, 2)} قیراط`);
    return fa(bits.join(' · '));
  }

  function publishDialog() {
    if (!S.parts.length) return toast('صحنه خالی است.');
    modal(
      String(html`<h3 style="font-family:var(--display);font-size:26px">ذخیره در گالری تیم</h3><p class="small">همکاران شعبه طرح را می‌بینند و می‌توانند آن را باز کنند.</p>
      <label class="field" style="margin:12px 0">نام طرح<input class="input" id="dtitle" maxlength="80" value="${partsLabel()}"></label>
      <div class="actions"><button class="btn" data-pub>ذخیره</button></div>`),
      (m, close) => {
        m.addEventListener('click', async (e) => {
          const b = e.target.closest('[data-pub]');
          if (!b) return;
          b.classList.add('is-busy');
          try {
            const shot = await stage.snapshot({ width: 480, height: 480, type: 'image/jpeg', quality: 0.8 });
            const project = JSON.parse(snapshotState());
            await api('/api/designs', { method: 'POST', body: { title: $('#dtitle', m).value, summary: summaryLine(), thumb: await blobToDataURL(shot.blob), project } });
            toast('در گالری تیم ذخیره شد.', 'ok');
            close();
          } catch (err) {
            toast(err.message, 'error');
            b.classList.remove('is-busy');
          }
        });
      },
    );
  }

  async function galleryDialog() {
    let list;
    try {
      list = (await api('/api/designs')).designs;
    } catch (err) {
      return toast(err.message, 'error');
    }
    const me = store.me.user;
    const canDel = (d) => d.userId === me.id || store.isAdmin();
    modal(
      String(html`<h3 style="font-family:var(--display);font-size:26px;margin-bottom:12px">گالری تیم</h3>
      ${list.length
        ? html`<div class="gallery">${list.map((d) => html`<figure data-open="${d.id}"><img src="${d.thumb}" alt="${d.title}" loading="lazy"><figcaption><b>${d.title}</b><span>${d.summary}</span><span>${d.author} · ${new Date(d.createdAt).toLocaleDateString('fa-IR')}</span></figcaption>${canDel(d) ? html`<button data-del-design="${d.id}" title="حذف">×</button>` : ''}</figure>`)}</div>`
        : html`<p class="small">هنوز طرحی ذخیره نشده است. اولین طرح را از «ذخیره در گالری تیم» بسازید.</p>`}`),
      (m, close) => {
        m.addEventListener('click', async (e) => {
          const del = e.target.closest('[data-del-design]');
          if (del) {
            e.stopPropagation();
            try {
              await api(`/api/designs/${del.dataset.delDesign}`, { method: 'DELETE' });
              del.closest('figure').remove();
              toast('طرح حذف شد.', 'ok');
            } catch (err) {
              toast(err.message, 'error');
            }
            return;
          }
          const f = e.target.closest('[data-open]');
          if (!f) return;
          try {
            const d = await api(`/api/designs/${f.dataset.open}`);
            close();
            await restore(d.project);
            toast(fa(`«${d.title}» باز شد.`), 'ok');
          } catch (err) {
            toast(err.message, 'error');
          }
        });
      },
    );
  }

  /** A portrait card (1080×1350) for WhatsApp / Instagram: render + specifications. */
  function specCardDialog() {
    if (!S.parts.length) return toast('صحنه خالی است.');
    modal(
      String(html`<h3 style="font-family:var(--display);font-size:26px">کارت مشخصات</h3><p class="small">تصویر عمودی ۱۰۸۰×۱۳۵۰ با رندر طرح و مشخصات، آماده ارسال برای مشتری.</p>
      <label class="field" style="margin:12px 0">عنوان روی کارت<input class="input" id="ctitle" maxlength="60" value="${partsLabel()}"></label>
      <label class="small" style="display:flex;gap:8px;margin-bottom:14px"><input type="checkbox" id="cprice" checked> ارزش طلا با قیمت امروز روی کارت باشد</label>
      <div class="actions"><button class="btn" data-mk>ساخت و اشتراک</button></div>`),
      (m, close) => {
        m.addEventListener('click', async (e) => {
          const b = e.target.closest('[data-mk]');
          if (!b) return;
          b.classList.add('is-busy');
          try {
            const blob = await specCard($('#ctitle', m).value, $('#cprice', m).checked);
            const file = new File([blob], `beatris-card-${Date.now()}.png`, { type: 'image/png' });
            if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: $('#ctitle', m).value }).catch(() => download(blob, file.name));
            else download(blob, file.name);
            close();
          } catch (err) {
            console.error(err);
            toast('کارت ساخته نشد.', 'error');
            b.classList.remove('is-busy');
          }
        });
      },
    );
  }
  async function specCard(title, withPrice) {
    await Promise.all(['600 64px Markazi', '400 30px Vazirmatn', '700 30px Vazirmatn', '600 30px Kufi'].map((f) => document.fonts.load(f, 'طلا ۱۲۳')));
    const W = 1080, H = 1350;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d');
    const bg = g.createRadialGradient(W * 0.5, H * 0.32, 40, W * 0.5, H * 0.4, W * 0.95);
    bg.addColorStop(0, '#3a2c16');
    bg.addColorStop(0.55, '#15110b');
    bg.addColorStop(1, '#080705');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    const shot = await stage.snapshot({ width: 1080, height: 900, transparent: true });
    const img = await createImageBitmap(shot.blob);
    g.drawImage(img, 0, 70, 1080, 900);
    const gold = g.createLinearGradient(0, 0, W, 0);
    gold.addColorStop(0, '#fff3cf');
    gold.addColorStop(0.45, '#e3b862');
    gold.addColorStop(1, '#a8761f');
    g.direction = 'rtl';
    g.textAlign = 'right';
    const R = W - 80;
    g.fillStyle = '#e3b862';
    g.font = '600 30px Kufi';
    g.fillText('بئاتریس', R, 86);
    g.fillStyle = '#a2977f';
    g.font = '400 24px Vazirmatn';
    g.textAlign = 'left';
    g.fillText(new Date().toLocaleDateString('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' }), 80, 86);
    g.textAlign = 'right';
    g.fillStyle = gold;
    g.font = '600 76px Markazi';
    g.fillText(title || partsLabel(), R, 1035);
    const t = totals();
    const lines = [];
    for (const p of S.parts) {
      const mm = metricsFor(p);
      if (!mm) continue;
      if (!J.PIECES[p.type].noMetal) lines.push(`${J.PIECES[p.type].label} · ${mm.a.label} · ${fmt(mm.grams, 2)} گرم`);
      for (const gm of mm.gems) lines.push(`${Mt.GEMS[gm.kind]?.label ?? ''}${gm.count > 1 ? ` × ${gm.count}` : ''} · ${fmt(gm.ct, 2)} قیراط`);
    }
    g.fillStyle = '#efe6d2';
    g.font = '400 32px Vazirmatn';
    lines.slice(0, withPrice && t.gold ? 3 : 4).forEach((l, i) => g.fillText(fa(l), R, 1105 + i * 50));
    if (withPrice && t.gold) {
      g.fillStyle = '#f7e6b0';
      g.font = '700 38px Vazirmatn';
      g.fillText(fa(`ارزش طلا امروز: ${fmtT(t.gold)}`), R, Math.min(H - 110, 1105 + Math.min(4, lines.length) * 50 + 20));
    }
    g.fillStyle = '#6f6655';
    g.font = '400 20px Vazirmatn';
    g.fillText('وزن و قیراط از مدل سه‌بعدی محاسبه شده و تخمینی است؛ وزن نهایی پس از ساخت اعلام می‌شود.', R, H - 58);
    g.strokeStyle = 'rgba(227,184,98,.35)';
    g.lineWidth = 2;
    g.strokeRect(36, 36, W - 72, H - 72);
    return new Promise((res) => c.toBlob(res, 'image/png'));
  }

  function videoDialog() {
    modal(
      String(html`<h3 style="font-family:var(--display);font-size:26px">ویدیوی چرخشی ۳۶۰°</h3><p class="small">مدل یک دور کامل می‌چرخد؛ مناسب اینستاگرام و ویترین آنلاین.</p>
      <div class="chips" style="margin:10px 0"><button class="chip" data-sec="4">۴ ثانیه</button><button class="chip" data-sec="6" aria-pressed="true">۶ ثانیه</button><button class="chip" data-sec="10">۱۰ ثانیه</button></div>
      <div class="bar" style="margin:12px 0"><i id="vprog" style="width:0"></i></div>
      <div class="actions"><button class="btn small" data-rec>شروع ضبط</button></div>`),
      (m, close) => {
        let sec = 6;
        m.addEventListener('click', async (e) => {
          const s = e.target.closest('[data-sec]');
          if (s) {
            sec = Number(s.dataset.sec);
            $$('[data-sec]', m).forEach((x) => x.setAttribute('aria-pressed', String(x === s)));
          }
          const rec = e.target.closest('[data-rec]');
          if (!rec) return;
          rec.classList.add('is-busy');
          try {
            tc.getHelper().visible = false;
            const blob = await stage.turntable({ seconds: sec, onProgress: (k) => ($('#vprog', m).style.width = `${k * 100}%`) });
            download(blob, `beatris-360.${blob.type.includes('mp4') ? 'mp4' : 'webm'}`);
            close();
          } catch (err) {
            toast(err.message || 'ضبط انجام نشد.', 'error');
          } finally {
            tc.getHelper().visible = true;
            rec.classList.remove('is-busy');
          }
        });
      },
    );
  }

  /* ---------------- boot ---------------- */
  let saved = null;
  try {
    saved = localStorage.getItem(SAVE_KEY);
  } catch {
    /* storage unavailable */
  }
  const q = new URLSearchParams(location.search).get('p');
  if (q && J.PIECES[q]) await restore({ parts: [newPart(q)], scene: S.scene });
  else if (saved) await restore(saved).catch(() => restore({ parts: [newPart('solitaire')] }));
  else await restore({ parts: [newPart('solitaire', { opts: { setting: 'prong6' } })] });

  return () => {
    removeEventListener('keydown', onKey);
    tc.detach();
    tc.dispose();
    stage.dispose();
    $$('.modal').forEach((m) => m.remove());
  };
}

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  setTimeout(() => (URL.revokeObjectURL(a.href), a.remove()), 1500);
}
function fileToDataURL(file, max) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      res(c.toDataURL('image/png'));
    };
    img.onerror = rej;
    img.src = URL.createObjectURL(file);
  });
}
