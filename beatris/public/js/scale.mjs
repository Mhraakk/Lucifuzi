// Digital scales on a serial port print one reading per line; this turns a line into grams and a «stable» flag.
/** Scale output: «ST,GS,+  123.456 g», «   12.345 g», «US,NT,+0001.23ct», «W: 5.000 oz»… → grams, and whether it says stable. */
export function parseScale(line) {
  const m = /([+-]?)\s*(\d+(?:[.,]\d+)?)\s*(kg|g|gr|ct|ozt|oz|dwt)?\b/i.exec(line);
  if (!m) return null;
  let v = Number(m[2].replace(',', '.'));
  if (m[1] === '-') v = -v;
  const u = (m[3] ?? 'g').toLowerCase();
  const k = { kg: 1000, g: 1, gr: 1, ct: 0.2, ozt: 31.1034768, oz: 31.1034768, dwt: 1.55517384 }[u] ?? 1;
  return { grams: Math.round(v * k * 1000) / 1000, stable: /\bST\b|stable|\bS\s+S\b/i.test(line) && !/\bUS\b|unstable/i.test(line) };
}

