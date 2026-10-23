// spec 0046: the pure parts of the entrance sculpture, against values worked out by hand from the prompt's rules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeRect, hexToRgb, clamp, DEFAULTS } from '../public/js/liquid.mjs';

const near = (a, b, what) => {
  for (const k of ['x', 'y', 'w', 'h']) assert.ok(Math.abs(a[k] - b[k]) < 1e-9, `${what}: ${k} ${a[k]} ≠ ${b[k]}`);
};
const P = { scale: 1, mobileScale: 1, x: 0, y: 0 };

test('computeRect: the sculpture is centred in the band, as wide as the breakpoint allows and at most 1.1–1.2 × the band', () => {
  // desktop: 1.02 × 1440 = 1468.8 wide would be 587.52 high, over 1.1 × 400 = 440, so the height decides
  near(computeRect(1440, 900, 2.5, { top: 80, bottom: 480 }, P), { x: 170, y: 60, w: 1100, h: 440 }, 'desktop');
  // tablet: 1.3 × 800 = 1040 wide, 416 high, under 1.15 × 400 = 460
  near(computeRect(800, 1000, 2.5, { top: 70, bottom: 470 }, P), { x: -120, y: 62, w: 1040, h: 416 }, 'tablet');
  // phone, wide image: 1.9 × 390 = 741 wide (it bleeds off both sides), 296.4 high, under 1.2 × 266 = 319.2
  near(computeRect(390, 844, 2.5, { top: 64, bottom: 330 }, P), { x: -175.5, y: 48.8, w: 741, h: 296.4 }, 'phone wide');
  // phone, portrait image: as wide as the screen would be 487.5 high, so it takes the band's 266 and is 212.8 wide
  near(computeRect(390, 844, 0.8, { top: 64, bottom: 330 }, P), { x: 88.6, y: 64, w: 212.8, h: 266 }, 'phone portrait');
});

test('computeRect: a band under 80 px counts as 80; scale and offsets move it as the prompt says', () => {
  near(computeRect(1440, 900, 2.5, { top: 100, bottom: 120 }, P), { x: 610, y: 66, w: 220, h: 88 }, 'thin band');
  // offsets are % of the hero: 10% right of centre, 5% of the height up
  near(computeRect(1440, 900, 2.5, { top: 80, bottom: 480 }, { ...P, x: 10, y: -5 }), { x: 314, y: 15, w: 1100, h: 440 }, 'offsets');
  // half scale: 734.4 wide would be 293.76 high, over 220
  near(computeRect(1440, 900, 2.5, { top: 80, bottom: 480 }, { ...P, scale: 0.5 }), { x: 445, y: 170, w: 550, h: 220 }, 'scale');
  // the breakpoints are inclusive at 1024 and 640
  assert.equal(computeRect(1024, 900, 10, { top: 0, bottom: 900 }, P).w, 1024 * 1.02);
  assert.equal(computeRect(640, 900, 10, { top: 0, bottom: 900 }, P).w, 640 * 1.3);
  assert.equal(computeRect(639, 900, 10, { top: 0, bottom: 900 }, P).w, 639 * 1.9);
});

test('hexToRgb: hex in three, six or eight digits, rgb() and rgba(); anything else falls back', () => {
  const fb = [0.5, 0.5, 0.5];
  assert.deepEqual(hexToRgb('#fff', fb), [1, 1, 1]);
  assert.deepEqual(hexToRgb(' #abc ', fb), [0xaa / 255, 0xbb / 255, 0xcc / 255]);
  assert.deepEqual(hexToRgb('#EBE9E5', fb), [235 / 255, 233 / 255, 229 / 255]);
  assert.deepEqual(hexToRgb('111110', fb), [17 / 255, 17 / 255, 16 / 255]);
  assert.deepEqual(hexToRgb('#11111080', fb), [17 / 255, 17 / 255, 16 / 255]);
  assert.deepEqual(hexToRgb('rgb(21, 21, 20)', fb), [21 / 255, 21 / 255, 20 / 255]);
  assert.deepEqual(hexToRgb('rgba(1 2 3 / 50%)', fb), [1 / 255, 2 / 255, 3 / 255]);
  for (const bad of ['red', '#12', '#12345', '', 42, null, undefined]) assert.equal(hexToRgb(bad, fb), fb, String(bad));
});

test('the prompt defaults, and clamp', () => {
  assert.deepEqual({ ...DEFAULTS }, { interactive: true, strength: 1, radius: 220, density: 1, dotSize: 1, spread: 1, turbulence: 1, liquid: 1, streaks: true, restStyle: 'image', returnSpeed: 1, ambient: false, ambientIntensity: 1, speed: 1, intro: false });
  assert.ok(Object.isFrozen(DEFAULTS));
  assert.equal(clamp(5, 0, 2), 2);
  assert.equal(clamp(-1, 0, 2), 0);
  assert.equal(clamp(1.5, 0, 2), 1.5);
});
