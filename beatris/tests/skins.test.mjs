// spec 0014: every skin is complete and readable (WCAG contrast), the miniatures of the CSS skins match app.css,
// the automatic modes pick the right skin, and Tehran's sunrise and sunset come out within ten minutes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SKINS, SKIN, varsOf, cssName, normalizePref, resolveSkin, choose, flipTone, sunTimes, isDaytime } from '../public/js/skins.mjs';

const hex = (h) => {
  const m = h.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(m.slice(i, i + 2), 16) / 255);
};
const lum = (h) => {
  const [r, g, b] = hex(h).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const DARK_KEYS = ['void', 'vault', 'vault2', 'vault3', 'vault4', 'hair', 'hair2', 'gold', 'goldHi', 'goldLo', 'goldDeep', 'molten', 'bone', 'dust', 'dust2', 'turq', 'carn', 'lapis', 'badHi', 'infoHi', 'inkRgb', 'raiseRgb', 'goldRgb', 'okRgb', 'badRgb', 'infoRgb', 'glintRgb'];
const LIGHT_KEYS = [...DARK_KEYS, 'lGoldInk', 'lGoldSoft', 'lGoldLine', 'lGoldInk2', 'lGoldMid', 'lGoldEdge', 'lOnGold', 'lGoldSoft2', 'lGoldLine2', 'lHover', 'lTint', 'lHairStrong', 'lShade'];

test('هر پوسته همه توکن‌ها را دارد و رنگ‌هایش خواناست (WCAG)', () => {
  for (const s of SKINS.filter((x) => x.palette)) {
    const p = s.palette;
    for (const k of s.tone === 'light' ? LIGHT_KEYS : DARK_KEYS) assert.ok(p[k] != null, `${s.id}: ${k}`);
    for (const bg of [p.vault, p.vault2]) {
      assert.ok(ratio(p.bone, bg) >= 7, `${s.id} bone ${ratio(p.bone, bg).toFixed(2)}`);
      assert.ok(ratio(p.dust, bg) >= 4.5, `${s.id} dust ${ratio(p.dust, bg).toFixed(2)}`);
      assert.ok(ratio(p.dust2, bg) >= 3, `${s.id} dust2 ${ratio(p.dust2, bg).toFixed(2)}`);
    }
    for (const k of ['gold', 'turq', 'carn']) assert.ok(ratio(p[k], p.vault2) >= 4.5, `${s.id} ${k} ${ratio(p[k], p.vault2).toFixed(2)}`);
  }
});

test('پوسته تمیز: روشن و انتخابی، نه پیش‌فرض؛ دکمه اصلی سفید روی گرادیان صورتی-بنفش خواناست؛ جفت تیره دارد', () => {
  assert.equal(SKIN.clean.tone, 'light');
  assert.equal(SKIN.cleannight.tone, 'dark');
  assert.equal(normalizePref({}).skin, 'calm', 'the default skin is unchanged');
  for (const stop of SKIN.clean.palette.molten) assert.ok(ratio('#ffffff', stop) >= 4.5, `white on ${stop}`);
  const v = varsOf(SKIN.clean);
  assert.equal(v['--vault'], '#ededed');
  assert.equal(v['--vault-2'], '#ffffff');
  assert.match(v['--molten'], /#d6337f/);
  assert.ok(v['--l-shadow']);
});

test('نمونه کوچک سه پوسته قدیمی با app.css یکی است', () => {
  const css = readFileSync(new URL('../public/app.css', import.meta.url), 'utf8');
  const block = (sel) => css.slice(css.indexOf(sel), css.indexOf('}', css.indexOf(sel)));
  const calm = block(":root:not([data-theme='classic']):not([data-theme='day']) {");
  const day = block(":root[data-theme='day'] {\n  /* روز");
  const classic = block(':root {\n  --void: #080705;');
  for (const [id, b] of [['calm', calm], ['day', day], ['classic', classic]]) {
    const pv = SKIN[id].preview;
    for (const k of ['vault', 'vault2', 'vault3', 'bone', 'dust', 'gold', 'turq', 'carn']) assert.ok(b.includes(`${cssName(k)}: ${pv[k]}`), `${id} ${cssName(k)} ${pv[k]}`);
  }
});

test('انتخاب: ثابت، همراه دستگاه، همراه خورشید؛ جفت روشن/تیره و دکمه داشبورد', () => {
  let p = normalizePref({});
  p = choose(p, 'clean');
  assert.equal(resolveSkin(p), 'clean');
  assert.equal(p.light, 'clean');
  p = choose({ ...p, mode: 'os' }, 'lapis');
  assert.equal(p.dark, 'lapis');
  assert.equal(p.skin, 'clean', 'an automatic mode only changes the pair');
  assert.equal(resolveSkin(p, { osDark: true }), 'lapis');
  assert.equal(resolveSkin(p, { osDark: false }), 'clean');
  const sun = { ...p, mode: 'sun' };
  assert.equal(resolveSkin(sun, { now: new Date('2026-06-21T08:00:00Z') }), 'clean');
  assert.equal(resolveSkin(sun, { now: new Date('2026-06-21T20:00:00Z') }), 'lapis');
  const flipped = flipTone({ mode: 'fixed', skin: 'clean', light: 'clean', dark: 'cleannight' });
  assert.equal(flipped.skin, 'cleannight');
  assert.equal(normalizePref({ skin: 'nope', light: 'calm' }).light, 'day', 'a dark skin cannot be the light member');
});

test('طلوع و غروب تهران با خطای کمتر از ده دقیقه (۲۱ ژوئن و ۲۱ دسامبر)', () => {
  const at = (iso) => Date.parse(iso);
  const near = (a, b) => Math.abs(a - b) < 10 * 60000;
  // Tehran, IRST (UTC+3:30, no daylight saving): 21 Jun ≈ 04:48 / 19:22, 21 Dec ≈ 07:14 / 16:54
  const jun = sunTimes(new Date('2026-06-21T08:30:00Z'));
  assert.ok(near(jun.rise, at('2026-06-21T01:18:00Z')), new Date(jun.rise).toISOString());
  assert.ok(near(jun.set, at('2026-06-21T15:52:00Z')), new Date(jun.set).toISOString());
  const dec = sunTimes(new Date('2026-12-21T08:30:00Z'));
  assert.ok(near(dec.rise, at('2026-12-21T03:44:00Z')), new Date(dec.rise).toISOString());
  assert.ok(near(dec.set, at('2026-12-21T13:24:00Z')), new Date(dec.set).toISOString());
  assert.equal(isDaytime(new Date('2026-12-21T02:00:00Z')), false);
});
