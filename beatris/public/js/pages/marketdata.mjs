// Market data for managers: where prices come from (manual, a live source, the shop's own feed), today's
// prices by hand, a pasted history table (Jalali or Gregorian dates, Persian digits, Excel paste) and the
// recent rows of each symbol. Everything here is recorded in the audit log.
import { html, fa, api, store, toast, $, busy } from '../core.mjs';
import { back } from '../ui.mjs';
import { fmt, parseNum } from '../calc.mjs';
import { SYMBOLS, SYMBOL, isSymbol } from '../market.mjs';
import { jalaliOf } from '../ta.mjs';
import { jDate } from '../charts.mjs';

const tehranToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(new Date());
const jToday = () => fa(jalaliOf(tehranToday()).map((x, i) => (i ? String(x).padStart(2, '0') : x)).join('/'));

export async function marketDataPage(root) {
  root.classList.add('market');
  if (!store.isAdmin()) {
    root.innerHTML = String(html`${back('/market', 'بازار')}<h1>مدیریت داده بازار</h1><p class="lead">این بخش مخصوص مدیر و مالک فروشگاه است.</p>`);
    return;
  }
  let feed = await api('/api/market/feed');
  let symbol = new URLSearchParams(location.search).get('s');
  if (!isSymbol(symbol)) symbol = 'mesghal';

  root.innerHTML = String(html`${back('/market', 'بازار')}
    <h1>مدیریت داده بازار</h1>
    <p class="lead">قیمت‌ها از یکی از این راه‌ها می‌آیند؛ ورود دستی شما همیشه بر منبع خودکار مقدم است و هیچ‌وقت بازنویسی نمی‌شود.</p>
    <section class="tray" id="feed"></section>
    <div class="mk-cols">
      <section class="tray">
        <h2 class="mk-h">ثبت قیمت روز</h2>
        <form id="one" class="form" autocomplete="off">
          <label class="field">نماد<select class="input" name="symbol">${SYMBOLS.map((s) => html`<option value="${s.id}" ${s.id === symbol ? 'selected' : ''}>${s.label} (${s.unit})</option>`)}</select></label>
          <label class="field">تاریخ (شمسی یا میلادی)<input class="input ltr" name="day" value="${jToday()}" required></label>
          <label class="field">قیمت<input class="input ltr" name="price" inputmode="decimal" required></label>
          <p class="small">چند بار ثبت در یک روز سقف و کف آن روز را می‌سازد؛ آخرین ثبت قیمت پایانی است.</p>
          <div class="actions"><button class="btn" type="submit">ثبت</button></div>
        </form>
      </section>
      <section class="tray">
        <h2 class="mk-h">ورود جدول سابقه</h2>
        <form id="tbl" class="form" autocomplete="off">
          <label class="field">نماد<select class="input" name="symbol">${SYMBOLS.map((s) => html`<option value="${s.id}" ${s.id === symbol ? 'selected' : ''}>${s.label}</option>`)}</select></label>
          <label class="field">هر سطر یک روز: «تاریخ، پایانی» یا «تاریخ، باز، سقف، کف، پایانی»<textarea class="input ltr" name="table" rows="7" placeholder="1405/07/01	103,250,000&#10;1405/07/02	103,900,000"></textarea></label>
          <p class="small">از اکسل مستقیم کپی کنید (ستون‌ها با Tab)، یا CSV با کاما یا نقطه‌ویرگول. ارقام فارسی و جداکننده هزارگان پذیرفته است. سطر اول اگر تاریخ نداشته باشد عنوان حساب می‌شود.</p>
          <div class="actions"><button class="btn" type="submit">ورود جدول</button></div>
        </form>
      </section>
    </div>
    <section class="tray" id="recent"></section>`);

  function drawFeed() {
    const c = feed.config, st = feed.status;
    $('#feed', root).innerHTML = String(html`<h2 class="mk-h">منبع قیمت</h2>
      <form id="ff" class="form" autocomplete="off">
        <div class="seg" role="radiogroup" aria-label="منبع">${feed.modes.map((m) => html`<button type="button" data-mode="${m.id}" aria-pressed="${m.id === c.mode}">${m.label}</button>`)}</div>
        <div ${c.mode === 'json' ? '' : 'hidden'} id="jsonbox" class="form cols" style="margin-top:12px">
          <label class="field">نشانی فید (https)<input class="input ltr" name="url" value="${c.url}" placeholder="https://prices.example.com/latest"></label>
          <label class="field">توکن (اختیاری، به‌صورت Bearer)<input class="input ltr" name="token" value="${c.token}" autocomplete="off"></label>
        </div>
        <label class="check" style="margin-top:12px"><input type="checkbox" name="syncPrice" ${c.syncPrice ? 'checked' : ''}> قیمت پایه فروشگاه (گرم ۷۵۰) خودکار از طلای ۱۸ بازار به‌روز شود</label>
        <label class="field" style="max-width:260px;margin-top:10px">فاصله به‌روزرسانی (دقیقه، ۵ تا ۶۰)<input class="input ltr" name="interval" inputmode="numeric" value="${fa(c.interval)}"></label>
        <div class="actions"><button class="btn" type="submit">ذخیره منبع</button>${c.mode !== 'off' ? html`<button class="btn ghost" type="button" data-act="sync">به‌روزرسانی همین حالا</button><button class="btn ghost" type="button" data-act="backfill">بارگیری دوباره سابقه</button>` : ''}</div>
      </form>
      <div class="ledger" style="margin-top:12px">
        <div><span>وضعیت داده</span><span>${feed.hasReal ? 'قیمت واقعی ثبت شده است' : 'هنوز قیمتی نیست؛ صفحه بازار داده نمونه آموزشی نشان می‌دهد'}</span></div>
        ${st ? html`<div><span>آخرین اجرای خودکار</span><span>${fa(new Date(st.at).toLocaleString('fa-IR'))} · ${st.ok ? `موفق (${fa(st.quotes)} قیمت${st.rows ? `، ${fa(st.rows)} سطر` : ''})` : `ناموفق: ${st.error ?? ''}`}</span></div>` : ''}
        ${st?.sources ? html`${Object.entries(st.sources).map(([k, v]) => html`<div><span>منبع ${{ abshdh: 'کانال آب‌شده (@abshdh)', chande: 'چنده (دلار و سکه)', goldprice: 'goldprice.org (انس)' }[k] ?? k}</span><span>${v === 'ok' ? '✓ دریافت شد' : `✗ ${v}`}</span></div>`)}${st.onsFrom === 'chande' ? html`<div><span>انس جهانی</span><span>از چنده (goldprice.org در دسترس نبود)</span></div>` : ''}` : ''}
        ${st?.rejected?.length ? html`<div><span>ردشده به‌دلیل پرش غیرعادی</span><span>${st.rejected.map((id) => SYMBOL[id]?.short ?? id).join('، ')}</span></div>` : ''}
        ${c.backfilled ? html`<div><span>سابقه بارگیری‌شده</span><span>${fa(new Date(c.backfilled).toLocaleDateString('fa-IR'))}</span></div>` : ''}
      </div>
      <details style="margin-top:12px"><summary class="small">درباره منابع و قالب فید اختصاصی</summary>
        <p class="small"><b>منابع فروشگاه</b> (پیش‌فرض): مظنه نقدی و حواله از کانال @abshdh (همان منبع اپ goldsuite-price)، دلار آزاد و سکه‌ها از چنده (میانگین خرید و فروش)، انس جهانی از goldprice.org و در نبود آن از چنده؛ گرم ۱۸ = مظنه ÷ ۴٫۳۳۱۸ و گرم ۲۴ = گرم ۱۸ × ۱۰۰۰ ÷ ۷۵۰. سابقه روزانه یک بار از جدول‌های tgju بارگیری می‌شود.</p>
        <p class="small"><b>tgju.org</b>: نقطه دسترسی عمومی سایت است، نه API رسمی. برای استفاده تجاری و پایدار، API رسمی یک ارائه‌دهنده قیمت را بخرید و از راه «فید اختصاصی» وصل کنید. منبع هر قیمت روی صفحه بازار نوشته می‌شود.</p>
        <p class="small"><b>فید اختصاصی</b> (مثلاً از نرم‌افزار حسابداری یا سرویس قیمت خودتان) باید JSON زیر را برگرداند؛ قیمت‌ها به تومان و انس به دلار:</p>
        <pre class="ltr small">{ "day": "2026-09-28", "prices": { "mesghal": 103543000, "geram18": 23902000, "sekee": { "p": 240505000, "h": 241000000, "l": 239480000 }, "usd": 235000, "ons": 4213.22 } }</pre>
        <p class="small">نمادها: ${SYMBOLS.map((s) => `${s.id} (${s.short})`).join('، ')}. قیمتی که بیش از ۳۰٪ با قیمت قبلی فاصله داشته باشد خطای داده حساب و ثبت نمی‌شود.</p>
      </details>`);
  }
  async function drawRecent() {
    const r = await api(`/api/market/series?symbols=${symbol}&from=${new Date(Date.now() - 45 * 86400000).toISOString().slice(0, 10)}`);
    const rows = r.sample ? [] : r.series[symbol].slice(-20).reverse();
    const f = (v) => fmt(v, SYMBOL[symbol].decimals ?? 0);
    $('#recent', root).innerHTML = String(html`<h2 class="mk-h">آخرین روزهای ثبت‌شده: <select id="rsym" aria-label="نماد">${SYMBOLS.map((s) => html`<option value="${s.id}" ${s.id === symbol ? 'selected' : ''}>${s.short}</option>`)}</select></h2>
      ${rows.length ? html`<div class="tablewrap" tabindex="0"><table><thead><tr><th>تاریخ</th><th>باز</th><th>سقف</th><th>کف</th><th>پایانی</th><th></th></tr></thead><tbody>${rows.map(([d, o, h, l, c]) => html`<tr><td>${jDate(d)}</td><td>${f(o)}</td><td>${f(h)}</td><td>${f(l)}</td><td>${f(c)}</td><td><button class="iconbtn" data-del="${d}" aria-label="حذف ${jDate(d)}">×</button></td></tr>`)}</tbody></table></div>` : html`<p class="small">${r.sample ? 'هنوز قیمت واقعی ثبت نشده است.' : 'در ۴۵ روز اخیر قیمتی برای این نماد نیست.'}</p>`}`);
  }

  root.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.mode) {
      feed.config.mode = b.dataset.mode;
      for (const x of root.querySelectorAll('[data-mode]')) x.setAttribute('aria-pressed', String(x === b));
      $('#jsonbox', root).hidden = b.dataset.mode !== 'json';
    } else if (b.dataset.act === 'sync' || b.dataset.act === 'backfill') {
      busy(b, true);
      try {
        feed = await api('/api/market/sync', { method: 'POST', body: { backfill: b.dataset.act === 'backfill' } });
        drawFeed();
        await drawRecent();
        toast(feed.status?.ok ? 'به‌روزرسانی انجام شد.' : `به‌روزرسانی ناموفق: ${feed.status?.error ?? ''}`, feed.status?.ok ? 'info' : 'error');
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        busy(b, false);
      }
    } else if (b.dataset.del) {
      if (!confirm(`قیمت ${jDate(b.dataset.del)} حذف شود؟`)) return;
      try {
        await api(`/api/market/bars/${symbol}/${b.dataset.del}`, { method: 'DELETE' });
        await drawRecent();
      } catch (err) {
        toast(err.message, 'error');
      }
    }
  });
  root.addEventListener('change', (e) => {
    if (e.target.id === 'rsym' && isSymbol(e.target.value)) {
      symbol = e.target.value;
      drawRecent().catch((err) => toast(err.message, 'error'));
    }
  });
  root.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target.elements, btn = e.target.querySelector('button[type=submit]');
    busy(btn, true);
    try {
      if (e.target.id === 'ff') {
        feed = await api('/api/market/feed', { method: 'PUT', body: { mode: feed.config.mode, url: f.url?.value ?? '', token: f.token?.value ?? '', syncPrice: f.syncPrice.checked, interval: parseNum(f.interval.value) } });
        drawFeed();
        toast(feed.config.mode === 'off' ? 'ورود دستی فعال شد.' : 'منبع ذخیره شد؛ اولین به‌روزرسانی در پس‌زمینه شروع شد.');
      } else if (e.target.id === 'one') {
        const r = await api('/api/market/bars', { method: 'POST', body: { symbol: f.symbol.value, day: f.day.value, price: parseNum(f.price.value) } });
        toast(`ثبت شد: ${jDate(r.to)}`);
        f.price.value = '';
        symbol = f.symbol.value;
        await drawRecent();
      } else if (e.target.id === 'tbl') {
        const r = await api('/api/market/bars', { method: 'POST', body: { symbol: f.symbol.value, table: f.table.value } });
        toast(`${fa(r.saved)} روز ثبت شد (${jDate(r.from)} تا ${jDate(r.to)}).`);
        f.table.value = '';
        symbol = f.symbol.value;
        await drawRecent();
      }
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      busy(btn, false);
    }
  });
  drawFeed();
  await drawRecent();
}
