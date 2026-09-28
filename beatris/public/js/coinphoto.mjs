// Real coin photos → face textures and relief maps, entirely in the browser (canvas).
// Nothing is invented: pixels are only resampled (no AI "upscaling"), so what a trainee studies — bead
// counts, lettering, portrait details — is exactly what the camera recorded. 4K output is a faithful
// resample; real detail is limited by the source photo, which the UI reports honestly.

export const OUT = { color: 4096, preview: 2048, height: 2048 };
const MAX_SRC = 3600; // longest side kept for processing (a coin is rarely > 2000 px in a photo)
const DET = 900; // longest side used for detection

/** Decode a File/Blob/URL into a canvas (EXIF orientation applied), capped at MAX_SRC. */
export async function loadSource(src) {
  const blob = typeof src === 'string' ? await (await fetch(src)).blob() : src;
  const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  const k = Math.min(1, MAX_SRC / Math.max(bmp.width, bmp.height));
  const cv = document.createElement('canvas');
  cv.width = Math.round(bmp.width * k);
  cv.height = Math.round(bmp.height * k);
  const g = cv.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(bmp, 0, 0, cv.width, cv.height);
  bmp.close?.();
  return cv;
}

/* ------------------------------------------------------------------ detection */

function otsu(hist, total) {
  let sum = 0;
  for (let i = 0; i < hist.length; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, t = 0;
  for (let i = 0; i < hist.length; i++) {
    wB += hist[i];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += i * hist[i];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const v = wB * wF * (mB - mF) ** 2;
    if (v > best) (best = v), (t = i);
  }
  return t;
}
const median = (a) => {
  const s = Float64Array.from(a).sort();
  return s.length ? s[s.length >> 1] : 0;
};

/** Algebraic (Kåsa) circle fit, then two rounds of outlier rejection. pts = [x0, y0, x1, y1, ...]. */
export function fitCircle(pts) {
  let use = pts;
  let c = null;
  for (let round = 0; round < 3; round++) {
    const n = use.length / 2;
    if (n < 8) break;
    let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0, sz = 0;
    for (let i = 0; i < use.length; i += 2) {
      const x = use[i], y = use[i + 1], z = x * x + y * y;
      sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; sxz += x * z; syz += y * z; sz += z;
    }
    // normal equations for x² + y² + D x + E y + F = 0
    const A = [[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, n]];
    const b = [-sxz, -syz, -sz];
    const sol = solve3(A, b);
    if (!sol) break;
    const [D, E, F] = sol;
    const cx = -D / 2, cy = -E / 2, r = Math.sqrt(Math.max(0, cx * cx + cy * cy - F));
    c = { cx, cy, r };
    const res = [];
    for (let i = 0; i < use.length; i += 2) res.push(Math.abs(Math.hypot(use[i] - cx, use[i + 1] - cy) - r));
    const med = median(res);
    const mad = median(res.map((v) => Math.abs(v - med))) || 0.5;
    const keep = [];
    for (let i = 0, k = 0; i < use.length; i += 2, k++) if (res[k] <= med + 3 * mad) keep.push(use[i], use[i + 1]);
    if (keep.length === use.length) break;
    use = keep;
  }
  return c;
}
function solve3(A, b) {
  const m = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < 3; c++) {
    let p = c;
    for (let r = c + 1; r < 3; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r;
    if (Math.abs(m[p][c]) < 1e-12) return null;
    [m[c], m[p]] = [m[p], m[c]];
    for (let r = 0; r < 3; r++) {
      if (r === c) continue;
      const f = m[r][c] / m[c][c];
      for (let k = c; k < 4; k++) m[r][k] -= f * m[c][k];
    }
  }
  return [m[0][3] / m[0][0], m[1][3] / m[1][1], m[2][3] / m[2][2]];
}

/**
 * Find the coins in a photo. Background = colour of the image border; everything not connected to the
 * border through background-coloured pixels is foreground (this fills the coins' interiors), then each
 * large blob gets a robust circle fit and a sub-pixel edge refinement on the full-resolution image.
 * Returns circles in source-pixel coordinates, left to right.
 */
export function detectCoins(src, { max = 4 } = {}) {
  const k = Math.min(1, DET / Math.max(src.width, src.height));
  const W = Math.max(8, Math.round(src.width * k)), H = Math.max(8, Math.round(src.height * k));
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingQuality = 'high';
  g.drawImage(src, 0, 0, W, H);
  const px = g.getImageData(0, 0, W, H).data;
  // background colour from a 2-px border band
  const br = [], bg = [], bb = [];
  for (let x = 0; x < W; x++) for (const y of [0, 1, H - 2, H - 1]) { const i = (y * W + x) * 4; br.push(px[i]); bg.push(px[i + 1]); bb.push(px[i + 2]); }
  for (let y = 0; y < H; y++) for (const x of [0, 1, W - 2, W - 1]) { const i = (y * W + x) * 4; br.push(px[i]); bg.push(px[i + 1]); bb.push(px[i + 2]); }
  const bgc = [median(br), median(bg), median(bb)];
  const dist = new Float32Array(W * H);
  const hist = new Float64Array(256);
  for (let i = 0; i < W * H; i++) {
    const d = Math.hypot(px[i * 4] - bgc[0], px[i * 4 + 1] - bgc[1], px[i * 4 + 2] - bgc[2]);
    dist[i] = d;
    hist[Math.min(255, d | 0)]++;
  }
  const borderSpread = median(br.map((v, i) => Math.hypot(v - bgc[0], bg[i] - bgc[1], bb[i] - bgc[2])));
  const T = Math.max(otsu(hist, W * H), borderSpread * 3 + 10);
  // background reachable from the border
  const outside = new Uint8Array(W * H);
  const stack = [];
  const pushBg = (i) => {
    if (!outside[i] && dist[i] < T) (outside[i] = 1), stack.push(i);
  };
  for (let x = 0; x < W; x++) pushBg(x), pushBg((H - 1) * W + x);
  for (let y = 0; y < H; y++) pushBg(y * W), pushBg(y * W + W - 1);
  while (stack.length) {
    const i = stack.pop(), x = i % W, y = (i / W) | 0;
    if (x > 0) pushBg(i - 1);
    if (x < W - 1) pushBg(i + 1);
    if (y > 0) pushBg(i - W);
    if (y < H - 1) pushBg(i + W);
  }
  // open the foreground (erode 2, dilate 2) so shadows / thin captions do not bridge two coins
  let fg = new Uint8Array(W * H);
  for (let i = 0; i < fg.length; i++) fg[i] = outside[i] ? 0 : 1;
  // 5×5 square erosion / dilation, separable (rows then columns)
  const morph = (a, grow) => {
    const pass = (src, horizontal) => {
      const out = new Uint8Array(src.length);
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          let v = grow ? 0 : 1;
          for (let d = -2; d <= 2; d++) {
            const X = horizontal ? x + d : x, Y = horizontal ? y : y + d;
            const s = X < 0 || Y < 0 || X >= W || Y >= H ? 0 : src[Y * W + X];
            if (grow ? s : !s) {
              v = grow ? 1 : 0;
              break;
            }
          }
          out[y * W + x] = v;
        }
      return out;
    };
    return pass(pass(a, true), false);
  };
  fg = morph(morph(fg, false), true);
  // connected components
  const label = new Int32Array(W * H);
  const blobs = [];
  for (let s0 = 0; s0 < fg.length; s0++) {
    if (!fg[s0] || label[s0]) continue;
    const id = blobs.length + 1;
    const q = [s0];
    label[s0] = id;
    let area = 0, minX = W, maxX = 0, minY = H, maxY = 0;
    const edge = [];
    while (q.length) {
      const i = q.pop(), x = i % W, y = (i / W) | 0;
      area++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      let boundary = false;
      for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1]) {
        if (j < 0 || !fg[j]) {
          boundary = true;
          continue;
        }
        if (!label[j]) (label[j] = id), q.push(j);
      }
      if (boundary) edge.push(x + 0.5, y + 0.5);
    }
    blobs.push({ area, minX, maxX, minY, maxY, edge });
  }
  const minArea = W * H * 0.008;
  let circles = [];
  for (const b of blobs) {
    if (b.area < minArea) continue;
    const c = fitCircle(b.edge);
    if (!c || c.r < 6) continue;
    const fill = b.area / (Math.PI * c.r * c.r);
    const aspect = (b.maxX - b.minX + 1) / (b.maxY - b.minY + 1);
    if (fill < 0.6 || fill > 1.25 || aspect < 0.7 || aspect > 1.45) continue;
    circles.push({ cx: c.cx / k, cy: c.cy / k, r: c.r / k, score: 1 - Math.abs(1 - fill) });
  }
  circles.sort((a, b) => b.score * b.r - a.score * a.r);
  circles = circles.slice(0, max).map((c) => refineEdge(src, c));
  circles.sort((a, b) => a.cx - b.cx || a.cy - b.cy);
  return circles;
}

/**
 * Sub-pixel edge refinement: along 360 rays through the estimated rim, take the position of the strongest
 * outward change of colour, then refit. Works on a crop of the full-resolution image only.
 */
export function refineEdge(src, c) {
  const pad = c.r * 0.12;
  const x0 = Math.max(0, Math.floor(c.cx - c.r - pad)), y0 = Math.max(0, Math.floor(c.cy - c.r - pad));
  const x1 = Math.min(src.width, Math.ceil(c.cx + c.r + pad)), y1 = Math.min(src.height, Math.ceil(c.cy + c.r + pad));
  const w = x1 - x0, h = y1 - y0;
  if (w < 16 || h < 16) return c;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.drawImage(src, x0, y0, w, h, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data;
  const lum = (x, y) => {
    const X = Math.min(w - 1.001, Math.max(0, x)), Y = Math.min(h - 1.001, Math.max(0, y));
    const xi = X | 0, yi = Y | 0, fx = X - xi, fy = Y - yi;
    const L = (i) => d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
    const i00 = (yi * w + xi) * 4;
    return (L(i00) * (1 - fx) + L(i00 + 4) * fx) * (1 - fy) + (L(i00 + w * 4) * (1 - fx) + L(i00 + w * 4 + 4) * fx) * fy;
  };
  const pts = [];
  const cx = c.cx - x0, cy = c.cy - y0;
  for (let k = 0; k < 360; k++) {
    const a = (k / 360) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
    let best = 0, bestR = -1, prev = null;
    for (let r = c.r * 0.93; r <= c.r * 1.07; r += 0.5) {
      const v = lum(cx + ca * r, cy + sa * r);
      if (prev !== null) {
        const gmag = Math.abs(v - prev);
        if (gmag > best) (best = gmag), (bestR = r - 0.25);
      }
      prev = v;
    }
    if (bestR > 0 && best > 6) pts.push(cx + ca * bestR, cy + sa * bestR);
  }
  const f = pts.length > 60 ? fitCircle(pts) : null;
  if (!f || Math.abs(f.r - c.r) > c.r * 0.06) return c;
  return { ...c, cx: f.cx + x0, cy: f.cy + y0, r: f.r };
}

/* ------------------------------------------------------------------ extraction */

/**
 * Cut one face out of the photo: centred, rotated upright, resampled to size×size (bicubic/Lanczos class
 * "high" smoothing). Pixels just outside the rim are filled with a blurred extension of the coin so texture
 * filtering never pulls background colour into the rim.
 */
export function extractFace(src, circle, { size = OUT.color, rotation = 0, inset = 0 } = {}) {
  const r = circle.r * (1 - inset);
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  const draw = (scaleUp, filter) => {
    g.save();
    g.filter = filter;
    g.translate(size / 2, size / 2);
    g.rotate(rotation);
    const s = (size / (2 * r)) * scaleUp;
    g.scale(s, s);
    g.drawImage(src, -circle.cx, -circle.cy);
    g.restore();
  };
  g.fillStyle = '#3a2e1c';
  g.fillRect(0, 0, size, size);
  draw(1.06, `blur(${Math.round(size / 256)}px)`); // edge extension
  // exact face, clipped to the circle
  g.save();
  g.beginPath();
  g.arc(size / 2, size / 2, size / 2 - 0.5, 0, Math.PI * 2);
  g.clip();
  draw(1, 'none');
  g.restore();
  return cv;
}

/* ------------------------------------------------------------------ relief */

/**
 * Relief (height) map from the face photo: luminance, lightly denoised, with the lighting gradient removed
 * (high-pass), normalised on the 2nd–98th percentile inside the coin. Sign: the raised rim of a struck coin
 * must come out higher than the field; pass invert to override.
 */
export function reliefMap(face, { size = OUT.height, invert = null, sourcePx = 0 } = {}) {
  const small = document.createElement('canvas');
  small.width = small.height = size;
  const sg = small.getContext('2d', { willReadFrequently: true });
  sg.imageSmoothingQuality = 'high';
  // Anything finer than one pixel of the original photo is only interpolation or JPEG noise; it must not
  // become relief (speckles would read as casting pores to a trainee).
  const upscale = sourcePx > 0 ? size / sourcePx : 1;
  sg.filter = `blur(${Math.max((size / 2048) * 1.4, upscale * 0.9).toFixed(2)}px)`;
  sg.drawImage(face, 0, 0, size, size);
  const low = document.createElement('canvas');
  low.width = low.height = size;
  const lg = low.getContext('2d', { willReadFrequently: true });
  lg.filter = `blur(${Math.round(size * 0.02)}px)`;
  lg.drawImage(small, 0, 0);
  const a = sg.getImageData(0, 0, size, size).data;
  const b = lg.getImageData(0, 0, size, size).data;
  const n = size * size;
  const hp = new Float32Array(n);
  const L = (d, i) => d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
  for (let i = 0; i < n; i++) hp[i] = L(a, i * 4) - L(b, i * 4);
  // detail density: design elements (lettering, portrait, beads) are where edges cluster; the field is flat
  const gm = new Float32Array(n);
  for (let y = 1; y < size - 1; y++)
    for (let x = 1; x < size - 1; x++) {
      const i = y * size + x;
      gm[i] = Math.abs(hp[i + 1] - hp[i - 1]) + Math.abs(hp[i + size] - hp[i - size]);
    }
  const dens = boxBlur(gm, size, Math.max(2, Math.round(size / 340)));
  const c = size / 2;
  const inside = [], dSamples = [];
  for (let y = 0; y < size; y += 2)
    for (let x = 0; x < size; x += 2) {
      const u = Math.hypot(x + 0.5 - c, y + 0.5 - c) / c;
      if (u < 0.97) inside.push(hp[y * size + x]);
      if (u < 0.88) dSamples.push(dens[y * size + x]);
    }
  inside.sort((p, q) => p - q);
  dSamples.sort((p, q) => p - q);
  const lo = inside[Math.floor(inside.length * 0.02)] ?? -1, hi = inside[Math.floor(inside.length * 0.98)] ?? 1;
  const span = hi - lo || 1;
  let inv = invert;
  if (inv === null) {
    // are the detailed (design) areas brighter than the flat field? then bright = raised
    const dHi = dSamples[Math.floor(dSamples.length * 0.6)] ?? 0, dLo = dSamples[Math.floor(dSamples.length * 0.3)] ?? 0;
    let sD = 0, nD = 0, sF = 0, nF = 0;
    for (let y = 0; y < size; y += 2)
      for (let x = 0; x < size; x += 2) {
        const u = Math.hypot(x + 0.5 - c, y + 0.5 - c) / c;
        if (u >= 0.88) continue;
        const i = y * size + x, v = L(a, i * 4);
        if (dens[i] >= dHi) (sD += v), nD++;
        else if (dens[i] <= dLo) (sF += v), nF++;
      }
    inv = nD && nF ? sD / nD < sF / nF : false;
  }
  const out = document.createElement('canvas');
  out.width = out.height = size;
  const og = out.getContext('2d');
  const img = og.createImageData(size, size);
  // field level = median inside the coin; a dead zone sized to the measured noise keeps the field flat
  const mid = (inside[inside.length >> 1] - lo) / span;
  const field = inv ? 1 - mid : mid;
  const flat = [];
  const dFlat = dSamples[Math.floor(dSamples.length * 0.3)] ?? 0;
  for (let y = 0; y < size; y += 3)
    for (let x = 0; x < size; x += 3) {
      const u = Math.hypot(x + 0.5 - c, y + 0.5 - c) / c;
      const i = y * size + x;
      if (u < 0.85 && dens[i] <= dFlat) flat.push(Math.abs((hp[i] - lo) / span - mid));
    }
  flat.sort((p, q) => p - q);
  const noise = 1.4826 * (flat[flat.length >> 1] ?? 0.02);
  const dz = Math.min(0.22, Math.max(0.04, 3 * noise));
  for (let i = 0; i < n; i++) {
    let t = (hp[i] - lo) / span;
    t = Math.min(1, Math.max(0, inv ? 1 - t : t));
    const d = t - field;
    t = Math.min(1, Math.max(0, field + (Math.sign(d) * Math.max(0, Math.abs(d) - dz)) / (1 - dz)));
    const v = Math.round(t * 255);
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  og.putImageData(img, 0, 0);
  return { canvas: out, inverted: inv };
}

/** Separable box blur on a float image (radius r), used for detail density. */
function boxBlur(src, size, r) {
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
  const w = 2 * r + 1;
  for (let y = 0; y < size; y++) {
    let acc = 0;
    const row = y * size;
    for (let x = -r; x <= r; x++) acc += src[row + Math.min(size - 1, Math.max(0, x))];
    for (let x = 0; x < size; x++) {
      tmp[row + x] = acc / w;
      acc += src[row + Math.min(size - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < size; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(size - 1, Math.max(0, y)) * size + x];
    for (let y = 0; y < size; y++) {
      out[y * size + x] = acc / w;
      acc += tmp[Math.min(size - 1, y + r + 1) * size + x] - tmp[Math.max(0, y - r) * size + x];
    }
  }
  return out;
}

/** Quick shaded preview of a relief map (light from the upper left), for checking the sign by eye. */
export function shadeRelief(height, size = 512) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.drawImage(height, 0, 0, size, size);
  const d = g.getImageData(0, 0, size, size);
  const h = new Float32Array(size * size);
  for (let i = 0; i < h.length; i++) h[i] = d.data[i * 4] / 255;
  const out = g.createImageData(size, size);
  const k = size / 60;
  for (let y = 1; y < size - 1; y++)
    for (let x = 1; x < size - 1; x++) {
      const i = y * size + x;
      const nx = (h[i - 1] - h[i + 1]) * k, ny = (h[i - size] - h[i + size]) * k;
      const len = Math.hypot(nx, ny, 1);
      const lit = Math.max(0, (-nx * 0.55 + -ny * 0.55 + 0.63) / len);
      const v = Math.round(40 + lit * 200);
      out.data[i * 4] = v;
      out.data[i * 4 + 1] = Math.round(v * 0.88);
      out.data[i * 4 + 2] = Math.round(v * 0.62);
      out.data[i * 4 + 3] = 255;
    }
  g.putImageData(out, 0, 0);
  return cv;
}

/* ------------------------------------------------------------------ encoding */

let webpOk = null;
/** WebP where the browser can encode it (Chrome, Firefox, Safari 17+), JPEG otherwise. */
export function imageType() {
  if (webpOk === null) {
    const c = document.createElement('canvas');
    c.width = c.height = 2;
    webpOk = c.toDataURL('image/webp').startsWith('data:image/webp');
  }
  return webpOk ? 'image/webp' : 'image/jpeg';
}
export const toDataURL = (canvas, quality = 0.92) => canvas.toDataURL(imageType(), quality);

/**
 * Full build for one side: 4096 colour, 2048 colour, 2048 relief (+ shaded preview).
 * sourceScale = how many real photo pixels span the coin diameter (reported to the user).
 */
export function buildSide(src, circle, { rotation = 0, invert = null } = {}) {
  const c4 = extractFace(src, circle, { size: OUT.color, rotation });
  const c2 = document.createElement('canvas');
  c2.width = c2.height = OUT.preview;
  const g2 = c2.getContext('2d');
  g2.imageSmoothingQuality = 'high';
  g2.drawImage(c4, 0, 0, OUT.preview, OUT.preview);
  const sourcePx = Math.round(circle.r * 2);
  const relief = reliefMap(c4, { invert, sourcePx });
  return { c4, c2, height: relief.canvas, inverted: relief.inverted, sourcePx };
}
