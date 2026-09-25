/**
 * Layer 13 — Guardrails
 */

export type GuardrailInput = {
  text: string;
  kind: "user_prompt" | "model_output" | "tool_args";
};

export type GuardrailResult = {
  allowed: boolean;
  reasons: string[];
  redactedText: string;
};

const BLOCK_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  {
    re: /work\s*authorization|مجوز\s*کار\s*مستقل\s*می‌دهم|grant.*authorization/i,
    reason: "AI must not grant WorkAuthorization",
  },
  {
    re: /ignore (all|previous) instructions|system prompt/i,
    reason: "prompt injection pattern",
  },
  {
    re: /\b(sk-[a-zA-Z0-9]{10,}|api[_-]?key\s*=)/i,
    reason: "secret leakage",
  },
];

export function runGuardrails(input: GuardrailInput): GuardrailResult {
  const reasons: string[] = [];
  let text = input.text;
  for (const p of BLOCK_PATTERNS) {
    if (p.re.test(text)) {
      reasons.push(p.reason);
      text = text.replace(p.re, "[redacted]");
    }
  }
  // Money hallucination soft check on model output
  if (
    input.kind === "model_output" &&
    /قطعاً\s*\d[\d,\.]*\s*ریال/.test(text) &&
    !/فرمول|اجرت|منبع/.test(text)
  ) {
    reasons.push("unverified absolute price claim without formula citation");
  }

  const hard = reasons.some(
    (r) =>
      r.includes("WorkAuthorization") ||
      r.includes("injection") ||
      r.includes("secret")
  );

  return {
    allowed: !hard,
    reasons,
    redactedText: text,
  };
}
