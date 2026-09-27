import { html, $, $$ } from '../core.mjs';

/* Each era: facts kept deliberately conservative ("حدود") — this page teaches, it must not mislead. */
export const ERAS = [
  {
    y: '۳۰۰۰', u: 'پیش از میلاد',
    place: 'مصر باستان',
    title: 'نوب؛ فلز جاودانگی',
    body: 'مصریان طلا را «نوب» می‌نامیدند و آن را گوشت خدایان می‌دانستند؛ چون نه زنگ می‌زند و نه کدر می‌شود. زرگران مصری چکش‌کاری، ورقه‌کردن تا ضخامت برگ و لحیم‌کاری را به کمال رساندند. نقاب توتنخامون حدود ده کیلوگرم طلای ناب دارد.',
    lesson: 'پایداری شیمیایی طلا دلیل ارزش آن است: طلای خالص با هوا، آب و بیشتر اسیدها واکنش نمی‌دهد. تست اسید در ویترین بر همین اصل تکیه دارد.',
    facts: ['چکش‌کاری', 'ورقه طلا', 'لحیم'],
    art: { kind: 'cuff', alloy: 'au22', finish: 'antique' },
  },
  {
    y: '۱۲۰۰–۱۰۰۰', u: 'پیش از میلاد',
    place: 'مارلیک، گیلان',
    title: 'جام زرین مارلیک',
    body: 'در تپه مارلیک در دره گوهررود گیلان، جام‌های طلایی با نقش گاوهای بالدار پیدا شد. نقش‌ها با «قلم‌زنی از پشت» (رپوسه) برجسته شده‌اند: زرگر ورق را از داخل می‌کوبید تا نقش از بیرون بیرون بزند.',
    lesson: 'رپوسه و قلم‌زنی هنوز در کارگاه‌های اصفهان و تهران زنده است. هرچه ورق نازک‌تر، وزن کمتر و اجرت بیشتر؛ این همان رابطه‌ای است که در فاکتور «اجرت» می‌بینیم.',
    facts: ['رپوسه', 'قلم‌زنی', 'ورق نازک'],
    art: { kind: 'cup', alloy: 'au22', finish: 'hammer' },
  },
  {
    y: '۵۶۰', u: 'پیش از میلاد',
    place: 'لیدیه، آسیای صغیر',
    title: 'نخستین سکه طلای خالص',
    body: 'سکه‌های نخستین لیدیه از «الکتروم» بودند؛ آمیزه طبیعی طلا و نقره با خلوص نامعلوم. در دوره کرزوس، روش جداکردن نقره از طلا (تصفیه با نمک و حرارت) به کار رفت و سکه طلای خالص با وزن معین ضرب شد.',
    lesson: 'عیار یعنی اعتماد. وقتی خلوص معلوم نباشد، ارزش قطعه را فقط با آزمایش می‌توان فهمید؛ همان کاری که امروز با سنگ محک، XRF یا آزمون چگالی می‌کنیم.',
    facts: ['الکتروم', 'تصفیه', 'استاندارد وزن'],
    art: { kind: 'coin', alloy: 'au14y', text: 'لیدیه' },
  },
  {
    y: '۵۱۵', u: 'پیش از میلاد',
    place: 'هخامنشیان، پارس',
    title: 'دریک؛ سکه زر داریوش',
    body: 'داریوش بزرگ سکه طلای «دریک» را ضرب کرد: حدود ۸٫۴ گرم با خلوص بالای ۹۵ درصد، با نقش شاه کماندار. وزن و عیار یکسان دریک آن را در سراسر شاهنشاهی به پولی قابل اعتماد تبدیل کرد.',
    lesson: 'یکسانی وزن و عیار، پایه تجارت است. در ویترین هم وزن‌کردن دقیق با ترازوی کالیبره و درج عیار روی فاکتور، همان اعتماد را می‌سازد.',
    facts: ['حدود ۸٫۴ گرم', 'خلوص بالا', 'پول سراسری'],
    art: { kind: 'coin', alloy: 'au24', text: 'دریک' },
  },
  {
    y: '۵۰۰–۳۳۰', u: 'پیش از میلاد',
    place: 'گنجینه جیحون',
    title: 'بازوبندهای شیردال',
    body: 'گنجینه جیحون نزدیک به ۱۸۰ قطعه طلا و نقره از دوره هخامنشی است. بازوبندهای آن سرهایی به شکل شیردال دارند و جای خالی میناها و سنگ‌های رنگی هنوز پیداست؛ طلا در کنار لاجورد، فیروزه و عقیق.',
    lesson: 'ترکیب طلا و سنگ رنگی قدمتی چندهزارساله دارد. در فروش، داستان و ریشه یک طرح (مثل شیردال، شمسه یا بته‌جقه) ارزشی فراتر از وزن می‌سازد.',
    facts: ['شیردال', 'منبت سنگ', 'مینا'],
    art: { kind: 'armlet', alloy: 'au22', finish: 'polish' },
  },
  {
    y: '۲۲۴–۶۵۱', u: 'میلادی',
    place: 'ساسانیان',
    title: 'دینار زر و مثقال',
    body: 'ساسانیان در کنار درهم نقره، سکه‌های زر نیز ضرب کردند. پس از اسلام «مثقال» یکای وزن طلا شد. در بازار امروز ایران مثقال طلا ۴٫۶۰۸۳ گرم است و «مظنه» برای یک مثقال طلای آب‌شده با عیار ۷۰۵ اعلام می‌شود.',
    lesson: 'قیمت هر گرم ۱۸ عیار از مظنه به دست می‌آید: مظنه ÷ (۴٫۶۰۸۳ × ۷۰۵ ÷ ۷۵۰). این رابطه را در ابزار «مظنه» تمرین کنید.',
    facts: ['مثقال ۴٫۶۰۸۳ گرم', 'مظنه ۷۰۵', 'دینار'],
    art: { kind: 'coin', alloy: 'au22', text: 'دینار', design: 'text' },
  },
  {
    y: '۱۱۱۸', u: 'خورشیدی',
    place: 'خزانه جواهرات ملی',
    title: 'دریای نور',
    body: 'الماس صورتی «دریای نور»، حدود ۱۸۲ قیراط، از بزرگ‌ترین الماس‌های صورتی جهان است که در زمان نادرشاه به ایران آمد و امروز در خزانه جواهرات ملی در تهران نگهداری می‌شود. تراش آن تخت و پله‌ای است، نه برلیان.',
    lesson: 'قیراط واحد وزن سنگ است (هر قیراط ۰٫۲ گرم)، نه اندازه. در استودیو ببینید چطور وزن یک سنگ از حجم و چگالی آن حساب می‌شود.',
    facts: ['حدود ۱۸۲ قیراط', 'الماس صورتی', 'تراش پله‌ای'],
    art: { kind: 'gem', cut: 'emerald', gem: 'morganite' },
  },
  {
    y: '۱۳۵۸', u: 'خورشیدی',
    place: 'بانک مرکزی ایران',
    title: 'سکه بهار آزادی',
    body: 'سکه تمام بهار آزادی ۸٫۱۳۳ گرم وزن و عیار ۹۰۰ دارد؛ یعنی حدود ۷٫۳۲ گرم طلای خالص. قیمت بازار سکه معمولاً با ارزش ذاتی آن فرق دارد و این فاصله «حباب» نامیده می‌شود.',
    lesson: 'ارزش ذاتی سکه = وزن × قیمت هر گرم × ۹۰۰ ÷ ۷۵۰ (بر پایه قیمت ۱۸ عیار). حباب را همیشه جدا از ارزش طلا به مشتری توضیح دهید.',
    facts: ['۸٫۱۳۳ گرم', 'عیار ۹۰۰', 'حباب'],
    art: { kind: 'coin', alloy: 'au22', text: 'بهار آزادی', design: 'text' },
  },
  {
    y: 'امروز', u: '',
    place: 'ویترین شما',
    title: '۱۸ عیار؛ زبان مشترک',
    body: 'زیورآلات ایران بیشتر ۱۸ عیار (۷۵۰) است: سه‌چهارم طلا، باقی نقره و مس برای سختی و رنگ. فاکتور امروز از ارزش طلا، اجرت، سود و مالیات بر ارزش افزوده روی اجرت و سود ساخته می‌شود؛ اصل طلا مالیات ندارد.',
    lesson: 'سه هزار سال بعد، پرسش مشتری همان است: «این چقدر طلاست و چرا این قیمت؟» پاسخ دقیق، مؤدبانه و مستند، کار شماست.',
    facts: ['۷۵۰', 'اجرت + سود', 'مالیات فقط روی اجرت و سود'],
    art: { kind: 'solitaire', alloy: 'au18y' },
  },
];

export async function historyPage(root) {
  root.innerHTML = String(html`
    <section class="hist-hero">
      <span class="eyebrow">گنجینه</span>
      <h1 style="margin-top:14px"><span class="gold-text">سه هزار سال</span><br>طلا در دست انسان</h1>
      <p class="lead" style="margin-top:18px">از نوب مصری تا دریک هخامنشی و سکه بهار آزادی؛ هر دوره درسی دارد که امروز پشت ویترین به کار می‌آید. تصویر هر دوره با همان موتور سه‌بعدی استودیو ساخته شده است.</p>
    </section>
    <div class="timeline">${ERAS.map(
      (e, i) => html`<article class="era-item" id="era-${i}">
        <div class="y">${e.y}<small>${e.u}</small></div>
        <div class="body">
          <div>
            <div class="place">${e.place}</div>
            <h2>${e.title}</h2>
            <p>${e.body}</p>
            <div class="fact" style="margin:14px 0">${e.facts.map((f) => html`<span>${f}</span>`)}</div>
            <div class="lesson">${e.lesson}</div>
          </div>
          <div class="art" data-art="${i}"><div class="loading" style="min-height:100%"><span></span></div></div>
        </div>
      </article>`,
    )}</div>
    <section class="section" style="padding-bottom:40px;text-align:center">
      <a class="btn" href="/studio" data-link>در استودیو بسازید</a>
    </section>`);

  // One offscreen renderer paints every artefact once, so the page never holds more than one WebGL context.
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:900px;height:600px;';
  document.body.append(host);
  let alive = true;
  (async () => {
    const [{ createStage, T }, J, Mt] = await Promise.all([import('../three/stage.mjs'), import('../three/jewelry.mjs'), import('../three/materials.mjs')]);
    const stage = createStage(host, { controls: false, env: 'studio', transparent: true, backdrop: 'vault' });
    if (!stage) return;
    for (let i = 0; i < ERAS.length && alive; i++) {
      const a = ERAS[i].art;
      const meshes = await artMeshes(a, { T, J, Mt });
      stage.root.clear();
      const g = new T.Group();
      meshes.forEach((m) => g.add(m));
      if (a.kind === 'coin') g.rotation.y = -0.5;
      stage.root.add(g);
      stage.ground();
      stage.frame(stage.root, { instant: true, pitch: a.kind === 'gem' ? 0.55 : 0.25, yaw: 0.5, pad: 1.1 });
      const { blob } = await stage.snapshot({ width: 900, height: 600, transparent: true });
      const slot = $(`[data-art="${i}"]`, root);
      if (!slot || !alive) break;
      const img = new Image();
      img.alt = ERAS[i].title;
      img.src = URL.createObjectURL(blob);
      img.style.cssText = 'width:100%;height:100%;object-fit:contain;opacity:0;transition:opacity 1s';
      img.onload = () => (img.style.opacity = '1');
      slot.replaceChildren(img);
    }
    stage.dispose();
    host.remove();
  })();
  return () => {
    alive = false;
    host.remove();
    $$('.era-item img', root).forEach((im) => URL.revokeObjectURL(im.src));
  };
}

async function artMeshes(a, { T, J, Mt }) {
  const P = J.PIECES;
  const withDefaults = (type, over) => ({ ...Object.fromEntries(Object.entries(P[type].params).map(([k, v]) => [k, v[0]])), ...P[type].opts, ...over });
  let meshes;
  if (a.kind === 'cup') {
    // a tall beaker in the Marlik manner, turned on a lathe
    const prof = [[0, 0], [14, 0], [15.5, 1], [16, 3], [15, 8], [14.5, 20], [16.5, 34], [18, 42], [17.2, 42], [15.8, 34], [13.8, 20], [14.3, 8], [13.2, 1.8], [0, 1.8]].map(([x, y]) => new T.Vector2(x, y));
    const geo = new T.LatheGeometry(prof, 128);
    const m = new T.Mesh(geo);
    m.userData.role = 'metal';
    meshes = [m];
    // repoussé bands
    for (const [y, r] of [[12, 14.3], [27, 15.2]]) {
      const band = new T.Mesh(new T.TorusGeometry(r, 0.7, 12, 128));
      band.rotation.x = Math.PI / 2;
      band.position.y = y;
      band.userData.role = 'metal';
      meshes.push(band);
    }
  } else if (a.kind === 'cuff') meshes = await P.bangle.build(withDefaults('bangle', { diameter: 60, width: 28, thickness: 1.6, gap: 50, profile: 'concave' }));
  else if (a.kind === 'armlet') meshes = await P.bangle.build(withDefaults('bangle', { diameter: 68, width: 8, thickness: 5, gap: 36, profile: 'round' }));
  else if (a.kind === 'coin') meshes = await P.coin.build(withDefaults('coin', { design: a.design ?? 'text', text: a.text, relief: 0.45 }));
  else if (a.kind === 'gem') meshes = await P.gem.build(withDefaults('gem', { cut: a.cut, stone: 14, ratio: 1.45 }));
  else meshes = await P.solitaire.build(withDefaults('solitaire', { setting: 'prong6' }));
  for (const m of meshes) {
    if (m.userData.role === 'gem') m.material = Mt.gemMaterial(a.gem ?? 'diamond');
    else m.material = Mt.metalMaterial(a.alloy ?? 'au22', a.finish ?? 'polish');
    m.castShadow = true;
  }
  return meshes;
}
