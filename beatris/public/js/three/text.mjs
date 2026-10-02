// Persian text → THREE.Shape outlines.
// The browser's own text engine does the Persian shaping (joining forms, ligatures, ZWNJ);
// we rasterise it large, trace the edge with marching squares, simplify, and nest holes.
import { T } from './stage.mjs';

export const FONTS = [
  ['Vazirmatn', 'وزیر (مدرن)', 800],
  ['Markazi', 'مرکزی (نسخ)', 700],
  ['Kufi', 'کوفی (هندسی)', 700],
];

let fontsReady = null;
function loadFonts() {
  fontsReady ??= Promise.all(FONTS.map(([f, , w]) => document.fonts.load(`${w} 100px ${f}`, 'آزمون ۱۲۳'))).catch(() => {});
  return fontsReady;
}

/** Rasterise and trace. Returns { shapes, width, height } in mm (text baseline-centred). */
export async function textShapes(text, { family = 'Vazirmatn', weight = 800, heightMm = 10, px = 180, curve = 0 } = {}) {
  await loadFonts();
  const str = String(text || ' ').slice(0, 40);
  const c = document.createElement('canvas');
  const g = c.getContext('2d', { willReadFrequently: true });
  const font = `${weight} ${px}px ${family}`;
  g.font = font;
  g.direction = 'rtl';
  const m = g.measureText(str);
  const pad = Math.ceil(px * 0.4);
  const asc = Math.ceil(m.actualBoundingBoxAscent || px * 0.9);
  const desc = Math.ceil(m.actualBoundingBoxDescent || px * 0.35);
  // generous canvas, text centred: the traced outline decides the real extents
  c.width = Math.min(Math.ceil(Math.max(m.width, (m.actualBoundingBoxLeft || 0) + (m.actualBoundingBoxRight || 0)) * 1.25) + pad * 2, 8000);
  c.height = asc + desc + pad * 2;
  g.font = font;
  g.direction = 'rtl';
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.fillStyle = '#000';
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#fff';
  g.fillText(str, c.width / 2, pad + asc);
  const img = g.getImageData(0, 0, c.width, c.height).data;
  const field = (x, y) => (x < 0 || y < 0 || x >= c.width || y >= c.height ? 0 : img[(y * c.width + x) * 4] / 255);
  const loops = marchingSquares(field, c.width, c.height, 0.5).map((l) => simplify(l, 0.45)).filter((l) => l.length >= 3);
  // content bounds
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const l of loops) for (const [x, y] of l) (minX = Math.min(minX, x)), (maxX = Math.max(maxX, x)), (minY = Math.min(minY, y)), (maxY = Math.max(maxY, y));
  const s = heightMm / (asc + desc * 0.35);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const toMm = ([x, y]) => new T.Vector2((x - cx) * s, -(y - cy) * s);
  const shapes = nest(loops.map((l) => l.map(toMm)));
  if (curve) bendShapes(shapes, curve);
  return { shapes, width: (maxX - minX) * s, height: (maxY - minY) * s };
}

/** Bend outlines along an arc (for name plates that hug the neck). curve = radius mm (+ up). */
function bendShapes(shapes, R) {
  const bend = (v) => {
    const a = v.x / R;
    const r = R - v.y;
    v.set(Math.sin(a) * r, R - Math.cos(a) * r);
  };
  for (const sh of shapes) {
    sh.curves.forEach((cv) => [cv.v1, cv.v2].forEach((v) => v && bend(v)));
    sh.holes.forEach((h) => h.curves.forEach((cv) => [cv.v1, cv.v2].forEach((v) => v && bend(v))));
  }
}

function area(poly) {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += (poly[j].x - poly[i].x) * (poly[j].y + poly[i].y);
  return a / 2;
}
function inside(pt, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (a.y > pt.y !== b.y > pt.y && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}

/** Even-odd nesting: depth 0,2,… are solids; odd depths are holes of their nearest solid parent. */
function nest(polys) {
  const items = polys.map((p) => ({ p, a: Math.abs(area(p)) })).filter((x) => x.a > 1e-4).sort((x, y) => y.a - x.a);
  for (const it of items) {
    it.parents = items.filter((o) => o !== it && o.a > it.a && inside(it.p[0], o.p));
    it.depth = it.parents.length;
  }
  const shapes = [];
  for (const it of items) {
    if (it.depth % 2 === 0) {
      const pts = area(it.p) < 0 ? it.p.slice().reverse() : it.p;
      it.shape = new T.Shape(pts);
      shapes.push(it.shape);
    }
  }
  for (const it of items) {
    if (it.depth % 2 === 1) {
      const parent = it.parents.filter((p) => p.depth === it.depth - 1).sort((x, y) => x.a - y.a)[0];
      if (parent?.shape) parent.shape.holes.push(new T.Path(area(it.p) > 0 ? it.p.slice().reverse() : it.p));
    }
  }
  return shapes;
}

/** Marching squares with linear interpolation; returns closed loops of [x,y]. */
function marchingSquares(f, W, H, iso) {
  const segs = new Map(); // key(start edge) -> [end edge key, start point, end point]
  const pt = new Map();
  const ek = (x, y, d) => `${x},${y},${d}`; // d: 'h' edge from (x,y) to (x+1,y); 'v' from (x,y) to (x,y+1)
  const interp = (x, y, d) => {
    const k = ek(x, y, d);
    if (pt.has(k)) return k;
    const a = f(x, y);
    const b = d === 'h' ? f(x + 1, y) : f(x, y + 1);
    const t = Math.abs(b - a) < 1e-6 ? 0.5 : (iso - a) / (b - a);
    pt.set(k, d === 'h' ? [x + t, y] : [x, y + t]);
    return k;
  };
  const add = (a, b) => segs.set(a, b);
  for (let y = -1; y < H; y++)
    for (let x = -1; x < W; x++) {
      const tl = f(x, y) >= iso, tr = f(x + 1, y) >= iso, br = f(x + 1, y + 1) >= iso, bl = f(x, y + 1) >= iso;
      const code = (tl ? 8 : 0) | (tr ? 4 : 0) | (br ? 2 : 0) | (bl ? 1 : 0);
      if (code === 0 || code === 15) continue;
      const T_ = () => interp(x, y, 'h'), R_ = () => interp(x + 1, y, 'v'), B_ = () => interp(x, y + 1, 'h'), L_ = () => interp(x, y, 'v');
      // orientation: solid on the left of travel
      switch (code) {
        case 1: add(B_(), L_()); break;
        case 2: add(R_(), B_()); break;
        case 3: add(R_(), L_()); break;
        case 4: add(T_(), R_()); break;
        case 5: {
          const c = (f(x, y) + f(x + 1, y) + f(x + 1, y + 1) + f(x, y + 1)) / 4 >= iso;
          if (c) { add(T_(), L_()); add(B_(), R_()); } else { add(T_(), R_()); add(B_(), L_()); }
          break;
        }
        case 6: add(T_(), B_()); break;
        case 7: add(T_(), L_()); break;
        case 8: add(L_(), T_()); break;
        case 9: add(B_(), T_()); break;
        case 10: {
          const c = (f(x, y) + f(x + 1, y) + f(x + 1, y + 1) + f(x, y + 1)) / 4 >= iso;
          if (c) { add(L_(), B_()); add(R_(), T_()); } else { add(L_(), T_()); add(R_(), B_()); }
          break;
        }
        case 11: add(R_(), T_()); break;
        case 12: add(L_(), R_()); break;
        case 13: add(B_(), R_()); break;
        case 14: add(L_(), B_()); break;
      }
    }
  const loops = [];
  while (segs.size) {
    const [start] = segs.keys();
    const loop = [];
    let k = start;
    let guard = 0;
    while (segs.has(k) && guard++ < 1e6) {
      loop.push(pt.get(k));
      const n = segs.get(k);
      segs.delete(k);
      k = n;
    }
    if (loop.length > 2) loops.push(loop);
  }
  return loops;
}

/** Ramer–Douglas–Peucker on a closed loop. */
function simplify(loop, eps) {
  if (loop.length < 8) return loop;
  const rdp = (pts) => {
    if (pts.length < 3) return pts;
    const [ax, ay] = pts[0], [bx, by] = pts[pts.length - 1];
    const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1;
    let md = 0, mi = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const d = Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / L;
      if (d > md) (md = d), (mi = i);
    }
    if (md <= eps) return [pts[0], pts[pts.length - 1]];
    return [...rdp(pts.slice(0, mi + 1)).slice(0, -1), ...rdp(pts.slice(mi))];
  };
  const half = Math.floor(loop.length / 2);
  const a = rdp(loop.slice(0, half + 1));
  const b = rdp([...loop.slice(half), loop[0]]);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}

/** Image (canvas or <img>) → height field for relief pieces. Returns f(u,v) in 0..1, u,v in 0..1. */
export function heightField(source, { invert = false, size = 512, blur = 1 } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = invert ? '#fff' : '#000';
  g.fillRect(0, 0, size, size);
  if (blur) g.filter = `blur(${blur}px)`;
  const iw = source.naturalWidth || source.width, ih = source.naturalHeight || source.height;
  const k = Math.min(size / iw, size / ih);
  g.drawImage(source, (size - iw * k) / 2, (size - ih * k) / 2, iw * k, ih * k);
  const d = g.getImageData(0, 0, size, size).data;
  const lum = new Float32Array(size * size);
  for (let i = 0; i < lum.length; i++) {
    const a = d[i * 4 + 3] / 255;
    const l = (0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2]) / 255;
    lum[i] = invert ? 1 - l * a : l * a;
  }
  return (u, v) => {
    const x = Math.min(size - 1, Math.max(0, u * (size - 1)));
    const y = Math.min(size - 1, Math.max(0, v * (size - 1)));
    const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(size - 1, x0 + 1), y1 = Math.min(size - 1, y0 + 1);
    const fx = x - x0, fy = y - y0;
    const a = lum[y0 * size + x0] * (1 - fx) + lum[y0 * size + x1] * fx;
    const b = lum[y1 * size + x0] * (1 - fx) + lum[y1 * size + x1] * fx;
    return a * (1 - fy) + b * fy;
  };
}
