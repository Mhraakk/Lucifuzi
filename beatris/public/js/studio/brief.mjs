// خواندن بریف طراحی (spec 0016): a jeweller's Persian brief → a JewelryDesignIntent, deterministically. A model (when
// the shop has one) may add an aesthetic paragraph through the platform's structured-output path; it never sets a
// number here. Anything not understood is kept in `unparsed`, never guessed.
import { normalize } from '../oneline.mjs';

const num = (s) => Number(String(s).replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[٫/]/g, '.'));
const N = '([0-9۰-۹٠-٩]+(?:[.٫/][0-9۰-۹٠-٩]+)?)';
const PRODUCTS = [['ring', /انگشتر|حلقه/], ['bangle', /النگو/], ['bracelet', /دستبند/], ['necklace', /گردنبند|گردن[‌ ]?بند|سرویس/], ['earring', /گوشواره/], ['pendant', /آویز|پلاک|مدال/], ['chain', /زنجیر/]];
const STYLES = [['مینیمال', /مینیمال|ساده/], ['ایتالیایی', /ایتالیایی|ایتالیا/], ['ظریف', /ظریف|نازک|سبک/], ['کلاسیک', /کلاسیک/], ['مدرن', /مدرن|امروزی/], ['وینتیج', /وینتیج|قدیمی|آنتیک/], ['هندسی', /هندسی/], ['ارگانیک', /ارگانیک|طبیعی/], ['جسورانه', /جسور|درشت|پرحجم/]];
const SHAPES = [['oval', /بیضی|اوال/], ['round', /گرد|راند/], ['pear', /اشکی|گلابی/], ['marquise', /مارکیز|اشک دوطرفه/], ['emerald', /زمردی تراش|تراش زمردی|امرالد/], ['princess', /پرنسس|مربع/], ['cushion', /کوشن|بالشتی/], ['heart', /قلب/]];
const STONES = [['diamond', /الماس|برلیان/], ['ruby', /یاقوت/], ['sapphire', /یاقوت کبود|سافایر/], ['emerald', /زمرد(?! ?ی)/], ['cz', /زرکن|سی ?زد/], ['pearl', /مروارید/], ['turquoise', /فیروزه/]];
const SETTINGS = [['prong', /چنگ|پنجه|اسپاد/], ['bezel', /رکاب|قاب[‌ ]?دار|دور ?گیر/], ['channel', /ریلی|کانالی/], ['pave', /پاوه|پاوه[‌ ]?ای|میخی/], ['flush', /فلاش|دفنی|کار ?خوابیده/], ['tension', /تنشن|فشاری/], ['halo', /هاله|هیلو/]];
const METHODS = [['casting', /ریخته[‌ ]?گری|ریختگی|قالب/], ['handmade', /دست[‌ ]?ساز|دستی/], ['cnc', /سی ?ان ?سی|cnc/i], ['printing', /پرینت|چاپ سه[‌ ]? ?بعدی/]];

export function parseBrief(text) {
  const raw = String(text ?? '');
  const t = normalize(raw);
  const intent = { productType: 'other', style: [], constraints: [], aestheticIntent: raw.trim().slice(0, 600), unparsed: [] };
  for (const [k, re] of PRODUCTS) if (re.test(t)) {
    intent.productType = k;
    break;
  }
  for (const [k, re] of STYLES) if (re.test(t)) intent.style.push(k);
  // karat / fineness
  const kt = new RegExp(`${N}\\s*(?:عیار|قیراط|k)`, 'i').exec(t);
  if (kt) {
    const v = num(kt[1]);
    intent.targetKarat = v > 24 ? Math.round((v / 1000) * 24) : v;
  }
  if (/طلای سفید/.test(t)) intent.material = 'au18w';
  else if (/رزگلد|طلای رز|صورتی/.test(t)) intent.material = 'au18r';
  else if (/نقره/.test(t)) intent.material = 'ag925';
  else if (/پلاتین/.test(t)) intent.material = 'pt950';
  // weight: «زیر/حداکثر/کمتر از N گرم», «بین a تا b گرم», «حدود N گرم»
  const range = new RegExp(`(?:بین|از)\\s*${N}\\s*(?:تا|-|الی)\\s*${N}\\s*گرم`).exec(t);
  const max = new RegExp(`(?:زیر|حداکثر|کمتر از|نهایتاً|نهایتا|تا)\\s*${N}\\s*گرم`).exec(t);
  const about = new RegExp(`(?:حدود|حدوداً|حدودا|وزن(?:ش| نهایی)?(?: باید)?(?: حدود)?)\\s*${N}\\s*گرم`).exec(t);
  if (range) {
    intent.weightRangeGrams = [num(range[1]), num(range[2])].sort((a, b) => a - b);
    intent.constraints.push(`وزن نهایی بین ${range[1]} و ${range[2]} گرم`);
  } else if (max) {
    intent.weightRangeGrams = [0, num(max[1])];
    intent.targetWeightGrams = num(max[1]);
    intent.constraints.push(`وزن نهایی حداکثر ${max[1]} گرم`);
  } else if (about) intent.targetWeightGrams = num(about[1]);
  // stone: shape, type, dimensions «۸×۶» «۸ در ۶» «۶ میلی»
  for (const [k, re] of SHAPES) if (re.test(t)) {
    intent.stone = { ...(intent.stone ?? {}), shape: k };
    break;
  }
  for (const [k, re] of STONES) if (re.test(t)) {
    intent.stone = { ...(intent.stone ?? {}), type: k };
    break;
  }
  const dims = new RegExp(`${N}\\s*(?:×|x|\\*|در)\\s*${N}(?:\\s*(?:×|x|\\*|در)\\s*${N})?`).exec(t);
  if (dims && (intent.stone || /سنگ|نگین/.test(t))) intent.stone = { ...(intent.stone ?? {}), dimensionsMm: [num(dims[1]), num(dims[2]), ...(dims[3] ? [num(dims[3])] : [])].sort((a, b) => b - a) };
  else {
    const one = new RegExp(`(?:سنگ|نگین)[^\\d۰-۹]{0,20}${N}\\s*(?:میل|mm)`).exec(t);
    if (one) intent.stone = { ...(intent.stone ?? {}), dimensionsMm: [num(one[1])] };
  }
  for (const [k, re] of SETTINGS) if (re.test(t)) {
    intent.stone = { ...(intent.stone ?? {}), setting: k };
    break;
  }
  if (intent.stone && !intent.stone.setting && intent.productType === 'ring') intent.stone.setting = 'prong';
  if (/سنگ|نگین/.test(t) && !intent.stone) intent.stone = {};
  for (const [k, re] of METHODS) if (re.test(t)) {
    intent.manufacturingMethod = k;
    intent.constraints.push(k === 'casting' ? 'مناسب ریخته‌گری' : `روش ساخت: ${k}`);
    break;
  }
  // ring size: «سایز ۵۴» (ISO circumference in mm) or «سایز ۷ آمریکایی»
  const size = new RegExp(`سایز\\s*${N}(\\s*(?:آمریکایی|us))?`, 'i').exec(t);
  if (size) {
    const v = num(size[1]);
    intent.ringSizeIso = size[2] || v < 20 ? Math.round((Math.PI * (11.63 + 0.8128 * v)) * 10) / 10 : v;
  }
  if (/روزمره|هر روز|راحت/.test(t)) intent.constraints.push('مناسب استفاده روزمره');
  if (/حداقل ضخامت|محکم|مقاوم/.test(t)) intent.constraints.push('حداقل ضخامت سازه‌ای رعایت شود');
  return intent;
}
