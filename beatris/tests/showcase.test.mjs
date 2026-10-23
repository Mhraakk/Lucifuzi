// spec 0041: the coin showcase's pure part — where every card of the endless ring stands, how a card turns with its
// distance from the middle (in RTL too), the entrance from the middle outward, the glide and the settle, how many
// copies fill a screen, the card's flight into the window without stretching, and the coin facts on a card.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GAP, PHYS, cardSize, depth, ringPos, pose, entrance, nearest, centerIndex, step, copiesFor, flipFrom, COIN_SYMBOL, readLabel, alertFor } from '../public/js/showcasemath.mjs';

const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test('ring: n cards take n different places one stride apart, all inside the ring, at any scroll', () => {
  const stride = cardSize(1440).w + GAP;
  for (const n of [2, 8, 10, 16])
    for (const scroll of [0, 37.5, stride * 3.25, -stride * 7.9, 1e5]) {
      const xs = Array.from({ length: n }, (_, i) => ringPos(i, stride, scroll, n)).sort((a, b) => a - b);
      for (const x of xs) assert.ok(x >= -(n * stride) / 2 - 1e-6 && x < (n * stride) / 2 + 1e-6, `${x} outside the ring`);
      for (let i = 1; i < n; i++) assert.ok(close(xs[i] - xs[i - 1], stride, 1e-6), `n=${n} scroll=${scroll}: cards ${xs[i - 1]} and ${xs[i]} are not one stride apart`);
    }
});

test('ring: the design’s TOTAL = 8 strides would stack cards 8 and 9 on 0 and 1; n strides does not', () => {
  const stride = 362;
  const wrongRing = (i) => ((((i * stride) % (8 * stride)) + 8 * stride * 1.5) % (8 * stride)) - 4 * stride;
  assert.equal(wrongRing(8), wrongRing(0), 'the bug the spec avoids');
  assert.notEqual(ringPos(8, stride, 0, 10), ringPos(0, stride, 0, 10));
  assert.equal(ringPos(0, stride, 0, 10), 0, 'card 0 starts in the middle');
  assert.equal(ringPos(1, stride, stride, 10), 0, 'one stride on, card 1 is in the middle');
});

test('card size: the design’s three sizes; a short screen shrinks the card in proportion so the middle one fits; a phone keeps its own', () => {
  assert.deepEqual(cardSize(390), { w: 250, h: 350 });
  assert.deepEqual(cardSize(800), { w: 290, h: 400 });
  assert.deepEqual(cardSize(1920, 640), { w: 340, h: 460 }, 'room enough');
  const laptop = cardSize(1440, 462); // 900 px high, the hero ends 438 px down
  assert.equal(laptop.h, 416);
  assert.ok(close(laptop.w / laptop.h, 340 / 460, 0.005), 'same proportion, no stretched coin');
  assert.ok(30 + laptop.h + 16 <= 462, 'the whole middle card is on the first screen');
  assert.equal(cardSize(1366, 200).h, 320, 'never under 320 px');
  assert.deepEqual(cardSize(390, 120), { w: 250, h: 350 }, 'a phone scrolls to the carousel instead');
});

test('pose: the middle card faces the viewer on top; cards turn toward the middle, sink and shrink, capped at 1.5', () => {
  const vw = 1440;
  const mid = pose(0, vw);
  assert.equal(mid.rotateY, 0);
  assert.equal(mid.scale, 1);
  assert.equal(mid.zIndex, 100);
  assert.ok(mid.near);
  const right = pose(400, vw), left = pose(-400, vw);
  assert.ok(right.rotateY < 0 && left.rotateY > 0, 'a card on the right turns left, toward the middle, and the other way round');
  assert.ok(close(right.rotateY, -left.rotateY) && close(right.z, left.z) && close(right.scale, left.scale), 'symmetric');
  assert.ok(right.z < 0 && right.scale < 1 && right.zIndex < 100);
  const far = pose(10000, vw);
  assert.ok(close(far.scale, 1 - 1.5 * depth(vw).maxScale) && close(far.z, 1.5 * depth(vw).maxZ), 'capped at 1.5');
  assert.equal(far.zIndex, 0, 'never below the carousel itself');
  assert.equal(depth(390).maxRot, 8, 'gentler on a phone');
  assert.equal(depth(1440).perspective, 1200);
});

test('pose in RTL: the screen offset is mirrored, so the next card (one stride on) is on the left and turns right', () => {
  const vw = 1440, stride = 362, dir = -1;
  const x = dir * ringPos(1, stride, 0, 10);
  assert.ok(x < 0, 'card 1 is left of the middle');
  assert.ok(pose(x, vw).rotateY > 0, 'and turns toward the middle');
});

test('entrance: the middle card first, each farther one later; it rises 60 px and grows from 0.94', () => {
  assert.deepEqual(entrance(0, 0), { y: 60, scale: 0.94, opacity: 0, done: false });
  const a = entrance(0, 1.2), b = entrance(3, 1.2);
  assert.ok(a.opacity > b.opacity, 'the middle card is further along');
  const end = entrance(5, 10);
  assert.ok(end.done && end.opacity === 1 && end.y === 0 && end.scale === 1);
});

test('glide: a fling slows by friction; slow, it settles exactly on the nearest card and says so', () => {
  const stride = 362;
  let s = { scroll: 0, velocity: 30, target: null, held: false };
  s = step(s, 1000 / 60, { stride });
  assert.ok(close(s.scroll, 30) && close(s.velocity, 30 * PHYS.friction), 'one frame: moved by its speed, then slowed');
  for (let i = 0; i < 2000 && !s.settled; i++) s = step(s, 1000 / 60, { stride });
  assert.ok(s.settled, 'settles');
  assert.equal(s.scroll % stride, 0, 'on a card');
  assert.equal(s.velocity, 0);
});

test('glide: frame time does not change the path (30 vs 120 fps end on the same card)', () => {
  const stride = 362;
  const run = (fps) => {
    let s = { scroll: 0, velocity: 25, target: null, held: false };
    for (let t = 0; t < 6000 && !s.settled; t += 1000 / fps) s = step(s, 1000 / fps, { stride });
    return s.scroll;
  };
  assert.equal(run(30), run(120));
});

test('snap: slow, the ring lands on the nearest card without swinging past it, within a second, at 30, 60 or 144 fps', () => {
  const stride = 362;
  const times = [];
  for (const fps of [30, 60, 144])
    for (const [from, v] of [[150, 0], [-150, 0.7], [40, -0.7], [12, 0], [-170, 0.5], [175, 0.7]]) {
      const goal = nearest(from, stride);
      let s = { scroll: from, velocity: v, target: null, held: false };
      let t = 0, past = 0;
      for (; t < 3000 && !s.settled; t += 1000 / fps) {
        s = step(s, 1000 / fps, { stride });
        past = Math.max(past, Math.sign(goal - from) * (s.scroll - goal)); // how far beyond the card, in the direction it came from
      }
      assert.ok(s.settled && s.scroll === goal, `${fps} fps from ${from}: rests on ${s.scroll}, not ${goal}`);
      assert.ok(past < 0.5, `${fps} fps from ${from}: swung ${past.toFixed(2)} px past the card`);
      assert.ok(t <= 1000, `${fps} fps from ${from}: ${Math.round(t)} ms to rest`);
      if (from === 150) times.push(t);
    }
  assert.ok(Math.max(...times) - Math.min(...times) <= 1000 / 30 + 1e-9, `the same time at every frame rate: ${times.map(Math.round)}`);
  // drifting, then paused (drift no longer allowed): it settles on the nearest card, never past it
  let s = { scroll: 0, velocity: 0, target: null, held: false };
  for (let i = 0; i < 40; i++) s = step(s, 1000 / 60, { stride, idle: PHYS.autoDelay, auto: true });
  assert.ok(s.scroll > 0 && !s.settled, 'drifting');
  const from = s.scroll;
  for (let i = 0; i < 300 && !s.settled; i++) {
    s = step(s, 1000 / 60, { stride, idle: PHYS.autoDelay, auto: false });
    assert.ok(s.scroll <= from + 1e-9 && s.scroll >= -1e-9, `paused: back onto card 0 without passing it (${s.scroll})`);
  }
  assert.ok(s.settled && s.scroll === 0);
});

test('a slow machine: at 2 frames a second the ring settles, glides and follows «next» in about the time it takes at 60', () => {
  const stride = 362;
  const run = (s, fps, done) => {
    let t = 0;
    for (; t < 10000 && !done(s); t += 1000 / fps) s = step(s, 1000 / fps, { stride });
    return { t, s };
  };
  for (const [s0, done, what] of [
    [{ scroll: 150, velocity: 0, target: null, held: false }, (s) => s.settled, 'settle'],
    [{ scroll: 0, velocity: 40, target: null, held: false }, (s) => s.settled, 'glide'],
    [{ scroll: 0, velocity: 0, target: stride, held: true }, (s) => s.target == null, 'follow'],
  ]) {
    const fast = run(s0, 60, done), slow = run(s0, 2, done);
    assert.ok(slow.t <= fast.t + 500, `${what}: ${Math.round(slow.t)} ms at 2 fps, ${Math.round(fast.t)} ms at 60`);
    assert.equal(slow.s.scroll, fast.s.scroll, `${what}: the same card`);
  }
  // a longer pause (a hidden tab) counts as half a second
  const fling = { scroll: 0, velocity: 20, target: null, held: false };
  assert.equal(step(fling, 60000, { stride }).scroll, step(fling, 500, { stride }).scroll);
});

test('drift: after the idle delay it moves on by itself only when allowed; held, nothing moves', () => {
  const stride = 362;
  const base = { scroll: 0, velocity: 0, target: null, held: false };
  assert.ok(step(base, 1000 / 60, { stride, idle: PHYS.autoDelay, auto: true }).scroll > 0, 'drifts');
  assert.ok(step(base, 1000 / 60, { stride, idle: PHYS.autoDelay, auto: false }).settled, 'not allowed: stays');
  assert.ok(step(base, 1000 / 60, { stride, idle: 100, auto: true }).settled, 'not idle long enough: stays');
  assert.equal(step({ ...base, velocity: 20, held: true }, 1000 / 60, { stride }).scroll, 0, 'held: no glide');
});

test('target: the window’s «next» reaches exactly one stride on, even while held', () => {
  const stride = 362;
  let s = { scroll: 0, velocity: 5, target: stride, held: true };
  for (let i = 0; i < 300 && s.target != null; i++) s = step(s, 1000 / 60, { stride });
  assert.equal(s.target, null);
  assert.equal(s.scroll, stride);
  assert.equal(centerIndex(s.scroll, stride, 8), 1);
  assert.equal(centerIndex(-stride, stride, 8), 7, 'one back from the first is the last');
  assert.equal(nearest(stride * 2.4, stride), stride * 2);
});

test('copies: the ring always reaches past both edges by more than a card', () => {
  for (const vw of [360, 768, 1440, 2560, 3840])
    for (const unique of [1, 2, 8, 30]) {
      const stride = cardSize(vw).w + GAP;
      const n = unique * copiesFor(unique, stride, vw);
      assert.ok((n * stride) / 2 >= vw / 2 + stride, `vw=${vw} unique=${unique}: ring ${n * stride}`);
    }
  assert.equal(copiesFor(0, 362, 1440), 0, 'no photos, no cards');
  assert.equal(copiesFor(8, 362, 1440), 1, 'eight cards fill a laptop screen by themselves');
});

test('flip: the picture starts on the card with one even scale, cropped to the card’s frame and corners', () => {
  const card = { x: 100, y: 300, w: 340, h: 460 };
  const target = { x: 272, y: 160, w: 430, h: 560 };
  const f = flipFrom(card, target);
  assert.ok(close(f.dx, 270 - 487) && close(f.dy, 530 - 440));
  assert.ok(target.w * f.s >= card.w - 1e-9 && target.h * f.s >= card.h - 1e-9, 'covers the card');
  assert.ok(close((target.w - 2 * f.insetX) * f.s, card.w) && close((target.h - 2 * f.insetY) * f.s, card.h), 'the visible part is exactly the card');
  assert.ok(close(f.r * f.s, 16), 'the card’s 16 px corners on screen');
  // a phone: a tall card flies into a wide picture
  const p = flipFrom({ x: 70, y: 420, w: 250, h: 350 }, { x: 24, y: 40, w: 342, h: 330 });
  assert.ok(close((342 - 2 * p.insetX) * p.s, 250) && close((330 - 2 * p.insetY) * p.s, 350));
});

test('coin facts: every traded coin has its quote; the photo label reads as title, design and note', () => {
  assert.deepEqual([COIN_SYMBOL.emami, COIN_SYMBOL.bahar, COIN_SYMBOL.halfOld, COIN_SYMBOL.quarterOld, COIN_SYMBOL.gerami], ['sekee', 'sekeb', 'nim', 'rob', 'gerami']);
  assert.deepEqual(readLabel('تمام بهار آزادی (طرح قدیم) — نخستین ضرب ۱۳۵۸'), { title: 'تمام بهار آزادی', design: 'طرح قدیم', note: 'نخستین ضرب ۱۳۵۸' });
  assert.deepEqual(readLabel('ربع سکه'), { title: 'ربع سکه', design: '', note: '' });
  assert.deepEqual(readLabel(), { title: '', design: '', note: '' });
});

test('alert: kept like the market page’s (toman); above or below today’s price; nothing for a non-price', () => {
  assert.deepEqual(alertFor('sekee', 1_000_000_000, 98_500_000, 'rial'), { symbol: 'sekee', op: 'above', price: 100_000_000 });
  assert.deepEqual(alertFor('rob', 30_000_000, 31_000_000), { symbol: 'rob', op: 'below', price: 30_000_000 });
  assert.deepEqual(alertFor('nim', 50_000_000, NaN), { symbol: 'nim', op: 'above', price: 50_000_000 }, 'no price today: wait for it to reach the target');
  assert.equal(alertFor('sekee', 0, 1), null);
  assert.equal(alertFor('sekee', NaN, 1), null);
});
