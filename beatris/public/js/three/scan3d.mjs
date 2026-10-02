// اسکن از عکس (spec 0009): the studio part «scan». Its data (opts.scan) is a JSON string written by the scan
// wizard: either a relief scan (coin/plate height fields + photo textures) or a hull scan (coloured mesh).
// Untrusted like any project file: every array is length-checked before use.
import { T } from './stage.mjs';
import { PIECES } from './jewelcad.mjs';
import { reliefSolid } from '../photoscan.mjs';

const b64 = (u8) => {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
};
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const f32 = (s) => {
  const u = unb64(s);
  return new Float32Array(u.buffer, 0, u.length >> 2);
};
const u32 = (s) => {
  const u = unb64(s);
  return new Uint32Array(u.buffer, 0, u.length >> 2);
};
export const enc = {
  f32: (a) => b64(new Uint8Array(Float32Array.from(a).buffer)),
  u32: (a) => b64(new Uint8Array(Uint32Array.from(a).buffer)),
  u8: (a) => b64(Uint8Array.from(a)),
  /** run lengths of a 0/1 mask, starting with a run of zeros */
  mask: (m) => {
    const runs = [];
    let cur = 0, n = 0;
    for (let i = 0; i < m.length; i++) {
      const v = m[i] ? 1 : 0;
      if (v === cur) n++;
      else (runs.push(n), (cur = v), (n = 1));
    }
    runs.push(n);
    return b64(new Uint8Array(Uint32Array.from(runs).buffer));
  },
};
export const dec = {
  mask: (s, n) => {
    const runs = u32(s), m = new Uint8Array(n);
    let i = 0, v = 0;
    for (const r of runs) {
      if (v) m.fill(1, i, Math.min(n, i + r));
      i += r;
      v ^= 1;
    }
    return m;
  },
};

const texCache = new Map();
function texture(url, srgb) {
  if (!url || !url.startsWith('data:image/')) return Promise.resolve(null);
  const key = `${srgb}:${url.length}:${url.slice(-64)}`;
  if (!texCache.has(key))
    texCache.set(
      key,
      new Promise((res) => {
        new T.TextureLoader().load(
          url,
          (t) => {
            t.colorSpace = srgb ? T.SRGBColorSpace : T.NoColorSpace;
            t.anisotropy = 8;
            res(t);
          },
          undefined,
          () => res(null),
        );
      }),
    );
  return texCache.get(key);
}
const mesh = (geo, scan) => {
  const m = new T.Mesh(geo, new T.MeshStandardMaterial());
  m.castShadow = m.receiveShadow = true;
  m.userData.role = 'metal';
  m.userData.scan = scan;
  return m;
};

/** Build the meshes of a scan part. Each mesh carries userData.scan = { map, normalMap, vertexColors } for the look. */
export async function buildScan(json) {
  const d = JSON.parse(json);
  if (d.k === 'relief') {
    const { w, h } = d;
    if (!(w > 1 && h > 1 && w * h <= 1200 * 1200)) throw new Error('scan size');
    const n = w * h, mask = dec.mask(d.mask, n), front = f32(d.front), back = d.back ? f32(d.back) : null;
    if (front.length !== n || (back && back.length !== n)) throw new Error('scan data');
    const c = d.circle && [d.circle.cx, d.circle.cy, d.circle.r].every(Number.isFinite) ? d.circle : null;
    const s = reliefSolid({ w, h, mask, front, back, pxPerMm: d.pxmm, thickness: d.t, cell: d.cell ?? 2, circle: c });
    const [cf, nf, cb, nb] = await Promise.all([texture(d.colorF, true), texture(d.normalF, false), texture(d.colorB, true), texture(d.normalB, false)]);
    const out = [];
    s.groups.forEach(([start, count], gi) => {
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.BufferAttribute(s.position, 3));
      g.setAttribute('uv', new T.BufferAttribute(s.uv, 2));
      g.setIndex(new T.BufferAttribute(s.index.slice(start, start + count), 1));
      g.computeVertexNormals();
      out.push(mesh(g, gi === 0 ? { map: cf, normalMap: nf } : gi === 1 ? { map: cb ?? null, normalMap: nb ?? null } : {}));
    });
    out[0].userData.scanInfo = d.info ?? {};
    return out;
  }
  if (d.k === 'hull') {
    const p = f32(d.p), idx = u32(d.i), col = d.c ? unb64(d.c) : null, n = p.length / 3;
    if (!Number.isInteger(n) || idx.some((i) => i >= n) || p.some((v) => !Number.isFinite(v)) || (col && col.length !== n * 3)) throw new Error('scan data');
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(p, 3));
    if (col) g.setAttribute('color', new T.BufferAttribute(Float32Array.from(col, (v) => (v / 255) ** 2.2), 3));
    g.setIndex(new T.BufferAttribute(idx, 1));
    g.computeVertexNormals();
    const m = mesh(g, { vertexColors: !!col });
    m.userData.scanInfo = d.info ?? {};
    return [m];
  }
  throw new Error('scan kind');
}

/**
 * A relief scan whose thickness was only a default: set it from the true volume (Archimedes, mm³) so that
 * area × thickness + relief = volume. Returns the new scan JSON (or null when it does not apply).
 */
export function rethick(json, volume) {
  const d = JSON.parse(json);
  if (d.k !== 'relief' || !(volume > 0)) return null;
  const n = d.w * d.h, mask = dec.mask(d.mask, n), front = f32(d.front), back = d.back ? f32(d.back) : null;
  let area = 0, rel = 0;
  for (let i = 0; i < n; i++) if (mask[i]) (area += 1), (rel += front[i] + (back?.[i] ?? 0));
  area /= d.pxmm ** 2;
  rel /= d.pxmm ** 2;
  const t = (volume - rel) / area;
  if (!(t > 0.1 && t < 50)) return null;
  d.t = t;
  d.info = { ...(d.info ?? {}), thickness: t, thicknessFrom: 'حجم ارشمیدس (وزن در آب)', tKind: 'archimedes' };
  return JSON.stringify(d);
}

/** The «photo» look: the scan's own colours; the «metal» look keeps only the measured detail on the alloy. */
export function scanMaterial(scan, look, metal) {
  if (look === 'photo') {
    const m = new T.MeshStandardMaterial({ metalness: scan.vertexColors ? 0.35 : 0.7, roughness: scan.vertexColors ? 0.5 : 0.34, vertexColors: !!scan.vertexColors, map: scan.map ?? null, normalMap: scan.normalMap ?? null });
    if (!scan.map && !scan.vertexColors) m.color.setRGB(0.6, 0.6, 0.6);
    return m;
  }
  const m = metal.clone();
  if (scan.normalMap) (m.normalMap = scan.normalMap), m.normalScale.set(1, 1);
  return m;
}

PIECES.scan = {
  label: 'اسکن از عکس',
  params: {},
  opts: { scan: '', look: 'photo', name: '' },
  free: true,
  build: (p) => buildScan(p.scan),
};
