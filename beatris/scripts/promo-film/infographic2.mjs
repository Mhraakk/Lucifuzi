// «تذهیبِ بئاتریس» — the second infographic: an illuminated manuscript page of the whole app, built around this
// release's two new arts (email sign-in through Supabase, one-tap card payment through the counter). Every number on
// it is computed here by the app's own engines; every screen is a real one (scripts/promo-film/ig2-shots.mjs).
//   node scripts/promo-film/ig2-shots.mjs          → the screens in ./ig2
//   node scripts/promo-film/infographic2.mjs [e2e=N] → infographic2.html, then public/media/promo/beatris-infographic-2.{jpg,pdf}
import { writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as TR from '../../public/js/trade.mjs';
import * as B from '../../public/js/books.mjs';
import { MAZANEH_TO_G750 } from '../../public/js/calc.mjs';
import { qrSvg } from '../../public/js/qr.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const arg = (k) => process.argv.map((a) => a.replace(/^--/, '')).find((a) => a.startsWith(`${k}=`))?.slice(k.length + 1);
const W = 1600, H = 9220;

/* ---------------- the numbers, from the engines ---------------- */
const fa = (s) => String(s).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
const R = (v) => B.fmtMoney(v, 'rial', { unit: false });
const G3 = (g) => B.fmtG(g);
const melt = TR.tradeLine({ kind: 'melt', dir: 'in', weight: 2, fineness: 740, basis: 'mazaneh', mazaneh: 400000000 }, { round: 10000 });
const jewel = B.calcLine({ kind: 'jewel', side: 'out', weight: 10, fineness: 750, p750: 2400000, ojratMode: 'pct', ojrat: 15, profitPct: 7 }, { vatPct: 10 });
const sale = TR.tradeLine({ kind: 'coin', dir: 'out', coin: 'emami', count: 1, basis: 'count', price: 987650000 }, { round: 10000 }).value;
const cash = 7650000;
const card = TR.tradeLine({ kind: 'coin', dir: 'out', coin: 'emami', count: 2, basis: 'count', price: 987650000 }, { round: 10000 }).value;
const g750 = Math.round(400000000 / MAZANEH_TO_G750);
const e2e = arg('e2e') ? fa(Number(arg('e2e')).toLocaleString('en-US')).replace(/,/g, '٬') : null;
const qr = qrSvg('https://beatris-production-68ac.up.railway.app', { size: 210, dark: '#0a1630', light: '#f4e9cb' });

/* ---------------- ornament: written once, used everywhere ---------------- */
const rosette = (n, r1, r2, extra = '') => Array.from({ length: n }, (_, i) => `<path d="M0 ${-r1} C ${r2 * 0.32} ${-(r1 + r2) / 2} ${r2 * 0.18} ${-r2} 0 ${-r2} C ${-r2 * 0.18} ${-r2} ${-r2 * 0.32} ${-(r1 + r2) / 2} 0 ${-r1}Z" transform="rotate(${(360 / n) * i})" ${extra}/>`).join('');
const dots = (n, r, size) => Array.from({ length: n }, (_, i) => { const a = (2 * Math.PI * i) / n; return `<circle cx="${(Math.sin(a) * r).toFixed(1)}" cy="${(-Math.cos(a) * r).toFixed(1)}" r="${size}"/>`; }).join('');
const ticks = (n, r1, r2, every = 1, r3 = r2) => Array.from({ length: n }, (_, i) => { const a = (2 * Math.PI * i) / n, rr = i % every === 0 ? r3 : r2; return `<line x1="${(Math.sin(a) * r1).toFixed(1)}" y1="${(-Math.cos(a) * r1).toFixed(1)}" x2="${(Math.sin(a) * rr).toFixed(1)}" y2="${(-Math.cos(a) * rr).toFixed(1)}"/>`; }).join('');
const star = (k, r1, r2, rot = 0) => { const p = []; for (let i = 0; i < 2 * k; i++) { const a = (Math.PI * i) / k + rot, r = i % 2 ? r2 : r1; p.push(`${(Math.sin(a) * r).toFixed(1)},${(-Math.cos(a) * r).toFixed(1)}`); } return `<polygon points="${p.join(' ')}"/>`; };
/** شمسه: the sunburst medallion of a manuscript's opening page. */
const shamseh = (R0) => `<g>
  <circle r="${R0}" fill="url(#lapis)" stroke="url(#gold)" stroke-width="3"/>
  <circle r="${R0 - 12}" fill="none" stroke="url(#gold)" stroke-width="1" stroke-dasharray="2 7" stroke-linecap="round"/>
  <g fill="url(#goldSoft)" stroke="#f8e9bd" stroke-opacity=".55" stroke-width="1">${rosette(32, R0 - 120, R0 - 22)}</g>
  <g fill="none" stroke="url(#gold)" stroke-width="1.2">${rosette(16, R0 - 150, R0 - 60)}</g>
  <circle r="${R0 - 128}" fill="#06101f" stroke="url(#gold)" stroke-width="2.5"/>
  <g fill="#f8e9bd" opacity=".75">${dots(64, R0 - 6, 2.2)}</g>
</g>`;
const rose8 = (r) => `<g><circle r="${r}" fill="#0a1630" stroke="url(#gold)" stroke-width="2"/><g fill="url(#goldSoft)">${rosette(8, r * 0.18, r * 0.9)}</g><circle r="${r * 0.2}" fill="url(#gold)"/></g>`;

const DEFS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
  <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fbeec7"/><stop offset=".35" stop-color="#e2c27a"/><stop offset=".7" stop-color="#b48a43"/><stop offset="1" stop-color="#f0d99b"/></linearGradient>
  <linearGradient id="goldSoft" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4dfa6" stop-opacity=".95"/><stop offset="1" stop-color="#9c7438" stop-opacity=".85"/></linearGradient>
  <radialGradient id="lapis" cx=".5" cy=".42" r=".65"><stop offset="0" stop-color="#1b3466"/><stop offset=".7" stop-color="#0c1a38"/><stop offset="1" stop-color="#071022"/></radialGradient>
  <linearGradient id="lcd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c9f1e3"/><stop offset="1" stop-color="#8fd0bc"/></linearGradient>
  <linearGradient id="steel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2c3956"/><stop offset="1" stop-color="#121a2e"/></linearGradient>
  <pattern id="girih" width="132" height="132" patternUnits="userSpaceOnUse"><g fill="none" stroke="#d8b469" stroke-width="1">
    <rect x="38" y="38" width="56" height="56"/><rect x="38" y="38" width="56" height="56" transform="rotate(45 66 66)"/>
    <circle cx="66" cy="66" r="12"/><path d="M66 0V26M66 106V132M0 66H26M106 66H132M0 0L28 28M132 0L104 28M0 132L28 104M132 132L104 104"/></g></pattern>
  <pattern id="band" width="44" height="30" patternUnits="userSpaceOnUse"><rect width="44" height="30" fill="#0b1830"/>
    <path d="M0 15L11 4L22 15L11 26Z M22 15L33 4L44 15L33 26Z" fill="none" stroke="#d8b469" stroke-width="1.2"/>
    <circle cx="11" cy="15" r="2.6" fill="#e9cf8e"/><circle cx="33" cy="15" r="2.6" fill="#3cc4b0"/></pattern>
  <marker id="arw" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#e2c27a"/></marker>
</defs></svg>`;

/* ---------------- frames: a manuscript plate, a phone, a monitor ---------------- */
const plate = (src, { x, y, w, h, cap = '', rot = 0, fit = 'cover', pos = 'top', num = '' }) => `<figure class="plate" style="left:${x}px;top:${y}px;width:${w}px;${rot ? `transform:rotate(${rot}deg);` : ''}">
  <div class="mat" style="height:${h}px"><img src="ig2/${src}" alt="" style="object-fit:${fit};object-position:${pos}"></div>${cap ? `<figcaption>${num ? `<i>${num}</i>` : ''}${cap}</figcaption>` : ''}</figure>`;
const phone = (src, { x, y, w, cap = '', rot = 0, num = '' }) => `<figure class="phone" style="left:${x}px;top:${y}px;width:${w}px;${rot ? `transform:rotate(${rot}deg);` : ''}">
  <div class="body"><img src="ig2/${src}" alt="" style="height:${Math.round(((w - 22) * 2532) / 1170)}px"></div>${cap ? `<figcaption>${num ? `<i>${num}</i>` : ''}${cap}</figcaption>` : ''}</figure>`;
const monitor = (src, { x, y, w, cap = '', num = '' }) => `<figure class="monitor" style="left:${x}px;top:${y}px;width:${w}px">
  <div class="screen"><img src="ig2/${src}" alt="" style="height:${Math.round(((w - 24) * 1800) / 2880)}px"></div><div class="stand"></div>${cap ? `<figcaption>${num ? `<i>${num}</i>` : ''}${cap}</figcaption>` : ''}</figure>`;

/** The size a JPEG says it is, so a frame can hold any capture at its own proportions. */
const jpgSize = (file) => {
  const d = readFileSync(path.join(DIR, 'ig2', file));
  for (let i = 2; i < d.length; ) {
    const m = d[i + 1], len = d.readUInt16BE(i + 2);
    if (m === 0xc0 || m === 0xc2) return { w: d.readUInt16BE(i + 7), h: d.readUInt16BE(i + 5) };
    i += 2 + len;
  }
  throw new Error(`no size in ${file}`);
};
/** A thermal slip: the receipt as printed, torn along the bottom, with the bank's stamp on its corner. */
const slip = (src, { x, y, w, rot = 0, num = '', cap = '', stamp = '' }) => {
  const { w: iw, h: ih } = jpgSize(src);
  const pw = w - 24, ph = Math.round((pw * ih) / iw), H0 = ph + 46, tooth = 14;
  const edge = Array.from({ length: Math.ceil(w / tooth) + 1 }, (_, i) => `${Math.min(w, w - i * tooth)}px ${H0 - (i % 2 ? 0 : 11)}px`).join(',');
  return `<figure class="slip" style="left:${x}px;top:${y}px;width:${w}px;${rot ? `transform:rotate(${rot}deg);` : ''}">
  <div class="paper" style="height:${H0}px;clip-path:polygon(0 0,${w}px 0,${edge},0 ${H0 - 11}px)"><img src="ig2/${src}" alt="" style="width:${pw}px;height:${ph}px"></div>
  ${stamp ? `<svg class="stamp" style="top:${H0 - 124}px" viewBox="-70 -70 140 140" width="146" aria-hidden="true"><circle r="64" fill="rgba(251,250,246,.9)"/><g fill="none" stroke="#1f8f80" stroke-width="3"><circle r="62"/><circle r="52" stroke-width="1.4"/></g><g fill="#1f8f80">${dots(36, 57, 1.6)}</g><text y="-14" text-anchor="middle" font-family="Kufi" font-size="20" fill="#1f8f80">تأییدِ بانک</text><text y="8" text-anchor="middle" font-family="Estedad" font-weight="700" font-size="12" fill="#1f8f80">پیگیری</text><text y="26" text-anchor="middle" font-family="Estedad" font-weight="700" font-size="10" fill="#1f8f80">${stamp}</text></svg>` : ''}
  ${cap ? `<figcaption>${num ? `<i>${num}</i>` : ''}${cap}</figcaption>` : ''}</figure>`;
};

/* ---------------- illustrations ---------------- */
const terminal = (w, amount, line2 = 'کارت را بکشید · رمز را بزنید') => {
  const keys = ['۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹', '✱', '۰', '#'];
  return `<svg viewBox="0 0 300 470" width="${w}" role="img" aria-label="کارتخوان">
  <rect x="18" y="8" width="264" height="452" rx="38" fill="url(#steel)" stroke="url(#gold)" stroke-width="2"/>
  <rect x="96" y="16" width="108" height="9" rx="4.5" fill="#070c18"/>
  <rect x="42" y="44" width="216" height="134" rx="12" fill="#0b1427" stroke="#d8b469" stroke-opacity=".4"/>
  <rect x="50" y="52" width="200" height="118" rx="8" fill="url(#lcd)"/>
  <text x="150" y="80" text-anchor="middle" font-family="Estedad" font-size="14" font-weight="600" fill="#0d4a3f">مبلغ خرید</text>
  <text x="150" y="118" text-anchor="middle" font-family="Estedad" font-size="25" font-weight="800" fill="#05261f">${amount}</text>
  <text x="150" y="152" text-anchor="middle" font-family="Estedad" font-size="12.5" font-weight="600" fill="#0d4a3f">${line2}</text>
  ${keys.map((k, i) => `<g transform="translate(${62 + (i % 3) * 64} ${206 + Math.floor(i / 3) * 46})"><rect width="48" height="34" rx="9" fill="#18233c" stroke="#d8b469" stroke-opacity=".35"/><text x="24" y="23" text-anchor="middle" font-family="Estedad" font-size="16" font-weight="700" fill="#efe3c4">${k}</text></g>`).join('')}
  <g transform="translate(62 392)"><rect width="48" height="30" rx="8" fill="#b44a3a"/><rect x="64" width="48" height="30" rx="8" fill="#c9a24a"/><rect x="128" width="48" height="30" rx="8" fill="#2e9e8b"/></g>
  <rect x="70" y="440" width="160" height="10" rx="5" fill="#070c18"/>
  <g transform="translate(102 412) rotate(-4)"><rect width="96" height="58" rx="7" fill="url(#gold)" stroke="#fff3cf" stroke-opacity=".6"/><rect x="12" y="16" width="20" height="15" rx="3" fill="#8a6a2e"/><path d="M14 23H30M22 16V31" stroke="#f6e3a8" stroke-width="1"/></g>
</svg>`;
};
const envelope = (w) => `<svg viewBox="0 0 260 200" width="${w}" role="img" aria-label="ایمیل کد">
  <rect x="14" y="40" width="232" height="148" rx="12" fill="#f4e9cb" stroke="url(#gold)" stroke-width="3"/>
  <path d="M14 52L130 132L246 52" fill="none" stroke="#b48a43" stroke-width="3"/>
  <path d="M14 188L104 116M246 188L156 116" fill="none" stroke="#d9c38f" stroke-width="2"/>
  <rect x="64" y="6" width="132" height="62" rx="9" fill="#0a1630" stroke="url(#gold)" stroke-width="2"/>
  <text x="130" y="30" text-anchor="middle" font-family="Estedad" font-size="13" font-weight="700" fill="#e9cf8e">کدِ ورود</text>
  <g fill="#f8e9bd">${Array.from({ length: 6 }, (_, i) => `<circle cx="${84 + i * 18.4}" cy="50" r="5"/>`).join('')}</g>
  <g transform="translate(130 136)"><circle r="26" fill="#a3402f" stroke="#e48d74" stroke-width="2"/><g fill="#f3c0a9">${star(8, 15, 7)}</g></g>
</svg>`;
const server = (w) => `<svg viewBox="0 0 200 230" width="${w}" role="img" aria-label="سرور">
  ${[0, 1, 2].map((i) => `<g transform="translate(20 ${18 + i * 64})"><rect width="160" height="54" rx="10" fill="url(#steel)" stroke="url(#gold)" stroke-width="1.6"/>
  <circle cx="22" cy="27" r="5" fill="${i === 1 ? '#3cc4b0' : '#e2c27a'}"/><circle cx="40" cy="27" r="5" fill="#2a3756"/><rect x="62" y="20" width="80" height="5" rx="2.5" fill="#3a4a70"/><rect x="62" y="31" width="58" height="5" rx="2.5" fill="#3a4a70"/></g>`).join('')}
</svg>`;
const bridge = (w) => `<svg viewBox="0 0 200 150" width="${w}" role="img" aria-label="پل محلی">
  <path d="M10 112 Q100 18 190 112" fill="none" stroke="url(#gold)" stroke-width="7"/>
  <path d="M10 112H190" stroke="url(#gold)" stroke-width="5"/>
  ${[40, 70, 100, 130, 160].map((x) => `<line x1="${x}" y1="112" x2="${x}" y2="${112 - Math.round(94 * (1 - ((x - 100) / 90) ** 2))}" stroke="#d8b469" stroke-width="2"/>`).join('')}
  <text x="100" y="140" text-anchor="middle" font-family="Estedad" font-size="15" font-weight="700" fill="#e9cf8e" direction="ltr">127.0.0.1</text>
</svg>`;
const icon = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICONS = {
  desk: icon('<path d="M3 7h18v10H3z"/><path d="M7 7V5h10v2M8 12h8"/>'),
  card: icon('<rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="M3 10h18M7 15h4"/>'),
  book: icon('<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11"/>'),
  wave: icon('<path d="M3 17l4-6 4 3 4-8 6 9"/><path d="M3 21h18"/>'),
  learn: icon('<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c3 2 9 2 12 0v-5"/>'),
  ring: icon('<circle cx="12" cy="15" r="6"/><path d="M9 5h6l-3 4z"/>'),
  shield: icon('<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>'),
};

/* ---------------- the page ---------------- */
const pillars = [
  ['desk', 'میزِ معامله', 'آبشده، سکه، شمش، ارز'],
  ['card', 'کارتخوان', 'مبلغِ دقیق، یک ضرب'],
  ['book', 'روزنگار', 'هر رویداد، یک ردیف'],
  ['wave', 'بازار و الیوت', 'موج، فیبوناچی، سناریو'],
  ['learn', 'آموزش', 'درس، آزمون، گواهی'],
  ['ring', 'استودیو', 'جواهرِ سه‌بعدی'],
  ['shield', 'امنیت', 'ورود با ایمیل، زنجیره‌ی رویداد'],
];
// the day on the astrolabe: hour, title, line, screen; the angle each one takes on the dial (clockwise from the top)
const day = [
  ['۸:۰۰', 'قیمتِ روز', 'مظنه، سکه و ارز؛ زنده یا دستی', 'market.jpg', 8],
  ['۹:۳۰', 'میزِ معامله', 'یک خط بنویسید؛ ردیف ساخته می‌شود', 'desk-pay.jpg', 9.5],
  ['۱۱:۰۰', 'فاکتورِ رسمی', 'فرمِ استاندارد، مالیات و کدِ اصالت', 'invoice.jpg', 11],
  ['۱۳:۰۰', 'روزنگار', 'آبشده، سکه، شمش، ارز و پول، هر کدام جدا', 'daybook.jpg', 13],
  ['۱۵:۰۰', 'نبض', 'حالِ فروشگاه در یک جمله', 'pulse.jpg', 15],
  ['۱۶:۳۰', 'داشبورد', 'وضعیتِ کلیِ فروشگاه', 'dashboard.jpg', 16.5],
  ['۱۸:۰۰', 'سود و زیان', 'سودِ هر معامله، از بهای واقعی', 'pnl.jpg', 18],
  ['۱۹:۳۰', 'بستنِ روز', 'شمارش، تطبیقِ بانک و امضا', 'close.jpg', 19.5],
];
const D0 = 5720, AC = { x: 800, y: D0 + 735 }, AR = 330;
const E0 = D0 + 1480, F0 = E0 + 1290; // the workshop, then the proof
const hourAngle = (h) => 30 + (h - 8) * (300 / 11.5);
const tileW = 330, tileH = Math.round((tileW * 1800) / 2880);
const tiles = day.map((d, i) => {
  const right = i < 4; // RTL: the morning down the right side, the afternoon up the left
  const k = right ? i : 7 - i;
  const x = right ? W - 70 - tileW : 70;
  const y = D0 + 210 + k * 300;
  return { ...d, x, y, right, a: hourAngle(d[4]) };
});
const leader = (t) => {
  const rad = (t.a * Math.PI) / 180;
  const px = AC.x + Math.sin(rad) * (AR + 40), py = AC.y - Math.cos(rad) * (AR + 40);
  const tx = t.right ? t.x - 10 : t.x + tileW + 10, ty = t.y + tileH / 2;
  const mx = (px + tx) / 2;
  return `<path d="M${tx} ${ty} C ${mx} ${ty}, ${mx} ${py}, ${px.toFixed(1)} ${py.toFixed(1)}" fill="none" stroke="#e2c27a" stroke-width="1.6" stroke-dasharray="1 6" stroke-linecap="round"/>
  <circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="9" fill="#0a1630" stroke="url(#gold)" stroke-width="2.4"/><circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="3.5" fill="#3cc4b0"/>
  <circle cx="${tx}" cy="${ty}" r="5" fill="url(#gold)"/>`;
};
const hourNum = (h) => fa(h);
const astrolabe = `<svg class="abs" style="left:${AC.x - 420}px;top:${AC.y - 420}px" width="840" height="840" viewBox="-420 -420 840 840" aria-hidden="true">
  <circle r="${AR + 54}" fill="none" stroke="url(#gold)" stroke-width="1" opacity=".5"/>
  <circle r="${AR + 40}" fill="url(#lapis)" stroke="url(#gold)" stroke-width="4"/>
  <g stroke="#e2c27a" stroke-width="1.4">${ticks(96, AR + 40, AR + 30, 4, AR + 20)}</g>
  <g fill="#f1e2b8" font-family="Kufi" font-size="22" text-anchor="middle">${Array.from({ length: 12 }, (_, i) => { const h = 8 + i, a = hourAngle(h) * (Math.PI / 180); return `<text x="${(Math.sin(a) * (AR - 6)).toFixed(1)}" y="${(-Math.cos(a) * (AR - 6) + 8).toFixed(1)}">${hourNum(h)}</text>`; }).join('')}</g>
  <circle r="${AR - 34}" fill="none" stroke="url(#gold)" stroke-width="2"/>
  <g fill="none" stroke="#d8b469" stroke-opacity=".55" stroke-width="1">${Array.from({ length: 9 }, (_, i) => `<circle cy="${30 + i * 8}" r="${AR - 70 - i * 22}"/>`).join('')}</g>
  <g fill="none" stroke="#d8b469" stroke-opacity=".4">${ticks(24, 40, AR - 34)}</g>
  <g fill="url(#goldSoft)" stroke="#fbeec7" stroke-opacity=".6" stroke-width="1">${star(12, AR - 60, AR - 170, Math.PI / 12)}</g>
  <g fill="#0a1630" stroke="url(#gold)" stroke-width="2">${star(12, AR - 110, AR - 190, Math.PI / 12)}</g>
  ${tiles.map((t) => { const r = (t.a * Math.PI) / 180; return `<path d="M0 0L${(Math.sin(r) * (AR - 40)).toFixed(1)} ${(-Math.cos(r) * (AR - 40)).toFixed(1)}" stroke="#3cc4b0" stroke-width="2" stroke-opacity=".75"/>`; }).join('')}
  <circle r="128" fill="#06101f" stroke="url(#gold)" stroke-width="3"/>
  <g fill="#e2c27a" opacity=".8">${dots(48, 118, 2)}</g>
  <text y="-8" text-anchor="middle" font-family="Kufi" font-size="44" fill="#f4dfa6">روزِ گالری</text>
  <text y="34" text-anchor="middle" font-family="Estedad" font-size="17" fill="#a9b6cc">از قیمتِ صبح تا امضای شب</text>
</svg>`;

const css = `
@font-face{font-family:Estedad;src:url('../../public/fonts/estedad-arabic-var.woff2') format('woff2');font-weight:100 900}
@font-face{font-family:Estedad;src:url('../../public/fonts/estedad-latin-var.woff2') format('woff2');font-weight:100 900;unicode-range:U+0000-00FF,U+2000-206F}
@font-face{font-family:Markazi;src:url('../../public/fonts/markazi-arabic-700.woff2') format('woff2');font-weight:700}
@font-face{font-family:Markazi;src:url('../../public/fonts/markazi-arabic-600.woff2') format('woff2');font-weight:600}
@font-face{font-family:Markazi;src:url('../../public/fonts/markazi-arabic-400.woff2') format('woff2');font-weight:400}
@font-face{font-family:Markazi;src:url('../../public/fonts/markazi-latin-700.woff2') format('woff2');font-weight:700;unicode-range:U+0000-00FF}
@font-face{font-family:Markazi;src:url('../../public/fonts/markazi-latin-600.woff2') format('woff2');font-weight:600;unicode-range:U+0000-00FF}
@font-face{font-family:Kufi;src:url('../../public/fonts/reem-kufi-arabic.woff2') format('woff2');font-weight:400 700}
@font-face{font-family:Kufi;src:url('../../public/fonts/reem-kufi-latin.woff2') format('woff2');font-weight:400 700;unicode-range:U+0000-00FF}
*{box-sizing:border-box}
html,body{margin:0;background:#06101f}
body{width:${W}px;height:${H}px;position:relative;overflow:hidden;direction:rtl;font-family:Estedad,sans-serif;color:#efe6d2;
  background:radial-gradient(1200px 900px at 78% 6%,rgba(226,194,122,.16),transparent 62%),radial-gradient(1000px 800px at 10% 34%,rgba(60,196,176,.07),transparent 60%),
  radial-gradient(1300px 900px at 50% 64%,rgba(27,52,102,.55),transparent 70%),radial-gradient(1100px 700px at 85% 92%,rgba(226,194,122,.10),transparent 60%),linear-gradient(#0a1630,#071226 40%,#0a1630 70%,#06101f)}
.abs{position:absolute}
.lattice{position:absolute;inset:0;opacity:.07}
.gold{background:linear-gradient(100deg,#fbeec7 0%,#e2c27a 32%,#a97e3b 58%,#f3dc9f 80%,#c79a4e 100%);-webkit-background-clip:text;background-clip:text;color:transparent}
.kicker{font-family:Kufi;font-size:24px;color:#3cc4b0}
h2{font-family:Markazi;font-weight:700;font-size:78px;line-height:1.05;margin:0}
h3{font-family:Markazi;font-weight:700;font-size:46px;line-height:1.1;margin:0}
p{margin:0}
.lead{font-size:22px;line-height:1.95;color:#c9d2e2}
.small{font-size:17px;line-height:1.9;color:#a9b6cc}
.num{white-space:nowrap}
figure{margin:0;position:absolute}
.plate .mat{padding:10px;border-radius:14px;background:linear-gradient(145deg,#1c2c4f,#0b1630);border:1px solid rgba(226,194,122,.55);box-shadow:0 0 0 5px #0a1630,0 0 0 6px rgba(226,194,122,.35),0 28px 60px -22px rgba(0,0,0,.8);overflow:hidden}
.plate .mat img{display:block;width:100%;height:100%;border-radius:7px}
figcaption{margin-top:16px;font-size:17px;line-height:1.75;color:#d6cdb6;display:flex;gap:10px;align-items:baseline}
figcaption i{font-style:normal;flex:none;display:inline-grid;place-items:center;width:30px;height:30px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fbeec7,#b48a43);color:#0a1630;font-weight:800;font-size:15px}
.phone .body{border-radius:44px;padding:11px;background:linear-gradient(160deg,#25324f,#0b1222);box-shadow:0 0 0 2px rgba(226,194,122,.55),0 30px 70px -24px rgba(0,0,0,.85)}
.phone .body img{display:block;width:100%;border-radius:34px;object-fit:cover}
.monitor .screen{padding:12px;border-radius:16px;background:linear-gradient(160deg,#25324f,#0b1222);box-shadow:0 0 0 2px rgba(226,194,122,.5),0 30px 70px -26px rgba(0,0,0,.85)}
.monitor .screen img{display:block;width:100%;border-radius:6px}
.monitor .stand{margin:0 auto;width:30%;height:34px;background:linear-gradient(#1b2640,#0c1426);clip-path:polygon(18% 0,82% 0,100% 100%,0 100%);border-bottom:3px solid rgba(226,194,122,.6)}
.step{position:absolute;display:grid;grid-template-columns:72px 1fr;gap:20px;align-items:start}
.step b{font-family:Markazi;font-weight:700;font-size:36px;display:block;line-height:1.2;color:#f4e7c5}
.step p{font-size:19px;line-height:1.85;color:#bfc8d8;margin-top:4px}
.medal{width:72px;height:72px}
.chip{display:inline-flex;align-items:center;gap:10px;padding:10px 20px;border-radius:999px;background:rgba(10,22,48,.85);border:1px solid rgba(226,194,122,.45);font-size:18px;color:#efe3c4;white-space:nowrap}
.chip em{font-style:normal;color:#3cc4b0;font-weight:800}
.chips{position:absolute;display:flex;flex-wrap:wrap;gap:14px;justify-content:center}
.pillar{position:absolute;width:190px;height:210px;padding:22px 16px;border-radius:20px;text-align:center;background:linear-gradient(170deg,rgba(28,44,79,.92),rgba(10,22,48,.92));border:1px solid rgba(226,194,122,.4)}
.pillar svg{width:44px;height:44px;color:#e2c27a}
.pillar b{display:block;font-family:Markazi;font-weight:700;font-size:30px;margin:10px 0 4px;color:#f4e7c5}
.pillar span{font-size:15.5px;line-height:1.7;color:#a9b6cc}
.tablet{position:absolute;width:440px;padding:34px 34px 30px;border-radius:26px;color:#1c1407;background:radial-gradient(120% 90% at 20% 0%,#fbf3dc,#efdcae 70%,#e2c88f);box-shadow:0 0 0 2px #b48a43,0 0 0 9px #0a1630,0 0 0 10px rgba(226,194,122,.45),0 34px 70px -26px rgba(0,0,0,.85)}
.tablet .tk{font-family:Kufi;font-size:20px;color:#8a5a1c}
.tablet h4{font-family:Markazi;font-weight:700;font-size:44px;margin:4px 0 12px;color:#2b1d07}
.tablet .q{font-size:18.5px;line-height:1.85;color:#3b2a10;margin-bottom:12px}
.row{display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:9px 0;border-top:1px dashed rgba(122,86,30,.35);font-size:19px}
.row span{color:#5b4216}.row b{font-weight:800;color:#1c1407;white-space:nowrap}
.row.total{border-top:2px solid #8a5a1c;margin-top:4px}.row.total b{font-size:25px;color:#7a2e1c}
.rule{margin-top:14px;padding:12px 14px;border-radius:12px;background:rgba(122,86,30,.12);font-size:16.5px;line-height:1.8;color:#4a3410}
.eq{position:absolute;display:flex;align-items:center;justify-content:center;gap:26px;padding:22px 34px;border-radius:24px;background:rgba(6,16,31,.88);border:1px solid rgba(226,194,122,.5)}
.eq b{font-size:38px;font-weight:800;white-space:nowrap}.eq s{text-decoration:none;font-size:38px;color:#e2c27a}
.node{position:absolute;text-align:center}
.node p{margin-top:10px;font-size:17px;line-height:1.7;color:#d6cdb6}
.node p b{display:block;font-family:Markazi;font-weight:700;font-size:26px;color:#f4e7c5}
.tile{position:absolute;width:${tileW}px}
.tile .hr{position:absolute;top:-18px;inset-inline-start:-14px;z-index:2;padding:6px 14px;border-radius:999px;background:radial-gradient(circle at 35% 30%,#fbeec7,#b48a43);color:#0a1630;font-weight:800;font-size:18px}
.tile .mat{height:${tileH}px;padding:8px;border-radius:14px;background:linear-gradient(145deg,#1c2c4f,#0b1630);border:1px solid rgba(226,194,122,.55);box-shadow:0 0 0 4px #0a1630,0 0 0 5px rgba(226,194,122,.3),0 24px 50px -20px rgba(0,0,0,.8);overflow:hidden}
.tile .mat img{width:100%;height:100%;object-fit:cover;object-position:top;border-radius:6px;display:block}
.tile b{display:block;margin-top:14px;font-family:Markazi;font-weight:700;font-size:30px;color:#f4e7c5}
.tile span{font-size:16.5px;line-height:1.7;color:#a9b6cc}
.seal{position:absolute;width:210px;height:210px;border-radius:50%;display:grid;place-items:center;text-align:center;background:radial-gradient(circle at 40% 30%,#1d3466,#0a1630 70%);box-shadow:0 0 0 3px #b48a43,0 0 0 9px #0a1630,0 0 0 10px rgba(226,194,122,.4)}
.seal b{display:block;font-size:52px;font-weight:800;line-height:1}
.seal span{display:block;margin-top:8px;font-size:16px;line-height:1.5;color:#c9d2e2;padding:0 22px}
.ribbon{position:absolute;display:flex;flex-wrap:wrap;justify-content:center;gap:12px}
.ribbon span{padding:9px 18px;border-radius:12px;background:rgba(28,44,79,.7);border:1px solid rgba(226,194,122,.3);font-size:17px;color:#d6cdb6}
.slip{margin:0;position:absolute}
.slip .paper{background:#fbfaf6;padding:14px 12px 0;box-shadow:0 0 0 1px rgba(226,194,122,.4)}
.slip .paper img{display:block;border-radius:9px}
.slip{filter:drop-shadow(0 26px 30px rgba(0,0,0,.6))}
.slip .stamp{position:absolute;left:-54px;transform:rotate(-14deg);filter:drop-shadow(0 0 1px rgba(251,250,246,.6))}
.cartouche{position:absolute;text-align:center}
.cartouche b{display:block;font-family:Markazi;font-weight:700;font-size:40px;line-height:1.2}
.cartouche span{display:block;margin-top:6px;font-size:17.5px;line-height:1.85;color:#c9d2e2}
.divider{position:absolute;left:${W / 2 - 360}px;width:720px;height:40px}
`;

const divider = (y) => `<svg class="divider" style="top:${y}px" viewBox="-360 -20 720 40" aria-hidden="true"><path d="M-350 0H-40M40 0H350" stroke="#d8b469" stroke-width="1.5"/><path d="M-350 0L-330 -5V5Z M350 0L330 -5V5Z" fill="#e2c27a"/><g fill="#e2c27a">${star(8, 18, 8)}</g><circle r="5" fill="#3cc4b0"/></svg>`;
const medal = (n) => `<svg class="medal" viewBox="-36 -36 72 72" aria-hidden="true"><g fill="url(#goldSoft)">${rosette(12, 10, 33)}</g><circle r="21" fill="#0a1630" stroke="url(#gold)" stroke-width="2"/><text y="9" text-anchor="middle" font-family="Kufi" font-size="26" fill="#f4dfa6">${n}</text></svg>`;
const arrow = (x1, y1, x2, y2, curve = 0) => `<path d="M${x1} ${y1} Q ${(x1 + x2) / 2} ${(y1 + y2) / 2 + curve} ${x2} ${y2}" fill="none" stroke="#e2c27a" stroke-width="2.4" stroke-dasharray="2 8" stroke-linecap="round" marker-end="url(#arw)"/>`;

const html = `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>بئاتریس — تذهیب</title><style>${css}</style></head><body>
${DEFS}
<svg class="lattice" width="${W}" height="${H}" aria-hidden="true"><rect width="100%" height="100%" fill="url(#girih)"/></svg>

<!-- ============ سرلوح: the headpiece ============ -->
<svg class="abs" style="left:${W / 2 - 330}px;top:70px" width="660" height="64" viewBox="0 0 660 64" aria-hidden="true">
  <path d="M40 32 C40 6, 80 6, 110 6 H550 C580 6, 620 6, 620 32 C620 58, 580 58, 550 58 H110 C80 58, 40 58, 40 32Z" fill="#0b1830" stroke="url(#gold)" stroke-width="2"/>
  <g transform="translate(22 32)" fill="#e2c27a">${star(8, 14, 6)}</g><g transform="translate(638 32)" fill="#e2c27a">${star(8, 14, 6)}</g>
  <text x="330" y="41" text-anchor="middle" font-family="Kufi" font-size="25" fill="#f1e2b8">اینفوگرافیک · نسخه‌ی مهرِ ۱۴۰۵</text>
</svg>
<svg class="abs" style="left:70px;top:150px" width="740" height="740" viewBox="-370 -370 740 740" aria-hidden="true">${shamseh(360)}</svg>
<div class="abs" style="left:${70 + 370 - 205}px;top:${150 + 370 - 205}px;width:410px;height:410px;border-radius:50%;overflow:hidden;box-shadow:0 0 0 4px #e2c27a,0 0 60px 10px rgba(226,194,122,.25)"><img src="ig2/coin-hero.jpg" alt="" style="width:100%;height:100%;object-fit:cover;transform:scale(1.32);filter:brightness(1.6) contrast(1.14) saturate(1.22)"></div>
<p class="abs small" style="left:150px;top:900px;width:580px;text-align:center">دریکِ گردانِ صفحه‌ی ورود — سه‌بعدی، از خودِ بئاتریس</p>
<h1 class="abs gold" style="right:90px;top:150px;margin:0;font-family:Kufi;font-weight:700;font-size:210px;line-height:1.15">بئاتریس</h1>
<p class="abs" style="right:96px;top:425px;width:780px;font-family:Markazi;font-weight:600;font-size:46px;line-height:1.3;color:#f4e7c5;white-space:nowrap">دفتر، دخل و دانشِ گالریِ طلا — در یک دستگاه</p>
<p class="abs lead" style="right:96px;top:515px;width:680px">از مظنه تا مالیات، از ترازو تا کارتخوان: هر رقم را موتورِ حسابداریِ خودِ بئاتریس حساب می‌کند، نه حدس. برای مغازه‌ی سکه، آبشده، شمش و ارز، و برای گالریِ جواهر.</p>
<div class="chips" style="right:96px;top:690px;width:680px;justify-content:flex-start">
  <span class="chip"><em>تازه</em> ورود با ایمیل از Supabase</span><span class="chip"><em>تازه</em> پرداخت یک‌ضرب با کارتخوان</span><span class="chip">گوشی از راهِ پیشخوان</span>
</div>
${pillars.map(([k, t, s], i) => `<div class="pillar" style="left:${W - 70 - 190 - i * (190 + 20.6)}px;top:960px">${ICONS[k]}<b>${t}</b><span>${s}</span></div>`).join('')}

${divider(1240)}
<!-- ============ دو هنرِ تازه ============ -->
<p class="abs kicker" style="right:90px;top:1285px">تازه‌های این نسخه</p>
<h2 class="abs gold" style="right:90px;top:1320px">دو هنرِ تازه</h2>

<!-- ۱ · ورود با ایمیل -->
<h3 class="abs" style="right:90px;top:1445px;color:#f4e7c5">۱ · ورود با ایمیل — کلید، خودِ ایمیل است</h3>
${[
  ['ایمیل را بنویسید', 'نه نام کاربری، نه رمز. همین ایمیل روی گوشی، تبلت و کامپیوتر.'],
  ['Supabase می‌نویسد', 'کدِ ۶ رقمی و پیوندِ «ورود» در یک ایمیل. با Supabase فقط سرور حرف می‌زند؛ کلید فقط در Railway است.'],
  ['کد را بزنید، یا پیوند را باز کنید', 'پنج بار نادرست، کد باطل. پیوند یک‌بار مصرف است و نشستی که با رمز ساخته شده هرگز پذیرفته نمی‌شود.'],
  ['فروشگاه خودش باز می‌شود', 'ایمیلی که در چند فروشگاه حساب دارد انتخاب می‌کند؛ ایمیلِ تازه، با موبایلش، فروشگاهِ خودش را می‌سازد.'],
].map(([t, s], i) => `<div class="step" style="right:90px;top:${1560 + i * 160}px;width:700px">${medal(fa(i + 1))}<div><b>${t}</b><p>${s}</p></div></div>`).join('')}
<div class="abs" style="left:300px;top:1350px">${envelope(190)}</div>
${phone('login-email.jpg', { x: 110, y: 1520, w: 300, rot: -3, num: '۱', cap: 'ایمیل، تنها خانه‌ی صفحه' })}
${phone('login-code.jpg', { x: 470, y: 1580, w: 300, rot: 3, num: '۳', cap: 'شش خانه برای کد؛ رقمِ ششم، ورود' })}
<svg class="abs" style="left:0;top:0" width="${W}" height="${H}" aria-hidden="true">${arrow(490, 1460, 600, 1570, -30)}</svg>
<div class="chips" style="left:90px;top:2330px;width:${W - 180}px">
  <span class="chip"><em>۶۰</em> ثانیه تا کدِ بعد</span><span class="chip"><em>۵</em> کد در ساعت</span><span class="chip"><em>۱۰</em> کد در روز</span><span class="chip"><em>۵</em> تلاش برای هر کد</span><span class="chip"><em>۱۰</em> دقیقه عمرِ کد</span><span class="chip">یک ایمیل، یک حساب در هر فروشگاه</span>
</div>
${plate('vendor-email.jpg', { x: 150, y: 2420, w: W - 300, h: Math.round(((W - 320) * 504) / 2368), num: '۲', cap: 'کنسولِ ارائه‌دهنده: وضعیتِ Supabase، شمارِ ایمیل‌های ۲۴ ساعت، آخرین خطا و تنظیمِ یک‌باره‌ی قالبِ ایمیل.' })}

<!-- ۲ · پرداخت با کارتخوان -->
<h3 class="abs" style="right:90px;top:2810px;color:#f4e7c5">۲ · پرداخت با کارتخوان — مبلغ را نمی‌نویسید</h3>
<p class="abs lead" style="right:90px;top:2880px;width:1150px">مبلغِ سند معلوم که شد، یک دکمه دقیقاً «باقی‌مانده» را به کارتخوان می‌فرستد. مشتری فقط کارت می‌کشد و رمز می‌زند؛ سند پس از تأییدِ بانک، با شماره‌ی پیگیری ثبت می‌شود.</p>
${plate('desk-side.jpg', { x: W - 90 - 300, y: 3010, w: 300, h: 560, pos: 'top', num: '۱', cap: 'مبلغ معلوم است؛ دکمه همان باقی‌مانده را نشان می‌دهد' })}
${plate('card-window.jpg', { x: 790, y: 3130, w: 390, h: 166, fit: 'contain', num: '۲', cap: 'یک ضرب: دقیقاً همان مبلغ، به کارتخوان' })}
<div class="abs" style="left:470px;top:3010px">${terminal(270, `${R(sale - cash)} ریال`)}</div>
<p class="abs small" style="left:440px;top:3460px;width:330px;text-align:center"><b style="color:#f4e7c5;font-size:19px">۳ · مشتری</b><br>فقط کارت می‌کشد و رمز می‌زند</p>
${slip('receipt-full.jpg', { x: 110, y: 2985, w: 280, rot: -2, num: '۴', stamp: '۸۶۳۵۸۳۰۶۳۴۵۶', cap: 'تأییدِ بانک ← رسیدِ همین سند: نقد و کارت، با شماره‌ی پیگیری' })}
<svg class="abs" style="left:0;top:0" width="${W}" height="${H}" aria-hidden="true">${arrow(W - 410, 3250, 1190, 3210, -30)}${arrow(785, 3200, 750, 3200, 0)}${arrow(465, 3250, 385, 3280, -20)}</svg>
<div class="eq" style="left:${W / 2 - 560}px;top:3720px;width:1120px"><b class="num">${R(sale)}</b><s>−</s><b class="num">${R(cash)}</b><s>=</s><b class="num gold">${R(sale - cash)} ریال</b></div>
<p class="abs small" style="left:${W / 2 - 560}px;top:3830px;width:1120px;text-align:center">فروشِ یک سکه‌ی امامی منهای نقدِ دریافتی: مبلغِ کارتخوان از محاسبه‌ی خودِ سند می‌آید، ریالِ صحیح؛ هرگز از متنِ تایپ‌شده.</p>

<p class="abs kicker" style="right:90px;top:3920px">گوشی و تبلت، از راهِ پیشخوان</p>
${phone('phone-relay.jpg', { x: W - 90 - 210, y: 3975, w: 210 })}
<div class="node" style="left:${W - 90 - 210}px;top:${3975 + 445}px;width:210px"><p><b>گوشیِ فروشنده</b>بی‌کارتخوان؛ دکمه همان است</p></div>
<div class="node" style="left:1060px;top:4050px;width:200px">${server(170)}<p><b>سرورِ بئاتریس</b>صفِ درخواست، یکی‌یکی</p></div>
${monitor('counter-badge.jpg', { x: 560, y: 4000, w: 450 })}
<div class="node" style="left:560px;top:${4000 + 330}px;width:450px"><p><b>رایانه‌ی پیشخوان</b>«۱٬۹۷۵٬۳۰۰٬۰۰۰ ریال برای سارا موسوی — کارت را بکشید»</p></div>
<div class="node" style="left:330px;top:4080px;width:200px">${bridge(180)}<p><b>پلِ محلی</b>فقط روی همان رایانه</p></div>
<div class="node" style="left:100px;top:4000px;width:200px">${terminal(170, `${R(card)}`, 'رمز را بزنید')}<p><b>کارتخوان</b>تأیید ← برگشت به گوشی</p></div>
<svg class="abs" style="left:0;top:0" width="${W}" height="${H}" aria-hidden="true">${arrow(W - 310, 4170, 1265, 4140, -26)}${arrow(1060, 4145, 1015, 4145, 0)}${arrow(555, 4145, 530, 4145, 0)}${arrow(330, 4145, 305, 4145, 0)}</svg>
<div class="chips" style="left:90px;top:4560px;width:${W - 180}px">
  <span class="chip"><em>۸ ثانیه</em> پیشخوانِ روشن</span><span class="chip"><em>۶۰ ثانیه</em> بی‌پاسخ = منقضی</span><span class="chip"><em>۴۵ ثانیه</em> سکوت = نامعلوم، هرگز «رد»</span><span class="chip"><em>تأیید</em> نهایی، در دفترِ تطبیق</span>
</div>
<p class="abs small" style="left:90px;top:4635px;width:${W - 180}px;text-align:center">کارتخوانِ سامان (SSP1126 روی TCP ۱۱۹۷) · سداد و دیگر PSPها با برنامه‌ی رابطِ رسمی · شبیه‌ساز برای آموزش. مرورگر به پل فقط مبلغ و شناسه می‌دهد، هرگز فرمان.</p>

${divider(4720)}
<!-- ============ حسابِ زرگر ============ -->
<p class="abs kicker" style="right:90px;top:4765px">دقت</p>
<h2 class="abs gold" style="right:90px;top:4800px">حسابِ زرگر، رقم به رقم</h2>
<p class="abs lead" style="right:90px;top:4900px;width:900px">سه نمونه، با همان موتوری که سندها را می‌سازد.</p>
<div class="tablet" style="right:90px;top:4985px"><div class="tk">آبشده</div><h4>خرید با مظنه</h4>
  <p class="q">خریدِ ۲ گرم آبشده‌ی عیار ۷۴۰ روی مظنه‌ی ${R(400000000)} ریال</p>
  <div class="row"><span>معادلِ ۷۵۰</span><b class="num">${G3(melt.eq750)} گرم</b></div><div class="row"><span>مثقال</span><b class="num">${G3(melt.mesghal)}</b></div><div class="row"><span>طلای خالص</span><b class="num">${fa(String(melt.pure).replace('.', '٫'))} گرم</b></div>
  <div class="row total"><span>مبلغ</span><b class="num">${R(melt.value)} ریال</b></div>
  <div class="rule">معادلِ ۷۵۰ اول به سه رقم گرد می‌شود، بعد مبلغ.</div></div>
<div class="tablet" style="right:${90 + 440 + 40}px;top:4985px"><div class="tk">مصنوعات</div><h4>فاکتورِ جواهر</h4>
  <p class="q">فروشِ ۱۰ گرم طلای ۱۸ عیار؛ گرمی ${R(24000000)} ریال، اجرت ۱۵٪، سود ۷٪</p>
  <div class="row"><span>اصلِ طلا (معاف)</span><b class="num">${R(jewel.principal)}</b></div><div class="row"><span>اجرت</span><b class="num">${R(jewel.consfee)}</b></div><div class="row"><span>سود</span><b class="num">${R(jewel.spro)}</b></div><div class="row"><span>مالیات ۱۰٪ (اجرت و سود)</span><b class="num">${R(jewel.vat)}</b></div>
  <div class="row total"><span>جمع</span><b class="num">${R(jewel.total)} ریال</b></div>
  <div class="rule">مالیاتِ ۱۴۰۵ فقط روی اجرت و سود؛ اصلِ طلا، سنگ و سکه معاف.</div></div>
<div class="tablet" style="right:${90 + 2 * (440 + 40)}px;top:4985px"><div class="tk">مظنه</div><h4>مظنه به گرم ۷۵۰</h4>
  <p class="q">قیمتِ گرمِ ۷۵۰ = مظنه ÷ ${fa(String(MAZANEH_TO_G750).replace('.', '٫'))}</p>
  <div class="row"><span>مظنه</span><b class="num">${R(400000000)}</b></div><div class="row"><span>ضریب</span><b class="num">${fa(String(MAZANEH_TO_G750).replace('.', '٫'))}</b></div>
  <div class="row total"><span>هر گرم ۷۵۰</span><b class="num">≈ ${R(g750)} ریال</b></div>
  <div class="rule">مظنه بهای یک مثقالِ عیارِ ۷۰۵ است؛ ضریب در کد ثابت است: <span dir="ltr">MAZANEH_TO_G750</span>.</div></div>

<!-- ============ روزِ گالری ============ -->
${divider(D0 - 20)}
<p class="abs kicker" style="left:0;width:${W}px;text-align:center;top:${D0 + 30}px">یک روز</p>
<h2 class="abs gold" style="left:0;width:${W}px;text-align:center;top:${D0 + 66}px">روزِ گالری، روی اسطرلاب</h2>
${astrolabe}
<svg class="abs" style="left:0;top:0" width="${W}" height="${H}" aria-hidden="true">${tiles.map(leader).join('')}</svg>
${tiles.map((t) => `<div class="tile" style="left:${t.x}px;top:${t.y}px"><span class="hr">${t[0]}</span><div class="mat"><img src="ig2/${t[3]}" alt=""></div><b>${t[1]}</b><span>${t[2]}</span></div>`).join('')}
<svg class="abs" style="left:${W / 2 - 340}px;top:${D0 + 1175}px" width="680" height="190" viewBox="0 0 680 190" aria-hidden="true">
  <path d="M60 95 C60 22, 120 14, 170 14 H510 C560 14, 620 22, 620 95 C620 168, 560 176, 510 176 H170 C120 176, 60 168, 60 95Z" fill="rgba(6,16,31,.88)" stroke="url(#gold)" stroke-width="2.4"/>
  <path d="M76 95 C76 34, 126 26, 172 26 H508 C554 26, 604 34, 604 95 C604 156, 554 164, 508 164 H172 C126 164, 76 156, 76 95Z" fill="none" stroke="#d8b469" stroke-opacity=".5" stroke-width="1" stroke-dasharray="2 6" stroke-linecap="round"/>
  <g transform="translate(30 95)" fill="#e2c27a">${star(8, 18, 8)}</g><g transform="translate(650 95)" fill="#e2c27a">${star(8, 18, 8)}</g>
  <g transform="translate(30 95)"><circle r="4" fill="#3cc4b0"/></g><g transform="translate(650 95)"><circle r="4" fill="#3cc4b0"/></g>
</svg>
<div class="cartouche" style="left:${W / 2 - 250}px;top:${D0 + 1208}px;width:500px"><b class="gold">هشت ایستگاه، یک دفتر</b><span>هر کاشی صفحه‌ای واقعی از همان حسابِ نمایشی است؛ هر رقمِ روز را روزنگار پیدا می‌کند.</span></div>

<!-- ============ کارگاه، آزمایشگاه، سند ============ -->
${divider(E0)}
<p class="abs kicker" style="right:90px;top:${E0 + 45}px">هنر و دانش</p>
<h2 class="abs gold" style="right:90px;top:${E0 + 80}px">کارگاه، آزمایشگاه، سند</h2>
${plate('studio.jpg', { x: W - 90 - 760, y: E0 + 210, w: 760, h: 475, cap: 'استودیوی سه‌بعدیِ جواهر: انگشتر، نگین و رکاب؛ وزن و برآورد پیش از ساخت' })}
${plate('coinlab.jpg', { x: 90, y: E0 + 210, w: 610, h: 380, cap: 'آزمایشگاهِ سکه: پلمب، وکیوم و احتمالِ اصالت' })}
${plate('elliott.jpg', { x: 90, y: E0 + 720, w: 610, h: 380, cap: 'استودیوی الیوت: شمارشِ موج، فیبوناچی و سناریو با احتمال' })}
${plate('invoice-a4.jpg', { x: W - 90 - 470, y: E0 + 810, w: 470, h: 330, pos: 'top', cap: 'صورتحسابِ رسمی با QR و کدِ اصالت' })}
${phone('verify.jpg', { x: W - 90 - 470 - 40 - 200, y: E0 + 780, w: 200, cap: 'استعلامِ اصالت؛ نامِ خریدار پیدا نیست' })}

<!-- ============ ته‌لوح: proof and colophon ============ -->
${divider(F0)}
<div class="seal" style="right:120px;top:${F0 + 70}px"><div><b class="gold num">۴۱۲</b><span>آزمونِ واحد، همه سبز</span></div></div>
<div class="seal" style="right:${120 + 250}px;top:${F0 + 70}px"><div><b class="gold num">${e2e ?? '—'}</b><span>بررسیِ مرورگر از سرتاسرِ اپ</span></div></div>
<div class="seal" style="right:${120 + 500}px;top:${F0 + 70}px"><div><b class="gold num">۱۹</b><span>بررسیِ کارتخوان در مرورگر</span></div></div>
<div class="seal" style="right:${120 + 750}px;top:${F0 + 70}px"><div><b class="gold num">۱۴</b><span>آزمونِ Supabase و پیشخوان</span></div></div>
<div class="abs" style="left:110px;top:${F0 + 55}px;width:250px;text-align:center"><div style="display:inline-block;padding:12px;border-radius:18px;background:#f4e9cb;box-shadow:0 0 0 3px #b48a43">${qr}</div><p class="small" style="margin-top:10px">بئاتریس را باز کنید</p></div>
<div class="ribbon" style="left:90px;top:${F0 + 370}px;width:${W - 180}px"><span>Node 22</span><span>بی‌وابستگیِ اجرایی</span><span>پایگاهِ جدا برای هر فروشگاه</span><span>وب‌اپ و نصب‌کننده‌ی ویندوز</span><span>پلِ کارتخوان</span><span>Supabase Auth</span><span>Railway</span></div>
<p class="abs small" style="left:90px;top:${F0 + 450}px;width:${W - 180}px;text-align:center">تصویرها از حسابِ نمایشیِ «خانه سکه و شمش تاج» گرفته شده‌اند؛ همه‌ی عددها خروجیِ خودِ نرم‌افزارند.</p>

<svg class="abs" style="left:${W / 2 - 300}px;top:${F0 + 525}px" width="600" height="80" viewBox="-300 -40 600 80" aria-hidden="true">
  <path d="M-290 0H-60M60 0H290" stroke="#d8b469" stroke-width="1" stroke-dasharray="1 7" stroke-linecap="round"/>
  <g transform="translate(-44 0)" fill="#e2c27a">${star(8, 9, 4)}</g><g transform="translate(44 0)" fill="#e2c27a">${star(8, 9, 4)}</g>
  <g>${rose8(26)}</g>
</svg>
<p class="abs" style="left:0;width:${W}px;text-align:center;top:${F0 + 600}px;font-family:Kufi;font-size:22px;color:#c9a95f">تمّت · ساخته‌شده با دقتِ ترازوی زرگر</p>

<!-- ============ the illuminated frame, last so it sits on top ============ -->
<svg class="abs" style="left:0;top:0;pointer-events:none" width="${W}" height="${H}" aria-hidden="true">
  <rect x="22" y="22" width="${W - 44}" height="${H - 44}" fill="none" stroke="url(#gold)" stroke-width="3"/>
  <rect x="30" y="30" width="${W - 60}" height="${H - 60}" fill="none" stroke="#e2c27a" stroke-width="1"/>
  <path d="M36 36H${W - 36}V${H - 36}H36Z M66 66V${H - 66}H${W - 66}V66Z" fill="url(#band)" fill-rule="evenodd"/>
  <rect x="66" y="66" width="${W - 132}" height="${H - 132}" fill="none" stroke="url(#gold)" stroke-width="2"/>
  ${[[51, 51], [W - 51, 51], [51, H - 51], [W - 51, H - 51]].map(([x, y]) => `<g transform="translate(${x} ${y})">${rose8(30)}</g>`).join('')}
  ${[0.25, 0.5, 0.75].map((f) => `<g transform="translate(51 ${Math.round(H * f)})">${rose8(20)}</g><g transform="translate(${W - 51} ${Math.round(H * f)})">${rose8(20)}</g>`).join('')}
</svg>
</body></html>`;

const file = path.join(DIR, 'infographic2.html');
writeFileSync(file, html);
console.log('wrote', file, `${(html.length / 1024).toFixed(0)} KB`);

if (!process.argv.includes('--html')) {
  const pw = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
  const { chromium } = pw.default ?? pw;
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: Number(arg('scale') ?? 1.75) }); // 9220 × 1.75 stays under Chromium's 16384-px capture limit
  await p.goto(pathToFileURL(file).href);
  await p.evaluate(() => document.fonts.ready);
  await p.waitForFunction(() => [...document.images].every((i) => i.complete), null, { timeout: 30000 });
  await p.waitForTimeout(500);
  const out = arg('out') ?? path.join(DIR, '..', '..', 'public', 'media', 'promo');
  const jpg = path.join(out, arg('name') ?? 'beatris-infographic-2.jpg');
  await p.screenshot({ path: jpg, type: 'jpeg', quality: 90, clip: { x: 0, y: 0, width: W, height: H } });
  if (!arg('name')) await p.pdf({ path: path.join(out, 'beatris-infographic-2.pdf'), width: `${W}px`, height: `${H}px`, printBackground: true, pageRanges: '1' });
  await b.close();
  console.log('rendered', jpg);
}
