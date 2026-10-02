// فهم جمله آزاد (spec 0020): when the rules leave words they did not understand, a language model may rewrite the
// sentence into the desk's own plain wording — and nothing more. The rewrite is parsed again by the same rules, and it
// is refused if it carries a number the operator never wrote: the model can reorder and rename, never invent a weight,
// a price or a «خط». The operator still sees the understanding and presses Enter; nothing is booked here.
import { parseLine, readNumber, normalize, unsuffix } from '../public/js/oneline.mjs';
import { structured } from './agent-platform/provider.mjs';

const SYSTEM = `تو مترجم جمله‌های بازار طلای تهران به زبان ساده میز معامله هستی. فقط بازنویسی کن؛ هیچ عددی اضافه، حذف یا عوض نکن.
واژه‌های میز: «خرید» یا «فروش»، «از/به <نام مشتری>»، «<وزن> گرم»، «عیار <عدد>»، «آبشده»، «سکه»، «شمش»،
«مظنه <عدد> میلیون»، «<n> خط زیر مظنه» یا «<n> خط بالای مظنه» (هر خط ده هزار تومان)، روش پرداخت: «نقد»، «کارت»، «کارت به کارت»، «حواله»، «نسیه»،
و اگر گوینده خواسته سند صادر شود: «ثبت کن».
نمونه: «امروز از آقای رضایی دوازده گرم هفتصد و پنجاهی گرفتیم بیست خط زیر مظنه صد و نه، پولش رو نقد دادیم» ←
«خرید از رضایی دوازده گرم عیار هفتصد و پنجاه بیست خط زیر مظنه صد و نه میلیون نقد».`;

const SCHEMA = { type: 'object', required: ['canonical'], properties: { canonical: { type: 'string', minLength: 3, maxLength: 300 } } };

/** Every number the text contains, read at every position (digits or words, plain and as a price). */
export function numbersIn(text) {
  const out = new Set();
  const words = normalize(text).split(/[\s\-–—|،,;]+/).filter(Boolean).map(unsuffix);
  for (let i = 0; i < words.length; i++)
    for (const price of [false, true]) {
      const n = readNumber(words, i, { price });
      if (n) out.add(n.value);
    }
  return out;
}

/** The numbers a parsed sentence acts on; money ones may be said short («مظنه صد و نه» is 109 million). */
export function numbersUsed(p) {
  const exact = [p.weight, p.fineness, p.count, p.price?.offset?.lines, p.fx?.amount].filter((x) => x != null).map((n) => ({ n, money: false }));
  const money = [p.price?.value, p.price?.offset?.amount, p.fx?.rate, ...p.pays.map((x) => x.amount)].filter((x) => x != null).map((n) => ({ n, money: true }));
  return [...exact, ...money];
}

/**
 * Understand one sentence. Returns { ok, source: 'rules' | 'model', canonical, parsed } or { ok: false, reason }.
 * The rules always run first; the model is asked only for sentences with words left over.
 */
export async function understandLine(text, { provider } = {}) {
  const t = String(text ?? '').trim().slice(0, 400);
  if (!t) return { ok: false, reason: 'جمله‌ای نیامده است.' };
  const first = parseLine(t);
  if (!first.unknown.length) return { ok: true, source: 'rules', canonical: t, parsed: first };
  const r = await structured(provider, { system: SYSTEM, prompt: `جمله: «${t}»\nخروجی: {"canonical": "…"}`, schema: SCHEMA, retries: 1 });
  if (!r.ok) return { ok: false, reason: r.errors[0] ?? 'دستیار پاسخ نداد.' };
  const canonical = r.value.canonical.trim();
  const parsed = parseLine(canonical);
  // a weight in grams may be the fineness's neighbour: «هفتصد و پنجاهی» → «عیار هفتصد و پنجاه»; both are in the text
  const said = numbersIn(t);
  // a money number may differ only by the scale the market leaves unsaid (thousands, millions), never by its digits
  const heard = (n, money) => said.has(n) || (money && (said.has(n / 1e3) || said.has(n / 1e6) || [...said].some((s) => s * 1e6 === n || s * 1e3 === n)));
  const invented = numbersUsed(parsed).filter(({ n, money }) => !heard(n, money) && !(parsed.fineness === n && said.has(fineToKarat(n)))).map((x) => x.n);
  if (invented.length) return { ok: false, reason: `بازنویسی دستیار عددی داشت که در جمله نبود (${invented.join('، ')})؛ پذیرفته نشد.` };
  return { ok: true, source: 'model', canonical, parsed };
}
const fineToKarat = (f) => ({ 585: 14, 750: 18, 875: 21, 916: 22, 999: 24 })[f];
