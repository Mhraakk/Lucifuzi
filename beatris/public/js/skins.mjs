// پوسته‌ها (spec 0014): light and dark skins named after the stones and metals set beside gold. The accent is always
// a metal; green, red and blue keep their meaning (in/profit, out/loss, information) in every skin. A skin sits on
// one of the two finished layers of app.css — «آرام» for the dark skins, «روز» for the light ones — and only
// changes tokens, so no page has to know which skin is on. Data and pure functions here (tested in node); the DOM
// part runs only when called.

/** The tokens the three original skins take from app.css, repeated for the picker's miniatures (checked by tests). */
const CSS_PREVIEW = {
  calm: { vault: '#13171c', vault2: '#191e24', vault3: '#20262e', hair2: 'rgba(255, 255, 255, 0.12)', bone: '#e6e2d9', dust: '#a1a7ae', gold: '#d5b36f', molten: ['#f1e1b8', '#dcbd7f', '#b99659'], turq: '#76c6ad', carn: '#e2866f' },
  classic: { vault: '#0d0b08', vault2: '#14110c', vault3: '#1d1911', hair2: 'rgba(227, 184, 98, 0.26)', bone: '#efe6d2', dust: '#a2977f', gold: '#e3b862', molten: ['#fff3cf', '#d9a441', '#a8761f'], turq: '#5cc2b1', carn: '#d0613f' },
  day: { vault: '#f7f4ef', vault2: '#ffffff', vault3: '#faf7f2', hair2: 'rgba(60, 45, 20, 0.15)', bone: '#1f1b15', dust: '#6e675b', gold: '#8f6820', molten: ['#e7cc92', '#d6b067'], turq: '#1b7f54', carn: '#c8433a' },
};

/* Dark skins: every colour token of the «آرام» layer. */
const DARK = {
  lapis: {
    fa: 'لاجورد', note: 'شب آبی با رگه‌های طلا',
    void: '#090d1c', vault: '#0d1326', vault2: '#131a31', vault3: '#1a2240', vault4: '#26305a',
    hair: 'rgba(160, 180, 255, 0.08)', hair2: 'rgba(160, 180, 255, 0.15)',
    gold: '#e2bd6a', goldHi: '#f3e2b3', goldLo: '#a3843f', goldDeep: '#6c5422', molten: ['#f6e6b8', '#e2bd6a', '#b8913f'],
    bone: '#e8e9f2', dust: '#a3aac6', dust2: '#7880a4',
    turq: '#6fd0b5', carn: '#f08a7a', lapis: '#9db5ff', badHi: '#f6ab9f', infoHi: '#c3d1ff',
    inkRgb: '4, 6, 16', raiseRgb: '30, 38, 70', goldRgb: '226, 189, 106', okRgb: '111, 208, 181', badRgb: '240, 138, 122', infoRgb: '157, 181, 255', glintRgb: '220, 228, 255',
  },
  firouzeh: {
    fa: 'فیروزه', note: 'جوهر سبزآبی و نور شمالی',
    void: '#061214', vault: '#0a181b', vault2: '#0f2024', vault3: '#15292e', vault4: '#1f383e',
    hair: 'rgba(140, 235, 225, 0.08)', hair2: 'rgba(140, 235, 225, 0.15)',
    gold: '#dcb66a', goldHi: '#f1dfb0', goldLo: '#9c8247', goldDeep: '#67552c', molten: ['#f3e3b6', '#dcb66a', '#b28f4c'],
    bone: '#e3ecea', dust: '#9fb5b3', dust2: '#6f8a88',
    turq: '#5fd6c0', carn: '#ef8c78', lapis: '#8fb3f0', badHi: '#f5ad9d', infoHi: '#b8cff7',
    inkRgb: '2, 8, 10', raiseRgb: '22, 46, 52', goldRgb: '220, 182, 106', okRgb: '95, 214, 192', badRgb: '239, 140, 120', infoRgb: '143, 179, 240', glintRgb: '210, 255, 248',
  },
  yaghout: {
    fa: 'یاقوت', note: 'شراب تیره و طلای سرخ',
    void: '#120709', vault: '#190b0f', vault2: '#211015', vault3: '#2b161c', vault4: '#3a1f27',
    hair: 'rgba(255, 190, 200, 0.08)', hair2: 'rgba(255, 190, 200, 0.15)',
    gold: '#e7b08f', goldHi: '#f6d9c8', goldLo: '#a77560', goldDeep: '#6e4637', molten: ['#f8dccb', '#e7b08f', '#bd7e64'],
    bone: '#f0e4e4', dust: '#bba3a7', dust2: '#8c7378',
    turq: '#74cfae', carn: '#ff8f86', lapis: '#9fb2f2', badHi: '#ffb1aa', infoHi: '#c4d0f7',
    inkRgb: '10, 3, 5', raiseRgb: '52, 26, 33', goldRgb: '231, 176, 143', okRgb: '116, 207, 174', badRgb: '255, 143, 134', infoRgb: '159, 178, 242', glintRgb: '255, 225, 230',
  },
  zomorrod: {
    fa: 'زمرد', note: 'سبز شب با پرتوهای نور',
    void: '#06110c', vault: '#0a1711', vault2: '#0f1f17', vault3: '#15291f', vault4: '#1f382b',
    hair: 'rgba(150, 240, 190, 0.08)', hair2: 'rgba(150, 240, 190, 0.15)',
    gold: '#dfbb68', goldHi: '#f2e1b1', goldLo: '#9f8445', goldDeep: '#69572b', molten: ['#f4e5b7', '#dfbb68', '#b4924a'],
    bone: '#e4ece6', dust: '#a0b5a8', dust2: '#70897b',
    turq: '#6fd6a2', carn: '#f08f7c', lapis: '#95b4f0', badHi: '#f6b0a1', infoHi: '#bdd0f7',
    inkRgb: '2, 8, 5', raiseRgb: '24, 48, 36', goldRgb: '223, 187, 104', okRgb: '111, 214, 162', badRgb: '240, 143, 124', infoRgb: '149, 180, 240', glintRgb: '215, 255, 230',
  },
  shabagh: {
    fa: 'شبق', note: 'سیاه کامل برای OLED و شب‌کاری',
    void: '#000000', vault: '#000000', vault2: '#0b0b0c', vault3: '#151517', vault4: '#232326',
    hair: 'rgba(255, 255, 255, 0.09)', hair2: 'rgba(255, 255, 255, 0.16)',
    gold: '#e6c06e', goldHi: '#f7e7bd', goldLo: '#a68746', goldDeep: '#6e5a2c', molten: ['#f8e8bd', '#e6c06e', '#bb9547'],
    bone: '#f2f2f0', dust: '#a9a9ad', dust2: '#7a7a80',
    turq: '#6fd3b6', carn: '#ff8a72', lapis: '#8fb0ff', badHi: '#ffab99', infoHi: '#b9cdff',
    inkRgb: '0, 0, 0', raiseRgb: '30, 30, 33', goldRgb: '230, 192, 110', okRgb: '111, 211, 182', badRgb: '255, 138, 114', infoRgb: '143, 176, 255', glintRgb: '255, 255, 255',
  },
};

/* Light skins: every colour token of the «روز» layer, including its own accent family (--l-*). */
const LIGHT = {
  pearl: {
    fa: 'مروارید', note: 'سفید سرد با درخشش صدفی',
    void: '#eceef2', vault: '#f4f5f8', vault2: '#ffffff', vault3: '#f7f8fb', vault4: '#dfe3ea',
    hair: 'rgba(30, 40, 70, 0.08)', hair2: 'rgba(30, 40, 70, 0.14)',
    gold: '#80632a', goldHi: '#191c24', goldLo: '#c5ad7c', goldDeep: '#5f4a20', molten: ['#f1e6cc', '#dcc596'],
    bone: '#191c24', dust: '#5d6475', dust2: '#80879a',
    turq: '#18794f', carn: '#bb3a3a', lapis: '#3159c4', badHi: '#a33232', infoHi: '#26479f',
    inkRgb: '255, 255, 255', raiseRgb: '255, 255, 255', goldRgb: '190, 160, 100', okRgb: '24, 121, 79', badRgb: '187, 58, 58', infoRgb: '49, 89, 196', glintRgb: '90, 100, 140',
    lGoldInk: '#77592a', lGoldSoft: '#f3efe6', lGoldLine: '#dccfae', lGoldInk2: '#6b5120', lGoldMid: '#a88845', lGoldEdge: '#c7b07c', lOnGold: '#2a2210', lGoldSoft2: '#f4f0e6', lGoldLine2: '#e2d6ba',
    lHover: '#f3f5f9', lTint: '#f9fafc', lHairStrong: '#cdd3dd', lShade: '30, 40, 70',
  },
  rose: {
    fa: 'رزگلد', note: 'کاغذ صورتی‌فام و طلای سرخ',
    void: '#f2eae8', vault: '#f8f2f0', vault2: '#ffffff', vault3: '#fbf6f4', vault4: '#eadcd8',
    hair: 'rgba(90, 40, 40, 0.08)', hair2: 'rgba(90, 40, 40, 0.14)',
    gold: '#98583f', goldHi: '#241a1a', goldLo: '#d4a08d', goldDeep: '#6e3d2e', molten: ['#f5d6c8', '#e2a88f'],
    bone: '#241a1a', dust: '#6f5f5f', dust2: '#8f7c7c',
    turq: '#18794f', carn: '#bb3a3a', lapis: '#3a5bc0', badHi: '#a33232', infoHi: '#2c4a9f',
    inkRgb: '255, 255, 255', raiseRgb: '255, 255, 255', goldRgb: '214, 150, 125', okRgb: '24, 121, 79', badRgb: '187, 58, 58', infoRgb: '58, 91, 192', glintRgb: '140, 80, 70',
    lGoldInk: '#8c4d39', lGoldSoft: '#f9eae4', lGoldLine: '#ecc6b7', lGoldInk2: '#7c412f', lGoldMid: '#c07a60', lGoldEdge: '#d79b83', lOnGold: '#3a1b12', lGoldSoft2: '#fbede7', lGoldLine2: '#f0d0c3',
    lHover: '#faf1ee', lTint: '#fdf9f8', lHairStrong: '#e0cbc5', lShade: '90, 40, 40',
  },
  silver: {
    fa: 'نقره', note: 'خاکستری سرد و پلاتین',
    void: '#e9ebee', vault: '#f1f3f5', vault2: '#ffffff', vault3: '#f6f7f9', vault4: '#dadee4',
    hair: 'rgba(20, 30, 45, 0.09)', hair2: 'rgba(20, 30, 45, 0.15)',
    gold: '#4f5d73', goldHi: '#161a20', goldLo: '#a9b3c1', goldDeep: '#343d4b', molten: ['#f2f4f7', '#c9d0da'],
    bone: '#161a20', dust: '#5a6270', dust2: '#7d8592',
    turq: '#18794f', carn: '#bb3a3a', lapis: '#2f5bc4', badHi: '#a33232', infoHi: '#26479f',
    inkRgb: '255, 255, 255', raiseRgb: '255, 255, 255', goldRgb: '120, 135, 160', okRgb: '24, 121, 79', badRgb: '187, 58, 58', infoRgb: '47, 91, 196', glintRgb: '60, 70, 90',
    lGoldInk: '#46536a', lGoldSoft: '#eef1f5', lGoldLine: '#c8d0dc', lGoldInk2: '#3c475b', lGoldMid: '#6f7d93', lGoldEdge: '#aab4c3', lOnGold: '#1b2230', lGoldSoft2: '#eff2f6', lGoldLine2: '#d3d9e2',
    lHover: '#f2f4f7', lTint: '#f8f9fa', lHairStrong: '#cbd1d9', lShade: '20, 30, 45',
  },
  saffron: {
    fa: 'زعفران', note: 'کرم گرم و زعفرانی',
    void: '#f3ece0', vault: '#f9f4ea', vault2: '#fffdf8', vault3: '#fcf7ee', vault4: '#eadfcb',
    hair: 'rgba(90, 55, 10, 0.09)', hair2: 'rgba(90, 55, 10, 0.16)',
    gold: '#9a5118', goldHi: '#221a10', goldLo: '#e2a565', goldDeep: '#74390c', molten: ['#f9d6a6', '#eeaa5a'],
    bone: '#221a10', dust: '#6c5d48', dust2: '#8b7a63',
    turq: '#18794f', carn: '#b8382d', lapis: '#2f59bc', badHi: '#a3302a', infoHi: '#26479f',
    inkRgb: '255, 255, 255', raiseRgb: '255, 255, 255', goldRgb: '226, 140, 60', okRgb: '24, 121, 79', badRgb: '184, 56, 45', infoRgb: '47, 89, 188', glintRgb: '150, 80, 20',
    lGoldInk: '#8f4c18', lGoldSoft: '#fcecd6', lGoldLine: '#f0c995', lGoldInk2: '#7f4313', lGoldMid: '#cf7b2c', lGoldEdge: '#e6a35b', lOnGold: '#3b1d05', lGoldSoft2: '#fdefdc', lGoldLine2: '#f4d4a8',
    lHover: '#fbf3e6', lTint: '#fdf9f1', lHairStrong: '#e2d3b9', lShade: '90, 55, 10',
  },
  kashi: {
    fa: 'کاشی', note: 'لعاب سفید، لاجوردی و گره‌چینی',
    void: '#eaeff3', vault: '#f3f6f8', vault2: '#ffffff', vault3: '#f7f9fb', vault4: '#d8e1e9',
    hair: 'rgba(20, 50, 90, 0.09)', hair2: 'rgba(20, 50, 90, 0.16)',
    gold: '#24509e', goldHi: '#141c2b', goldLo: '#9fb6dc', goldDeep: '#183a76', molten: ['#efd9a3', '#d8b062'],
    bone: '#141c2b', dust: '#566175', dust2: '#7a8496',
    turq: '#13775f', carn: '#bb3a37', lapis: '#0b6f78', badHi: '#a33230', infoHi: '#095a62',
    inkRgb: '255, 255, 255', raiseRgb: '255, 255, 255', goldRgb: '60, 110, 190', okRgb: '19, 119, 95', badRgb: '187, 58, 55', infoRgb: '11, 111, 120', glintRgb: '30, 70, 140',
    lGoldInk: '#24509e', lGoldSoft: '#eaf1fb', lGoldLine: '#bfd2ef', lGoldInk2: '#1d4386', lGoldMid: '#3d6cbf', lGoldEdge: '#9db8e3', lOnGold: '#2b1f0a', lGoldSoft2: '#edf3fc', lGoldLine2: '#c9daf2',
    lHover: '#f0f4f8', lTint: '#f8fafc', lHairStrong: '#c9d4df', lShade: '20, 50, 90',
  },
};

const ORIGINAL = [
  { id: 'calm', base: 'calm', tone: 'dark', fa: 'شب آرام', note: 'گرافیت و طلای گرم' },
  { id: 'classic', base: 'classic', tone: 'dark', fa: 'کلاسیک طلایی', note: 'لاکی سیاه و طلای مذاب' },
  { id: 'day', base: 'day', tone: 'light', fa: 'روز', note: 'کاغذ عاجی و سطح سفید' },
];
/** Every skin, the dark ones first, each with its base layer, its tone and its full palette (null for the CSS ones). */
export const SKINS = [
  ...ORIGINAL.filter((s) => s.tone === 'dark').map((s) => ({ ...s, palette: null, preview: CSS_PREVIEW[s.id] })),
  ...Object.entries(DARK).map(([id, p]) => ({ id, base: 'calm', tone: 'dark', fa: p.fa, note: p.note, palette: p, preview: p })),
  ...ORIGINAL.filter((s) => s.tone === 'light').map((s) => ({ ...s, palette: null, preview: CSS_PREVIEW[s.id] })),
  ...Object.entries(LIGHT).map(([id, p]) => ({ id, base: 'day', tone: 'light', fa: p.fa, note: p.note, palette: p, preview: p })),
];
export const SKIN = Object.fromEntries(SKINS.map((s) => [s.id, s]));
export const DEFAULT_PAIR = { light: 'day', dark: 'calm' };

/** camelCase key → CSS custom property: vault2 → --vault-2, lGoldInk2 → --l-gold-ink-2, goldRgb → --gold-rgb. */
export const cssName = (k) => `--${k.replace(/([A-Z])/g, '-$1').replace(/(\d+)/g, '-$1').toLowerCase()}`;
const moltenOf = (stops, tone) => (tone === 'light' ? `linear-gradient(180deg, ${stops[0]} 0%, ${stops[stops.length - 1]} 100%)` : `linear-gradient(118deg, ${stops[0]} 0%, ${stops[1]} 46%, ${stops[2]} 100%)`);

/** The custom properties a skin sets on the page (or on a miniature). The CSS skins set nothing on the page. */
export function varsOf(skin, { preview = false } = {}) {
  const p = preview ? skin.preview : skin.palette;
  if (!p) return {};
  const out = {};
  for (const [k, v] of Object.entries(p)) {
    if (k === 'fa' || k === 'note') continue;
    if (k === 'molten') out['--molten'] = moltenOf(v, skin.tone);
    else if (k === 'lShade') {
      out['--l-shadow'] = `0 1px 2px rgba(${v}, 0.04), 0 10px 24px -20px rgba(${v}, 0.22)`;
      out['--l-shadow-pop'] = `0 2px 6px rgba(${v}, 0.06), 0 22px 44px -24px rgba(${v}, 0.3)`;
      out['--l-shade-rgb'] = v;
    } else out[cssName(k)] = v;
  }
  if (!preview && skin.tone === 'light') out['--surface-elevated'] = p.vault2;
  return out;
}

/* ---------------- the sun: real sunrise and sunset (the sunrise equation; accurate to a minute or two) ---------------- */
export const TEHRAN = { lat: 35.6892, lon: 51.389 };
const RAD = Math.PI / 180;
const toJ = (ms) => ms / 86400000 + 2440587.5;
const fromJ = (j) => Math.round((j - 2440587.5) * 86400000);
function transit(n, lon) {
  const Js = n - lon / 360;
  const M = (357.5291 + 0.98560028 * Js) % 360;
  const C = 1.9148 * Math.sin(M * RAD) + 0.02 * Math.sin(2 * M * RAD) + 0.0003 * Math.sin(3 * M * RAD);
  const L = (M + C + 180 + 102.9372) % 360;
  const Jt = 2451545 + Js + 0.0053 * Math.sin(M * RAD) - 0.0069 * Math.sin(2 * L * RAD);
  return { Jt, decl: Math.asin(Math.sin(L * RAD) * Math.sin(23.4397 * RAD)) };
}
/** Sunrise and sunset around `date` (the solar day whose noon is nearest), as epoch milliseconds. */
export function sunTimes(date = new Date(), { lat, lon } = TEHRAN) {
  const J = toJ(date.getTime());
  let n = Math.round(J - 2451545 + lon / 360 - 0.5);
  // the solar noon nearest to the moment asked about
  let best = transit(n, lon);
  for (const m of [n - 1, n + 1]) {
    const t = transit(m, lon);
    if (Math.abs(t.Jt - J) < Math.abs(best.Jt - J)) (best = t), (n = m);
  }
  const cosH = (Math.sin(-0.833 * RAD) - Math.sin(lat * RAD) * Math.sin(best.decl)) / (Math.cos(lat * RAD) * Math.cos(best.decl));
  if (cosH <= -1 || cosH >= 1) return null; // polar day or night
  const H = Math.acos(cosH) / RAD;
  return { rise: fromJ(best.Jt - H / 360), set: fromJ(best.Jt + H / 360), noon: fromJ(best.Jt) };
}
export function isDaytime(date = new Date(), where = TEHRAN) {
  const t = sunTimes(date, where);
  if (!t) return true;
  return date.getTime() >= t.rise && date.getTime() < t.set;
}
/**
 * Where the ambient light sits: by day the sun crosses from the east (right) to the west, rising to the top at
 * noon; by night a cooler, dimmer moon. x and y are percentages of the page, a the strength.
 */
export function skyAt(date = new Date(), where = TEHRAN) {
  const t = sunTimes(date, where);
  const now = date.getTime();
  if (t && now >= t.rise && now < t.set) {
    const p = (now - t.rise) / (t.set - t.rise);
    return { sky: 'day', x: Math.round(88 - p * 76), y: Math.round(34 - Math.sin(Math.PI * p) * 26), a: 1 };
  }
  const night = 86400000 - (t ? t.set - t.rise : 43200000);
  const since = t ? (now >= t.set ? now - t.set : now - (t.set - 86400000)) : 0;
  const q = Math.min(1, Math.max(0, since / night));
  return { sky: 'night', x: Math.round(84 - q * 68), y: Math.round(26 - Math.sin(Math.PI * q) * 14), a: 0.7 };
}

/* ---------------- the choice: fixed, with the device, or with the sun ---------------- */
export const MODES = ['fixed', 'os', 'sun'];
export function normalizePref(raw = {}) {
  const pair = { ...DEFAULT_PAIR };
  if (SKIN[raw.light]?.tone === 'light') pair.light = raw.light;
  if (SKIN[raw.dark]?.tone === 'dark') pair.dark = raw.dark;
  return { mode: MODES.includes(raw.mode) ? raw.mode : 'fixed', skin: SKIN[raw.skin] ? raw.skin : 'calm', ...pair, amb: raw.amb !== false };
}
/** Which skin is on now. */
export function resolveSkin(pref, { now = new Date(), osDark = true, where = TEHRAN } = {}) {
  const p = normalizePref(pref);
  if (p.mode === 'os') return osDark ? p.dark : p.light;
  if (p.mode === 'sun') return isDaytime(now, where) ? p.light : p.dark;
  return p.skin;
}
/** Choosing a skin: a fixed choice also becomes the pair's member of its tone; in an automatic mode it only sets the pair. */
export function choose(pref, id) {
  const p = normalizePref(pref);
  const s = SKIN[id];
  if (!s) return p;
  const next = { ...p, [s.tone]: id };
  if (p.mode === 'fixed') next.skin = id;
  return next;
}
/** The light/dark switch (dashboard): the other member of the pair, as a fixed choice. */
export function flipTone(pref, opts) {
  const p = normalizePref(pref);
  const cur = SKIN[resolveSkin(p, opts)];
  return { ...p, mode: 'fixed', skin: cur.tone === 'light' ? p.dark : p.light };
}

/* ---------------- storage (this device): «beatris.theme» keeps its old meaning for a fixed skin ---------------- */
const KEY = 'beatris.theme', PAIR = 'beatris.skin.pair', AMB = 'beatris.skin.amb';
const ls = {
  get(k) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* storage unavailable: the choice lasts until the page closes */
    }
  },
};
export function readPref() {
  const t = ls.get(KEY);
  let pair = {};
  try {
    pair = JSON.parse(ls.get(PAIR) ?? '{}') ?? {};
  } catch {
    /* a broken value: the default pair */
  }
  const mode = t === 'auto-os' ? 'os' : t === 'auto-sun' ? 'sun' : 'fixed';
  return normalizePref({ mode, skin: mode === 'fixed' ? t : pair.last, light: pair.light, dark: pair.dark, amb: ls.get(AMB) !== '0' });
}
export function writePref(pref) {
  const p = normalizePref(pref);
  ls.set(KEY, p.mode === 'os' ? 'auto-os' : p.mode === 'sun' ? 'auto-sun' : p.skin);
  ls.set(PAIR, JSON.stringify({ light: p.light, dark: p.dark, last: p.skin }));
  ls.set(AMB, p.amb ? '1' : '0');
  return p;
}

/* ---------------- the page ---------------- */
let painted = [];
/** Put a skin on the page (or a miniature on an element). Returns the skin. */
export function paint(id, el = null) {
  const s = SKIN[id] ?? SKIN.calm;
  if (el) {
    for (const [k, v] of Object.entries(varsOf(s, { preview: true }))) el.style.setProperty(k, v);
    return s;
  }
  const root = document.documentElement;
  const vars = varsOf(s);
  for (const k of painted) if (!(k in vars)) root.style.removeProperty(k);
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  painted = Object.keys(vars);
  root.dataset.theme = s.base;
  root.dataset.skin = s.id;
  root.dataset.tone = s.tone;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', s.palette?.vault ?? s.preview.vault);
  return s;
}
export function paintSky(date = new Date()) {
  const k = skyAt(date);
  const st = document.documentElement.style;
  st.setProperty('--sun-x', `${k.x}%`);
  st.setProperty('--sun-y', `${k.y}%`);
  st.setProperty('--sun-a', String(k.a));
  document.documentElement.dataset.sky = k.sky;
  return k;
}
