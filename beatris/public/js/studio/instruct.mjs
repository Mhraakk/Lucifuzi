// دستور ویرایش طراح (spec 0016): a Persian edit instruction → a typed parameter edit, never free text into the CAD
// engine. What is not understood is returned as such; nothing is guessed.
import { normalize } from '../oneline.mjs';
import { diameterFromIso, diameterFromUs } from './ring.mjs';

const N = '([0-9۰-۹٠-٩]+(?:[.٫/][0-9۰-۹٠-٩]+)?)';
const num = (s) => Number(String(s).replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[٫/]/g, '.'));
const WORDS = { یک: 1, دو: 2, سه: 3, چهار: 4, پنج: 5, شش: 6, هفت: 7, هشت: 8 };

/** → { edits: [{ param, value } | { action: 'reduceWeight', grams, keepSetting, keepShoulders }], unknown } */
export function parseInstruction(text) {
  const t = normalize(String(text ?? ''));
  const edits = [];
  const w = new RegExp(`وزن[^\\d۰-۹]{0,20}${N}\\s*گرم\\s*(?:کم|سبک|کاهش)`).exec(t) ?? new RegExp(`${N}\\s*گرم\\s*(?:از وزن\\s*)?(?:کم|سبک)`).exec(t);
  const target = new RegExp(`وزن[^\\d۰-۹]{0,20}(?:به|را به)\\s*(?:زیر\\s*)?${N}\\s*گرم`).exec(t);
  if (w) edits.push({ action: 'reduceWeight', grams: num(w[1]), keepSetting: !/نگین (?:را )?(?:هم )?عوض|سر را (?:هم )?تغییر/.test(t), keepShoulders: true });
  else if (target) edits.push({ action: 'targetWeight', grams: num(target[1]), keepSetting: true, keepShoulders: true });
  const set = (re, param, map = (v) => v) => {
    const m = re.exec(t);
    if (m) edits.push({ param, value: map(num(m[1])) });
  };
  set(new RegExp(`پهنای? (?:کف|پایین)[^\\d۰-۹]{0,12}${N}`), 'widthBottom');
  set(new RegExp(`پهنای? (?:بالا|شانه)[^\\d۰-۹]{0,12}${N}`), 'widthTop');
  set(new RegExp(`ضخامت (?:کف|پایین)[^\\d۰-۹]{0,12}${N}`), 'thickBottom');
  set(new RegExp(`ضخامت (?:بالا|شانه)[^\\d۰-۹]{0,12}${N}`), 'thickTop');
  set(new RegExp(`(?:ارتفاع سر|سر (?:نگین )?را)[^\\d۰-۹]{0,12}${N}`), 'headHeight');
  set(new RegExp(`قطر (?:چنگ|پنجه)[^\\d۰-۹]{0,12}${N}`), 'prongDiameterMm');
  const iso = new RegExp(`سایز\\s*${N}(\\s*(?:آمریکایی|us))?`, 'i').exec(t);
  if (iso) edits.push({ param: 'innerDiameter', value: Math.round((iso[2] || num(iso[1]) < 20 ? diameterFromUs(num(iso[1])) : diameterFromIso(num(iso[1]))) * 100) / 100 });
  const prongs = /(\d+|[۰-۹]+|یک|دو|سه|چهار|پنج|شش|هفت|هشت)\s*(?:تا\s*)?(?:چنگ|پنجه)/.exec(t);
  if (prongs) edits.push({ param: 'prongCount', value: WORDS[prongs[1]] ?? num(prongs[1]) });
  return { edits, understood: edits.length > 0 };
}

/** Apply parameter edits (not weight actions) to a parameter set; setting params go into the setting spec. */
export function applyEdits(p, edits) {
  const out = { ...p, setting: p.setting ? { ...p.setting } : null };
  for (const e of edits) {
    if (!e.param) continue;
    if (e.param === 'prongCount' || e.param === 'prongDiameterMm') {
      if (out.setting) out.setting[e.param] = e.value;
    } else out[e.param] = e.value;
  }
  return out;
}
