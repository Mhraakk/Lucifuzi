// مربی استودیو (spec 0016): one quiet page over the studio agents — write a brief and get a measured design, change it
// in a sentence, ask for a lighter piece, and practise studio exercises with levelled hints. The agents and the engine
// work behind it; the page shows only the stage, the weight, what must be fixed before making, and the aesthetic notes
// kept apart. No engine words for the trainee.
import { html, api, fa, $, toast, busy } from '../core.mjs';

const newKey = () => `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
const g = (x) => `${(Math.round(Number(x) * 100) / 100).toLocaleString('fa-IR', { maximumFractionDigits: 2 })} گرم`;
const pct = (x) => `${fa(Math.round((x ?? 0) * 100))}٪`;
const num = (s) => Number(String(s ?? '').replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٫,]/g, '.'));
const SEV = { critical: 'پیش از ساخت حتماً', high: 'پیش از ساخت', warning: 'بهتر است', info: 'نکته' };
const COMP = { cad: 'طراحی و CAD', setting: 'سنگ‌گذاری', manufacturing: 'ساخت' };
const CRIT = { size: 'سایز', weight: 'وزن', structure: 'استحکام', setting: 'نگین‌گذاری', width: 'پهنا', keepSetting: 'سر نگین دست‌نخورده', keepShoulders: 'شانه‌ها دست‌نخورده' };
const FIELDS = [
  ['innerDiameter', 'قطر داخلی'], ['widthTop', 'پهنای بالا'], ['widthBottom', 'پهنای کف'], ['thickTop', 'ضخامت بالا'], ['thickBottom', 'ضخامت کف'], ['headHeight', 'ارتفاع سر', true],
];
const SET_FIELDS = [['prongCount', 'تعداد چنگ'], ['prongDiameterMm', 'قطر چنگ'], ['seatDepthMm', 'عمق نشیمن']];

function findingsView(f) {
  const must = f.engineering ?? [];
  const notes = f.aesthetic ?? [];
  return html`
    <h2 class="at-h2">پیش از ساخت</h2>
    ${must.length ? html`<ul class="sc-find">${must.map((x) => html`<li class="sev-${x.severity}"><b>${x.titleFa}</b> <small>${SEV[x.severity]}</small><p>${x.explanationFa}${x.recommendedActionFa ? html` <span class="sc-act">${x.recommendedActionFa}</span>` : ''}</p></li>`)}</ul>` : html`<p class="at-quiet">مانعی برای ساخت دیده نشد.</p>`}
    ${notes.length ? html`<h2 class="at-h2">یادداشت‌های زیبایی</h2><ul class="sc-find sc-soft">${notes.map((x) => html`<li><b>${x.titleFa}</b><p>${x.explanationFa}</p></li>`)}</ul>` : ''}`;
}

export async function studioCoachPage(root) {
  const S = { home: null, tab: 'design', design: null, exercise: null, last: null, hint: null };
  root.innerHTML = String(html`<div class="at" aria-busy="true"><p class="at-quiet">در حال آماده شدن…</p></div>`);
  const load = async () => (S.home = await api('/api/studio/coach'));
  await load();

  function draw() {
    const p = S.home.progress;
    root.innerHTML = String(html`<div class="at sc">
      <header class="at-head">
        <p class="at-kicker">استودیوی طراحی</p>
        <h1>از بریف تا مدلی که ساخته می‌شود.</h1>
        <p class="at-lead">بریف را بنویسید؛ طرح ساخته و اندازه‌گیری می‌شود، وزن و ایرادهای ساخت جدا از نکته‌های زیبایی گفته می‌شود. تغییرها را با یک جمله بخواهید.</p>
        <p class="at-meta">آمادگی استودیو <b>${pct(p.readiness)}</b>${p.open.length ? html` · ${fa(p.open.length)} تمرین باز` : ''}</p>
        <nav class="at-tabs" role="tablist">
          <button role="tab" aria-selected="${S.tab === 'design'}" data-tab="design">طراحی</button>
          <button role="tab" aria-selected="${S.tab === 'practice'}" data-tab="practice">تمرین</button>
          <button role="tab" aria-selected="${S.tab === 'skills'}" data-tab="skills">مهارت‌ها</button>
        </nav>
      </header>
      ${S.tab === 'design' ? designView() : S.tab === 'practice' ? practiceView() : skillsView()}
    </div>`);
  }

  function designView() {
    const d = S.design;
    return html`<section class="sc-brief">
      <label class="sc-label" for="scBrief">بریف</label>
      <textarea id="scBrief" class="at-in sc-text" rows="3" placeholder="مثلاً: انگشتر ۱۸ عیار مینیمال، سنگ بیضی ۸×۶، زیر ۴ گرم، مناسب ریخته‌گری، سایز ۵۴"></textarea>
      <div class="at-actions"><button class="btn" data-act="design">ساخت طرح</button></div>
      ${d ? resultView(d) : projectsView()}
    </section>`;
  }
  function projectsView() {
    const ps = S.home.projects;
    return ps.length ? html`<h2 class="at-h2">طرح‌های شما</h2><ul class="at-list">${ps.map((p) => html`<li><button class="at-link" data-project="${p.id}">${p.title}</button><small>نسخه ${fa(p.version)}${p.weightG != null ? ` · ${g(p.weightG)}` : ''}${p.status === 'final' ? ' · نهایی' : ''}</small></li>`)}</ul>` : '';
  }
  function resultView(d) {
    return html`<article class="at-case sc-result">
      <p class="at-kicker">${d.title ?? 'طرح'} · نسخه ${fa(d.version)}</p>
      <p class="sc-weight">${g(d.weight)}${d.previousWeight != null ? html` <small>پیش‌تر ${g(d.previousWeight)}</small>` : ''}</p>
      <p class="sc-summary">${d.summary}</p>
      ${d.optimization && !d.optimization.feasible ? html`<p class="at-off">${d.optimization.reason}</p>` : ''}
      ${findingsView(d.findings)}
      <h2 class="at-h2">تغییر با یک جمله</h2>
      <div class="at-actions"><input id="scEdit" class="at-in at-wide" placeholder="مثلاً: ضخامت کف ۱٫۲ · وزن را ۰٫۳ گرم کم کن · سایز ۵۶"><button class="btn ghost" data-act="edit">اعمال</button></div>
      <div class="at-actions">
        <button class="at-link" data-act="stl">دریافت فایل آزمایشی STL</button>
        <button class="at-link" data-act="prod">درخواست فایل تولید (با تأیید مدیر)</button>
        <button class="at-link" data-act="back">طرح‌های دیگر</button>
      </div>
    </article>`;
  }

  function practiceView() {
    const ex = S.exercise;
    if (!ex) {
      const open = S.home.progress.open;
      return html`<section class="at-start">
        <p>پیشنهاد: <b>${S.home.skills.find((s) => s.id === S.home.progress.next.skillId)?.fa ?? ''}</b></p>
        <div class="at-actions"><button class="btn" data-act="exNext">تمرین پیشنهادی</button>
        <select class="at-in" id="scEx" aria-label="یا یک تمرین"><option value="">یا یک تمرین خاص…</option>${S.home.exercises.map((e) => html`<option value="${e.id}">${e.title} · ${e.difficultyFa}</option>`)}</select></div>
        ${open.length ? html`<h2 class="at-h2">تمرین‌های باز</h2><ul class="at-list">${open.map((o) => html`<li><button class="at-link" data-exrow="${o.id}">${S.home.exercises.find((e) => e.id === o.exerciseId)?.title ?? o.exerciseId}</button><small>${o.assignedBy === 'routine' ? 'تمرین روزانه' : o.assignedBy === 'trigger' ? 'تمرین جبرانی' : ''}</small></li>`)}</ul>` : ''}
      </section>`;
    }
    const p = ex.params;
    const a = S.last;
    return html`<article class="at-case">
      <p class="at-kicker">${ex.title}</p>
      <p class="at-context">${ex.brief}</p>
      <fieldset class="at-entry"><legend>پارامترهای طرح (میلی‌متر)</legend>
        <div class="sc-grid">
          ${FIELDS.filter(([k, , opt]) => !opt || p[k] != null).map(([k, label]) => html`<label>${label}<input class="at-in num" data-p="${k}" inputmode="decimal" value="${fa(p[k])}"></label>`)}
          ${p.setting ? SET_FIELDS.map(([k, label]) => html`<label>${label}<input class="at-in num" data-s="${k}" inputmode="decimal" value="${p.setting[k] == null ? '' : fa(p.setting[k])}"></label>`) : ''}
        </div>
      </fieldset>
      <div class="at-actions"><button class="btn" data-act="check">بررسی</button>
        <button class="btn ghost" data-act="hint">راهنمایی${S.hint ? ` (${fa(S.hint.level)})` : ''}</button>
        <button class="at-link" data-act="exBack">تمرین‌های دیگر</button></div>
      ${S.hint ? html`<p class="sc-hint">${S.hint.text}</p>` : ''}
      ${a ? html`<section class="sc-assess">
        <p class="sc-weight">${a.passed ? html`<span class="at-ok">قبول</span>` : html`<span class="at-off">هنوز نه</span>`} · ${pct(a.assessment.score)} · ${g(a.weight || 0)}</p>
        <ul class="sc-crit">${Object.entries(a.assessment.criteria).map(([k, v]) => html`<li class="${v === 1 ? 'at-ok' : 'at-off'}">${CRIT[k] ?? k}</li>`)}</ul>
        ${findingsView({ engineering: a.assessment.findings.filter((f) => f.kind !== 'aesthetic'), aesthetic: [] })}
      </section>` : ''}
    </article>`;
  }

  function skillsView() {
    const by = {};
    for (const s of S.home.progress.skills) {
      const meta = S.home.skills.find((x) => x.id === s.id);
      (by[meta?.competency ?? 'cad'] ??= []).push(s);
    }
    return html`${Object.entries(by).map(([c, list]) => html`<h2 class="at-h2">${COMP[c] ?? c}</h2><ul class="at-list">${list.map((s) => html`<li><span>${s.fa}</span><small>${s.attempts ? pct(s.mastery) : 'تمرین نشده'}</small></li>`)}</ul>`)}`;
  }

  const readParams = () => {
    const p = structuredClone(S.exercise.params);
    p.material ??= 'au18y';
    for (const el of root.querySelectorAll('[data-p]')) p[el.dataset.p] = num(el.value);
    for (const el of root.querySelectorAll('[data-s]')) if (el.value.trim()) p.setting[el.dataset.s] = el.dataset.s === 'prongCount' ? Math.round(num(el.value)) : num(el.value);
    return p;
  };
  const openExercise = async (id) => {
    S.exercise = (await api(`/api/studio/exercises/${id}`)).exercise;
    S.last = null;
    S.hint = null;
    draw();
  };
  const download = (name, text, mime) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: mime }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  root.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-tab],[data-act],[data-project],[data-exrow]');
    if (!t) return;
    try {
      if (t.dataset.tab) {
        S.tab = t.dataset.tab;
        return draw();
      }
      if (t.dataset.project) {
        const r = await api(`/api/studio/projects/${t.dataset.project}`);
        const m = r.latest;
        const f = m?.findings ?? [];
        S.design = { projectId: r.project.id, title: r.project.title, version: r.project.version, weight: m?.weightG ?? 0, summary: '', findings: { engineering: f.filter((x) => x.kind !== 'aesthetic'), aesthetic: f.filter((x) => x.kind === 'aesthetic') } };
        return draw();
      }
      if (t.dataset.exrow) return openExercise(t.dataset.exrow);
      const act = t.dataset.act;
      busy(t, true);
      if (act === 'design') {
        const brief = $('#scBrief', root).value.trim();
        if (brief.length < 4) throw new Error('بریف طرح را بنویسید.');
        const r = await api('/api/studio/design', { method: 'POST', body: { brief, key: newKey() } });
        S.design = { ...r, title: brief.slice(0, 60) };
        await load();
      } else if (act === 'edit') {
        const text = $('#scEdit', root).value.trim();
        if (!text) throw new Error('تغییری که می‌خواهید را بنویسید.');
        const r = await api(`/api/studio/projects/${S.design.projectId}/edit`, { method: 'POST', body: { text, key: newKey() } });
        if (r.understood === false) toast(r.message, 'info');
        else S.design = { ...r, title: S.design.title };
      } else if (act === 'stl' || act === 'prod') {
        const r = await api(`/api/studio/projects/${S.design.projectId}/export`, { method: 'POST', body: { format: 'stl', production: act === 'prod', key: newKey() } });
        if (r.exported) download(`beatris-${S.design.projectId}.stl`, r.text, r.mime);
        else toast(r.message ?? 'درخواست برای تأیید مدیر فرستاده شد.', 'info');
      } else if (act === 'back') {
        S.design = null;
      } else if (act === 'exNext' || act === 'exStart') {
        const id = $('#scEx', root)?.value;
        const r = await api('/api/studio/exercises', { method: 'POST', body: { ...(id ? { exerciseId: id } : {}), key: newKey() } });
        await load();
        S.exercise = r.exercise;
        S.last = null;
        S.hint = null;
      } else if (act === 'check') {
        const r = await api(`/api/studio/exercises/${S.exercise.id}/attempt`, { method: 'POST', body: { params: readParams(), key: newKey() } });
        S.last = r;
        S.exercise = r.exercise;
        for (const i of r.interventions ?? []) if (i.output?.message) toast(i.output.message, 'info');
        await load();
      } else if (act === 'hint') {
        S.hint = await api(`/api/studio/exercises/${S.exercise.id}/hint`, { method: 'POST', body: { level: Math.min(3, (S.hint?.level ?? 0) + 1) } });
      } else if (act === 'exBack') {
        S.exercise = null;
      }
      draw();
    } catch (err) {
      toast(err.message, 'error');
      busy(t, false);
    }
  });
  draw();
}

/** The admin's view of the agent platform: agents and their permissions, run statistics, recent runs and their steps. */
export async function agentsDebugPage(root) {
  const S = { reg: null, runs: [], open: null };
  const load = async () => {
    [S.reg, S.runs] = await Promise.all([api('/api/agents/registry'), api('/api/agents/runs?all=1').then((r) => r.runs)]);
  };
  const STATE = { queued: 'در صف', running: 'در حال اجرا', waiting_for_tool: 'منتظر عامل دیگر', waiting_for_approval: 'منتظر تأیید', paused: 'متوقف', completed: 'تمام', failed: 'ناموفق', cancelled: 'لغو' };
  function draw() {
    const st = S.reg.stats;
    root.innerHTML = String(html`<div class="at">
      <header class="at-head"><p class="at-kicker">مدیر سیستم</p><h1>عامل‌ها</h1>
        <p class="at-meta">${fa(S.reg.agents.length)} عامل · ${fa(st.delegations)} واگذاری · ${fa(st.pendingApprovals)} تأیید در انتظار</p></header>
      <h2 class="at-h2">رجیستری</h2>
      <div class="sc-scroll" tabindex="0"><table class="at-journal"><thead><tr><th>عامل</th><th>دامنه</th><th>ابزارها</th><th>تأیید</th><th>حافظه</th><th>واگذاری به</th></tr></thead><tbody>
        ${S.reg.agents.map((a) => html`<tr><td>${a.fa}<br><small dir="ltr">${a.id}</small></td><td>${a.domain}</td><td dir="ltr"><small>${a.allowedTools.join(', ')}</small></td><td dir="ltr"><small>${a.approvalPolicy.join(', ') || '—'}</small></td><td dir="ltr"><small>${a.memoryScopes.join(', ')}</small></td><td dir="ltr"><small>${a.canDelegateTo.join(', ') || '—'}</small></td></tr>`)}
      </tbody></table></div>
      <h2 class="at-h2">ابزارها</h2>
      <div class="sc-scroll" tabindex="0"><table class="at-journal"><thead><tr><th>ابزار</th><th>فراخوانی</th><th>خطا</th><th>تلاش دوباره</th><th>میانگین (ms)</th></tr></thead><tbody>
        ${st.tools.map((t) => html`<tr><td dir="ltr">${t.tool}</td><td>${fa(t.calls)}</td><td>${fa(t.failed ?? 0)}</td><td>${fa(t.retries ?? 0)}</td><td>${t.ms == null ? '—' : fa(t.ms)}</td></tr>`)}
      </tbody></table></div>
      <h2 class="at-h2">اجراهای اخیر</h2>
      <ul class="at-list">${S.runs.map((r) => html`<li><button class="at-link" data-run="${r.id}">${r.agentName}${r.depth ? ` ← ${r.chain.slice(0, -1).join(' ← ')}` : ''}</button><small>${STATE[r.status] ?? r.status} · ${r.origin} · ${fa(r.steps.length)} گام</small></li>`)}</ul>
      ${S.open ? html`<section class="sc-run"><h2 class="at-h2" dir="ltr">${S.open.run.id}</h2>
        <ol class="sc-steps">${S.open.run.steps.map((s) => html`<li><span dir="ltr">${s.tool}</span> <small>${s.status}${s.attempts > 1 ? ` · ${fa(s.attempts)} تلاش` : ''}${s.ms != null ? ` · ${fa(s.ms)}ms` : ''}${s.error ? ` · ${s.error}` : ''}</small></li>`)}</ol>
        <details class="at-open"><summary>رویدادها (${fa(S.open.events.length)})</summary><ol dir="ltr">${S.open.events.map((e) => html`<li>${e.type}</li>`)}</ol></details></section>` : ''}
    </div>`);
  }
  try {
    await load();
  } catch (err) {
    root.innerHTML = String(html`<div class="at"><p class="at-quiet">${err.message}</p></div>`);
    return;
  }
  draw();
  root.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-run]');
    if (!b) return;
    try {
      S.open = await api(`/api/agents/runs/${b.dataset.run}`);
      draw();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}
