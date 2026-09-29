// Model Context Protocol endpoint (/mcp): lets an AI assistant — Claude or any MCP client — use the shop's
// gold arithmetic, market desk and fraud calculator. Streamable HTTP transport answered with plain JSON (no
// server-initiated stream), stateless, protocol versions 2025-06-18 / 2025-03-26 / 2024-11-05. Access needs a
// bearer token the owner creates in the app (stored hashed). No staff, customer or login data is reachable.
import { backtest } from '../public/js/backtest.mjs';
import { knowledge } from './rag.mjs';
import { createHash, timingSafeEqual, randomBytes } from 'node:crypto';
import { invoice, buyback, MAZANEH_TO_G750, MESGHAL_G } from '../public/js/calc.mjs';
import * as MELT from '../public/js/melt.mjs';
import * as TA from '../public/js/ta.mjs';
import { SYMBOLS, SYMBOL, isSymbol, roundQuote } from '../public/js/market.mjs';
import { COIN_TYPES, COIN_TESTS, SEAL_TESTS, binaryPosterior, decide } from '../public/js/coins.mjs';

export const MCP_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const SERVER = { name: 'beatris', title: 'Beatris — میز طلافروشی', version: '2.1.0' };
const INSTRUCTIONS =
  'Beatris is an Iranian gold shop desk. Prices are in toman (the world ounce in US dollars). mazaneh = toman per mesghal (4.6083 g) of 705 gold; gram-18 = mazaneh ÷ 4.3318. The market data may be labelled sample (synthetic, for training) — say so when you use it. Analyses are educational, not investment advice.';

/* ---------------- tokens ---------------- */
export const hashToken = (t) => createHash('sha256').update(String(t)).digest('hex');
export const newToken = () => `btr_${randomBytes(32).toString('base64url')}`;
export function tokenMatches(given, hash) {
  if (!given || !hash) return false;
  const a = Buffer.from(hashToken(given), 'hex'), b = Buffer.from(String(hash), 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

/* ---------------- a small JSON-schema check for tool arguments ---------------- */
function check(schema, v, path = 'arguments') {
  if (schema.type === 'object') {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return `${path} must be an object`;
    for (const k of schema.required ?? []) if (!Object.hasOwn(v, k)) return `${path}.${k} is required`;
    for (const k of Object.keys(v)) {
      if (!Object.hasOwn(schema.properties ?? {}, k)) return `${path}.${k} is not a known argument`;
      const e = check(schema.properties[k], v[k], `${path}.${k}`);
      if (e) return e;
    }
    return null;
  }
  if (schema.type === 'array') {
    if (!Array.isArray(v)) return `${path} must be an array`;
    if (schema.maxItems != null && v.length > schema.maxItems) return `${path} has more than ${schema.maxItems} items`;
    if (schema.minItems != null && v.length < schema.minItems) return `${path} needs at least ${schema.minItems} items`;
    for (let i = 0; i < v.length; i++) {
      const e = check(schema.items, v[i], `${path}[${i}]`);
      if (e) return e;
    }
    return null;
  }
  if (schema.enum && !schema.enum.includes(v)) return `${path} must be one of ${schema.enum.join(', ')}`;
  if (schema.type === 'number' || schema.type === 'integer') {
    if (typeof v !== 'number' || !Number.isFinite(v) || (schema.type === 'integer' && !Number.isInteger(v))) return `${path} must be a ${schema.type}`;
    if (schema.minimum != null && v < schema.minimum) return `${path} must be ≥ ${schema.minimum}`;
    if (schema.maximum != null && v > schema.maximum) return `${path} must be ≤ ${schema.maximum}`;
    if (schema.exclusiveMinimum != null && v <= schema.exclusiveMinimum) return `${path} must be > ${schema.exclusiveMinimum}`;
  }
  if (schema.type === 'string') {
    if (typeof v !== 'string') return `${path} must be a string`;
    if (schema.pattern && !new RegExp(schema.pattern).test(v)) return `${path} has the wrong format`;
    if (schema.maxLength != null && v.length > schema.maxLength) return `${path} is too long`;
  }
  if (schema.type === 'boolean' && typeof v !== 'boolean') return `${path} must be true or false`;
  return null;
}

/* ---------------- tools ---------------- */
const num = (description, extra = {}) => ({ type: 'number', description, ...extra });
const r2 = (x) => Math.round(x * 100) / 100;
const COINS5 = ['sekee', 'sekeb', 'nim', 'rob', 'gerami'];
const TESTS = { ...Object.fromEntries(Object.entries(COIN_TESTS).map(([k, t]) => [`coin.${k}`, t])), ...Object.fromEntries(Object.entries(SEAL_TESTS).map(([k, t]) => [`seal.${k}`, t])) };

function toolset({ market, pricing, courses }) {
  const latest = (id) => {
    const b = market.board();
    const it = b.items.find((x) => x.id === id);
    return it && !it.empty ? { price: it.c, day: it.d, sample: b.sample, source: b.source.label } : null;
  };
  const series = (id, from) => market.series([id], from).series[id].map(([d, o, h, l, c]) => ({ d, o, h, l, c }));
  const mazanehOr = (given) => {
    if (given) return { mazaneh: given, source: 'given' };
    const m = latest('mesghal');
    if (!m) throw new Error('No mazaneh given and the market has no mazaneh price yet.');
    return { mazaneh: m.price, source: m.sample ? 'sample market data (synthetic)' : `market ${m.day} (${m.source})`, day: m.day };
  };
  return [
    {
      name: 'search_knowledge',
      title: 'جستجو در راهنما و آموزش',
      description: 'Search the built-in knowledge of the app (lessons, SOPs, glossary, video-guide steps) with Persian-aware BM25. Returns titles, app links and the most relevant sentence. Use it before answering how-to or terminology questions.',
      inputSchema: { type: 'object', properties: { q: { type: 'string', description: 'the question or keywords (Persian or English)', maxLength: 200 }, k: num('how many results (1-10)', { minimum: 1, maximum: 10 }) }, required: ['q'] },
      annotations: { readOnlyHint: true },
      run: ({ q, k }) => ({ results: knowledge().search(q, k ?? 5) }),
    },
    {
      name: 'strategy_backtest',
      title: 'بک‌تست راهبرد روی سابقه روزانه',
      description: 'Backtest a long-only strategy on the stored daily history of a symbol: sma (fast/slow crossover) or rsi (buy below lo, sell above hi). Signals on a close execute at the next open; the fee is paid on entry and exit. Returns total return vs holding, max drawdown, trades and win rate (fractions). Educational, not advice.',
      inputSchema: { type: 'object', properties: { symbol: { type: 'string', enum: SYMBOLS.map((s) => s.id) }, strategy: { type: 'string', enum: ['sma', 'rsi'] }, fast: num('sma fast period', { minimum: 1, maximum: 200 }), slow: num('sma slow period', { minimum: 2, maximum: 400 }), n: num('rsi period', { minimum: 2, maximum: 100 }), lo: num('rsi buy level', { minimum: 1, maximum: 99 }), hi: num('rsi sell level', { minimum: 1, maximum: 99 }), fee: num('fee per side as a fraction (0.002 = 0.2%)', { minimum: 0, maximum: 0.05 }) }, required: ['symbol', 'strategy'] },
      annotations: { readOnlyHint: true },
      run: ({ symbol, strategy, ...p }) => {
        const r = backtest(series(symbol), { strategy, ...p });
        return { symbol, ...r, equity: undefined, list: r.list.slice(-10) };
      },
    },
    {
      name: 'gold_value',
      title: 'ارزش طلای آب‌شده به قاعده دفتر',
      description: 'Value of a piece of melted/raw gold by the Iranian ledger rule: 750-equivalent = weight × fineness ÷ 750 rounded to 3 decimals, priced at gram-18 = mazaneh ÷ 4.3318, rounded to 1,000 toman. Omit mazaneh to use the latest market mazaneh.',
      inputSchema: { type: 'object', properties: { weight: num('weight in grams', { exclusiveMinimum: 0, maximum: 1e6 }), fineness: num('fineness per mille, e.g. 740', { minimum: 1, maximum: 1000 }), mazaneh: num('toman per mesghal of 705 gold (optional)', { exclusiveMinimum: 0 }) }, required: ['weight', 'fineness'] },
      annotations: { readOnlyHint: true },
      run: ({ weight, fineness, mazaneh }) => {
        const m = mazanehOr(mazaneh);
        return { weight, fineness, ...m, gram18: Math.round(MELT.gram18(m.mazaneh)), eq750: MELT.r3(MELT.eq750(weight, fineness)), pureGold: MELT.r3(MELT.pureOf(weight, fineness)), mesghal: MELT.r3(MELT.mesghalOf(weight)), value: MELT.ledgerValue(weight, fineness, m.mazaneh) };
      },
    },
    {
      name: 'melt_trade',
      title: 'سطر دفتر خرید یا فروش آب‌شده',
      description: 'One melted-gold trade as the shop books it: the 750-equivalent, the amount, and the change of the gold column (grams of 750) and the cash column (toman). buy = the shop buys from the customer.',
      inputSchema: { type: 'object', properties: { side: { type: 'string', enum: ['buy', 'sell'] }, weight: num('grams', { exclusiveMinimum: 0, maximum: 1e6 }), fineness: num('assayed fineness per mille', { minimum: 1, maximum: 1000 }), mazaneh: num('the buy or sell mazaneh in toman (optional: latest market mazaneh)', { exclusiveMinimum: 0 }) }, required: ['side', 'weight', 'fineness'] },
      annotations: { readOnlyHint: true },
      run: ({ side, weight, fineness, mazaneh }) => {
        const m = mazanehOr(mazaneh);
        const eq = MELT.r3(MELT.eq750(weight, fineness)), value = MELT.ledgerValue(weight, fineness, m.mazaneh);
        return { side, weight, fineness, ...m, eq750: eq, value, goldDelta750: side === 'buy' ? eq : -eq, cashDelta: side === 'buy' ? -value : value };
      },
    },
    {
      name: 'jewelry_invoice',
      title: 'فاکتور طلای ساخته‌شده',
      description: 'Invoice of finished jewellery: gold value + making charge (ojrat) + seller profit + VAT charged only on ojrat and profit (Iran 1405: 10 %). Defaults come from the shop settings.',
      inputSchema: { type: 'object', properties: { weight: num('grams', { exclusiveMinimum: 0, maximum: 1e5 }), fineness: num('fineness per mille (default 750)', { minimum: 1, maximum: 1000 }), p750: num('toman per gram of 750 (default: shop price)', { exclusiveMinimum: 0 }), ojrat: num('making charge: percent of gold value, toman per gram, or a fixed toman amount', { minimum: 0 }), ojratMode: { type: 'string', enum: ['percent', 'perGram', 'fixed'] }, profitPct: num('seller profit % (default: shop setting)', { minimum: 0, maximum: 100 }), vatPct: num('VAT % on ojrat + profit (default: shop setting)', { minimum: 0, maximum: 100 }) }, required: ['weight'] },
      annotations: { readOnlyHint: true },
      run: (a) => {
        const p = pricing();
        const inv = invoice({ weight: a.weight, fineness: a.fineness ?? 750, p750: a.p750 ?? p.p750, ojratMode: a.ojratMode ?? 'percent', ojrat: a.ojrat ?? 0, profitPct: a.profitPct ?? p.profitPct, vatPct: a.vatPct ?? p.vatPct });
        return { p750: a.p750 ?? p.p750, priceNote: a.p750 ? 'given' : p.priceNote, ...Object.fromEntries(Object.entries(inv).map(([k, v]) => [k, Math.round(v)])) };
      },
    },
    {
      name: 'buyback_quote',
      title: 'قیمت خرید طلای مستعمل',
      description: 'What the shop pays for used gold: net weight × price at the tested fineness, minus the declared deduction. No VAT.',
      inputSchema: { type: 'object', properties: { weight: num('grams', { exclusiveMinimum: 0, maximum: 1e5 }), testedFineness: num('tested fineness per mille', { minimum: 1, maximum: 1000 }), nonGoldWeight: num('grams of stones or non-gold parts', { minimum: 0 }), p750: num('toman per gram of 750 (default: shop price)', { exclusiveMinimum: 0 }), deductPct: num('deduction % (default: shop setting)', { minimum: 0, maximum: 50 }) }, required: ['weight', 'testedFineness'] },
      annotations: { readOnlyHint: true },
      run: (a) => {
        const p = pricing();
        const r = buyback({ weight: a.weight, testedFineness: a.testedFineness, nonGoldWeight: a.nonGoldWeight ?? 0, p750: a.p750 ?? p.p750, deductPct: a.deductPct ?? p.buybackDeductPct });
        return { p750: a.p750 ?? p.p750, ...Object.fromEntries(Object.entries(r).map(([k, v]) => [k, k === 'netWeight' ? r2(v) : Math.round(v)])) };
      },
    },
    {
      name: 'coin_value',
      title: 'ارزش طلای سکه و حباب',
      description: 'Gold value of an Iranian coin at the world price (ounce × free-market dollar ÷ 31.1035) and at the domestic mazaneh, and the bubble of its market price. Inputs default to the latest market prices.',
      inputSchema: { type: 'object', properties: { coin: { type: 'string', enum: COINS5, description: 'sekee = full Emami, sekeb = full Bahar Azadi, nim = half, rob = quarter, gerami = gram coin' }, price: num('market price of the coin in toman (optional)', { exclusiveMinimum: 0 }), ounce: num('world gold price, USD per troy ounce (optional)', { exclusiveMinimum: 0 }), usd: num('free-market dollar in toman (optional)', { exclusiveMinimum: 0 }) }, required: ['coin'] },
      annotations: { readOnlyHint: true },
      run: ({ coin, price, ounce, usd }) => {
        const pure = TA.COIN_PURE_G[coin];
        const o = ounce ?? latest('ons')?.price, u = usd ?? latest('usd')?.price, p = price ?? latest(coin)?.price, maz = latest('mesghal')?.price;
        if (!o || !u) throw new Error('Ounce and dollar prices are needed (give them or enter them in the market desk).');
        const world = TA.coinIntrinsic(pure, o, u);
        return { coin, label: SYMBOL[coin].label, pureGoldGrams: Math.round(pure * 1e4) / 1e4, ounce: o, usd: u, worldValue: Math.round(world), domesticValue: maz ? Math.round(TA.coinDomestic(pure, maz)) : null, price: p ?? null, bubblePct: p ? r2(TA.bubble(p, world) * 100) : null, impliedUsd: p ? Math.round(TA.impliedUsdCoin(p, o, pure)) : null, sample: !!market.board().sample };
      },
    },
    {
      name: 'market_board',
      title: 'تابلوی قیمت‌ها',
      description: 'Latest price and daily change of mazaneh, 18k and 24k gram, the five coins, the free-market dollar and the world ounce. sample = true means synthetic training data.',
      inputSchema: { type: 'object', properties: {} },
      annotations: { readOnlyHint: true },
      run: () => {
        const b = market.board();
        return { sample: b.sample, source: b.source.label, today: b.today, prices: b.items.filter((x) => !x.empty).map((x) => ({ symbol: x.id, name: SYMBOL[x.id].label, unit: SYMBOL[x.id].unit, day: x.d, close: x.c, high: x.h, low: x.l, changePct: x.pct == null ? null : r2(x.pct) })) };
      },
    },
    {
      name: 'market_analysis',
      title: 'تحلیل تکنیکال و سطح‌های جلسه بعد',
      description: 'Technical reading of one symbol from daily bars: trend (EMA 20/50 + Supertrend), momentum (RSI 14, MACD), volatility (ATR), classic pivots, Bollinger bands, nearest swing support/resistance, patient bid/ask prices, and the best Elliott-wave count that keeps all hard rules. Educational, not advice.',
      inputSchema: { type: 'object', properties: { symbol: { type: 'string', enum: SYMBOLS.map((s) => s.id) } }, required: ['symbol'] },
      annotations: { readOnlyHint: true },
      run: ({ symbol }) => {
        const bars = series(symbol, new Date(Date.now() - 700 * 86400000).toISOString().slice(0, 10));
        const r = TA.marketRead(bars);
        if (!r) throw new Error('At least 60 daily prices are needed for this symbol.');
        const q = (v) => roundQuote(symbol, v);
        const zz = TA.zigzag(bars, TA.swingPct(bars));
        const best = TA.elliott(zz).find((c) => c.valid && c.score >= 40);
        return {
          symbol, day: r.d, close: r.close, sample: !!market.board().sample,
          trend: r.trend, trendStrengthAdx: r2(r.adx), momentum: r.momentum, rsi14: r2(r.rsi), volatility: r.vol, atr: q(r.atr), atrPct: r2(r.atrPct),
          pivots: Object.fromEntries(Object.entries(r.pivots).map(([k, v]) => [k, q(v)])), bollinger: { upper: q(r.bands.upper), middle: q(r.bands.mid), lower: q(r.bands.lower) },
          support: r.support.map(q), resistance: r.resist.map(q), patientBid: q(r.bid), patientAsk: q(r.ask), nextSessionRange: [q(r.range.lo), q(r.range.hi)],
          elliott: best ? { pattern: best.kind, up: best.up, score: best.score, points: best.points.map((p) => ({ label: p.label, day: p.d, price: q(p.price) })), next: best.next, targets: best.targets.map((t) => ({ label: t.label, price: q(t.price) })), invalidation: q(best.invalid) } : null,
        };
      },
    },
    {
      name: 'market_history',
      title: 'سابقه روزانه قیمت',
      description: 'Daily open/high/low/close of one symbol, oldest first (at most 500 days).',
      inputSchema: { type: 'object', properties: { symbol: { type: 'string', enum: SYMBOLS.map((s) => s.id) }, from: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'YYYY-MM-DD (Gregorian)' }, limit: { type: 'integer', minimum: 1, maximum: 500 } }, required: ['symbol'] },
      annotations: { readOnlyHint: true },
      run: ({ symbol, from, limit = 120 }) => {
        const bars = series(symbol, from).slice(-limit);
        return { symbol, unit: SYMBOL[symbol].unit, sample: !!market.board().sample, bars };
      },
    },
    {
      name: 'fraud_probability',
      title: 'احتمال تقلب سکه یا پلمپ (بیز)',
      description: `Probability that a coin or sealed pack is fraudulent after bench tests, by Bayes with independent tests: start from a base rate, update with each test result using its sensitivity and false-alarm rate. Known tests: ${Object.keys(TESTS).join(', ')}; or give sens and fp for any other test.`,
      inputSchema: { type: 'object', properties: { baseRate: num('prior probability of fraud, 0–1 (e.g. 0.05)', { minimum: 0, maximum: 1 }), tests: { type: 'array', minItems: 1, maxItems: 20, items: { type: 'object', properties: { test: { type: 'string', maxLength: 60 }, flagged: { type: 'boolean' }, sens: num('P(flag | fraud)', { minimum: 0, maximum: 1 }), fp: num('P(flag | genuine)', { minimum: 0, maximum: 1 }) }, required: ['flagged'] } } }, required: ['baseRate', 'tests'] },
      annotations: { readOnlyHint: true },
      run: ({ baseRate, tests }) => {
        let p = baseRate;
        const steps = tests.map((t) => {
          const known = t.test && Object.hasOwn(TESTS, t.test) ? TESTS[t.test] : null;
          const sens = t.sens ?? known?.sens, fp = t.fp ?? known?.fp;
          if (sens == null || fp == null) throw new Error(`Unknown test "${t.test ?? ''}": give sens and fp.`);
          p = binaryPosterior(p, sens, fp, t.flagged);
          return { test: t.test ?? 'custom', label: known?.label ?? null, flagged: t.flagged, sens, fp, pFraud: Math.round(p * 1e6) / 1e6 };
        });
        const d = decide(p);
        return { baseRate, steps, pFraud: Math.round(p * 1e6) / 1e6, decision: d.key, decisionText: `${d.label}: ${d.note}`, note: 'Rates are training assumptions, not official statistics.' };
      },
    },
    {
      name: 'coin_specs',
      title: 'مشخصات سکه‌های ایران',
      description: 'Official weight and fineness and approximate diameter of the Iranian gold coins (full, half and quarter in the old and new design, the gram coin and Parsian).',
      inputSchema: { type: 'object', properties: {} },
      annotations: { readOnlyHint: true },
      run: () => ({ coins: Object.entries(COIN_TYPES).map(([id, c]) => ({ id, name: c.label, years: c.years, weightGrams: c.weight, fineness: c.fineness, pureGoldGrams: Math.round(c.weight * c.fineness) / 1000, diameterMm: c.diameter, legalTender: !!c.legal })), constants: { mesghalGrams: MESGHAL_G, mazanehToGram18: Math.round(MAZANEH_TO_G750 * 1e6) / 1e6, troyOunceGrams: TA.TROY_OUNCE_G } }),
    },
    {
      name: 'course_catalog',
      title: 'فهرست دوره‌های آموزشی',
      description: 'The staff training courses of the app with their lessons (titles only).',
      inputSchema: { type: 'object', properties: {} },
      annotations: { readOnlyHint: true },
      run: () => ({ courses: courses.map((c) => ({ id: c.id, title: c.title, summary: c.summary, level: c.level, lessons: c.lessons.map((l) => ({ id: l.id, title: l.title, minutes: l.minutes })) })) }),
    },
  ];
}

/** JSON-RPC over HTTP. Returns { status, body } for index.mjs to send. */
export function createMcp(ctx) {
  const tools = toolset(ctx);
  const byName = new Map(tools.map((t) => [t.name, t]));
  const ok = (id, result) => ({ jsonrpc: '2.0', id, result });
  const fail = (id, code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
  async function one(msg) {
    if (msg && typeof msg === 'object' && !('method' in msg) && ('result' in msg || 'error' in msg)) return null; // a reply to us; we never ask anything
    if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return fail(msg?.id, -32600, 'Invalid Request');
    const note = !('id' in msg);
    const { id, method, params = {} } = msg;
    switch (method) {
      case 'initialize': {
        const v = MCP_VERSIONS.includes(params?.protocolVersion) ? params.protocolVersion : MCP_VERSIONS[0];
        return ok(id, { protocolVersion: v, capabilities: { tools: { listChanged: false } }, serverInfo: SERVER, instructions: INSTRUCTIONS });
      }
      case 'ping':
        return note ? null : ok(id, {});
      case 'tools/list':
        return ok(id, { tools: tools.map(({ run, ...t }) => t) });
      case 'tools/call': {
        const t = typeof params?.name === 'string' ? byName.get(params.name) : null;
        if (!t) return fail(id, -32602, `Unknown tool: ${params?.name}`);
        const args = params.arguments ?? {};
        const problem = check(t.inputSchema, args);
        if (problem) return ok(id, { content: [{ type: 'text', text: `Invalid arguments: ${problem}` }], isError: true });
        try {
          const result = await t.run(args);
          return ok(id, { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }], structuredContent: result });
        } catch (e) {
          return ok(id, { content: [{ type: 'text', text: String(e?.message ?? e) }], isError: true });
        }
      }
      default:
        if (method.startsWith('notifications/')) return null;
        return note ? null : fail(id, -32601, `Method not found: ${method}`);
    }
  }
  return async function handle(body) {
    if (Array.isArray(body)) {
      if (!body.length) return { status: 400, body: fail(null, -32600, 'Empty batch') };
      const out = (await Promise.all(body.slice(0, 50).map(one))).filter(Boolean);
      return out.length ? { status: 200, body: out } : { status: 202, body: null };
    }
    const r = await one(body);
    return r ? { status: 200, body: r } : { status: 202, body: null };
  };
}
