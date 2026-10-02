// API → view models for the management dashboard, and the few formatters it needs. Components only ever see the
// shapes declared in types.mjs; raw server fields stay here.
import * as B from '../books.mjs';
import { TRADE_COINS as COIN_TYPES, shownCoins } from '../coins.mjs';
import { FX_CODES, TRADE_KINDS } from '../trade.mjs';
import { T, G, unitName, prefs, jd } from '../bk.mjs';

/* ---------------- formatters ---------------- */
const faDigits = (s) => B.faNum(String(s)).replace(/,/g, '٬').replace(/\./g, '٫');
/** money in the shop's unit, grouped: «۱٬۲۵۰٬۰۰۰٬۰۰۰» */
export const money = (rial) => T(Math.round(rial));
/** compact money for secondary lines: «۳۱٫۹ میلیارد تومان» */
export function compact(rial) {
  const v = prefs.money === 'rial' ? rial : rial / 10;
  const a = Math.abs(v);
  const [n, u] = a >= 1e12 ? [a / 1e12, 'هزار میلیارد'] : a >= 1e9 ? [a / 1e9, 'میلیارد'] : a >= 1e6 ? [a / 1e6, 'میلیون'] : [a, ''];
  return `${v < 0 ? '−' : ''}${faDigits(n.toLocaleString('en-US', { maximumFractionDigits: n >= 100 || !u ? 0 : 1 }))}${u ? ` ${u}` : ''} ${unitName()}`;
}
export const grams = (g) => G(g);
export const pctText = (p) => (p == null || !Number.isFinite(p) ? '—' : `${faDigits(Math.abs(p).toFixed(1))}٪`);
export const hourLabel = (h) => faDigits(`${String(h).padStart(2, '0')}:۰۰`);
const WEEKDAY = new Intl.DateTimeFormat('fa-IR', { weekday: 'long', timeZone: 'UTC' });
export const dayLabel = (iso, short = false) => {
  const d = jd(iso);
  return short ? d.slice(5) : `${WEEKDAY.format(new Date(`${iso}T12:00:00Z`))} ${d}`;
};
export const weekday = (iso) => WEEKDAY.format(new Date(`${iso}T12:00:00Z`));

/* ---------------- adapters ---------------- */
const lineKind = (l) => `${l.priced ? (l.dir === 'in' ? 'خرید' : 'فروش') : l.dir === 'in' ? 'دریافت' : 'تحویل'} ${l.kind === 'coin' ? COIN_TYPES[l.coin]?.short ?? 'سکه' : l.kind === 'fx' ? FX_CODES[l.code] ?? 'ارز' : TRADE_KINDS[l.kind] ?? l.kind}`;
const lineQty = (l) => (l.kind === 'melt' || (l.kind === 'bar' && !l.count) ? `${G(l.weight)} گرم` : l.kind === 'bar' ? `${B.faNum(l.count)} شمش` : l.kind === 'fx' ? `${B.faNum(l.amt)} ${l.code}` : `${B.faNum(l.count)} عدد`);
const linePrice = (l) => (l.mazaneh ? money(l.mazaneh) : l.priced && l.kind === 'coin' && l.count ? money(l.value / l.count) : l.priced && l.kind === 'fx' && l.amt ? money(l.value / l.amt) : '—');

/** @returns {import('./types.mjs').RecentTrade} */
function recentRow(e) {
  const l = e.lines[0];
  const more = e.lines.length > 1 ? ` + ${B.faNum(e.lines.length - 1)}` : '';
  return {
    id: e.id,
    track: e.track,
    time: new Date(e.at).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tehran' }),
    kind: e.type === 'trade' ? (l ? `${lineKind(l)}${more}` : 'دریافت / پرداخت وجه') : B.DOC_TYPES[e.type]?.short ?? e.type,
    party: e.party?.label ?? (e.hawala ? `${e.hawala.fromName} ← ${e.hawala.toName}` : 'گذری'),
    qty: e.type === 'trade' && l ? lineQty(l) : '—',
    unitPrice: e.type === 'trade' && l ? linePrice(l) : '—',
    amount: Math.abs(e.net ?? 0) || e.payments.reduce((s, p) => s + p.value, 0),
    status: e.status === 'void' ? 'void' : e.type === 'trade' && e.lines.length && e.lines.every((x) => !x.priced) ? 'goods' : e.credit ? 'open' : 'settled',
  };
}

const SEG_COLOR = { gold: 'var(--gd-gold)', coin: 'var(--gd-info)', cash: 'var(--gd-violet)', recv: 'var(--gd-amber)', other: 'var(--gd-muted-2)' };
/** @returns {import('./types.mjs').AllocationSegment[]} */
const segments = (list) => {
  const total = list.reduce((s, x) => s + x.value, 0);
  return list.map((x) => ({ ...x, pct: total ? (x.value / total) * 100 : 0, color: SEG_COLOR[x.key] }));
};

/** @returns {import('./types.mjs').DashboardView} */
export function toView(api) {
  const k = api.kpi;
  const p750 = api.p750;
  return {
    day: api.day,
    range: api.range,
    price: { ...api.price, at: api.at },
    kpis: [
      { key: 'physical', title: 'موجودی طلای فیزیکی', value: grams(k.physical.grams), unit: 'گرم ۷۵۰', sub: `ارزش بازار: ${compact(k.physical.value)}`, extra: `آب‌شده ${grams(k.physical.meltGrams)} · ${B.faNum(k.physical.bars)} شمش`, change: k.physical.change, goodWhenUp: true, spark: k.physical.spark, href: '/books/vault', icon: 'bars' },
      { key: 'receivables', title: 'مطالبات مشتریان', value: money(k.receivables.amount), unit: unitName(), sub: `تعداد بدهکاران: ${B.faNum(k.receivables.debtors)} نفر`, extra: k.receivables.goods ? `به‌علاوه طلب جنسی ≈ ${compact(k.receivables.goods)}` : '', change: k.receivables.change, goodWhenUp: false, spark: k.receivables.spark, href: '/books/parties', icon: 'people' },
      { key: 'liabilities', title: 'بدهی‌ها و تعهدات', value: money(k.liabilities.amount), unit: unitName(), sub: `طرف حساب‌های طلبکار: ${B.faNum(k.liabilities.creditors)}`, extra: k.liabilities.goldGrams ? `به‌علاوه تعهد جنسی ${grams(k.liabilities.goldGrams)} گرم (≈ ${compact(k.liabilities.goods)})` : '', change: k.liabilities.change, goodWhenUp: false, spark: k.liabilities.spark, href: '/books/parties', icon: 'wallet' },
      { key: 'net', title: 'موقعیت خالص طلا', value: `${k.net.grams < 0 ? '−' : ''}${grams(Math.abs(k.net.grams))}`, unit: 'گرم ۷۵۰', sub: `ارزش معادل: ${compact(k.net.value)}`, extra: k.net.grams < 0 ? 'فروش باز: با بالا رفتن مظنه زیان می‌دهد' : 'با بالا رفتن مظنه سود می‌دهد', change: k.net.change, goodWhenUp: true, spark: k.net.spark, href: '/books/vault', icon: 'pie' },
    ],
    position: {
      mode: api.mode,
      p750,
      points: api.series.map((x) => ({ timestamp: x.t, label: api.mode === 'hour' ? hourLabel(Number(x.t)) : api.series.length <= 8 ? weekday(x.t) : jd(x.t).slice(5), physicalGold: x.physicalGold, goldReceivables: x.goldReceivables, goldLiabilities: x.goldLiabilities, netGoldPosition: x.netGoldPosition })),
    },
    aging: api.aging,
    allocation: { market: segments(api.allocation.market), book: segments(api.allocation.book), bookPartial: api.allocation.bookPartial, physical: api.allocation.physical },
    recent: api.recent.map(recentRow),
    cash: api.cash,
    inventory: [
      { key: 'melt', label: 'آب‌شده', qty: `${grams(api.inventory.meltG)} گرم`, value: Math.round(api.inventory.meltG * p750), icon: 'melt', href: '/books/vault' },
      { key: 'coin', label: 'سکه', qty: `${B.faNum(Object.values(api.inventory.coins).reduce((s, n) => s + n, 0))} عدد`, value: null, icon: 'coin', href: '/books/vault', detail: Object.entries(api.inventory.coins).filter(([, n]) => n).map(([c, n]) => `${COIN_TYPES[c]?.short} ${B.faNum(n)}`).join('، ') },
      { key: 'bar', label: 'شمش پلمپ', qty: `${B.faNum(api.inventory.bars)} عدد · ${grams(api.inventory.barG)} گرم`, value: Math.round(api.inventory.barG * p750), icon: 'bar', href: '/books/bars' },
      ...(api.inventory.madeG ? [{ key: 'made', label: 'مصنوعات', qty: `${grams(api.inventory.madeG)} گرم`, value: Math.round(api.inventory.madeG * p750), icon: 'ring', href: '/books/stock' }] : []),
      { key: 'custody', label: 'امانی (نزد ما)', qty: `${grams(api.inventory.custodyG)} گرم`, value: Math.round(api.inventory.custodyG * p750), icon: 'lock', href: '/books/parties' },
    ],
    alerts: api.alerts,
    calendar: api.calendar ?? { days: [], months: [], year: 0 },
  };
}
