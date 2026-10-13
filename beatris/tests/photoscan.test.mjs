// spec 0009 — the photo-scan core against synthetic photographs with known geometry.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../public/js/photoscan.mjs';

test('FFT round trip and Fourier integration recover a bump from its gradient (< 2 %)', () => {
  const re = Float64Array.from({ length: 64 }, (_, i) => Math.sin(i * 0.7) + (i % 5));
  const im = new Float64Array(64), r0 = re.slice();
  P.fft(re, im);
  P.fft(re, im, true);
  for (let i = 0; i < 64; i++) assert.ok(Math.abs(re[i] - r0[i]) < 1e-9);
  const w = 120, h = 90, A = 6, s = 11, cx = 60, cy = 45;
  const z = new Float32Array(w * h), p = new Float32Array(w * h), q = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const e = A * Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * s * s)), i = y * w + x;
      z[i] = e;
      p[i] = (-(x - cx) / (s * s)) * e;
      q[i] = (-(y - cy) / (s * s)) * e;
    }
  const out = P.integrate(p, q, w, h);
  const off = out[0] - z[0];
  let err = 0;
  for (let i = 0; i < w * h; i++) err = Math.max(err, Math.abs(out[i] - off - z[i]));
  assert.ok(err < 0.02 * A, `max error ${err}`);
});

test('photometric stereo on a shiny shadowed sphere: mean normal error < 3°', () => {
  const w = 96, h = 96, R = 40, lights = [0, 1.5, 3, 4.5, 6, 7.5, 9, 10.5].map((c) => P.lightDir(c, 40));
  const mask = new Uint8Array(w * h), truth = [];
  const imgs = lights.map(() => ({ w, h, r: new Float32Array(w * h), g: new Float32Array(w * h), b: new Float32Array(w * h) }));
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const dx = (x - 48) / R, dy = (y - 48) / R, d2 = dx * dx + dy * dy, i = y * w + x;
      if (d2 >= 1) continue;
      mask[i] = 1;
      const n = [dx, dy, Math.sqrt(1 - d2)];
      truth[i] = n;
      lights.forEach((l, k) => {
        const lam = Math.max(0, n[0] * l[0] + n[1] * l[1] + n[2] * l[2]);
        const hv = [l[0], l[1], l[2] + 1], hl = Math.hypot(...hv);
        const spec = lam > 0 ? 0.6 * Math.max(0, (n[0] * hv[0] + n[1] * hv[1] + n[2] * hv[2]) / hl) ** 60 : 0;
        const v = 0.7 * lam + spec;
        imgs[k].r[i] = v * 1.0;
        imgs[k].g[i] = v * 0.8;
        imgs[k].b[i] = v * 0.4;
      });
    }
  const N = P.photometricStereo(imgs, lights, mask);
  let sum = 0, c = 0;
  for (let i = 0; i < w * h; i++) {
    if (!mask[i] || truth[i][2] < 0.4) continue;
    const t = truth[i], d = Math.min(1, t[0] * N.nx[i] + t[1] * N.ny[i] + t[2] * N.nz[i]);
    sum += (Math.acos(d) * 180) / Math.PI;
    c++;
  }
  assert.ok(sum / c < 3, `mean error ${(sum / c).toFixed(2)}°`);
  // the albedo keeps the gold colour ratio
  const i0 = 48 * w + 48;
  assert.ok(Math.abs(N.albedo.g[i0] / N.albedo.r[i0] - 0.8) < 0.05);
});

test('ellipse fit recovers centre, axes and angle (< 0.5 %)', () => {
  const xs = [], ys = [], e0 = { cx: 412, cy: 305, a: 300, b: 140, theta: 0.12 };
  for (let k = 0; k < 200; k++) {
    const t = (k / 200) * 2 * Math.PI, u = e0.a * Math.cos(t), v = e0.b * Math.sin(t);
    xs.push(e0.cx + u * Math.cos(e0.theta) - v * Math.sin(e0.theta) + Math.sin(k * 7.1) * 0.4);
    ys.push(e0.cy + u * Math.sin(e0.theta) + v * Math.cos(e0.theta) + Math.cos(k * 3.3) * 0.4);
  }
  const e = P.fitEllipse(xs, ys);
  assert.ok(Math.abs(e.cx - e0.cx) < 1 && Math.abs(e.cy - e0.cy) < 1, JSON.stringify(e));
  assert.ok(Math.abs(e.a / e0.a - 1) < 0.005 && Math.abs(e.b / e0.b - 1) < 0.005, JSON.stringify(e));
  assert.ok(Math.abs(Math.sin(e.theta - e0.theta)) < 0.005);
});

/** Silhouettes of a solid (inside(x,y,z) in mm) seen through the turntable camera, for every step. */
function renderViews(inside, ext, cam, W, H, n, stepDeg) {
  const views = [];
  for (let k = 0; k < n; k++) {
    const a = (k * stepDeg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), mask = new Uint8Array(W * H);
    for (let z = 0; z <= ext[2]; z += 0.25)
      for (let y = -ext[1]; y <= ext[1]; y += 0.25)
        for (let x = -ext[0]; x <= ext[0]; x += 0.25) {
          if (!inside(x, y, z)) continue;
          const X = c * x - s * y, Y = s * x + c * y;
          const u = Math.round(cam.o[0] + cam.ex[0] * X + cam.ey[0] * Y + cam.ez[0] * z), v = Math.round(cam.o[1] + cam.ex[1] * X + cam.ey[1] * Y + cam.ez[1] * z);
          if (u >= 0 && v >= 0 && u < W && v < H) mask[v * W + u] = 1;
        }
    views.push({ mask: P.morph(P.morph(mask, W, H, 1, true), W, H, 1, false), w: W, h: H, cam, angle: a });
  }
  return views;
}

test('turntable camera from the ring and the visual hull of a cylinder (two loops): volume within 8 %, closed mesh', () => {
  const e = { cx: 320, cy: 300, a: 280, b: 280 * Math.sin((12 * Math.PI) / 180), theta: 0.03 };
  const cam = P.cameraFromRing(e);
  assert.ok(Math.abs((cam.elevation * 180) / Math.PI - 12) < 0.01, String((cam.elevation * 180) / Math.PI));
  // a 140 mm ring spans 2a pixels
  assert.ok(Math.abs(cam.s * 140 - 560) < 1e-6);
  const inside = (x, y, z) => x * x + y * y <= 100 && z >= 0 && z <= 15;
  // a low loop (12°: silhouettes bound the height; the hull keeps a cone of r·tan(elevation) over flat tops)
  // and a high loop (60°: sees down into holes)
  const cam2 = P.cameraFromRing({ cx: 320, cy: 250, a: 260, b: 260 * Math.sin((60 * Math.PI) / 180), theta: -0.02 });
  const views = [...renderViews(inside, [11, 11, 15], cam, 640, 520, 36, 10), ...renderViews(inside, [11, 11, 15], cam2, 640, 520, 12, 30)];
  const coarse = P.carve(views, { min: [-60, -60, 0], max: [60, 60, 60] }, 60);
  const box = P.hullBox(coarse);
  assert.ok(box && box.max[2] < 26 && box.min[2] === 0, JSON.stringify(box));
  const fine = P.carve(views, box, 90);
  const truth = Math.PI * 100 * 15;
  assert.ok(Math.abs(fine.volume / truth - 1) < 0.08, `${fine.volume} vs ${truth}`);
  const m = P.surfaceNets(fine);
  const oe = P.openEdges(m.index);
  assert.equal(oe.naked, 0);
  const vol = P.meshVolume(m.position, m.index);
  assert.ok(vol > 0 && Math.abs(vol / truth - 1) < 0.1, `mesh ${vol}`);
  // an off-centre block: turning the mat the wrong way carves a much smaller hull, so the sign is detectable
  const block = (x, y, z) => x >= 6 && x <= 14 && y >= -3 && y <= 3 && z >= 0 && z <= 5;
  const bv = renderViews(block, [15, 15, 5], cam, 640, 520, 36, 10);
  const bb = { min: [-20, -20, 0], max: [20, 20, 12] };
  const right = P.carve(bv, bb, 60), wrong = P.carve(bv, bb, 60, { sign: -1 });
  assert.ok(wrong.volume < right.volume * 0.5 && Math.abs(right.volume / 240 - 1) < 0.35, `${wrong.volume} vs ${right.volume}`);
  const sm = P.taubin(m.position, m.index, 4);
  assert.ok(Math.abs(P.meshVolume(sm, m.index) / vol - 1) < 0.03);
});

test('coin solid from height fields is closed; volume = area × thickness + relief', () => {
  const w = 101, h = 101, mask = new Uint8Array(w * h), front = new Float32Array(w * h), back = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if ((x - 50) ** 2 + (y - 50) ** 2 <= 40 * 40) {
        mask[y * w + x] = 1;
        front[y * w + x] = 0.2;
        back[y * w + x] = 0.1;
      }
  const s = P.reliefSolid({ w, h, mask, front, back, pxPerMm: 4, thickness: 1.5, cell: 1 });
  assert.equal(P.openEdges(s.index).naked, 0);
  const area = Math.PI * 100;
  const v = P.meshVolume(s.position, s.index);
  // relief tapers to 0 only at the outline samples; allow 4 % for the pixel outline
  assert.ok(Math.abs(v / (area * 1.8) - 1) < 0.04, `${v} vs ${area * 1.8}`);
  // a round outline snapped to its circle: closed, and the stair-step error is gone (< 1.5 %)
  const c = P.reliefSolid({ w, h, mask, front, back, pxPerMm: 4, thickness: 1.5, cell: 1, circle: { cx: 50, cy: 50, r: 40 } });
  assert.equal(P.openEdges(c.index).naked, 0);
  const vc = P.meshVolume(c.position, c.index);
  assert.ok(Math.abs(vc / (area * 1.8) - 1) < 0.015, `${vc} vs ${area * 1.8}`);
});

test('relief only removes the broad bowl and keeps a 0.3 mm rim', () => {
  const w = 128, h = 128, mask = new Uint8Array(w * h), z = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const r = Math.hypot(x - 64, y - 64);
      if (r > 60) continue;
      mask[y * w + x] = 1;
      z[y * w + x] = 0.002 * r * r + (r > 55 ? 3 : 0); // bowl + rim (pixels)
    }
  const rel = P.reliefOnly(z, mask, w, h, 20);
  const centre = rel[64 * w + 64], rim = rel[64 * w + 64 + 57];
  assert.ok(centre < 1.2 && rim - centre > 1.8, `${centre} ${rim}`);
});
