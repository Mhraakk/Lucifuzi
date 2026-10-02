// Procedural training coins: one closed high-resolution mesh per coin whose relief comes from a
// height map painted on a canvas. Designs are stylised teaching replicas marked «نمونه آموزشی» —
// they carry the features an inspector checks (rim, bead border, inscriptions, motif, reeded edge)
// without reproducing any official die.
import { T } from './stage.mjs';
import { COIN_TYPES, SEAL_TYPES } from '../coins.mjs';

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
export function coinGeometry(s, { quality = 1, faces = null } = {}) {
  const R = s.diameter / 2;
  const t = s.thickness;
  const rimW = Math.max(0.55, R * 0.075);
  const fieldDrop = t * 0.1;
  const relief = t * 0.13;
  // photo coins pass their own relief samplers; the photo then spans the face 1:1 (rim included)
  const exact = !!faces;
  const top = faces?.obv ?? faceHeight(s.coinId, 'obv', s.look, s.seed);
  const bot = faces?.rev ?? faceHeight(s.coinId, 'rev', s.look, s.seed + 1);
  const span = exact ? s.diameter / (COIN_TYPES[s.coinId]?.diameter ?? s.diameter) : 0.96;
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
  const inField = (u) => (exact ? u < 0.985 : u < 1 - rimW / R - 0.02);
  const pos = [];
  const uvs = [];
  const idx = [];
  const face = (sign, hf) => {
    const base = pos.length / 3;
    pos.push(0, 0, sign * (profile(0) + hf.sample(0.5, 0.5) * relief));
    uvs.push(0.5, 0.5);
    for (let i = 1; i <= NR; i++) {
      const u = i / NR;
      for (let j = 0; j < NS; j++) {
        const a = (j / NS) * TAU;
        const r = i === NR ? edgeR(a) : u * R;
        const x = r * Math.cos(a), y = r * Math.sin(a);
        // reverse side is read from behind: mirror x in texture space
        const tu = 0.5 + ((sign > 0 ? x : -x) / (2 * R)) * span, tv = 0.5 - (y / (2 * R)) * span;
        const z = profile(u) + (inField(u) ? hf.sample(tu, tv) * relief : 0);
        pos.push(x, y, sign * z);
        uvs.push(tu, 1 - tv); // textures are uploaded with flipY: v runs upwards
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
  const nTop = idx.length;
  const botRing = face(-1, bot);
  const nBot = idx.length - nTop;
  // side wall: straight between the two outer rings (they already carry the reeding)
  for (let j = 0; j < NS; j++) {
    const a = topRing(j), b = topRing(j + 1), c = botRing(j + 1), d = botRing(j);
    idx.push(a, c, b, a, d, c); // outward-facing wall
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  // material slots: 0 obverse, 1 reverse, 2 edge (a single material ignores the groups)
  geo.addGroup(0, nTop, 0);
  geo.addGroup(nTop, nBot, 1);
  geo.addGroup(nTop + nBot, idx.length - nTop - nBot, 2);
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

/* ------------------------------------------------------------------ sealed packs */

const faDigits = (x) => String(x).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]).replace('.', '٫');

function roundedRect(W, H, rr) {
  const sh = new T.Shape();
  sh.moveTo(-W / 2 + rr, -H / 2);
  sh.lineTo(W / 2 - rr, -H / 2);
  sh.quadraticCurveTo(W / 2, -H / 2, W / 2, -H / 2 + rr);
  sh.lineTo(W / 2, H / 2 - rr);
  sh.quadraticCurveTo(W / 2, H / 2, W / 2 - rr, H / 2);
  sh.lineTo(-W / 2 + rr, H / 2);
  sh.quadraticCurveTo(-W / 2, H / 2, -W / 2, H / 2 - rr);
  sh.lineTo(-W / 2, -H / 2 + rr);
  sh.quadraticCurveTo(-W / 2, -H / 2, -W / 2 + rr, -H / 2);
  return sh;
}

/** A pressed seam: a thin closed tube following a rounded rectangle. */
function seamTube(W, H, rr, z, radius, mat, jitter = 0, seed = 1) {
  let s = seed;
  const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296) * 2 - 1;
  const pts = roundedRect(W, H, rr)
    .getSpacedPoints(220)
    .slice(0, -1)
    .map((p) => new T.Vector3(p.x + rnd() * jitter, p.y + rnd() * jitter, z));
  const curve = new T.CatmullRomCurve3(pts, true);
  return new T.Mesh(new T.TubeGeometry(curve, 440, radius, 6, true), mat);
}

/** Printed backing card; every print trick of the pack is painted here. */
function cardTexture(pack, W, H) {
  const ST = SEAL_TYPES[pack.type];
  const c = COIN_TYPES[pack.card];
  const bad = pack.anomalies.print;
  const cv = document.createElement('canvas');
  cv.width = 1024;
  cv.height = Math.round((1024 * H) / W);
  const g = cv.getContext('2d');
  const CH = cv.height;
  g.fillStyle = '#f4efe4';
  g.fillRect(0, 0, 1024, CH);
  // guilloche background: fine interlaced curves (a genuine anti-copy feature; the fake is coarser)
  g.strokeStyle = bad ? 'rgba(27,42,74,.16)' : 'rgba(27,42,74,.09)';
  g.lineWidth = bad ? 2.4 : 1;
  for (let k = 0; k < (bad ? 9 : 26); k++) {
    g.beginPath();
    for (let x = 0; x <= 1024; x += 8) {
      const y = CH * 0.5 + Math.sin(x / 70 + k * 0.5) * CH * 0.2 * Math.cos(k * 0.37 + x / 400);
      x ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.stroke();
  }
  g.fillStyle = ST.header;
  g.fillRect(0, 0, 1024, CH * 0.12);
  g.save();
  g.direction = 'rtl';
  g.textAlign = 'center';
  g.fillStyle = '#f4efe4';
  g.font = `700 54px ${bad ? 'Markazi' : 'Vazirmatn'}`;
  if (bad) {
    g.translate(512, CH * 0.075);
    g.rotate(-0.012);
    g.fillText(`${ST.label} · نمونه آموزشی`, 14, 0);
  } else g.fillText(`${ST.label} · نمونه آموزشی`, 512, CH * 0.08);
  g.restore();
  // text block (right aligned, RTL)
  g.save();
  if (bad) g.filter = 'blur(1.1px)';
  g.direction = 'rtl';
  g.textAlign = 'right';
  g.fillStyle = '#1b2a4a';
  const x0 = 1024 - 70 + (bad ? 16 : 0);
  const fin = c.fineness === 900 ? '۹۰۰' : '۷۵۰';
  // mint year inside the design's period (old design up to 1386, new design after it)
  const [y0, y1] = pack.card === 'gerami' ? [1390, 1404] : c.years?.includes('ماقبل') ? [1370, 1386] : c.years?.includes('به بعد') ? [1387, 1404] : [1380, 1404];
  const year = y0 + ((pack.seed >>> 0) % (y1 - y0 + 1));
  const lines = [
    ['700 52px Vazirmatn', c.label.replace(/ \(.*\)$/, '')],
    ['500 42px Vazirmatn', `وزن ${faDigits(c.weight)} ${bad ? 'گرام' : 'گرم'} · عیار ${fin} · ضرب ${faDigits(year)}`],
    ['500 42px Vazirmatn', `سریال ${faDigits(pack.serial)}`],
    ['500 36px Vazirmatn', `کد استعلام ${faDigits(String((pack.seed * 7919) % 90000 + 10000))}`],
  ];
  lines.forEach(([font, text], i) => {
    g.font = font;
    g.fillText(text, x0 + (bad && i === 2 ? 6 : 0), CH * (0.745 + i * 0.047));
  });
  g.restore();
  if (pack.link) {
    // a QR-like block and a lookalike address — the phishing trick
    const q = 150, qx = 60, qy = CH * 0.79;
    g.fillStyle = '#fff';
    g.fillRect(qx - 8, qy - 8, q + 16, q + 16);
    g.fillStyle = '#111';
    let s = pack.seed >>> 0 || 1;
    const cell = q / 21;
    for (let y = 0; y < 21; y++)
      for (let x = 0; x < 21; x++) {
        const finder = (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13);
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        const on = finder ? x % 6 === 0 || y % 6 === 0 || (x % 7 >= 2 && x % 7 <= 4 && y % 7 >= 2 && y % 7 <= 4) || x === 20 || y === 20 : s > 2147483648;
        if (on) g.fillRect(qx + x * cell, qy + y * cell, cell + 0.5, cell + 0.5);
      }
    g.font = '500 26px Vazirmatn';
    g.textAlign = 'left';
    g.direction = 'ltr';
    g.fillText(pack.link, qx - 6, qy + q + 38);
  }
  const tex = new T.CanvasTexture(cv);
  tex.colorSpace = T.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** Box with rounded corners and dense faces, so a trapped-air bulge can deform the faces. */
function pillowShell(W, H, D, rr, bulge) {
  const g = new T.BoxGeometry(W, H, D, 36, 48, 2);
  const pos = g.attributes.position;
  const cx = W / 2 - rr, cyy = H / 2 - rr;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i), y = pos.getY(i);
    const z = pos.getZ(i);
    const ox = Math.abs(x) - cx, oy = Math.abs(y) - cyy;
    if (ox > 0 && oy > 0) {
      const l = Math.hypot(ox, oy);
      const k = Math.min(1, rr / l);
      x = Math.sign(x) * (cx + ox * k);
      y = Math.sign(y) * (cyy + oy * k);
    }
    let zz = z;
    if (bulge) {
      const nx = x / (W / 2), ny = y / (H / 2);
      zz += Math.sign(z) * bulge * Math.max(0, 1 - nx * nx) * Math.max(0, 1 - ny * ny) * (Math.abs(z) > 1e-6 ? 1 : 0);
    }
    pos.setXYZ(i, x, y, zz);
  }
  g.computeVertexNormals();
  return g;
}

/** Genuine security foil: fine diffraction lines, metallic, colour shifts with angle. */
function hologramFoil() {
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = 64;
  const g = cv.getContext('2d');
  for (let x = 0; x < 512; x += 2) {
    g.fillStyle = `hsl(${(x * 2.3) % 360} 85% 62%)`;
    g.fillRect(x, 0, 2, 64);
  }
  g.globalAlpha = 0.35;
  for (let k = 0; k < 40; k++) {
    g.strokeStyle = `hsl(${k * 29} 90% 75%)`;
    g.beginPath();
    g.arc(k * 14, 32, 22, 0, TAU);
    g.stroke();
  }
  const tex = new T.CanvasTexture(cv);
  tex.colorSpace = T.SRGBColorSpace;
  return new T.MeshPhysicalMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.18, metalness: 1, roughness: 0.18, iridescence: 1, iridescenceIOR: 1.8, iridescenceThicknessRange: [200, 900] });
}
/** Counterfeit: the same rainbow merely printed in matte ink — it never changes with the light. */
function printedStripe() {
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 32;
  const g = cv.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 256, 0);
  ['#c9a34a', '#b9c7a0', '#a6b8d6', '#d1a7c4', '#c9a34a'].forEach((c, i, a) => gr.addColorStop(i / (a.length - 1), c));
  g.fillStyle = gr;
  g.fillRect(0, 0, 256, 32);
  const tex = new T.CanvasTexture(cv);
  tex.colorSpace = T.SRGBColorSpace;
  return new T.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0 });
}

/**
 * Sealed pack around the coin (coin face +Z, centred on the coin). Every anomaly of the pack is
 * modelled physically: hologram (iridescent vs flat print), pressed seam (single vs doubled with glue
 * and a cut), swelling (bulged shell), print errors, card/coin mismatch (the coin inside is pack.coin)
 * and a phishing QR.
 */
export function sealPackage(pack) {
  const s = pack.coin;
  const an = pack.anomalies;
  const R = COIN_TYPES[pack.card].diameter / 2;
  const W = R * 3.1, H = R * 4.3, D = s.thickness + 1.6;
  const cy = -R * 0.55;
  const grp = new T.Group();
  const rr = R * 0.35;
  const shell = pillowShell(W, H, D + 0.8, rr, an.swell ? D * 0.55 : 0);
  shell.translate(0, cy, 0);
  const plastic = new T.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: an.swell ? 0.14 : 0.06, transparent: true, opacity: 0.08, depthWrite: false, clearcoat: 0.6, clearcoatRoughness: 0.06, envMapIntensity: 0.35 });
  const sm = new T.Mesh(shell, plastic);
  sm.renderOrder = 2;
  sm.userData.part = 'shell';
  grp.add(sm);
  // pressed seams on the front face
  const zf = D / 2 + 0.4 + (an.swell ? 0 : 0.02);
  const seamMat = new T.MeshPhysicalMaterial({ color: 0xd9e0e6, roughness: 0.35, transparent: true, opacity: 0.85, clearcoat: 1 });
  const seam = seamTube(W - 1.2, H - 1.2, rr * 0.8, zf, 0.16, seamMat);
  seam.position.y = cy;
  seam.userData.part = 'seam';
  grp.add(seam);
  if (an.seam) {
    const second = seamTube(W - 2.3, H - 2.4, rr * 0.7, zf, 0.19, seamMat, 0.12, pack.seed);
    second.position.y = cy;
    second.rotation.z = 0.006;
    grp.add(second);
    const glue = new T.MeshPhysicalMaterial({ color: 0xf1d98a, roughness: 0.25, transparent: true, opacity: 0.55, clearcoat: 1 });
    for (let k = 0; k < 5; k++) {
      const b = new T.Mesh(new T.SphereGeometry(0.55 + (k % 3) * 0.2, 16, 10), glue);
      b.scale.z = 0.25;
      const t = (k + 0.3) / 5;
      b.position.set((t - 0.5) * (W - 2), cy - H / 2 + 0.9 + (k % 2) * 0.3, zf);
      grp.add(b);
    }
    // a knife cut along one side
    const cut = new T.Mesh(new T.BoxGeometry(0.12, H * 0.28, 0.2), new T.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.6, transparent: true, opacity: 0.5 }));
    cut.position.set(W / 2 - 0.7, cy + H * 0.12, zf);
    grp.add(cut);
  }
  // backing card
  const card = new T.Mesh(new T.PlaneGeometry(W - 0.8, H - 0.8), new T.MeshStandardMaterial({ map: cardTexture(pack, W, H), roughness: 0.7, envMapIntensity: 0.75 }));
  card.position.set(0, cy, -s.thickness / 2 - 0.3);
  card.userData.part = 'card';
  grp.add(card);
  // hologram strip: a real thin-film hologram shifts colour with angle; the fake is flat gold ink
  const holoMat = an.holo ? printedStripe() : hologramFoil();
  const holo = new T.Mesh(new T.PlaneGeometry(W * 0.62, R * 0.26), holoMat);
  holo.position.set(0, -R * 1.28, -s.thickness / 2 - 0.25);
  holo.userData.part = 'holo';
  grp.add(holo);
  grp.userData.role = 'seal';
  grp.userData.size = { W, H, D, cy };
  return grp;
}

/* ------------------------------------------------------------------ photo coins */

const imgCache = new Map();
/** Decode an image once (off the main thread) and keep a small cache of recent ones. */
export function loadImg(url) {
  if (!imgCache.has(url)) {
    const p = (async () => {
      const img = new Image();
      img.decoding = 'async';
      img.src = url;
      await img.decode();
      return img;
    })();
    p.catch(() => imgCache.delete(url));
    imgCache.set(url, p);
    while (imgCache.size > 16) imgCache.delete(imgCache.keys().next().value);
  }
  return imgCache.get(url);
}

/** Load an image as a texture (decoded first, so a 4K texture never stalls a frame). */
export async function photoTexture(url, { srgb = true, anisotropy = 8 } = {}) {
  const tex = new T.Texture(await loadImg(url));
  tex.colorSpace = srgb ? T.SRGBColorSpace : T.NoColorSpace;
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return tex;
}

function canvasOf(src, size = src.naturalWidth || src.width) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingQuality = 'high';
  g.drawImage(src, 0, 0, size, size);
  return cv;
}

/** Bilinear height sampler over a relief image or canvas (0…1), rows from the top. */
function samplerFrom(src) {
  const cv = src instanceof HTMLCanvasElement ? src : canvasOf(src);
  const size = cv.width;
  const d = cv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, size, size).data;
  const h = new Float32Array(size * size);
  for (let i = 0; i < h.length; i++) h[i] = d[i * 4] / 255;
  const sample = (u, v) => {
    const x = Math.min(size - 1.001, Math.max(0, u * (size - 1)));
    const y = Math.min(size - 1.001, Math.max(0, v * (size - 1)));
    const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0;
    const i = y0 * size + x0;
    return (h[i] * (1 - fx) + h[i + 1] * fx) * (1 - fy) + (h[i + size] * (1 - fx) + h[i + size + 1] * fx) * fy;
  };
  return { sample, size, data: h };
}
const samplerCache = new Map();
export async function reliefSampler(url) {
  if (!samplerCache.has(url)) {
    samplerCache.set(url, samplerFrom(await loadImg(url)));
    while (samplerCache.size > 4) samplerCache.delete(samplerCache.keys().next().value);
  }
  return samplerCache.get(url);
}

/**
 * Tangent-space normal map from a relief sampler, with slopes in true proportion to the modelled relief
 * (relief mm over pixel size mm), so light rakes across the photo's details exactly as across the mesh.
 */
export function reliefNormalMap(rs, { reliefMM, diameterMM, anisotropy = 8 }) {
  const n = rs.size, h = rs.data;
  const k = reliefMM / (2 * (diameterMM / n)); // central difference → slope
  const out = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) {
    const ym = Math.max(0, y - 1) * n, yp = Math.min(n - 1, y + 1) * n, row = y * n;
    const dst = (n - 1 - y) * n; // DataTexture row 0 is the bottom (v = 0)
    for (let x = 0; x < n; x++) {
      const dzdx = (h[row + Math.min(n - 1, x + 1)] - h[row + Math.max(0, x - 1)]) * k;
      const dzdyImg = (h[yp + x] - h[ym + x]) * k; // image y points down
      const nx = -dzdx, ny = dzdyImg, len = Math.hypot(nx, ny, 1);
      const o = (dst + x) * 4;
      out[o] = Math.round(((nx / len) * 0.5 + 0.5) * 255);
      out[o + 1] = Math.round(((ny / len) * 0.5 + 0.5) * 255);
      out[o + 2] = Math.round(((1 / len) * 0.5 + 0.5) * 255);
      out[o + 3] = 255;
    }
  }
  const tex = new T.DataTexture(out, n, n, T.RGBAFormat);
  tex.colorSpace = T.NoColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = T.LinearMipmapLinearFilter;
  tex.magFilter = T.LinearFilter;
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return tex;
}

/** Average colour of the rim band of a face image, used to tint the modelled edge to match the photo. */
function rimColor(img) {
  const s = 256;
  const d = canvasOf(img, s).getContext('2d', { willReadFrequently: true }).getImageData(0, 0, s, s).data;
  let r = 0, gg = 0, b = 0, n = 0;
  for (let y = 0; y < s; y++)
    for (let x = 0; x < s; x++) {
      const u = Math.hypot(x + 0.5 - s / 2, y + 0.5 - s / 2) / (s / 2);
      if (u < 0.9 || u > 0.97) continue;
      const i = (y * s + x) * 4;
      r += d[i];
      gg += d[i + 1];
      b += d[i + 2];
      n++;
    }
  const c = new T.Color();
  c.setRGB(r / n / 255, gg / n / 255, b / n / 255, T.SRGBColorSpace);
  return c;
}

/* The real photograph, altered exactly the way each counterfeit alters a real coin. */
const TINT = {
  brass: { t: [1, 0.93, 0.5], mix: 0.34, lift: 0 }, // brass under thin gold: greener, less red
  steel: { t: [0.96, 0.9, 0.7], mix: 0.3, lift: -0.02 },
  lowkarat: { t: [1, 0.94, 0.66], mix: 0.26, lift: 0.04 }, // 18 k: paler, more yellow
};
const lumOf = (t) => t[0] * 0.299 + t[1] * 0.587 + t[2] * 0.114;
function tintCanvas(cv, { t, mix, lift }) {
  const g = cv.getContext('2d', { willReadFrequently: true });
  const im = g.getImageData(0, 0, cv.width, cv.height);
  const d = im.data, lt = lumOf(t);
  for (let i = 0; i < d.length; i += 4) {
    const L = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) / 255 + lift;
    for (let k = 0; k < 3; k++) d[i + k] = Math.min(255, Math.max(0, d[i + k] * (1 - mix) + ((t[k] * L) / lt) * 255 * mix));
  }
  g.putImageData(im, 0, 0);
}
/** Soften by resampling (portable blur): detail finer than `f` pixels is lost, as in a casting. */
function soften(cv, f) {
  const s = cv.width;
  const small = canvasOf(cv, Math.max(16, Math.round(s / f)));
  const g = cv.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(small, 0, 0, s, s);
}
function seeded(seed) {
  let x = (seed * 9301 + 49297) >>> 0 || 1;
  return () => ((x = (Math.imul(x, 1664525) + 1013904223) >>> 0) / 4294967296);
}
function pores(cv, seed, height) {
  const s = cv.width, g = cv.getContext('2d'), r = seeded(seed);
  g.fillStyle = height ? 'rgba(0,0,0,0.9)' : 'rgba(40,24,6,0.55)';
  for (let i = 0; i < 300; i++) {
    const a = r() * TAU, d = Math.sqrt(r()) * s * 0.45;
    g.beginPath();
    g.arc(s / 2 + Math.cos(a) * d, s / 2 + Math.sin(a) * d, (1.2 + r() * 2.8) * (s / 2048), 0, TAU);
    g.fill();
  }
}
function plug(cv, height) {
  const s = cv.width, g = cv.getContext('2d');
  const x = s * 0.63, y = s * 0.36, rr = s * 0.045;
  g.save();
  if (height) {
    g.fillStyle = 'rgb(118,118,118)';
    g.beginPath();
    g.arc(x, y, rr, 0, TAU);
    g.fill();
  } else {
    g.beginPath();
    g.arc(x, y, rr, 0, TAU);
    g.clip();
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = 'rgb(236,214,178)'; // solder / filler reads slightly darker and redder
    g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
  }
  g.restore();
  g.strokeStyle = height ? 'rgb(20,20,20)' : 'rgba(60,34,8,0.7)';
  g.lineWidth = (height ? 3 : 1.6) * (s / 2048);
  g.beginPath();
  g.arc(x, y, rr, 0, TAU);
  g.stroke();
}
/** Copy die: the central design is re-cut slightly smaller and turned against the border. */
function redie(cv) {
  const s = cv.width, copy = canvasOf(cv, s), g = cv.getContext('2d');
  g.save();
  g.beginPath();
  g.arc(s / 2, s / 2, s * 0.4, 0, TAU);
  g.clip();
  g.translate(s / 2, s / 2);
  g.rotate(0.024);
  g.scale(0.962, 0.962);
  g.translate(-s / 2, -s / 2);
  g.drawImage(copy, 0, 0);
  g.restore();
  soften(cv, 1.6);
}
/** Apply a specimen's alterations to one face (colour or relief canvas). */
function alter(cv, side, v, height) {
  if (!height && TINT[v.kind]) tintCanvas(cv, TINT[v.kind]);
  if (v.kind === 'wrongdie') redie(cv);
  if (v.look?.soft) soften(cv, height ? 6 : 4.5);
  if (v.look?.pores) pores(cv, v.seed + (side === 'rev' ? 7 : 0), height);
  if (v.look?.plug && side === 'obv') plug(cv, height);
  return cv;
}
const altersColor = (v, side) => !!(TINT[v.kind] || v.kind === 'wrongdie' || v.look?.soft || v.look?.pores || (v.look?.plug && side === 'obv'));
const altersRelief = (v, side) => !!(v.kind === 'wrongdie' || v.look?.soft || v.look?.pores || (v.look?.plug && side === 'obv'));

/**
 * A 3D coin built from real photographs. item = { coin, sides: { obv: { c2, c4, h }, rev: {…} } } (URLs).
 * spec = a specimen from coins.mjs (its kind and look alter the photo; its measured diameter shapes the mesh).
 * Returns { mesh, hi, hiGeometry(), upgrade(), dispose() }: 2K textures first, upgrade() swaps in 4K ones.
 */
export async function photoCoin(item, spec, { quality = 1, anisotropy = 8 } = {}) {
  const v = { kind: spec.kind ?? 'genuine', look: spec.look ?? {}, seed: spec.seed ?? 1 };
  const sides = ['obv', 'rev'];
  const reliefs = await Promise.all(
    sides.map(async (side) => (altersRelief(v, side) ? samplerFrom(alter(canvasOf(await loadImg(item.sides[side].h)), side, v, true)) : reliefSampler(item.sides[side].h))),
  );
  const faces = { obv: reliefs[0], rev: reliefs[1] };
  const geo = coinGeometry(spec, { quality, faces });
  const relief = spec.thickness * 0.13;
  const colorTex = async (side, url) => {
    const img = await loadImg(url);
    const src = altersColor(v, side) ? alter(canvasOf(img), side, v, false) : img;
    const tex = src instanceof HTMLCanvasElement ? new T.CanvasTexture(src) : new T.Texture(src);
    tex.colorSpace = T.SRGBColorSpace;
    tex.anisotropy = anisotropy;
    tex.needsUpdate = true;
    return tex;
  };
  const maps = await Promise.all(sides.map((side) => colorTex(side, item.sides[side].c2)));
  const face = (map, rs) =>
    new T.MeshPhysicalMaterial({
      map,
      normalMap: reliefNormalMap(rs, { reliefMM: relief, diameterMM: spec.diameter, anisotropy }),
      normalScale: new T.Vector2(0.55, 0.55),
      metalness: 0.62,
      roughness: v.look?.soft ? 0.46 : 0.38,
      envMapIntensity: 1,
    });
  const edge = new T.MeshPhysicalMaterial({ metalness: 1, roughness: v.look?.soft ? 0.42 : 0.3, envMapIntensity: 0.95 });
  edge.color.copy(rimColor(maps[0].image)); // matched to the (altered) photographed rim
  const mats = [face(maps[0], reliefs[0]), face(maps[1], reliefs[1]), edge];
  const mesh = new T.Mesh(geo, mats);
  mesh.castShadow = true;
  mesh.userData.photo = true;
  let hi = false;
  return {
    mesh,
    get hi() {
      return hi;
    },
    /** The same coin as a denser mesh for 4K stills (shares the materials). */
    hiGeometry: () => coinGeometry(spec, { quality: 2, faces }),
    /** Swap in the 4096 textures (desktop, loupe or 4K export), altered the same way. */
    async upgrade() {
      if (hi) return;
      hi = true;
      const hq = await Promise.all(sides.map((side) => colorTex(side, item.sides[side].c4)));
      hq.forEach((t, i) => {
        const old = mats[i].map;
        mats[i].map = t;
        mats[i].needsUpdate = true;
        old?.dispose();
      });
    },
    dispose() {
      geo.dispose();
      for (const m of mats) {
        m.map?.dispose();
        m.normalMap?.dispose();
        m.dispose();
      }
    },
  };
}
