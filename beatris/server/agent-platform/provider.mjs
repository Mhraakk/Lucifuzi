// مدل زبانی پشت عامل‌ها (spec 0016): a thin provider interface so no domain code depends on one vendor's API, and
// the structured-output path every domain-critical model answer must go through: JSON only, validated against a
// schema, at most `retries` bounded repairs with the validator's errors, then rejection — never a silent coercion.
import { check } from '../../public/js/schema.mjs';

/**
 * AgentModelProvider: { name, available(): boolean, run({ system, prompt }) → Promise<string | null> }.
 * From the assistant's engine chain (the shop's own keys / a local model); null when none is configured.
 */
export function providerFromAssistant(assistant) {
  return {
    name: 'assistant-chain',
    available: () => (assistant?.info?.().chain ?? []).length > 0,
    async run({ system, prompt }) {
      const r = await assistant?.phrase?.(system, prompt);
      return r?.text ?? null;
    },
  };
}
export const NO_PROVIDER = { name: 'none', available: () => false, run: async () => null };

const jsonOf = (text) => {
  if (typeof text !== 'string') return null;
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (m ? m[1] : text).trim();
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
};

/**
 * Ask for a value of `schema`. Returns { ok: true, value, attempts } or { ok: false, errors, attempts }.
 * retries: bounded repair rounds after the first answer (default 2).
 */
export async function structured(provider, { system, prompt, schema, retries = 2 }) {
  if (!provider?.available?.()) return { ok: false, errors: ['هیچ موتور زبانی پیکربندی نشده است.'], attempts: 0 };
  let ask = prompt;
  let errors = [];
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    const text = await provider.run({ system: `${system}\nفقط یک شیء JSON معتبر برگردان؛ بدون توضیح.`, prompt: ask }).catch(() => null);
    const value = jsonOf(text);
    errors = value == null ? ['پاسخ JSON نبود.'] : check(schema, value, 'پاسخ');
    if (!errors.length) return { ok: true, value, attempts: attempt };
    ask = `${prompt}\n\nپاسخ قبلی این خطاها را داشت؛ اصلاح‌شده‌اش را بده:\n- ${errors.slice(0, 8).join('\n- ')}`;
  }
  return { ok: false, errors, attempts: retries + 1 };
}
