// The wave rig's model (spec 0030): six swing prices judged by the app's own Elliott engine (ta.elliott, the same one
// the studio's count uses). The figure never judges by itself: every verdict, ratio and score shown comes from here.
import { elliott } from '../ta.mjs';

/** Textbook examples: the valid impulse, then each hard rule broken on its own (the others still hold). */
export const EXAMPLES = [
  { id: 'valid', name: 'نمونه درست', prices: [100, 130, 111.46, 160, 141.46, 171.46] },
  { id: 'deep2', name: 'موج ۲ عمیق', prices: [100, 130, 96, 160, 141.46, 171.46] },
  { id: 'short3', name: 'موج ۳ کوتاه', prices: [100, 130, 111.46, 135, 131, 167] },
  { id: 'overlap4', name: 'هم‌پوشانی موج ۴', prices: [100, 130, 111.46, 160, 126, 171.46] },
];
/** The rule each stop on the machine stands for, and the price it sits at. */
export const STOPS = [
  { rule: 'w2', rail: 2, at: (p) => p[0] },
  { rule: 'w3end', rail: 3, at: (p) => p[1] },
  { rule: 'w4', rail: 4, at: (p) => p[1] },
];
export const RULE_FA = { w2: 'موج ۲', w3end: 'موج ۳', w3short: 'موج ۳ (کوتاه‌ترین)', w4: 'موج ۴' };

/** The engine's verdict on six prices (an up impulse from a low): rules, Fibonacci guides, score, wave lengths. */
export function judge(prices) {
  const pts = prices.map((price, i) => ({ i: i * 10, price, kind: i % 2 ? 'H' : 'L' }));
  const c = elliott(pts).find((x) => x.kind === 'impulse-done');
  const w = [prices[1] - prices[0], prices[1] - prices[2], prices[3] - prices[2], prices[3] - prices[4], prices[5] - prices[4]];
  return { rules: c.rules, guides: c.guides, score: c.score, valid: c.valid, waves: w, broken: c.rules.filter((r) => !r.ok).map((r) => r.id) };
}

/**
 * The studio's count, if it is a five-wave impulse: its six prices (a down impulse is mirrored so the machine still
 * reads it rising, and says so). Anything else is not put on the machine.
 */
export function fromStudio(major) {
  if (!major || major.kind !== 'impulse-done' || major.points?.length !== 6) return { ok: false, why: major ? 'شمارش این نمودار پنج موج کامل نیست؛ دستگاه فقط موج محرک پنج‌تایی را می‌سنجد.' : 'این نمودار هنوز شمارش معتبری ندارد.' };
  const raw = major.points.map((p) => p.price);
  const prices = major.up ? raw : raw.map((v) => 2 * raw[0] - v);
  return { ok: true, up: major.up, raw, prices };
}
