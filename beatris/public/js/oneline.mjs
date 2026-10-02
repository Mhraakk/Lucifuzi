// ورود تک‌خطی (spec 0013): «خرید - رضایی - دوازده ممیز چهل و پنج گرم - عیار هفتصد و پنجاه - نقد» becomes a structured
// trade the desk can fill in. Numbers may be digits (Persian, Arabic or Latin) or words; «ممیز» and «و نیم» make
// fractions; prices understand میلیون/هزار and تومان/ریال. Nothing here touches the network: the customer comes back
// as a name to look up, and every word that was not understood is reported, never guessed silently.

const MESGHAL_G = 4.608;
/** One «خط» of the Tehran gold market: 10,000 toman = 100,000 rial off (or on) the مظنه (spec 0020). */
export const KHAT_RIAL = 100000;
const DOWN = new Set(['پایین', 'پائین', 'زیر', 'کمتر', 'کم', 'زیرِ', 'پایینتر', 'کمتره']);
const UP = new Set(['بالا', 'بالای', 'بالاتر', 'روی', 'بیشتر', 'رو', 'بالاتره']);
const MINUS = new Set(['منهای', 'منها', 'کسر', '−']);
const PLUS = new Set(['بعلاوه', 'باضافه', 'اضافه', '+']);
const MARKET_WORDS = new Set(['بازار', 'امروز', 'روز', 'لحظه', 'لحظه‌ای', 'فعلی', 'جاری', 'تابلو']);
const UNITS = { صفر: 0, یک: 1, یه: 1, دو: 2, سه: 3, چهار: 4, پنج: 5, شش: 6, شیش: 6, هفت: 7, هشت: 8, نه: 9 };
const TEENS = { ده: 10, یازده: 11, دوازده: 12, سیزده: 13, چهارده: 14, پانزده: 15, پونزده: 15, شانزده: 16, شونزده: 16, هفده: 17, هیفده: 17, هجده: 18, هیجده: 18, نوزده: 19 };
const TENS = { بیست: 20, سی: 30, چهل: 40, پنجاه: 50, شصت: 60, هفتاد: 70, هشتاد: 80, نود: 90 };
const HUNDREDS = { صد: 100, یکصد: 100, دویست: 200, سیصد: 300, چهارصد: 400, پانصد: 500, پونصد: 500, ششصد: 600, هفتصد: 700, هشتصد: 800, نهصد: 900 };
const SCALES = { هزار: 1e3, میلیون: 1e6, ملیون: 1e6, میلیارد: 1e9 };
const SMALL = { ...UNITS, ...TEENS, ...TENS, ...HUNDREDS };
const UNIT_AFTER = new Set(['گرم', 'گ', 'g', 'gr', 'مثقال', 'تا', 'عدد', 'سکه', 'عیار', 'خط', 'دلار', 'یورو', 'درهم', 'لیر', 'پوند', 'یوان']);

const COINS = [
  ['emami', ['تمام امامی', 'امامی', 'تمام']],
  ['bahar', ['تمام بهار', 'بهار آزادی', 'بهار']],
  ['halfOld', ['نیم قدیم']],
  ['quarterOld', ['ربع قدیم']],
  ['half', ['نیم سکه', 'نیم']],
  ['quarter', ['ربع سکه', 'ربع']],
  ['gerami', ['سکه گرمی', 'یک گرمی']],
];
const FX = [
  ['USD', ['دلار']],
  ['EUR', ['یورو']],
  ['AED', ['درهم']],
  ['TRY', ['لیر']],
  ['GBP', ['پوند']],
  ['CNY', ['یوان']],
];
const MODES = [
  ['in', ['دریافت جنس', 'دریافت امانت', 'امانت']],
  ['out', ['تحویل جنس', 'تحویل امانت', 'تحویل']],
  ['buy', ['خرید کردیم', 'خرید کردم', 'خرید', 'خریدیم', 'خریدم', 'خریداری', 'بخر']],
  ['sell', ['فروش رفت', 'فروش', 'فروختیم', 'فروختم', 'بفروش']],
];
const PAYS = [
  ['c2c', ['کارت به کارت']],
  ['pos', ['کارتخوان', 'کارت خوان', 'پوز', 'کارت']],
  ['cash', ['نقدی', 'نقد', 'کش']],
  ['satna', ['ساتنا']],
  ['paya', ['پایا']],
  ['pol', ['پل']],
  ['havale', ['حواله']],
  ['cheque', ['چک']],
  ['offset', ['تهاتر']],
  ['credit', ['نسیه', 'روی حساب', 'به حساب', 'بدهکار']],
];
const KINDS = [
  ['melt', ['طلای آبشده', 'آبشده', 'آب شده', 'طلا']],
  ['coin', ['سکه']],
  ['bar', ['شمش']],
  ['fx', ['ارز']],
];
const TITLES = new Set(['آقای', 'آقا', 'خانم', 'حاج', 'حاجی', 'جناب', 'سرکار']);
const KARAT = { 14: 585, 18: 750, 21: 875, 22: 916, 24: 999 };

/** Digits to Latin, Arabic letters to Persian, separators to plain marks, ZWNJ to a space. */
export function normalize(s) {
  return String(s ?? '')
    .replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
    .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/ة/g, 'ه')
    .replace(/[‌‏‎]/g, ' ')
    .replace(/(\d)[٬,](?=\d{3}\b)/g, '$1') // 45,200,000 → 45200000
    .replace(/(\d)[٫/](?=\d)/g, '$1.') // 12٫45 or 12/45 → 12.45
    .replace(/ـ/g, '')
    .replace(/[\u064B-\u0652]/g, '') // harakat: «زیرِ» → «زیر»
    .replace(/(\d)([\u0600-\u06FF])/g, '$1 $2') // «۲۰خط» → «20 خط»
    .replace(/([\u0600-\u06FF])(\d)/g, '$1 $2')
    .toLowerCase();
}

/** «پنجاهی»، «هفتصدوپنجاهی»، «۷۵۰ی» → the number word itself (the market's «-ی» of a fineness or a price). */
export function unsuffix(w) {
  if (/^\d+(\.\d+)?ی$/.test(w)) return w.slice(0, -1);
  if (w.endsWith('ی') && !(w in SMALL) && w.slice(0, -1) in SMALL) return w.slice(0, -1);
  return w;
}
/** Segments (by - – — | ، , ; newline) of word tokens. */
function tokenize(s) {
  return normalize(s)
    .split(/[-–—|،,;\n]+|\s-\s/)
    .map((seg) => seg.split(/\s+/).map((w) => unsuffix(w.replace(/^[«»"'()[\]:.]+|[«»"'()[\]:]+$/g, ''))).filter(Boolean))
    .filter((seg) => seg.length);
}

/**
 * Read a number at w[i]: digits or words, with «و», «ممیز», «و نیم» and scales. price: «۴۵ میلیون و ۲۰۰» → ۴۵٬۲۰۰٬۰۰۰
 * (the market habit of naming thousands after millions). Returns { value, len } or null.
 */
export function readNumber(w, i = 0, { price = false, offsetAware = false } = {}) {
  let j = i, total = 0, part = 0, any = false, lastScale = 0, lastSmall = null;
  const isNum = (t) => t != null && (/^\d+(\.\d+)?$/.test(t) || t in SMALL || t in SCALES);
  while (j < w.length) {
    const t = w[j];
    // «مظنه ۱۰۹ میلیون ۲۰ خط پایین»: the «۲۰» belongs to the offset, not to the price
    if (offsetAware && any && part === 0 && (/^\d/.test(t) || t in SMALL) && readOffset(w, j)) break;
    if (offsetAware && any && part === 0 && t === 'و' && readOffset(w, j + 1)) break;
    if (/^\d+(\.\d+)?$/.test(t)) {
      // two bare numbers in a row are two numbers, unless the second follows a scale («۴۵ میلیون ۲۰۰») or «و»
      if (any && part !== 0) break;
      // …and a number that is a weight, a count or a fraction is never the thousands of a price: «۱۰۹ میلیون ۱۵۹٫۳۳ گرم»
      if (any && (t.includes('.') || UNIT_AFTER.has(w[j + 1]))) break;
      part += Number(t);
      any = true;
      j++;
    } else if (t in SMALL) {
      // digits then a number word without «و» are two numbers: «۷۵۰ بیست خط» is a fineness and twenty lines
      if (any && part !== 0 && /^\d/.test(w[j - 1] ?? '')) break;
      // number words run from large to small: «هفتصد و پنجاه بیست» is 750 then 20, not 770
      const place = (v) => (v >= 100 ? 3 : v >= 10 ? 2 : 1);
      // nothing smaller follows a unit or a teen: «نهصد و شانزده دو خط» is 916 then 2
      if (lastSmall != null && part % 1000 !== 0 && t !== 'صد' && (place(SMALL[t]) >= place(lastSmall) || lastSmall < 20)) break;
      if (t === 'صد' && part > 0 && part < 10) part *= 100; // «سه صد» written apart
      else part += SMALL[t];
      lastSmall = SMALL[t];
      any = true;
      j++;
    } else if (t in SCALES) {
      if (!any && t !== 'هزار') break;
      total += (part || 1) * SCALES[t];
      lastScale = SCALES[t];
      part = 0;
      lastSmall = null;
      any = true;
      j++;
    } else if (t === 'و' && any && (isNum(w[j + 1]) || w[j + 1] === 'نیم')) {
      if (w[j + 1] === 'نیم') {
        part += 0.5;
        j += 2;
        break;
      }
      j++;
    } else if ((t === 'ممیز' || t === 'اعشار') && any) {
      // the fraction is read as written: «چهل و پنج» → .45, «صفر پنج» → .05
      let k = j + 1, digits = '';
      while (k < w.length && w[k] === 'صفر') (digits += '0'), k++;
      const f = readNumber(w, k);
      if (f && Number.isInteger(f.value)) {
        digits += String(f.value);
        k += f.len;
      } else if (!digits) break;
      part += Number(`0.${digits}`);
      j = k;
      break;
    } else break;
  }
  if (!any) return null;
  if (price && lastScale >= 1e6 && part > 0 && part < 1000 && Number.isInteger(part)) total += part * 1000;
  else total += part;
  return { value: Math.round(total * 1e6) / 1e6, len: j - i };
}

/** Does the phrase (list of words) start at w[i]? */
const at = (w, i, phrase) => phrase.split(' ').every((p, k) => w[i + k] === p);
function matchPhrase(w, i, table) {
  for (const [id, phrases] of table) for (const p of phrases) if (at(w, i, p)) return { id, len: p.split(' ').length, text: p };
  return null;
}

const moneyUnitAt = (w, j) => (w[j] === 'تومان' || w[j] === 'تومن' ? ['toman', 1] : w[j] === 'ریال' ? ['rial', 1] : [null, 0]);
const isKhat = (t) => t === 'خط' || t === 'خطی' || t === 'خطه';
/**
 * A distance from the مظنه at w[i] (spec 0020):
 *   «۲۰ خط پایین/زیر/کمتر (از)»، «۲۰ خط بالای/روی»، «منهای ۲۰ خط»، «بعلاوه ۵ خط»،
 *   «۲۰۰ هزار تومان زیر»، «منهای ۲ میلیون ریال» (a money distance needs its unit and its direction).
 * Returns { dir: -1 | 1 | 0, lines } or { dir, amount, unit }, with len; dir 0 means «خط» without up or down.
 */
export function readOffset(w, i) {
  let j = i, dir = 0;
  if (MINUS.has(w[j])) (dir = -1), j++;
  else if (PLUS.has(w[j])) (dir = 1), j++;
  else if (w[j] === 'به' && w[j + 1] === 'علاوه') (dir = 1), (j += 2);
  const n = readNumber(w, j, { price: true, offsetAware: true });
  if (!n || n.value <= 0) return null;
  j += n.len;
  let kind = null, unit = null;
  if (isKhat(w[j])) (kind = 'khat'), j++;
  else {
    const [u, ul] = moneyUnitAt(w, j);
    if (!ul) return null;
    (kind = 'money'), (unit = u), (j += ul);
  }
  if (!dir) {
    if (w[j] === 'تا') j++;
    if (DOWN.has(w[j])) (dir = -1), j++;
    else if (UP.has(w[j])) (dir = 1), j++;
    if (dir) {
      if (w[j] === 'تر') j++;
      if (w[j] === 'از') j++;
    }
  }
  if (kind === 'money' && !dir) return null; // «۲۰۰ هزار تومان» alone is a price, not a distance
  return kind === 'khat' ? { dir, lines: n.value, len: j - i } : { dir, amount: n.value, unit, len: j - i };
}

/**
 * Parse one line. Returns
 * { mode, party, kind, weight, fineness, coin, count, serial, fx: { code, amount, rate }, price: { basis, value, unit },
 *   pays: [{ method, amount, unit, rest }], note, unknown: [words], parts: [{ text, role }] }
 * Money values are as spoken; unit is 'toman', 'rial' or null (the desk applies the shop's unit).
 */
export function parseLine(line) {
  const segs = tokenize(line);
  const out = { mode: null, party: null, kind: null, weight: null, fineness: null, coin: null, count: null, serial: null, fx: null, price: null, offset: null, commit: false, pays: [], note: '', unknown: [], parts: [] };
  const leftovers = []; // per segment: words not understood
  const part = (text, role) => out.parts.push({ text, role });
  const moneyUnit = (w, j) => (w[j] === 'تومان' || w[j] === 'تومن' ? ['toman', 1] : w[j] === 'ریال' ? ['rial', 1] : [null, 0]);

  for (const w of segs) {
    const rest = [];
    let i = 0;
    while (i < w.length) {
      const t = w[i];
      // note: the rest of the segment
      if (t === 'یادداشت' || t === 'توضیح') {
        out.note = [out.note, w.slice(i + 1).join(' ')].filter(Boolean).join(' ');
        part(w.slice(i).join(' '), 'note');
        break;
      }
      // «ثبت کن»، «صادر کن»: the operator asks for the document to be issued once it is complete
      if ((t === 'ثبت' || t === 'صادر') && ['کن', 'شود', 'بشه', 'بشود', 'کنید', 'کردن'].includes(w[i + 1])) {
        out.commit = true;
        part(`${t} ${w[i + 1]}`, 'commit');
        i += 2;
        continue;
      }
      if (t === 'ثبتش' || t === 'صادرش') {
        out.commit = true;
        part(w.slice(i, w[i + 1] === 'کن' ? i + 2 : i + 1).join(' '), 'commit');
        i += w[i + 1] === 'کن' ? 2 : 1;
        continue;
      }
      // the مظنه, with an optional number and an optional distance before or after: «مظنه بازار ۱۰۹ میلیون منهای ۲۰ خط»
      if (t === 'مظنه') {
        let j = i + 1;
        while (MARKET_WORDS.has(w[j])) j++;
        let off = readOffset(w, j);
        if (off) j += off.len;
        const n = readNumber(w, j, { price: true, offsetAware: true });
        let base = null, unit = null;
        if (n) {
          base = n.value;
          j += n.len;
          const [u, ul] = moneyUnitAt(w, j);
          unit = u;
          j += ul;
        }
        while (MARKET_WORDS.has(w[j])) j++;
        if (!off && (off = readOffset(w, j))) j += off.len;
        if (off) out.offset = off;
        out.price = { basis: 'mazaneh', value: base, unit };
        part(w.slice(i, j).join(' '), 'price');
        i = j;
        continue;
      }
      // a distance standing before «مظنه»: «۲۰ خط پایین مظنه بازار ۱۰۹ میلیون»
      {
        const off = readOffset(w, i);
        if (off) {
          out.offset = off;
          part(w.slice(i, i + off.len).join(' '), 'offset');
          i += off.len;
          continue;
        }
      }
      // trade mode
      const m = !out.mode && matchPhrase(w, i, MODES);
      if (m && !(m.id === 'in' && m.text === 'امانت' && out.mode)) {
        out.mode = m.id;
        part(m.text, 'mode');
        i += m.len;
        // «خرید از رضایی» / «فروش به احمدی»: the name follows
        if ((w[i] === 'از' || w[i] === 'به') && w[i + 1] && !isKeyword(w, i + 1)) {
          const n = nameAt(w, i + 1);
          if (n.len) {
            out.party ??= n.text;
            part(n.text, 'party');
            i += 1 + n.len;
          }
        }
        continue;
      }
      // payments: «نقد ۱۰۰ میلیون»، «بقیه کارت»، «۵۰ میلیون کارت به کارت»
      const restWord = t === 'بقیه' || t === 'مابقی' || t === 'باقی' || t === 'باقیمانده';
      const p = matchPhrase(w, restWord ? i + 1 : i, PAYS);
      if (p) {
        const start = restWord ? i + 1 : i;
        let j = start + p.len;
        let amount = null, unit = null;
        const n = !restWord && readNumber(w, j, { price: true });
        if (n) {
          amount = n.value;
          j += n.len;
          const [u, ul] = moneyUnit(w, j);
          unit = u;
          j += ul;
        }
        out.pays.push({ method: p.id, amount, unit, rest: amount == null });
        part(w.slice(i, j).join(' '), 'pay');
        i = j;
        continue;
      }
      // coin names (with an optional count before them is handled by the number branch)
      const c = matchPhrase(w, i, COINS);
      if (c && !(c.id === 'half' && w[i + 1] === 'گرم') && !(c.id === 'emami' && c.text === 'تمام' && !isCoinContext(w, i))) {
        out.kind = 'coin';
        out.coin = c.id;
        out.count ??= 1;
        part(c.text, 'coin');
        i += c.len;
        continue;
      }
      const fx = matchPhrase(w, i, FX);
      if (fx) {
        out.kind = 'fx';
        out.fx = { ...(out.fx ?? {}), code: fx.id };
        part(fx.text, 'fx');
        i += fx.len;
        continue;
      }
      const k = matchPhrase(w, i, KINDS);
      if (k) {
        if (!(k.id === 'melt' && out.kind && out.kind !== 'melt')) out.kind = k.id === 'coin' && out.kind === 'coin' ? 'coin' : k.id;
        part(k.text, 'kind');
        i += k.len;
        // «شمش ۳۳۰۷۰۲۱»: a long number right after is its serial
        if (k.id === 'bar' && /^\d{5,}$/.test(w[i] ?? '')) {
          out.serial = w[i];
          part(w[i], 'serial');
          i++;
        }
        continue;
      }
      if (t === 'سریال' && /^\d{3,}$/.test(w[i + 1] ?? '')) {
        out.serial = w[i + 1];
        out.kind ??= 'bar';
        part(`سریال ${w[i + 1]}`, 'serial');
        i += 2;
        continue;
      }
      // fineness: «عیار ۷۵۰»، «عیار هفتصد و پنجاه»، «عیار ۱۸»
      if (t === 'عیار') {
        const n = readNumber(w, i + 1);
        if (n) {
          out.fineness = fineness(n.value);
          part(w.slice(i, i + 1 + n.len).join(' '), 'fineness');
          i += 1 + n.len;
          continue;
        }
      }
      if (t === 'وزن') {
        const n = readNumber(w, i + 1);
        if (n) {
          let j = i + 1 + n.len, v = n.value;
          if (w[j] === 'گرم' || w[j] === 'گ') j++;
          else if (w[j] === 'مثقال') (v = n.value * MESGHAL_G), j++;
          out.weight = round3(v);
          part(w.slice(i, j).join(' '), 'weight');
          i = j;
          continue;
        }
      }
      // prices
      const priceWord = t === 'گرمی' || (t === 'هر' && w[i + 1] === 'گرم') ? 'g750' : t === 'مبلغ' || t === 'جمعا' || t === 'جمعاً' || t === 'کلا' || t === 'کلاً' ? 'amount' : t === 'قیمت' || t === 'نرخ' || t === 'فی' || t === 'به' || t === '@' ? 'unit' : null;
      if (priceWord) {
        const skip = t === 'هر' ? 2 : 1;
        const n = readNumber(w, i + skip, { price: true });
        if (n) {
          let j = i + skip + n.len;
          const [u, ul] = moneyUnit(w, j);
          j += ul;
          if (out.kind === 'fx' || (priceWord === 'unit' && t === 'نرخ' && out.fx)) out.fx = { ...(out.fx ?? {}), rate: n.value, unit: u };
          else out.price = { basis: priceWord, value: n.value, unit: u };
          part(w.slice(i, j).join(' '), 'price');
          i = j;
          continue;
        }
      }
      if (t === 'نیم' && (w[i + 1] === 'گرم' || w[i + 1] === 'مثقال')) {
        out.weight = round3(w[i + 1] === 'مثقال' ? MESGHAL_G / 2 : 0.5);
        part(`نیم ${w[i + 1]}`, 'weight');
        i += 2;
        continue;
      }
      // a number: weight («… گرم»)، count of coins («۳ تا تمام»)، currency amount («۱۰۰۰ دلار»)، fineness after grams,
      // or money before its method («۵۰ میلیون کارت»)
      const n = readNumber(w, i, { price: true });
      if (n) {
        let j = i + n.len;
        const next = w[j];
        const [mu, mul] = moneyUnit(w, j);
        const pm = matchPhrase(w, j + mul, PAYS);
        if (pm) {
          out.pays.push({ method: pm.id, amount: n.value, unit: mu, rest: false });
          part(w.slice(i, j + mul + pm.len).join(' '), 'pay');
          i = j + mul + pm.len;
          continue;
        }
        if (next === 'گرم' || next === 'گ' || next === 'g' || next === 'gr') {
          out.weight = round3(n.value);
          j++;
          part(w.slice(i, j).join(' '), 'weight');
          // «۱۲ گرم ۷۴۰»: a bare three-digit number right after the grams is the fineness
          if (out.fineness == null && /^\d{3}$/.test(w[j] ?? '') && Number(w[j]) >= 585 && Number(w[j]) <= 999) {
            out.fineness = Number(w[j]);
            part(w[j], 'fineness');
            j++;
          }
          i = j;
          continue;
        }
        if (next === 'مثقال') {
          out.weight = round3(n.value * MESGHAL_G);
          part(w.slice(i, j + 1).join(' '), 'weight');
          i = j + 1;
          continue;
        }
        if (next === 'تا' || next === 'عدد' || next === 'سکه' || matchPhrase(w, j, COINS)) {
          const after = next === 'تا' || next === 'عدد' ? j + 1 : j;
          const cn = matchPhrase(w, after, COINS);
          out.count = n.value;
          out.kind = 'coin';
          if (cn) {
            out.coin = cn.id;
            part(w.slice(i, after + cn.len).join(' '), 'coin');
            i = after + cn.len;
          } else {
            part(w.slice(i, after).join(' '), 'count');
            i = after;
          }
          continue;
        }
        const f = matchPhrase(w, j, FX);
        if (f) {
          out.kind = 'fx';
          out.fx = { ...(out.fx ?? {}), code: f.id, amount: n.value };
          part(w.slice(i, j + f.len).join(' '), 'fx');
          i = j + f.len;
          continue;
        }
        // a bare 3-digit fineness standing alone («- ۷۵۰ -»)
        if (out.fineness == null && n.len === 1 && /^\d{3}$/.test(w[i]) && Number(w[i]) >= 585 && Number(w[i]) <= 999) {
          out.fineness = Number(w[i]);
          part(w[i], 'fineness');
          i++;
          continue;
        }
        // a money amount with its unit after a payment word was handled above; here a lonely number stays unknown
        for (let k = i; k < j; k++) rest.push([k, w[k]]);
        i = j;
        continue;
      }
      rest.push([i, t]);
      i++;
    }
    // words left over, in runs of neighbours (a consumed token breaks a run)
    let run = null;
    for (const [k, t] of rest) {
      if (!run || k !== run.end + 1) leftovers.push((run = { words: [], end: k }));
      run.words.push(t);
      run.end = k;
    }
  }
  const FILLER = new Set(['از', 'به', 'و', 'با', 'را', 'برای', 'امروز', 'دیروز', 'الان', 'همین', 'امشب', 'صبح', 'عصر', 'ظهر']);
  // the customer: the first run of plain words (titles dropped, up to three words); every other run is reported
  for (const r of leftovers) {
    const words = r.words.filter((x) => !TITLES.has(x) && !FILLER.has(x));
    if (!out.party && words.length && words.length <= 3 && words.every((x) => !/\d/.test(x))) {
      out.party = words.join(' ');
      part(out.party, 'party');
      continue;
    }
    out.unknown.push(...words);
  }
  // a distance from the مظنه makes the price a مظنه price (the number itself may come from the market board)
  if (out.offset && !out.price) out.price = { basis: 'mazaneh', value: null, unit: null };
  if (out.offset && out.price) out.price.offset = out.offset;
  if (!out.kind && (out.weight != null || out.fineness != null || out.offset)) out.kind = 'melt';
  if (out.kind === 'coin' && !out.coin) out.coin = 'emami';
  return out;
}

const round3 = (v) => Math.round(v * 1000) / 1000;
function fineness(v) {
  if (KARAT[v]) return KARAT[v];
  return v > 0 && v < 25 ? Math.round((v / 24) * 1000) : v;
}
function isKeyword(w, i) {
  return !!(matchPhrase(w, i, MODES) || matchPhrase(w, i, PAYS) || matchPhrase(w, i, COINS) || matchPhrase(w, i, FX) || matchPhrase(w, i, KINDS) || readNumber(w, i) || readOffset(w, i) || ['عیار', 'وزن', 'مظنه', 'قیمت', 'نرخ', 'سریال', 'ثبت', 'صادر', 'ثبتش', 'صادرش'].includes(w[i]) || MINUS.has(w[i]) || PLUS.has(w[i]));
}
/** A name: up to three words that are not keywords or numbers (titles dropped). */
function nameAt(w, i) {
  const words = [];
  let j = i;
  while (j < w.length && words.length < 3 && !isKeyword(w, j)) {
    if (!TITLES.has(w[j])) words.push(w[j]);
    j++;
  }
  return { text: words.join(' '), len: j - i };
}
/** «تمام» is a coin only near coin words or a count («۳ تا تمام»), not in «تمام شد». */
function isCoinContext(w, i) {
  return w[i + 1] === 'امامی' || w[i + 1] === 'بهار' || w[i - 1] === 'سکه' || w[i - 1] === 'تا' || w[i - 1] === 'عدد' || /^\d+$/.test(w[i - 1] ?? '') || w[i - 1] in SMALL || w.length === 1;
}

const COIN_FA = { emami: 'تمام امامی', bahar: 'تمام بهار', half: 'نیم', halfOld: 'نیم قدیم', quarter: 'ربع', quarterOld: 'ربع قدیم', gerami: 'گرمی' };
const PAY_FA = { cash: 'نقد', pos: 'کارتخوان', c2c: 'کارت به کارت', satna: 'ساتنا', paya: 'پایا', pol: 'پل', havale: 'حواله', cheque: 'چک', offset: 'تهاتر', credit: 'نسیه (روی حساب)' };
const MODE_FA = { buy: 'خرید از مشتری', sell: 'فروش به مشتری', in: 'دریافت جنس', out: 'تحویل جنس' };
const FX_FA = { USD: 'دلار', EUR: 'یورو', AED: 'درهم', TRY: 'لیر', GBP: 'پوند', CNY: 'یوان' };
const faNum = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]).replace('.', '٫');
const faMoney = (v) => faNum(Math.round(v).toLocaleString('en-US')).replace(/,/g, '٬');

/** One Persian sentence of what was understood, for the preview before it is applied. */
export function describe(p) {
  const bits = [];
  if (p.mode) bits.push(MODE_FA[p.mode]);
  if (p.party) bits.push(`مشتری: ${p.party}`);
  if (p.kind === 'coin') bits.push(`${faNum(p.count ?? 1)} سکه ${COIN_FA[p.coin] ?? ''}`.trim());
  if (p.kind === 'bar') bits.push(`شمش${p.serial ? ` سریال ${faNum(p.serial)}` : ''}`);
  if (p.kind === 'melt') bits.push('آبشده');
  if (p.kind === 'fx' && p.fx) bits.push(`${p.fx.amount != null ? faNum(p.fx.amount) + ' ' : ''}${FX_FA[p.fx.code] ?? p.fx.code ?? 'ارز'}${p.fx.rate ? ` نرخ ${faMoney(p.fx.rate)}${p.fx.unit === 'toman' ? ' تومان' : p.fx.unit === 'rial' ? ' ریال' : ''}` : ''}`);
  if (p.weight != null) bits.push(`${faNum(p.weight)} گرم`);
  if (p.fineness != null) bits.push(`عیار ${faNum(p.fineness)}`);
  if (p.price?.basis === 'mazaneh' && (p.price.value == null || p.price.offset)) {
    const o = p.price.offset;
    bits.push(`مظنه ${p.price.value == null ? 'بازار' : `${p.price.value < 10000 ? faNum(p.price.value) : faMoney(p.price.value)}${p.price.unit === 'toman' ? ' تومان' : p.price.unit === 'rial' ? ' ریال' : ''}`}${o ? ` ${o.dir < 0 ? '−' : o.dir > 0 ? '+' : '؟'} ${o.lines != null ? `${faNum(o.lines)} خط` : `${faMoney(o.amount)} ${o.unit === 'toman' ? 'تومان' : 'ریال'}`}` : ''}`);
  } else if (p.price) bits.push(`${p.price.basis === 'mazaneh' ? 'مظنه' : p.price.basis === 'g750' ? 'گرم ۷۵۰' : p.price.basis === 'amount' ? 'مبلغ کل' : 'قیمت'} ${faMoney(p.price.value)}${p.price.unit === 'toman' ? ' تومان' : p.price.unit === 'rial' ? ' ریال' : ''}`);
  for (const x of p.pays) bits.push(`${PAY_FA[x.method]}${x.amount != null ? ` ${faMoney(x.amount)}${x.unit === 'toman' ? ' تومان' : x.unit === 'rial' ? ' ریال' : ''}` : x.rest && p.pays.length > 1 ? ' (بقیه)' : ''}`);
  if (p.note) bits.push(`یادداشت: ${p.note}`);
  if (p.commit) bits.push('و ثبت سند');
  return bits.join(' · ');
}

/**
 * The agreed مظنه in rial (spec 0020): the spoken base (or the market board's when none was said) plus or minus the
 * distance. A bare base is read in the unit that puts it nearest the market («۱۰۹ میلیون» is toman, «۱۰۸/۸۰۰» is
 * millions of toman); with no market at hand the shop's unit is used. Nothing is guessed silently: every choice is
 * returned in `steps`, and a «خط» with no up or down is an error, not a guess.
 *   resolveMazaneh(p.price, { liveRial, shopUnit }) → { ok, rial, baseRial, offsetRial, live, steps } | { ok: false, error }
 */
export function resolveMazaneh(price, { liveRial = null, shopUnit = 'rial' } = {}) {
  if (!price || price.basis !== 'mazaneh') return { ok: false, error: 'قیمت بر پایه مظنه نیست.' };
  const steps = [];
  let baseRial, live = false;
  if (price.value == null) {
    if (!(liveRial > 0)) return { ok: false, error: 'مظنه بازار در دسترس نیست؛ عدد مظنه را بنویسید.' };
    baseRial = liveRial;
    live = true;
    steps.push('مظنه از تابلوی بازار');
  } else {
    const v = price.value;
    const cands = price.unit
      ? [v < 10000 ? v * 1e6 * (price.unit === 'toman' ? 10 : 1) : v * (price.unit === 'toman' ? 10 : 1)]
      : v < 10000
        ? [v * 1e7] // «مظنه ۱۰۹» / «۱۰۸/۸۰۰»: millions of toman, as the market speaks
        : [v * 10, v];
    if (cands.length > 1 && liveRial > 0) {
      baseRial = cands.reduce((a, b) => (Math.abs(Math.log(b / liveRial)) < Math.abs(Math.log(a / liveRial)) ? b : a));
      steps.push(baseRial === v * 10 ? 'عدد مظنه به تومان خوانده شد (نزدیک‌ترین به بازار)' : 'عدد مظنه به ریال خوانده شد (نزدیک‌ترین به بازار)');
    } else if (cands.length > 1) {
      baseRial = shopUnit === 'toman' ? v * 10 : v;
      steps.push(`عدد مظنه به واحد فروشگاه (${shopUnit === 'toman' ? 'تومان' : 'ریال'}) خوانده شد`);
    } else {
      baseRial = cands[0];
      if (v < 10000) steps.push('عدد کوتاه مظنه به میلیون تومان خوانده شد');
    }
  }
  let offsetRial = 0;
  const o = price.offset;
  if (o) {
    if (!o.dir) return { ok: false, error: `${o.lines != null ? `${faNum(o.lines)} خط` : 'فاصله'} پایین‌تر از مظنه یا بالاتر؟ «زیر» یا «بالای» را بنویسید.` };
    offsetRial = o.lines != null ? o.dir * o.lines * KHAT_RIAL : o.dir * o.amount * (o.unit === 'toman' ? 10 : 1);
  }
  const rial = Math.round(baseRial + offsetRial);
  if (!(rial > 0)) return { ok: false, error: 'مظنه حاصل مثبت نیست.' };
  const far = liveRial > 0 && (rial / liveRial > 1.5 || rial / liveRial < 0.67);
  return { ok: true, rial, baseRial: Math.round(baseRial), offsetRial, live, far, steps };
}

/** «مظنه ۱٬۰۹۰٬۰۰۰٬۰۰۰ − ۲۰ خط (۲٬۰۰۰٬۰۰۰) = ۱٬۰۸۸٬۰۰۰٬۰۰۰ ریال», in the shop's unit. */
export function explainMazaneh(price, r, unit = 'rial') {
  const k = unit === 'toman' ? 10 : 1, u = unit === 'toman' ? 'تومان' : 'ریال';
  const m = (x) => faMoney(x / k);
  if (!r.offsetRial) return `مظنه ${m(r.rial)} ${u}${r.live ? ' (بازار)' : ''}`;
  const o = price.offset;
  const dist = o.lines != null ? `${faNum(o.lines)} خط` : `${faMoney(o.amount)} ${o.unit === 'toman' ? 'تومان' : 'ریال'}`;
  return `مظنه ${m(r.baseRial)}${r.live ? ' (بازار)' : ''} ${r.offsetRial < 0 ? '−' : '+'} ${dist} (${m(Math.abs(r.offsetRial))}) = ${m(r.rial)} ${u}`;
}

/** What a sentence still lacks before it is a whole line (and, with `doc`, a whole document). */
export function missing(p, { doc = false } = {}) {
  const need = [];
  if (!p.mode) need.push('نوع معامله (خرید یا فروش)');
  if (!p.kind) need.push('کالا');
  if (p.kind === 'melt' && p.weight == null) need.push('وزن');
  if (p.kind === 'bar' && p.weight == null && !p.serial) need.push('وزن یا سریال شمش');
  if (p.kind === 'coin' && !p.count) need.push('تعداد سکه');
  if (p.kind === 'fx' && p.fx?.amount == null) need.push('مبلغ ارز');
  if (doc && !p.party) need.push('مشتری');
  if (doc && !p.pays.length) need.push('روش پرداخت (یا «نسیه»)');
  return need;
}
