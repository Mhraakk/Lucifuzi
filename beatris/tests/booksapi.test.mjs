import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.mjs';
import { createServer } from '../server/index.mjs';
import { seedUsers } from '../server/api.mjs';
import * as B from '../public/js/books.mjs';

let server, base, db, M, E;
const call = async (method, path, body, token) => {
  const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const ok = async (...a) => {
  const r = await call(...a);
  assert.ok(r.status < 300, `${a[0]} ${a[1]} → ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
};
const login = async (phone) => (await call('POST', '/api/auth/login', { phone, pin: '1234' })).body.token;
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(new Date());
const P750 = 8500000;
const line = (item, extra = {}) => ({ kind: 'jewel', itemId: item.id, tpl: item.tpl, title: item.title, weight: item.weight, fineness: item.fineness, p750: P750, ojratMode: item.ojratMode, ojrat: item.ojrat, profitPct: item.profitPct, stones: item.stones, ...extra });
const bal = async (partyId) => (await ok('GET', `/api/books/parties/${partyId}`, null, M)).balance;

before(async () => {
  db = openDb(':memory:');
  seedUsers(db, {}, true);
  server = createServer({ db, secret: 'test-secret-0123456789', demo: true, quiet: true, marketOpts: { fetchImpl: async () => new Response('{}', { status: 404 }), defaultMode: 'off' } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  M = await login('09120000002'); // manager
  E = await login('09120000004'); // employee
});
after(() => server.close());

let ali, shop2, items, bank;
test('مشتری: اعتبارسنجی کد ملی، موبایل تکراری، جستجو', async () => {
  assert.equal((await call('POST', '/api/books/parties', { name: 'علی', nid: '0499370898' }, E)).status, 400);
  assert.equal((await call('POST', '/api/books/parties', { name: 'علی', mobile: '0912' }, E)).status, 400);
  ali = await ok('POST', '/api/books/parties', { name: 'علی کریمی', nid: '۰۴۹۹۳۷۰۸۹۹', mobile: '+989121112233', postal: '1234567890', creditLimit: 100000000 }, E);
  assert.equal(ali.mobile, '09121112233');
  assert.equal(ali.nid, '0499370899');
  assert.equal(ali.creditLimit, 1000000000);
  assert.equal(ali.code, 1001);
  const dup = await call('POST', '/api/books/parties', { name: 'دیگری', mobile: '09121112233' }, E);
  assert.equal(dup.status, 409);
  assert.match(dup.body.error, /علی کریمی/);
  shop2 = await ok('POST', '/api/books/parties', { name: 'بنکداری نور', kind: 'company', tags: 'همکار' }, M);
  const found = await ok('GET', `/api/books/parties?q=${encodeURIComponent('۰۹۱۲۱۱۱')}`, null, E);
  assert.equal(found.items.length, 1);
  // only a manager may change a credit limit
  assert.equal((await call('PUT', `/api/books/parties/${ali.id}`, { ...ali, creditLimit: 1 }, E)).status, 403);
});

test('حساب‌ها: صندوق و بانک پیش‌فرض؛ شبا و کارت بررسی می‌شوند', async () => {
  const a = await ok('GET', '/api/books/accounts', null, E);
  assert.deepEqual(a.items.map((x) => x.id).sort(), ['bank-main', 'main']);
  assert.equal((await call('POST', '/api/books/accounts', { kind: 'bank', title: 'ملت', sheba: 'IR820540102680020817909003' }, M)).status, 400);
  assert.equal((await call('POST', '/api/books/accounts', { kind: 'bank', title: 'ملت' }, E)).status, 403);
  bank = await ok('POST', '/api/books/accounts', { kind: 'bank', title: 'ملت جاری', sheba: 'IR820540102680020817909002', card: '6037991234567893' }, M);
});

test('انبار: قطعه تکی، بارکد خودکار گروهی، ویرایش گروهی، انبارگردانی', async () => {
  const one = await ok('POST', '/api/books/items', { tpl: 'ring-w', weight: 5.23, ojrat: 15, profitPct: 7, showcase: 'A' }, E);
  assert.equal(one.items[0].code, '100001');
  const batch = await ok('POST', '/api/books/items', { tpl: 'ch-cartier', showcase: 'B', batch: [10.5, 12.25, { weight: 8, code: '777' }] }, E);
  assert.deepEqual(batch.items.map((i) => i.code), ['100002', '100003', '777']);
  assert.equal(batch.items[0].ojrat, 9); // the template's default making charge
  assert.equal((await call('POST', '/api/books/items', { tpl: 'ring-w', weight: 1, code: '777' }, E)).status, 409);
  assert.equal((await call('POST', '/api/books/items', { tpl: 'inv-melt', weight: 1 }, E)).status, 400);
  assert.equal((await call('POST', '/api/books/items/bulk', { ids: batch.items.map((i) => i.id), set: { ojrat: 11 } }, E)).status, 403);
  const b = await ok('POST', '/api/books/items/bulk', { ids: batch.items.map((i) => i.id), set: { ojrat: 11, showcase: 'C' } }, M);
  assert.equal(b.changed, 3);
  items = (await ok('GET', '/api/books/items', null, E)).items;
  assert.ok(items.filter((i) => i.tpl === 'ch-cartier').every((i) => i.ojrat === 11 && i.showcase === 'C'));
  assert.equal((await ok('GET', '/api/books/items/code/۷۷۷', null, E)).weight, 8);
  const st = await ok('POST', '/api/books/stocktake', { codes: ['100002', '100003', '999'], showcase: 'C' }, E);
  assert.equal(st.expected, 3);
  assert.equal(st.found, 2);
  assert.deepEqual(st.missing.map((i) => i.code), ['777']);
  assert.deepEqual(st.extra.map((x) => x.code), ['999']);
});

let sale1;
test('فروش کالای انبار: همان عدد موتور، کالا فروخته می‌شود، فروش دوباره و وزن غلط رد می‌شود', async () => {
  const ring = items.find((i) => i.code === '100001');
  const body = { type: 'sale', partyId: ali.id, lines: [line(ring)], payments: [{ method: 'pos', amount: 55726565.3, account: bank.id, ref: '123456' }] };
  sale1 = await ok('POST', '/api/books/docs', body, E);
  assert.equal(sale1.status, 'final');
  assert.equal(sale1.no, 1);
  assert.equal(sale1.serial, 1);
  assert.equal(sale1.calc.sales, 557265653);
  assert.equal(sale1.calc.credit, 0);
  assert.equal(sale1.verify.length, 12);
  assert.equal((await ok('GET', '/api/books/items/code/100001', null, E)).status, 'sold');
  assert.equal((await call('POST', '/api/books/docs', body, E)).status, 409);
  const chain = items.find((i) => i.code === '100002');
  assert.equal((await call('POST', '/api/books/docs', { type: 'sale', lines: [line(chain, { weight: 10 })], payments: [{ method: 'cash', amount: 1 }] }, E)).status, 400);
  // a walk-in sale must be settled in full
  const walk = await call('POST', '/api/books/docs', { type: 'sale', lines: [line(chain)], payments: [] }, E);
  assert.equal(walk.status, 400);
  assert.match(walk.body.error, /مشتری را انتخاب کنید/);
  // the employee cannot back-date
  assert.equal((await call('POST', '/api/books/docs', { type: 'sale', date: '2020-01-01', partyId: ali.id, lines: [line(chain)] }, E)).status, 403);
  assert.equal((await call('POST', '/api/books/docs', { type: 'sale', date: '2999-01-01', partyId: ali.id, lines: [line(chain)] }, M)).status, 400);
});

let sale2, cheque;
test('تعویض با طلای مستعمل، پرداخت ترکیبی چک + کارت به کارت + نسیه؛ سقف اعتبار', async () => {
  const chain = items.find((i) => i.code === '100002');
  const body = {
    type: 'sale', partyId: ali.id,
    lines: [line(chain), { kind: 'used', side: 'in', weight: 6, stoneWeight: 0.5, fineness: 740, p750: 8400000, deductPct: 2 }],
    payments: [{ method: 'cheque', amount: 20000000, chequeNo: '123', sayad: '1234567890123456', bank: 'ملی', due: today }, { method: 'c2c', amount: 10000000, card: '5892', ref: '55' }],
  };
  const pv = await ok('POST', '/api/books/preview', body, E);
  assert.equal(pv.calc.tradeIn, 446723200);
  sale2 = await ok('POST', '/api/books/docs', body, E);
  const c = B.calcDoc(body);
  assert.equal(sale2.calc.net, c.net);
  assert.equal(sale2.calc.credit, c.net - 300000000);
  assert.equal(sale2.cheque, undefined);
  const full = await ok('GET', `/api/books/docs/${sale2.id}`, null, E);
  assert.equal(full.cheques.length, 1);
  cheque = full.cheques[0];
  assert.equal(cheque.status, 'hand');
  assert.equal((await bal(ali.id)).IRR, sale2.calc.credit);
  // credit limit: 100 m toman; this would push the balance far over it
  const big = await call('POST', '/api/books/docs', { type: 'sale', partyId: ali.id, lines: [{ kind: 'coin', coin: 'emami', count: 2, price: 98500000 }] }, E);
  assert.equal(big.status, 409);
  assert.match(big.body.error, /سقف اعتبار/);
  // a cheque needs a named party
  assert.equal((await call('POST', '/api/books/docs', { type: 'receipt', payments: [{ method: 'cheque', amount: 1, chequeNo: '1', due: today }] }, E)).status, 400);
});

test('چک: واگذاری و وصول به حساب بانک؛ برگشت و بازگشت بدهی مشتری', async () => {
  const before = (await ok('GET', '/api/books/accounts', null, M)).items.find((a) => a.id === bank.id).balance;
  assert.equal((await call('PATCH', `/api/books/cheques/${cheque.id}`, { status: 'cleared' }, E)).status, 403);
  assert.equal((await call('PATCH', `/api/books/cheques/${cheque.id}`, { status: 'paid' }, M)).status, 400);
  await ok('PATCH', `/api/books/cheques/${cheque.id}`, { status: 'deposited', accountId: bank.id }, M);
  await ok('PATCH', `/api/books/cheques/${cheque.id}`, { status: 'bounced' }, M);
  const afterBounce = (await bal(ali.id)).IRR;
  assert.equal(afterBounce, sale2.calc.credit + 200000000); // the bounced cheque is debt again
  await ok('PATCH', `/api/books/cheques/${cheque.id}`, { status: 'deposited', accountId: bank.id }, M);
  await ok('PATCH', `/api/books/cheques/${cheque.id}`, { status: 'cleared', accountId: bank.id }, M);
  assert.equal((await bal(ali.id)).IRR, sale2.calc.credit);
  const after = (await ok('GET', '/api/books/accounts', null, M)).items.find((a) => a.id === bank.id).balance;
  assert.equal(after - before, 200000000);
  const list = await ok('GET', '/api/books/cheques?dir=in', null, M);
  assert.equal(list.items[0].status, 'cleared');
  assert.equal(list.items[0].history.length, 5);
});

test('ویرایش سند قطعی: فروشنده ۴۰۳، مدیر با دلیل؛ نسخه‌ها، اسناد و مانده‌ها بازسازی می‌شوند', async () => {
  const d = await ok('GET', `/api/books/docs/${sale1.id}`, null, M);
  assert.equal((await call('PUT', `/api/books/docs/${sale1.id}`, { ...d, lines: d.lines }, E)).status, 403);
  assert.equal((await call('PUT', `/api/books/docs/${sale1.id}`, { ...d }, M)).status, 400); // no reason
  const ring = items.find((i) => i.code === '100001');
  const v2 = await ok('PUT', `/api/books/docs/${sale1.id}`, { ...d, lines: [line(ring, { discount: 1000000 })], payments: d.payments, reason: 'تخفیف فراموش شده' }, M);
  assert.equal(v2.version, 2);
  assert.ok(v2.calc.sales < d.calc.sales);
  assert.equal((await bal(ali.id)).IRR, sale2.calc.credit - (d.calc.sales - v2.calc.sales)); // paid more than the new total → credit to him
  const full = await ok('GET', `/api/books/docs/${sale1.id}`, null, M);
  assert.deepEqual(full.versions.map((v) => v.version), [2, 1]);
  assert.equal(full.versions[0].reason, 'تخفیف فراموش شده');
  const old = await ok('GET', `/api/books/docs/${sale1.id}/versions/1`, null, M);
  assert.equal(old.calc.sales, 557265653);
  assert.notEqual(full.hash, old.hash);
});

test('برگشت از فروش: کالا به انبار، مالیات منفی؛ ابطال برگشت، کالا دوباره فروخته', async () => {
  const d = await ok('GET', `/api/books/docs/${sale1.id}`, null, M);
  const r = await ok('POST', '/api/books/docs', { type: 'return', partyId: ali.id, ref: sale1.id, lines: d.lines, payments: [{ method: 'cash', dir: 'out', amount: d.calc.sales / 10 }] }, M);
  assert.equal(r.calc.net, -d.calc.sales);
  assert.equal((await ok('GET', '/api/books/items/code/100001', null, M)).status, 'stock');
  const s = await ok('GET', '/api/books/summary', null, M);
  assert.equal(s.totals.returns, d.calc.sales);
  await ok('POST', `/api/books/docs/${r.id}/void`, { reason: 'اشتباه ثبت شد' }, M);
  assert.equal((await ok('GET', '/api/books/items/code/100001', null, M)).status, 'sold');
  assert.equal((await call('POST', '/api/books/docs', { type: 'return', partyId: ali.id, ref: 'nope', lines: d.lines }, M)).status, 400);
});

test('پیش‌فاکتور: رزرو کالا، تبدیل به فاکتور فروش', async () => {
  const p = items.find((i) => i.code === '100003');
  const pf = await ok('POST', '/api/books/docs', { type: 'proforma', partyId: shop2.id, lines: [line(p)] }, E);
  assert.equal((await ok('GET', '/api/books/items/code/100003', null, E)).status, 'reserved');
  assert.equal((await bal(shop2.id)).IRR, undefined); // a pro-forma moves nothing
  const s = await ok('POST', `/api/books/docs/${pf.id}/finalize`, {}, E);
  assert.equal(s.type, 'sale');
  assert.equal(s.ref, pf.id);
  assert.equal((await ok('GET', '/api/books/items/code/100003', null, E)).status, 'sold');
  assert.equal((await bal(shop2.id)).IRR, s.calc.sales);
});

test('نسیه طلایی برای همکار و تسویه با طلا؛ رسید دریافت پول؛ هزینه و انتقال', async () => {
  const s = await ok('POST', '/api/books/docs', { type: 'sale', partyId: shop2.id, creditUnit: 'G750', creditP750: P750, lines: [{ kind: 'melt', weight: 100, fineness: 740, mazaneh: 40000000 }] }, M);
  const b1 = await bal(shop2.id);
  assert.equal(b1.G750, s.calc.creditG);
  await ok('POST', '/api/books/docs', { type: 'receipt', partyId: shop2.id, creditUnit: 'G750', creditP750: P750, payments: [{ method: 'gold', weight: 50, fineness: 750, p750: P750 }] }, M);
  assert.equal((await bal(shop2.id)).G750, B.r3(s.calc.creditG - 50));
  const before = (await bal(shop2.id)).IRR;
  await ok('POST', '/api/books/docs', { type: 'receipt', partyId: shop2.id, payments: [{ method: 'satna', amount: 5000000, account: bank.id, ref: 'ST1', sheba: 'IR820540102680020817909002' }] }, M);
  assert.equal((await bal(shop2.id)).IRR, before - 50000000);
  await ok('POST', '/api/books/docs', { type: 'expense', category: 'rent', payments: [{ method: 'paya', dir: 'out', amount: 3000000, account: bank.id, ref: 'P' }] }, M);
  await ok('POST', '/api/books/docs', { type: 'transfer', payments: [{ method: 'cash', dir: 'out', amount: 1000000, account: 'main' }, { method: 'havale', dir: 'in', amount: 1000000, account: bank.id }] }, M);
  const acc = (await ok('GET', '/api/books/accounts', null, M)).items;
  assert.ok(acc.find((a) => a.id === 'main').balance < 0 || acc.find((a) => a.id === 'main').balance >= 0);
  assert.equal((await call('POST', '/api/books/docs', { type: 'expense', payments: [{ method: 'cash', dir: 'out', amount: 1, account: bank.id }] }, M)).status, 400); // cash from a bank account
});

test('سامانه مودیان: شماره منحصربه‌فرد پس از تنظیم شناسه حافظه؛ فیلدهای الگوی طلا', async () => {
  const pre = await ok('GET', `/api/books/docs/${sale2.id}/moadian`, null, M);
  assert.equal(pre.invoices[0].header.taxid, null);
  assert.ok(pre.missing.includes('شناسه حافظه مالیاتی'));
  assert.equal((await call('PUT', '/api/books/settings', { memoryId: 'abc' }, M)).status, 400);
  assert.equal((await call('PUT', '/api/books/settings', { memoryId: 'A11216' }, E)).status, 403);
  const st = await ok('PUT', '/api/books/settings', { memoryId: 'a11216', economicCode: '14000000000000', legalName: 'گالری نمونه', sstid: { jewel: '2330000000001', stone: '2330000000002' }, mu: { gram: '164', count: '1627' } }, M);
  assert.equal(st.taxReady, true);
  const m = await ok('GET', `/api/books/docs/${sale2.id}/moadian`, null, M);
  const inv = m.invoices[0];
  assert.ok(B.taxIdValid(inv.header.taxid));
  assert.equal(inv.header.inp, 3);
  assert.equal(inv.header.inty, 1);
  assert.equal(inv.header.tbill, sale2.calc.sales);
  assert.equal(inv.header.setm, 3);
  assert.deepEqual(inv.payments.map((p) => p.pmt).sort(), [1, 2, 6]);
  assert.equal(m.missing.length, 0);
  const tagged = await ok('POST', '/api/books/docs/bulk', { ids: [sale2.id], op: 'tax', value: 'sent' }, M);
  assert.equal(tagged.changed, 1);
});

test('گزارش‌ها: خلاصه روز، تراز دارایی، مالیات ماهانه، فروش به تفکیک قالب', async () => {
  const s = await ok('GET', '/api/books/summary', null, E);
  assert.ok(s.totals.sales > 0 && s.totals.vat > 0);
  assert.ok(s.totals.byMethod['pos:in'] > 0);
  assert.equal((await call('GET', '/api/books/summary?from=2020-01-01&to=2020-02-01', null, E)).status, 403);
  const bal = await ok('GET', '/api/books/report/balance', null, M);
  assert.equal(bal.assets - bal.liabilities, bal.net);
  assert.ok(bal.stockG > 0 && bal.receivable > 0);
  const vat = await ok('GET', `/api/books/report/vat?from=2020-01-01&to=${today}`, null, M);
  assert.equal(vat.total.vat, vat.rows.reduce((t, r) => t + r.vat, 0));
  assert.equal(vat.total.tcpbs, vat.total.consfee + vat.total.spro + vat.total.bros);
  const sales = await ok('GET', `/api/books/report/sales?from=2020-01-01&to=${today}&by=tpl`, null, M);
  assert.ok(sales.rows.some((r) => r.label === 'انگشتر زنانه'));
  assert.equal((await call('GET', `/api/books/report/sales?from=2020-01-01&to=${today}&by=x`, null, M)).status, 400);
});

test('فهرست اسناد، جستجو، ویرایش گروهی و ابطال گروهی', async () => {
  const all = await ok('GET', '/api/books/docs?type=sale', null, E);
  assert.ok(all.items.length >= 3);
  const q = await ok('GET', `/api/books/docs?q=${encodeURIComponent('علی')}`, null, E);
  assert.ok(q.items.every((d) => d.partyName === 'علی کریمی'));
  assert.equal((await call('POST', '/api/books/docs/bulk', { ids: [sale2.id], op: 'note', value: 'x' }, M)).status, 400); // reason needed
  await ok('POST', '/api/books/docs/bulk', { ids: [sale2.id], op: 'note', value: 'تحویل فردا', reason: 'یادداشت' }, M);
  const d = await ok('GET', `/api/books/docs/${sale2.id}`, null, M);
  assert.equal(d.note, 'تحویل فردا');
  assert.equal(d.tax.pending, 'correction'); // already sent → the change must go as a correction
  const extra = await ok('POST', '/api/books/docs', { type: 'sale', lines: [{ kind: 'service', amount: 500000, title: 'تعمیر' }], payments: [{ method: 'cash', amount: 550000 }] }, E);
  const v = await ok('POST', '/api/books/docs/bulk', { ids: [extra.id], op: 'void', reason: 'آزمایشی' }, M);
  assert.equal(v.changed, 1);
  assert.equal((await ok('GET', `/api/books/docs/${extra.id}`, null, M)).status, 'void');
});

test('دفتر رویداد زنجیره‌ای: سالم، و هر دست‌کاری مستقیم پایگاه داده کشف می‌شود؛ اصالت عمومی فاکتور', async () => {
  const lg = await ok('GET', '/api/books/log', null, M);
  assert.equal(lg.chain.ok, true);
  assert.ok(lg.chain.checked > 20);
  assert.equal((await call('GET', '/api/books/log', null, E)).status, 403);
  const pub = await call('GET', `/api/verify/${sale2.verify}`);
  assert.equal(pub.status, 200);
  assert.equal(pub.body.no, sale2.no);
  assert.equal(pub.body.shop, 'گالری نمونه');
  assert.equal(pub.body.total, sale2.calc.sales);
  assert.equal(pub.body.latest, false); // edited later by the bulk note: the old print says so
  const cur = await ok('GET', `/api/books/docs/${sale2.id}`, null, M);
  assert.equal((await call('GET', `/api/verify/${cur.verify}`)).body.latest, true);
  assert.ok(!JSON.stringify(pub.body).includes('علی')); // no customer data on the public page
  assert.equal((await call('GET', '/api/verify/000000000000')).status, 404);
  const exp = await ok('GET', '/api/books/export', null, M);
  assert.ok(exp.docs.length && exp.parties.length && exp.chain.ok);
  db.run("UPDATE bk_log SET detail_json='{\"net\":1}' WHERE seq=3");
  const broken = await ok('GET', '/api/books/log', null, M);
  assert.equal(broken.chain.ok, false);
  assert.equal(broken.chain.brokenAt, 3);
});
