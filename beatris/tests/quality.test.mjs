// spec 0025: one decision for how sharp every picture is, made from the device's real limits
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tierOf, samplesFor, superFor, canvasDensity, TIER_NAMES } from '../public/js/quality.mjs';

const desktop = { dpr: 2, cores: 12, memory: 16, webgl2: true, maxSamples: 8, maxTexture: 16384, maxRenderbuffer: 16384, maxAnisotropy: 16, renderer: 'ANGLE (NVIDIA GeForce RTX 3060)', mobile: false };
const phone = { dpr: 3, cores: 6, memory: null, webgl2: true, maxSamples: 4, maxTexture: 8192, maxRenderbuffer: 8192, maxAnisotropy: 16, renderer: 'Apple GPU', mobile: true };

test('a desktop GPU is ultra: 8 samples, sharp reflections, soft 4096 shadows, full anisotropy', () => {
  const t = tierOf(desktop);
  assert.equal(t.tier, 'ultra');
  assert.deepEqual([t.pixelRatio, t.samples, t.pmrem, t.shadow, t.shadowRadius, t.anisotropy, t.exportMax, t.videoMax], [2, 8, 1024, 4096, 16, 16, 7680, 2160]);
  assert.equal(t.glint, true);
  assert.ok(t.sigma < 0.02, 'reflections sharper than the standard blur');
  assert.ok(t.refineMP > 0 && t.exportMP > 0, 'stills and exports are supersampled');
});

test('a modern phone is high, at its full 3× density, with its own 4 samples', () => {
  const t = tierOf(phone);
  assert.equal(t.tier, 'high');
  assert.deepEqual([t.pixelRatio, t.canvasRatio, t.samples, t.pmrem, t.shadow, t.anisotropy], [3, 3, 4, 512, 2048, 16]);
  assert.equal(t.floor, 1.5, 'motion never drops a 3× phone under 1.5×');
});

test('software rendering, data saver, 2 GB or no WebGL2: standard, still sharp to 1.5×, no supersampling', () => {
  for (const c of [{ ...desktop, renderer: 'Google SwiftShader' }, { ...desktop, renderer: 'llvmpipe (LLVM 15.0.7, 256 bits)' }, { ...phone, saveData: true }, { ...phone, memory: 2 }, { ...desktop, webgl2: false }]) {
    const t = tierOf(c);
    assert.equal(t.tier, 'standard', JSON.stringify(c));
    assert.equal(t.pixelRatio, Math.min(c.dpr, 1.5));
    assert.deepEqual([t.refineMP, t.exportMP, t.sigma, t.glint], [0, 0, 0.02, false]);
  }
});

test('the GPU limits always win: samples, texture size and anisotropy are never asked beyond them', () => {
  const t = tierOf({ ...desktop, maxSamples: 4, maxTexture: 4096, maxRenderbuffer: 4096, maxAnisotropy: 4 });
  assert.equal(t.tier, 'high', 'fewer than 8 samples is not ultra');
  assert.deepEqual([t.samples, t.pmrem, t.shadow, t.exportMax, t.anisotropy], [4, 512, 2048, 4096, 4]);
  const tiny = tierOf({ ...desktop, maxTexture: 2048, maxRenderbuffer: 2048 });
  assert.deepEqual([tiny.pmrem, tiny.shadow, tiny.shadowRadius, tiny.exportMax, tiny.videoMax], [512, 2048, 8, 2048, 2048]);
  assert.equal(tierOf({ ...desktop, maxSamples: 6, force: 'ultra' }).samples, 4, 'samples are a power of two');
});

test('same input, same output; a forced tier for support; reduced motion keeps pictures still', () => {
  assert.deepEqual(tierOf(phone), tierOf({ ...phone }));
  assert.equal(tierOf({ ...phone, force: 'ultra' }).tier, 'ultra');
  assert.equal(tierOf({ ...phone, force: 'nonsense' }).tier, 'high');
  assert.equal(tierOf({ ...phone, reducedMotion: true }).motion, false);
  assert.deepEqual(TIER_NAMES, ['ultra', 'high', 'standard']);
  assert.equal(tierOf({}).tier, 'high', 'an unknown device gets the middle');
});

test('MSAA fits the memory budget: a small hero gets 8 samples, a 4K studio 4, a huge target none', () => {
  const u = tierOf(desktop);
  assert.equal(samplesFor(1200 * 1200, u.samples, u.msaa), 8, 'login coin at 2×');
  assert.equal(samplesFor(3840 * 2160, u.samples, u.msaa), 4, 'full-screen studio on a 4K screen');
  assert.equal(samplesFor(7680 * 4320 * 4, u.samples, u.msaa), 0);
  assert.equal(samplesFor(1000, 1, 1e9), 0, 'a GPU without MSAA');
  assert.equal(samplesFor(1000, 0, 1e9), 0);
  for (let px = 1e5; px < 1e8; px *= 1.7) assert.ok(px * samplesFor(px, 8, 48e6) <= 48e6);
});

test('supersampling only within budget and the GPU size limit', () => {
  const u = tierOf(desktop);
  assert.equal(superFor(1920, 1080, u.refineMP, u.exportMax), 2, 'a 1080p still is drawn at 4K and filtered down');
  assert.equal(superFor(3840, 2160, u.refineMP, u.exportMax), 1, 'a 4K still is already dense');
  assert.equal(superFor(2048, 2048, u.exportMP, u.exportMax), 2);
  assert.equal(superFor(2048, 2048, u.exportMP, 4000), 1, 'twice 2048 is beyond a 4000 px GPU');
  assert.equal(superFor(100, 100, 0), 1, 'standard never supersamples');
});

test('a 2D canvas is as dense as the screen, under the 16.7M-pixel limit', () => {
  assert.equal(canvasDensity(1200, 600, 3), 3);
  assert.equal(canvasDensity(390, 844, 3), 3);
  const d = canvasDensity(4000, 2500, 4); // a huge canvas on a 4× screen
  assert.ok(d < 4 && Math.round(4000 * d * 2500 * d) <= 16_700_000, String(d));
  assert.equal(canvasDensity(100, 100, 1), 1);
});
