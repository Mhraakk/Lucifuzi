// اسکن سه‌بعدی از عکس (spec 0009) — the numerical core, free of DOM and three.js so it is tested in Node.
// Images are { w, h, r, g, b } with Float32Array channels in 0..1 (linear enough for phone JPEGs at this use).
// 1. Photometric stereo: N photos, fixed camera, light from known clock directions → normals + albedo,
//    then the height field by Fourier integration (Frankot–Chellappa) and a closed solid for a coin/plate.
// 2. Shape from silhouette on a printed turntable mat: the mat's reference ring gives scale and camera tilt
//    in every photo (weak perspective), the rotation step gives the view; voxels outside any silhouette are
//    carved away and the hull becomes a closed mesh by surface nets, coloured from the best-facing photo.

/* ================================================================== FFT */
/** In-place radix-2 complex FFT. n must be a power of two. */
export function fft(re, im, inverse = false) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        [cr, ci] = [cr * wr - ci * wi, cr * wi + ci * wr];
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) (re[i] /= n), (im[i] /= n);
}
/** 2-D FFT of a w×h (powers of two) complex field stored row-major. */
export function fft2(re, im, w, h, inverse = false) {
  const rr = new Float64Array(w), ri = new Float64Array(w);
  for (let y = 0; y < h; y++) {
    const o = y * w;
    for (let x = 0; x < w; x++) (rr[x] = re[o + x]), (ri[x] = im[o + x]);
    fft(rr, ri, inverse);
    for (let x = 0; x < w; x++) (re[o + x] = rr[x]), (im[o + x] = ri[x]);
  }
  const cr = new Float64Array(h), ci = new Float64Array(h);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) (cr[y] = re[y * w + x]), (ci[y] = im[y * w + x]);
    fft(cr, ci, inverse);
    for (let y = 0; y < h; y++) (re[y * w + x] = cr[y]), (im[y * w + x] = ci[y]);
  }
}
export const pow2 = (n) => 2 ** Math.ceil(Math.log2(Math.max(2, n)));

/* ================================================================== integration */
/**
 * Height z(x, y) (in pixels, +z toward the camera) from its gradients p = ∂z/∂x, q = ∂z/∂y (image y down),
 * least squares over the whole field (Frankot–Chellappa). The field is padded by mirroring to kill wrap-around.
 */
export function integrate(p, q, w, h) {
  const W = pow2(w * 2), H = pow2(h * 2);
  const P = new Float64Array(W * H), Pi = new Float64Array(W * H), Q = new Float64Array(W * H), Qi = new Float64Array(W * H);
  // even mirror of z ⇒ p is odd in x and even in y, q the reverse
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (x >= 2 * w || y >= 2 * h) continue;
      const mx = x < w ? x : 2 * w - 1 - x, my = y < h ? y : 2 * h - 1 - y;
      const sx = x < w ? 1 : -1, sy = y < h ? 1 : -1;
      P[y * W + x] = sx * p[my * w + mx];
      Q[y * W + x] = sy * q[my * w + mx];
    }
  fft2(P, Pi, W, H);
  fft2(Q, Qi, W, H);
  const Z = new Float64Array(W * H), Zi = new Float64Array(W * H);
  for (let v = 0; v < H; v++) {
    const wy = ((v < H / 2 ? v : v - H) * 2 * Math.PI) / H;
    for (let u = 0; u < W; u++) {
      const wx = ((u < W / 2 ? u : u - W) * 2 * Math.PI) / W;
      const d = wx * wx + wy * wy, i = v * W + u;
      if (!d) continue;
      // Z = (−i·wx·P − i·wy·Q) / d  with  −i·(a + ib) = b − ia
      Z[i] = (wx * Pi[i] + wy * Qi[i]) / d;
      Zi[i] = -(wx * P[i] + wy * Q[i]) / d;
    }
  }
  fft2(Z, Zi, W, H, true);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[y * w + x] = Z[y * W + x];
  return out;
}

/* ================================================================== photometric stereo */
/** Light direction for a clock position (12 = top of the photo, 3 = right) at an elevation above the table. */
export function lightDir(clock, elevationDeg = 45) {
  const az = ((clock % 12) / 12) * 2 * Math.PI, el = (elevationDeg * Math.PI) / 180;
  return [Math.sin(az) * Math.cos(el), -Math.cos(az) * Math.cos(el), Math.sin(el)];
}
export const lum = (img) => {
  const n = img.w * img.h, L = new Float32Array(n);
  for (let i = 0; i < n; i++) L[i] = 0.2126 * img.r[i] + 0.7152 * img.g[i] + 0.0722 * img.b[i];
  return L;
};
const inv3 = (m) => {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) return null;
  return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, -(a * f - c * d) / det, C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
};
/**
 * images: N ≥ 3 photos of the same size, lights: N unit vectors, mask: Uint8Array (1 = object).
 * Per pixel the brightest reading (specular glint on metal) is dropped when N ≥ 5, the darkest (cast shadow)
 * when N ≥ 7, and readings below 2 % of the pixel's maximum always; the rest is solved by least squares.
 * Each photo is first normalised by its mean over the object, so unequal torch distances do not tilt normals.
 * Returns { nx, ny, nz, albedo: {r,g,b}, used } (used = readings kept, for a quality map).
 */
export function photometricStereo(images, lights, mask) {
  const N = images.length, { w, h } = images[0], n = w * h;
  if (N < 3) throw new Error('دست‌کم سه عکس با نور از جهت‌های مختلف لازم است.');
  const Ls = images.map(lum);
  const gain = Ls.map((L) => {
    let s = 0, c = 0;
    for (let i = 0; i < n; i++) if (mask[i]) (s += L[i]), c++;
    return c && s ? c / s : 1;
  });
  const meanGain = gain.reduce((a, b) => a + b, 0) / N;
  for (let k = 0; k < N; k++) gain[k] /= meanGain;
  const nx = new Float32Array(n), ny = new Float32Array(n), nz = new Float32Array(n).fill(1);
  const ar = new Float32Array(n), ag = new Float32Array(n), ab = new Float32Array(n), used = new Uint8Array(n);
  const vals = new Array(N), idx = new Array(N);
  for (let i = 0; i < n; i++) {
    if (!mask[i]) continue;
    let mx = 0;
    for (let k = 0; k < N; k++) (vals[k] = Ls[k][i] * gain[k]), (idx[k] = k), (mx = Math.max(mx, vals[k]));
    idx.sort((a, b) => vals[a] - vals[b]);
    let lo = 0, hi = N;
    if (N >= 5) hi--;
    if (N >= 7) lo++;
    while (lo < hi && vals[idx[lo]] < 0.02 * mx) lo++;
    if (hi - lo < 3) (lo = Math.max(0, hi - 3));
    // normal equations (LᵀL) g = LᵀI
    const M = [0, 0, 0, 0, 0, 0, 0, 0, 0], v = [0, 0, 0];
    for (let t = lo; t < hi; t++) {
      const k = idx[t], l = lights[k], I = vals[k];
      for (let r = 0; r < 3; r++) {
        v[r] += l[r] * I;
        for (let c = 0; c < 3; c++) M[r * 3 + c] += l[r] * l[c];
      }
    }
    const Mi = inv3(M);
    if (!Mi) continue;
    const g0 = Mi[0] * v[0] + Mi[1] * v[1] + Mi[2] * v[2], g1 = Mi[3] * v[0] + Mi[4] * v[1] + Mi[5] * v[2], g2 = Mi[6] * v[0] + Mi[7] * v[1] + Mi[8] * v[2];
    const rho = Math.hypot(g0, g1, g2);
    if (!(rho > 1e-6)) continue;
    let z = g2 / rho;
    if (z < 0.05) z = 0.05; // a surface facing away from the camera cannot be photographed
    const s = Math.hypot(g0 / rho, g1 / rho, z);
    nx[i] = g0 / rho / s;
    ny[i] = g1 / rho / s;
    nz[i] = z / s;
    used[i] = hi - lo;
    // colour albedo: per channel least squares against the shading of the solved normal
    let sh2 = 0, sr = 0, sg = 0, sb = 0;
    for (let t = lo; t < hi; t++) {
      const k = idx[t], l = lights[k], sh = Math.max(0, l[0] * nx[i] + l[1] * ny[i] + l[2] * nz[i]);
      sh2 += sh * sh;
      sr += sh * images[k].r[i] * gain[k];
      sg += sh * images[k].g[i] * gain[k];
      sb += sh * images[k].b[i] * gain[k];
    }
    if (sh2 > 0) (ar[i] = Math.min(1, sr / sh2)), (ag[i] = Math.min(1, sg / sh2)), (ab[i] = Math.min(1, sb / sh2));
  }
  return { w, h, nx, ny, nz, albedo: { r: ar, g: ag, b: ab }, used };
}
/** Height field (pixels) from a normal field; outside the mask the surface is held flat. */
export function heightFromNormals({ w, h, nx, ny, nz }, mask) {
  const p = new Float32Array(w * h), q = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (!mask[i]) continue;
    const z = Math.max(0.15, nz[i]);
    p[i] = Math.max(-6, Math.min(6, -nx[i] / z));
    q[i] = Math.max(-6, Math.min(6, -ny[i] / z));
  }
  return integrate(p, q, w, h);
}

/* ================================================================== image helpers */
export function otsu(values, bins = 256) {
  const hist = new Float64Array(bins);
  let n = 0;
  for (const v of values) (hist[Math.min(bins - 1, Math.max(0, Math.floor(v * bins)))]++), n++;
  let sum = 0;
  for (let i = 0; i < bins; i++) sum += i * hist[i];
  let sB = 0, wB = 0, best = 0, t = 0;
  for (let i = 0; i < bins; i++) {
    wB += hist[i];
    if (!wB) continue;
    const wF = n - wB;
    if (!wF) break;
    sB += i * hist[i];
    const d = sB / wB - (sum - sB) / wF, v = wB * wF * d * d;
    if (v > best) (best = v), (t = i);
  }
  return (t + 0.5) / bins;
}
/** Binary morphology with a square of radius r (dilate when grow, erode otherwise). */
export function morph(mask, w, h, r, grow) {
  if (r <= 0) return mask;
  const tmp = new Uint8Array(w * h), out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let v = grow ? 0 : 1;
      for (let d = -r; d <= r && (grow ? !v : v); d++) {
        const xx = x + d;
        const m = xx < 0 || xx >= w ? 0 : mask[y * w + xx];
        v = grow ? v | m : v & m;
      }
      tmp[y * w + x] = v;
    }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let v = grow ? 0 : 1;
      for (let d = -r; d <= r && (grow ? !v : v); d++) {
        const yy = y + d;
        const m = yy < 0 || yy >= h ? 0 : tmp[yy * w + x];
        v = grow ? v | m : v & m;
      }
      out[y * w + x] = v;
    }
  return out;
}
/** Connected components (4-neighbour); keeps those at least `frac` of the largest. */
export function keepLargest(mask, w, h, frac = 1) {
  const lab = new Int32Array(w * h), sizes = [0], st = [];
  for (let i = 0; i < w * h; i++) {
    if (!mask[i] || lab[i]) continue;
    const id = sizes.length;
    let s = 0;
    st.push(i);
    lab[i] = id;
    while (st.length) {
      const j = st.pop(), x = j % w, y = (j / w) | 0;
      s++;
      for (const k of [x > 0 ? j - 1 : -1, x < w - 1 ? j + 1 : -1, y > 0 ? j - w : -1, y < h - 1 ? j + w : -1]) if (k >= 0 && mask[k] && !lab[k]) (lab[k] = id), st.push(k);
    }
    sizes.push(s);
  }
  const big = Math.max(0, ...sizes);
  const out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) if (lab[i] && sizes[lab[i]] >= big * frac) out[i] = 1;
  return out;
}
/** Fill holes smaller than maxArea pixels (background pockets not connected to the border). */
export function fillHoles(mask, w, h, maxArea = Infinity) {
  const inv = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) inv[i] = mask[i] ? 0 : 1;
  const lab = new Int32Array(w * h), out = mask.slice(), st = [];
  let id = 0;
  for (let i = 0; i < w * h; i++) {
    if (!inv[i] || lab[i]) continue;
    id++;
    const cells = [];
    let border = false;
    st.push(i);
    lab[i] = id;
    while (st.length) {
      const j = st.pop(), x = j % w, y = (j / w) | 0;
      cells.push(j);
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) border = true;
      for (const k of [x > 0 ? j - 1 : -1, x < w - 1 ? j + 1 : -1, y > 0 ? j - w : -1, y < h - 1 ? j + w : -1]) if (k >= 0 && inv[k] && !lab[k]) (lab[k] = id), st.push(k);
    }
    if (!border && cells.length <= maxArea) for (const j of cells) out[j] = 1;
  }
  return out;
}
/** Separable box blur repeated 3× (≈ Gaussian), normalised by the mask so the outside does not bleed in. */
export function maskedBlur(f, mask, w, h, r) {
  const blur = (src) => {
    const a = new Float32Array(w * h), b = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      let s = 0;
      const o = y * w;
      for (let x = -r; x <= r; x++) s += src[o + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x++) {
        a[o + x] = s / (2 * r + 1);
        s += src[o + Math.min(w - 1, x + r + 1)] - src[o + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let y = -r; y <= r; y++) s += a[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y++) {
        b[y * w + x] = s / (2 * r + 1);
        s += a[Math.min(h - 1, y + r + 1) * w + x] - a[Math.max(0, y - r) * w + x];
      }
    }
    return b;
  };
  let num = new Float32Array(w * h), den = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) if (mask[i]) (num[i] = f[i]), (den[i] = 1);
  for (let k = 0; k < 3; k++) (num = blur(num)), (den = blur(den));
  const out = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = den[i] > 1e-6 ? num[i] / den[i] : 0;
  return out;
}
/**
 * Relief relative to its own field: the integrated height minus its broad (low-pass) shape, shifted so the
 * field (5th percentile) sits at 0. Removes the bowl that light-direction error leaves; keeps rims and lettering.
 */
export function reliefOnly(height, mask, w, h, radiusPx) {
  const low = maskedBlur(height, mask, w, h, Math.max(2, Math.round(radiusPx)));
  const out = new Float32Array(w * h), vals = [];
  for (let i = 0; i < w * h; i++) if (mask[i]) vals.push((out[i] = height[i] - low[i]));
  vals.sort((a, b) => a - b);
  const base = vals[Math.floor(vals.length * 0.05)] ?? 0;
  for (let i = 0; i < w * h; i++) out[i] = mask[i] ? Math.max(0, out[i] - base) : 0;
  return out;
}
/** Integer translation of b relative to a by phase correlation (both w×h, powers of two). */
export function phaseShift(a, b, w, h) {
  const ar = Float64Array.from(a), ai = new Float64Array(w * h), br = Float64Array.from(b), bi = new Float64Array(w * h);
  fft2(ar, ai, w, h);
  fft2(br, bi, w, h);
  for (let i = 0; i < w * h; i++) {
    const r = ar[i] * br[i] + ai[i] * bi[i], im = ai[i] * br[i] - ar[i] * bi[i], m = Math.hypot(r, im) || 1;
    ar[i] = r / m;
    ai[i] = im / m;
  }
  fft2(ar, ai, w, h, true);
  let best = -Infinity, bx = 0, by = 0;
  for (let i = 0; i < w * h; i++) if (ar[i] > best) (best = ar[i]), (bx = i % w), (by = (i / w) | 0);
  return [bx > w / 2 ? bx - w : bx, by > h / 2 ? by - h : by];
}
/** Bilinear sample of a w×h field. */
export function sample(f, w, h, x, y) {
  x = Math.min(w - 1.001, Math.max(0, x));
  y = Math.min(h - 1.001, Math.max(0, y));
  const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, i = y0 * w + x0;
  return f[i] * (1 - fx) * (1 - fy) + f[i + 1] * fx * (1 - fy) + f[i + w] * (1 - fx) * fy + f[i + w + 1] * fx * fy;
}

/* ================================================================== coin / plate solid from height fields */
/**
 * A closed solid on a grid: top = thickness/2 + front relief, bottom = −thickness/2 − back relief, walls along
 * the outline. Heights in mm, the mask decides the outline; `cell` is the grid step in source pixels.
 * Returns { position, uv, index, groups: [front, back, wall] } with mm units, x right, y up, z toward the viewer.
 */
export function reliefSolid({ w, h, mask, front, back = null, pxPerMm, thickness, cell = 1, circle = null }) {
  const gw = Math.floor((w - 1) / cell) + 1, gh = Math.floor((h - 1) / cell) + 1;
  const inside = (cx, cy) => {
    if (cx < 0 || cy < 0 || cx >= gw - 1 || cy >= gh - 1) return false;
    // a cell is inside when its centre pixel is
    return !!mask[Math.min(h - 1, Math.round((cy + 0.5) * cell)) * w + Math.min(w - 1, Math.round((cx + 0.5) * cell))];
  };
  const pos = [], uv = [], top = new Int32Array(gw * gh).fill(-1), bot = new Int32Array(gw * gh).fill(-1);
  const cxMm = (w - 1) / 2 / pxPerMm, cyMm = (h - 1) / 2 / pxPerMm;
  const node = (arr, gx, gy, isTop) => {
    const k = gy * gw + gx;
    if (arr[k] >= 0) return arr[k];
    const px = Math.min(w - 1, gx * cell), py = Math.min(h - 1, gy * cell);
    const f = isTop ? sample(front, w, h, px, py) : back ? sample(back, w, h, w - 1 - px, py) : 0;
    const z = isTop ? thickness / 2 + f : -thickness / 2 - f;
    pos.push(px / pxPerMm - cxMm, cyMm - py / pxPerMm, z);
    uv.push(isTop ? px / (w - 1) : 1 - px / (w - 1), 1 - py / (h - 1));
    return (arr[k] = pos.length / 3 - 1);
  };
  const fI = [], bI = [], wI = [], rimNb = new Map();
  const link = (a, b) => {
    for (const [p, q] of [[a, b], [b, a]]) {
      const k = p[1] * gw + p[0];
      if (!rimNb.has(k)) rimNb.set(k, new Set());
      rimNb.get(k).add(q[1] * gw + q[0]);
    }
  };
  for (let cy = 0; cy < gh - 1; cy++)
    for (let cx = 0; cx < gw - 1; cx++) {
      if (!inside(cx, cy)) continue;
      const a = node(top, cx, cy, true), b = node(top, cx + 1, cy, true), c = node(top, cx + 1, cy + 1, true), d = node(top, cx, cy + 1, true);
      fI.push(a, d, b, b, d, c); // counter-clockwise seen from +z (image y is flipped to +y up)
      const A = node(bot, cx, cy, false), B = node(bot, cx + 1, cy, false), C = node(bot, cx + 1, cy + 1, false), D = node(bot, cx, cy + 1, false);
      bI.push(A, B, D, B, C, D);
      // walls on the outline: [neighbour offset, edge start, edge end] keeping outward winding
      for (const [dx, dy, e0, e1] of [[0, -1, [cx, cy], [cx + 1, cy]], [1, 0, [cx + 1, cy], [cx + 1, cy + 1]], [0, 1, [cx + 1, cy + 1], [cx, cy + 1]], [-1, 0, [cx, cy + 1], [cx, cy]]]) {
        if (inside(cx + dx, cy + dy)) continue;
        const t0 = node(top, e0[0], e0[1], true), t1 = node(top, e1[0], e1[1], true), b0 = node(bot, e0[0], e0[1], false), b1 = node(bot, e1[0], e1[1], false);
        wI.push(t0, t1, b0, t1, b1, b0);
        link(e0, e1);
      }
    }
  // the outline is a pixel staircase: put round outlines on their circle, relax free outlines along themselves
  const setXY = (k, x, y) => {
    for (const v of [top[k], bot[k]]) if (v >= 0) (pos[v * 3] = x), (pos[v * 3 + 1] = y);
  };
  if (circle) {
    for (const k of rimNb.keys()) {
      const gx = k % gw, gy = (k / gw) | 0, px = gx * cell - circle.cx, py = gy * cell - circle.cy, l = Math.hypot(px, py) || 1;
      setXY(k, (circle.cx + (px / l) * circle.r) / pxPerMm - cxMm, cyMm - (circle.cy + (py / l) * circle.r) / pxPerMm);
    }
  } else {
    for (let it = 0; it < 3; it++) {
      const next = new Map();
      for (const [k, nb] of rimNb) {
        if (nb.size !== 2) continue;
        const v = top[k], [a, b] = [...nb].map((q) => top[q]);
        next.set(k, [0.5 * pos[v * 3] + 0.25 * (pos[a * 3] + pos[b * 3]), 0.5 * pos[v * 3 + 1] + 0.25 * (pos[a * 3 + 1] + pos[b * 3 + 1])]);
      }
      for (const [k, [x, y]] of next) setXY(k, x, y);
    }
  }
  // the wall and the faces share outline vertices (same index) so the solid is closed
  return { position: new Float32Array(pos), uv: new Float32Array(uv), index: new Uint32Array([...fI, ...bI, ...wI]), groups: [[0, fI.length], [fI.length, bI.length], [fI.length + bI.length, wI.length]] };
}

/* ================================================================== mesh measures (indexed arrays) */
export function meshVolume(position, index) {
  let v = 0;
  for (let i = 0; i < index.length; i += 3) {
    const a = index[i] * 3, b = index[i + 1] * 3, c = index[i + 2] * 3;
    v += position[a] * (position[b + 1] * position[c + 2] - position[b + 2] * position[c + 1]) - position[a + 1] * (position[b] * position[c + 2] - position[b + 2] * position[c]) + position[a + 2] * (position[b] * position[c + 1] - position[b + 1] * position[c]);
  }
  return v / 6;
}
/** Edges used by exactly one triangle (0 = closed) and by more than two. */
export function openEdges(index) {
  const m = new Map();
  for (let i = 0; i < index.length; i += 3)
    for (let k = 0; k < 3; k++) {
      const a = index[i + k], b = index[i + ((k + 1) % 3)], key = a < b ? a * 4294967296 + b : b * 4294967296 + a;
      m.set(key, (m.get(key) ?? 0) + 1);
    }
  let naked = 0, nm = 0;
  for (const c of m.values()) c === 1 ? naked++ : c > 2 && nm++;
  return { naked, nonManifold: nm };
}

/* ================================================================== turntable mat and camera from the ring */
export const MAT = { ring: 140, ringBand: 8, disc: 120, step: 10 }; // mm: reference ring centre-line diameter, band width
/**
 * Direct least-squares ellipse (Fitzgibbon; Halir–Flusser numerics). Returns { cx, cy, a, b, theta }
 * with a ≥ b and theta the angle of the major axis (radians, image coordinates).
 */
export function fitEllipse(xs, ys) {
  const n = xs.length;
  if (n < 6) return null;
  let mx = 0, my = 0;
  for (let i = 0; i < n; i++) (mx += xs[i]), (my += ys[i]);
  (mx /= n), (my /= n);
  let sc = 0;
  for (let i = 0; i < n; i++) sc += Math.hypot(xs[i] - mx, ys[i] - my);
  sc = sc / n || 1;
  const S1 = new Float64Array(9), S2 = new Float64Array(9), S3 = new Float64Array(9);
  for (let i = 0; i < n; i++) {
    const x = (xs[i] - mx) / sc, y = (ys[i] - my) / sc, d1 = [x * x, x * y, y * y], d2 = [x, y, 1];
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 3; c++) {
        S1[r * 3 + c] += d1[r] * d1[c];
        S2[r * 3 + c] += d1[r] * d2[c];
        S3[r * 3 + c] += d2[r] * d2[c];
      }
  }
  const S3i = inv3([...S3]);
  if (!S3i) return null;
  // T = −S3⁻¹ S2ᵀ
  const T = new Float64Array(9);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) for (let k = 0; k < 3; k++) T[r * 3 + c] -= S3i[r * 3 + k] * S2[c * 3 + k];
  const M = new Float64Array(9);
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++) {
      let s = S1[r * 3 + c];
      for (let k = 0; k < 3; k++) s += S2[r * 3 + k] * T[k * 3 + c];
      M[r * 3 + c] = s;
    }
  // premultiply by C1⁻¹ = [[0,0,1/2],[0,−1,0],[1/2,0,0]]
  const Mc = [M[6] / 2, M[7] / 2, M[8] / 2, -M[3], -M[4], -M[5], M[0] / 2, M[1] / 2, M[2] / 2];
  let best = null;
  for (const lam of eig3(Mc)) {
    const v = nullVec([Mc[0] - lam, Mc[1], Mc[2], Mc[3], Mc[4] - lam, Mc[5], Mc[6], Mc[7], Mc[8] - lam]);
    if (v && 4 * v[0] * v[2] - v[1] * v[1] > 0) best = v;
  }
  if (!best) return null;
  const [A, B, C] = best, D = T[0] * A + T[1] * B + T[2] * C, E = T[3] * A + T[4] * B + T[5] * C, F = T[6] * A + T[7] * B + T[8] * C;
  // conic A x² + B xy + C y² + D x + E y + F = 0 in normalised coordinates → geometric parameters
  const den = B * B - 4 * A * C;
  const x0 = (2 * C * D - B * E) / den, y0 = (2 * A * E - B * D) / den;
  const num = 2 * (A * E * E + C * D * D - B * D * E + den * F);
  const root = Math.sqrt((A - C) ** 2 + B * B);
  const a1 = -Math.sqrt(Math.abs(num * (A + C + root))) / den, b1 = -Math.sqrt(Math.abs(num * (A + C - root))) / den;
  let theta = B === 0 ? (A < C ? 0 : Math.PI / 2) : Math.atan2(C - A - root, B);
  let a = Math.abs(a1), b = Math.abs(b1);
  if (b > a) ([a, b] = [b, a]), (theta += Math.PI / 2);
  return { cx: x0 * sc + mx, cy: y0 * sc + my, a: a * sc, b: b * sc, theta: Math.atan2(Math.sin(theta), Math.cos(theta)) };
}
function eig3(m) {
  // real roots of the characteristic cubic λ³ − tr λ² + c1 λ − det = 0
  const [a, b, c, d, e, f, g, h, i] = m;
  const tr = a + e + i, c1 = a * e - b * d + a * i - c * g + e * i - f * h, det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  const p = c1 - (tr * tr) / 3, q = (-2 * tr ** 3) / 27 + (tr * c1) / 3 - det;
  const roots = [], off = tr / 3;
  const disc = (q * q) / 4 + (p * p * p) / 27;
  if (Math.abs(p) < 1e-14) roots.push(Math.cbrt(-q) + off);
  else if (disc > 0) {
    const s = Math.sqrt(disc);
    roots.push(Math.cbrt(-q / 2 + s) + Math.cbrt(-q / 2 - s) + off);
  } else {
    const r = 2 * Math.sqrt(-p / 3), phi = Math.acos(Math.max(-1, Math.min(1, ((3 * q) / (2 * p)) * Math.sqrt(-3 / p)))) / 3;
    for (let k = 0; k < 3; k++) roots.push(r * Math.cos(phi - (2 * Math.PI * k) / 3) + off);
  }
  return roots;
}
function nullVec(m) {
  const rows = [[m[0], m[1], m[2]], [m[3], m[4], m[5]], [m[6], m[7], m[8]]];
  const cr = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  let best = null, bn = 0;
  for (const [u, v] of [[0, 1], [0, 2], [1, 2]]) {
    const c = cr(rows[u], rows[v]), n = Math.hypot(...c);
    if (n > bn) (bn = n), (best = c.map((x) => x / n));
  }
  return best;
}
/**
 * Points on the centre line of the dark reference ring: rays from (cx, cy); along each, the first dark run
 * longer than minRun pixels is the ring; its midpoint is kept. dark: Uint8Array w×h.
 */
export function ringPoints(dark, w, h, cx, cy, { rays = 360, minRun = 3 } = {}) {
  const xs = [], ys = [];
  const maxR = Math.hypot(w, h);
  for (let k = 0; k < rays; k++) {
    const a = (k / rays) * 2 * Math.PI, dx = Math.cos(a), dy = Math.sin(a);
    let start = -1;
    for (let r = 5; r < maxR; r += 0.75) {
      const x = Math.round(cx + dx * r), y = Math.round(cy + dy * r);
      if (x < 0 || y < 0 || x >= w || y >= h) break;
      const d = dark[y * w + x];
      if (d && start < 0) start = r;
      else if (!d && start >= 0) {
        if (r - start >= minRun) {
          const m = (start + r) / 2;
          xs.push(cx + dx * m);
          ys.push(cy + dy * m);
          break;
        }
        start = -1;
      }
    }
  }
  return { xs, ys };
}
/** Robust fit: refit after dropping the worst residuals (object or tick marks crossing a ray). */
export function fitRing(xs, ys, keep = 0.8) {
  let e = fitEllipse(xs, ys);
  for (let it = 0; it < 2 && e; it++) {
    const res = xs.map((x, i) => [Math.abs(ellipseResidual(e, x, ys[i])), i]).sort((a, b) => a[0] - b[0]);
    const sel = res.slice(0, Math.max(6, Math.floor(res.length * keep))).map(([, i]) => i);
    e = fitEllipse(sel.map((i) => xs[i]), sel.map((i) => ys[i])) ?? e;
  }
  return e;
}
const ellipseResidual = (e, x, y) => {
  const c = Math.cos(e.theta), s = Math.sin(e.theta), dx = x - e.cx, dy = y - e.cy, u = (dx * c + dy * s) / e.a, v = (-dx * s + dy * c) / e.b;
  return Math.hypot(u, v) - 1;
};
/**
 * Weak-perspective camera of one photo from the mat ring ellipse: px = o + X·ex + Y·ey + Z·ez for mat-frame
 * mm coordinates rotated by the turntable angle. X right, Y away from the camera, Z up.
 */
export function cameraFromRing(e, ringMm = MAT.ring) {
  const s = (2 * e.a) / ringMm, sinE = Math.min(1, e.b / e.a), cosE = Math.sqrt(1 - sinE * sinE);
  let mx = Math.cos(e.theta), my = Math.sin(e.theta);
  if (mx < 0) (mx = -mx), (my = -my); // X points to the right of the photo
  // "away" on the table is up in the photo: the perpendicular with negative image-y
  let ux = -my, uy = mx;
  if (uy > 0) (ux = -ux), (uy = -uy);
  return { o: [e.cx, e.cy], ex: [mx * s, my * s], ey: [ux * s * sinE, uy * s * sinE], ez: [ux * s * cosE, uy * s * cosE], s, elevation: Math.asin(sinE), toCam: [0, -cosE, sinE] };
}

/* ================================================================== visual hull */
/**
 * views: [{ mask: Uint8Array, w, h, cam, angle }] (angle in radians, the mat's turn for that photo).
 * Box in mm: { min: [x, y, z], max: [...] }, res: voxels on the longest side. A voxel survives when it falls
 * inside the silhouette in all but `tolerance` photos (photos where it falls outside the frame do not count).
 */
export function carve(views, box, res, { tolerance = 1, sign = 1 } = {}) {
  const ext = [0, 1, 2].map((k) => box.max[k] - box.min[k]), vox = Math.max(...ext) / res;
  const dims = ext.map((e) => Math.max(1, Math.ceil(e / vox)));
  const [nx, ny, nz] = dims, occ = new Uint8Array(nx * ny * nz);
  // per view: affine map from voxel indices to pixels
  const P = views.map((v) => {
    const c = Math.cos(sign * v.angle), s = Math.sin(sign * v.angle), { o, ex, ey, ez } = v.cam;
    // rotated X = c·x − s·y, Y = s·x + c·y
    const ux = ex[0] * c + ey[0] * s, uy = -ex[0] * s + ey[0] * c, vx = ex[1] * c + ey[1] * s, vy = -ex[1] * s + ey[1] * c;
    return { v, ux, uy, uz: ez[0], vx, vy, vz: ez[1], o };
  });
  let kept = 0;
  for (let k = 0; k < nz; k++) {
    const z = box.min[2] + (k + 0.5) * vox;
    for (let j = 0; j < ny; j++) {
      const y = box.min[1] + (j + 0.5) * vox;
      for (let i = 0; i < nx; i++) {
        const x = box.min[0] + (i + 0.5) * vox;
        let miss = 0;
        for (const p of P) {
          const u = Math.round(p.o[0] + p.ux * x + p.uy * y + p.uz * z), v = Math.round(p.o[1] + p.vx * x + p.vy * y + p.vz * z);
          if (u < 0 || v < 0 || u >= p.v.w || v >= p.v.h) continue;
          if (!p.v.mask[v * p.v.w + u] && ++miss > tolerance) break;
        }
        if (miss <= tolerance) (occ[(k * ny + j) * nx + i] = 1), kept++;
      }
    }
  }
  return { occ, dims, vox, min: box.min, kept, volume: kept * vox ** 3 };
}
/** Bounding box (mm) of the kept voxels, padded by `pad` voxels. */
export function hullBox({ occ, dims, vox, min }, pad = 2) {
  const [nx, ny, nz] = dims, lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let k = 0; k < nz; k++)
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++)
        if (occ[(k * ny + j) * nx + i]) {
          const c = [i, j, k];
          for (let a = 0; a < 3; a++) (lo[a] = Math.min(lo[a], c[a])), (hi[a] = Math.max(hi[a], c[a]));
        }
  if (lo[0] === Infinity) return null;
  // never below the carved box (the mat surface is z = 0)
  return { min: lo.map((v, a) => Math.max(min[a], min[a] + (v - pad) * vox)), max: hi.map((v, a) => min[a] + (v + 1 + pad) * vox) };
}
/**
 * Surface nets on a 0/1 volume (lightly blurred for sub-voxel placement). Returns an indexed, closed,
 * outward-wound triangle mesh in mm. The volume is padded with empty voxels so the surface always closes.
 */
export function surfaceNets({ occ, dims, vox, min }) {
  const [nx, ny, nz] = dims, X = nx + 2, Y = ny + 2, Z = nz + 2;
  const f = new Float32Array(X * Y * Z);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) f[((k + 1) * Y + j + 1) * X + i + 1] = occ[(k * ny + j) * nx + i];
  // 3×3×3 box blur → smooth field, iso 0.5
  const g = new Float32Array(X * Y * Z);
  const pass = (src, dst, s) => {
    for (let k = 0; k < Z; k++)
      for (let j = 0; j < Y; j++)
        for (let i = 0; i < X; i++) {
          const id = (k * Y + j) * X + i;
          let a = src[id], n = 1;
          const c = [i, j, k], lim = [X, Y, Z][s];
          if (c[s] > 0) (a += src[id - [1, X, X * Y][s]]), n++;
          if (c[s] < lim - 1) (a += src[id + [1, X, X * Y][s]]), n++;
          dst[id] = a / n;
        }
  };
  pass(f, g, 0);
  pass(g, f, 1);
  pass(f, g, 2);
  const val = (i, j, k) => g[(k * Y + j) * X + i];
  const vid = new Int32Array(X * Y * Z).fill(-1), pos = [];
  const corners = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  for (let k = 0; k < Z - 1; k++)
    for (let j = 0; j < Y - 1; j++)
      for (let i = 0; i < X - 1; i++) {
        const vs = corners.map(([a, b, c]) => val(i + a, j + b, k + c));
        let inside = 0;
        for (const v of vs) if (v > 0.5) inside++;
        if (!inside || inside === 8) continue;
        let sx = 0, sy = 0, sz = 0, n = 0;
        for (const [a, b] of edges) {
          const va = vs[a], vb = vs[b];
          if (va > 0.5 === vb > 0.5) continue;
          const t = (0.5 - va) / (vb - va), ca = corners[a], cb = corners[b];
          sx += ca[0] + (cb[0] - ca[0]) * t;
          sy += ca[1] + (cb[1] - ca[1]) * t;
          sz += ca[2] + (cb[2] - ca[2]) * t;
          n++;
        }
        vid[(k * Y + j) * X + i] = pos.length / 3;
        // voxel centre of padded index 1 sits at min + 0.5 vox
        pos.push(min[0] + (i + sx / n - 0.5) * vox, min[1] + (j + sy / n - 0.5) * vox, min[2] + (k + sz / n - 0.5) * vox);
      }
  const idx = [];
  const cell = (i, j, k) => vid[(k * Y + j) * X + i];
  const quad = (a, b, c, d, flip) => (flip ? idx.push(a, c, b, a, d, c) : idx.push(a, b, c, a, c, d));
  for (let k = 0; k < Z - 1; k++)
    for (let j = 0; j < Y - 1; j++)
      for (let i = 0; i < X - 1; i++) {
        const v0 = val(i, j, k) > 0.5;
        // edge along +x from (i,j,k): the 4 cells around it are (i, j-1..j, k-1..k); likewise for y and z
        if (j > 0 && k > 0 && v0 !== val(i + 1, j, k) > 0.5) quad(cell(i, j - 1, k - 1), cell(i, j, k - 1), cell(i, j, k), cell(i, j - 1, k), !v0);
        if (i > 0 && k > 0 && v0 !== val(i, j + 1, k) > 0.5) quad(cell(i - 1, j, k - 1), cell(i - 1, j, k), cell(i, j, k), cell(i, j, k - 1), !v0);
        if (i > 0 && j > 0 && v0 !== val(i, j, k + 1) > 0.5) quad(cell(i - 1, j - 1, k), cell(i, j - 1, k), cell(i, j, k), cell(i - 1, j, k), !v0);
      }
  return { position: new Float32Array(pos), index: new Uint32Array(idx) };
}
/** Taubin smoothing (λ|μ) on an indexed mesh: removes voxel stair-steps without shrinking. */
export function taubin(position, index, iterations = 6, lambda = 0.5, mu = -0.53) {
  const n = position.length / 3, nb = Array.from({ length: n }, () => new Set());
  for (let i = 0; i < index.length; i += 3)
    for (let k = 0; k < 3; k++) {
      const a = index[i + k], b = index[i + ((k + 1) % 3)];
      nb[a].add(b);
      nb[b].add(a);
    }
  const P = Float32Array.from(position), tmp = new Float32Array(P.length);
  const step = (f) => {
    for (let v = 0; v < n; v++) {
      let x = 0, y = 0, z = 0;
      for (const u of nb[v]) (x += P[u * 3]), (y += P[u * 3 + 1]), (z += P[u * 3 + 2]);
      const c = nb[v].size || 1;
      tmp[v * 3] = P[v * 3] + f * (x / c - P[v * 3]);
      tmp[v * 3 + 1] = P[v * 3 + 1] + f * (y / c - P[v * 3 + 1]);
      tmp[v * 3 + 2] = P[v * 3 + 2] + f * (z / c - P[v * 3 + 2]);
    }
    P.set(tmp);
  };
  for (let it = 0; it < iterations; it++) (step(lambda), step(mu));
  return P;
}
export function vertexNormals(position, index) {
  const N = new Float32Array(position.length);
  for (let i = 0; i < index.length; i += 3) {
    const a = index[i] * 3, b = index[i + 1] * 3, c = index[i + 2] * 3;
    const ux = position[b] - position[a], uy = position[b + 1] - position[a + 1], uz = position[b + 2] - position[a + 2];
    const vx = position[c] - position[a], vy = position[c + 1] - position[a + 1], vz = position[c + 2] - position[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const o of [a, b, c]) (N[o] += nx), (N[o + 1] += ny), (N[o + 2] += nz);
  }
  for (let i = 0; i < N.length; i += 3) {
    const l = Math.hypot(N[i], N[i + 1], N[i + 2]) || 1;
    (N[i] /= l), (N[i + 1] /= l), (N[i + 2] /= l);
  }
  return N;
}
/**
 * Colour each vertex from the photos that face it best (weights ∝ cos⁴ of the angle to each camera).
 * views carry { img: {w,h,r,g,b}, cam, angle }. Returns Uint8Array rgb.
 */
export function colorize(position, normals, views, sign = 1) {
  const n = position.length / 3, out = new Uint8Array(n * 3);
  const V = views.map((v) => {
    const c = Math.cos(sign * v.angle), s = Math.sin(sign * v.angle), t = v.cam.toCam;
    // camera direction expressed in the mat frame: inverse rotation of (0, −cosE, sinE)
    return { v, c, s, d: [c * t[0] + s * t[1], -s * t[0] + c * t[1], t[2]] };
  });
  for (let i = 0; i < n; i++) {
    const x = position[i * 3], y = position[i * 3 + 1], z = position[i * 3 + 2];
    let r = 0, g = 0, b = 0, ws = 0;
    for (const { v, c, s, d } of V) {
      const dot = normals[i * 3] * d[0] + normals[i * 3 + 1] * d[1] + normals[i * 3 + 2] * d[2];
      if (dot <= 0.05) continue;
      const X = c * x - s * y, Y = s * x + c * y, { o, ex, ey, ez } = v.cam;
      const u = o[0] + ex[0] * X + ey[0] * Y + ez[0] * z, w = o[1] + ex[1] * X + ey[1] * Y + ez[1] * z;
      if (u < 0 || w < 0 || u >= v.img.w - 1 || w >= v.img.h - 1) continue;
      const wt = dot ** 4;
      r += wt * sample(v.img.r, v.img.w, v.img.h, u, w);
      g += wt * sample(v.img.g, v.img.w, v.img.h, u, w);
      b += wt * sample(v.img.b, v.img.w, v.img.h, u, w);
      ws += wt;
    }
    if (ws) (out[i * 3] = Math.round((r / ws) * 255)), (out[i * 3 + 1] = Math.round((g / ws) * 255)), (out[i * 3 + 2] = Math.round((b / ws) * 255));
    else out[i * 3] = out[i * 3 + 1] = out[i * 3 + 2] = 128;
  }
  return out;
}

/* ================================================================== alloy from weighing */
/** Colour hint only: the alloy whose colour is nearest the photo's average albedo (never a verdict). */
export function colorHint(rgb, alloys) {
  const [r, g, b] = rgb, s = r + g + b || 1;
  let best = null, bd = Infinity;
  for (const a of alloys) {
    const t = a.color[0] + a.color[1] + a.color[2];
    const d = (r / s - a.color[0] / t) ** 2 + (g / s - a.color[1] / t) ** 2 + (b / s - a.color[2] / t) ** 2;
    if (d < bd) (bd = d), (best = a);
  }
  return best;
}
