// ویترین سکه‌ها (spec 0041): an editorial hero over an endless 3D carousel of the real coin photographs, after the
// «Momentum Slider» design the owner sent (motionin.design), rebuilt without React, GSAP or a CDN. Each card is one face of
// a coin with today's price; a card opens into a window with the coin's facts, its photo credit and the way into the 3D
// lab. The hero's pill sets a price alert for the coin in the middle, kept with the market page's alerts on this device.
// The arithmetic (ring, pose, glide, flight) lives in ../showcasemath.mjs and is tested in tests/showcase.test.mjs.
import { html, raw, esc, api, toast, $, $$ } from '../core.mjs';
import { T, G, unitName, booksPrefs, prefs } from '../bk.mjs';
import { COIN_TYPES } from '../coins.mjs';
import { parseNum } from '../calc.mjs';
import { still } from '../motion.mjs';
import * as M from '../showcasemath.mjs';

const ALERTS = 'beatris.market.alerts'; // the market page's own list (pages/market.mjs)
const SIDE = { obv: 'جلو', rev: 'پشت' };
const BELL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9a6 6 0 1 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9"/><path d="M10 19.5a2 2 0 0 0 4 0"/></svg>';
const ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>';
const CHEV = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d === 'next' ? 'm14.5 6-6 6 6 6' : 'm9.5 6 6 6-6 6'}"/></svg>`;
const CROSS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>';
const BLUR = [
  [6, 1.05, 20],
  [14, 1.08, 16],
  [28, 1.12, 12],
  [50, 1.16, 8],
];

const load = () => {
  try {
    const a = JSON.parse(localStorage.getItem(ALERTS) ?? '[]');
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
};
const keep = (a) => {
  try {
    localStorage.setItem(ALERTS, JSON.stringify(a));
    return true;
  } catch {
    return false;
  }
};
/** A motion token as milliseconds (0 under «حرکت کمتر») and a curve token, read from the stylesheet (spec 0039). */
const tok = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const ms = (n) => (still() ? 0 : parseFloat(tok(n)) || 0);
const curve = (n) => tok(n) || 'ease';

export async function coinShowcasePage(root) {
  const [lib, board] = await Promise.all([api('/api/coin-photos').catch(() => ({ items: [] })), api('/api/market').catch(() => null), booksPrefs().catch(() => null)]);
  const items = [...lib.items.filter((i) => i.builtin), ...lib.items.filter((i) => !i.builtin)];
  const faces = items.flatMap((it) =>
    ['obv', 'rev']
      .filter((s) => it.sides?.[s])
      .map((side) => {
        const s = it.sides[side];
        const lab = M.readLabel(it.label);
        const type = COIN_TYPES[it.coin];
        return { item: it.id, coin: it.coin, side, src: s.s || s.c2 || s.c4, face: s.label || '', credit: it.credit ?? {}, title: lab.title || type?.label || 'سکه', design: lab.design, note: lab.note, type };
      }),
  );
  const toman = (coin) => {
    const it = board?.items?.find((x) => x.id === M.COIN_SYMBOL[coin]);
    return it && !it.empty && Number.isFinite(it.c) ? it.c : NaN;
  };
  const money = (t) => (Number.isFinite(t) ? T(Math.round(t * 10)) : '—');
  const sample = !!board?.sample;

  root.innerHTML = String(html`<section class="cs" aria-labelledby="csTitle">
    <div class="cs-bg" aria-hidden="true"></div>
    <header class="cs-hero">
      <p class="cs-mark" data-reveal style="--i:0"><i class="cs-rule"></i><b>ش ۰۱</b><i class="cs-dot"></i><span>سکه‌های بانک مرکزی · عکس واقعی</span><i class="cs-rule"></i></p>
      <h1 class="cs-title" id="csTitle" data-reveal style="--i:4">سکه را <em>از نزدیک</em> ببینید</h1>
      <p class="cs-sub" data-reveal style="--i:8">هر دو روی سکه‌های بازار، با عکس واقعی. کارتی را بزنید تا وزن، عیار، قطر و <b>قیمت امروز</b> آن را ببینید، یا آن را در آزمایشگاه سه‌بعدی بچرخانید.</p>
      <form class="cs-pill" id="csAlert" data-reveal style="--i:12" autocomplete="off">
        <span class="cs-bell">${raw(BELL)}</span>
        <input name="price" inputmode="decimal" dir="rtl" aria-describedby="csCap">
        <button type="submit">خبرم کن ${raw(ARROW)}</button>
      </form>
      <p class="cs-cap" id="csCap" data-reveal style="--i:12"><b>هشدار قیمت</b> برای سکه‌ی وسط · روی همین دستگاه · صفحه‌ی بازار بررسی‌اش می‌کند</p>
    </header>
    <div class="cs-stage" id="csStage" role="region" aria-roledescription="کاروسل" aria-label="سکه‌ها، جلو و پشت" tabindex="0">
      <div class="cs-ring" id="csRing"></div>
      ${faces.length ? html`<button type="button" class="cs-pause" id="csPause" aria-pressed="false">توقف حرکت</button>` : html`<p class="cs-empty">هنوز عکسی از سکه ثبت نشده است.</p>`}
    </div>
    <p class="cs-note">${sample ? 'قیمت‌ها نمونه‌ی آموزشی‌اند؛ منبع قیمت زنده وصل نیست.' : `قیمت‌ها از ${board?.source?.label ?? 'بازار'} · ${unitName()}`} · عکس‌ها: ویکی‌مدیا کامنز (CC BY-SA 4.0) و عکس‌های فروشگاه</p>
  </section>`);
  if (!faces.length) return;

  const stage = $('#csStage', root);
  const ring = $('#csRing', root);
  const pill = $('#csAlert', root);
  const dir = getComputedStyle(stage).direction === 'rtl' ? -1 : 1;
  const unique = faces.length;
  let vw = 0, size = M.cardSize(innerWidth), d = M.depth(innerWidth), stride = size.w + M.GAP, n = 0, cards = [];

  const cardHtml = (c, k, copy) => {
    const t = toman(c.coin);
    const name = `${c.title}، ${SIDE[c.side]}${c.design ? `، ${c.design}` : ''}${Number.isFinite(t) ? `، قیمت امروز ${money(t)} ${unitName()}` : ''}`;
    const coin = `<img class="cs-coin" src="${esc(c.src)}" alt="" draggable="false" decoding="async" loading="${k < 4 ? 'eager' : 'lazy'}">`;
    return `<button type="button" class="cs-card" data-k="${k}"${copy ? ' tabindex="-1" aria-hidden="true"' : ''} aria-label="${esc(name)}"><span class="cs-face">${coin}${BLUR.map(([b, s, top]) => `<span class="cs-blur" style="--b:${b}px;--s:${s};--top:${top}%">${coin}</span>`).join('')}<span class="cs-tint"></span><span class="cs-shine"></span><span class="cs-tag">${SIDE[c.side]}</span><span class="cs-foot"><span class="cs-name"><b>${esc(c.title)}</b><small>${esc([c.design, c.note].filter(Boolean).join(' · '))}</small></span><span class="cs-price">${esc(money(t))}${Number.isFinite(t) ? `<small>${esc(unitName())}</small>` : ''}</span></span></span></button>`;
  };
  const st = { scroll: 0, velocity: 0, target: null, held: false, settled: true };
  function build() {
    vw = stage.clientWidth || innerWidth;
    // the room the first screen leaves under the hero (less the tab bar where there is one): a short screen gets a smaller card
    const room = innerHeight - (innerWidth < 900 ? parseFloat(tok('--nav-h')) || 0 : 0) - (stage.getBoundingClientRect().top + scrollY);
    size = M.cardSize(innerWidth, room);
    d = M.depth(innerWidth);
    const was = stride;
    stride = size.w + M.GAP;
    if (stride !== was) {
      // the same card stays in the middle when the cards change size
      st.scroll *= stride / was;
      if (st.target != null) st.target *= stride / was;
    }
    stage.style.setProperty('--cw', `${size.w}px`);
    stage.style.setProperty('--ch', `${size.h}px`);
    stage.style.setProperty('--persp', `${d.perspective}px`);
    const want = unique * M.copiesFor(unique, stride, vw);
    if (want !== n) {
      n = want;
      ring.innerHTML = Array.from({ length: n }, (_, k) => cardHtml(faces[k % unique], k, k >= unique)).join('');
      cards = $$('.cs-card', ring);
    }
  }
  build();

  /* ---------------- the ring ---------------- */
  const t0 = performance.now();
  let raf = 0, last = 0, lastInput = t0, entered = still(), visible = true, hover = false, within = false, paused = false, modal = null, driftTimer = 0, center = -1, alive = true;
  const drifting = () => !paused && !still() && !hover && !within && !modal && visible && !document.hidden;
  const live = () => visible && !document.hidden;
  const input = () => (lastInput = performance.now());

  function place(now) {
    const t = (now - t0) / 1000;
    let done = true;
    for (const el of cards) {
      const logical = M.ringPos(+el.dataset.k, stride, st.scroll, n);
      const x = dir * logical;
      const p = M.pose(x, vw, d);
      const e = entered ? null : M.entrance(logical / stride, t);
      if (e && !e.done) done = false;
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${(e?.y ?? 0).toFixed(1)}px, ${p.z.toFixed(1)}px) rotateY(${p.rotateY.toFixed(2)}deg) scale(${(p.scale * (e?.scale ?? 1)).toFixed(4)})`;
      el.style.zIndex = p.zIndex;
      el.style.opacity = e ? e.opacity.toFixed(3) : '';
      el.classList.toggle('near', p.near);
      el.style.setProperty('--shine', `${((x / vw) * 200).toFixed(1)}px`);
    }
    if (!entered && done) entered = true;
    const c = M.centerIndex(st.scroll, stride, n) % unique;
    if (c !== center) {
      center = c;
      const f = faces[c];
      pill.elements.price.placeholder = `قیمت هدف ${f.title} (${unitName()})`;
      pill.elements.price.setAttribute('aria-label', `قیمت هدف برای ${f.title} به ${unitName()}`);
    }
  }
  function frame(now) {
    raf = 0;
    const dt = last ? now - last : 1000 / 60;
    last = now;
    const idle = now - lastInput;
    const auto = drifting();
    Object.assign(st, M.step(st, dt, { stride, idle, auto }));
    place(now);
    const moving = drag.on || st.target != null || !entered || (!st.held && (!st.settled || (auto && idle >= M.PHYS.autoDelay)));
    if (moving && live()) raf = requestAnimationFrame(frame);
    else {
      last = 0;
      clearTimeout(driftTimer);
      if (auto && idle < M.PHYS.autoDelay) driftTimer = setTimeout(kick, M.PHYS.autoDelay - idle + 20);
    }
  }
  function kick() {
    if (alive && !raf && live()) raf = requestAnimationFrame(frame);
  }
  /** Bring ring card k (or its nearest copy around the ring) to the middle. */
  const centerOn = (k) => {
    const base = k * stride, total = n * stride;
    st.target = base + Math.round((st.scroll - base) / total) * total;
    kick();
  };

  /* ---------------- hand, trackpad, keys ---------------- */
  const drag = { on: false, down: false, id: 0, x0: 0, y0: 0, x: 0, t: 0, v: 0, axis: '', moved: 0 };
  let swallow = false;
  stage.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || modal || e.target.closest('.cs-pause')) return;
    Object.assign(drag, { down: true, on: false, id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, t: e.timeStamp, v: 0, axis: '', moved: 0 });
    input();
  });
  stage.addEventListener('pointermove', (e) => {
    if (!drag.down || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
    if (!drag.axis) {
      if (Math.hypot(dx, dy) < 8) return;
      drag.axis = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'x' : 'y';
      if (drag.axis === 'y') return void (drag.down = false); // a page scroll, not ours
      stage.setPointerCapture?.(e.pointerId);
      Object.assign(drag, { on: true });
      Object.assign(st, { held: true, velocity: 0, target: null });
      stage.classList.add('drag');
    }
    const step = e.clientX - drag.x, dt = Math.max(1, e.timeStamp - drag.t);
    st.scroll -= step * dir;
    drag.v = ((-step * dir) / dt) * (1000 / 60);
    Object.assign(drag, { x: e.clientX, t: e.timeStamp, moved: Math.max(drag.moved, Math.abs(dx)) });
    input();
    kick();
  });
  const release = (e) => {
    if (!drag.down || e.pointerId !== drag.id) return;
    drag.down = false;
    if (!drag.on) return;
    drag.on = false;
    stage.classList.remove('drag');
    Object.assign(st, { held: !!modal, velocity: e.type === 'pointerup' && e.timeStamp - drag.t < 80 ? drag.v : 0 });
    if (drag.moved > 5) swallow = true; // the click that ends a drag opens nothing
    input();
    kick();
  };
  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', release);
  stage.addEventListener(
    'click',
    (e) => {
      if (!swallow) return;
      swallow = false;
      e.stopPropagation();
      e.preventDefault();
    },
    true,
  );
  stage.addEventListener(
    'wheel',
    (e) => {
      if (modal || Math.abs(e.deltaX) <= Math.abs(e.deltaY) * 0.5) return; // a vertical wheel scrolls the page
      e.preventDefault();
      Object.assign(st, { scroll: st.scroll + e.deltaX * dir, velocity: 0, target: null });
      input();
      kick();
    },
    { passive: false },
  );
  stage.addEventListener('keydown', (e) => {
    const by = { ArrowLeft: -dir, ArrowRight: dir }[e.key];
    if (!by || modal || e.target.closest('.cs-pause')) return;
    e.preventDefault();
    st.target = M.nearest(st.target ?? st.scroll, stride) + by * stride;
    st.velocity = 0;
    input();
    kick();
  });
  stage.addEventListener('pointerenter', (e) => e.pointerType === 'mouse' && (hover = true));
  stage.addEventListener('pointerleave', () => ((hover = false), input(), kick()));
  stage.addEventListener('focusin', (e) => {
    within = true;
    const c = e.target.closest('.cs-card');
    if (c && c.matches(':focus-visible')) centerOn(+c.dataset.k);
  });
  stage.addEventListener('focusout', (e) => {
    if (!stage.contains(e.relatedTarget)) (within = false), input(), kick();
  });
  $('#csPause', root).addEventListener('click', (e) => {
    paused = !paused;
    e.currentTarget.setAttribute('aria-pressed', String(paused));
    e.currentTarget.textContent = paused ? 'ادامه‌ی حرکت' : 'توقف حرکت';
    input();
    kick();
  });
  ring.addEventListener('click', (e) => {
    const c = e.target.closest('.cs-card');
    if (c) open(+c.dataset.k, c);
  });

  /* ---------------- the alert pill ---------------- */
  pill.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = faces[center];
    const symbol = M.COIN_SYMBOL[f.coin];
    if (!symbol) return toast('این سکه در بازار قیمت جدا ندارد.', 'error');
    const a = M.alertFor(symbol, parseNum(pill.elements.price.value), toman(f.coin), prefs.money);
    if (!a) return toast('قیمت هدف را به عدد بنویسید.', 'error');
    if (!keep([...load(), { ...a, created: new Date().toISOString() }])) return toast('این مرورگر اجازه‌ی نگه داشتن هشدار نمی‌دهد.', 'error');
    pill.elements.price.value = '';
    toast(`هشدار ${f.title} ${a.op === 'above' ? 'بالاتر از' : 'پایین‌تر از'} ${money(a.price)} ${unitName()} ثبت شد؛ صفحه‌ی بازار بررسی‌اش می‌کند.`, 'ok');
  });

  /* ---------------- the window ---------------- */
  function layout() {
    const w = innerWidth, h = innerHeight, phone = w < 768;
    // a phone keeps a row under the window for «قبلی» and «بعدی» (44 px and a 12 px gap)
    const row = phone ? 56 : 0;
    const bw = Math.min(w - 48, 896), bh = phone ? Math.min(h - 32 - row, h * 0.86) : Math.min(h - 64, 560);
    return { phone, box: { x: (w - bw) / 2, y: (h - bh - row) / 2, w: bw, h: bh } };
  }
  function place2(m) {
    const { phone, box } = layout();
    Object.assign(m.box.style, { left: `${box.x}px`, top: `${box.y}px`, width: `${box.w}px`, height: `${box.h}px` });
    m.layer.classList.toggle('phone', phone);
    const p = m.pic.getBoundingClientRect();
    m.coin.style.setProperty('--d', `${Math.round(Math.min(p.width, p.height) * 0.86)}px`);
    if (!phone) {
      const r = m.box.getBoundingClientRect();
      // «قبلی» on the reading side (the right in RTL), «بعدی» on the other
      const [before, after] = dir === -1 ? [m.next, m.prev] : [m.prev, m.next];
      Object.assign(before.style, { left: `${r.left - 52}px`, top: `${r.top + r.height / 2 - 20}px` });
      Object.assign(after.style, { left: `${r.right + 12}px`, top: `${r.top + r.height / 2 - 20}px` });
    } else for (const b of [m.prev, m.next]) Object.assign(b.style, { left: '', top: `${box.y + box.h + 12}px` });
    return p;
  }
  const facts = (f) => {
    const c = f.type;
    return c ? [`عیار ${c.fineness.toLocaleString('fa-IR')}`, `${G(c.weight)} گرم`, `قطر ${c.diameter.toLocaleString('fa-IR')} میلی‌متر`, `طلای خالص ${G(c.pure)} گرم`, c.legal ? 'ضرب رسمی بانک مرکزی' : 'غیررسمی'] : [];
  };
  const info = (f) => {
    const t = toman(f.coin);
    return html`<p class="cs-kicker" data-mr>${[SIDE[f.side], f.design, f.note].filter(Boolean).join(' · ')}</p>
      <h2 class="cs-mtitle" id="csmTitle" data-mr>${f.title}</h2>
      <p class="cs-desc" data-mr>${f.face || f.type?.label || ''}${f.type ? ` ${f.type.years ? `· ${f.type.years}` : ''}` : ''}</p>
      <hr class="cs-rule2" data-mr>
      <p class="cs-mprice" data-mr><b>${money(t)}</b> <small>${Number.isFinite(t) ? `${unitName()} · قیمت امروز${sample ? ' (نمونه)' : ''}` : 'قیمت امروز در دست نیست'}</small></p>
      <div class="cs-acts" data-mr><a class="btn" href="/coins?mode=real&item=${encodeURIComponent(f.item)}" data-link>مشاهده‌ی سه‌بعدی</a><a class="btn ghost" href="/coins?coin=${encodeURIComponent(f.coin)}" data-link>آزمون اصالت</a></div>
      <ul class="cs-badges" data-mr>${facts(f).map((x) => html`<li>${x}</li>`)}</ul>
      ${f.credit?.text ? html`<p class="cs-credit" data-mr>${f.credit.text}${f.credit.url ? html` · <a href="${f.credit.url}" target="_blank" rel="noopener noreferrer">منبع</a>` : ''}</p>` : ''}`;
  };
  const shown = (m) => faces[m.k % unique];
  function fill(m) {
    const f = shown(m);
    m.coin.src = f.src;
    m.tag.textContent = SIDE[f.side];
    m.info.innerHTML = String(info(f));
  }
  function open(k, from) {
    if (modal) return;
    const rect = from.getBoundingClientRect();
    Object.assign(st, { held: true, velocity: 0 });
    centerOn(k); // behind the window the ring finishes on this card (held, a settle would stop where it was)
    const layer = document.createElement('div');
    layer.className = 'cs-layer';
    layer.innerHTML = `<div class="cs-veil"></div><div class="cs-box" role="dialog" aria-modal="true" aria-labelledby="csmTitle" tabindex="-1"><div class="cs-pic"><img class="cs-mcoin" alt="" draggable="false"><span class="cs-tag"></span></div><div class="cs-info"></div><button type="button" class="cs-x" aria-label="بستن">${CROSS}</button></div><button type="button" class="cs-nav cs-prev" aria-label="سکه‌ی قبلی">${CHEV('prev')}</button><button type="button" class="cs-nav cs-next" aria-label="سکه‌ی بعدی">${CHEV('next')}</button>`;
    const m = (modal = { k, layer, veil: $('.cs-veil', layer), box: $('.cs-box', layer), pic: $('.cs-pic', layer), coin: $('.cs-mcoin', layer), tag: $('.cs-pic .cs-tag', layer), info: $('.cs-info', layer), prev: $('.cs-prev', layer), next: $('.cs-next', layer), busy: false });
    fill(m);
    document.body.append(layer);
    document.documentElement.classList.add('cs-open');
    place2(m);
    m.box.focus({ preventScroll: true });
    const dur = ms('--t-reveal'), io = curve('--ease-in-out'), out = curve('--ease-out');
    if (!dur) return;
    // the card's frame opens into the window; its coin flies to the window's picture, one even scale, never stretched
    const b = m.box.getBoundingClientRect();
    const cut = (r) => `inset(${Math.max(0, r.top - b.top)}px ${Math.max(0, b.right - r.right)}px ${Math.max(0, b.bottom - r.bottom)}px ${Math.max(0, r.left - b.left)}px round 16px)`;
    m.veil.animate([{ opacity: 0 }, { opacity: 1 }], { duration: dur * 0.8, easing: out, fill: 'backwards' });
    m.box.animate([{ clipPath: cut(rect) }, { clipPath: 'inset(0px 0px 0px 0px round 16px)' }], { duration: dur, easing: io, fill: 'backwards' });
    // the coin flies above the window (inside it, the picture's frame would cut it), then hands over to the window's own
    const card = from.querySelector('.cs-face > .cs-coin').getBoundingClientRect(), coin = m.coin.getBoundingClientRect();
    const f = M.flipFrom({ x: card.left, y: card.top, w: card.width, h: card.height }, { x: coin.left, y: coin.top, w: coin.width, h: coin.height });
    const fly = m.coin.cloneNode();
    fly.className = 'cs-fly';
    Object.assign(fly.style, { left: `${coin.left}px`, top: `${coin.top}px`, width: `${coin.width}px`, height: `${coin.height}px` });
    m.layer.append(fly);
    m.coin.style.visibility = 'hidden';
    m.busy = true; // «قبلی» and «بعدی» wait for the coin to land
    const land = () => {
      m.coin.style.visibility = '';
      fly.remove();
      m.busy = false;
    };
    fly.animate([{ transform: `translate(${f.dx}px, ${f.dy}px) scale(${f.s})` }, { transform: 'none' }], { duration: dur, easing: io }).finished.then(land, land);
    m.info.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ms('--t-panel'), delay: ms('--t-panel'), easing: out, fill: 'backwards' });
    $$('[data-mr]', m.info).forEach((el, i) => el.animate([{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'none' }], { duration: ms('--t-panel'), delay: dur * 0.8 + i * ms('--t-stagger'), easing: out, fill: 'backwards' }));
    for (const [el, x] of [[m.prev, 20 * dir], [m.next, -20 * dir]]) el.animate([{ opacity: 0, transform: `translateX(${x}px)` }, { opacity: 1, transform: 'none' }], { duration: ms('--t-panel'), delay: dur, easing: out, fill: 'backwards' });
  }
  async function go(by) {
    const m = modal;
    if (!m || m.busy) return;
    m.busy = true;
    const out = ms('--t-hover'), inn = ms('--t-panel'), e = curve('--ease-out');
    await Promise.all([m.info.animate([{ opacity: 1 }, { opacity: 0 }], { duration: out, easing: e, fill: 'forwards' }).finished, m.coin.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(1.03)' }], { duration: out, easing: e, fill: 'forwards' }).finished]).catch(() => {});
    m.k = (((m.k + by) % n) + n) % n;
    centerOn(m.k); // the carousel behind follows
    fill(m);
    m.coin.getAnimations().forEach((a) => a.cancel());
    m.info.getAnimations().forEach((a) => a.cancel());
    m.coin.animate([{ opacity: 0, transform: 'scale(1.03)' }, { opacity: 1, transform: 'none' }], { duration: inn, easing: e, fill: 'backwards' });
    m.info.animate([{ opacity: 0 }, { opacity: 1 }], { duration: inn, delay: ms('--t-stagger') * 3, easing: e, fill: 'backwards' });
    $$('[data-mr]', m.info).forEach((el, i) => el.animate([{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'none' }], { duration: inn, delay: ms('--t-stagger') * (3 + i), easing: e, fill: 'backwards' }));
    m.busy = false;
  }
  function close() {
    const m = modal;
    if (!m) return;
    modal = null;
    const dur = ms('--t-panel'), e = curve('--ease-exit');
    const done = () => {
      m.layer.remove();
      document.documentElement.classList.remove('cs-open');
      st.held = false;
      // focus goes to the card now in the middle («قبلی» and «بعدی» brought the ring along), or to the carousel when that
      // card is a copy
      const back = cards[m.k];
      (back?.isConnected && !back.hasAttribute('aria-hidden') ? back : stage).focus({ preventScroll: true });
      input();
      kick();
    };
    for (const b of [m.prev, m.next]) b.style.opacity = '0';
    if (!dur) return done();
    m.box.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(0.95)' }], { duration: dur, easing: e, fill: 'forwards' });
    m.veil.animate([{ opacity: 1 }, { opacity: 0 }], { duration: dur, delay: ms('--t-stagger') * 2, easing: e, fill: 'forwards' }).finished.then(done, done);
  }
  document.addEventListener('click', onDocClick);
  function onDocClick(e) {
    const m = modal;
    if (!m || !m.layer.contains(e.target)) return;
    if (e.target === m.veil || e.target.closest('.cs-x') || e.target.closest('[data-link]')) return close();
    if (e.target.closest('.cs-prev')) go(-1);
    else if (e.target.closest('.cs-next')) go(1);
  }
  function onKey(e) {
    const m = modal;
    if (!m) return;
    if (e.key === 'Escape') return e.preventDefault(), close();
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') return e.preventDefault(), go(e.key === 'ArrowLeft' ? -dir : dir);
    if (e.key !== 'Tab') return;
    // the window keeps focus inside itself
    const list = [...$$('a[href], button, input', m.box), m.prev, m.next].filter((x) => !x.disabled && x.offsetParent !== null);
    if (!list.length) return;
    const i = list.indexOf(document.activeElement);
    if (e.shiftKey && i <= 0) e.preventDefault(), list.at(-1).focus();
    else if (!e.shiftKey && (i === -1 || i === list.length - 1)) e.preventDefault(), list[0].focus();
  }
  document.addEventListener('keydown', onKey);

  /* ---------------- the page around it ---------------- */
  const io = new IntersectionObserver(([en]) => {
    visible = en.isIntersecting;
    if (visible) kick();
  });
  io.observe(stage);
  const onVis = () => !document.hidden && kick();
  document.addEventListener('visibilitychange', onVis);
  let resizeT = 0;
  const onResize = () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => {
      build();
      if (modal) place2(modal);
      kick();
    }, 120);
  };
  addEventListener('resize', onResize);
  document.fonts?.ready.then(() => alive && onResize()); // the hero's height settles once its fonts are in
  place(performance.now()); // in place before the first frame: no stack of cards in the middle for a moment
  kick();

  return () => {
    alive = false;
    cancelAnimationFrame(raf);
    clearTimeout(driftTimer);
    clearTimeout(resizeT);
    io.disconnect();
    removeEventListener('resize', onResize);
    document.removeEventListener('visibilitychange', onVis);
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('click', onDocClick);
    modal?.layer.remove();
    document.documentElement.classList.remove('cs-open');
    modal = null;
  };
}
