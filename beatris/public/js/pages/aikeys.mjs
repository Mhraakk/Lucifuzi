// موتورهای هوش مصنوعی تاجیار — the shop's own keys for Claude, ChatGPT, Gemini, Grok, Qwen, OpenCode, DeepSeek… in the
// order they are tried. A key is typed once, sealed on the server and never shown again (only its last four
// characters). «آزمون اتصال» sends one tiny request. If every engine is down, تاجیار answers from the books itself.
import { html, raw, api, fa, $, toast } from '../core.mjs';
import { modal, confirmBox, jd, timeFa } from '../bk.mjs';
import { booksNav } from './books.mjs';

export async function aiKeysPage(root) {
  let data;
  root.innerHTML = String(html`${booksNav('audit')}<div class="ak">
    <header class="bk-head"><div><h1>موتورهای هوش مصنوعی تاجیار</h1><p class="small">کلید API هر سرویسی را که دارید اضافه کنید. تاجیار به همین ترتیب امتحان می‌کند؛ اگر یکی پاسخ ندهد سراغ بعدی می‌رود و در نهایت خودش مستقیم از دفاتر جواب می‌دهد. کلید رمزشده روی سرور می‌ماند و هرگز دوباره نمایش داده نمی‌شود.</p></div>
    <button class="btn" data-act="add">+ افزودن سرویس</button></header>
    <div id="akBody"><div class="loading"><span></span></div></div>
    <p class="small ak-note">تاجیار فقط می‌خواند و حساب می‌کند؛ هیچ سندی را ثبت، ویرایش یا باطل نمی‌کند. هزینه مصرف با حساب خود شما نزد همان سرویس است.</p></div>`);
  const load = async () => {
    data = await api('/api/books/ai');
    draw();
  };
  const kindLabel = (k) => data.catalog.find((c) => c.id === k)?.label ?? k;
  function draw() {
    const list = data.providers;
    $('#akBody', root).innerHTML = String(html`${list.length ? html`<ol class="ak-list">${list.map(
      (p, i) => html`<li class="tray ak-row ${p.enabled ? '' : 'off'}"><span class="ak-n">${fa(i + 1)}</span>
        <div class="ak-main"><b>${p.label || kindLabel(p.kind)}</b><small>مدل: <span class="ltr-num">${p.model}</span> · کلید ${p.keyHint || '—'}${p.base && p.kind === 'custom' ? html` · <span class="ltr-num">${p.base}</span>` : ''}</small>
          ${p.lastTest ? html`<small class="ak-test ${p.lastTest.ok ? 'good' : 'bad'}">${p.lastTest.ok ? `اتصال برقرار · ${fa(p.lastTest.ms)} میلی‌ثانیه` : `خطا: ${p.lastTest.error}`} · ${jd(p.lastTest.at.slice(0, 10))} ${timeFa(p.lastTest.at)}</small>` : html`<small>هنوز آزموده نشده</small>`}</div>
        <div class="ak-act"><button class="chip" data-test="${p.id}">آزمون اتصال</button><button class="iconbtn" data-move="${i}" data-by="-1" ${i === 0 ? raw('disabled') : ''} aria-label="بالاتر">▲</button><button class="iconbtn" data-move="${i}" data-by="1" ${i === list.length - 1 ? raw('disabled') : ''} aria-label="پایین‌تر">▼</button>
          <button class="chip" data-toggle="${p.id}" data-on="${p.enabled ? 0 : 1}">${p.enabled ? 'خاموش' : 'روشن'}</button><button class="chip" data-edit="${p.id}">ویرایش</button><button class="chip danger" data-del="${p.id}">حذف</button></div></li>`,
    )}</ol>` : html`<section class="empty tray"><p>هنوز سرویسی اضافه نشده است؛ تاجیار با موتور داخلی (بدون اینترنت) مستقیم از دفاتر جواب می‌دهد.</p></section>`}
    ${data.chain.some((c) => c.id.startsWith('env-')) ? html`<p class="small">پس از این‌ها: ${data.chain.filter((c) => c.id.startsWith('env-')).map((c) => c.label).join('، ')}.</p>` : ''}`);
  }
  function form(p = null) {
    const cat = data.catalog;
    modal(
      String(html`<h3 class="bk-h">${p ? `ویرایش ${p.label || kindLabel(p.kind)}` : 'افزودن سرویس هوش مصنوعی'}</h3><form class="form ak-form" id="akf">
        <label class="field">سرویس<select class="input" name="kind" ${p ? raw('disabled') : ''}>${cat.map((c) => html`<option value="${c.id}" ${p?.kind === c.id ? 'selected' : ''}>${c.label}</option>`)}</select></label>
        <p class="small ak-help" id="akHelp"></p>
        <label class="field">نام مدل (همان‌طور که در پنل سرویس آمده)<input class="input ltr" name="model" value="${p?.model ?? ''}" required autocomplete="off" spellcheck="false"></label>
        <label class="field">کلید API${p ? ' (خالی = همان کلید قبلی)' : ''}<input class="input ltr" name="key" type="password" autocomplete="off" spellcheck="false" ${p ? '' : raw('required')}></label>
        <label class="field ak-base">نشانی پایه (فقط برای «سرویس دیگر»، با https)<input class="input ltr" name="base" value="${p?.kind === 'custom' ? p.base : ''}" placeholder="https://example.com/v1"></label>
        <label class="field">نام نمایشی (اختیاری)<input class="input" name="label" value="${p?.label ?? ''}"></label>
        <p class="err" id="akErr" role="alert"></p><div class="actions"><button class="btn">${p ? 'ذخیره' : 'افزودن و آزمون'}</button><button class="btn ghost" type="button" data-close>انصراف</button></div></form>`),
      (m, close) => {
        const sel = m.querySelector('[name=kind]');
        const sync = () => {
          const c = cat.find((x) => x.id === sel.value);
          m.querySelector('#akHelp').textContent = `کلید از: ${c.keyHelp}${c.base ? ` · نشانی: ${c.base}` : ''}`;
          m.querySelector('.ak-base').hidden = sel.value !== 'custom';
        };
        sel.addEventListener('change', sync);
        sync();
        m.querySelector('#akf').addEventListener('submit', async (e) => {
          e.preventDefault();
          const f = Object.fromEntries(new FormData(e.target));
          const body = { kind: p?.kind ?? f.kind, model: f.model.trim(), label: f.label, ...(f.key ? { key: f.key.trim() } : {}), ...((p?.kind ?? f.kind) === 'custom' ? { base: f.base.trim() } : {}) };
          const btn = e.target.querySelector('button.btn');
          btn.disabled = true;
          try {
            const saved = await api(p ? `/api/books/ai/${p.id}` : '/api/books/ai', { method: p ? 'PUT' : 'POST', body });
            const t = await api(`/api/books/ai/${saved.id}/test`, { method: 'POST' });
            close();
            toast(t.ok ? `اتصال برقرار شد (${fa(t.ms)} میلی‌ثانیه).` : `ذخیره شد، اما آزمون ناموفق بود: ${t.error}`, t.ok ? 'ok' : 'error');
            load();
          } catch (err) {
            m.querySelector('#akErr').textContent = err.message;
            btn.disabled = false;
          }
        });
      },
    );
  }
  root.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act],[data-test],[data-move],[data-toggle],[data-edit],[data-del]');
    if (!b) return;
    try {
      if (b.dataset.act === 'add') return form();
      if (b.dataset.edit) return form(data.providers.find((p) => p.id === b.dataset.edit));
      if (b.dataset.test) {
        b.disabled = true;
        b.textContent = 'در حال آزمون…';
        const t = await api(`/api/books/ai/${b.dataset.test}/test`, { method: 'POST' });
        toast(t.ok ? `اتصال برقرار (${fa(t.ms)} میلی‌ثانیه)` : `خطا: ${t.error}`, t.ok ? 'ok' : 'error');
        return load();
      }
      if (b.dataset.move) {
        const ids = data.providers.map((p) => p.id), i = Number(b.dataset.move), j = i + Number(b.dataset.by);
        [ids[i], ids[j]] = [ids[j], ids[i]];
        data = { ...data, ...(await api('/api/books/ai', { method: 'PUT', body: { order: ids } })) };
        return draw();
      }
      if (b.dataset.toggle) {
        await api(`/api/books/ai/${b.dataset.toggle}`, { method: 'PUT', body: { enabled: b.dataset.on === '1' } });
        return load();
      }
      if (b.dataset.del) {
        if (!(await confirmBox('حذف سرویس', 'کلید این سرویس از سرور پاک می‌شود.', { danger: true, ok: 'حذف' }))) return;
        await api(`/api/books/ai/${b.dataset.del}`, { method: 'DELETE' });
        return load();
      }
    } catch (err) {
      toast(err.message, 'error');
    }
  });
  await load();
}
