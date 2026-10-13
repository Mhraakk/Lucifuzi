// اسکن از عکس (spec 0009): the wizard that turns the operator's photos into a studio part.
// Everything runs on this device; no photo leaves the browser.
import { html, fa, toast, $ } from '../core.mjs';
import { fmt } from '../calc.mjs';
import { COIN_TYPES } from '../coins.mjs';
import * as P from '../photoscan.mjs';
import { loadSource } from '../coinphoto.mjs';
import { enc } from '../three/scan3d.mjs';

const GRID = 240; // height-field samples across a relief scan (mesh resolution)
const TEX = 1024; // texture size for colour and fine detail
const CLOCK8 = [12, 1.5, 3, 4.5, 6, 7.5, 9, 10.5];
const CLOCK4 = [12, 3, 6, 9];
const clockLabel = (c) => (Number.isInteger(c) ? `ساعت ${fa(c)}` : `ساعت ${fa(Math.floor(c))}:۳۰`);
const tick = () => new Promise((r) => setTimeout(r, 16));

/* ---------------------------------------------------------------- image I/O */
async function readImage(file, maxSide) {
  const src = await loadSource(file);
  const k = Math.min(1, maxSide / Math.max(src.width, src.height));
  const w = Math.round(src.width * k), h = Math.round(src.height * k);
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingQuality = 'high';
  g.drawImage(src, 0, 0, w, h);
  return { cv, w, h };
}
/** Float channels of a canvas region; linear=true undoes the sRGB curve (needed for shading maths). */
function channels(cv, x0 = 0, y0 = 0, w = cv.width, h = cv.height, linear = true, dx = 0, dy = 0) {
  const tmp = document.createElement('canvas');
  tmp.width = w;
  tmp.height = h;
  const g = tmp.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#000';
  g.fillRect(0, 0, w, h);
  g.drawImage(cv, -x0 + dx, -y0 + dy);
  const d = g.getImageData(0, 0, w, h).data, n = w * h;
  const r = new Float32Array(n), gg = new Float32Array(n), b = new Float32Array(n);
  const lut = new Float32Array(256).map((_, i) => (linear ? (i / 255) ** 2.2 : i / 255));
  for (let i = 0; i < n; i++) (r[i] = lut[d[i * 4]]), (gg[i] = lut[d[i * 4 + 1]]), (b[i] = lut[d[i * 4 + 2]]);
  return { w, h, r, g: gg, b };
}
function toURL(w, h, fill, size = TEX, quality = 0.9) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d');
  const im = g.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const [r, gg, b] = fill(i);
    im.data[i * 4] = r;
    im.data[i * 4 + 1] = gg;
    im.data[i * 4 + 2] = b;
    im.data[i * 4 + 3] = 255;
  }
  g.putImageData(im, 0, 0);
  const k = Math.min(1, size / Math.max(w, h));
  if (k >= 1) return cv.toDataURL('image/jpeg', quality);
  const out = document.createElement('canvas');
  out.width = Math.round(w * k);
  out.height = Math.round(h * k);
  const og = out.getContext('2d');
  og.imageSmoothingQuality = 'high';
  og.drawImage(cv, 0, 0, out.width, out.height);
  return out.toDataURL('image/jpeg', quality);
}
/** Block-average a field to (gw, gh). */
function shrink(f, w, h, gw, gh) {
  const out = new Float32Array(gw * gh);
  for (let y = 0; y < gh; y++)
    for (let x = 0; x < gw; x++) {
      const x0 = Math.floor((x * w) / gw), x1 = Math.max(x0 + 1, Math.floor(((x + 1) * w) / gw)), y0 = Math.floor((y * h) / gh), y1 = Math.max(y0 + 1, Math.floor(((y + 1) * h) / gh));
      let s = 0, c = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) (s += f[yy * w + xx]), c++;
      out[y * gw + x] = s / c;
    }
  return out;
}

/* ---------------------------------------------------------------- method 1: relief by light direction */
/**
 * One side of a coin/plate from N photos. opts: { clocks, elevation, round (coin outline), rotate (deg) }.
 * Returns the side in its own crop: grid size, mask, normals at full crop resolution, texture URLs.
 */
export async function reliefSide(files, { clocks, elevation = 45, round = true, rotate = 0 }, progress = () => {}) {
  if (files.length < 3) throw new Error('برای هر رو دست‌کم ۳ عکس (بهتر ۴ یا ۸) لازم است.');
  progress('خواندن عکس‌ها…');
  const ims = [];
  for (const f of files) ims.push(await readImage(f, 1400));
  const { w, h } = ims[0];
  if (ims.some((im) => im.w !== w || im.h !== h)) throw new Error('اندازه عکس‌ها یکی نیست؛ همه باید با همان گوشی و بدون بُرش گرفته شوند.');
  // small hand shakes: align every photo to the first by phase correlation on a 256² luminance thumbnail
  progress('هم‌ترازی عکس‌ها…');
  const S = 256, k = S / Math.max(w, h);
  const thumbs = ims.map((im) => P.lum(channels(im.cv, 0, 0, w, h, true)));
  const small = thumbs.map((L) => {
    const out = new Float32Array(S * S);
    for (let y = 0; y < Math.round(h * k); y++) for (let x = 0; x < Math.round(w * k); x++) out[y * S + x] = L[Math.min(h - 1, Math.round(y / k)) * w + Math.min(w - 1, Math.round(x / k))];
    return out;
  });
  const shifts = small.map((s, i) => (i ? P.phaseShift(small[0], s, S, S).map((v) => Math.round(v / k)) : [0, 0]));
  await tick();
  // object mask from the brightest reading of every pixel
  progress('جدا کردن قطعه از زمینه…');
  const full = ims.map((im, i) => channels(im.cv, 0, 0, w, h, true, shifts[i][0], shifts[i][1]));
  const Ls = full.map(P.lum), mx = new Float32Array(w * h);
  for (const L of Ls) for (let i = 0; i < w * h; i++) mx[i] = Math.max(mx[i], L[i]);
  const thr = P.otsu(mx);
  let mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) mask[i] = mx[i] > thr ? 1 : 0;
  mask = P.keepLargest(P.morph(P.morph(mask, w, h, 2, false), w, h, 2, true), w, h);
  mask = P.fillHoles(mask, w, h);
  let bx0 = w, by0 = h, bx1 = 0, by1 = 0, cnt = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y * w + x]) ((bx0 = Math.min(bx0, x)), (bx1 = Math.max(bx1, x)), (by0 = Math.min(by0, y)), (by1 = Math.max(by1, y)), cnt++);
  if (cnt < 400) throw new Error('قطعه در عکس پیدا نشد؛ زمینه تیره و مات، قطعه روشن زیر نور.');
  let circle = null;
  if (round) {
    const xs = [], ys = [];
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) if (mask[y * w + x] && (!mask[y * w + x - 1] || !mask[y * w + x + 1] || !mask[(y - 1) * w + x] || !mask[(y + 1) * w + x])) xs.push(x), ys.push(y);
    const e = P.fitRing(xs, ys, 0.85);
    if (!e) throw new Error('لبه گرد سکه پیدا نشد.');
    circle = { cx: e.cx, cy: e.cy, r: (e.a + e.b) / 2 };
    const r0 = circle.r * 1.04;
    (bx0 = Math.floor(circle.cx - r0)), (bx1 = Math.ceil(circle.cx + r0)), (by0 = Math.floor(circle.cy - r0)), (by1 = Math.ceil(circle.cy + r0));
  } else {
    const m = Math.round(0.03 * Math.max(bx1 - bx0, by1 - by0));
    (bx0 -= m), (by0 -= m), (bx1 += m), (by1 += m);
  }
  const cw = bx1 - bx0 + 1, ch = by1 - by0 + 1;
  // the crop, rotated for the back side so it lines up with the front
  const crop = (f) => {
    const out = new Float32Array(cw * ch), a = (rotate * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), ox = cw / 2, oy = ch / 2;
    for (let y = 0; y < ch; y++)
      for (let x = 0; x < cw; x++) {
        const u = c * (x - ox) - s * (y - oy) + ox + bx0, v = s * (x - ox) + c * (y - oy) + oy + by0;
        out[y * cw + x] = u >= 0 && v >= 0 && u < w - 1 && v < h - 1 ? P.sample(f, w, h, u, v) : 0;
      }
    return out;
  };
  const cm = new Uint8Array(cw * ch);
  if (circle) {
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) cm[y * cw + x] = Math.hypot(x + bx0 - circle.cx, y + by0 - circle.cy) <= circle.r * 0.995 ? 1 : 0;
  } else {
    const cmf = crop(Float32Array.from(mask));
    for (let i = 0; i < cw * ch; i++) cm[i] = cmf[i] > 0.5 ? 1 : 0;
  }
  const cimgs = full.map((im) => ({ w: cw, h: ch, r: crop(im.r), g: crop(im.g), b: crop(im.b) }));
  await tick();
  progress('حل جهت سطح برای هر نقطه…');
  const lights = clocks.map((c) => P.lightDir(c, elevation));
  const N = P.photometricStereo(cimgs, lights, cm);
  await tick();
  // height field on the mesh grid (block-averaged normals → gradients → Fourier integration)
  progress('ساخت برجستگی…');
  const gw = cw >= ch ? GRID : Math.max(8, Math.round((GRID * cw) / ch)), gh = ch >= cw ? GRID : Math.max(8, Math.round((GRID * ch) / cw));
  const gm0 = shrink(Float32Array.from(cm), cw, ch, gw, gh), gmask = new Uint8Array(gw * gh);
  for (let i = 0; i < gw * gh; i++) gmask[i] = gm0[i] > 0.5 ? 1 : 0;
  const gnx = shrink(N.nx, cw, ch, gw, gh), gny = shrink(N.ny, cw, ch, gw, gh), gnz = shrink(N.nz, cw, ch, gw, gh);
  const height = P.heightFromNormals({ w: gw, h: gh, nx: gnx, ny: gny, nz: gnz }, gmask);
  const relief = P.reliefOnly(height, gmask, gw, gh, Math.max(gw, gh) / 6);
  await tick();
  // fine detail beyond the mesh: the normals minus their own blur at the mesh's cell size
  progress('ثبت جزئیات ریز (خراش، سایش)…');
  const cell = Math.max(1, Math.round((cw / gw) * 1.5));
  const lx = P.maskedBlur(N.nx, cm, cw, ch, cell), ly = P.maskedBlur(N.ny, cm, cw, ch, cell);
  const inner = P.morph(cm, cw, ch, 2, false); // the outline's own pixels carry edge noise, keep them flat
  const normalURL = toURL(cw, ch, (i) => {
    if (!inner[i]) return [128, 128, 255];
    const x = N.nx[i] - lx[i], y = N.ny[i] - ly[i], l = Math.hypot(x, y, 1);
    return [Math.round((x / l) * 127.5 + 127.5), Math.round((-y / l) * 127.5 + 127.5), Math.round((1 / l) * 127.5 + 127.5)];
  });
  // colour without the lighting (albedo), back to sRGB, white point at the 99th percentile
  const vals = [];
  for (let i = 0; i < cw * ch; i += 7) if (cm[i]) vals.push(Math.max(N.albedo.r[i], N.albedo.g[i], N.albedo.b[i]));
  vals.sort((a, b) => a - b);
  const top = vals[Math.floor(vals.length * 0.99)] || 1;
  let ar = 0, ag = 0, ab = 0, ac = 0;
  const colorURL = toURL(cw, ch, (i) => {
    if (!cm[i]) return [40, 40, 40];
    const c = [N.albedo.r[i], N.albedo.g[i], N.albedo.b[i]].map((v) => Math.min(1, v / top));
    (ar += c[0]), (ag += c[1]), (ab += c[2]), ac++;
    return c.map((v) => Math.round(v ** (1 / 2.2) * 255));
  });
  const gcircle = circle ? { cx: (circle.cx - bx0) * (gw / cw), cy: (circle.cy - by0) * (gh / ch), r: circle.r * (gw / cw) * 0.995 } : null;
  return { gw, gh, gmask, relief, circle: gcircle, cw, colorURL, normalURL, albedo: ac ? [ar / ac, ag / ac, ab / ac] : [0.8, 0.7, 0.4], photos: files.length };
}

/** Scan JSON for a relief part (heights converted from grid pixels to mm). */
export function reliefScan(front, back, { widthMm, thickness, weight, density, coin }) {
  const { gw, gh, gmask } = front;
  // scale: the outline's width in grid pixels is widthMm (the coin's diameter, or the measured width)
  let x0 = gw, x1 = 0;
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) if (gmask[y * gw + x]) (x0 = Math.min(x0, x)), (x1 = Math.max(x1, x));
  const pxmm = (x1 - x0 + 1) / widthMm;
  const toMm = (f) => Float32Array.from(f, (v) => v / pxmm);
  const fr = toMm(front.relief);
  let bk = null;
  if (back) {
    // resample the back into the front's grid
    bk = new Float32Array(gw * gh);
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) bk[y * gw + x] = gmask[y * gw + x] ? P.sample(back.relief, back.gw, back.gh, (x * (back.gw - 1)) / (gw - 1), (y * (back.gh - 1)) / (gh - 1)) / pxmm : 0;
  }
  let area = 0, rel = 0;
  for (let i = 0; i < gw * gh; i++) if (gmask[i]) (area += 1 / pxmm ** 2), (rel += (fr[i] + (bk?.[i] ?? 0)) / pxmm ** 2);
  let t = thickness, tFrom = 'کولیس', tKind = 'caliper';
  if (!(t > 0) && weight > 0 && density > 0) (t = Math.max(0.2, ((weight / density) * 1000 - rel) / area)), (tFrom = 'وزن و چگالی اسمی'), (tKind = 'weight');
  if (!(t > 0)) (t = 1.5), (tFrom = 'پیش‌فرض؛ با وزن در آب یا کولیس دقیق می‌شود'), (tKind = 'default');
  return {
    json: JSON.stringify({
      k: 'relief',
      w: gw,
      h: gh,
      pxmm,
      t,
      cell: 1,
      mask: enc.mask(gmask),
      circle: front.circle,
      front: enc.f32(fr),
      back: bk ? enc.f32(bk) : null,
      colorF: front.colorURL,
      normalF: front.normalURL,
      colorB: back?.colorURL ?? null,
      normalB: back?.normalURL ?? null,
      info: { method: 'relief', coin, widthMm, thickness: t, thicknessFrom: tFrom, tKind, photos: front.photos + (back?.photos ?? 0), albedo: front.albedo, at: Date.now() },
    }),
    thickness: t,
    tFrom,
    maxRelief: Math.max(...fr),
  };
}

/* ---------------------------------------------------------------- method 2: turntable silhouettes */
export function matSVG() {
  const C = 105, CY = 150, R = P.MAT.ring / 2, band = P.MAT.ringBand;
  const ticks = [];
  for (let d = 0; d < 360; d += P.MAT.step) {
    const a = ((d - 90) * Math.PI) / 180, r0 = R + band / 2 + 3, r1 = r0 + (d % 90 ? 4 : 7);
    ticks.push(`<line x1="${(C + r0 * Math.cos(a)).toFixed(2)}" y1="${(CY + r0 * Math.sin(a)).toFixed(2)}" x2="${(C + r1 * Math.cos(a)).toFixed(2)}" y2="${(CY + r1 * Math.sin(a)).toFixed(2)}" stroke="#000" stroke-width="0.8"/>`);
    const rt = r1 + 4;
    ticks.push(`<text x="${(C + rt * Math.cos(a)).toFixed(2)}" y="${(CY + rt * Math.sin(a) + 1.2).toFixed(2)}" font-size="3.2" text-anchor="middle" fill="#000" font-family="sans-serif">${d / P.MAT.step}</text>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="210mm" height="297mm" viewBox="0 0 210 297">
<rect width="210" height="297" fill="#fff"/>
<circle cx="${C}" cy="${CY}" r="${R}" fill="none" stroke="#000" stroke-width="${band}"/>
${ticks.join('\n')}
<line x1="${C - 3}" y1="${CY}" x2="${C + 3}" y2="${CY}" stroke="#ccc" stroke-width="0.3"/><line x1="${C}" y1="${CY - 3}" x2="${C}" y2="${CY + 3}" stroke="#ccc" stroke-width="0.3"/>
<line x1="55" y1="262" x2="155" y2="262" stroke="#000" stroke-width="0.6"/><line x1="55" y1="259" x2="55" y2="265" stroke="#000" stroke-width="0.6"/><line x1="155" y1="259" x2="155" y2="265" stroke="#000" stroke-width="0.6"/>
<text x="105" y="270" font-size="4" text-anchor="middle" fill="#555" font-family="sans-serif">100 mm — check with a ruler; print at 100 % (no scaling)</text>
<text x="105" y="20" font-size="5" text-anchor="middle" fill="#555" font-family="sans-serif">Beatris turntable mat · ring ${P.MAT.ring} mm · step ${P.MAT.step}°</text>
</svg>`;
}
/** Mat ring and object silhouette in one photo. kind: 'gold' (saturated) | 'white' (differs from the paper). */
export function analysePhoto(img, { kind = 'gold', sat = 0.22, white = 0.12 }) {
  const { w, h, r, g, b } = img, n = w * h;
  const S = new Float32Array(n), V = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const mx = Math.max(r[i], g[i], b[i]), mn = Math.min(r[i], g[i], b[i]);
    V[i] = mx;
    S[i] = mx > 0 ? (mx - mn) / mx : 0;
  }
  const dark = new Uint8Array(n);
  for (let i = 0; i < n; i++) dark[i] = V[i] < 0.33 && S[i] < 0.3 ? 1 : 0;
  let pts = P.ringPoints(dark, w, h, w / 2, h / 2);
  let e = P.fitRing(pts.xs, pts.ys);
  if (e) {
    pts = P.ringPoints(dark, w, h, e.cx, e.cy);
    e = P.fitRing(pts.xs, pts.ys) ?? e;
  }
  if (!e || !(e.a > 0.15 * Math.min(w, h)) || !(e.b / e.a > 0.08)) return { ok: false };
  // paper brightness inside the ring
  const pv = [];
  for (let k = 0; k < 400; k++) {
    const a = (k / 400) * 2 * Math.PI, rr = 0.75 + 0.12 * ((k * 7) % 5) / 5, x = Math.round(e.cx + rr * e.a * Math.cos(a) * Math.cos(e.theta) - rr * e.b * Math.sin(a) * Math.sin(e.theta)), y = Math.round(e.cy + rr * e.a * Math.cos(a) * Math.sin(e.theta) + rr * e.b * Math.sin(a) * Math.cos(e.theta));
    if (x >= 0 && y >= 0 && x < w && y < h) pv.push(V[y * w + x]);
  }
  pv.sort((a, b) => a - b);
  const paper = pv[Math.floor(pv.length * 0.7)] ?? 0.9;
  let m = new Uint8Array(n);
  for (let i = 0; i < n; i++) m[i] = kind === 'gold' ? (S[i] > sat && V[i] > 0.12 ? 1 : 0) : !dark[i] && Math.abs(V[i] - paper) > white ? 1 : 0;
  m = P.morph(P.morph(m, w, h, 1, false), w, h, 1, true);
  m = P.morph(P.morph(m, w, h, 2, true), w, h, 2, false);
  // keep only blobs that touch the inner disc (a coloured table outside the mat is not the piece)
  const inner = (x, y) => {
    const c = Math.cos(e.theta), s = Math.sin(e.theta), dx = x - e.cx, dy = y - e.cy;
    return ((dx * c + dy * s) / e.a) ** 2 + ((-dx * s + dy * c) / e.b) ** 2 < 0.8;
  };
  const lab = new Int32Array(n), keep = [false], st = [];
  let id = 0;
  for (let i = 0; i < n; i++) {
    if (!m[i] || lab[i]) continue;
    id++;
    let touch = false;
    st.push(i);
    lab[i] = id;
    while (st.length) {
      const j = st.pop(), x = j % w, y = (j / w) | 0;
      if (!touch && inner(x, y)) touch = true;
      for (const q of [x > 0 ? j - 1 : -1, x < w - 1 ? j + 1 : -1, y > 0 ? j - w : -1, y < h - 1 ? j + w : -1]) if (q >= 0 && m[q] && !lab[q]) (lab[q] = id), st.push(q);
    }
    keep.push(touch);
  }
  const mask = new Uint8Array(n);
  let area = 0;
  for (let i = 0; i < n; i++) if (lab[i] && keep[lab[i]]) (mask[i] = 1), area++;
  return { ok: area > 50, e, cam: P.cameraFromRing(e), mask, area };
}
/** Full hull reconstruction. photos: [{ img (sRGB floats), mask, cam }] in shooting order. */
export async function hullScan(photos, { step = P.MAT.step, res = 160 }, progress = () => {}) {
  const perLoop = Math.round(360 / step);
  const views = photos.map((p, i) => ({ ...p, w: p.img.w, h: p.img.h, angle: (((i % perLoop) * step) * Math.PI) / 180 }));
  progress('برش حجم با سایه‌نماها (درشت)…');
  await tick();
  const big = { min: [-62, -62, 0], max: [62, 62, 90] };
  const a = P.carve(views, big, 64), b2 = P.carve(views, big, 64, { sign: -1 });
  const sign = a.kept >= b2.kept ? 1 : -1, coarse = sign > 0 ? a : b2;
  const box = P.hullBox(coarse);
  if (!box) throw new Error('حجمی باقی نماند؛ سایه‌نماها با هم نمی‌خوانند (ترتیب عکس‌ها یا گام چرخش را بررسی کنید).');
  progress('برش حجم (ریز)…');
  await tick();
  const fine = P.carve(views, box, res, { sign });
  progress('ساخت سطح و رنگ…');
  await tick();
  const m = P.surfaceNets(fine);
  const pos = P.taubin(m.position, m.index, 10);
  const nor = P.vertexNormals(pos, m.index);
  const col = P.colorize(pos, nor, views.map((v) => ({ img: v.img, cam: v.cam, angle: v.angle })), sign);
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) (lo[k] = Math.min(lo[k], pos[i + k])), (hi[k] = Math.max(hi[k], pos[i + k]));
  const size = [0, 1, 2].map((k) => hi[k] - lo[k]);
  // the mat frame is z-up; the studio is y-up: (x, y, z) → (x, z, −y), a proper rotation (winding kept)
  const yup = new Float32Array(pos.length);
  for (let i = 0; i < pos.length; i += 3) (yup[i] = pos[i]), (yup[i + 1] = pos[i + 2]), (yup[i + 2] = -pos[i + 1]);
  return {
    json: JSON.stringify({ k: 'hull', p: enc.f32(yup), i: enc.u32(m.index), c: enc.u8(col), info: { method: 'hull', photos: photos.length, vox: fine.vox, size, at: Date.now() } }),
    volume: P.meshVolume(pos, m.index),
    vox: fine.vox,
    size,
    sign,
  };
}

/* ---------------------------------------------------------------- the dialog */
const guideRelief = html`<svg viewBox="0 0 220 130" class="scan-guide" aria-hidden="true"><rect x="0" y="0" width="220" height="130" rx="10" fill="#111"/><circle cx="110" cy="72" r="22" fill="#c9a24e"/><circle cx="110" cy="72" r="16" fill="none" stroke="#8a6a22"/><rect x="100" y="8" width="20" height="12" rx="2" fill="#ddd"/><text x="125" y="17" font-size="8" fill="#ddd">گوشی ثابت، رو به پایین</text>${CLOCK8.map((c, i) => {
  const a = ((c / 12) * 2 * Math.PI) - Math.PI / 2, x = 110 + 48 * Math.cos(a), y = 72 + 48 * Math.sin(a);
  return html`<circle cx="${x}" cy="${y}" r="7" fill="#f0c75e"/><text x="${x}" y="${y + 3}" font-size="8" text-anchor="middle" fill="#111">${fa(i + 1)}</text>`;
})}</svg>`;

export function scanDialog(ctx) {
  const st = { tab: 'relief' };
  const coins = Object.entries(COIN_TYPES);
  ctx.modal(
    String(html`<div class="scan" id="scan">
      <h3 class="bk-h">اسکن سه‌بعدی از عکس <span class="small">پردازش روی همین دستگاه؛ عکسی ارسال نمی‌شود</span></h3>
      <div class="chips" role="tablist"><button class="chip" data-stab="relief" aria-pressed="true">سکه، پلاک و شمش · نور از چند جهت</button><button class="chip" data-stab="hull" aria-pressed="false">انگشتر و قطعه سه‌بعدی · عکس دور تا دور</button></div>
      <form class="form" id="scR">
        <div class="scan-how">${guideRelief}<ol class="small">
          <li>قطعه روی پارچه تیره و مات؛ چراغ اتاق خاموش.</li>
          <li>گوشی روی پایه، درست بالای قطعه؛ فوکوس و نوردهی را قفل کنید (لمس طولانی روی صفحه).</li>
          <li>با چراغ‌قوه گوشی دوم، از فاصله ثابت (حدود ۳۰ سانتی‌متر) و زاویه حدود ۴۵°، به ترتیب شماره‌ها از هر جهت یک عکس.</li>
          <li>قطعه و گوشی نباید تکان بخورند. برای پشت قطعه، آن را برگردانید و همین کار را تکرار کنید.</li></ol></div>
        <div class="form cols">
          <label class="field">قطعه<select class="input" name="coin"><option value="">قطعه آزاد (پلاک، شمش، مدال)</option>${coins.map(([id, c]) => html`<option value="${id}">${c.label} — قطر ${fa(c.diameter)} mm</option>`)}</select></label>
          <label class="field">عرض قطعه (mm) — برای قطعه آزاد<input class="input ltr" name="width" type="number" step="0.01" min="2" max="200" placeholder="مثلاً ۲۲٫۰۰"></label>
          <label class="field">ترتیب نورها<select class="input" name="order"><option value="8">۸ عکس: ساعت ۱۲، ۱:۳۰، ۳، … (پیشنهادی)</option><option value="4">۴ عکس: ساعت ۱۲، ۳، ۶، ۹</option></select></label>
          <label class="field">زاویه نور از سطح میز (درجه)<input class="input ltr" name="elev" type="number" value="45" min="15" max="80"></label>
          <label class="field">ضخامت با کولیس (mm، اختیاری)<input class="input ltr" name="thick" type="number" step="0.01" min="0.2" max="30"></label>
          <label class="field">وزن ترازو (گرم، اختیاری)<input class="input ltr" name="weight" type="number" step="0.001" min="0.01" max="5000"></label>
        </div>
        <label class="field">عکس‌های روی قطعه (به ترتیب شماره)<input class="input" type="file" name="front" accept="image/*" multiple required></label>
        <label class="field">عکس‌های پشت قطعه (اختیاری)<input class="input" type="file" name="back" accept="image/*" multiple></label>
        <label class="field xs">چرخش پشت نسبت به رو (درجه)<input class="input ltr" name="rot" type="number" value="0" min="-180" max="180"></label>
        <p class="small" id="scMsg" aria-live="polite"></p>
        <div class="actions"><button class="btn">ساخت مدل سه‌بعدی</button><button type="button" class="btn ghost" data-close>بستن</button></div>
      </form>
      <form class="form" id="scH" hidden>
        <div class="scan-how"><svg viewBox="0 0 220 130" class="scan-guide" aria-hidden="true"><rect width="220" height="130" rx="10" fill="#f4f1ea"/><ellipse cx="110" cy="86" rx="70" ry="22" fill="none" stroke="#111" stroke-width="6"/><ellipse cx="110" cy="80" rx="13" ry="9" fill="none" stroke="#c9a24e" stroke-width="5"/><path d="M178 86a68 22 0 0 1-14 13" stroke="#888" fill="none" marker-end="url(#ar)"/><rect x="18" y="10" width="22" height="13" rx="2" fill="#333"/><path d="m40 18 50 55" stroke="#bbb" stroke-dasharray="3 3"/><text x="200" y="118" font-size="8" text-anchor="end" fill="#333">گوشی روی پایه، زاویه کم</text></svg><ol class="small">
          <li><button type="button" class="btn small ghost" data-mat>دریافت صفحه چرخان چاپی</button> با چاپ ۱۰۰٪ (خط ۱۰۰ میلی‌متری را با خط‌کش بسنجید).</li>
          <li>قطعه وسط دایره؛ نور یکنواخت و بی‌سایه (کنار پنجره، بدون آفتاب مستقیم).</li>
          <li>دور اول: گوشی ثابت با زاویه کم (۱۰ تا ۲۰ درجه از سطح میز). بعد از هر عکس کاغذ را یک درجه‌بندی (۱۰°) بچرخانید: ۳۶ عکس.</li>
          <li>دور دوم (اختیاری، برای داخل حلقه): گوشی با زاویه بیشتر (۵۰ تا ۷۰ درجه)، باز ۳۶ عکس.</li>
          <li>حلقه سیاه کاغذ باید در همه عکس‌ها کامل دیده شود.</li></ol></div>
        <div class="form cols">
          <label class="field">جنس قطعه<select class="input" name="kind"><option value="gold">طلای زرد یا رز</option><option value="white">طلای سفید، نقره، پلاتین</option></select></label>
          <label class="field">گام چرخش (درجه)<input class="input ltr" name="step" type="number" value="10" min="2" max="45"></label>
          <label class="field">دقت<select class="input" name="res"><option value="120">معمولی</option><option value="160" selected>بالا</option><option value="200">خیلی بالا (کندتر)</option></select></label>
          <label class="field">حساسیت جدا کردن قطعه<input type="range" name="sat" min="0.08" max="0.5" step="0.01" value="0.22"></label>
        </div>
        <label class="field">عکس‌ها (به ترتیب گرفتن)<input class="input" type="file" name="photos" accept="image/*" multiple required></label>
        <canvas id="scPrev" class="scan-prev" width="480" height="320" hidden></canvas>
        <p class="small" id="shMsg" aria-live="polite"></p>
        <div class="actions"><button class="btn">ساخت مدل سه‌بعدی</button><button type="button" class="btn ghost" data-close>بستن</button></div>
      </form>
    </div>`),
    (m, close) => {
      const fr = $('#scR', m), fh = $('#scH', m);
      m.addEventListener('click', (e) => {
        const t = e.target.closest('[data-stab]');
        if (t) {
          st.tab = t.dataset.stab;
          m.querySelectorAll('[data-stab]').forEach((x) => x.setAttribute('aria-pressed', String(x === t)));
          fr.hidden = st.tab !== 'relief';
          fh.hidden = st.tab !== 'hull';
        }
        if (e.target.closest('[data-close]')) close();
        if (e.target.closest('[data-mat]')) {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(new Blob([matSVG()], { type: 'image/svg+xml' }));
          a.download = 'beatris-turntable-mat.svg';
          document.body.append(a);
          a.click();
          setTimeout(() => (URL.revokeObjectURL(a.href), a.remove()), 1500);
        }
      });
      const busy = (form, on) => form.querySelector('button.btn:not(.ghost)').classList.toggle('is-busy', on);
      fr.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const fd = new FormData(fr), say = (s) => ($('#scMsg', m).textContent = s);
        const sort = (l) => [...l].filter((f) => f.size).sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));
        const front = sort(fd.getAll('front')), back = sort(fd.getAll('back'));
        const n = Number(fd.get('order')), clocksFor = (k) => (k === 4 ? CLOCK4 : k === 8 ? CLOCK8 : Array.from({ length: k }, (_, i) => (i * 12) / k));
        const coin = fd.get('coin'), c = COIN_TYPES[coin];
        const widthMm = c ? c.diameter : Number(fd.get('width'));
        if (!(widthMm > 0)) return say('عرض قطعه را وارد کنید (برای سکه رسمی خودکار است).');
        if (front.length !== n && front.length !== 4 && front.length !== 8) say(`تعداد عکس‌ها ${fa(front.length)} است؛ جهت نورها به‌صورت مساوی دور ساعت فرض می‌شود.`);
        busy(fr, true);
        try {
          const elev = Math.min(80, Math.max(15, Number(fd.get('elev')) || 45));
          const F = await reliefSide(front, { clocks: front.length === n ? clocksFor(n) : clocksFor(front.length), elevation: elev, round: !!c }, (s) => say(`روی قطعه: ${s}`));
          const B = back.length ? await reliefSide(back, { clocks: back.length === n ? clocksFor(n) : clocksFor(back.length), elevation: elev, round: !!c, rotate: Number(fd.get('rot')) || 0 }, (s) => say(`پشت قطعه: ${s}`)) : null;
          const weight = Number(fd.get('weight')) || 0;
          const r = reliefScan(F, B, { widthMm, thickness: Number(fd.get('thick')) || 0, weight, density: c?.density ?? 0, coin: coin || null });
          await ctx.addScan(r.json, c ? `اسکن ${c.short}` : 'اسکن قطعه', { weight });
          close();
          toast(`مدل ساخته شد: ${fa(F.photos + (B?.photos ?? 0))} عکس · بیشترین برجستگی ${fmt(r.maxRelief, 2)} mm · ضخامت ${fmt(r.thickness, 2)} mm (${r.tFrom})`, 'ok');
        } catch (err) {
          if (!/[؀-ۿ]/.test(err?.message ?? '')) console.error(err);
          say(err.message || 'ساخت مدل ممکن نشد.');
        } finally {
          busy(fr, false);
        }
      });
      // turntable: preview of the first photo (ring + silhouette) whenever the files or the sensitivity change
      let cache = null;
      const prev = async () => {
        const fd = new FormData(fh), files = [...fd.getAll('photos')].filter((f) => f.size);
        const cv = $('#scPrev', m);
        if (!files.length) return (cv.hidden = true);
        if (!cache || cache.file !== files[0]) cache = { file: files[0], im: await readImage(files[0], 1000) };
        const img = channels(cache.im.cv, 0, 0, cache.im.w, cache.im.h, false);
        const a = analysePhoto(img, { kind: fd.get('kind'), sat: Number(fd.get('sat')) });
        cv.hidden = false;
        cv.width = cache.im.w;
        cv.height = cache.im.h;
        const g = cv.getContext('2d');
        g.drawImage(cache.im.cv, 0, 0);
        if (!a.ok) return ($('#shMsg', m).textContent = 'حلقه سیاه صفحه چرخان در عکس اول پیدا نشد.');
        const od = g.getImageData(0, 0, cv.width, cv.height);
        for (let i = 0; i < a.mask.length; i++) if (a.mask[i]) (od.data[i * 4] = 40), (od.data[i * 4 + 1] = 220), (od.data[i * 4 + 2] = 120);
        g.putImageData(od, 0, 0);
        g.strokeStyle = '#ff3b30';
        g.lineWidth = 3;
        g.beginPath();
        g.ellipse(a.e.cx, a.e.cy, a.e.a, a.e.b, a.e.theta, 0, Math.PI * 2);
        g.stroke();
        $('#shMsg', m).textContent = `عکس اول: زاویه دوربین ${fa(Math.round((a.cam.elevation * 180) / Math.PI))}° · مقیاس ${fmt(a.cam.s, 1)} پیکسل در میلی‌متر. سبز = قطعه؛ اگر زمینه هم سبز شده، حساسیت را بالا ببرید.`;
      };
      fh.addEventListener('change', () => prev().catch(() => {}));
      fh.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const fd = new FormData(fh), say = (s) => ($('#shMsg', m).textContent = s);
        const files = [...fd.getAll('photos')].filter((f) => f.size).sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));
        if (files.length < 8) return say('دست‌کم ۸ عکس دور تا دور لازم است (پیشنهاد: ۳۶).');
        busy(fh, true);
        try {
          const photos = [];
          let bad = 0;
          for (const [i, f] of files.entries()) {
            say(`تحلیل عکس ${fa(i + 1)} از ${fa(files.length)}…`);
            const im = await readImage(f, 1000);
            const img = channels(im.cv, 0, 0, im.w, im.h, false);
            const a = analysePhoto(img, { kind: fd.get('kind'), sat: Number(fd.get('sat')) });
            if (a.ok) photos.push({ img, mask: a.mask, cam: a.cam });
            else (bad++, photos.push({ img, mask: new Uint8Array(img.w * img.h).fill(1), cam: P.cameraFromRing({ cx: img.w / 2, cy: img.h / 2, a: img.w / 3, b: img.w / 6, theta: 0 }) }));
            await tick();
          }
          if (bad > files.length / 3) throw new Error(`در ${fa(bad)} عکس حلقه سیاه صفحه پیدا نشد؛ حلقه باید کامل و واضح دیده شود.`);
          const r = await hullScan(photos, { step: Number(fd.get('step')) || 10, res: Number(fd.get('res')) || 160 }, say);
          await ctx.addScan(r.json, 'اسکن دور تا دور', {});
          close();
          toast(`مدل ساخته شد: ${fa(files.length)} عکس · ابعاد ${r.size.map((v) => fmt(v, 1)).join(' × ')} mm · دقت ${fmt(r.vox, 2)} mm${bad ? ` · ${fa(bad)} عکس کنار گذاشته شد` : ''}`, 'ok');
        } catch (err) {
          if (!/[؀-ۿ]/.test(err?.message ?? '')) console.error(err);
          say(err.message || 'ساخت مدل ممکن نشد.');
        } finally {
          busy(fh, false);
        }
      });
    },
  );
}
