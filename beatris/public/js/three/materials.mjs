// Physically based materials for precious metals and gemstones.
import { T } from './stage.mjs';

/** Metal reflectance (linear F0) — measured-style values used in PBR jewellery work. */
export const METALS = {
  au24: { f0: [1.0, 0.72, 0.29], label: '۲۴ عیار' },
  au22: { f0: [1.0, 0.74, 0.33], label: '۲۲ عیار' },
  au21: { f0: [0.99, 0.75, 0.36], label: '۲۱ عیار' },
  au18y: { f0: [0.96, 0.76, 0.42], label: '۱۸ زرد' },
  au18r: { f0: [0.93, 0.6, 0.48], label: '۱۸ رز' },
  au18w: { f0: [0.86, 0.85, 0.82], label: '۱۸ سفید' },
  au14y: { f0: [0.92, 0.76, 0.5], label: '۱۴ زرد' },
  ag925: { f0: [0.96, 0.95, 0.92], label: 'نقره' },
  pt950: { f0: [0.82, 0.8, 0.77], label: 'پلاتین' },
};

export const FINISHES = [
  ['polish', 'براق آینه‌ای'],
  ['satin', 'مات ساتن'],
  ['brushed', 'خط‌دار (برس)'],
  ['hammer', 'چکش‌خورده'],
  ['sand', 'سندبلاست'],
  ['antique', 'آنتیک'],
];

/** Gem optical data: refractive index, dispersion (B–G), specific gravity, body colour. */
export const GEMS = {
  diamond: { label: 'الماس', ior: 2.417, disp: 0.044, sg: 3.52, color: 0xffffff, att: 0xffffff },
  ruby: { label: 'یاقوت سرخ', ior: 1.77, disp: 0.018, sg: 4.0, color: 0xff2a4a, att: 0xc0102c },
  sapphire: { label: 'یاقوت کبود', ior: 1.77, disp: 0.018, sg: 4.0, color: 0x3a62ff, att: 0x0d2aa0 },
  emerald: { label: 'زمرد', ior: 1.58, disp: 0.014, sg: 2.72, color: 0x2fd67a, att: 0x05804a },
  amethyst: { label: 'آمتیست', ior: 1.55, disp: 0.013, sg: 2.65, color: 0xb070ff, att: 0x6a24c0 },
  topaz: { label: 'توپاز آبی', ior: 1.62, disp: 0.014, sg: 3.53, color: 0x7fd8ff, att: 0x2a9ad0 },
  citrine: { label: 'سیترین', ior: 1.55, disp: 0.013, sg: 2.65, color: 0xffc04a, att: 0xd08010 },
  morganite: { label: 'مورگانیت', ior: 1.58, disp: 0.014, sg: 2.8, color: 0xffb6c1, att: 0xe88a9a },
  turquoise: { label: 'فیروزه نیشابور', ior: 1.61, disp: 0, sg: 2.7, color: 0x3fc1b0, opaque: true },
  lapis: { label: 'لاجورد', ior: 1.5, disp: 0, sg: 2.8, color: 0x1f3f9c, opaque: true },
  onyx: { label: 'عقیق سیاه', ior: 1.54, disp: 0, sg: 2.6, color: 0x0a0a0a, opaque: true },
  pearl: { label: 'مروارید', ior: 1.53, disp: 0, sg: 2.7, color: 0xf3ece2, opaque: true, pearl: true },
};

const cache = new Map();
let noiseTex = null;

/** Tileable procedural normal maps: hammered dimples and sandblast grain. */
function proceduralNormal(kind) {
  const key = `n:${kind}`;
  if (cache.has(key)) return cache.get(key);
  const N = 512;
  const h = new Float32Array(N * N);
  if (kind === 'hammer') {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 170; k++) {
      const cx = rnd() * N, cy = rnd() * N, r = 18 + rnd() * 26;
      for (let y = -r; y <= r; y++)
        for (let x = -r; x <= r; x++) {
          const d = Math.hypot(x, y) / r;
          if (d > 1) continue;
          const px = ((Math.round(cx + x) % N) + N) % N, py = ((Math.round(cy + y) % N) + N) % N;
          h[py * N + px] = Math.min(h[py * N + px], -(Math.cos(d * Math.PI) + 1) * 0.5 * r * 0.12);
        }
    }
  } else {
    let seed = 3;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < h.length; i++) h[i] = rnd();
  }
  const data = new Uint8Array(N * N * 4);
  const s = kind === 'hammer' ? 0.35 : 0.9;
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      const dx = h[y * N + ((x + 1) % N)] - h[y * N + ((x - 1 + N) % N)];
      const dy = h[((y + 1) % N) * N + x] - h[((y - 1 + N) % N) * N + x];
      const nx = -dx * s, ny = -dy * s, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      data[i * 4] = ((nx / l) * 0.5 + 0.5) * 255;
      data[i * 4 + 1] = ((ny / l) * 0.5 + 0.5) * 255;
      data[i * 4 + 2] = ((nz / l) * 0.5 + 0.5) * 255;
      data[i * 4 + 3] = 255;
    }
  const tex = new T.DataTexture(data, N, N, T.RGBAFormat);
  tex.wrapS = tex.wrapT = T.RepeatWrapping;
  tex.generateMipmaps = true;
  tex.minFilter = T.LinearMipmapLinearFilter;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  cache.set(key, tex);
  return tex;
}

export function metalMaterial(alloy = 'au18y', finish = 'polish') {
  const key = `m:${alloy}:${finish}`;
  if (cache.has(key)) return cache.get(key);
  const f0 = (METALS[alloy] ?? METALS.au18y).f0;
  const m = new T.MeshPhysicalMaterial({ metalness: 1, roughness: 0.06, envMapIntensity: 1.15 });
  m.color.setRGB(f0[0], f0[1], f0[2], T.LinearSRGBColorSpace);
  if (finish === 'satin') m.roughness = 0.3;
  if (finish === 'brushed') {
    m.roughness = 0.24;
    m.anisotropy = 0.85;
    m.anisotropyRotation = Math.PI / 2;
  }
  if (finish === 'hammer') {
    m.roughness = 0.1;
    m.normalMap = proceduralNormal('hammer');
    m.normalScale.set(1, 1);
  }
  if (finish === 'sand') {
    m.roughness = 0.55;
    m.normalMap = proceduralNormal('sand');
    m.normalScale.set(0.25, 0.25);
  }
  if (finish === 'antique') {
    m.roughness = 0.34;
    m.color.multiplyScalar(0.72);
    m.clearcoat = 0.3;
    m.clearcoatRoughness = 0.5;
  }
  m.userData = { alloy, finish };
  cache.set(key, m);
  return m;
}

export function gemMaterial(kind = 'diamond', { color } = {}) {
  const g = GEMS[kind] ?? GEMS.diamond;
  const key = `g:${kind}:${color ?? ''}`;
  if (cache.has(key)) return cache.get(key);
  let m;
  if (g.opaque) {
    m = new T.MeshPhysicalMaterial({ color: color ?? g.color, roughness: g.pearl ? 0.18 : 0.12, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, sheen: g.pearl ? 1 : 0, sheenColor: new T.Color(0xffe8f0), iridescence: g.pearl ? 0.6 : 0, iridescenceIOR: 1.6 });
  } else {
    m = new T.MeshPhysicalMaterial({
      color: color ?? g.color,
      metalness: 0,
      roughness: 0,
      transmission: 1,
      ior: g.ior,
      thickness: 2,
      dispersion: g.disp * 110,
      attenuationColor: new T.Color(color ?? g.att),
      attenuationDistance: kind === 'diamond' ? 1000 : 2.2,
      specularIntensity: 1,
      envMapIntensity: kind === 'diamond' ? 2.2 : 1.6,
      flatShading: true,
    });
  }
  m.userData = { gem: kind };
  cache.set(key, m);
  return m;
}

/** Dark lacquer used for engraved/oxidised detail. */
export function enamelMaterial(color = 0x0c0b0a) {
  const key = `e:${color}`;
  if (cache.has(key)) return cache.get(key);
  const m = new T.MeshPhysicalMaterial({ color, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.08 });
  cache.set(key, m);
  return m;
}
