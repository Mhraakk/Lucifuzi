// Procedural training coins: one closed high-resolution mesh per coin whose relief comes from a
// height map painted on a canvas. Designs are stylised teaching replicas marked «نمونه آموزشی» —
// they carry the features an inspector checks (rim, bead border, inscriptions, motif, reeded edge)
// without reproducing any official die.
import { T } from './stage.mjs';
import { COIN_TYPES } from '../coins.mjs';

const TAU = Math.PI * 2;
const HF = 1024;

/* ------------------------------------------------------------------ height maps */

function arcWords(g, words, r, a0, a1, px, family, bottom = false) {
  g.font = `700 ${px}px ${family}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.direction = 'rtl';
  // Persian reads right to left: the first word sits at the right end of the arc
  const n = words.length;
  words.forEach((w, i) => {
    const a = n === 1 ? (a0 + a1) / 2 : a1 - ((a1 - a0) * i) / (n - 1);
    g.save();
    g.translate(HF / 2, HF / 2);
    if (bottom) {
      g.rotate(-a);
      g.translate(0, r);
    } else {
      g.rotate(a);
      g.translate(0, -r);
    }
    g.fillText(w, 0, 0);
    g.restore();
  });
}

function shrine(g, k = 1) {
  // stylised dome, iwan and two minarets (a generic Persian shrine silhouette)
  const cx = HF / 2, base = HF * 0.66;
  g.save();
  g.translate(cx, base);
  g.scale(k, k);
  const hi = (x0, y0, x1, y1) => {
    const gr = g.createLinearGradient(x0, y0, x1, y1);
    gr.addColorStop(0, '#9a9a9a');
    gr.addColorStop(0.5, '#ffffff');
    gr.addColorStop(1, '#9a9a9a');
    return gr;
  };
  g.fillStyle = '#c8c8c8';
  g.fillRect(-190, -40, 380, 40); // platform
  g.fillStyle = hi(-150, 0, 150, 0);
  g.fillRect(-150, -170, 300, 130); // body
  // onion dome
  const dome = g.createRadialGradient(-30, -300, 10, 0, -260, 150);
  dome.addColorStop(0, '#ffffff');
  dome.addColorStop(1, '#8a8a8a');
  g.fillStyle = dome;
  g.beginPath();
  g.moveTo(-120, -170);
  g.bezierCurveTo(-140, -270, -70, -330, 0, -370);
  g.bezierCurveTo(70, -330, 140, -270, 120, -170);
  g.closePath();
  g.fill();
  g.fillStyle = '#ffffff';
  g.fillRect(-4, -410, 8, 44); // finial
  // iwan (pointed arch) cut in
  g.fillStyle = '#5a5a5a';
  g.beginPath();
  g.moveTo(-55, -40);
  g.lineTo(-55, -110);
  g.quadraticCurveTo(-50, -150, 0, -165);
  g.quadraticCurveTo(50, -150, 55, -110);
  g.lineTo(55, -40);
  g.closePath();
  g.fill();
  // minarets
  for (const s of [-1, 1]) {
    g.fillStyle = hi(s * 215 - 18, 0, s * 215 + 18, 0);
    g.fillRect(s * 215 - 18, -330, 36, 290);
    g.fillStyle = '#ffffff';
    g.fillRect(s * 215 - 26, -300, 52, 14);
    g.beginPath();
    g.moveTo(s * 215 - 20, -330);
    g.lineTo(s * 215, -372);
    g.lineTo(s * 215 + 20, -330);
    g.fill();
  }
  g.restore();
}

function cameo(g) {
  // an engraved medallion (no portrait): oval frame, guilloché field, shamseh
  const cx = HF / 2, cy = HF / 2;
  g.save();
  g.lineWidth = 16;
  g.strokeStyle = '#ffffff';
  g.beginPath();
  g.ellipse(cx, cy + 10, 210, 250, 0, 0, TAU);
  g.stroke();
  g.lineWidth = 3;
  g.strokeStyle = '#b8b8b8';
  for (let i = 0; i < 36; i++) {
    g.beginPath();
    g.ellipse(cx, cy + 10, 190, 90, (i / 36) * Math.PI, 0, TAU);
    g.stroke();
  }
  g.fillStyle = '#ffffff';
  g.beginPath();
  for (let i = 0; i < 16; i++) {
    const r = i % 2 ? 70 : 110;
    const a = (i / 16) * TAU - Math.PI / 2;
    g.lineTo(cx + r * Math.cos(a), cy + 10 + r * Math.sin(a));
  }
  g.closePath();
  g.fill();
  g.fillStyle = '#6a6a6a';
  g.beginPath();
  g.arc(cx, cy + 10, 34, 0, TAU);
  g.fill();
  g.restore();
}

function rosette(g, R = 300) {
  const cx = HF / 2, cy = HF / 2;
  for (let i = 0; i < 12; i++) {
    g.save();
    g.translate(cx, cy);
    g.rotate((i / 12) * TAU);
    const gr = g.createLinearGradient(-40, 0, 40, 0);
    gr.addColorStop(0, '#9a9a9a');
    gr.addColorStop(0.5, '#ffffff');
    gr.addColorStop(1, '#9a9a9a');
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(0, -R * 0.2);
    g.bezierCurveTo(R * 0.16, -R * 0.45, R * 0.12, -R * 0.82, 0, -R * 0.95);
    g.bezierCurveTo(-R * 0.12, -R * 0.82, -R * 0.16, -R * 0.45, 0, -R * 0.2);
    g.fill();
    g.restore();
  }
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.arc(cx, cy, R * 0.15, 0, TAU);
  g.fill();
}

/** Paint one face. Returns a bilinear height sampler h(u,v) ∈ [0,1] over the unit square. */
function faceHeight(coinId, side, look, seed) {
  const c = COIN_TYPES[coinId];
  const cv = document.createElement('canvas');
  cv.width = cv.height = HF;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#000';
  g.fillRect(0, 0, HF, HF);
  const motif = side === 'obv' ? c.obv : c.rev;
  const font = look.font === 'Vazirmatn' ? 'Vazirmatn' : 'Markazi';
  g.fillStyle = '#ffffff';
  g.strokeStyle = '#ffffff';
  // bead border and inner line
  const beads = look.beads;
  for (let i = 0; i < beads; i++) {
    const a = (i / beads) * TAU;
    g.beginPath();
    g.arc(HF / 2 + Math.cos(a) * HF * 0.43, HF / 2 + Math.sin(a) * HF * 0.43, HF * 0.0105, 0, TAU);
    g.fill();
  }
  g.lineWidth = 4;
  g.beginPath();
  g.arc(HF / 2, HF / 2, HF * 0.405, 0, TAU);
  g.stroke();

  if (motif === 'shrine') {
    shrine(g, 0.78);
    arcWords(g, ['جمهوری', 'اسلامی', 'ایران'], HF * 0.345, -0.75, 0.75, 54, font);
    arcWords(g, ['نمونه آموزشی'], HF * 0.345, 0, 0, 40, font, true);
  } else if (motif === 'cameo') {
    cameo(g);
    arcWords(g, ['بانک', 'مرکزی', 'نمونه'], HF * 0.365, -0.7, 0.7, 50, font);
    g.font = `700 64px ${font}`;
    g.textAlign = 'center';
    g.fillText(side === 'obv' ? '۱۴۰۵' : '', HF / 2, HF * 0.83);
  } else if (motif === 'words') {
    g.font = `700 ${c.diameter > 20 ? 150 : 170}px ${font}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.direction = 'rtl';
    g.fillText('بهار آزادی', HF / 2, HF * 0.45);
    g.font = `700 90px ${font}`;
    g.fillText('۱۴۰۵', HF / 2, HF * 0.64);
    arcWords(g, ['نمونه آموزشی'], HF * 0.345, 0, 0, 40, font, true);
  } else if (motif === 'rosette') {
    rosette(g, HF * 0.29);
  } else if (motif === 'parsian') {
    g.font = `700 150px ${font}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('پارسیان', HF / 2, HF * 0.42);
    g.font = `700 100px ${font}`;
    g.fillText('۱ گرم · ۷۵۰', HF / 2, HF * 0.62);
  }
  // defects
  let r = seed * 9301 + 49297;
  const rnd = () => ((r = (r * 233280 + 49297) % 2147483647) / 2147483647);
  if (look.pores) {
    g.fillStyle = '#202020';
    for (let i = 0; i < 260; i++) {
      const a = rnd() * TAU, d = Math.sqrt(rnd()) * HF * 0.39;
      g.beginPath();
      g.arc(HF / 2 + Math.cos(a) * d, HF / 2 + Math.sin(a) * d, 2 + rnd() * 4, 0, TAU);
      g.fill();
    }
  }
  if (look.plug && side === 'obv') {
    const x = HF * 0.63, y = HF * 0.36;
    g.fillStyle = '#4a4a4a';
    g.beginPath();
    g.arc(x, y, HF * 0.045, 0, TAU);
    g.fill();
    g.strokeStyle = '#000';
    g.lineWidth = 5;
    g.stroke();
  }
  // soften: striking gives crisp edges; casting blurs them
  const blurred = document.createElement('canvas');
  blurred.width = blurred.height = HF;
  const b = blurred.getContext('2d', { willReadFrequently: true });
  b.filter = `blur(${look.soft ? 7 : 1.2}px)`;
  b.drawImage(cv, 0, 0);
  const d = b.getImageData(0, 0, HF, HF).data;
  const h = new Float32Array(HF * HF);
  for (let i = 0; i < h.length; i++) h[i] = d[i * 4] / 255;
  const sample = (u, v) => {
    const x = Math.min(HF - 1.001, Math.max(0, u * (HF - 1)));
    const y = Math.min(HF - 1.001, Math.max(0, v * (HF - 1)));
    const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0;
    const i = y0 * HF + x0;
    return (h[i] * (1 - fx) + h[i + 1] * fx) * (1 - fy) + (h[i + HF] * (1 - fx) + h[i + HF + 1] * fx) * fy;
  };
  return { sample, canvas: cv };
}

/* ------------------------------------------------------------------ mesh */

/**
 * Build a closed coin mesh (face +Z). s = specimen from coins.mjs (measured diameter/thickness, reeds, look).
 * quality: 1 = interactive, 2 = 4K stills.
 */
export function coinGeometry(s, { quality = 1 } = {}) {
  const R = s.diameter / 2;
  const t = s.thickness;
  const rimW = Math.max(0.55, R * 0.075);
  const fieldDrop = t * 0.1;
  const relief = t * 0.13;
  const top = faceHeight(s.coinId, 'obv', s.look, s.seed);
  const bot = faceHeight(s.coinId, 'rev', s.look, s.seed + 1);
  const NR = quality > 1 ? 260 : 170;
  const NS = Math.max(4 * s.reeds.count, quality > 1 ? 1100 : 720);
  const reedDepth = 0.035 + 0.0035 * R; // mm
  // reed phase jitter for irregular (tooled) edges
  const phase = new Float32Array(s.reeds.count);
  for (let i = 0; i < phase.length; i++) phase[i] = s.reeds.regular ? 0 : Math.sin(i * 12.9898 + s.seed) * 0.35;
  const edgeR = (a) => {
    const k = (a / TAU) * s.reeds.count;
    const i = Math.floor(k) % s.reeds.count;
    const f = k - Math.floor(k) + phase[i];
    const groove = Math.max(0, Math.cos(f * TAU)) ** 2;
    let seam = 0;
    if (s.look.seam) seam = Math.max(0, 1 - Math.abs(Math.sin(a)) * 60) * 0.05;
    return R - reedDepth * s.reeds.depth * groove + seam;
  };
  const profile = (u) => {
    // height above the mid-plane before relief, u = r/R
    if (u > 0.985) return t / 2 - (u - 0.985) / 0.015 * t * 0.12; // small edge roll
    if (u > 1 - rimW / R) return t / 2;
    const w = 1 - rimW / R;
    if (u > w - 0.02) return t / 2 - fieldDrop * ((w - u) / 0.02); // rim wall
    return t / 2 - fieldDrop;
  };
  const inField = (u) => u < 1 - rimW / R - 0.02;
  const pos = [];
  const idx = [];
  const face = (sign, hf) => {
    const base = pos.length / 3;
    pos.push(0, 0, sign * (profile(0) + hf.sample(0.5, 0.5) * relief));
    for (let i = 1; i <= NR; i++) {
      const u = i / NR;
      for (let j = 0; j < NS; j++) {
        const a = (j / NS) * TAU;
        const r = i === NR ? edgeR(a) : u * R;
        const x = r * Math.cos(a), y = r * Math.sin(a);
        // reverse side is read from behind: mirror x in texture space
        const tu = 0.5 + (sign > 0 ? x : -x) / (2 * R) * 0.96, tv = 0.5 - y / (2 * R) * 0.96;
        const z = profile(u) + (inField(u) ? hf.sample(tu, tv) * relief : 0);
        pos.push(x, y, sign * z);
      }
    }
    const at = (i, j) => (i === 0 ? base : base + 1 + (i - 1) * NS + (j % NS));
    for (let i = 0; i < NR; i++)
      for (let j = 0; j < NS; j++) {
        if (i === 0) sign > 0 ? idx.push(at(0, 0), at(1, j), at(1, j + 1)) : idx.push(at(0, 0), at(1, j + 1), at(1, j));
        else {
          const a = at(i, j), b = at(i, j + 1), c = at(i + 1, j + 1), d = at(i + 1, j);
          sign > 0 ? idx.push(a, d, c, a, c, b) : idx.push(a, c, d, a, b, c);
        }
      }
    return (j) => at(NR, j);
  };
  const topRing = face(1, top);
  const botRing = face(-1, bot);
  // side wall: straight between the two outer rings (they already carry the reeding)
  for (let j = 0; j < NS; j++) {
    const a = topRing(j), b = topRing(j + 1), c = botRing(j + 1), d = botRing(j);
    idx.push(a, c, b, a, d, c); // outward-facing wall
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  // make sure triangles face outward
  const p = geo.attributes.position.array;
  let vol = 0;
  for (let i = 0; i < idx.length; i += 3) {
    const A = idx[i] * 3, B = idx[i + 1] * 3, C = idx[i + 2] * 3;
    vol += p[A] * (p[B + 1] * p[C + 2] - p[B + 2] * p[C + 1]) - p[A + 1] * (p[B] * p[C + 2] - p[B + 2] * p[C]) + p[A + 2] * (p[B] * p[C + 1] - p[B + 1] * p[C]);
  }
  // every face is wound outward by construction, so the signed volume must be positive
  geo.computeVertexNormals();
  geo.userData.volume = vol / 6;
  geo.userData.faces = { obv: top.canvas, rev: bot.canvas };
  return geo;
}

/* ------------------------------------------------------------------ materials */

const matCache = new Map();
/** Metal look per specimen: 900 gold–copper is a warm, slightly red gold; fakes drift. */
export function coinMaterial(s) {
  const key = `${s.kind}:${s.look.tint}`;
  if (matCache.has(key)) return matCache.get(key);
  const f0 = {
    genuine: [0.98, 0.7, 0.4],
    shaved: [0.98, 0.7, 0.4],
    plugged: [0.98, 0.7, 0.4],
    tungsten: [0.98, 0.71, 0.4],
    wrongdie: [0.98, 0.71, 0.41],
    lowkarat: [0.95, 0.77, 0.47],
    brass: [0.93, 0.78, 0.38],
    steel: [0.96, 0.8, 0.46],
    cast: [0.96, 0.7, 0.42],
  }[s.kind] ?? [0.98, 0.7, 0.4];
  const m = new T.MeshPhysicalMaterial({ metalness: 1, roughness: s.kind === 'cast' ? 0.38 : 0.26, envMapIntensity: 0.95 });
  m.color.setRGB(f0[0], f0[1], f0[2], T.LinearSRGBColorSpace);
  matCache.set(key, m);
  return m;
}

/* ------------------------------------------------------------------ bank seal */

/**
 * Vacuum seal card around a coin. fake = missing hologram, misaligned print, wrong serial pattern.
 * Returns a group centred on the coin (coin face +Z).
 */
export function sealPackage(s, { fake = false } = {}) {
  const c = COIN_TYPES[s.coinId];
  const R = s.diameter / 2;
  const W = R * 3.1, H = R * 4.3, D = s.thickness + 1.6;
  const grp = new T.Group();
  const shape = new T.Shape();
  const rr = R * 0.35;
  shape.moveTo(-W / 2 + rr, -H / 2);
  shape.lineTo(W / 2 - rr, -H / 2);
  shape.quadraticCurveTo(W / 2, -H / 2, W / 2, -H / 2 + rr);
  shape.lineTo(W / 2, H / 2 - rr);
  shape.quadraticCurveTo(W / 2, H / 2, W / 2 - rr, H / 2);
  shape.lineTo(-W / 2 + rr, H / 2);
  shape.quadraticCurveTo(-W / 2, H / 2, -W / 2, H / 2 - rr);
  shape.lineTo(-W / 2, -H / 2 + rr);
  shape.quadraticCurveTo(-W / 2, -H / 2, -W / 2 + rr, -H / 2);
  const shell = new T.ExtrudeGeometry(shape, { depth: D, bevelEnabled: true, bevelSize: 0.4, bevelThickness: 0.4, bevelSegments: 4, curveSegments: 16 });
  shell.translate(0, -R * 0.55, -D / 2);
  const plastic = new T.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0.05, transparent: true, opacity: 0.16, depthWrite: false, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.2 });
  const sm = new T.Mesh(shell, plastic);
  sm.renderOrder = 2;
  grp.add(sm);
  // printed backing card
  const cv = document.createElement('canvas');
  cv.width = 1024;
  cv.height = Math.round((1024 * H) / W);
  const g = cv.getContext('2d');
  g.fillStyle = '#f4efe4';
  g.fillRect(0, 0, cv.width, cv.height);
  g.fillStyle = '#1b2a4a';
  g.fillRect(0, 0, cv.width, cv.height * 0.12);
  g.direction = 'rtl';
  g.textAlign = 'center';
  g.fillStyle = '#f4efe4';
  g.font = '700 58px Vazirmatn';
  g.fillText('پلمپ نمونه آموزشی', cv.width / 2 + (fake ? 18 : 0), cv.height * 0.085);
  g.fillStyle = '#1b2a4a';
  g.font = '600 46px Vazirmatn';
  const y0 = cv.height * 0.78;
  const serial = fake ? '۱۴۰۵-A۲۳۷۱۵' : '۱۴۰۵-۰۲۳۷۱۵';
  const lines = [c.short, `وزن ${c.weight.toString().replace(/\d/g, (x) => '۰۱۲۳۴۵۶۷۸۹'[x]).replace('.', '٫')} گرم · عیار ${c.fineness === 900 ? '۹۰۰' : '۷۵۰'}`, `سریال ${serial}`];
  lines.forEach((l, i) => g.fillText(fake && i === 1 ? l.replace('گرم', 'گرام') : l, cv.width / 2 + (fake ? 14 : 0), y0 + i * 62));
  const tex = new T.CanvasTexture(cv);
  tex.colorSpace = T.SRGBColorSpace;
  tex.anisotropy = 8;
  const card = new T.Mesh(new T.PlaneGeometry(W - 0.8, H - 0.8), new T.MeshStandardMaterial({ map: tex, roughness: 0.6 }));
  card.position.set(0, -R * 0.55, -s.thickness / 2 - 0.3);
  grp.add(card);
  // hologram strip (iridescent); the fake prints a flat gold stripe instead
  const holoMat = fake ? new T.MeshStandardMaterial({ color: 0xc9a34a, roughness: 0.5, metalness: 0.2 }) : new T.MeshPhysicalMaterial({ color: 0xffffff, metalness: 1, roughness: 0.12, iridescence: 1, iridescenceIOR: 1.8, iridescenceThicknessRange: [200, 900] });
  const holo = new T.Mesh(new T.PlaneGeometry(W * 0.7, R * 0.28), holoMat);
  holo.position.set(0, -R * 1.55, -s.thickness / 2 - 0.25);
  grp.add(holo);
  grp.userData.role = 'seal';
  return grp;
}
