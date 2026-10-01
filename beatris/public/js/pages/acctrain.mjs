// حسابداری عملی با مربی (spec 0015): one quiet page — the case, the journal entry the trainee writes, and the
// tutor's answer. The agents work behind it (scenario choice, grading, mastery, interventions); the page shows only
// what a person needs: what happened, what to write, what was right, what to practise next.
import { html, api, fa, $, toast, busy, store } from '../core.mjs';
import { fineCheck } from '../acct/evaluate.mjs';

const money = (n) => (n == null || n === '' ? '' : Math.round(Number(n)).toLocaleString('fa-IR'));
const num = (s) => Number(String(s ?? '').replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[٬,\s]/g, '').replace('٫', '.')) || 0;
const pct = (x) => `${fa(Math.round((x ?? 0) * 100))}٪`;
const newKey = () => `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
const TYPE_ORDER = ['asset', 'liability', 'equity', 'revenue', 'contra', 'expense'];
const TYPE_FA = { asset: 'دارایی', liability: 'بدهی', equity: 'سرمایه', revenue: 'درآمد', contra: 'کاهنده درآمد', expense: 'هزینه' };

export async function accountingPage(root) {
  const S = { home: null, scenario: null, entries: [], result: null, hint: null, tab: 'case', practice: null, choice: { decision: null, findings: new Set() } };
  root.innerHTML = String(html`<div class="at" aria-busy="true"><p class="at-quiet">در حال آماده شدن…</p></div>`);
  S.home = await api('/api/train/acct');
  const ACC = Object.fromEntries(S.home.accounts.map((a) => [a.code, a]));
  const blankEntry = () => ({ ref: '', lines: [blankLine(), blankLine()] });
  const blankLine = () => ({ account: '', dr: '', cr: '', grams: '', fineness: '', party: '' });

  const accountSelect = (v, i, j) => html`<select class="at-in at-acc" data-e="${i}" data-l="${j}" data-f="account" aria-label="حساب"><option value="">حساب…</option>${TYPE_ORDER.map((t) => html`<optgroup label="${TYPE_FA[t]}">${S.home.accounts.filter((a) => a.type === t).map((a) => html`<option value="${a.code}" ${a.code === v ? 'selected' : ''}>${a.code} · ${a.fa}</option>`)}</optgroup>`)}</select>`;

  function draw() {
    const p = S.home.progress;
    const sc = S.scenario;
    root.innerHTML = String(html`<div class="at">
      <header class="at-head">
        <p class="at-kicker">حسابداری عملی</p>
        <h1>یک رویداد، یک سند، یک دلیل.</h1>
        <p class="at-lead">مربی رویدادی از پیشخوان طلا می‌دهد؛ شما سند را می‌زنید؛ موتور حسابداری آن را می‌سنجد و می‌گوید چرا.</p>
        <p class="at-meta">آمادگی <b>${pct(p.readiness)}</b>${p.weak.length ? html` · تمرین بیشتر: ${p.weak.map((w) => w.fa).join('، ')}` : ''}</p>
        <nav class="at-tabs" role="tablist">
          <button role="tab" aria-selected="${S.tab === 'case'}" data-tab="case">تمرین</button>
          <button role="tab" aria-selected="${S.tab === 'practice'}" data-tab="practice">دفتر آزاد</button>
          <button role="tab" aria-selected="${S.tab === 'skills'}" data-tab="skills">مهارت‌ها</button>
        </nav>
      </header>
      ${S.tab === 'case' ? caseView(sc) : S.tab === 'practice' ? practiceView() : skillsView()}
    </div>`);
  }

  function caseView(sc) {
    if (!sc) {
      const n = S.home.progress.next;
      const open = S.home.progress.open;
      return html`<section class="at-start">
        <p>پیشنهاد مربی: <b>${S.home.skills.find((s) => s.id === n.skillId)?.fa ?? ''}</b>، سطح ${S.home.difficulties.find((d) => d.id === n.difficulty)?.fa ?? ''}.</p>
        <div class="at-actions"><button class="btn" data-act="next">شروع تمرین</button>
        <select class="at-in" id="atTpl" aria-label="یا یک موقعیت"><option value="">یا یک موقعیت خاص…</option>${S.home.templates.map((t) => html`<option value="${t.id}">${t.title}</option>`)}</select></div>
        ${open.length ? html`<h2 class="at-h2">تمرین‌های باز</h2><ul class="at-list">${open.map((o) => html`<li><button class="at-link" data-open="${o.rowId}">${o.title}</button><small>${o.assignedBy === 'routine' ? 'تمرین روزانه' : o.assignedBy === 'trigger' ? 'تمرین جبرانی' : ''}</small></li>`)}</ul>` : ''}
      </section>`;
    }
    const r = S.result;
    return html`<article class="at-case">
      <p class="at-kicker">${sc.title} · ${S.home.difficulties.find((d) => d.id === sc.difficulty)?.fa}</p>
      <p class="at-context">${sc.context}</p>
      <details class="at-open"><summary>دفتر پیش از این رویداد (${fa(sc.opening.length)} سند)</summary>
        <ol>${sc.opening.map((e) => html`<li>${e.memo || e.kind}</li>`)}</ol></details>
      ${sc.answerKind === 'decision' ? decisionView() : sc.answerKind === 'findings' ? findingsView(sc) : entriesView()}
      <div class="at-actions">
        <button class="btn" data-act="check" ${r?.evaluation?.done ? 'disabled' : ''}>بررسی</button>
        <button class="btn ghost" data-act="hint">راهنمایی${S.hint ? ` (${fa(S.hint.level)})` : ''}</button>
        ${r?.evaluation?.done ? html`<button class="btn ghost" data-act="next">تمرین بعدی</button>` : html`<button class="at-link" data-act="reveal">پاسخ را نشان بده</button>`}
      </div>
      ${S.hint ? html`<p class="at-hint" role="status">${S.hint.text}</p>` : ''}
      ${r ? resultView(r) : ''}
    </article>`;
  }

  function entriesView() {
    return html`<div class="at-entries">${S.entries.map((e, i) => {
      let dr = 0, cr = 0;
      for (const l of e.lines) (dr += num(l.dr)), (cr += num(l.cr));
      return html`<fieldset class="at-entry"><legend>سند ${fa(i + 1)}</legend>
        <table class="at-grid"><thead><tr><th>حساب</th><th>بدهکار (ریال)</th><th>بستانکار (ریال)</th><th>جزئیات</th><th></th></tr></thead><tbody>
        ${e.lines.map((l, j) => {
          const a = ACC[l.account];
          const f = a?.measure === 'weight' ? fineCheck(num(l.grams), num(l.fineness)) : null;
          return html`<tr>
            <td>${accountSelect(l.account, i, j)}</td>
            <td><input class="at-in num" inputmode="decimal" data-e="${i}" data-l="${j}" data-f="dr" value="${l.dr}" aria-label="بدهکار"></td>
            <td><input class="at-in num" inputmode="decimal" data-e="${i}" data-l="${j}" data-f="cr" value="${l.cr}" aria-label="بستانکار"></td>
            <td class="at-dims">${a?.measure === 'weight' ? html`<input class="at-in at-s" inputmode="decimal" placeholder="گرم" data-e="${i}" data-l="${j}" data-f="grams" value="${l.grams}"><input class="at-in at-s" inputmode="decimal" placeholder="عیار" data-e="${i}" data-l="${j}" data-f="fineness" value="${l.fineness}"><small>${f ? `معادل ۷۵۰: ${fa(f)} گرم` : ''}</small>` : ''}${a?.measure === 'count' ? html`<input class="at-in at-s" inputmode="numeric" placeholder="تعداد" data-e="${i}" data-l="${j}" data-f="qty" value="${l.qty ?? ''}">` : ''}${a?.party ? html`<input class="at-in" placeholder="طرف حساب" data-e="${i}" data-l="${j}" data-f="party" value="${l.party}">` : ''}</td>
            <td><button class="at-x" data-del="${i}:${j}" aria-label="حذف ردیف">×</button></td></tr>`;
        })}</tbody>
        <tfoot><tr><td><button class="at-link" data-addline="${i}">+ ردیف</button></td><td class="num">${money(dr)}</td><td class="num">${money(cr)}</td><td colspan="2" class="${dr === cr && dr ? 'at-ok' : 'at-off'}">${dr === cr ? (dr ? 'متوازن' : '') : `اختلاف ${money(Math.abs(dr - cr))}`}</td></tr></tfoot></table>
        <label class="at-ref">مرجع یا شماره مدرک <input class="at-in" data-e="${i}" data-f="ref" value="${e.ref}"></label>
      </fieldset>`;
    })}<button class="at-link" data-act="addentry">+ سند دیگر</button></div>`;
  }
  const decisionView = () => html`<div class="at-decide" role="radiogroup" aria-label="تصمیم">${[['post', 'ثبت می‌کنم'], ['reject', 'رد می‌کنم']].map(([k, l]) => html`<button class="chip" role="radio" aria-checked="${S.choice.decision === k}" data-decision="${k}">${l}</button>`)}</div>`;
  const findingsView = (sc) => html`<table class="at-journal"><thead><tr><th>سند</th><th>شرح</th><th>ردیف‌ها</th></tr></thead><tbody>${sc.journal.map((e) => html`<tr><td>${e.id}</td><td>${e.memo || e.kind}</td><td>${e.lines.map((l) => `${ACC[l.account]?.fa ?? l.account} ${l.dr ? `بد ${money(l.dr)}` : `بس ${money(l.cr)}`}${l.fine750 ? ` (${fa(l.fine750)} گ ۷۵۰، ${fa(l.grams)} گ عیار ${fa(l.fineness)})` : ''}${l.party ? ` · ${l.party}` : ''}`).join(' | ')}</td></tr>`)}</tbody></table>
    <fieldset class="at-findings"><legend>یافته‌ها</legend>${S.home.findings.map((f) => html`<label><input type="checkbox" data-finding="${f.code}" ${S.choice.findings.has(f.code) ? 'checked' : ''}> ${f.fa}</label>`)}</fieldset>`;

  function resultView(r) {
    const ev = r.evaluation;
    return html`<section class="at-result ${ev.correct ? 'ok' : ''}" aria-live="polite">
      <p class="at-score">${pct(ev.score)}</p>
      <p>${r.feedback}</p>
      ${ev.mistakes.length ? html`<ul class="at-mistakes">${ev.mistakes.slice(0, 6).map((m) => html`<li>${m.detail}</li>`)}</ul>` : ''}
      ${ev.answer?.entries ? html`<h2 class="at-h2">سند درست</h2>${ev.answer.entries.map((e) => html`<table class="at-grid at-answer"><tbody>${e.lines.map((l) => html`<tr><td>${ACC[l.account]?.fa}</td><td class="num">${l.dr ? money(l.dr) : ''}</td><td class="num">${l.cr ? money(l.cr) : ''}</td><td>${l.fine750 ? `${fa(l.fine750)} گرم ۷۵۰` : l.qty ? `${fa(l.qty)} عدد` : ''}${l.party ? ` · ${l.party}` : ''}</td></tr>`)}</tbody></table>`)}` : ''}
      ${ev.answer?.decision ? html`<p>تصمیم درست: <b>${ev.answer.decision === 'reject' ? 'رد' : 'ثبت'}</b></p>` : ''}
      ${ev.answer?.findings ? html`<p>یافته‌ها: ${ev.answer.findings.map((f) => f.fa).join('، ')}</p>` : ''}
      ${r.explanation?.text ? html`<p class="at-why">${r.explanation.plain ?? r.explanation.text}</p>` : ''}
      ${(r.interventions ?? []).length ? html`<p class="at-hint">مربی یک تمرین ${r.interventions.some((x) => x.output?.scenario?.template === 'close_day') ? 'بستن روز' : 'ساده‌تر'} برایتان گذاشت.</p>` : ''}
    </section>`;
  }

  function practiceView() {
    const b = S.practice;
    return html`<section class="at-practice">
      <p class="at-lead">یک جمله از پیشخوان بنویسید؛ موتور آن را به عملیات و سند تبدیل می‌کند و در دفتر آزاد شما ثبت می‌کند.</p>
      <div class="at-actions"><input class="at-in at-wide" id="atLine" placeholder="مثلاً: خرید - رضایی - ۱۲٫۴۵ گرم - عیار ۷۵۰ - نقد"><input class="at-in at-s" id="atPrice" inputmode="numeric" placeholder="قیمت گرم ۷۵۰ (ریال)"><button class="btn" data-act="intent">بساز و ثبت کن</button><button class="btn ghost" data-act="audit">حسابرسی دفتر</button></div>
      <p class="at-hint" id="atOut" role="status"></p>
      ${b ? html`<div class="at-cols">
        <div><h2 class="at-h2">تراز آزمایشی ${b.trial.balanced ? '' : '(نامتوازن)'}</h2><table class="at-grid"><tbody>${b.trial.rows.map((r) => html`<tr><td>${r.name}</td><td class="num">${money(r.dr)}</td><td class="num">${money(r.cr)}</td></tr>`)}</tbody></table></div>
        <div><h2 class="at-h2">موجودی</h2><table class="at-grid"><tbody>${Object.values(b.inventory).map((x) => html`<tr><td>${x.name}</td><td>${x.measure === 'count' ? `${fa(x.qty)} عدد` : `${fa(x.fine750)} گرم ۷۵۰`}</td><td class="num">${money(x.cost)}</td></tr>`)}</tbody></table>
        <p class="at-meta">سود تحقق‌یافته ${money(b.pnl.realized)} ریال · ${fa(b.entries.length)} سند</p></div>
      </div>` : ''}
      <details class="at-open"><summary>ثبت دستی سرمایه برای شروع</summary><div class="at-actions"><input class="at-in" id="atCap" inputmode="numeric" placeholder="مبلغ (ریال)"><button class="btn ghost" data-act="capital">ثبت آورده نقدی</button></div></details>
    </section>`;
  }

  function skillsView() {
    const ps = S.home.progress.skills.filter((s) => s.parent);
    return html`<section class="at-skills">
      <ul class="at-bars">${ps.map((s) => html`<li><span>${s.fa}</span><i style="--w:${Math.round((s.mastery ?? 0) * 100)}%" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round((s.mastery ?? 0) * 100)}" aria-label="${s.fa}"></i><small>${s.attempts ? `${pct(s.mastery)} · ${fa(s.attempts)} تمرین` : '—'}</small></li>`)}</ul>
      ${S.home.progress.mistakes.length ? html`<h2 class="at-h2">اشتباه‌های تکراری</h2><ul class="at-list">${S.home.progress.mistakes.map((m) => html`<li>${m.skillFa} <small>${fa(m.n)} بار</small></li>`)}</ul>` : ''}
    </section>`;
  }

  async function refreshHome() {
    S.home = await api('/api/train/acct');
  }
  async function start(body) {
    const r = await api('/api/train/acct/scenario', { method: 'POST', body: { ...body, key: newKey() } });
    load(r.scenario);
  }
  function load(sc) {
    S.scenario = sc;
    S.entries = sc.answerKind === 'entry' ? [blankEntry()] : [];
    S.result = null;
    S.hint = null;
    S.choice = { decision: null, findings: new Set() };
    S.tab = 'case';
    draw();
    $('.at-acc', root)?.focus();
  }
  const cleanEntries = () => S.entries.map((e) => ({
    ...(e.ref ? { ref: e.ref } : {}),
    lines: e.lines.filter((l) => l.account && (num(l.dr) || num(l.cr))).map((l) => {
      const a = ACC[l.account];
      const o = { account: l.account, dr: num(l.dr), cr: num(l.cr) };
      if (a?.measure === 'weight') Object.assign(o, { grams: num(l.grams), fineness: num(l.fineness) });
      if (a?.measure === 'count') o.qty = Math.round(num(l.qty));
      if (a?.party && l.party) o.party = l.party.trim();
      return o;
    }),
  }));

  root.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.e == null) return;
    const en = S.entries[Number(t.dataset.e)];
    if (t.dataset.f === 'ref') return void (en.ref = t.value);
    en.lines[Number(t.dataset.l)][t.dataset.f] = t.value;
    if (t.dataset.f === 'account' || t.dataset.f === 'grams' || t.dataset.f === 'fineness' || t.dataset.f === 'dr' || t.dataset.f === 'cr') {
      const sel = `[data-e="${t.dataset.e}"][data-l="${t.dataset.l}"][data-f="${t.dataset.f}"]`;
      const pos = t.selectionStart;
      draw();
      const back = $(sel, root);
      back?.focus();
      if (pos != null && back?.setSelectionRange) back.setSelectionRange(pos, pos);
    }
  });
  root.addEventListener('change', (e) => {
    const t = e.target;
    if (t.id === 'atTpl' && t.value) start({ template: t.value });
    if (t.dataset.finding) (t.checked ? S.choice.findings.add(t.dataset.finding) : S.choice.findings.delete(t.dataset.finding));
  });
  root.addEventListener('click', async (e) => {
    const t = e.target.closest('button, [data-open]');
    if (!t) return;
    try {
      if (t.dataset.tab) {
        S.tab = t.dataset.tab;
        if (S.tab === 'practice' && !S.practice) S.practice = await api('/api/train/acct/practice');
        return draw();
      }
      if (t.dataset.open) return load((await api(`/api/train/acct/scenario/${t.dataset.open}`)).scenario);
      if (t.dataset.addline != null) return S.entries[Number(t.dataset.addline)].lines.push(blankLine()), draw();
      if (t.dataset.del) {
        const [i, j] = t.dataset.del.split(':').map(Number);
        S.entries[i].lines.splice(j, 1);
        if (!S.entries[i].lines.length) S.entries.splice(i, 1);
        if (!S.entries.length) S.entries.push(blankEntry());
        return draw();
      }
      if (t.dataset.decision) return (S.choice.decision = t.dataset.decision), draw();
      const act = t.dataset.act;
      if (act === 'next') return busy(t, true), await start({});
      if (act === 'addentry') return S.entries.push(blankEntry()), draw();
      if (act === 'hint') {
        S.hint = await api(`/api/train/acct/scenario/${S.scenario.rowId}/hint`, { method: 'POST', body: { level: Math.min(3, (S.hint?.level ?? 0) + 1) } });
        return draw();
      }
      if (act === 'reveal') {
        S.hint = await api(`/api/train/acct/scenario/${S.scenario.rowId}/hint`, { method: 'POST', body: { level: 4, reveal: true } });
        return draw();
      }
      if (act === 'check') {
        const sc = S.scenario;
        const answer = sc.answerKind === 'decision' ? { decision: S.choice.decision ?? 'post' } : sc.answerKind === 'findings' ? { findings: [...S.choice.findings] } : { entries: cleanEntries() };
        busy(t, true);
        S.result = await api(`/api/train/acct/scenario/${sc.rowId}/attempt`, { method: 'POST', body: { answer, key: newKey() } });
        await refreshHome();
        return draw();
      }
      if (act === 'intent') {
        const text = $('#atLine', root).value.trim();
        if (!text) return;
        const r = await api('/api/train/acct/practice/intent', { method: 'POST', body: { text, price750: num($('#atPrice', root).value) || undefined, post: true, key: newKey() } });
        S.practice = r.book;
        draw();
        $('#atOut', root).textContent = !r.understood ? r.message : r.proposal?.ok === false ? r.proposal.error : r.posted ? `ثبت شد: ${r.proposal.entry.lines.map((l) => `${ACC[l.account]?.fa} ${l.dr ? 'بد' : 'بس'} ${money(l.dr || l.cr)}`).join('، ')}` : (r.check?.errors ?? []).map((x) => x.msg).join(' ');
        return;
      }
      if (act === 'audit') {
        const r = await api('/api/train/acct/audit', { method: 'POST', body: {} });
        $('#atOut', root).textContent = `${r.message} ${(r.findings ?? []).map((f) => f.text).join(' ')}`;
        return;
      }
      if (act === 'capital') {
        const amt = Math.round(num($('#atCap', root).value));
        if (!amt) return;
        const r = await api('/api/train/acct/practice/entry', { method: 'POST', body: { key: newKey(), entry: { date: new Date().toISOString().slice(0, 10), kind: 'capital', memo: 'آورده سرمایه', lines: [{ account: '1110', dr: amt, cr: 0 }, { account: '3100', dr: 0, cr: amt }] } } });
        S.practice = r.book;
        return draw();
      }
    } catch (err) {
      toast(err.message, 'error');
      busy(t, false);
    }
  });
  draw();
}

/** The manager's view: seven quiet columns, the approvals waiting, the coach's latest reports. */
export async function trainingTeamPage(root) {
  const load = async () => {
    const [t, ap, rt] = await Promise.all([api('/api/train/acct/team'), ['manager', 'owner'].includes(store.me?.user?.role) ? api('/api/agents/approvals').catch(() => ({ approvals: [] })) : { approvals: [] }, api('/api/agents/routines')]);
    root.innerHTML = String(html`<div class="at">
      <header class="at-head"><p class="at-kicker">آموزش حسابداری</p><h1>آمادگی تیم</h1><p class="at-lead">فقط آنچه برای تصمیم لازم است.</p></header>
      <table class="at-team"><thead><tr><th>نام</th><th>آمادگی</th><th>تسلط حسابداری</th><th>مهارت ضعیف</th><th>اشتباه تکراری</th><th>تکمیل</th><th>حسابرسی</th><th>بستن روز</th></tr></thead><tbody>
      ${t.team.map((p) => html`<tr><td>${p.name}</td><td>${pct(p.readiness)}</td><td>${pct(p.mastery)}</td><td>${p.weak.join('، ') || '—'}</td><td>${p.repeated.map((m) => m.skillFa).join('، ') || '—'}</td><td>${p.completion == null ? '—' : pct(p.completion)}</td><td>${p.audit == null ? '—' : fa(p.audit)}</td><td>${p.closing == null ? '—' : fa(p.closing)}</td></tr>`)}
      </tbody></table>
      ${ap.approvals.length ? html`<h2 class="at-h2">در انتظار تأیید شما</h2><ul class="at-list">${ap.approvals.map((a) => html`<li><span>${a.summary}</span><span class="at-actions"><button class="btn" data-ap="${a.id}" data-d="approved">تأیید</button><button class="btn ghost" data-ap="${a.id}" data-d="denied">رد</button></span></li>`)}</ul>` : ''}
      ${t.reports.length ? html`<h2 class="at-h2">گزارش‌های مربی</h2>${t.reports.slice(0, 3).map((r) => html`<details class="at-open"><summary>${r.title} <small>${new Date(r.at).toLocaleDateString('fa-IR')}</small></summary><ul class="at-list">${(r.rows ?? []).map((x) => html`<li>${x.name ?? x.skill} <small>${x.action ?? (x.people != null ? `${fa(x.people)} نفر` : `آمادگی ${pct(x.readiness)}`)}</small></li>`)}</ul></details>`)}` : ''}
      <details class="at-open"><summary>روال‌ها و محرک‌ها</summary><ul class="at-list">${rt.routines.map((r) => html`<li>${r.name} <small>${r.cadence === 'daily' ? 'روزانه' : 'هفتگی'} ساعت ${fa(r.hour)}${r.enabled ? '' : ' · خاموش'}</small></li>`)}${rt.triggers.map((x) => html`<li>${x.name} <small>${fa(x.fires)} بار</small></li>`)}</ul></details>
    </div>`);
  };
  root.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-ap]');
    if (!b) return;
    busy(b, true);
    try {
      await api(`/api/agents/approvals/${b.dataset.ap}`, { method: 'POST', body: { decision: b.dataset.d } });
      toast(b.dataset.d === 'approved' ? 'تأیید شد' : 'رد شد', 'ok');
      await load();
    } catch (err) {
      toast(err.message, 'error');
      busy(b, false);
    }
  });
  await load();
}
