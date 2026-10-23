// بلوک‌های تعاملی (spec 0040), the pure part: no DOM, shared by public/js/blocks.mjs and tests/blocks.test.mjs.

/** How far a slide has gone, 0..1: the knob starts at the inline start (the right in RTL) and travels `length` px. */
export const slideProgress = (x, start, length, rtl = true) => (length > 0 ? Math.min(1, Math.max(0, (rtl ? start - x : x - start) / length)) : 0);
/** A slide confirms only past 90% of the way: a nudge, or a phone in a pocket, books nothing. */
export const SLIDE_AT = 0.9;

const FA = '۰۱۲۳۴۵۶۷۸۹';
const digitOf = (ch) => (FA.includes(ch) ? FA.indexOf(ch) : /^[0-9]$/.test(ch) ? Number(ch) : -1);
/**
 * The cells of a figure going from `prev` to `next`: digits become rolling columns, anything else (a separator, the
 * decimal mark, a sign) stays a plain character. A digit rolls only when its value changed and the figure kept its
 * shape; a figure that grew or shrank by a digit is set at once, so no column rolls to a wrong place value.
 */
/** A figure that can roll: digits and the marks numbers carry, nothing else. A unit or a word stays outside the roll. */
export const isFigure = (s) => /^[0-9۰-۹٬,.٫/+\-−%٪\s]*$/.test(String(s ?? ''));
export function rollPlan(prev, next) {
  const a = [...String(prev ?? '')];
  const b = [...String(next)];
  const same = a.length === b.length && b.every((ch, i) => (digitOf(ch) >= 0) === (digitOf(a[i]) >= 0) && (digitOf(ch) >= 0 || ch === a[i]));
  return b.map((ch, i) => {
    const d = digitOf(ch);
    if (d < 0) return { ch };
    const from = same ? digitOf(a[i]) : d;
    return { d, from, rolls: from !== d };
  });
}

/** Whether a file is one the place takes: by an extension or a type in `accept`, and not over `max` bytes. */
export function acceptFile(file, accept = '', max = Infinity) {
  if (!file || !(file.size <= max)) return false;
  const kinds = String(accept).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!kinds.length) return true;
  const name = String(file.name ?? '').toLowerCase();
  const type = String(file.type ?? '').toLowerCase();
  return kinds.some((k) => (k.startsWith('.') ? name.endsWith(k) : k.endsWith('/*') ? type.startsWith(k.slice(0, -1)) : type === k));
}

/** The pen's width at a speed in px/ms: steady strokes are fuller, quick ones finer, never under 1.4 px. */
export const penWidth = (speed, full = 3.2) => Math.max(1.4, full - Math.min(Math.max(speed, 0), 3) * 0.6);

/** The box around the ink (strokes of {x, y, w} points), padded, for cropping the saved picture; null when empty. */
export function inkBounds(strokes, pad = 8) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of strokes) for (const p of s) {
    const r = (p.w ?? 0) / 2;
    x0 = Math.min(x0, p.x - r);
    y0 = Math.min(y0, p.y - r);
    x1 = Math.max(x1, p.x + r);
    y1 = Math.max(y1, p.y + r);
  }
  if (!Number.isFinite(x0)) return null;
  return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad };
}
