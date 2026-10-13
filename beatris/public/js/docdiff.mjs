// What changed between two contents of a document, field by field (spec 0024). Pure and deterministic: the same two
// contents always give the same list in the same order. The server writes the list into the hash-chained log of an
// amendment, a draft edit or a restore; the document page and رهگیری show it in words.
import * as B from './books.mjs';
import * as TR from './trade.mjs';
import { TRADE_COINS as COIN_TYPES } from './coins.mjs';

// value types: IRR (rial), G (grams), N (count), FIN (fineness), PCT, TXT, DATE, PARTY, ACCT, BOOL, METHOD, DIR, KIND, COIN, FX, ITEM
const LINE_FIELDS = [
  ['kind', 'نوع', 'KIND'], ['dir', 'جهت', 'DIR'], ['side', 'جهت', 'DIR'], ['priced', 'با قیمت', 'BOOL'], ['coin', 'نوع سکه', 'COIN'], ['code', 'ارز', 'FX'],
  ['serial', 'سریال', 'TXT'], ['tpl', 'الگو', 'TXT'], ['title', 'شرح', 'TXT'], ['itemId', 'کالای انبار', 'ITEM'],
  ['weight', 'وزن', 'G'], ['stoneWeight', 'وزن سنگ', 'G'], ['fineness', 'عیار', 'FIN'], ['basis', 'مبنای قیمت', 'TXT'],
  ['mazaneh', 'مظنه', 'IRR'], ['g750', 'قیمت گرم ۷۵۰', 'IRR'], ['p750', 'قیمت گرم ۱۸', 'IRR'], ['gramPrice', 'قیمت هر گرم', 'IRR'], ['price', 'قیمت واحد', 'IRR'],
  ['count', 'تعداد', 'N'], ['qty', 'تعداد', 'N'], ['fxAmount', 'مقدار ارز', 'N'], ['rate', 'نرخ', 'IRR'], ['amount', 'مبلغ توافقی', 'IRR'], ['fee', 'اجرت پلمپ', 'IRR'],
  ['ojratMode', 'نوع اجرت', 'TXT'], ['ojrat', 'اجرت', 'N'], ['profitPct', 'سود', 'PCT'], ['bros', 'حق‌العمل', 'IRR'], ['stones', 'بهای سنگ', 'IRR'], ['discount', 'تخفیف', 'IRR'],
  ['deductPct', 'کسر', 'PCT'], ['vatPct', 'نرخ مالیات', 'PCT'], ['conditional', 'شرطی', 'BOOL'], ['brand', 'برند', 'TXT'], ['gallery', 'گالری', 'TXT'], ['sealDate', 'تاریخ پلمپ', 'TXT'], ['note', 'یادداشت', 'TXT'],
];
const PAY_FIELDS = [
  ['method', 'روش', 'METHOD'], ['dir', 'جهت', 'DIR'], ['amount', 'مبلغ', 'IRR'], ['account', 'صندوق / حساب', 'ACCT'], ['ref', 'شماره پیگیری', 'TXT'], ['card', 'کارت', 'TXT'],
  ['sheba', 'شبا', 'TXT'], ['terminal', 'پایانه', 'TXT'], ['chequeNo', 'شماره چک', 'TXT'], ['sayad', 'شناسه صیادی', 'TXT'], ['bank', 'بانک', 'TXT'], ['owner', 'صاحب چک', 'TXT'],
  ['due', 'سررسید', 'DATE'], ['weight', 'وزن', 'G'], ['fineness', 'عیار', 'FIN'], ['p750', 'قیمت گرم ۱۸', 'IRR'], ['coin', 'نوع سکه', 'COIN'], ['count', 'تعداد', 'N'], ['price', 'قیمت هر سکه', 'IRR'],
  ['fxCode', 'ارز', 'FX'], ['fxAmount', 'مقدار ارز', 'N'], ['fxRate', 'نرخ ارز', 'IRR'], ['note', 'یادداشت', 'TXT'],
];
const HEAD_FIELDS = [['date', 'تاریخ', 'DATE'], ['partyId', 'طرف حساب', 'PARTY'], ['category', 'دسته (هزینه یا درآمد)', 'TXT'], ['creditUnit', 'واحد نسیه', 'TXT'], ['creditP750', 'قیمت تبدیل نسیه به طلا', 'IRR'], ['seller', 'فروشنده', 'TXT'], ['note', 'یادداشت', 'TXT']];
const TOTALS = [['net', 'جمع سند', 'NET'], ['paidIn', 'دریافتی', 'IRR'], ['paidOut', 'پرداختی', 'IRR'], ['credit', 'مانده روی حساب', 'BAL']];
// money inputs of the full edition are typed in toman (the engine multiplies by 10); the base edition types rial
const TOMAN_INPUTS = new Set(['amount', 'price', 'p750', 'mazaneh', 'bros', 'stones', 'discount', 'creditP750']);

const isNum = (t) => t === 'IRR' || t === 'G' || t === 'N' || t === 'FIN' || t === 'PCT';
function norm(v, type, k) {
  if (v === undefined || v === null || v === '') return null;
  if (type === 'BOOL') return v === false || v === 'false' ? false : v === true || v === 'true' ? true : null;
  if (isNum(type)) {
    const x = B.num(v);
    if (!Number.isFinite(x)) return String(v);
    return type === 'IRR' ? Math.round(x * k) : type === 'G' ? B.r3(x) : Math.round(x * 1e6) / 1e6;
  }
  if (type === 'TXT') return String(v).replace(/\s+/g, ' ').trim() || null;
  return String(v);
}
const same = (a, b) => (a === null && b === null) || a === b;

/**
 * Pair two lists by a signature (longest common subsequence), so an inserted row is one «added», not a shift. A removed
 * row right next to an added row of the same group is one changed row.
 */
function pairUp(a, b, sig, group = (s) => s.split('|')[0]) {
  const sa = a.map(sig), sb = b.map(sig);
  const n = a.length, m = b.length;
  const L = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = sa[i] === sb[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (sa[i] === sb[j]) out.push([i++, j++]);
    else if (L[i + 1][j] >= L[i][j + 1]) out.push([i++, null]);
    else out.push([null, j++]);
  }
  while (i < n) out.push([i++, null]);
  while (j < m) out.push([null, j++]);
  const merged = [];
  for (let k = 0; k < out.length; k++) {
    const [x, y] = out[k], nx = out[k + 1];
    if (x !== null && y === null && nx && nx[0] === null && nx[1] !== null && group(sa[x]) === group(sb[nx[1]])) {
      merged.push([x, nx[1]]);
      k++;
    } else if (x === null && y !== null && nx && nx[0] !== null && nx[1] === null && group(sb[y]) === group(sa[nx[0]])) {
      merged.push([nx[0], y]);
      k++;
    } else merged.push([x, y]);
  }
  return merged;
}

function fields(list, x, y, k, at, n, out) {
  for (const [key, label, type] of list) {
    const a = norm(x?.[key], type, k), b = norm(y?.[key], type, k);
    if (!same(a, b)) out.push({ at, n, field: key, label, type, from: a, to: b, kind: 'changed' });
  }
}

const lineSig = (l) => `${l.kind ?? ''}|${l.dir ?? l.side ?? ''}|${l.coin ?? l.code ?? ''}`;
const paySig = (p) => `${p.method ?? ''}|${p.dir ?? ''}`;

/**
 * What changed from a to b. a, b: stored documents ({ type, date, partyId, note, lines, payments, hawala, convert, …,
 * calc }). Returns [{ at: 'head'|'line'|'pay'|'hawala'|'convert'|'total', n (1-based row in b, or in a when removed),
 * field, label, type, from, to, kind: 'changed'|'added'|'removed', what? }]. Money is in rial.
 */
export function docDiff(a, b) {
  const out = [];
  if (!a || !b) return out;
  const k = B.DOC_TYPES[b.type ?? a.type]?.base ? 1 : 10;
  const kOf = (key) => (TOMAN_INPUTS.has(key) ? k : 1);
  const head = (x) => Object.fromEntries(HEAD_FIELDS.map(([f]) => [f, x[f]]));
  for (const [key, label, type] of HEAD_FIELDS) {
    const va = norm(head(a)[key], type, kOf(key)), vb = norm(head(b)[key], type, kOf(key));
    if (!same(va, vb)) out.push({ at: 'head', n: 0, field: key, label, type, from: va, to: vb, kind: 'changed' });
  }
  const la = a.lines ?? [], lb = b.lines ?? [];
  const lineFields = LINE_FIELDS.map(([f, l, t]) => [f, l, t]);
  for (const [i, j] of pairUp(la, lb, lineSig)) {
    if (i !== null && j !== null) {
      const before = out.length;
      for (const [key, label, type] of lineFields) {
        const va = norm(la[i][key], type, kOf(key)), vb = norm(lb[j][key], type, kOf(key));
        if (!same(va, vb)) out.push({ at: 'line', n: j + 1, field: key, label, type, from: va, to: vb, kind: 'changed', what: lineName(lb[j]) });
      }
      if (out.length === before) continue;
    } else if (j !== null) out.push({ at: 'line', n: j + 1, field: '', label: 'ردیف', type: 'ROW', from: null, to: lineName(lb[j]), kind: 'added', what: lineName(lb[j]) });
    else out.push({ at: 'line', n: i + 1, field: '', label: 'ردیف', type: 'ROW', from: lineName(la[i]), to: null, kind: 'removed', what: lineName(la[i]) });
  }
  const pa = a.payments ?? [], pb = b.payments ?? [];
  for (const [i, j] of pairUp(pa, pb, paySig, () => '')) {
    if (i !== null && j !== null) {
      for (const [key, label, type] of PAY_FIELDS) {
        let va = norm(pa[i][key], type, kOf(key)), vb = norm(pb[j][key], type, kOf(key));
        if (key === 'card') (va = va && String(va).slice(-4)), (vb = vb && String(vb).slice(-4));
        if (!same(va, vb)) out.push({ at: 'pay', n: j + 1, field: key, label, type, from: va, to: vb, kind: 'changed', what: payName(pb[j]) });
      }
    } else if (j !== null) out.push({ at: 'pay', n: j + 1, field: '', label: 'پرداخت', type: 'ROW', from: null, to: payName(pb[j]), kind: 'added', what: payName(pb[j]), value: norm(pb[j].amount, 'IRR', kOf('amount')) });
    else out.push({ at: 'pay', n: i + 1, field: '', label: 'پرداخت', type: 'ROW', from: payName(pa[i]), to: null, kind: 'removed', what: payName(pa[i]), value: norm(pa[i].amount, 'IRR', kOf('amount')) });
  }
  // a hawala or conversion amount is rial, grams of 750 or a count, by its unit
  const amtType = (x) => (x?.unit === 'IRR' ? 'IRR' : x?.unit === 'G750' ? 'G' : 'N');
  if (a.hawala || b.hawala)
    fields([['from', 'از حساب', 'PARTY'], ['to', 'به حساب', 'PARTY'], ['unit', 'واحد', 'UNIT'], ['amount', 'مقدار', amtType(b.hawala ?? a.hawala)]], a.hawala, b.hawala, 1, 'hawala', 0, out);
  if (a.convert || b.convert)
    fields([['unit', 'واحد', 'UNIT'], ['amount', 'مقدار', amtType(b.convert ?? a.convert)], ['basis', 'مبنا', 'TXT'], ['mazaneh', 'مظنه', 'IRR'], ['g750', 'قیمت گرم ۷۵۰', 'IRR'], ['price', 'نرخ', 'IRR']], a.convert, b.convert, 1, 'convert', 0, out);
  // سوخت یا بخشودگی مانده (spec 0026): which balance and how much of it
  if (a.writeoff || b.writeoff) fields([['unit', 'واحد', 'UNIT'], ['amount', 'مقدار', amtType(b.writeoff ?? a.writeoff)]], a.writeoff, b.writeoff, 1, 'writeoff', 0, out);
  // opening and count adjustments: one row per account and unit
  const ba = a.balances ?? [], bb = b.balances ?? [];
  if (ba.length || bb.length) {
    const key = (x) => `${x.acct}|${x.unit}`;
    const ma = new Map(ba.map((x) => [key(x), x])), mb = new Map(bb.map((x) => [key(x), x]));
    for (const kk of [...new Set([...ma.keys(), ...mb.keys()])].sort()) {
      const x = ma.get(kk), y = mb.get(kk);
      const t = (y ?? x).unit === 'IRR' ? 'IRR' : (y ?? x).unit === 'G750' ? 'G' : 'N';
      const va = x ? norm(x.amt, t, 1) : null, vb = y ? norm(y.amt, t, 1) : null;
      if (!same(va, vb)) out.push({ at: 'balance', n: 0, field: kk, label: (y ?? x).acct, type: t, from: va, to: vb, kind: x && y ? 'changed' : y ? 'added' : 'removed', what: (y ?? x).acct });
    }
  }
  const ca = a.calc ?? {}, cb = b.calc ?? {};
  for (const [key, label, type] of TOTALS) {
    const va = Math.round(B.num(ca[key] ?? 0)), vb = Math.round(B.num(cb[key] ?? 0));
    if (va !== vb) out.push({ at: 'total', n: 0, field: key, label, type, from: va, to: vb, kind: 'changed' });
  }
  return out;
}

function lineName(l) {
  if (!l) return '';
  if (TR.TRADE_KINDS[l.kind] && (l.dir || l.priced !== undefined)) return `${l.kind === 'coin' ? `سکه ${COIN_TYPES[l.coin]?.short ?? ''}` : TR.TRADE_KINDS[l.kind]}`.trim();
  return l.title || B.KIND_LABEL[l.kind] || l.kind || '';
}
const payName = (p) => (p ? B.payMethod(p.method)?.label ?? p.method ?? '' : '');
/** A ledger account in words, for an opening or count row. */
const acctWords = (a = '') => (a === 'gold' ? 'طلای آبشده' : a.startsWith('coin:') ? `سکه ${COIN_TYPES[a.slice(5)]?.short ?? ''}` : a.startsWith('fx:') ? TR.FX_CODES[a.slice(3)] ?? a : a.startsWith('bar:') ? `شمش ${B.faNum(a.slice(4))}` : a.startsWith('cash:') ? 'صندوق' : a.startsWith('bank:') ? 'بانک' : a.startsWith('party:') ? 'طرف حساب' : a);

/* ---------------- words ---------------- */
const DIR_FA = { in: 'ورود / دریافت', out: 'خروج / پرداخت' };
const BASIS_FA = { mazaneh: 'مظنه', gram750: 'قیمت گرم ۷۵۰', amount: 'مبلغ توافقی', count: 'تعداد', weight: 'وزن' };
/**
 * One value in words. fmt: { money(rial) → text, party(id) → label, account(id) → title, item(id) → code, date(iso) → jalali }.
 */
export function valueText(type, v, fmt = {}) {
  if (v === null || v === undefined) return '—';
  const money = (x) => (fmt.money ? fmt.money(x) : `${B.faNum(Math.round(x).toLocaleString('en-US')).replace(/,/g, '٬')} ریال`);
  switch (type) {
    case 'IRR': return v < 0 ? `منفی ${money(-v)}` : money(v);
    // the document's net and what it leaves on the customer's account, with the side named instead of a sign
    case 'NET': return v === 0 ? 'صفر' : v > 0 ? `${money(v)} دریافتنی از مشتری` : `${money(-v)} پرداختنی به مشتری`;
    case 'BAL': return v === 0 ? 'صفر (تسویه)' : v > 0 ? `${money(v)} بدهی مشتری` : `${money(-v)} طلب مشتری`;
    case 'G': return `${B.fmtG(v)} گرم`;
    case 'N': return B.faNum(String(v)).replace('.', '٫');
    case 'FIN': return B.faNum(String(v));
    case 'PCT': return `${B.faNum(String(v)).replace('.', '٫')}٪`;
    case 'BOOL': return v ? 'بله' : 'خیر';
    case 'DIR': return DIR_FA[v] ?? v;
    case 'KIND': return TR.TRADE_KINDS[v] ?? B.KIND_LABEL[v] ?? v;
    case 'COIN': return COIN_TYPES[v]?.short ?? v;
    case 'FX': return TR.FX_CODES[v] ?? v;
    case 'METHOD': return B.payMethod(v)?.label ?? v;
    case 'PARTY': return fmt.party ? fmt.party(v) : v;
    case 'ACCT': return fmt.account ? fmt.account(v) : v;
    case 'ITEM': return fmt.item ? fmt.item(v) : v;
    case 'DATE': return fmt.date ? fmt.date(v) : v;
    case 'UNIT': return B.UNITS[v] ?? (String(v).startsWith('FX:') ? TR.FX_CODES[v.slice(3)] ?? v : String(v).startsWith('BAR:') ? `شمش ${B.faNum(v.slice(4))}` : v);
    case 'TXT': return BASIS_FA[v] ?? String(v);
    default: return String(v);
  }
}
/** One change as a Persian line: «ردیف ۲ (آبشده)، وزن — قبل: ۱۲٫۴۵۰ گرم؛ بعد: ۱۲٫۵۴۰ گرم». */
export function changeText(c, fmt = {}) {
  const where = c.at === 'line' ? `ردیف ${B.faNum(c.n)}${c.what ? ` (${c.what})` : ''}` : c.at === 'pay' ? `پرداخت ${B.faNum(c.n)}${c.what ? ` (${c.what})` : ''}` : c.at === 'hawala' ? 'حواله' : c.at === 'convert' ? 'تبدیل' : c.at === 'writeoff' ? 'سوخت مانده' : c.at === 'balance' ? `مانده ${acctWords(c.what)}` : '';
  if (c.at === 'balance' && c.kind !== 'changed') return `${where} ${c.kind === 'added' ? 'اضافه شد' : 'حذف شد'}: ${valueText(c.type, c.kind === 'added' ? c.to : c.from, fmt)}`;
  if (c.at === 'balance') return `${where} — قبل: ${valueText(c.type, c.from, fmt)}؛ بعد: ${valueText(c.type, c.to, fmt)}`;
  if (c.kind === 'added') return `${where} اضافه شد${c.value ? `: ${valueText('IRR', c.value, fmt)}` : ''}`;
  if (c.kind === 'removed') return `${where} حذف شد${c.value ? ` (${valueText('IRR', c.value, fmt)})` : ''}`;
  return `${where ? `${where}، ` : ''}${c.label} — قبل: ${valueText(c.type, c.from, fmt)}؛ بعد: ${valueText(c.type, c.to, fmt)}`;
}
