import { html, store, fa, $ } from '../core.mjs';
import { back } from '../ui.mjs';
import { ALLOYS, alloyById, fmt, fmtT, pricePerGramAt, ringFromCircumference } from '../calc.mjs';
import { createViewer } from '../gl/viewer.mjs';
import * as S from '../gl/pieces.mjs';

const PIECES = {
  band: { label: 'حلقه ساده', params: [['size', 'سایز ISO (محیط mm)', 44, 72, 0.5, 54], ['width', 'پهنا (mm)', 2, 10, 0.1, 4], ['thickness', 'ضخامت (mm)', 1, 3, 0.05, 1.8]], profile: true },
  solitaire: { label: 'تک‌نگین', params: [['size', 'سایز ISO (محیط mm)', 44, 72, 0.5, 54], ['gem', 'قطر سنگ (mm)', 3, 9, 0.1, 6.5]], gem: true },
  bangle: { label: 'النگو', params: [['diameter', 'قطر داخلی (mm)', 55, 72, 0.5, 62], ['width', 'پهنا (mm)', 2, 12, 0.1, 5], ['thickness', 'ضخامت (mm)', 1, 3.5, 0.05, 2.2]], profile: true },
  chain: { label: 'زنجیر', params: [['length', 'طول (cm)', 35, 70, 1, 45], ['wire', 'قطر سیم (mm)', 0.4, 1.8, 0.05, 0.9], ['link', 'طول حلقه (mm)', 3, 9, 0.1, 5]] },
  bar: { label: 'شمش', params: [['length', 'طول (mm)', 10, 60, 0.5, 30], ['width', 'عرض (mm)', 6, 35, 0.5, 17], ['height', 'ضخامت (mm)', 0.8, 8, 0.1, 3.2]] },
  gem: { label: 'آناتومی برلیان', params: [['gem', 'قطر (mm)', 3, 12, 0.1, 8]], noMetal: true, gem: true },
};
const PROFILES = [['comfort', 'راحت (داخل گرد)'], ['court', 'گنبدی'], ['flat', 'تخت'], ['knife', 'تیغه‌ای']];
const GEMS = [['diamond', 'الماس'], ['ruby', 'یاقوت'], ['sapphire', 'یاقوت کبود'], ['emerald', 'زمرد']];

export function studioPage(root) {
  const q = new URLSearchParams(location.search);
  const st = { piece: PIECES[q.get('p')] ? q.get('p') : 'band', alloy: 'au18y', profile: 'comfort', gemKind: 'diamond', values: {} };
  const p750 = store.me.pricing.p750;

  root.innerHTML = String(html`${back('/tools', 'ابزار')}<h1>استودیوی سه‌بعدی</h1>
    <p class="lead">ابعاد را تغییر دهید؛ وزن از حجم واقعی مدل و چگالی آلیاژ حساب می‌شود. با کشیدن بچرخانید، با دو انگشت یا چرخ ماوس بزرگ‌نمایی کنید.</p>
    <div class="studio" style="margin-top:16px">
      <div class="studio-stage" id="stage"><div class="studio-readout" id="read"></div></div>
      <div class="tray" id="panel"></div>
    </div>`);
  const viewer = createViewer($('#stage', root), { pitch: 0.35 });
  const panel = $('#panel', root);
  let lastPiece = null;

  const val = (k) => st.values[`${st.piece}.${k}`] ?? PIECES[st.piece].params.find((p) => p[0] === k)[5];

  function build(alloy = st.alloy) {
    const P = st.piece;
    if (P === 'band') return S.ringScene({ alloy, diameter: val('size') / Math.PI, width: val('width'), thickness: val('thickness'), profile: st.profile });
    if (P === 'solitaire') return S.solitaireScene({ alloy, diameter: val('size') / Math.PI, gemMm: val('gem'), gem: st.gemKind });
    if (P === 'bangle') return S.bangleScene({ alloy, diameter: val('diameter'), width: val('width'), thickness: val('thickness'), profile: st.profile });
    if (P === 'chain') return S.chainScene({ alloy, lengthCm: val('length'), wire: val('wire'), linkLength: val('link') });
    if (P === 'bar') return S.barScene({ alloy, length: val('length'), width: val('width'), height: val('height') });
    return S.gemScene({ gemMm: val('gem'), gem: st.gemKind });
  }

  function renderPanel() {
    const def = PIECES[st.piece];
    panel.innerHTML = String(html`
      <h3>قطعه</h3><div class="seg" role="group" style="margin:8px 0 16px">${Object.entries(PIECES).map(([k, d]) => html`<button data-piece="${k}" aria-pressed="${k === st.piece}">${d.label}</button>`)}</div>
      ${def.noMetal ? '' : html`<h3>آلیاژ</h3><div class="compare" id="cmp" style="margin:8px 0 16px"></div>`}
      ${def.profile ? html`<h3>مقطع</h3><div class="seg" role="group" style="margin:8px 0 16px">${PROFILES.map(([k, l]) => html`<button data-profile="${k}" aria-pressed="${k === st.profile}">${l}</button>`)}</div>` : ''}
      ${def.gem ? html`<h3>سنگ</h3><div class="seg" role="group" style="margin:8px 0 16px">${GEMS.map(([k, l]) => html`<button data-gemkind="${k}" aria-pressed="${k === st.gemKind}">${l}</button>`)}</div>` : ''}
      <div class="form">${def.params.map(([k, label, min, max, step]) => html`<label class="field"><span style="display:flex;justify-content:space-between"><span>${label}</span><b class="num" data-out="${k}">${fa(val(k))}</b></span>
        <input type="range" min="${min}" max="${max}" step="${step}" value="${val(k)}" data-param="${k}"></label>`)}</div>
      <div id="notes" class="small" style="margin-top:14px"></div>`);
  }

  function update(refit = false) {
    const s = build();
    viewer.setScene(s.items, { refit: refit || lastPiece !== st.piece });
    viewer.setLabels(s.labels ?? []);
    lastPiece = st.piece;
    const def = PIECES[st.piece];
    const read = $('#read', root);
    if (def.noMetal) {
      read.innerHTML = String(html`<div><b>${fmt(s.carat, 2)}</b> قیراط<br><span class="small">وزن تقریبی الماس با این قطر و تناسب استاندارد</span></div>`);
    } else {
      const a = alloyById(st.alloy);
      const goldValue = a.fineness ? s.grams * pricePerGramAt(p750, a.fineness) : null;
      read.innerHTML = String(html`<div><b>${fmt(s.grams, 2)}</b> گرم<br><span class="small">${a.label} · حجم ${fmt(s.volume / 1000, 3)} cm³${s.carat ? ` · سنگ ≈ ${fmt(s.carat, 2)} قیراط` : ''}</span></div>
        ${goldValue ? html`<div class="small" style="text-align:left">ارزش طلا<br><b style="font-size:16px" class="num">${fmtT(goldValue)}</b></div>` : ''}`);
      const cmp = $('#cmp', panel);
      if (cmp) cmp.innerHTML = String(html`${ALLOYS.map((al) => html`<button data-alloy="${al.id}" aria-pressed="${al.id === st.alloy}"><b>${fmt(build(al.id).grams, 2)} گ</b><span>${al.label}</span></button>`)}`);
    }
    const notes = $('#notes', panel);
    if (st.piece === 'band' || st.piece === 'solitaire') {
      const r = ringFromCircumference(val('size'));
      notes.textContent = fa(`قطر داخلی ${fmt(r.diameter, 2)} میلی‌متر · تقریباً سایز آمریکای ${fmt(Math.round(r.us * 4) / 4, 2)}`);
    } else if (st.piece === 'chain') notes.textContent = fa(`${fmt(s.links)} حلقه در ${fmt(val('length'))} سانتی‌متر. زنجیرهای ماشینی توپر وزن مشابه دارند؛ زنجیر توخالی بسیار سبک‌تر است.`);
    else if (st.piece === 'bar') notes.textContent = 'تنگستن (۱۹٫۲۵) تقریباً هم‌وزن طلای خالص است؛ به همین دلیل وزن و ابعاد درست، اصالت شمش را ثابت نمی‌کند.';
    else if (st.piece === 'gem') notes.textContent = 'نسبت‌ها بر اساس تناسب رایج برلیان: تِیبل ۵۷٪، عمق کل حدود ۶۱٪.';
    else notes.textContent = '';
  }

  panel.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.piece) {
      st.piece = b.dataset.piece;
      history.replaceState({}, '', `/studio?p=${st.piece}`);
      renderPanel();
      update(true);
    } else if (b.dataset.alloy) {
      st.alloy = b.dataset.alloy;
      update();
    } else if (b.dataset.profile) {
      st.profile = b.dataset.profile;
      panel.querySelectorAll('[data-profile]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      update();
    } else if (b.dataset.gemkind) {
      st.gemKind = b.dataset.gemkind;
      panel.querySelectorAll('[data-gemkind]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      update();
    }
  });
  let pending = 0;
  panel.addEventListener('input', (e) => {
    const k = e.target.dataset.param;
    if (!k) return;
    st.values[`${st.piece}.${k}`] = Number(e.target.value);
    panel.querySelector(`[data-out="${k}"]`).textContent = fa(e.target.value);
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(() => update());
  });
  renderPanel();
  update(true);
  return () => viewer.destroy();
}
