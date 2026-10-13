// QR Code (ISO/IEC 18004) encoder: byte mode, error correction level M, versions 1–10, all eight masks scored
// by the standard penalty rules. Returns the module matrix; svg() draws it. No dependencies.
const EC_M = [null, [10, [[1, 16]]], [16, [[1, 28]]], [26, [[1, 44]]], [18, [[2, 32]]], [24, [[2, 43]]], [16, [[4, 27]]], [18, [[4, 31]]], [22, [[2, 38], [2, 39]]], [22, [[3, 36], [2, 37]]], [26, [[4, 43], [1, 44]]]];
const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++, x = x & 0x80 ? ((x << 1) ^ 0x11d) & 0xff : x << 1) (EXP[i] = x), (LOG[x] = i);
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);
function rsRemainder(data, n) {
  let gen = [1];
  for (let i = 0; i < n; i++) {
    const next = new Array(gen.length + 1).fill(0);
    gen.forEach((g, j) => {
      next[j] ^= g;
      next[j + 1] ^= mul(g, EXP[i]);
    });
    gen = next;
  }
  const rem = new Array(n).fill(0);
  for (const d of data) {
    const f = d ^ rem.shift();
    rem.push(0);
    for (let j = 0; j < n; j++) rem[j] ^= mul(gen[j + 1], f);
  }
  return rem;
}
const dataCap = (v) => EC_M[v][1].reduce((s, [n, k]) => s + n * k, 0);

export function qrMatrix(text) {
  const bytes = [...new TextEncoder().encode(String(text))];
  let v = 1;
  while (v <= 10 && 4 + (v < 10 ? 8 : 16) + bytes.length * 8 > dataCap(v) * 8) v++;
  if (v > 10) throw new Error('متن برای QR بیش از حد بلند است.');
  const cap = dataCap(v);
  // bit stream: mode 0100, length, bytes, terminator, pad to bytes, pad codewords
  const bits = [];
  const put = (val, len) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
  };
  put(4, 4);
  put(bytes.length, v < 10 ? 8 : 16);
  bytes.forEach((b) => put(b, 8));
  put(0, Math.min(4, cap * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  for (let p = 0; data.length < cap; p++) data.push(p % 2 ? 0x11 : 0xec);
  // blocks, error correction, interleave
  const [ecLen, groups] = EC_M[v];
  const blocks = [];
  let off = 0;
  for (const [n, k] of groups) for (let i = 0; i < n; i++) (blocks.push(data.slice(off, off + k)), (off += k));
  const ecs = blocks.map((b) => rsRemainder(b, ecLen));
  const cw = [];
  const maxK = Math.max(...blocks.map((b) => b.length));
  for (let i = 0; i < maxK; i++) for (const b of blocks) if (i < b.length) cw.push(b[i]);
  for (let i = 0; i < ecLen; i++) for (const e of ecs) cw.push(e[i]);

  const size = 17 + 4 * v;
  const M = Array.from({ length: size }, () => new Array(size).fill(0));
  const F = Array.from({ length: size }, () => new Array(size).fill(false)); // function modules
  const set = (x, y, dark) => {
    M[y][x] = dark ? 1 : 0;
    F[y][x] = true;
  };
  const finder = (cx, cy) => {
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx, y = cy + dy;
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        set(x, y, d !== 2 && d !== 4);
      }
  };
  finder(3, 3);
  finder(size - 4, 3);
  finder(3, size - 4);
  for (let i = 0; i < size; i++) {
    if (!F[6][i]) set(i, 6, i % 2 === 0);
    if (!F[i][6]) set(6, i, i % 2 === 0);
  }
  const al = ALIGN[v];
  for (const ay of al)
    for (const ax of al) {
      if ((ax === 6 && ay === 6) || (ax === 6 && ay === al.at(-1)) || (ax === al.at(-1) && ay === 6)) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  // reserve format areas and the dark module
  const fmtCells = [];
  for (let i = 0; i < 9; i++) if (i !== 6) fmtCells.push([8, i], [i, 8]);
  for (let i = 0; i < 8; i++) fmtCells.push([size - 1 - i, 8], [8, size - 1 - i]);
  for (const [x, y] of fmtCells) set(x, y, false);
  set(8, size - 8, true);
  // version information (v ≥ 7)
  if (v >= 7) {
    let r = v;
    for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25);
    const vb = (v << 12) | r;
    for (let i = 0; i < 18; i++) {
      const bit = (vb >>> i) & 1, a = size - 11 + (i % 3), b = Math.floor(i / 3);
      set(a, b, bit);
      set(b, a, bit);
    }
  }
  // data placement in the zigzag
  let bi = 0;
  const totalBits = cw.length * 8;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++)
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (F[y][x]) continue;
        if (bi < totalBits) M[y][x] = (cw[bi >>> 3] >>> (7 - (bi & 7))) & 1;
        bi++;
      }
  }
  const MASKS = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0, (x, y) => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0, (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0];
  const withFormat = (G, mask) => {
    const d = (0 << 3) | mask; // level M = 00
    let r = d;
    for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
    const bitsF = ((d << 10) | r) ^ 0x5412;
    const b = (i) => (bitsF >>> i) & 1;
    for (let i = 0; i <= 5; i++) G[i][8] = b(i);
    G[7][8] = b(6);
    G[8][8] = b(7);
    G[8][7] = b(8);
    for (let i = 9; i < 15; i++) G[8][14 - i] = b(i);
    for (let i = 0; i < 8; i++) G[8][size - 1 - i] = b(i);
    for (let i = 8; i < 15; i++) G[size - 15 + i][8] = b(i);
    G[size - 8][8] = 1;
    return G;
  };
  const penalty = (G) => {
    let p = 0;
    const lines = [...G, ...G[0].map((_, x) => G.map((row) => row[x]))];
    for (const L of lines) {
      let run = 1;
      for (let i = 1; i <= L.length; i++) {
        if (i < L.length && L[i] === L[i - 1]) run++;
        else {
          if (run >= 5) p += run - 2;
          run = 1;
        }
      }
      const s = L.join('');
      for (const pat of ['10111010000', '00001011101']) for (let i = s.indexOf(pat); i >= 0; i = s.indexOf(pat, i + 1)) p += 40;
    }
    for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) if (G[y][x] === G[y][x + 1] && G[y][x] === G[y + 1][x] && G[y][x] === G[y + 1][x + 1]) p += 3;
    const dark = G.flat().reduce((a, b) => a + b, 0);
    p += Math.floor(Math.abs((dark * 20) / (size * size) - 10)) * 10;
    return p;
  };
  let best = null;
  for (let m = 0; m < 8; m++) {
    const G = M.map((row, y) => row.map((c, x) => (F[y][x] ? c : c ^ (MASKS[m](x, y) ? 1 : 0))));
    withFormat(G, m);
    const p = penalty(G);
    if (!best || p < best.p) best = { p, G };
  }
  return best.G;
}

/** SVG markup of a QR code with a 4-module quiet zone. */
export function qrSvg(text, { size = 132, dark = '#111', light = '#fff' } = {}) {
  const G = qrMatrix(text);
  const n = G.length + 8;
  let d = '';
  G.forEach((row, y) => row.forEach((c, x) => c && (d += `M${x + 4} ${y + 4}h1v1h-1z`)));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" width="${size}" height="${size}" shape-rendering="crispEdges" role="img" aria-label="QR"><rect width="${n}" height="${n}" fill="${light}"/><path d="${d}" fill="${dark}"/></svg>`;
}
