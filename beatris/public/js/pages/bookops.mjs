// The shop's less frequent acts (spec 0026), each a dialog that saves one ordinary document through the same chain
// as everything else: ذوب و تبدیل جنس (from the vault), سوخت یا بخشودگی مانده (from a customer's page) and the
// physical count of everything the vault holds (gold, every coin, every currency, every cash box, every sealed bar).
import { html, fa, api, toast, $, $$, busy } from '../core.mjs';
import * as B from '../books.mjs';
import * as TR from '../trade.mjs';
import { TRADE_COINS as COIN_TYPES, shownCoins } from '../coins.mjs';
import { R, G, jd, today, modal, unitAmt, unitLabel } from '../bk.mjs';

const num = (v) => B.num(v);
const err = (m, text) => ($('.err', m).textContent = text);
/** Save a document; a manager-approval gate (four eyes) answers with its own sentence, shown as it is. */
async function save(body, m, btn) {
  busy(btn, true);
  err(m, '');
  try {
    return await api('/api/books/docs', { method: 'POST', body });
  } catch (e) {
    err(m, e.message);
    return null;
  } finally {
    busy(btn, false);
  }
}

/* ---------------- ذوب و تبدیل جنس ---------------- */
/**
 * What goes into a melting (melted gold, sealed bars from the vault, coins) and what comes back (melted gold, new
 * sealed bars), with the wastage computed as it is typed; an optional melter's or lab's fee.
 */
export function meltDialog({ bars = [], onDone } = {}) {
  const S = { ins: [{ kind: 'melt', weight: '', fineness: '750' }], outs: [{ kind: 'melt', weight: '', fineness: '750' }] };
  const coinOpts = shownCoins();
  const row = (side, l, i) => html`<div class="mo-row" data-side="${side}" data-i="${i}">
      <span class="dk-tag">${l.kind === 'melt' ? 'آبشده' : l.kind === 'bar' ? (side === 'ins' ? 'شمش' : 'شمش نو') : 'سکه'}</span>
      ${l.kind === 'melt' ? html`<input class="input ltr sm" data-k="weight" inputmode="decimal" placeholder="وزن (گرم)" value="${l.weight}" aria-label="وزن"><input class="input ltr sm" data-k="fineness" inputmode="numeric" placeholder="عیار" value="${l.fineness}" aria-label="عیار">` : ''}
      ${l.kind === 'bar' && side === 'ins' ? html`<select class="input sm" data-k="serial" aria-label="سریال شمش"><option value="">شمش داخل گاوصندوق…</option>${bars.map((b) => html`<option value="${b.serial}" ${l.serial === b.serial ? 'selected' : ''}>${fa(b.serial)} · ${G(b.weight)} گرم · ${fa(b.fineness)}</option>`)}</select>` : ''}
      ${l.kind === 'bar' && side === 'outs' ? html`<input class="input ltr sm" data-k="serial" placeholder="سریال" value="${l.serial ?? ''}" aria-label="سریال"><input class="input ltr sm" data-k="weight" inputmode="decimal" placeholder="وزن" value="${l.weight}" aria-label="وزن"><input class="input ltr sm" data-k="fineness" inputmode="decimal" placeholder="عیار" value="${l.fineness}" aria-label="عیار"><input class="input sm" data-k="brand" placeholder="ضامن" value="${l.brand ?? ''}" aria-label="ضامن">` : ''}
      ${l.kind === 'coin' ? html`<select class="input sm" data-k="coin" aria-label="نوع سکه">${coinOpts.map(([k, c]) => html`<option value="${k}" ${l.coin === k ? 'selected' : ''}>${c.short}</option>`)}</select><input class="input ltr sm" data-k="count" inputmode="numeric" placeholder="تعداد" value="${l.count ?? ''}" aria-label="تعداد">` : ''}
      <button type="button" class="iconbtn" data-del aria-label="حذف ردیف">×</button></div>`;
  // the document the dialog would save (bars leaving carry the card the vault knows)
  const lines = () => [
    ...S.ins.map((l) => (l.kind === 'bar' ? { kind: 'bar', dir: 'out', serial: l.serial, weight: bars.find((b) => b.serial === l.serial)?.weight, fineness: bars.find((b) => b.serial === l.serial)?.fineness } : { ...l, dir: 'out' })),
    ...S.outs.map((l) => ({ ...l, dir: 'in' })),
  ];
  modal(
    String(html`<h3 class="bk-h">ذوب و تبدیل جنس</h3><p class="small">آنچه از گاوصندوق به ذوب، ری‌گیری، برش یا پلمپ می‌رود و آنچه برمی‌گردد. افت (یا اضافه) به گرم ۷۵۰ همین‌جا حساب و با میانگین بها در سود و زیان ثبت می‌شود.</p>
      <h4>به ذوب (خروج از گاوصندوق)</h4><div id="mo-ins"></div><div class="chips"><button class="chip" data-add="ins:melt">+ آبشده</button><button class="chip" data-add="ins:bar" ${bars.length ? '' : 'disabled'}>+ شمش</button><button class="chip" data-add="ins:coin">+ سکه</button></div>
      <h4>از ذوب (ورود به گاوصندوق)</h4><div id="mo-outs"></div><div class="chips"><button class="chip" data-add="outs:melt">+ آبشده</button><button class="chip" data-add="outs:bar">+ شمش نو</button></div>
      <div class="mo-sum" id="mo-sum" aria-live="polite"></div>
      <div class="grid2"><label class="field">اجرت ذوب یا آزمایشگاه (ریال، اختیاری)<input class="input ltr" name="fee" inputmode="numeric"></label><label class="field">روش پرداخت اجرت<select class="input" name="method"><option value="cash">نقد</option><option value="c2c">کارت به کارت</option><option value="havale">حواله بانکی</option></select></label></div>
      <label class="field">شرح (اجباری)<input class="input" name="note" maxlength="300" placeholder="مثلاً «ذوب شمش ۱۰۰ گرمی در کارگاه حسینی»"></label>
      <p class="err"></p><div class="actions"><button class="btn" data-save>ثبت ذوب</button><button class="btn ghost" data-close>انصراف</button></div>`),
    (m, close) => {
      const draw = () => {
        $('#mo-ins', m).innerHTML = S.ins.map((l, i) => String(row('ins', l, i))).join('');
        $('#mo-outs', m).innerHTML = S.outs.map((l, i) => String(row('outs', l, i))).join('');
        sum();
      };
      const sum = () => {
        let c;
        try {
          c = B.calcDoc({ type: 'transform', lines: lines(), payments: [] });
        } catch (e) {
          $('#mo-sum', m).innerHTML = String(html`<p class="small">${e.message}</p>`);
          return null;
        }
        $('#mo-sum', m).innerHTML = String(html`<p><b>${G(c.inputs)}</b> گرم ۷۵۰ رفت · <b>${G(c.outputs)}</b> برگشت · <b class="${c.wastage > 0 ? 'bad' : 'good'}">${c.wastage < 0 ? 'اضافه' : 'افت'} ${G(Math.abs(c.wastage))}</b> گرم ۷۵۰${c.inputs ? ` (${fa((Math.abs(c.wastage) / c.inputs * 100).toFixed(2))}٪)` : ''}</p>`);
        return c;
      };
      m.addEventListener('click', async (e) => {
        const add = e.target.closest('[data-add]')?.dataset.add;
        if (add) {
          const [side, kind] = add.split(':');
          S[side].push(kind === 'coin' ? { kind, coin: coinOpts[0]?.[0], count: '' } : kind === 'bar' ? { kind, serial: '', weight: '', fineness: side === 'outs' ? '999.9' : '' } : { kind, weight: '', fineness: '750' });
          return draw();
        }
        const del = e.target.closest('[data-del]');
        if (del) {
          const r = del.closest('.mo-row');
          S[r.dataset.side].splice(Number(r.dataset.i), 1);
          return draw();
        }
        const btn = e.target.closest('[data-save]');
        if (!btn) return;
        const note = $('[name=note]', m).value.trim();
        if (note.length < 3) return err(m, 'شرح ذوب را بنویسید.');
        if (!sum()) return err(m, 'ردیف‌ها کامل نیست.');
        const fee = num($('[name=fee]', m).value || 0);
        const doc = await save({ type: 'transform', lines: lines(), payments: fee > 0 ? [{ method: $('[name=method]', m).value, dir: 'out', amount: fee }] : [], note }, m, btn);
        if (!doc) return;
        toast(`ذوب ثبت شد: ${doc.track ?? ''}`, 'ok');
        close();
        onDone?.(doc);
      });
      m.addEventListener('input', (e) => {
        const r = e.target.closest('.mo-row');
        if (!r || !e.target.dataset.k) return;
        S[r.dataset.side][Number(r.dataset.i)][e.target.dataset.k] = e.target.value;
        sum();
      });
      m.addEventListener('change', (e) => e.target.matches('select[data-k]') && e.target.dispatchEvent(new Event('input', { bubbles: true })));
      draw();
    },
  );
}

/* ---------------- سوخت یا بخشودگی مانده ---------------- */
/** Clear part or all of one customer's balance in one unit, with the reason; the loss or gain goes to the books. */
export function writeoffDialog(party, balance, { onDone } = {}) {
  const units = Object.entries(balance ?? {}).filter(([, v]) => v);
  if (!units.length) return toast('این مشتری مانده‌ای ندارد.', 'error');
  modal(
    String(html`<h3 class="bk-h">سوخت یا بخشودگی مانده · ${party.name}</h3>
      <p class="small">بخشی یا همه مانده یک واحد پاک می‌شود. بدهی بخشیده‌شده مشتری زیان است و طلب رهاشده‌اش (مثلاً خرده‌ای که هرگز پس نمی‌گیرد) سود. بیشتر از مانده یا خلاف جهت آن ممکن نیست.</p>
      <label class="field">کدام مانده<select class="input" name="unit">${units.map(([u, v]) => html`<option value="${u}">${unitLabel(u)} · ${v > 0 ? 'بدهی مشتری' : 'طلب مشتری'} ${unitAmt(u, Math.abs(v))}</option>`)}</select></label>
      <label class="field">مقدار<input class="input ltr" name="amount" inputmode="decimal" value="${Math.abs(units[0][1])}"></label>
      <label class="field">دلیل (اجباری؛ در تاریخچه می‌ماند)<input class="input" name="note" maxlength="300" placeholder="مثلاً «تخفیف تسویه حساب با توافق»"></label>
      <p class="err"></p><div class="actions"><button class="btn danger" data-save>ثبت</button><button class="btn ghost" data-close>انصراف</button></div>`),
    (m, close) => {
      $('[name=unit]', m).addEventListener('change', (e) => ($('[name=amount]', m).value = Math.abs(balance[e.target.value])));
      $('[data-save]', m).addEventListener('click', async (e) => {
        const unit = $('[name=unit]', m).value;
        const amount = num($('[name=amount]', m).value);
        const note = $('[name=note]', m).value.trim();
        if (!(amount > 0)) return err(m, 'مقدار را وارد کنید.');
        if (note.length < 3) return err(m, 'دلیل را بنویسید.');
        const doc = await save({ type: 'writeoff', partyId: party.id, writeoff: { unit, amount: Math.sign(balance[unit]) * amount }, note }, m, e.currentTarget);
        if (!doc) return;
        toast(`ثبت شد: ${doc.track ?? ''}`, 'ok');
        close();
        onDone?.(doc);
      });
    },
  );
}

/* ---------------- شمارش فیزیکی همه گاوصندوق ---------------- */
/**
 * Count everything the vault holds: gold, every coin type, every currency, every cash box, and a checklist of the
 * sealed bars. The differences are saved as one «سند اصلاح موجودی» (a surplus enters at today's price).
 */
export function countDialog(v, { prices = {}, accName = {}, admin = false, onDone } = {}) {
  const rows = [
    ['gold', 'طلای آبشده (گرم ۷۵۰)', v.gold, 'G750'],
    ...Object.keys(COIN_TYPES).map((k) => [`coin:${k}`, COIN_TYPES[k].short, v.coins[k] ?? 0, `COIN:${k}`]),
    ...Object.entries(v.fx ?? {}).map(([c, n]) => [`fx:${c}`, TR.FX_CODES[c] ?? c, n, `FX:${c}`]),
    ...Object.entries(v.cash ?? {}).map(([id, x]) => [`cash:${id}`, `نقد ${accName[id] ?? id} (ریال)`, x, 'IRR']),
  ];
  const fmt = (k, x) => (k === 'gold' ? G(x) : k.startsWith('cash:') ? R(x) : fa(x));
  const diffOf = (k, b, x) => (k === 'gold' ? B.r3(x - b) : k.startsWith('fx:') ? Math.round((x - b) * 100) / 100 : Math.round(x - b));
  modal(
    String(html`<h3 class="bk-h">شمارش فیزیکی گاوصندوق</h3><p class="small">مقدار شمرده‌شده را وارد کنید؛ اختلاف با دفتر همین‌جا نشان داده می‌شود.${admin ? ' مدیر می‌تواند اختلاف را با «سند اصلاح موجودی» ثبت کند.' : ''}</p>
      <div class="scrollx"><table class="table-plain vt-count">${rows.map(([k, l, b]) => html`<tr data-k="${k}" data-b="${b}"><td>${l}</td><td class="num">دفتر: ${fmt(k, b)}</td><td><input class="input ltr sm" inputmode="decimal" placeholder="شمارش" aria-label="شمارش ${l}"></td><td class="num vt-diff"></td></tr>`)}</table></div>
      ${v.bars?.length ? html`<h4>شمش‌های پلمپ (هر شمشی که هست را تیک بزنید)</h4><div class="vt-bars">${v.bars.map((b) => html`<label><input type="checkbox" data-bar="${b.serial}" checked> <span class="ltr-num">${fa(b.serial)}</span> · ${G(b.weight)} گرم · ${fa(b.fineness)}</label>`)}</div>` : ''}
      ${admin ? html`<label class="field">توضیح (اختیاری؛ روی سند می‌ماند)<input class="input" name="reason" maxlength="200"></label>` : ''}
      <p class="err" id="vterr"></p><div class="actions">${admin ? html`<button class="btn" data-adj>ثبت اصلاحیه اختلاف</button>` : ''}<button class="btn ghost" data-close>بستن</button></div>`),
    (m, close) => {
      const diffs = () => [
        ...$$('tr[data-k]', m)
          .map((tr) => {
            const x = $('input', tr).value.trim();
            if (x === '') return null;
            const n = num(x);
            const k = tr.dataset.k;
            const d = diffOf(k, Number(tr.dataset.b), n);
            const unit = rows.find((r) => r[0] === k)[3];
            const price = unit !== 'IRR' ? prices[unit] : null;
            // a surplus enters at today's price so the trading result is not distorted
            return Number.isFinite(d) ? { acct: k, amount: d, ...(d > 0 && price ? { cost: B.rnd(d * price) } : {}) } : null;
          })
          .filter((x) => x && x.amount),
        // a bar not found is a shortage at its card (the server reads the card)
        ...$$('[data-bar]', m).filter((c) => !c.checked).map((c) => ({ acct: `bar:${c.dataset.bar}`, amount: -1 })),
      ];
      m.addEventListener('input', () => {
        for (const tr of $$('tr[data-k]', m)) {
          const x = $('input', tr).value.trim();
          const n = num(x);
          const d = x === '' || !Number.isFinite(n) || n < 0 ? null : diffOf(tr.dataset.k, Number(tr.dataset.b), n);
          const cell = $('.vt-diff', tr);
          // what is counted in a hand or on a scale is never below zero
          cell.textContent = x !== '' && n < 0 ? 'شمارش منفی نمی‌شود' : d == null ? '' : d === 0 ? '✓ برابر' : `${d > 0 ? 'اضافه' : 'کسری'} ${fmt(tr.dataset.k, Math.abs(d))}`;
          cell.className = `num vt-diff ${x !== '' && n < 0 ? 'bad' : d ? (d > 0 ? 'good' : 'bad') : ''}`;
        }
      });
      m.querySelector('[data-adj]')?.addEventListener('click', async (ev) => {
        const btn = ev.currentTarget;
        if ($$('tr[data-k] input', m).some((i) => i.value.trim() !== '' && num(i.value) < 0)) return ($('#vterr', m).textContent = 'شمارش منفی نمی‌شود؛ عدد واقعی را بنویسید.');
        const bal = diffs();
        if (!bal.length) return ($('#vterr', m).textContent = 'اختلافی برای ثبت نیست.');
        const reason = $('[name=reason]', m)?.value ?? '';
        const note = `شمارش فیزیکی گاوصندوق ${jd(today())}${reason ? `: ${reason}` : ''}`;
        busy(btn, true);
        try {
          await api('/api/books/docs', { method: 'POST', body: { type: 'adjust', money: 'rial', balances: bal, note } });
          toast('اصلاحیه ثبت شد.', 'ok');
          close();
          onDone?.();
        } catch (err2) {
          $('#vterr', m).textContent = err2.message;
        } finally {
          busy(btn, false);
        }
      });
    },
  );
}
