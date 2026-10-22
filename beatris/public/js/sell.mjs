// میز فروش زنده (spec 0037): the seller's what-ifs, suggestions, comparison and the customer's view, as pure functions
// over the books engine. Nothing here prices anything by itself: every rial comes from books.mjs (calcLine/calcDoc),
// so the desk, the invoice and the customer's screen can never disagree. Inputs are the engine's (toman), results rial.
import * as B from './books.mjs';

/** Which groups go with which (a ring calls for earrings or a necklace…), for «مکمل». */
export const COMPLEMENT = {
  ring: ['ear', 'neck', 'wrist'],
  neck: ['ear', 'chain', 'wrist'],
  chain: ['neck', 'wrist'],
  wrist: ['ring', 'ear'],
  ear: ['neck', 'ring'],
  set: ['ring', 'wrist'],
  kids: ['kids'],
  misc: ['ring', 'ear'],
};
const groupOf = (tpl) => B.templateById(tpl)?.group ?? 'misc';
const r1000 = (toman) => Math.round(toman / 1000) * 1000;

/** A stock piece as a sale line at today's gram price (toman), exactly as the invoice editor builds it. */
export function lineFromItem(it, p750) {
  return { kind: 'jewel', itemId: it.id, code: it.code, tpl: it.tpl, title: it.title, weight: it.weight, fineness: it.fineness, p750, ojratMode: it.ojratMode, ojrat: it.ojrat, profitPct: it.profitPct, stones: it.stones || 0, discount: 0 };
}
/** What one piece costs today (rial), or null when it cannot be priced. */
export function priceOf(it, p750, { vatPct = 10 } = {}) {
  try {
    return B.calcLine(lineFromItem(it, p750), { vatPct }).total;
  } catch {
    return null;
  }
}

/** The sale document of a cart: the pieces out, the old gold in, the payments as they stand. */
export const docOf = (cart) => ({ type: 'sale', lines: [...cart.lines, ...(cart.tradeIns ?? []).map((t) => ({ ...t, kind: 'used', side: 'in' }))], payments: cart.payments ?? [] });
export function totals(cart, { vatPct = 10 } = {}) {
  return B.calcDoc(docOf(cart), { vatPct });
}

/* ---------------- what-ifs ---------------- */
// room for a discount on a jewel line: only profit and making charge (the gold itself is never discounted, 1405 rule),
// less what is already given
const room = (l, vatPct) => {
  try {
    const c = B.calcLine({ ...l, discount: 0 }, { vatPct });
    return { room: Math.max(0, c.spro + c.consfee - B.rnd(B.num(l.discount || 0) * 10)), vra: c.vra };
  } catch {
    return { room: 0, vra: 0 };
  }
};
const roomOf = (lines, vatPct) => lines.reduce((a, l) => a + (l.kind === 'jewel' ? room(l, vatPct).room : 0), 0);
/** Spread a pre-tax discount (rial) over the jewel lines in proportion to their room; null when it does not fit. */
function spread(lines, want, vatPct) {
  const rooms = lines.map((l) => (l.kind === 'jewel' ? room(l, vatPct).room : 0));
  const total = rooms.reduce((a, b) => a + b, 0);
  if (want <= 0) return lines.map((l) => ({ ...l }));
  if (want > total) return null;
  const give = rooms.map((r) => (r ? Math.min(r, Math.floor((want * r) / total / 10) * 10) : 0));
  let left = want - give.reduce((a, b) => a + b, 0);
  for (let i = 0; i < give.length && left > 0; i++) {
    const extra = Math.min(rooms[i] - give[i], left);
    give[i] += extra;
    left -= extra;
  }
  return lines.map((l, i) => (give[i] ? { ...l, discount: (B.rnd(B.num(l.discount || 0) * 10) + give[i]) / 10 } : { ...l }));
}
/** The discount that brings the cart's net down to `target` (rial): the exact rial when tax rounding allows it. */
function towards(cart, target, vatPct) {
  const net = (d) => totals({ ...cart, lines: spread(cart.lines, d, vatPct) }, { vatPct }).net;
  if (net(0) <= target) return { lines: cart.lines.map((l) => ({ ...l })), exact: true };
  const max = roomOf(cart.lines, vatPct);
  if (!max || net(max) > target) return null;
  let lo = 0, hi = max; // net(lo) > target >= net(hi)
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (net(mid) > target) lo = mid;
    else hi = mid;
  }
  // tax is rounded per line, so a few rials either side may land exactly on the figure
  for (let d = Math.max(0, hi - 12); d <= Math.min(max, hi + 12); d++) if (net(d) === target) return { lines: spread(cart.lines, d, vatPct), exact: true };
  return { lines: spread(cart.lines, hi, vatPct), exact: false };
}

export const SCENARIOS = [
  { id: 'disc3', label: '۳٪ تخفیف', discount: true },
  { id: 'ojratHalf', label: 'اجرت نصف', discount: true },
  { id: 'noProfit', label: 'بدون سود فروشنده', discount: true },
  { id: 'round', label: 'گرد به میلیون پایین', discount: true },
  { id: 'goldUp', label: 'اگر طلا ۱٪ گران شود', discount: false },
  { id: 'goldDown', label: 'اگر طلا ۱٪ ارزان شود', discount: false },
];

/**
 * Every what-if for this cart: the new net (rial), the difference, and whether the seller may apply it. A scenario
 * never changes the cart; `lines` is what «اعمال» puts in its place.
 */
export function scenarios(cart, { vatPct = 10, canDiscount = true } = {}) {
  if (!cart.lines.length) return [];
  const base = totals(cart, { vatPct });
  const jewels = cart.lines.filter((l) => l.kind === 'jewel');
  const out = [];
  const add = (s, lines, note = '') => {
    if (!lines) return out.push({ ...s, possible: false, note: note || 'از اجرت و سود این سبد بیشتر است؛ ارزش طلا تخفیف نمی‌خورد.' });
    try {
      const t = totals({ ...cart, lines }, { vatPct });
      out.push({ ...s, possible: true, lines, net: t.net, sales: t.sales, vat: t.vat, delta: t.net - base.net, needsManager: s.discount && !canDiscount, note });
    } catch (e) {
      out.push({ ...s, possible: false, note: e.message });
    }
  };
  for (const s of SCENARIOS) {
    if (s.discount && !jewels.length) continue;
    if (s.id === 'disc3') add(s, spread(cart.lines, Math.round((base.sales * 0.03) / (1 + (room(jewels[0], vatPct).vra || 0) / 100) / 10) * 10, vatPct));
    else if (s.id === 'ojratHalf') add(s, cart.lines.map((l) => (l.kind === 'jewel' ? { ...l, ojrat: B.num(l.ojrat || 0) / 2 } : { ...l })));
    else if (s.id === 'noProfit') add(s, cart.lines.map((l) => (l.kind === 'jewel' ? { ...l, profitPct: 0, discount: 0 } : { ...l })));
    else if (s.id === 'round') {
      const target = Math.floor(base.net / 1e6) * 1e6;
      if (target <= 0 || target === base.net) continue;
      const r = towards(cart, target, vatPct);
      add(s, r?.lines, r && !r.exact ? 'نزدیک‌ترین رقم ممکن به میلیون پایین.' : '');
    } else if (s.id === 'goldUp' || s.id === 'goldDown') {
      const f = s.id === 'goldUp' ? 1.01 : 0.99;
      const move = (l) => (l.p750 != null ? { ...l, p750: r1000(B.num(l.p750) * f) } : { ...l });
      const lines = cart.lines.map(move);
      const tradeIns = (cart.tradeIns ?? []).map(move);
      try {
        const t = totals({ ...cart, lines, tradeIns }, { vatPct });
        out.push({ ...s, possible: true, lines, tradeIns, net: t.net, sales: t.sales, vat: t.vat, delta: t.net - base.net, info: true, note: 'فقط برای گفت‌وگو با مشتری؛ قیمت سند همان قیمت روز است.' });
      } catch (e) {
        out.push({ ...s, possible: false, note: e.message });
      }
    }
  }
  return out;
}
/** «بودجه‌ی مشتری»: the discount that meets a budget (rial), or how far it is out of reach. */
export function budget(cart, target, { vatPct = 10, canDiscount = true } = {}) {
  const base = totals(cart, { vatPct });
  if (!(target > 0)) return null;
  if (target >= base.net) return { possible: true, net: base.net, delta: 0, lines: cart.lines.map((l) => ({ ...l })), note: 'سبد همین حالا در بودجه است.' };
  const r = towards(cart, target, vatPct);
  if (!r) {
    const floor = totals({ ...cart, lines: spread(cart.lines, roomOf(cart.lines, vatPct), vatPct) ?? cart.lines }, { vatPct }).net;
    return { possible: false, floor, gap: floor - target, note: 'با تخفیف به این بودجه نمی‌رسد؛ قطعه‌ی سبک‌تر پیشنهاد می‌شود.' };
  }
  const t = totals({ ...cart, lines: r.lines }, { vatPct });
  return { possible: true, exact: r.exact, lines: r.lines, net: t.net, delta: t.net - base.net, needsManager: !canDiscount };
}

/* ---------------- suggestions ---------------- */
/**
 * «مکمل» from the groups that go with what is in the cart, «جایگزین» from the same template within ±25% of its weight.
 * Only pieces in stock and not already in the cart; the customer's favourite groups come first.
 */
export function suggest(stock, cartLines, { p750, vatPct = 10, favorites = [], limit = 4, maxPrice = null } = {}) {
  const inCart = new Set(cartLines.map((l) => l.itemId).filter(Boolean));
  const pool = stock.filter((it) => it.status === 'stock' && !inCart.has(it.id)).map((it) => ({ it, price: priceOf(it, p750, { vatPct }), group: groupOf(it.tpl) })).filter((x) => x.price != null && (maxPrice == null || x.price <= maxPrice));
  const picked = cartLines.filter((l) => l.kind === 'jewel' && l.itemId);
  const fav = (g) => (favorites.includes(g) ? 1 : 0);
  const groups = new Set(picked.map((l) => groupOf(l.tpl)));
  const want = new Set([...groups].flatMap((g) => COMPLEMENT[g] ?? []).filter((g) => !groups.has(g) || g === 'kids'));
  const refPrice = picked.length ? picked.reduce((a, l) => a + (priceOf({ ...l, ojratMode: l.ojratMode, id: l.itemId }, p750, { vatPct }) ?? 0), 0) / picked.length : null;
  const complement = pool
    .filter((x) => want.has(x.group))
    .sort((a, b) => fav(b.group) - fav(a.group) || (refPrice ? Math.abs(a.price - refPrice * 0.6) - Math.abs(b.price - refPrice * 0.6) : a.price - b.price))
    .slice(0, limit)
    .map((x) => ({ item: x.it, price: x.price, reason: `${B.TEMPLATE_GROUPS.find((g) => g.id === x.group)?.label ?? ''} برای همراهی` }));
  const last = picked[picked.length - 1];
  const alternative = last
    ? pool
        .filter((x) => x.it.tpl === last.tpl && Math.abs(x.it.weight - last.weight) <= last.weight * 0.25)
        .sort((a, b) => Math.abs(a.it.weight - last.weight) - Math.abs(b.it.weight - last.weight))
        .slice(0, limit)
        .map((x) => ({ item: x.it, price: x.price, reason: x.it.weight < last.weight ? 'سبک‌تر، ارزان‌تر' : x.it.weight > last.weight ? 'پرتر' : 'هم‌وزن' }))
    : [];
  return { complement, alternative };
}

/* ---------------- side by side ---------------- */
/** Up to four pieces, the same columns, and how far each is from the cheapest (rial). */
export function compare(items, p750, { vatPct = 10 } = {}) {
  const rows = items.slice(0, 4).map((it) => {
    const c = B.calcLine(lineFromItem(it, p750), { vatPct });
    return { item: it, weight: c.weight, fineness: c.fineness, gold: c.principal, making: c.consfee + c.spro + c.bros, stones: c.stones, vat: c.vat, total: c.total, perGram: c.weight ? Math.round(c.total / c.weight) : 0 };
  });
  const min = Math.min(...rows.map((r) => r.total));
  return rows.map((r) => ({ ...r, overMin: r.total - min }));
}

/* ---------------- the customer's screen ---------------- */
/**
 * What the customer may see: each piece's gold value, «اجرت و سود» as one figure, tax, the old gold taken in, what is
 * paid and what is left. Never the seller's profit apart, the room for a discount or a what-if.
 */
export function customerView(cart, calc, { shop = '' } = {}) {
  const outLines = calc.lines.filter((l) => l.side === 'out');
  const inLines = calc.lines.filter((l) => l.side === 'in');
  const titles = cart.lines.map((l) => l.title);
  const paid = calc.paidIn - calc.paidOut;
  return {
    shop,
    lines: outLines.map((l, i) => ({ title: titles[i] ?? B.KIND_LABEL[l.kind], weight: l.weight || null, fineness: l.fineness || null, gold: l.principal, making: l.consfee + l.spro + l.bros, stones: l.stones, discount: l.discount, vat: l.vat, total: l.total })),
    tradeIns: inLines.map((l, i) => ({ title: (cart.tradeIns ?? [])[i]?.title ?? 'طلای کهنه', weight: l.weight, value: l.total })),
    sales: calc.sales,
    tradeIn: calc.tradeIn,
    net: calc.net,
    paid,
    left: calc.net - paid,
  };
}

/** A plain text the seller sends in one tap (WhatsApp, Telegram, SMS): the pieces, the total, and the tracking code. */
export function shareText(doc, view, { shop = '', money = (r) => String(r) } = {}) {
  const rows = view.lines.map((l) => `• ${l.title}${l.weight ? ` — ${B.fmtG(l.weight)} گرم` : ''}: ${money(l.total)}`);
  const tin = view.tradeIns.map((t) => `• معاوضه ${t.title} — ${B.fmtG(t.weight)} گرم: −${money(t.value)}`);
  return [shop && `${shop}`, doc?.track ? `فاکتور ${doc.track}` : 'پیش‌فاکتور', ...rows, ...tin, `جمع: ${money(view.net)}`, view.left > 0 ? `مانده: ${money(view.left)}` : 'تسویه شد ✓', doc?.verify ? `کد اصالت: ${doc.verify}` : ''].filter(Boolean).join('\n');
}
