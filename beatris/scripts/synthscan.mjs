// Synthetic photographs with known geometry for the photo-scan tests (spec 0009): PNG files a phone could
// have taken — a coin lit from 8 clock directions, and a ring on the printed turntable mat from two heights.
import { deflateSync } from 'node:zlib';
import * as P from '../public/js/photoscan.mjs';

const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
const crc32 = (buf) => {
  let c = -1;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
/** rgb: Uint8Array w·h·3 → PNG buffer. */
export function png(w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    Buffer.from(rgb.buffer, rgb.byteOffset + y * w * 3, w * 3).copy(raw, y * (w * 3 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const srgb = (v) => Math.round(Math.min(1, Math.max(0, v)) ** (1 / 2.2) * 255);

/** A 22 mm coin (r = 150 px): raised rim, a central boss and a scratch; 8 photos, light at 45°. */
export function coinPhotos({ w = 640, h = 480, R = 150, scratch = true } = {}) {
  const cx = w / 2, cy = h / 2, H = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const r = Math.hypot(x - cx, y - cy);
      if (r > R) continue;
      let z = 6 / (1 + Math.exp(-(r - (R - 12)) / 1.5)); // rim
      z += 10 * Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * 35 * 35)); // boss
      if (scratch) {
        // a groove from (250, 200) to (380, 280), 2 px deep
        const ax = 250, ay = 200, bx = 380, by = 280, t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)));
        const d = Math.hypot(x - ax - t * (bx - ax), y - ay - t * (by - ay));
        z -= 2 * Math.exp(-(d * d) / 2);
      }
      H[y * w + x] = z;
    }
  const clocks = [12, 1.5, 3, 4.5, 6, 7.5, 9, 10.5];
  return clocks.map((c, k) => {
    const l = P.lightDir(c, 45), out = new Uint8Array(w * h * 3);
    for (let y = 1; y < h - 1; y++)
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        let col = [0.02, 0.02, 0.025];
        if (Math.hypot(x - cx, y - cy) <= R) {
          const p = (H[i + 1] - H[i - 1]) / 2, q = (H[i + w] - H[i - w]) / 2, n = Math.hypot(p, q, 1), nx = -p / n, ny = -q / n, nz = 1 / n;
          const lam = Math.max(0, nx * l[0] + ny * l[1] + nz * l[2]);
          const hv = [l[0], l[1], l[2] + 1], hl = Math.hypot(...hv), spec = lam > 0 ? 0.5 * Math.max(0, (nx * hv[0] + ny * hv[1] + nz * hv[2]) / hl) ** 50 : 0;
          col = [0.92 * lam * 0.85 + spec, 0.72 * lam * 0.85 + spec, 0.36 * lam * 0.85 + spec];
        }
        out.set(col.map(srgb), i * 3);
      }
    return { name: `coin-${String(k + 1).padStart(2, '0')}.png`, mimeType: 'image/png', buffer: png(w, h, out) };
  });
}

/** A ring (torus R 9 mm, tube 1.5 mm) lying on the mat; two loops (15° and 60°), `step` degrees apart. */
export function ringPhotos({ w = 900, h = 700, step = 20, elevations = [15, 60] } = {}) {
  const files = [];
  const Rr = 9, rr = 1.5;
  for (const [li, el] of elevations.entries()) {
    const a = 380, b = a * Math.sin((el * Math.PI) / 180);
    const cam = P.cameraFromRing({ cx: w / 2, cy: h * 0.62, a, b, theta: 0.02 });
    const det = cam.ex[0] * cam.ey[1] - cam.ey[0] * cam.ex[1];
    for (let k = 0; k < 360 / step; k++) {
      const ang = (k * step * Math.PI) / 180, c = Math.cos(ang), s = Math.sin(ang);
      const out = new Uint8Array(w * h * 3);
      // the mat: paper with the black reference ring (inverse of the camera on the table plane)
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const u = x - cam.o[0], v = y - cam.o[1], X = (u * cam.ey[1] - cam.ey[0] * v) / det, Y = (cam.ex[0] * v - u * cam.ex[1]) / det, R = Math.hypot(X, Y);
          const ink = Math.abs(R - P.MAT.ring / 2) <= P.MAT.ringBand / 2;
          out.set(ink ? [18, 18, 18] : [236, 234, 228], (y * w + x) * 3);
        }
      // the ring: dense surface samples, shaded by a soft light from the camera side
      const toCam = cam.toCam;
      for (let i = 0; i < 700; i++)
        for (let j = 0; j < 120; j++) {
          const t = (i / 700) * 2 * Math.PI, p = (j / 120) * 2 * Math.PI;
          const x0 = (Rr + rr * Math.cos(p)) * Math.cos(t), y0 = (Rr + rr * Math.cos(p)) * Math.sin(t), z0 = rr + rr * Math.sin(p);
          const nx0 = Math.cos(p) * Math.cos(t), ny0 = Math.cos(p) * Math.sin(t), nz0 = Math.sin(p);
          const X = c * x0 - s * y0, Y = s * x0 + c * y0, NX = c * nx0 - s * ny0, NY = s * nx0 + c * ny0;
          const facing = NX * toCam[0] + NY * toCam[1] + nz0 * toCam[2];
          if (facing < -0.2) continue;
          const u = Math.round(cam.o[0] + cam.ex[0] * X + cam.ey[0] * Y + cam.ez[0] * z0), v = Math.round(cam.o[1] + cam.ex[1] * X + cam.ey[1] * Y + cam.ez[1] * z0);
          if (u < 0 || v < 0 || u >= w || v >= h) continue;
          const sh = 0.45 + 0.55 * Math.max(0, facing);
          out.set([srgb(0.85 * sh), srgb(0.62 * sh), srgb(0.22 * sh)], (v * w + u) * 3);
        }
      files.push({ name: `ring-${li}-${String(k).padStart(2, '0')}.png`, mimeType: 'image/png', buffer: png(w, h, out) });
    }
  }
  return files;
}
