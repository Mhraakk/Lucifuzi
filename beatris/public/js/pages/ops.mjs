// عملیات — the vendor's control room (spec 0001 #2 #18 #19): health, request metrics, the job queue, backups,
// feature flags per shop, and a replay check of the main shop's books. Refreshes every 15 seconds while open.
import { html, api, fa, $, toast, busy } from '../core.mjs';
import { jd, timeFa } from '../bk.mjs';

const STATE_FA = { ok: 'سالم', off: 'خاموش', stale: 'کهنه', down: 'قطع' };
const ms = (v) => `${fa(Math.round(v))} ms`;
const pct = (v) => `${fa((v * 100).toFixed(2))}٪`;
const mb = (b) => `${fa((b / 1048576).toFixed(1))} MB`;
const stampFa = (s) => {
  const iso = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(9, 11)}:${s.slice(11, 13)}:${s.slice(13, 15)}Z`;
  return `${jd(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(new Date(iso)))} ${timeFa(iso)}`;
};

export async function opsPage(root) {
  root.innerHTML = String(html`<section class="ops">
    <header class="ops-head"><div><h1>عملیات</h1><p class="small">سلامت سرور، سرعت و خطای هر مسیر، صف کارها، پشتیبان‌ها و پرچم‌های قابلیت هر فروشگاه. هر ۱۵ ثانیه تازه می‌شود.</p></div>
      <div class="actions"><button class="btn ghost" data-act="replay">وارسی دفتر (بازپخش)</button><button class="btn" data-act="backup">پشتیبان همین الان</button></div></header>
    <div class="ops-cards" id="opsH"><div class="loading"><span></span></div></div>
    <p class="small" id="opsReplay" hidden></p>
    <div class="ops-grid">
      <article class="tray"><h2>مسیرها</h2><div class="scrollx" id="opsR"></div></article>
      <article class="tray"><h2>صف کارها و رویدادها</h2><div id="opsQ"></div></article>
      <article class="tray"><h2>پشتیبان‌ها</h2><div id="opsB"></div></article>
      <article class="tray"><h2>پرچم قابلیت‌ها</h2><p class="small">«پیش‌فرض» یعنی تابع مقدار کلی؛ برای یک فروشگاه جدا روشن یا خاموش کنید.</p><div class="scrollx" id="opsF"></div></article>
    </div></section>`);

  async function load() {
    const [m, f] = await Promise.all([api('/api/ops/metrics'), api('/api/ops/flags')]);
    const h = m.health;
    $('#opsH', root).innerHTML = String(html`
      <div class="ops-card ${h.db === 'ok' ? 'good' : 'bad'}"><small>دیتابیس</small><b>${STATE_FA[h.db] ?? h.db}</b></div>
      <div class="ops-card ${h.feed === 'stale' ? 'bad' : 'good'}"><small>فید قیمت</small><b>${STATE_FA[h.feed] ?? h.feed}</b><em>${m.market?.at ? timeFa(m.market.at) : '—'}</em></div>
      <div class="ops-card ${h.queue.dead ? 'bad' : 'good'}"><small>صف کارها</small><b>${fa(h.queue.queued)} در صف · ${fa(h.queue.dead)} مرده</b></div>
      <div class="ops-card ${h.backup ? 'good' : 'warn'}"><small>آخرین پشتیبان</small><b>${h.backup ? stampFa(h.backup.stamp) : 'هنوز نیست'}</b></div>
      <div class="ops-card"><small>درخواست‌ها</small><b>${fa(m.metrics.requests)}</b><em>خطای سرور ${pct(m.metrics.errorRate5xx)}</em></div>
      <div class="ops-card"><small>حافظه · روشن از</small><b>${fa(m.metrics.memoryMB)} MB</b><em>${fa(Math.round(m.metrics.uptimeSec / 60))} دقیقه</em></div>`);
    $('#opsR', root).innerHTML = String(html`<table class="table ops-t"><thead><tr><th>مسیر</th><th>تعداد</th><th>p50</th><th>p95</th><th>بیشینه</th><th>۴xx</th><th>۵xx</th></tr></thead><tbody>${m.metrics.routes.slice(0, 25).map((r) => html`<tr class="${r.errors5xx ? 'bad' : ''}"><td class="ltr">${r.route}</td><td>${fa(r.count)}</td><td>${ms(r.p50)}</td><td>${ms(r.p95)}</td><td>${ms(r.max)}</td><td>${fa(r.errors4xx)}</td><td>${fa(r.errors5xx)}</td></tr>`)}</tbody></table>`);
    const b = m.bus;
    const counters = Object.entries(m.metrics.counters);
    $('#opsQ', root).innerHTML = String(html`<ul class="ops-kv"><li><span>اجرا شده</span><b>${fa(b.ran)}</b></li><li><span>خطا (با تلاش دوباره)</span><b>${fa(b.failed)}</b></li><li><span>رویداد منتشرشده</span><b>${fa(b.published)}</b></li>${b.recurring.map((r) => html`<li><span>کار دوره‌ای ${r.name}</span><b>هر ${fa(Math.round(r.every / 60000))} دقیقه</b></li>`)}${counters.map(([k, v]) => html`<li><span class="ltr">${k}</span><b>${fa(v)}</b></li>`)}</ul>
      ${b.deadJobs.length ? html`<h3>کارهای مرده</h3><ul class="ops-dead">${b.deadJobs.map((j) => html`<li><span class="ltr">${j.type}</span><small>${j.last_error ?? ''}</small><button class="btn ghost small" data-retry="${j.id}">تلاش دوباره</button></li>`)}</ul>` : ''}`);
    $('#opsB', root).innerHTML = m.backups.length
      ? String(html`<table class="table"><thead><tr><th>زمان</th><th>دیتابیس‌ها</th><th>حجم</th></tr></thead><tbody>${m.backups.map((x) => html`<tr><td>${stampFa(x.stamp)}</td><td>${fa(x.files)}</td><td>${mb(x.bytes)}</td></tr>`)}</tbody></table><p class="small">هر روز خودکار؛ ۱۴ نسخه آخر نگه داشته می‌شود. بازیابی: <span class="ltr">docs/ARCHITECTURE.md</span></p>`)
      : String(html`<p class="small">هنوز پشتیبانی گرفته نشده است (پشتیبان روزانه خودکار روی سرور اجرا می‌شود).</p>`);
    const shops = [{ id: 'all', name: 'همه فروشگاه‌ها' }, { id: 'main', name: 'فروشگاه اصلی' }, ...f.shops];
    const cur = (scope, key) => (scope === 'all' ? f.all[key] : f.overrides[scope]?.[key]);
    $('#opsF', root).innerHTML = String(html`<table class="table ops-flags"><thead><tr><th>فروشگاه</th>${f.flags.map((x) => html`<th>${x.label}</th>`)}</tr></thead><tbody>${shops.map((s) => html`<tr><td>${s.name}</td>${f.flags.map((x) => {
      const v = cur(s.id, x.key);
      return html`<td><select class="input small" data-scope="${s.id}" data-key="${x.key}"><option value="" ${v === undefined ? 'selected' : ''}>پیش‌فرض</option><option value="1" ${v === true ? 'selected' : ''}>روشن</option><option value="0" ${v === false ? 'selected' : ''}>خاموش</option></select></td>`;
    })}</tr>`)}</tbody></table>`);
  }

  root.addEventListener('change', async (e) => {
    const sel = e.target.closest('select[data-key]');
    if (!sel) return;
    try {
      await api('/api/ops/flags', { method: 'PUT', body: { scope: sel.dataset.scope, key: sel.dataset.key, value: sel.value === '' ? null : sel.value === '1' } });
      toast('پرچم ذخیره شد.', 'ok');
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
  root.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act], [data-retry]');
    if (!b) return;
    busy(b, true);
    try {
      if (b.dataset.retry) {
        await api(`/api/ops/jobs/${b.dataset.retry}/retry`, { method: 'POST' });
        toast('دوباره در صف قرار گرفت.', 'ok');
      } else if (b.dataset.act === 'backup') {
        const r = await api('/api/ops/backup', { method: 'POST' });
        toast(`پشتیبان گرفته شد: ${fa(r.files.length)} دیتابیس، همه ${r.files.every((x) => x.integrity === 'ok') ? 'سالم' : 'با مشکل'}.`, 'ok');
      } else if (b.dataset.act === 'replay') {
        const r = await api('/api/books/replay');
        const el = $('#opsReplay', root);
        el.hidden = false;
        el.textContent = r.ok ? `بازپخش دفتر فروشگاه اصلی: ${fa(r.docs)} سند قطعی از نو ساخته شد و با ثبت‌ها یکی است (${fa(r.ms)} میلی‌ثانیه).` : `بازپخش دفتر: ${fa(r.count)} اختلاف پیدا شد — ${r.diffs.slice(0, 3).map((d) => `${d.track ?? d.doc} ${d.acct}`).join('، ')}`;
      }
      await load();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      busy(b, false);
    }
  });
  await load();
  const timer = setInterval(() => load().catch(() => {}), 15000);
  return () => clearInterval(timer);
}
