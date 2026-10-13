// «کالبد یک دفتر طلا» (spec 0031): the teaser's clock. seek(t) is a pure function of t — it poses the app's own two
// figures (mounted with { manual: true }), moves the camera and sets the captions — so any frame can be rendered again
// and come out the same. render.mjs screenshots every frame; the mix places the sounds at window.SFX.
import { mountOneChain } from '/js/figures/onechain.mjs';
import { mountWave } from '/js/figures/wave.mjs';
import { EXAMPLES } from '/js/figures/wave-model.mjs';

const DUR = 30;
const $ = (s) => document.querySelector(s);
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (x) => {
  x = clamp(x);
  return x * x * (3 - 2 * x);
};
const span = (t, a, b) => smooth((t - a) / (b - a));
const lerp = (a, b, u) => a + (b - a) * u;

/* ---------------- the machines ---------------- */
const chain = await mountOneChain($('#chain'), { manual: true });
const rig = mountWave($('#rig'), { manual: true });
const chainStage = $('#chainStage'), rigStage = $('#rigStage');
const chainSvg = $('#chain svg');
// every top-level piece of the drawing, back to front: the build-up reveals them in painter's order
const PARTS = [...chainSvg.children].filter((el) => !['title', 'desc', 'style', 'defs'].includes(el.tagName));
for (const el of PARTS) {
  el.__lines = el.matches('path.iso-line') ? [el] : [...el.querySelectorAll('path.iso-line')];
  el.__fills = el.matches('.iso-dots, text, .iso-halo') ? [el] : [...el.querySelectorAll('.iso-fill, .iso-shade, .iso-top, .iso-halo, .iso-dots, text')];
  for (const p of el.__lines) p.setAttribute('pathLength', '1');
}
let revealed = true;
/** The build-up at u (0…1): each piece draws its lines, then fills in, in the order the figure is painted. */
function reveal(u) {
  const n = PARTS.length;
  PARTS.forEach((el, k) => {
    const p = clamp((u - (k / n) * 0.7) / 0.3);
    const draw = smooth(p / 0.6), fill = smooth((p - 0.35) / 0.65);
    for (const l of el.__lines) (l.style.strokeDasharray = '1 1'), (l.style.strokeDashoffset = String(1 - draw));
    for (const f of el.__fills) f.style.opacity = String(fill);
  });
  revealed = false;
}
function settle() {
  if (revealed) return;
  for (const el of PARTS) {
    for (const l of el.__lines) (l.style.strokeDasharray = ''), (l.style.strokeDashoffset = '');
    for (const f of el.__fills) f.style.opacity = '';
  }
  revealed = true;
}
// the camera's push-in: the press, measured once with the camera at rest, comes to the right third of the frame
const stageBox = chainStage.getBoundingClientRect();
const pressBox = chainSvg.querySelector('[data-part="die"]').getBoundingClientRect();
const PUSH = 1.3;
const pressX = pressBox.left + pressBox.width / 2 - (stageBox.left + stageBox.width / 2);
const pressY = pressBox.top + pressBox.height / 2 - (stageBox.top + stageBox.height * 0.46);
const pushTo = { x: -pressX * PUSH + 300, y: -pressY * PUSH + 60 };

/* ---------------- words on screen ---------------- */
const CAPS = [
  [0.8, 4.4, 'کالبد یک دفتر طلا', 'بئاتریس · حسابداری طلافروشی', true],
  [4.9, 8.3, 'هر رویداد طلافروشی، یک سند'],
  [8.5, 11.7, 'هر سند، یک حلقه در یک زنجیره'],
  [12.0, 14.4, 'خرید، فروش، ذوب، ارز و چک', 'همه از یک راه'],
  [14.8, 17.4, 'پنج بخش، یک دفتر', 'روزنگار هر بخش از همین زنجیره پر می‌شود'],
  [17.9, 20.2, 'دست ببرید، از همان حلقه پیدا می‌شود'],
  [21.6, 24.8, 'الیوت، با همان دقت', 'قاعده‌ها را موتور شمارش خود اپ می‌سنجد'],
  [25.0, 27.0, 'هر قاعده الیوت، یک ضامن'],
];
const cap = $('#cap'), capB = cap.querySelector('b'), capS = cap.querySelector('small');
function caption(t) {
  const c = CAPS.find(([a, b]) => t >= a - 0.01 && t < b + 0.35);
  if (!c) return (cap.style.opacity = '0');
  const [a, b, title, sub = '', hero = false] = c;
  const inn = span(t, a, a + 0.4), out = 1 - span(t, b, b + 0.32);
  if (capB.textContent !== title) capB.textContent = title;
  if (capS.textContent !== sub) capS.textContent = sub;
  capS.hidden = !sub;
  cap.classList.toggle('tz-hero', hero);
  cap.style.opacity = String(Math.min(inn, out));
  cap.style.transform = `translateY(${(1 - inn) * 18 - (1 - out) * 8}px)`;
}

/* ---------------- the clock ---------------- */
const SECS = ['melt', 'coin', 'bar', 'fx', 'money'];
const pose = (a, b, u) => a.map((p, i) => lerp(p, b[i], smooth(u)));
const VALID = EXAMPLES.find((e) => e.id === 'valid').prices, DEEP = EXAMPLES.find((e) => e.id === 'deep2').prices;
let tampered = false;
async function seek(t) {
  t = clamp(t, 0, DUR);
  // the chain machine: built, then run at reading speed, then fast, then its sections, then a tampered link
  const tour = t < 4.6 ? 0 : t < 11.8 ? t - 4.6 : t < 14.6 ? lerp(7.2, 28.9, smooth((t - 11.8) / 2.8)) : 28.9;
  const wantTamper = t >= 17.9 && t < 21.4;
  if (wantTamper !== tampered) {
    await chain.tamper(wantTamper);
    tampered = wantTamper;
  }
  chain.seek(tour);
  chain.show(t >= 14.6 && t < 17.6 ? SECS[Math.min(4, Math.floor((t - 14.6) / 0.6))] : null);
  if (t < 4.6) reveal(t / 4.4);
  else settle();
  // the camera never stands still (a small coin rolling is not motion enough to read): a slow dolly while the drawing
  // builds, in on the press while it stamps and then along the rail after the coins, out for the speed ramp, a drift
  const lin = (a, b) => clamp((t - a) / (b - a));
  const zin = span(t, 4.6, 6.2) * (1 - span(t, 11.8, 13.4));
  const follow = smooth((t - 5.4) / 8);
  const drift = lin(13.4, 20.4) * 0.035;
  const s = lerp(0.955, 1, lin(0, 6.2)) * lerp(1, PUSH + 0.05 * follow, zin) + drift;
  const away = span(t, 20.4, 21.4);
  chainStage.style.transform = `translate(${lerp(0, pushTo.x + 150 * follow, zin) - away * 260}px, ${lerp(0, pushTo.y, zin)}px) scale(${s})`;
  chainStage.style.opacity = String(1 - away);
  chainStage.style.visibility = away >= 1 ? 'hidden' : 'visible';
  // the wave rig: the textbook count, wave 2 pulled below its start (the stop on rail 2 turns red), and back
  const rigIn = span(t, 20.4, 21.4), rigOut = span(t, 27.2, 27.8);
  const prices = t < 22.6 ? VALID : t < 23.4 ? pose(VALID, DEEP, (t - 22.6) / 0.8) : t < 25.0 ? DEEP : t < 25.8 ? pose(DEEP, VALID, (t - 25.0) / 0.8) : VALID;
  const v = rig.pose(prices, [90, 180]);
  const glide = lin(20.4, 27.8);
  rigStage.style.transform = `translate(${(1 - rigIn) * 260 - 60 * glide}px, 20px) scale(${1.18 + 0.07 * glide})`;
  rigStage.style.opacity = String(rigIn * (1 - rigOut));
  rigStage.style.visibility = rigIn <= 0 || rigOut >= 1 ? 'hidden' : 'visible';
  // the corners of the plate, and the machine's own readout
  const onRig = t >= 20.9;
  const corners = span(t, 2.8, 3.6) * (1 - Math.abs(span(t, 20.4, 20.9) - span(t, 20.9, 21.4))) * (1 - span(t, 27.2, 27.6));
  $('#cFig').textContent = onRig ? 'شکل ۲' : 'شکل ۱';
  $('#cTitle').textContent = onRig ? 'دستگاه موج' : 'یک زنجیره، پنج بخش';
  for (const el of [$('#cFig'), $('#cTitle')]) el.style.opacity = String(corners);
  const read = $('#read');
  read.textContent = (onRig ? $('#rig [data-readout]') : $('#chain [data-readout]'))?.textContent ?? '';
  read.toggleAttribute('data-bad', onRig ? !v.valid : tampered);
  read.style.opacity = String((t < 4.6 ? 0 : span(t, 4.6, 5.2)) * (1 - Math.abs(span(t, 20.4, 20.9) - span(t, 20.9, 21.4))) * (1 - span(t, 27.2, 27.6)));
  caption(t);
  // the end card, and the black at both ends
  const end = $('#end');
  const e = span(t, 27.6, 28.4);
  end.style.opacity = String(e);
  end.style.transform = `translateY(${(1 - e) * 24}px)`;
  end.querySelector('.tz-cta').style.transform = `scale(${0.94 + 0.06 * span(t, 28.0, 28.6)})`;
  $('#veil').style.opacity = String(Math.max(1 - span(t, 0, 0.6), span(t, 29.4, 30)));
}

// where the sounds go (spec 0031): a soft whoosh at each scene change, a dry hit on each stamp at reading speed and on
// the tampered link, a shimmer under the end card
window.SFX = [
  { t: 4.45, kind: 'whoosh', gain: -8 },
  { t: 5.42, kind: 'hit', gain: -6 },
  { t: 9.02, kind: 'hit', gain: -6 },
  { t: 11.7, kind: 'whoosh', gain: -9 },
  { t: 17.9, kind: 'hit', gain: -4 },
  { t: 20.35, kind: 'whoosh', gain: -8 },
  { t: 22.95, kind: 'hit', gain: -9 },
  { t: 27.5, kind: 'shimmer', gain: -10 },
];
window.DUR = DUR;
window.seek = seek;
await document.fonts.ready;
await seek(0);
window.READY = true;
