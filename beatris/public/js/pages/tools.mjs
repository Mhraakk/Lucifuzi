import { html, store, fa, $, navigate } from '../core.mjs';
import { back, ICON } from '../ui.mjs';
import * as K from '../calc.mjs';

const TOOLS = {
  invoice: { title: 'ماشین‌حساب فاکتور', desc: 'ارزش طلا، اجرت، سود و مالیات فقط بر اجرت و سود.' },
  mazaneh: { title: 'مظنه و قیمت گرم', desc: 'تبدیل دوطرفه مظنه، گرم ۱۸ و گرم طلای خالص؛ قیمت قطعه آب‌شده.' },
  buyback: { title: 'خرید طلای مستعمل', desc: 'بر اساس عیار سنجیده‌شده و کسر اعلام‌شده فروشگاه.' },
  coin: { title: 'ارزش ذاتی سکه', desc: 'سکه تمام، نیم و ربع و حباب نسبت به قیمت بازار.' },
  density: { title: 'چگالی و تخمین عیار', desc: 'وزن در هوا و در آب ← چگالی ← هزارم تقریبی.' },
  ring: { title: 'مبدل سایز انگشتر', desc: 'محیط (ISO)، قطر و سایز آمریکا.' },
  karat: { title: 'عیار و وزن', desc: 'طلای خالص قطعه و وزن همان مدل در آلیاژ دیگر.' },
  alloy: { title: 'آلیاژسازی', desc: 'پایین یا بالا بردن عیار ذوب: چند گرم آلیاژ یا طلای ۹۹۹٫۹؟', rare: true },
  casting: { title: 'ریخته‌گری موم و رزین', desc: 'وزن فلز از وزن مدل مومی یا چاپ سه‌بعدی، و فلز لازم برای ذوب.', rare: true },
  plating: { title: 'آبکاری', desc: 'جرم رودیوم یا طلای لایه آبکاری از مساحت و ضخامت.', rare: true },
  stone: { title: 'قیراط از ابعاد', desc: 'وزن سنگ نشانده‌شده از طول، عرض و عمق؛ برای الماس و سنگ‌های رنگی.', rare: true },
  resize: { title: 'سایز، مفتول و ورق', desc: 'فلز لازم برای تغییر سایز؛ طول مفتول و مساحت ورق از وزن.', rare: true },
};
const TOOL_ICON = { invoice: 'tools', mazaneh: 'tools', buyback: 'tools', coin: 'tools', density: 'tools', ring: 'ring', karat: 'ring', alloy: 'cube', casting: 'cube', plating: 'sun', stone: 'cube', resize: 'ring' };
const GEM_SG = [['3.52', 'الماس ۳٫۵۲'], ['4.00', 'یاقوت / یاقوت کبود ۴٫۰۰'], ['2.72', 'زمرد ۲٫۷۲'], ['2.65', 'آمتیست / کوارتز ۲٫۶۵'], ['3.53', 'توپاز ۳٫۵۳'], ['3.60', 'اسپینل ۳٫۶۰'], ['3.35', 'تانزانیت ۳٫۳۵']];

export function toolsPage(root) {
  const card = ([id, t]) => html`<a class="tool-card" href="/tools/${id}" data-link><span class="ico">${ICON[TOOL_ICON[id]] ?? ICON.tools}</span><b>${t.title}</b><span>${t.desc}</span></a>`;
  const entries = Object.entries(TOOLS);
  root.innerHTML = String(html`<span class="eyebrow">پشت پیشخوان</span><h1 style="margin-top:10px">ابزار</h1><p class="lead">همه محاسبه‌ها روی همین دستگاه انجام می‌شود و قیمت مرجع از تنظیمات مدیر می‌آید.</p>
    <div class="tool-grid" style="margin-top:22px">
      <a class="tool-card feature" href="/studio" data-link><span class="ico">${ICON.cube}</span><span class="eyebrow">استودیوی سه‌بعدی</span><b>طراحی کن، وزن کن، خروجی بگیر.</b><span>۱۵ نوع قطعه، ۹ آلیاژ، ۱۲ سنگ؛ تصویر تا ۸K، فایل STL برای چاپ و ریخته‌گری و ویدیوی ۳۶۰ درجه.</span></a>
      ${entries.filter(([, t]) => !t.rare).map(card)}
    </div>
    <h2>دانش نایاب کارگاه</h2>
    <div class="tool-grid">${entries.filter(([, t]) => t.rare).map(card)}</div>`);
}

const field = (name, label, value, extra = '') => html`<label class="field">${label}<input class="input ltr" name="${name}" inputmode="decimal" value="${value}" ${extra}></label>`;
const ledger = (rows) => html`<div class="ledger">${rows.map(([k, v]) => html`<div><span>${k}</span><span class="num">${v}</span></div>`)}</div>`;

export function toolPage(root, { id }) {
  const t = TOOLS[id];
  if (!t) return navigate('/tools', { replace: true });
  const alloySel = (name, sel) => html`<label class="field">فلز<select class="input" name="${name}">${K.ALLOYS.map((a) => html`<option value="${a.id}" ${a.id === sel ? 'selected' : ''}>${a.label} (${fa(a.density)})</option>`)}</select></label>`;
  const pr = store.me.pricing;
  const q = new URLSearchParams(location.search);
  const f0 = (n) => K.fmt(n, 0).replace(/٬/g, ',');
  const forms = {
    invoice: html`<div class="form cols">
      ${field('weight', 'وزن (گرم)', q.get('weight') ? fa(q.get('weight')) : '5')}${field('p750', 'قیمت هر گرم ۱۸ عیار (تومان)', f0(pr.p750))}
      <label class="field">عیار<select class="input" name="fineness">${K.KARATS.map((k) => html`<option value="${k.fineness}" ${k.fineness === (Number(q.get('fineness')) || 750) ? 'selected' : ''}>${fa(k.karat)} عیار (${fa(k.fineness)})</option>`)}</select></label>
      <label class="field">نوع اجرت<select class="input" name="mode"><option value="percent">درصدی</option><option value="perGram">مبلغ هر گرم</option><option value="fixed">مبلغ کل</option></select></label>
      ${field('ojrat', 'اجرت', '15')}${field('profit', 'سود فروشنده (٪)', String(pr.profitPct))}${field('vat', 'مالیات بر ارزش افزوده (٪)', String(pr.vatPct))}</div>`,
    mazaneh: html`<div class="form cols">${field('m', 'مظنه (تومان)', f0(K.mazanehFromG750(pr.p750)))}${field('g', 'قیمت هر گرم ۱۸ (تومان)', f0(pr.p750))}</div>
      <h3 style="margin-top:18px">قطعه آب‌شده</h3><div class="form cols">${field('aw', 'وزن (گرم)', '50')}${field('af', 'عیار ری‌گیری', '740')}</div>`,
    buyback: html`<div class="form cols">${field('weight', 'وزن کل (گرم)', '12')}${field('nongold', 'وزن اجزای غیرطلا (گرم)', '0')}${field('fin', 'عیار سنجیده‌شده', '740')}${field('p750', 'قیمت هر گرم ۱۸ (تومان)', f0(pr.p750))}${field('deduct', 'کسر اعلام‌شده (٪)', String(pr.buybackDeductPct))}</div>`,
    coin: html`<div class="form cols">${field('p750', 'قیمت هر گرم ۱۸ (تومان)', f0(pr.p750))}${field('market', 'قیمت بازار سکه تمام (اختیاری)', '')}</div>`,
    density: html`<div class="form cols">${field('air', 'وزن در هوا (گرم)', '10.00')}${field('water', 'وزن در آب (گرم)', '9.35')}</div>`,
    ring: html`<div class="seg" role="group" style="margin-bottom:12px"><button type="button" data-mode="iso" aria-pressed="true">محیط (ISO)</button><button type="button" data-mode="d" aria-pressed="false">قطر</button><button type="button" data-mode="us" aria-pressed="false">سایز آمریکا</button></div>
      <div class="form">${field('v', 'مقدار', '54')}</div>`,
    karat: html`<div class="form cols">${field('weight', 'وزن قطعه (گرم)', '6')}
      <label class="field">آلیاژ فعلی<select class="input" name="from">${K.ALLOYS.map((a) => html`<option value="${a.id}" ${a.id === 'au18y' ? 'selected' : ''}>${a.label}</option>`)}</select></label>
      <label class="field">آلیاژ مقصد<select class="input" name="to">${K.ALLOYS.map((a) => html`<option value="${a.id}" ${a.id === 'au22' ? 'selected' : ''}>${a.label}</option>`)}</select></label></div>`,
    alloy: html`<div class="form cols">${field('weight', 'وزن ذوب فعلی (گرم)', '100')}${field('fin', 'عیار فعلی (هزارم)', '750')}${field('target', 'عیار هدف (هزارم)', '585')}${field('addf', 'عیار فلز افزودنی (۰ = آلیاژ آماده)', '0')}</div>`,
    casting: html`<div class="form cols">${field('wax', 'وزن مدل (گرم)', '1.2')}
      <label class="field">جنس مدل<select class="input" name="model"><option value="${K.WAX_DENSITY}">موم ریخته‌گری (۰٫۹۵)</option><option value="${K.RESIN_DENSITY}">رزین چاپ سه‌بعدی (۱٫۱۲)</option></select></label>
      ${alloySel('metal', 'au18y')}${field('sprue', 'راهگاه و دکمه (٪)', '35')}</div>`,
    plating: html`<div class="form cols">${field('area', 'مساحت سطح (سانتی‌متر مربع)', '2')}${field('mic', 'ضخامت (میکرون)', '0.2')}
      <label class="field">فلز آبکاری<select class="input" name="pm">${Object.entries(K.PLATING).map(([k, d]) => html`<option value="${d}">${{ rhodium: 'رودیوم', gold: 'طلا', palladium: 'پالادیوم', silver: 'نقره' }[k]} (${fa(d)})</option>`)}</select></label></div>`,
    stone: html`<div class="form cols">
      <label class="field">تراش<select class="input" name="cut">${Object.entries(K.STONE_FACTORS).map(([k, f]) => html`<option value="${k}">${f.label}</option>`)}</select></label>
      ${field('L', 'طول یا قطر (mm)', '6.5')}${field('W', 'عرض (mm) — برای گرد لازم نیست', '6.5')}${field('D', 'عمق (mm)', '4')}
      <label class="field">سنگ (چگالی)<select class="input" name="sg">${GEM_SG.map(([v, l]) => html`<option value="${v}">${l}</option>`)}</select></label></div>`,
    resize: html`<div class="form cols">${field('from', 'سایز فعلی (ISO)', '54')}${field('to', 'سایز جدید (ISO)', '56')}${field('w', 'پهنای رکاب (mm)', '4')}${field('t', 'ضخامت رکاب (mm)', '1.8')}${alloySel('metal', 'au18y')}</div>
      <h3 style="margin-top:18px">مفتول و ورق</h3><div class="form cols">${field('gw', 'وزن فلز (گرم)', '1')}${field('dia', 'قطر مفتول (mm)', '1')}${field('th', 'ضخامت ورق (mm)', '0.5')}</div>`,
  };
  root.innerHTML = String(html`${back('/tools', 'ابزار')}<h1>${t.title}</h1><p class="lead">${t.desc}</p>
    <div class="calc-out" id="out" aria-live="polite"></div><form class="tray" id="tf" style="margin-top:14px">${forms[id]}</form>`);

  const form = $('#tf', root);
  let ringMode = 'iso';
  const v = (n) => K.parseNum(form.elements[n]?.value);
  const out = $('#out', root);
  const T = (n) => K.fmtT(n);
  const compute = () => {
    let rows = [];
    let note = '';
    if (id === 'invoice') {
      const r = K.invoice({ weight: v('weight'), p750: v('p750'), fineness: v('fineness'), ojratMode: form.elements.mode.value, ojrat: v('ojrat'), profitPct: v('profit'), vatPct: v('vat') });
      rows = [['ارزش طلا (معاف از مالیات)', T(r.goldValue)], ['اجرت ساخت', T(r.ojrat)], ['سود فروشنده', T(r.profit)], ['پایه مالیات (اجرت + سود)', T(r.taxable)], ['مالیات بر ارزش افزوده', T(r.vat)], ['مبلغ نهایی', T(r.total)]];
      note = 'سود از مجموع ارزش طلا و اجرت حساب شده است. اگر سیاست فروشگاه متفاوت است، مدیر در تنظیمات تغییر دهد.';
    } else if (id === 'mazaneh') {
      const m = v('m');
      const g = K.g750FromMazaneh(m);
      rows = [['قیمت هر گرم ۱۸ عیار', T(g)], ['قیمت هر گرم طلای خالص', T(m / K.MAZANEH_TO_G1000)], ['قیمت هر مثقال ۱۸ عیار', T(g * K.MESGHAL_G)], ['ارزش قطعه آب‌شده', T(K.moltenPiecePrice(v('aw'), v('af'), m))]];
      note = 'مظنه ÷ ۴٫۳۳۱۸ = گرم ۱۸. تغییر قیمت گرم ۱۸، مظنه را هم به‌روز می‌کند.';
    } else if (id === 'buyback') {
      const r = K.buyback({ weight: v('weight'), nonGoldWeight: v('nongold'), p750: v('p750'), testedFineness: v('fin'), deductPct: v('deduct') });
      rows = [['وزن خالص طلا', `${K.fmt(r.netWeight, 2)} گرم`], ['ارزش به عیار سنجیده', T(r.gross)], ['کسر فروشگاه', T(r.deduction)], ['مبلغ پرداختی', T(r.payout)]];
      note = 'خرید طلای مستعمل مالیات بر ارزش افزوده ندارد.';
    } else if (id === 'coin') {
      const p = v('p750');
      const market = v('market');
      rows = K.COINS.map((c) => [c.label, T(K.coinIntrinsic(c, p))]);
      if (Number.isFinite(market) && market > 0) {
        const intr = K.coinIntrinsic(K.COINS[0], p);
        rows.push(['حباب سکه تمام', `${T(market - intr)} (${K.fmt(((market - intr) / intr) * 100, 1)}٪)`]);
      }
      note = 'ارزش ذاتی = وزن × ۹۰۰ ÷ ۷۵۰ × قیمت گرم ۱۸. حباب پیش‌بینی نمی‌شود؛ فقط توضیح داده می‌شود.';
    } else if (id === 'density') {
      const d = K.densityFromWeighing(v('air'), v('water'));
      const f = K.finenessFromDensity(d);
      const k = Number.isFinite(f) ? K.nearestKarat(f) : null;
      rows = [['چگالی', Number.isFinite(d) ? `${K.fmt(d, 2)} g/cm³` : '—'], ['هزارم تخمینی (آلیاژ زرد)', Number.isFinite(f) ? K.fmt(f, 0) : '—'], ['نزدیک‌ترین عیار استاندارد', k ? `${fa(k.karat)} عیار (${fa(k.fineness)})` : '—']];
      note = 'فقط برای طلای ساده توپر. سنگ، حفره، لحیم و تنگستن نتیجه را بی‌اعتبار می‌کنند؛ مرجع نهایی ری‌گیری است.';
    } else if (id === 'ring') {
      const x = v('v');
      const r = ringMode === 'iso' ? K.ringFromCircumference(x) : ringMode === 'd' ? K.ringFromDiameter(x) : K.ringFromUS(x);
      rows = [['سایز ISO (محیط داخلی)', `${K.fmt(r.iso, 1)} mm`], ['قطر داخلی', `${K.fmt(r.diameter, 2)} mm`], ['سایز آمریکا', K.fmt(Math.round(r.us * 4) / 4, 2)]];
      note = 'برای انگشتر پهن نیم تا یک سایز بزرگ‌تر را هم امتحان کنید.';
    } else if (id === 'karat') {
      const a = K.alloyById(form.elements.from.value);
      const b = K.alloyById(form.elements.to.value);
      const w = v('weight');
      rows = [['طلای خالص قطعه فعلی', a.fineness ? `${K.fmt(K.pureGold(w, a.fineness), 3)} گرم` : '—'], [`وزن همان مدل در ${b.label}`, `${K.fmt(K.weightInOtherAlloy(w, a.density, b.density), 2)} گرم`], ['نسبت چگالی', `${K.fmt(a.density, 1)} ← ${K.fmt(b.density, 1)}`]];
      note = 'چگالی‌ها تقریبی‌اند و به دستور آلیاژ بستگی دارند.';
    }
    else if (id === 'alloy') {
      const r = K.alloyAdjust({ weight: v('weight'), fineness: v('fin'), target: v('target'), addFineness: v('addf') });
      rows = Number.isFinite(r.add)
        ? [[r.addFineness === 0 ? 'آلیاژ آماده لازم' : `فلز ${K.fmt(r.addFineness, 1)} لازم`, `${K.fmt(r.add, 3)} گرم`], ['وزن نهایی ذوب', `${K.fmt(r.total, 3)} گرم`], ['طلای خالص قبل', `${K.fmt(r.pureBefore, 3)} گرم`], ['طلای خالص بعد', `${K.fmt(r.pureAfter, 3)} گرم`]]
        : [['نتیجه', 'با این فلز افزودنی رسیدن به عیار هدف ممکن نیست']];
      note = 'برای پایین آوردن عیار فلز افزودنی را ۰ (آلیاژ آماده) و برای بالا بردن ۹۹۹٫۹ بگذارید. پس از ذوب، عیار را دوباره بسنجید.';
    } else if (id === 'casting') {
      const a = K.alloyById(form.elements.metal.value);
      const r = K.waxToMetal({ waxWeight: v('wax'), metalDensity: a.density, modelDensity: Number(form.elements.model.value), sprue: v('sprue') / 100 });
      rows = [['ضریب مدل به فلز', `× ${K.fmt(r.ratio, 2)}`], [`وزن قطعه در ${a.label}`, `${K.fmt(r.metal, 3)} گرم`], ['فلز لازم برای ذوب', `${K.fmt(r.melt, 2)} گرم`]];
      note = 'وزن نهایی پس از پرداخت و سوهان‌کاری معمولاً کمی کمتر از عدد ریخته است.';
    } else if (id === 'plating') {
      const g = K.platingMass({ areaCm2: v('area'), microns: v('mic'), density: Number(form.elements.pm.value) });
      rows = [['جرم لایه', `${K.fmt(g * 1000, 3)} میلی‌گرم`], ['به گرم', `${K.fmt(g, 6)} گرم`]];
      note = 'مساحت سطح هر مدل در استودیوی سه‌بعدی نمایش داده می‌شود.';
    } else if (id === 'stone') {
      const cut = form.elements.cut.value;
      const sg = Number(form.elements.sg.value);
      const ct = K.stoneCarat({ cut, L: v('L'), W: v('W'), D: v('D'), sg });
      rows = [['وزن تخمینی', `≈ ${K.fmt(ct, 2)} قیراط`], ['به گرم', `${K.fmt(ct * 0.2, 3)} گرم`], ['اگر الماس بود', `${K.fmt(K.stoneCarat({ cut, L: v('L'), W: v('W'), D: v('D') }), 2)} قیراط`]];
      note = 'فرمول تجربی است؛ کمربند ضخیم یا بدنه برآمده نتیجه را چند درصد تغییر می‌دهد.';
    } else if (id === 'resize') {
      const a = K.alloyById(form.elements.metal.value);
      const r = K.resizeMetal({ fromSize: v('from'), toSize: v('to'), width: v('w'), thickness: v('t'), density: a.density });
      rows = [[r.grams >= 0 ? 'فلز لازم برای افزودن' : 'فلز برداشته‌شده', `${K.fmt(Math.abs(r.grams), 3)} گرم`], ['طول مفتول از وزن داده‌شده', `${K.fmt(K.wireLength({ weight: v('gw'), diameter: v('dia'), density: a.density }), 1)} mm`], ['مساحت ورق از وزن داده‌شده', `${K.fmt(K.sheetArea({ weight: v('gw'), thickness: v('th'), density: a.density }), 1)} mm²`]];
      note = 'هر یک سایز ISO یعنی یک میلی‌متر در محیط داخلی.';
    }
    out.innerHTML = String(html`${ledger(rows)}<p class="small" style="margin-top:10px">${note}</p>`);
  };
  form.addEventListener('submit', (e) => e.preventDefault());
  form.addEventListener('input', (e) => {
    if (id === 'mazaneh' && e.target.name === 'g') form.elements.m.value = f0(K.mazanehFromG750(v('g')));
    if (id === 'mazaneh' && e.target.name === 'm') form.elements.g.value = f0(K.g750FromMazaneh(v('m')));
    compute();
  });
  form.addEventListener('click', (e) => {
    const b = e.target.closest('[data-mode]');
    if (!b) return;
    ringMode = b.dataset.mode;
    form.querySelectorAll('[data-mode]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    form.elements.v.value = ringMode === 'iso' ? '54' : ringMode === 'd' ? '17.2' : '7';
    compute();
  });
  compute();
}
