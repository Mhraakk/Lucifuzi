// عملیات حسابداری (spec 0015): a typed operation of the counter → the one correct journal entry, computed by the
// kernel's rules. This is what an agent may *propose* (an AccountingAction) and what the tutor compares a trainee's
// entry with; the figures always come from here, never from a model.
import { ACCOUNT, accountName } from './coa.mjs';
import { AcctError, r3, fine750Of, valueOf, vatOf, inventory, balanceOf, validateEntry, normalizeEntry } from './kernel.mjs';

export const ACTION_TYPES = {
  capital: 'آورده سرمایه',
  buy_melt: 'خرید طلای آبشده یا کهنه از مشتری',
  sell_jewelry: 'فروش مصنوعات به مشتری',
  buy_supplier: 'خرید مصنوعات از تأمین‌کننده',
  buy_coin: 'خرید سکه',
  sell_coin: 'فروش سکه',
  commission_paid: 'پرداخت کمیسیون به واسطه',
  commission_earned: 'حق‌العمل فروش امانی',
  return_sale: 'برگشت از فروش (مرجوعی)',
  exchange: 'تعویض کالا',
  prepayment: 'پیش‌دریافت از مشتری',
  settle_customer: 'تسویه مشتری',
  settle_supplier: 'تسویه تأمین‌کننده',
  cash_count: 'شمارش صندوق (کسری یا اضافه)',
  weight_count: 'شمارش وزن (مغایرت وزن)',
  assay: 'ری‌گیری (مغایرت عیار)',
  gold_deposit: 'طلای امانی مشتری (حساب وزنی)',
  expense: 'هزینه',
  reverse: 'سند معکوس (اصلاح)',
};

const PAY_ACCT = { cash: '1110', bank: '1120' };
const need = (cond, code, msg) => {
  if (!cond) throw new AcctError(code, msg);
};
const posInt = (v) => Number.isSafeInteger(v) && v > 0;
const money = (v) => Math.round(Number(v) || 0);

/** Money side of a payment: cash, bank, or on the party's account (credit). Returns lines. */
function payLines(method, amount, { party, receiving }) {
  if (!amount) return [];
  if (method === 'credit') {
    need(party, 'E_PARTY', 'خرید یا فروش نسیه طرف حساب می‌خواهد.');
    return [receiving ? { account: '1210', dr: amount, cr: 0, party } : { account: '2110', dr: 0, cr: amount, party }];
  }
  const acc = PAY_ACCT[method];
  need(acc, 'E_PAY', `روش پرداخت «${method}» شناخته نیست.`);
  return [receiving ? { account: acc, dr: amount, cr: 0 } : { account: acc, dr: 0, cr: amount }];
}
/** Several payments; whatever is not paid is left on the party's account. */
function payments(pays, total, { party, receiving }) {
  const list = Array.isArray(pays) ? pays : [{ method: pays ?? 'cash', amount: null }];
  const lines = [];
  let left = total;
  list.forEach((p, i) => {
    const amt = p.amount == null ? left : Math.min(left, money(p.amount));
    left -= amt;
    lines.push(...payLines(p.method, amt, { party, receiving }));
  });
  if (left > 0) lines.push(...payLines('credit', left, { party, receiving }));
  return lines;
}
const merge = (lines) => {
  // one line per account / side / party / weight dimension, so the entry reads like a ledger clerk would write it
  const m = new Map();
  for (const l of lines) {
    if (l.grams || l.qty || l.fine750) {
      m.set(Symbol(), l);
      continue;
    }
    const k = `${l.account}|${l.party ?? ''}`;
    const cur = m.get(k);
    if (!cur) m.set(k, { ...l });
    else {
      const net = cur.dr - cur.cr + l.dr - l.cr;
      cur.dr = net > 0 ? net : 0;
      cur.cr = net < 0 ? -net : 0;
    }
  }
  return [...m.values()].filter((l) => l.dr || l.cr);
};

/** Price of a piece of jewelry: gold value + making + profit (+ VAT on making and profit only). */
export function jewelryPrice({ grams, fineness, price750, making = 0, profitPct = 0, profit = null, discount = 0 }) {
  const gold = valueOf(grams, fineness, price750);
  const mk = money(making);
  const pr = profit != null ? money(profit) : Math.round(((gold + mk) * profitPct) / 100);
  const vat = vatOf(mk + pr);
  const disc = money(discount);
  return { fine750: fine750Of(grams, fineness), gold, making: mk, profit: pr, vat, discount: disc, total: gold + mk + pr + vat - disc };
}

/**
 * The entry of one operation. `book` gives the costs (moving average) and balances it depends on. Returns
 * { entry, calc } where calc holds the figures a trainee can be asked for.
 */
export function buildEntry(action, book) {
  const a = action ?? {};
  const date = a.date;
  const base = { date, kind: a.type, memo: a.memo ?? ACTION_TYPES[a.type] ?? '', ...(a.ref ? { ref: a.ref } : {}), ...(a.key ? { key: a.key } : {}) };
  const inv = inventory(book);
  let lines = [];
  let calc = {};
  switch (a.type) {
    case 'capital': {
      const amt = money(a.amount);
      need(amt > 0, 'E_AMOUNT', 'مبلغ سرمایه لازم است.');
      lines = [...payLines(a.pay ?? 'cash', amt, { receiving: true }), { account: '3100', dr: 0, cr: amt }];
      calc = { amount: amt };
      break;
    }
    case 'buy_melt': {
      need(a.grams > 0 && a.fineness > 0 && a.price750 > 0, 'E_INPUT', 'وزن، عیار و قیمت گرم ۷۵۰ لازم است.');
      const value = valueOf(a.grams, a.fineness, a.price750);
      lines = [{ account: '1310', dr: value, cr: 0, grams: a.grams, fineness: a.fineness, product: a.product ?? 'melt' }, ...payments(a.pay ?? 'cash', value, { party: a.party, receiving: false })];
      calc = { fine750: fine750Of(a.grams, a.fineness), value };
      break;
    }
    case 'buy_supplier': {
      need(a.grams > 0 && a.fineness > 0 && a.price750 > 0, 'E_INPUT', 'وزن، عیار و قیمت گرم ۷۵۰ لازم است.');
      const gold = valueOf(a.grams, a.fineness, a.price750);
      const cost = gold + money(a.making);
      lines = [{ account: '1320', dr: cost, cr: 0, grams: a.grams, fineness: a.fineness, product: a.product ?? 'jewelry' }, ...payments(a.pay ?? 'credit', cost, { party: a.party, receiving: false })];
      calc = { fine750: fine750Of(a.grams, a.fineness), gold, making: money(a.making), cost };
      break;
    }
    case 'sell_jewelry': {
      need(a.grams > 0 && a.fineness > 0 && a.price750 > 0, 'E_INPUT', 'وزن، عیار و قیمت گرم ۷۵۰ لازم است.');
      const p = jewelryPrice(a);
      const stock = inv['1320'];
      need(stock && stock.fine750 >= p.fine750, 'E_NEGATIVE', 'این مقدار مصنوعات در موجودی نیست.');
      const cost = Math.round(p.fine750 * stock.avg);
      const deposit = Math.min(money(a.prepaymentUsed), a.party ? balanceOf(book, '2120', a.party) : 0);
      const due = p.total - deposit;
      lines = [
        ...(deposit ? [{ account: '2120', dr: deposit, cr: 0, party: a.party }] : []),
        ...payments(a.pay ?? 'cash', due, { party: a.party, receiving: true }),
        ...(p.discount ? [{ account: '4190', dr: p.discount, cr: 0 }] : []),
        { account: '4110', dr: 0, cr: p.gold },
        ...(p.making ? [{ account: '4120', dr: 0, cr: p.making }] : []),
        ...(p.profit ? [{ account: '4130', dr: 0, cr: p.profit }] : []),
        ...(p.vat ? [{ account: '2130', dr: 0, cr: p.vat }] : []),
        { account: '5110', dr: cost, cr: 0 },
        { account: '1320', dr: 0, cr: cost, grams: a.grams, fineness: a.fineness, product: a.product ?? 'jewelry' },
      ];
      calc = { ...p, cost, deposit, due, margin: p.gold + p.making + p.profit - p.discount - cost };
      break;
    }
    case 'buy_coin': {
      need(posInt(a.qty) && a.unitPrice > 0, 'E_INPUT', 'تعداد و قیمت هر سکه لازم است.');
      const value = a.qty * money(a.unitPrice);
      lines = [{ account: '1330', dr: value, cr: 0, qty: a.qty, product: a.coin ?? 'emami' }, ...payments(a.pay ?? 'cash', value, { party: a.party, receiving: false })];
      calc = { value };
      break;
    }
    case 'sell_coin': {
      need(posInt(a.qty) && a.unitPrice > 0, 'E_INPUT', 'تعداد و قیمت هر سکه لازم است.');
      const stock = inv['1330'];
      need(stock && stock.qty >= a.qty, 'E_NEGATIVE', 'این تعداد سکه در موجودی نیست.');
      const value = a.qty * money(a.unitPrice);
      const cost = Math.round(a.qty * stock.avg);
      lines = [...payments(a.pay ?? 'cash', value, { party: a.party, receiving: true }), { account: '4110', dr: 0, cr: value }, { account: '5110', dr: cost, cr: 0 }, { account: '1330', dr: 0, cr: cost, qty: a.qty, product: a.coin ?? 'emami' }];
      calc = { value, cost, margin: value - cost };
      break;
    }
    case 'commission_paid': {
      const amt = money(a.amount);
      need(amt > 0, 'E_AMOUNT', 'مبلغ کمیسیون لازم است.');
      lines = [{ account: '6110', dr: amt, cr: 0 }, a.pay === 'later' ? { account: '2140', dr: 0, cr: amt } : { account: PAY_ACCT[a.pay ?? 'cash'], dr: 0, cr: amt }];
      calc = { amount: amt };
      break;
    }
    case 'commission_earned': {
      const amt = money(a.amount);
      need(amt > 0, 'E_AMOUNT', 'مبلغ حق‌العمل لازم است.');
      const vat = vatOf(amt);
      lines = [...payments(a.pay ?? 'cash', amt + vat, { party: a.party, receiving: true }), { account: '4140', dr: 0, cr: amt }, { account: '2130', dr: 0, cr: vat }];
      calc = { amount: amt, vat, total: amt + vat };
      break;
    }
    case 'return_sale': {
      const orig = book.entries.find((e) => e.id === a.ref);
      need(orig && orig.kind === 'sell_jewelry', 'E_REF', 'سند فروش مرجع پیدا نشد.');
      const get = (code) => orig.lines.filter((l) => l.account === code).reduce((s, l) => s + l.cr - l.dr, 0);
      const goods = get('4110') + get('4120') + get('4130') + get('4190');
      const vat = get('2130');
      const cogs = orig.lines.find((l) => l.account === '5110')?.dr ?? 0;
      const out = orig.lines.find((l) => l.account === '1320' && l.cr > 0);
      const refund = goods + vat;
      const party = orig.lines.find((l) => l.party)?.party ?? a.party;
      lines = [{ account: '4180', dr: goods, cr: 0 }, ...(vat ? [{ account: '2130', dr: vat, cr: 0 }] : []), ...payments(a.pay ?? 'cash', refund, { party, receiving: false }), { account: '1320', dr: cogs, cr: 0, grams: out.grams, fineness: out.fineness, product: out.product }, { account: '5110', dr: 0, cr: cogs }];
      calc = { goods, vat, refund, cost: cogs };
      break;
    }
    case 'exchange': {
      // the returned piece comes back at its original sale, the new piece is sold today; only the difference is paid
      const back = buildEntry({ ...a, type: 'return_sale', pay: 'cash' }, book);
      const sale = buildEntry({ ...a.next, type: 'sell_jewelry', date, party: a.party, pay: 'cash' }, book);
      const diff = sale.calc.total - back.calc.refund;
      const cashless = (ls) => ls.filter((l) => l.account !== '1110');
      lines = merge([...cashless(back.entry.lines), ...cashless(sale.entry.lines), ...(diff >= 0 ? payments(a.pay ?? 'cash', diff, { party: a.party, receiving: true }) : payments(a.pay ?? 'cash', -diff, { party: a.party, receiving: false }))]);
      calc = { refund: back.calc.refund, newTotal: sale.calc.total, difference: diff };
      break;
    }
    case 'prepayment': {
      const amt = money(a.amount);
      need(amt > 0 && a.party, 'E_INPUT', 'مبلغ و مشتری لازم است.');
      lines = [...payLines(a.pay ?? 'cash', amt, { receiving: true }), { account: '2120', dr: 0, cr: amt, party: a.party }];
      calc = { amount: amt };
      break;
    }
    case 'settle_customer': {
      const amt = money(a.amount);
      const owed = balanceOf(book, '1210', a.party);
      need(amt > 0 && a.party, 'E_INPUT', 'مبلغ و مشتری لازم است.');
      need(amt <= owed, 'E_SETTLE', `تسویه بیشتر از بدهی مشتری (${owed} ریال) است.`);
      lines = [...payLines(a.pay ?? 'cash', amt, { receiving: true }), { account: '1210', dr: 0, cr: amt, party: a.party }];
      calc = { amount: amt, before: owed, after: owed - amt };
      break;
    }
    case 'settle_supplier': {
      const amt = money(a.amount);
      const owed = balanceOf(book, '2110', a.party);
      need(amt > 0 && a.party, 'E_INPUT', 'مبلغ و تأمین‌کننده لازم است.');
      need(amt <= owed, 'E_SETTLE', `پرداخت بیشتر از بدهی ما به تأمین‌کننده (${owed} ریال) است.`);
      lines = [{ account: '2110', dr: amt, cr: 0, party: a.party }, ...payLines(a.pay ?? 'bank', amt, { receiving: false })];
      calc = { amount: amt, before: owed, after: owed - amt };
      break;
    }
    case 'cash_count': {
      const bookCash = balanceOf(book, '1110');
      const diff = money(a.counted) - bookCash;
      need(diff !== 0, 'E_NOOP', 'صندوق با دفتر می‌خواند؛ سندی لازم نیست.');
      lines = diff < 0 ? [{ account: '6120', dr: -diff, cr: 0 }, { account: '1110', dr: 0, cr: -diff }] : [{ account: '1110', dr: diff, cr: 0 }, { account: '4910', dr: 0, cr: diff }];
      calc = { book: bookCash, counted: money(a.counted), diff };
      break;
    }
    case 'weight_count': {
      const code = a.account ?? '1310';
      const x = inv[code];
      need(x && ACCOUNT[code]?.measure === 'weight', 'E_INPUT', 'حساب موجودی وزنی لازم است.');
      need(a.grams >= 0 && a.fineness > 0, 'E_INPUT', 'وزن شمارش‌شده و عیار لازم است.');
      const counted = fine750Of(a.grams, a.fineness);
      const diff = r3(counted - x.fine750);
      need(diff !== 0, 'E_NOOP', 'وزن شمارش با دفتر می‌خواند.');
      const value = Math.round(Math.abs(diff) * x.avg);
      const gramsDiff = r3((Math.abs(diff) * 750) / a.fineness);
      const inv1 = { account: code, grams: gramsDiff, fineness: a.fineness, fine750: Math.abs(diff), product: a.product ?? 'count' };
      lines = diff < 0 ? [{ account: '6130', dr: value, cr: 0 }, { ...inv1, dr: 0, cr: value }] : [{ ...inv1, dr: value, cr: 0 }, { account: '6130', dr: 0, cr: value }];
      calc = { book: x.fine750, counted, diff, value };
      break;
    }
    case 'assay': {
      // bought as `declared`, the assay found `actual`: the missing fine gold leaves the stock at its average cost
      const x = inv['1310'];
      need(x && a.grams > 0 && a.declared > a.actual && a.actual > 0, 'E_INPUT', 'وزن، عیار اعلامی و عیار ری‌گیری (کمتر) لازم است.');
      const diff = r3(fine750Of(a.grams, a.declared) - fine750Of(a.grams, a.actual));
      const value = Math.round(diff * x.avg);
      lines = [{ account: '6130', dr: value, cr: 0 }, { account: '1310', dr: 0, cr: value, fine750: diff, adjust: 'purity', product: a.product ?? 'melt' }];
      calc = { diff, value };
      break;
    }
    case 'gold_deposit': {
      need(a.grams > 0 && a.fineness > 0 && a.party, 'E_INPUT', 'وزن، عیار و مشتری لازم است.');
      const g = fine750Of(a.grams, a.fineness);
      lines = a.back ? [{ account: '2210', dr: g, cr: 0, party: a.party }, { account: '1350', dr: 0, cr: g }] : [{ account: '1350', dr: g, cr: 0 }, { account: '2210', dr: 0, cr: g, party: a.party }];
      calc = { fine750: g };
      break;
    }
    case 'expense': {
      const amt = money(a.amount);
      need(amt > 0, 'E_AMOUNT', 'مبلغ هزینه لازم است.');
      lines = [{ account: '6190', dr: amt, cr: 0 }, ...payLines(a.pay ?? 'cash', amt, { receiving: false })];
      calc = { amount: amt };
      break;
    }
    case 'reverse': {
      const orig = book.entries.find((e) => e.id === a.ref);
      need(orig, 'E_REF', 'سند مرجع پیدا نشد.');
      need(!book.entries.some((e) => e.kind === 'reverse' && e.ref === orig.id), 'E_TWICE', 'این سند قبلاً معکوس شده است.');
      lines = orig.lines.map((l) => ({ ...l, dr: l.cr, cr: l.dr }));
      calc = { of: orig.id };
      break;
    }
    default:
      throw new AcctError('E_ACTION', `عملیات «${a.type}» شناخته نیست.`);
  }
  const entry = normalizeEntry({ ...base, lines: merge(lines) });
  const v = validateEntry(entry, { book });
  if (!v.ok) throw new AcctError('E_INVALID', v.errors[0].msg, { errors: v.errors });
  return { entry, calc };
}

/** Daily closing: the checks of the end of the day and the entries the engine proposes for what it found. */
export function dailyClose(book, { date, cashCounted = null, counts = {} } = {}) {
  const issues = [];
  const proposals = [];
  const cash = balanceOf(book, '1110');
  if (cashCounted != null && money(cashCounted) !== cash) {
    issues.push({ code: 'CASH_DIFF', diff: money(cashCounted) - cash });
    proposals.push(buildEntry({ type: 'cash_count', date, counted: cashCounted }, book).entry);
  }
  for (const [code, c] of Object.entries(counts)) {
    const x = inventory(book)[code];
    if (!x) continue;
    if (ACCOUNT[code].measure === 'weight' && fine750Of(c.grams, c.fineness) !== x.fine750) {
      issues.push({ code: 'WEIGHT_DIFF', account: code, diff: r3(fine750Of(c.grams, c.fineness) - x.fine750) });
      proposals.push(buildEntry({ type: 'weight_count', date, account: code, grams: c.grams, fineness: c.fineness }, book).entry);
    }
  }
  const day = book.entries.filter((e) => e.date === date);
  return { date, entries: day.length, cash, issues, proposals, clean: !issues.length, accounts: [...new Set(day.flatMap((e) => e.lines.map((l) => accountName(l.account))))] };
}
