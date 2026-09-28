// The product page for gold shops (public): what Beatris does for a shop, the numbers behind it, how it is set
// up, service packages and a demo request that reaches the owner's team page. Every number on this page is
// counted from the app itself; nothing here is a testimonial or a made-up statistic.
import { html, fa, api, auth, $, busy, toast } from '../core.mjs';
import { brandMark, ICON } from '../ui.mjs';

const FEATURES = [
  ['book', 'حسابداری کامل فروشگاه و فاکتور رسمی', 'فروش، تعویض، خرید مستعمل، سکه و آب‌شده با اجرت درصدی، گرمی یا ثابت؛ هر پول ورودی و خروجی: نقد، کارتخوان، کارت به کارت، ساتنا، پایا، پل، حواله، چک و تسویه طلایی. فاکتور رسمی الگوی طلای سامانه مودیان با شماره منحصربه‌فرد مالیاتی، QR اصالت، نسخه‌های ویرایش و دفتر رویداد ضددستکاری.', () => '۶۵ قالب کالا · ۱۴ روش پرداخت · خروجی اکسل، CSV، JSON و PDF'],
  ['learn', 'آکادمی کارکنان', 'دوره‌های فلز و عیار، قیمت‌گذاری، فروش، امنیت، سنگ، عیارسنجی، سکه، حسابداری آب‌شده و تحلیل بازار؛ با آزمون، گواهی، کارت مرور و سناریوی فروش.', (c) => `${fa(c.courses)} دوره · ${fa(c.lessons)} درس · ${fa(c.questions)} پرسش`],
  ['cube', 'آزمایشگاه سکه و پلمپ سه‌بعدی', 'سکه‌های بازار ایران با عکس واقعی ۴K؛ ترازو، کولیس، وزن در آب، آهنربا، صدا، ذره‌بین و XRF مجازی؛ دستکاری پلمپ و احتمال تقلب زنده.', () => '۸ نوع تقلب سکه · ۶ سناریوی دستکاری پلمپ · بازی تشخیص'],
  ['practice', 'دفتر آب‌شده بی‌خطا', 'درس تصویری حسابداری آب‌شده، تمرین‌گر دفتر با زمان‌سنج و آزمون و خطا، و ثبت سریع پشت پیشخوان با خروجی CSV برای نرم‌افزار حسابداری.', () => 'الگوهای ثابت · قاعده گرد کردن دفتر · تاریخ شمسی'],
  ['chart', 'میز بازار و شکار مظنه', 'تابلوی ۱۰ قیمت، نمودار حرفه‌ای با شاخص‌ها و امواج الیوت، سطح‌های خرید و فروش صبورانه، حباب سکه، دلار مستتر و هشدار قیمت.', () => '۷ نوع نمودار · ۱۳ ابزار · ۸ شاخص · ۸ تحلیل ویژه ایران'],
  ['ring', 'استودیوی طراحی سه‌بعدی', 'طراحی انگشتر، گردنبند، پلاک اسم و سکه با وزن دقیق طلا؛ تصویر تا ۸K و فایل STL برای ریخته‌گری؛ گالری تیم و لینک مستقیم به فاکتور.', () => '۱۵ نوع قطعه · ۹ آلیاژ · ۱۲ سنگ'],
  ['tools', 'ماشین‌حساب‌های پیشخوان', 'فاکتور با مالیات فقط بر اجرت و سود، خرید مستعمل، مظنه، حباب سکه، چگالی، آلیاژسازی، ریخته‌گری، آبکاری، قیراط و احتمال تقلب.', () => '۱۴ ابزار · قیمت پایه از تنظیمات مدیر'],
  ['team', 'مدیریت تیم', 'پیشرفت هر کارمند، آزمون‌ها، کارهای عملی در شعبه با تأیید مدیر، رویه‌های فروشگاه، حضور و غیاب و گزارش.', () => '۴ نقش: فروشنده، مربی، مدیر، مالک'],
  ['orbit', 'اتصال به هوش مصنوعی', 'Claude و دستیارهای سازگار با MCP می‌توانند ابزارهای محاسبه، میز بازار و ماشین‌حساب تقلب همین فروشگاه را به کار ببرند؛ بدون دسترسی به اطلاعات کارکنان.', () => '۱۱ ابزار MCP · توکن قابل ابطال'],
];
const PAINS = [
  ['حساب‌وکتاب پراکنده', 'فاکتور یک‌جا، دفتر چک جای دیگر، بدهی طلایی مشتری در دفترچه؛ ویرایش سند ردی نمی‌گذارد و آخر ماه مالیات اجرت و سود دستی جمع می‌شود.'],
  ['سکه و پلمپ تقلبی', 'کارمند تازه‌کار سکه برنجی آب‌طلاکاری‌شده یا بسته بازپلمپ‌شده را نمی‌شناسد؛ یک اشتباه به اندازه سود یک ماه ضرر دارد.'],
  ['کندی و خطای ثبت آب‌شده', 'هر اپراتور یک‌جور حساب می‌کند؛ مظنه خرید و فروش جابه‌جا می‌شود و آخر روز صندوق و موجودی نمی‌خوانند.'],
  ['خرید و فروش بی‌نقشه', 'نمی‌دانید امروز کجا بخرید و کجا بفروشید، حباب سکه چقدر است و قیمت داخلی از انس و دلار جلو افتاده یا عقب مانده.'],
  ['آموزش پرهزینه و فراموش‌شدنی', 'هر کارمند تازه چند هفته وقت مدیر را می‌گیرد و باز هم دانسته‌ها یکسان نیست.'],
];
const PACKAGES = [
  ['راه‌اندازی شعبه', ['نصب روی سرور اختصاصی فروشگاه', 'حساب مالک و ورود کارکنان', 'حسابداری کامل، فاکتور رسمی و انبار با بارکد', 'همه دوره‌ها، ابزارها، آزمایشگاه سکه و میز بازار', 'آموزش مدیر برای راه‌اندازی مسیر آموزشی']],
  ['حرفه‌ای', ['هرچه در راه‌اندازی شعبه است', 'اتصال منبع قیمت زنده و قیمت پایه خودکار', 'اتصال دستیار هوش مصنوعی (MCP)', 'بارگذاری عکس سکه‌های مرجع شعبه', 'پشتیبانی و به‌روزرسانی']],
  ['زنجیره‌ای', ['هرچه در حرفه‌ای است', 'راه‌اندازی برای چند شعبه', 'دوره و رویه اختصاصی با زبان فروشگاه شما', 'گزارش مدیریتی تیم‌ها']],
];
const FAQ = [
  ['با اینترنت ایران کار می‌کند؟', 'بله. فونت‌ها و کتابخانه‌ها روی خود سرور است و به هیچ سرویس خارجی وابسته نیست. اپ روی موبایل نصب می‌شود و بخش‌های اصلی بدون اینترنت هم باز می‌شوند.'],
  ['اطلاعات فروشگاه کجا ذخیره می‌شود؟', 'روی سرور اختصاصی همان فروشگاه. هر تغییر مهم با نام کاربر ثبت می‌شود و دسترسی‌ها بر اساس نقش است.'],
  ['جای نرم‌افزار حسابداری را می‌گیرد؟', 'بله. فاکتور فروش، خرید، برگشت، پیش‌فاکتور، دریافت و پرداخت، چک، صندوق و بانک، انبار با بارکد، حساب ریالی و طلایی مشتری، تراز دارایی و گزارش مالیات همه در خود بئاتریس است و هر سند با تاریخچه نسخه‌ها و خروجی اکسل می‌ماند.'],
  ['فاکتور برای سامانه مودیان معتبر است؟', 'فاکتور با الگوی طلا، جواهر و پلاتین و همه فیلدهای رسمی (اجرت ساخت، سود فروشنده، حق‌العمل، مالیات فقط بر آن‌ها) و شماره منحصربه‌فرد مالیاتی ساخته می‌شود و فایل استاندارد آن آماده ارسال است؛ ارسال با کلید خصوصی خود فروشگاه یا شرکت معتمد انجام می‌شود.'],
  ['قیمت‌های بازار از کجا می‌آید؟', 'مدیر قیمت روز را وارد می‌کند یا فروشگاه یک منبع قیمت (مثلاً API رسمی ارائه‌دهنده قیمت) را وصل می‌کند. تا وقتی قیمت واقعی نیست، داده نمونه آموزشی با برچسب روشن نشان داده می‌شود.'],
  ['تحلیل بازار توصیه خرید و فروش است؟', 'نه. سطح‌ها و شمارش امواج با قواعد روشن و قابل وارسی حساب می‌شوند تا تصمیم آگاهانه‌تر باشد؛ تصمیم با خود شماست.'],
];

// every image is rendered by the app's own 3D engine (scripts/render-promo.mjs); the coin is a CC BY-SA photograph
const SLIDES = [
  ['solitaire', 'درخشش را اندازه بگیرید', 'وزن طلا و قیراط نگین، پیش از ساخت؛ از استودیوی سه‌بعدی تا فاکتور.'],
  ['coin', 'اصل را از بدل جدا کنید', 'سکه‌های بازار ایران با عکس واقعی ۴K و احتمال تقلب زنده.'],
  ['halo', 'هر معامله، بی‌خطا', 'الگوهای ثابت دفتر آب‌شده؛ سریع، دقیق، هر روز.'],
  ['eternity', 'بازار را پیش از دیگران بخوانید', 'مظنه، دلار، انس و حباب سکه، با تحلیل و امواج الیوت.'],
];
const ADS = [
  ['bangle', 'آکادمی کارکنان', 'فروشنده‌ای که عیار، اجرت و مالیات را بی‌لکنت توضیح می‌دهد، مشتری را نگه می‌دارد.'],
  ['bar', 'میز بازار', 'شمش، آب‌شده و سکه؛ قیمت زنده و «شکار مظنه» با سطح‌های روشن خرید و فروش.'],
  ['pendant', 'استودیوی طراحی', 'نقش را پیش از ریخته‌گری ببینید، وزنش را بدانید و با تصویر ۸K بفروشید.'],
];
const PRICE_NAMES = { mesghal: 'مظنه', geram18: 'گرم ۱۸', sekee: 'سکه امامی', sekeb: 'سکه بهار', nim: 'نیم', rob: 'ربع', usd: 'دلار', ons: 'انس جهانی' };

export async function introPage(root) {
  const counts = await api('/api/intro').catch(() => ({ courses: 12, lessons: 61, questions: 183, prices: [] }));
  const nf = (v, d = 0) => new Intl.NumberFormat('fa-IR', { maximumFractionDigits: d }).format(v);
  const ticker = (counts.prices ?? []).map((p) => html`<span class="tk"><b>${PRICE_NAMES[p.id]}</b>${nf(p.c, p.id === 'ons' ? 2 : 0)}${p.id === 'ons' ? ' دلار' : ''}${Number.isFinite(p.pct) ? html`<i class="${p.pct >= 0 ? 'up' : 'down'}">${'⁦'}${p.pct >= 0 ? '▲' : '▼'} ${nf(Math.abs(p.pct), 2)}٪${'⁩'}</i>` : ''}</span>`);
  root.innerHTML = String(html`<div class="lux">
    <header class="lux-top"><a class="brand" href="/intro" data-link>${brandMark}<span>بئاتریس</span></a><nav><a href="#features">امکانات</a><a href="#packages">بسته‌ها</a><a href="#demo">نمایش رایگان</a></nav><a class="btn small ghost" href="${auth.token ? '/' : '/login'}" data-link>${auth.token ? 'ورود به اپ' : 'ورود کارکنان'}</a></header>
    <section class="lux-hero" aria-label="معرفی">
      <div class="lux-slides">${SLIDES.map(([img], i) => html`<div class="lux-slide ${i ? '' : 'on'}" style="background-image:url(/promo/${img}.webp)"></div>`)}</div>
      <div class="lux-veil"></div>
      <div class="lux-copy">
        <span class="eyebrow">برای طلافروشی‌ها و گالری‌های طلا</span>
        <h1 class="gold-text">مغز دوم طلافروشی شما</h1>
        <div class="lux-captions">${SLIDES.map(([, t, d], i) => html`<p class="lux-cap ${i ? '' : 'on'}"><b>${t}</b><span>${d}</span></p>`)}</div>
        <div class="actions"><a class="btn" href="#demo">درخواست نمایش رایگان</a><a class="btn ghost" href="#features">امکانات</a></div>
        <div class="lux-dots">${SLIDES.map((_, i) => html`<button type="button" data-slide="${i}" aria-label="تصویر ${fa(i + 1)}" aria-pressed="${!i}"></button>`)}</div>
      </div>
    </section>
    ${ticker.length ? html`<div class="lux-ticker" aria-label="قیمت‌های بازار"><div class="lux-track">${ticker}${ticker}</div>${counts.sample ? html`<span class="lux-tag">داده نمونه</span>` : ''}</div>` : ''}
    <div class="intro">
    <section class="lux-stats reveal"><div><b>${fa(counts.courses)}</b><span>دوره</span></div><div><b>${fa(counts.lessons)}</b><span>درس</span></div><div><b>${fa(counts.questions)}</b><span>پرسش با پاسخ وارسی‌شده</span></div><div><b>۳۶</b><span>نمودار و شاخص بازار</span></div></section>
    <section class="intro-sec"><h2 class="reveal">دردهایی که هر روز پشت ویترین هست</h2><div class="intro-pains">${PAINS.map(([t, d], i) => html`<div class="lux-card reveal" style="--d:${i * 90}ms"><h3>${t}</h3><p>${d}</p></div>`)}</div></section>
    ${ADS.map(([img, t, d], i) => html`<section class="lux-ad ${i % 2 ? 'flip' : ''} reveal"><div class="lux-ad-img" style="background-image:url(/promo/${img}.webp)"></div><div class="lux-ad-copy"><span class="eyebrow">${fa(`۰${i + 1}`)}</span><h2>${t}</h2><p>${d}</p></div></section>`)}
    <section class="intro-sec lux-feat-bg" id="features" style="--bg:url(/promo/signet.webp)"><h2 class="reveal">بئاتریس چه می‌کند</h2><div class="intro-grid">${FEATURES.map(([ic, t, d, n], i) => html`<div class="lux-card intro-feat reveal" style="--d:${(i % 4) * 80}ms"><span class="ico">${ICON[ic] ?? ICON.tools}</span><h3>${t}</h3><p>${d}</p><span class="stamp">${n(counts)}</span></div>`)}</div></section>
    <section class="intro-sec"><h2 class="reveal">تفاوتش کجاست</h2><ul class="intro-diff reveal">
      <li><b>آموزش و ابزار در یک جا:</b> نرم‌افزارهای حسابداری طلا ثبت می‌کنند؛ بئاتریس به همان کسی که ثبت می‌کند یاد می‌دهد درست و سریع ثبت کند و خطایش را همان لحظه نشان می‌دهد.</li>
      <li><b>تشخیص تقلب با عدد، نه حدس:</b> هر آزمون احتمال تقلب را با قضیه بیز به‌روز می‌کند و آزمون بعدی را پیشنهاد می‌دهد.</li>
      <li><b>بازار ایران، نه فقط انس:</b> مظنه از کانال آب‌شده، دلار و سکه از چنده، انس از goldprice.org؛ حباب سکه و دلار مستتر فقط با انس و دلار واقعیِ همان روز.</li>
      <li><b>هر عدد وارسی‌شده:</b> پاسخ هر پرسش عددی و هر فرمول با همان موتوری آزموده می‌شود که ماشین‌حساب‌ها با آن کار می‌کنند.</li>
    </ul></section>
    <section class="lux-band reveal" style="--bg:url(/promo/name.webp)"><div><h2>اسم مشتری را طلا کنید، پیش از آن‌که ذوب شود</h2><p>پلاک اسم فارسی با وزن دقیق طلا و فایل آماده ریخته‌گری، در چند ثانیه.</p></div></section>
    <section class="intro-sec"><h2 class="reveal">راه‌اندازی در سه قدم</h2><ol class="intro-steps">${[['نصب', 'روی سرور اختصاصی فروشگاه با دیتابیس دائمی.'], ['تنظیم', 'قیمت پایه، کارکنان، نقش‌ها و منبع قیمت بازار.'], ['آموزش', 'مسیر آموزشی، آزمون و کار عملی در شعبه با تأیید مدیر.']].map(([t, d], i) => html`<li class="lux-card reveal" style="--d:${i * 120}ms"><b>${t}</b><span>${d}</span></li>`)}</ol></section>
    <section class="intro-sec" id="packages"><h2 class="reveal">بسته‌ها</h2><div class="intro-grid three">${PACKAGES.map(([t, items], k) => html`<div class="lux-card intro-pack ${k === 1 ? 'hi' : ''} reveal" style="--d:${k * 120}ms"><h3>${t}</h3><ul>${items.map((x) => html`<li>${x}</li>`)}</ul><a class="btn ${k === 1 ? '' : 'ghost'} block" href="#demo" data-pack="${t}">پیش‌فاکتور بگیرید</a></div>`)}</div><p class="small">قیمت بر اساس تعداد شعبه و کارکنان تعیین می‌شود.</p></section>
    <section class="intro-sec lux-demo" id="demo" style="--bg:url(/promo/solitaire.webp)"><h2>درخواست نمایش رایگان</h2>
      <form class="lux-card form cols" id="lf" autocomplete="on">
        <label class="field">نام و نام خانوادگی<input class="input" name="name" required maxlength="60" autocomplete="name"></label>
        <label class="field">نام فروشگاه<input class="input" name="shop" required maxlength="80" autocomplete="organization"></label>
        <label class="field">شهر<input class="input" name="city" maxlength="40"></label>
        <label class="field">موبایل<input class="input ltr" name="phone" required inputmode="tel" autocomplete="tel" placeholder="۰۹۱۲۰۰۰۰۰۰۰"></label>
        <label class="field">تعداد شعبه<input class="input ltr" name="branches" inputmode="numeric" value="۱"></label>
        <label class="field" style="grid-column:1/-1">پیام (اختیاری)<textarea class="input" name="message" rows="3" maxlength="600"></textarea></label>
        <label class="hp" aria-hidden="true">وب‌سایت<input name="website" tabindex="-1" autocomplete="off"></label>
        <div style="grid-column:1/-1"><button class="btn" type="submit">ارسال درخواست</button> <span class="small" id="lmsg" role="status"></span></div>
      </form>
    </section>
    <section class="intro-sec"><h2 class="reveal">پرسش‌های رایج</h2>${FAQ.map(([q, a]) => html`<details class="lux-card intro-faq reveal"><summary>${q}</summary><p>${a}</p></details>`)}</section>
    <footer class="intro-foot small">بئاتریس · آکادمی و میز کار گالری طلا · تصاویر جواهر با موتور سه‌بعدی خود بئاتریس ساخته شده‌اند؛ عکس سکه: M.samei، CC BY-SA 4.0</footer>
    </div>
  </div>`);

  // hero: cross-fading slides with a slow zoom; captions follow; pauses when the tab is hidden
  const slides = [...root.querySelectorAll('.lux-slide')], caps = [...root.querySelectorAll('.lux-cap')], dots = [...root.querySelectorAll('[data-slide]')];
  let cur = 0;
  const show = (i) => {
    cur = (i + slides.length) % slides.length;
    slides.forEach((x, k) => x.classList.toggle('on', k === cur));
    caps.forEach((x, k) => x.classList.toggle('on', k === cur));
    dots.forEach((x, k) => x.setAttribute('aria-pressed', String(k === cur)));
  };
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const timer = still ? null : setInterval(() => document.visibilityState === 'visible' && show(cur + 1), 6000);
  // sections rise into view once
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && (e.target.classList.add('in'), io.unobserve(e.target))), { rootMargin: '0px 0px -8% 0px' }) : null;
  for (const el of root.querySelectorAll('.reveal')) io ? io.observe(el) : el.classList.add('in');
  root.addEventListener('click', (e) => {
    const d = e.target.closest('[data-slide]');
    if (d) return show(Number(d.dataset.slide));
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    e.preventDefault();
    $(a.getAttribute('href'), root)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (a.dataset.pack) $('#lf textarea[name=message]', root).value ||= `بسته مورد نظر: ${a.dataset.pack}`;
  });
  $('#lf', root).addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target, btn = f.querySelector('button[type=submit]');
    const body = Object.fromEntries(new FormData(f));
    body.branches = Number(String(body.branches).replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))) || 1;
    busy(btn, true);
    try {
      await api('/api/leads', { method: 'POST', body });
      f.reset();
      $('#lmsg', root).textContent = 'درخواست شما ثبت شد؛ برای هماهنگی نمایش با شما تماس می‌گیریم.';
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      busy(btn, false);
    }
  });
  return () => {
    clearInterval(timer);
    io?.disconnect();
  };
}
