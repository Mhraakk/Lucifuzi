// Typed decisions (learned from typesafe-local, spec 0002): a machine judgement is never free text. It is one of a
// fixed set of legal answers, with a probability for every option, a confidence computed by the published formulas,
// and a coverage number — the share of evidence that was actually available (the counterpart of `raw_mass`: an
// answer can look confident while resting on almost no data, and the caller must see that before trusting it).

export function softmax(logits) {
  const m = Math.max(...logits);
  const e = logits.map((x) => Math.exp(x - m));
  const s = e.reduce((a, b) => a + b, 0);
  return e.map((x) => x / s);
}

/** Peak probability, rescaled so uniform → 0 and certainty → 1 (TypeSafe's choice confidence). */
export function choiceConfidence(p) {
  if (p.length < 2) return 1;
  const u = 1 / p.length;
  return (Math.max(...p) - u) / (1 - u);
}

/** How tightly an ordered distribution sits around its mode (TypeSafe's score confidence). */
export function scoreConfidence(p) {
  if (p.length < 2) return 1;
  const n = p.length;
  const mode = p.indexOf(Math.max(...p));
  const spread = p.reduce((a, x, i) => a + x * Math.abs(i - mode), 0);
  const centre = (n - 1) / 2;
  let uniform = 0;
  for (let i = 0; i < n; i++) uniform += Math.abs(i - centre);
  uniform /= n;
  return Math.max(0, 1 - spread / uniform);
}

const r3 = (x) => Math.round(x * 1000) / 1000;

/**
 * A choice among `options` from their logits (one per option). Only these options are representable: a wrong-typed
 * answer cannot happen. coverage ∈ [0, 1] is reported beside confidence and never folded into it.
 */
export function typedChoice(options, logits, { coverage = 1, ordered = false } = {}) {
  if (options.length !== logits.length || !options.length) throw new Error('options and logits must match');
  const p = softmax(logits);
  const i = p.indexOf(Math.max(...p));
  return {
    type: ordered ? 'score' : 'choice',
    choice: options[i],
    probabilities: Object.fromEntries(options.map((o, k) => [o, r3(p[k])])),
    confidence: r3(ordered ? scoreConfidence(p) : choiceConfidence(p)),
    coverage: r3(Math.min(1, Math.max(0, coverage))),
  };
}

/** A yes/no answer («noul») with its probability; confidence = distance from a coin toss. */
export const noul = (p, { coverage = 1 } = {}) => ({ type: 'noul', noul: r3(p), confidence: r3(Math.abs(2 * p - 1)), coverage: r3(coverage) });
