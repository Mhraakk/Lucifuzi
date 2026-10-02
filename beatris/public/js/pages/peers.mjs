// تطبیق با همکار — the account this shop keeps for a colleague shop, compared live with the account the colleague keeps
// for this shop (both on Beatris). The colleague's side is shown "as seen from here", so agreeing books show the same
// words and the same numbers in both columns; a gap lists the documents that exist on only one side.
import { html, api, fa, $, toast, store, busy } from '../core.mjs';
import * as B from '../books.mjs';
import { booksPrefs, jd, unitAmt, unitLabel, balUnits, modal, confirmBox } from '../bk.mjs';
import { booksNav } from './books.mjs';

const say = (u, v) => (Math.abs(v) < 1e-9 ? html`<span class="pe-zero">بی‌حساب</span>` : html`<b class="${v > 0 ? 'pe-d' : 'pe-c'}">${u.startsWith('BAR:') ? unitLabel(u) : unitAmt(u, Math.abs(v))}</b> <small>${v > 0 ? 'همکار بدهکار' : 'همکار بستانکار'}</small>`);
const tday = (ts) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(new Date(ts));
const kind = (t) => B.DOC_TYPES[t]?.short ?? (t === 'opening' ? 'افتتاحیه' : 'سند');

function unitsTable(c) {
  const us = balUnits(Object.fromEntries(c.units.map((u) => [u.unit, 1])));
  return html`<div class="scrollx"><table class="table pe-t"><thead><tr><th>دارایی</th><th>در دفتر ما</th><th>در دفتر همکار (از نگاه ما)</th><th>اختلاف</th></tr></thead><tbody>${us.map((unit) => {
    const u = c.units.find((x) => x.unit === unit);
    return html`<tr class="${u.diff ? 'bad' : ''}"><td>${unitLabel(unit)}</td><td>${say(unit, u.mine)}</td><td>${say(unit, -u.theirs)}</td><td>${u.diff ? html`<b class="pe-gap">${unit.startsWith('BAR:') ? 'شمش' : unitAmt(unit, Math.abs(u.diff))}</b>` : html`<span class="pe-ok">✓</span>`}</td></tr>`;
  })}</tbody></table></div>`;
}
const lineList = (items, flip, empty) =>
  items.length
    ? html`<ul class="pe-lines">${items.map((l) => html`<li><time>${jd(l.date)}</time><span>${kind(l.type)}${l.track ? html` <small class="ltr-num">${l.track}</small>` : ''}</span><span>${say(l.unit, flip ? -l.amt : l.amt)}</span></li>`)}</ul>`
    : html`<p class="small">${empty}</p>`;

export async function peersPage(root) {
  await booksPrefs();
  const partiesP = api('/api/books/parties').then((r) => r.items ?? []).catch(() => []);
  const draw = async () => {
    let d;
    try {
      d = await api('/api/peers');
    } catch (e) {
      root.innerHTML = String(html`${booksNav('peers')}<section class="pe"><p class="err">${e.message}</p></section>`);
      return;
    }
    root.innerHTML = String(html`${booksNav('peers')}<section class="pe">
      <header class="pe-head"><div><h1>تطبیق با همکار</h1><p class="lead">حسابی که برای همکار نگه می‌دارید، هر لحظه با حسابی که همکار برای شما نگه می‌دارد مقایسه می‌شود (هر دو روی بئاتریس). اگر یک طرف سندی را جا انداخته باشد، همان سند با تاریخ و کد رهگیری نشان داده می‌شود. هیچ چیزی در دفتر هیچ‌کدام ثبت نمی‌شود.</p></div>
        <div class="actions"><button class="btn" data-act="invite">ساخت کد اتصال</button><button class="btn ghost" data-act="accept">کد همکار را دارم</button></div></header>
      ${d.pending.length ? html`<p class="small pe-pend">کد در انتظار: ${d.pending.map((p) => html`<span class="chip">${p.party} · تا ${jd(tday(p.expiresAt))}</span> `)}</p>` : ''}
      ${d.items.length
        ? html`<div class="pe-list">${d.items.map((l) => html`<article class="pe-card tray ${l.error ? 'off' : l.compare?.agree ? 'ok' : 'bad'}" data-id="${l.id}">
            <header><div><b>${l.peerShop || 'همکار'}</b><small>حساب «${l.party.label}» در دفتر ما · از ${jd(tday(l.createdAt))}</small></div><span class="pe-pill">${l.error ? 'در دسترس نیست' : l.compare.agree ? 'همخوان ✓' : `${fa(l.compare.units.filter((u) => u.diff).length)} مغایرت`}</span></header>
            ${l.error ? html`<p class="small">${l.error}</p>` : l.compare.units.length ? unitsTable(l.compare) : html`<p class="small">هر دو دفتر بی‌حساب‌اند.</p>`}
            <div class="actions"><button class="btn ghost small" data-act="detail">ریز سندها</button><a class="btn ghost small" href="/books/party/${l.party.id}" data-link>حساب در دفتر ما</a><button class="btn ghost small danger" data-act="end">قطع اتصال</button></div>
            <div class="pe-detail" hidden></div></article>`)}</div>`
        : html`<div class="tray pe-empty"><h2>هنوز به همکاری وصل نیستید</h2><ol><li>در فهرست مشتریان برای همکار یک حساب داشته باشید (مثلاً «زرگری الماس»).</li><li>«ساخت کد اتصال» را بزنید و کد ۸ حرفی را تلفنی به همکار بدهید.</li><li>همکار در بئاتریس خودش «کد همکار را دارم» را می‌زند و حساب شما را انتخاب می‌کند.</li></ol></div>`}
    </section>`);
  };
  const pickParty = (items) => html`<label class="field">حساب همکار در دفتر ما<input class="input" name="q" placeholder="جستجوی نام…" autocomplete="off"></label><select class="input" name="party" size="6" required>${items.map((p) => html`<option value="${p.id}">${p.name}${p.alias ? ` (${p.alias})` : ''}${p.code ? ` · ${fa(p.code)}` : ''}</option>`)}</select>`;
  const wirePick = (m, items) => {
    $('[name=q]', m).addEventListener('input', (e) => {
      const q = e.target.value.trim();
      for (const o of m.querySelectorAll('[name=party] option')) o.hidden = !!q && !o.textContent.includes(q);
    });
    if (items.length === 1) $('[name=party]', m).value = items[0].id;
  };

  root.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const card = b.closest('.pe-card');
    if (b.dataset.act === 'invite' || b.dataset.act === 'accept') {
      const items = await partiesP;
      const inv = b.dataset.act === 'invite';
      modal(
        String(html`<h3 class="bk-h">${inv ? 'ساخت کد اتصال' : 'اتصال با کد همکار'}</h3><form class="pe-form">${inv ? '' : html`<label class="field">کد ۸ حرفی همکار<input class="input ltr pe-code-in" name="code" maxlength="9" required placeholder="ABCD-EFGH" autocomplete="off"></label>`}${pickParty(items)}<div id="peOut"></div><p class="err" id="peErr" role="alert"></p><div class="actions"><button class="btn">${inv ? 'ساخت کد' : 'اتصال'}</button><button class="btn ghost" type="button" data-close>بستن</button></div></form>`),
        (m, close) => {
          wirePick(m, items);
          $('form', m).addEventListener('submit', async (ev) => {
            ev.preventDefault();
            const f = new FormData(ev.target);
            const btn = ev.submitter;
            $('#peErr', m).textContent = '';
            if (!f.get('party')) return ($('#peErr', m).textContent = 'حساب همکار را از فهرست انتخاب کنید.');
            busy(btn, true);
            try {
              if (inv) {
                const r = await api('/api/peers/invite', { method: 'POST', body: { partyId: f.get('party') } });
                $('#peOut', m).innerHTML = String(html`<div class="pe-code"><small>این کد را به همکار بدهید (تا ${jd(tday(r.expiresAt))} و فقط یک بار):</small><b class="ltr-num">${r.code}</b><button class="btn small ghost" type="button" data-copy>کپی</button></div>`);
                $('[data-copy]', m).addEventListener('click', () => navigator.clipboard?.writeText(r.code).then(() => toast('کپی شد.', 'ok')).catch(() => {}));
                btn.hidden = true;
                draw();
              } else {
                await api('/api/peers/accept', { method: 'POST', body: { code: f.get('code'), partyId: f.get('party') } });
                toast('اتصال برقرار شد.', 'ok');
                close();
                draw();
              }
            } catch (err) {
              $('#peErr', m).textContent = err.message;
            } finally {
              busy(btn, false);
            }
          });
        },
      );
      return;
    }
    if (!card) return;
    const id = card.dataset.id;
    if (b.dataset.act === 'end') {
      if (!(await confirmBox('قطع اتصال با همکار', 'مقایسه این دو حساب متوقف می‌شود. دفترهای هیچ‌کدام تغییری نمی‌کنند و بعداً می‌توانید دوباره وصل شوید.', { danger: true, ok: 'قطع اتصال' }))) return;
      try {
        await api(`/api/peers/${id}`, { method: 'DELETE' });
        draw();
      } catch (err) {
        toast(err.message, 'error');
      }
      return;
    }
    if (b.dataset.act === 'detail') {
      const box = $('.pe-detail', card);
      if (!box.hidden) return (box.hidden = true);
      busy(b, true);
      try {
        const r = await api(`/api/peers/${id}`);
        const c = r.compare;
        box.innerHTML = String(html`<p class="small">${fa(c.matched)} سند در هر دو دفتر جفت شد (از ${jd(c.since)} به بعد؛ هم‌واحد، هم‌مقدار، با حداکثر سه روز فاصله).</p>
          <div class="pe-cols"><div><h4>فقط در دفتر ما</h4>${lineList(c.onlyMine, false, 'چیزی جا نیفتاده است.')}</div><div><h4>فقط در دفتر همکار</h4>${lineList(c.onlyTheirs, true, 'چیزی جا نیفتاده است.')}</div></div>
          ${c.onlyMine.length || c.onlyTheirs.length ? html`<p class="small">سندی که فقط در یک دفتر است یا جا افتاده یا با مقدار دیگری ثبت شده؛ کد رهگیری را به همکار بگویید تا پیدا کند.</p>` : ''}`);
        box.hidden = false;
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        busy(b, false);
      }
    }
  });
  if (!store.isAdmin()) {
    root.innerHTML = String(html`${booksNav('peers')}<section class="pe"><p class="small">تطبیق با همکار مخصوص مدیر و مالک است.</p></section>`);
    return;
  }
  await draw();
}
