// راه‌اندازی فروشگاه — the first day of a shop in the app: its identity, cash boxes and bank accounts, the metal in the
// vault (melted gold, coins, sealed bars, currency) with what it cost, and every customer's balance, entered once and
// booked as ONE opening document through the same handlers the rest of the app uses. Every chart and report then reads
// the shop's own numbers; nothing is invented and nothing is booked twice.
import { TRADE_COINS as COIN_TYPES, shownCoins } from '../public/js/coins.mjs';
import * as B from '../public/js/books.mjs';
import * as TR from '../public/js/trade.mjs';

const MAX = 1e15;
const n = (v) => {
  const x = B.num(v);
  return Number.isFinite(x) ? x : NaN;
};

export function makeSetup({ db, call, settings, getSetting, saveSetting, livePrices, tehranDay, bad, HttpError, isAdmin }) {
  const state = () => getSetting('setup', { done: false });
  const guard = (user) => {
    if (!isAdmin(user)) throw new HttpError(403, 'راه‌اندازی را مدیر یا مالک فروشگاه انجام می‌دهد.');
  };
  const hasBooks = () => !!db.get("SELECT 1 FROM bk_docs WHERE status='final' LIMIT 1");

  function info(user) {
    const lp = livePrices();
    const s = settings();
    return {
      done: !!state().done,
      hasBooks: hasBooks(),
      canRun: isAdmin(user) && !state().done && !hasBooks(),
      identity: { shopName: getSetting('brand', {}).shopName ?? '', legalName: s.legalName, economicCode: s.economicCode, nationalId: s.nationalId, regNo: s.regNo, address: s.address, postal: s.postal, phone: s.phone, memoryId: s.memoryId },
      edition: s.edition,
      money: s.money,
      today: tehranDay(),
      prices: { G750: lp.price.G750, mazaneh: lp.mazaneh, coins: Object.fromEntries(Object.keys(COIN_TYPES).map((k) => [k, lp.price[`COIN:${k}`] ?? null])), fx: Object.fromEntries(Object.keys(TR.FX_CODES).map((c) => [c, lp.price[`FX:${c}`] ?? null])), sample: !!lp.sample },
      coinTypes: shownCoins().map(([id, c]) => ({ id, label: c.short })),
      fxCodes: Object.entries(TR.FX_CODES).map(([id, label]) => ({ id, label })),
    };
  }

  /** Validates the whole form first; nothing is written unless all of it is right. */
  function check(body) {
    const errs = [];
    const need = (ok, msg) => ok || errs.push(msg);
    const posOrZero = (v) => v === '' || v == null || (Number.isFinite(n(v)) && n(v) >= 0 && n(v) < MAX);
    const cash = (body.cash ?? []).filter((c) => String(c.title ?? '').trim() || n(c.amount));
    const banks = (body.banks ?? []).filter((c) => String(c.title ?? '').trim() || n(c.amount));
    cash.forEach((c, i) => (need(String(c.title ?? '').trim().length >= 2, `نام صندوق ردیف ${i + 1} را بنویسید.`), need(posOrZero(c.amount), `موجودی صندوق «${c.title}» نامعتبر است.`)));
    banks.forEach((c, i) => (need(String(c.title ?? '').trim().length >= 2, `نام حساب بانکی ردیف ${i + 1} را بنویسید.`), need(Number.isFinite(n(c.amount || 0)) && Math.abs(n(c.amount || 0)) < MAX, `مانده بانک «${c.title}» نامعتبر است.`)));
    const gold = body.gold ?? {};
    need(posOrZero(gold.grams), 'وزن طلای آبشده نامعتبر است.');
    need(posOrZero(gold.avgPrice), 'میانگین بهای هر گرم نامعتبر است.');
    const coins = (body.coins ?? []).filter((c) => n(c.count));
    coins.forEach((c) => (need(!!COIN_TYPES[c.coin], `نوع سکه ${c.coin} نامعتبر است.`), need(Number.isInteger(n(c.count)) && n(c.count) > 0, 'تعداد سکه باید عدد صحیح مثبت باشد.'), need(posOrZero(c.avgPrice), 'میانگین بهای سکه نامعتبر است.')));
    const bars = (body.bars ?? []).filter((b) => String(b.serial ?? '').trim());
    const serials = new Set();
    bars.forEach((b) => {
      const s = String(b.serial).trim().toUpperCase().replace(/\s+/g, '');
      need(/^[A-Z0-9-]{3,30}$/.test(s), `سریال شمش «${b.serial}» فقط حرف لاتین، رقم و خط تیره (۳ تا ۳۰) است.`);
      need(!serials.has(s), `سریال ${s} دو بار آمده است.`);
      serials.add(s);
      need(n(b.weight) > 0 && n(b.weight) < 1e5, `وزن شمش ${s} را وارد کنید.`);
      need(n(b.fineness || 995) >= 1 && n(b.fineness || 995) <= 1000, `عیار شمش ${s} نامعتبر است.`);
      need(posOrZero(b.cost), `بهای شمش ${s} نامعتبر است.`);
    });
    const fx = (body.fx ?? []).filter((f) => n(f.amount));
    fx.forEach((f) => (need(!!TR.FX_CODES[f.code], `ارز ${f.code} نامعتبر است.`), need(n(f.amount) > 0, 'مقدار ارز باید مثبت باشد.'), need(posOrZero(f.rate), 'نرخ خرید ارز نامعتبر است.')));
    const parties = (body.parties ?? []).filter((p) => String(p.name ?? '').trim());
    const names = new Map();
    parties.forEach((p, i) => {
      need(String(p.name).trim().length >= 2, `نام مشتری ردیف ${i + 1} کوتاه است.`);
      const key = TR.partyLabel({ name: p.name.trim(), alias: p.alias, father: p.father, city: p.city, mobile: p.mobile });
      need(!names.has(key), `دو مشتری با نام و مشخصات یکسان «${p.name}» آمده‌اند؛ لقب، نام پدر، شهر یا موبایل را برای جدا کردن‌شان بنویسید.`);
      names.set(key, true);
      for (const [u, v] of Object.entries(p.balances ?? {})) {
        if (!v) continue;
        need(TR.validUnit(u), `واحد مانده «${u}» نامعتبر است.`);
        need(Number.isFinite(n(v)) && Math.abs(n(v)) < MAX, `مانده ${p.name} نامعتبر است.`);
        if (u.startsWith('COIN:')) need(Number.isInteger(n(v)), `مانده سکه ${p.name} باید عدد صحیح باشد.`);
      }
    });
    if (errs.length) throw bad(errs.slice(0, 6).join(' '));
    return { cash, banks, gold, coins, bars, fx, parties };
  }

  function run(user, body) {
    guard(user);
    if (state().done) throw new HttpError(409, 'راه‌اندازی قبلاً انجام شده است. تغییرات بعدی با سند (خرید، فروش، اصلاح موجودی) ثبت می‌شود.');
    if (hasBooks()) throw new HttpError(409, 'این فروشگاه سند قطعی دارد؛ راه‌اندازی فقط برای دفتر خالی است.');
    const f = check(body);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(body.date ?? '') && body.date <= tehranDay() ? body.date : tehranDay();
    return db.tx(() => {
      // 1) identity (through the settings handler, with its checks: economic code, national id, postal code…)
      const id = body.identity ?? {};
      if (String(id.shopName ?? '').trim().length >= 2) saveSetting('brand', { ...getSetting('brand', {}), shopName: String(id.shopName).trim().slice(0, 80) }, user.id);
      call('PUT', '/api/books/settings', user, { body: { legalName: id.legalName || id.shopName || '', economicCode: id.economicCode ?? '', nationalId: id.nationalId ?? '', regNo: id.regNo ?? '', address: id.address ?? '', postal: id.postal ?? '', phone: id.phone ?? '', memoryId: id.memoryId ?? '', ...(body.edition ? { edition: body.edition } : {}), ...(body.money ? { money: body.money } : {}) } });
      // 2) cash boxes and bank accounts: the two starter accounts are renamed rather than left empty beside the real ones
      const balances = [];
      const place = (kind, list, starter) => {
        list.forEach((a, i) => {
          const b = { kind, title: String(a.title).trim(), bank: a.bank ?? '', card: a.card ?? '', sheba: a.sheba ?? '' };
          let acct;
          if (i === 0 && db.get('SELECT 1 FROM bk_accounts WHERE id=?', starter)) acct = call('PUT', '/api/books/accounts/:id', user, { params: { id: starter }, body: b });
          else acct = call('POST', '/api/books/accounts', user, { body: b });
          if (n(a.amount)) balances.push({ acct: `${kind}:${acct.id}`, amount: B.rnd(n(a.amount)) });
        });
      };
      place('cash', f.cash, 'main');
      place('bank', f.banks, 'bank-main');
      // 3) the vault, with cost so the trading result is right from the first sale
      if (n(f.gold.grams) > 0) balances.push({ acct: 'gold', amount: B.r3(n(f.gold.grams)), ...(n(f.gold.avgPrice) > 0 ? { cost: B.rnd(n(f.gold.grams) * n(f.gold.avgPrice)) } : {}) });
      for (const c of f.coins) balances.push({ acct: `coin:${c.coin}`, amount: Math.round(n(c.count)), ...(n(c.avgPrice) > 0 ? { cost: B.rnd(n(c.count) * n(c.avgPrice)) } : {}) });
      for (const b of f.bars) balances.push({ acct: `bar:${String(b.serial).trim().toUpperCase().replace(/\s+/g, '')}`, amount: 1, weight: n(b.weight), fineness: n(b.fineness || 995), brand: b.brand ?? '', gallery: b.gallery ?? '', sealDate: b.sealDate ?? '', ...(n(b.cost) > 0 ? { cost: B.rnd(n(b.cost)) } : {}) });
      for (const x of f.fx) balances.push({ acct: `fx:${x.code}`, amount: n(x.amount), ...(n(x.rate) > 0 ? { cost: B.rnd(n(x.amount) * n(x.rate)) } : {}) });
      // 4) customers, each with what they owe (+) or are owed (−) in money and in goods
      let partiesMade = 0;
      for (const p of f.parties) {
        const made = call('POST', '/api/books/parties', user, { body: { name: p.name.trim(), mobile: p.mobile ?? '', alias: p.alias ?? '', father: p.father ?? '', city: p.city ?? '', grp: p.grp ?? '', nid: p.nid ?? '', creditLimit: p.creditLimit ?? 0 } });
        partiesMade++;
        for (const [u, v] of Object.entries(p.balances ?? {})) if (n(v)) balances.push({ acct: `party:${made.id}`, unit: u, amount: u === 'IRR' ? B.rnd(n(v)) : u === 'G750' ? B.r3(n(v)) : n(v) });
      }
      // 5) one opening document — numbered, hashed, traceable like every other
      let doc = null;
      if (balances.length) doc = call('POST', '/api/books/docs', user, { body: { type: 'opening', date, money: 'rial', balances, note: 'افتتاحیه — راه‌اندازی فروشگاه در نرم‌افزار' } });
      saveSetting('setup', { done: true, at: new Date().toISOString(), by: user.id, doc: doc?.id ?? null }, user.id);
      return { ok: true, doc: doc ? { id: doc.id, track: doc.track } : null, counts: { accounts: f.cash.length + f.banks.length, parties: partiesMade, balances: balances.length } };
    });
  }

  function skip(user) {
    guard(user);
    saveSetting('setup', { done: true, skipped: true, at: new Date().toISOString(), by: user.id }, user.id);
    return { ok: true };
  }
  return { info, run, skip };
}
