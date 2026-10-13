import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as B from '../public/js/books.mjs';
import * as MELT from '../public/js/melt.mjs';
import { invoice } from '../public/js/calc.mjs';

const J = { kind: 'jewel', weight: 5.23, fineness: 750, p750: 8500000, ojratMode: 'pct', ojrat: 15, profitPct: 7 };

test('کارساخته: همه اجزا به ریال صحیح و مطابق فرمول بازار', () => {
  const l = B.calcLine(J);
  // 5.23 g × 85,000,000 rial/g
  assert.equal(l.fee, 85000000);
  assert.equal(l.principal, 444550000);
  assert.equal(l.consfee, 66682500); // 15 % of the gold value
  assert.equal(l.spro, 35786275); // 7 % of (gold + making charge)
  assert.equal(l.tcpbs, 102468775);
  assert.equal(l.vat, 10246878); // 10 % of making charge + profit only, rounded half up
  assert.equal(l.total, 557265653);
  // agrees with the calculator used elsewhere in the app to within one rial of rounding
  const c = invoice({ weight: 5.23, p750: 8500000, ojrat: 15, profitPct: 7, vatPct: 10 });
  assert.ok(Math.abs(c.total * 10 - l.total) <= 1);
  for (const k of ['principal', 'consfee', 'spro', 'tcpbs', 'vat', 'total']) assert.ok(Number.isInteger(l[k]), k);
});

test('کارساخته: عیار غیر ۷۵۰، اجرت گرمی و ثابت، حق‌العمل، سنگ و تخفیف', () => {
  const a = B.calcLine({ ...J, weight: 10, fineness: 740 });
  assert.equal(a.fee, 83866667); // round(85,000,000 × 740 / 750)
  assert.equal(a.principal, 838666670);
  const g = B.calcLine({ ...J, ojratMode: 'gram', ojrat: 450000 });
  assert.equal(g.consfee, 23535000); // 5.23 g × 450,000 toman × 10
  const f = B.calcLine({ ...J, ojratMode: 'fixed', ojrat: 2000000, bros: 100000, stones: 3000000 });
  assert.equal(f.consfee, 20000000);
  assert.equal(f.bros, 1000000);
  assert.equal(f.stones, 30000000);
  assert.equal(f.tcpbs, f.consfee + f.spro + f.bros);
  assert.equal(f.total, f.principal + f.stones + f.tcpbs + f.vat); // stones: exempt principal
  const d = B.calcLine({ ...J, discount: 5000000 });
  assert.equal(d.spro, 0); // the discount eats the profit first…
  assert.equal(d.consfee, 66682500 - (50000000 - 35786275)); // …then the making charge
  assert.equal(d.vat, B.rnd(d.tcpbs * 0.1));
  assert.throws(() => B.calcLine({ ...J, discount: 20000000 }), /ارزش طلا را نمی‌توان تخفیف داد/);
});

test('ورودی‌های نامعتبر پیام فارسی می‌دهند و ارقام فارسی پذیرفته می‌شوند', () => {
  assert.throws(() => B.calcLine({ ...J, weight: -1 }), B.BookError);
  assert.throws(() => B.calcLine({ ...J, weight: 'abc' }), /وزن/);
  assert.throws(() => B.calcLine({ ...J, fineness: 1200 }), /عیار/);
  assert.throws(() => B.calcLine({ ...J, ojratMode: 'x' }), /نوع اجرت/);
  assert.throws(() => B.calcLine({ kind: 'used', side: 'out', weight: 1, p750: 1 }), /فقط خریده/);
  assert.throws(() => B.calcLine({ kind: 'coin', coin: 'nope', count: 1, price: 1 }), /سکه/);
  assert.throws(() => B.calcLine({ kind: 'coin', coin: 'emami', count: 1.5, price: 1 }), /صحیح/);
  const fa = B.calcLine({ ...J, weight: '۵٫۲۳', p750: '۸٬۵۰۰٬۰۰۰' });
  assert.equal(fa.total, 557265653);
  assert.ok(Number.isNaN(B.num('1.2.3')));
});

test('آب‌شده همان قاعده دفتر (معادل ۷۵۰ گرد به ۳ رقم، مبلغ گرد به هزار تومان)', () => {
  for (const [w, f, maz] of [[100, 740, 40000000], [15.6, 745, 39800000], [3.215, 705, 41234000]]) {
    const l = B.calcLine({ kind: 'melt', weight: w, fineness: f, mazaneh: maz });
    assert.equal(l.principal, MELT.ledgerValue(w, f, maz) * 10);
    assert.equal(l.g750, MELT.r3(MELT.eq750(w, f)));
    assert.equal(l.vat, 0);
  }
});

test('طلای مستعمل: کسر وزن سنگ، ری‌گیری و درصد افت؛ بدون مالیات', () => {
  const u = B.calcLine({ kind: 'used', side: 'in', weight: 6, stoneWeight: 0.5, fineness: 740, p750: 8400000, deductPct: 2 });
  assert.equal(u.weight, 5.5);
  assert.equal(u.fee, 82880000);
  assert.equal(u.discount, 9116800);
  assert.equal(u.principal, 446723200);
  assert.equal(u.g750, 5.427);
  assert.equal(u.vat, 0);
});

test('خدمت و کالای غیرطلا: مالیات روی کل مبلغ', () => {
  const s = B.calcLine({ kind: 'service', amount: 500000 });
  assert.deepEqual([s.consfee, s.vat, s.total], [5000000, 500000, 5500000]);
  const g = B.calcLine({ kind: 'goods', qty: 2, price: 1250000, discount: 100000 });
  assert.deepEqual([g.principal, g.discount, g.vat, g.total], [25000000, 1000000, 2400000, 26400000]);
  const c = B.calcLine({ kind: 'coin', coin: 'emami', count: 3, price: 98500000 });
  assert.deepEqual([c.principal, c.vat, c.total], [2955000000, 0, 2955000000]);
});

test('تعویض (فروش + طلای مستعمل) با پرداخت ترکیبی کارتخوان و نقد', () => {
  const doc = {
    type: 'sale',
    lines: [J, { kind: 'used', side: 'in', weight: 6, stoneWeight: 0.5, fineness: 740, p750: 8400000, deductPct: 2 }],
    payments: [{ method: 'pos', dir: 'in', amount: 10000000, account: 'b1', ref: '123456' }, { method: 'cash', dir: 'in', amount: '1054245.3', account: 'c1' }],
  };
  const c = B.calcDoc(doc);
  assert.equal(c.sales, 557265653);
  assert.equal(c.tradeIn, 446723200);
  assert.equal(c.net, 110542453);
  assert.equal(c.paidIn, 110542453);
  assert.equal(c.credit, 0);
  assert.deepEqual([c.setm, c.cap, c.insp], [1, 557265653, 0]);
  const p = B.balances(B.postings({ ...doc, partyId: 'p1' }, c));
  assert.equal(p['party:p1'], undefined); // settled in full: nothing left on the customer's account
  assert.equal(p['bank:b1'].IRR, 100000000);
  assert.equal(p['cash:c1'].IRR, 10542453);
  assert.equal(p.gold.G750, 5.427);
  assert.equal(p.vat.IRR, 10246878);
});

test('نسیه ریالی و نسیه طلایی روی حساب مشتری؛ روش تسویه سامانه مودیان', () => {
  const doc = { type: 'sale', partyId: 'p1', lines: [J], payments: [{ method: 'c2c', dir: 'in', amount: 50000000, account: 'b1', card: '6037991234567893', ref: '99' }] };
  const c = B.calcDoc(doc);
  assert.equal(c.credit, 57265653);
  assert.deepEqual([c.setm, c.cap, c.insp], [3, 500000000, 57265653]);
  assert.equal(B.balances(B.postings(doc, c))['party:p1'].IRR, 57265653);
  const g = { ...doc, creditUnit: 'G750', creditP750: 8500000 };
  const cg = B.calcDoc(g);
  assert.equal(cg.creditG, 0.674); // 57,265,653 ÷ 85,000,000
  const bg = B.balances(B.postings(g, cg))['party:p1'];
  assert.equal(bg.IRR ?? 0, 0);
  assert.equal(bg.G750, 0.674);
  assert.deepEqual(B.calcDoc({ ...doc, payments: [] }).setm, 2);
  assert.throws(() => B.calcDoc({ ...doc, payments: [{ method: 'c2c', amount: 1, card: '1234567812345678' }] }), /کارت/);
});

test('برگشت از فروش، دریافت، پرداخت، هزینه و انتقال', () => {
  const r = { type: 'return', partyId: 'p1', lines: [J, { kind: 'coin', coin: 'emami', count: 1, price: 98500000 }], payments: [{ method: 'cash', dir: 'out', amount: 55726565.3 + 98500000, account: 'c1' }] };
  const cr = B.calcDoc(r);
  assert.equal(cr.net, -(557265653 + 985000000));
  assert.equal(cr.credit, 0);
  const br = B.balances(B.postings(r, cr));
  assert.equal(br.vat.IRR, -10246878);
  assert.equal(br['coin:emami'].COUNT, 1);
  assert.equal(br['cash:c1'].IRR, -1542265653);
  const rc = { type: 'receipt', partyId: 'p1', payments: [{ method: 'satna', dir: 'in', amount: 20000000, account: 'b1', ref: 'S1', sheba: 'IR820540102680020817909002' }] };
  assert.equal(B.balances(B.postings(rc, B.calcDoc(rc)))['party:p1'].IRR, -200000000);
  const gold = { type: 'receipt', partyId: 'p1', creditUnit: 'G750', creditP750: 8500000, payments: [{ method: 'gold', dir: 'in', weight: 10, fineness: 750, p750: 8500000 }] };
  const bgold = B.balances(B.postings(gold, B.calcDoc(gold)));
  assert.equal(bgold['party:p1'].G750, -10); // the customer settled 10 g of a gold debt with gold
  assert.equal(bgold['party:p1'].IRR ?? 0, 0);
  assert.equal(bgold.gold.G750, 10);
  const ex = { type: 'expense', category: 'rent', payments: [{ method: 'paya', dir: 'out', amount: 30000000, account: 'b1', ref: 'P1' }] };
  const be = B.balances(B.postings(ex, B.calcDoc(ex)));
  assert.deepEqual([be['exp:rent'].IRR, be['bank:b1'].IRR], [300000000, -300000000]);
  const tr = { type: 'transfer', payments: [{ method: 'cash', dir: 'out', amount: 10000000, account: 'c1' }, { method: 'havale', dir: 'in', amount: 10000000, account: 'b1' }] };
  const bt = B.balances(B.postings(tr, B.calcDoc(tr)));
  assert.deepEqual([bt['cash:c1'].IRR, bt['bank:b1'].IRR], [-100000000, 100000000]);
  assert.throws(() => B.calcDoc({ ...tr, payments: [tr.payments[0], { ...tr.payments[1], amount: 9 }] }), /برابر/);
  assert.throws(() => B.calcDoc({ type: 'expense', payments: [] }), /هزینه/);
  assert.throws(() => B.calcDoc({ type: 'sale', lines: [] }), /دست‌کم یک ردیف/);
  assert.throws(() => B.calcDoc({ type: 'buy', lines: [J] }), /ردیف ۱|ردیف 1/);
  assert.throws(() => B.calcDoc({ type: 'sale', lines: [J], payments: [{ method: 'cheque', amount: 1, due: 'x' }] }), /چک/);
});

test('فاکتور الکترونیکی الگوی طلا: جمع‌ها، سنگ جدا، کالای غیرطلا در الگوی ۱', () => {
  const doc = {
    type: 'sale', date: '2026-09-28', serial: 42, issuedAt: '2026-09-28T09:00:00Z',
    lines: [{ ...J, stones: 3000000, title: 'انگشتر زنانه' }, { kind: 'goods', qty: 1, price: 1000000, title: 'جعبه' }, { kind: 'coin', coin: 'emami', count: 1, price: 98500000 }],
    payments: [{ method: 'pos', dir: 'in', amount: 200000000, ref: '777' }],
  };
  const c = B.calcDoc(doc);
  const inv = B.moadianInvoices(doc, c, { economicCode: '14000000000000', sstid: { jewel: '2330000000001' } }, { kind: 'person', nid: '0499370899', postal: '1234567890' });
  // official unit codes are built in: gram 1622 (not 164, which is kilogram), count 1627
  assert.equal(inv[0].body[0].mu, '1622');
  // a coin gets its general product ID from the tax system's list, even when the shop set none for coins
  const coinRow = inv[0].body.find((r) => r.sstt.includes('سکه'));
  assert.deepEqual([coinRow.sstid, coinRow.mu], ['2720000170500', '1627']);
  assert.equal(inv.length, 2);
  const [gold, goods] = inv;
  assert.equal(gold.header.inp, 3);
  assert.equal(goods.header.inp, 1);
  assert.equal(gold.header.inty, 1);
  assert.equal(gold.header.inno, '0000000042');
  assert.equal(gold.body.length, 3); // piece, its stones, the coin
  assert.equal(gold.header.tbill + goods.header.tbill, c.sales);
  for (const r of gold.body) {
    assert.equal(r.tcpbs, r.consfee + r.spro + r.bros);
    assert.ok(Number.isInteger(r.consfee) && Number.isInteger(r.tcpbs));
    assert.equal(r.tsstam, r.adis + r.tcpbs + r.vam);
  }
  assert.equal(gold.body[0].sstid, '2330000000001');
  assert.equal(gold.body[1].fee, 30000000);
  const walkIn = B.moadianInvoices(doc, c, { economicCode: '1' }, null);
  assert.equal(walkIn[0].header.inty, 2);
  assert.throws(() => B.moadianInvoices({ ...doc, type: 'buy' }, c, {}), /فقط فاکتور فروش/);
});

test('شماره منحصربه‌فرد مالیاتی مطابق SDK رسمی (همان خروجی کتابخانه پایتون)', () => {
  assert.equal(B.taxId('A11216', '2026-09-28T00:00:00Z', 1), 'A11216050F400000000015');
  assert.equal(B.taxId('ABC123', '2024-01-15T00:00:00Z', 987654321), 'ABC12304D19003ADE68B12');
  assert.equal(B.taxId('X9Y8Z7', '2025-03-21T00:00:00Z', 42), 'X9Y8Z704EC8000000002A6');
  assert.ok(B.taxIdValid('ABC12304D19003ADE68B12'));
  assert.ok(!B.taxIdValid('ABC12304D19003ADE68B13'));
  assert.throws(() => B.taxId('abc', new Date(), 1), /حافظه/);
});

test('شناسه‌ها: کد ملی، شناسه ملی، کارت، شبا، موبایل', () => {
  assert.ok(B.validNationalCode('0499370899'));
  assert.ok(B.validNationalCode('۰۴۹۹۳۷۰۸۹۹'));
  assert.ok(!B.validNationalCode('0499370898'));
  assert.ok(!B.validNationalCode('1111111111'));
  assert.ok(B.validCard('6037-9912-3456-7893'));
  assert.ok(!B.validCard('6037991234567890'));
  assert.ok(B.validSheba('IR820540102680020817909002'));
  assert.ok(!B.validSheba('IR820540102680020817909003'));
  assert.equal(B.normalizeMobile('+98 912 000 0001'), '09120000001');
  assert.ok(B.validMobile('۰۹۱۲۰۰۰۰۰۰۱'));
  // legal-entity ID: build a valid one from the algorithm and check a changed digit fails
  const base = '1010165655';
  const k = Number(base[9]) + 2;
  let s = 0;
  for (let i = 0; i < 10; i++) s += (Number(base[i]) + k) * [29, 27, 23, 19, 17][i % 5];
  const id = base + String(s % 11 === 10 ? 0 : s % 11);
  assert.ok(B.validNationalId(id));
  assert.ok(!B.validNationalId(id.slice(0, 10) + String((Number(id[10]) + 1) % 10)));
});

test('نمایش: تومان از ریال، گرم سه‌رقمی، عدد به حروف', () => {
  assert.equal(B.fmtRial(557265653), '۵۵٬۷۲۶٬۵۶۵٫۳ تومان');
  assert.equal(B.fmtRial(-100000000), '−۱۰٬۰۰۰٬۰۰۰ تومان');
  assert.equal(B.fmtG(5.4266), '۵٫۴۲۷');
  assert.equal(B.words(1542265653), 'یک میلیارد و پانصد و چهل و دو میلیون و دویست و شصت و پنج هزار و ششصد و پنجاه و سه');
  assert.equal(B.words(0), 'صفر');
  assert.equal(B.canonical({ b: 1, a: [2, { d: 1, c: null }] }), '{"a":[2,{"c":null,"d":1}],"b":1}');
});

test('قالب‌ها: همه شناسه‌ها یکتا و هر قالب نوع معتبر دارد؛ تغییرات مالک اعمال می‌شود', () => {
  const ids = B.TEMPLATES.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(B.TEMPLATES.length >= 60);
  for (const t of B.TEMPLATES) {
    assert.ok(['jewel', 'coin', 'melt', 'used', 'service', 'goods'].includes(t.kind), t.id);
    assert.ok(B.TEMPLATE_GROUPS.some((g) => g.id === t.group), t.id);
  }
  const over = B.templatesWith({ 'ring-w': { ojrat: 21 } });
  assert.equal(over.find((t) => t.id === 'ring-w').ojrat, 21);
});

test('گرد کردن فاکتور با تخفیف از سود: جمع دقیقاً به زیر هزار تومان می‌رسد و مالیات هم کم می‌شود', () => {
  const cases = [[5.23, 15], [12.345, 9], [1.07, 25], [33.3, 11.5]];
  for (let i = 0; i < 300; i++) cases.push([Math.round((0.5 + i * 0.137) * 1000) / 1000, 5 + (i % 20)]);
  for (const [w, oj] of cases) {
    const line = { ...J, weight: w, ojrat: oj };
    const c0 = B.calcLine(line);
    const target = Math.floor(c0.total / 10000) * 10000;
    const d = B.discountForTarget(line, c0.total, target);
    assert.ok(d != null && d >= 0, `d for ${w}`);
    const c1 = B.calcLine({ ...line, discount: d });
    assert.ok(c1.total % 10000 === 0 && c1.total <= target && target - c1.total <= 30000, `${w}: ${c1.total} vs ${target}`);
    assert.ok(c1.vat <= c0.vat);
    assert.equal(c1.principal, c0.principal); // the gold value is untouched
  }
  // a line with no taxable room cannot absorb it
  assert.equal(B.discountForTarget({ ...J, ojrat: 0, profitPct: 0 }, B.calcLine({ ...J, ojrat: 0, profitPct: 0 }).total, 0), null);
});
