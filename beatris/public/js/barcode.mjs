// Code 128 (subset B, or C for even-length digit strings) as SVG, for shelf and tag labels a USB scanner reads.
const P = '212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 114131 311141 411131 211412 211214 211232'.split(' ');
const STOP = '2331112';

export function code128(text) {
  const s = String(text);
  if (!s || /[^\x20-\x7e]/.test(s)) throw new Error('بارکد فقط حروف و ارقام لاتین می‌پذیرد.');
  const useC = /^\d+$/.test(s) && s.length % 2 === 0 && s.length >= 4;
  const vals = useC ? [105, ...s.match(/\d\d/g).map(Number)] : [104, ...[...s].map((c) => c.charCodeAt(0) - 32)];
  const check = vals.reduce((sum, v, i) => sum + v * (i || 1), 0) % 103;
  return [...vals, check].map((v) => P[v]).join('') + STOP;
}

/** SVG of the barcode; module = width of the narrowest bar in px; quiet zone of 10 modules each side. */
export function barcodeSvg(text, { module = 2, height = 48, label = true } = {}) {
  const w = code128(text);
  let x = 10, d = '';
  [...w].forEach((c, i) => {
    const n = Number(c);
    if (i % 2 === 0) d += `M${x} 0h${n}v${height}h-${n}z`;
    x += n;
  });
  const W = x + 10;
  const H = height + (label ? 14 : 0);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W * module}" height="${H * module}" shape-rendering="crispEdges" role="img" aria-label="${text}"><rect width="${W}" height="${H}" fill="#fff"/><path d="${d}" fill="#000"/>${label ? `<text x="${W / 2}" y="${height + 11}" font-size="10" text-anchor="middle" font-family="monospace" fill="#000">${text}</text>` : ''}</svg>`;
}
