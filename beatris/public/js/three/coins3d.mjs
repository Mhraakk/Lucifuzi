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
  const lines = [
    ['700 52px Vazirmatn', c.label.replace(/ \(.*\)$/, '')],
    ['500 42px Vazirmatn', `وزن ${faDigits(c.weight)} ${bad ? 'گرام' : 'گرم'} · عیار ${fin}`],
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
