// spec 0013: the operator's flow — quick undo, one-line entry, a queue that never books twice, amendments.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHistory } from '../public/js/undo.mjs';
import { parseLine, readNumber, normalize, describe } from '../public/js/oneline.mjs';
import { openDb } from '../server/db.mjs';
import { createServer } from '../server/index.mjs';
import { seedUsers } from '../server/api.mjs';

test('برگشت سریع: هر تغییر یک گام؛ تایپ پشت‌سرهم یک خانه یک گام؛ undo و redo؛ تغییر تازه شاخه redo را می‌برد', () => {
  let t = 0;
  let S = { party: null, weight: '', fineness: 740 };
  const h = createHistory({ get: () => S, set: (v) => (S = v), now: () => t, limit: 5 });
  assert.equal(h.canUndo, false);
  S = { ...S, party: 'رضایی' };
  assert.equal(h.commit('مشتری: رضایی', { focus: '#pq' }), true);
  // typing 12.45 in the weight box: five keystrokes, one step
  for (const v of ['1', '12', '12.', '12.4', '12.45']) {
    t += 200;
    S = { ...S, weight: v };
    h.commit(`وزن ${v}`, { key: 'weight', focus: '[data-f=weight]' });
  }
  assert.equal(h.size, 2);
  assert.deepEqual(h.steps(), ['وزن 12.45', 'مشتری: رضایی']);
  // a pause, then the fineness: a new step
  t += 5000;
  S = { ...S, fineness: 750 };
  h.commit('عیار ۷۵۰', { key: 'fineness' });
  assert.equal(h.size, 3);
  // nothing changed: no step
  assert.equal(h.commit('هیچ'), false);
  // back: the fineness, then the whole weight at once; the step tells where to land
  assert.equal(h.undo().label, 'عیار ۷۵۰');
  assert.equal(S.fineness, 740);
  const w = h.undo();
  assert.equal(w.focus, '[data-f=weight]');
  assert.equal(S.weight, '');
  assert.equal(S.party, 'رضایی');
  // forward again
  assert.equal(h.redo().label, 'وزن 12.45');
  assert.equal(S.weight, '12.45');
  assert.equal(h.canRedo, true);
  // a fresh change drops the redo branch
  S = { ...S, weight: '13' };
  h.commit('وزن 13', { key: 'weight' });
  assert.equal(h.canRedo, false);
  // several steps back at once
  h.back(2);
  assert.equal(S.weight, '');
  // the history is bounded
  for (let i = 0; i < 10; i++) {
    t += 5000;
    S = { ...S, note: String(i) };
    h.commit(`یادداشت ${i}`);
  }
  assert.equal(h.size, 5);
  h.reset();
  assert.equal(h.canUndo, false);
});

test('عدد با حروف و رقم: ممیز، و نیم، میلیون و هزار، رقم فارسی و جداکننده‌ها', () => {
  const n = (s, o) => readNumber(normalize(s).split(/\s+/), 0, o)?.value;
  assert.equal(n('دوازده ممیز چهل و پنج'), 12.45);
  assert.equal(n('دوازده ممیز صفر پنج'), 12.05);
  assert.equal(n('دو و نیم'), 2.5);
  assert.equal(n('هفتصد و پنجاه'), 750);
  assert.equal(n('سه صد و بیست'), 320);
  assert.equal(n('یک میلیون و دویست و پنجاه هزار'), 1250000);
  assert.equal(n('۴۵ میلیون و ۲۰۰', { price: true }), 45200000); // the market's thousands after millions
  assert.equal(n('۴۵ میلیون و ۲۰۰ هزار', { price: true }), 45200000);
  assert.equal(n('۴۵,۲۰۰,۰۰۰'), 45200000);
  assert.equal(n('۱۲٫۴۵'), 12.45);
  assert.equal(n('۱۲/۴۵'), 12.45);
  assert.equal(n('١٢'), 12);
  assert.equal(n('گرم'), undefined);
});

test('ورود تک‌خطی: معامله‌های رایج پشت پیشخوان', () => {
  const a = parseLine('خرید - رضایی - دوازده ممیز چهل و پنج گرم - عیار هفتصد و پنجاه - نقد');
  assert.deepEqual([a.mode, a.party, a.kind, a.weight, a.fineness], ['buy', 'رضایی', 'melt', 12.45, 750]);
  assert.deepEqual(a.pays, [{ method: 'cash', amount: null, unit: null, rest: true }]);
  assert.deepEqual(a.unknown, []);
  assert.match(describe(a), /خرید از مشتری · مشتری: رضایی · آبشده · ۱۲٫۴۵ گرم · عیار ۷۵۰ · نقد/);

  const b = parseLine('فروش به احمدی ۳ تا تمام امامی قیمت ۹۵ میلیون تومان کارت');
  assert.deepEqual([b.mode, b.party, b.kind, b.coin, b.count], ['sell', 'احمدی', 'coin', 'emami', 3]);
  assert.deepEqual(b.price, { basis: 'unit', value: 95000000, unit: 'toman' });
  assert.equal(b.pays[0].method, 'pos');

  const c = parseLine('خرید ۱۲٫۴۵ گرم ۷۴۰ مظنه ۴۵ میلیون و ۲۰۰ تومان نقد ۲۰۰ میلیون بقیه کارت به کارت');
  assert.deepEqual([c.weight, c.fineness], [12.45, 740]);
  assert.deepEqual(c.price, { basis: 'mazaneh', value: 45200000, unit: 'toman' });
  assert.deepEqual(c.pays.map((p) => [p.method, p.amount, p.rest]), [['cash', 200000000, false], ['c2c', null, true]]);

  const d = parseLine('دریافت جنس از آقای کریمی ۵۰ گرم عیار ۱۸');
  assert.deepEqual([d.mode, d.party, d.weight, d.fineness], ['in', 'کریمی', 50, 750]);

  const e = parseLine('خرید ۱۰۰۰ دلار نرخ ۹۰ هزار تومان نقد');
  assert.deepEqual([e.kind, e.fx.code, e.fx.amount, e.fx.rate, e.fx.unit], ['fx', 'USD', 1000, 90000, 'toman']);

  const f = parseLine('فروش شمش سریال ۳۳۰۷۰۲۱ وزن ۱۰۰ گرم عیار ۹۹۵');
  assert.deepEqual([f.kind, f.serial, f.weight, f.fineness], ['bar', '3307021', 100, 995]);

  const g = parseLine('خرید - محمدی - ۲ مثقال - ۷۵۰');
  assert.deepEqual([g.party, g.weight, g.fineness], ['محمدی', 9.216, 750]);

  const h = parseLine('فروش دو ربع به نوری ۵۰ میلیون کارت بقیه نقد');
  assert.deepEqual([h.coin, h.count, h.party], ['quarter', 2, 'نوری']);
  assert.deepEqual(h.pays.map((p) => [p.method, p.amount]), [['pos', 50000000], ['cash', null]]);

  // a word that was not understood is reported, not guessed
  const u = parseLine('خرید رضایی ۱۰ گرم ۷۵۰ زرشک‌پلو ۱۲');
  assert.ok(u.unknown.length > 0);
});

/* ---------------- the server: a queue that never books twice; amendments for the tax system ---------------- */
let server, base, M, E;
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
before(async () => {
  const db = openDb(':memory:');
  seedUsers(db, {}, true);
  server = createServer({ db, secret: 'test-secret-0123456789', demo: true, quiet: true, marketOpts: { fetchImpl: async () => new Response('{}', { status: 404 }), defaultMode: 'off' } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  M = await login('09120000002');
  E = await login('09120000004');
});
after(() => server.close());

test('صف ارسال: همان کلید یکتا دو بار فرستاده شود، یک سند ساخته می‌شود', async () => {
  const p = await ok('POST', '/api/books/parties', { name: 'مشتری صف' }, E);
  const body = { type: 'trade', partyId: p.id, lines: [{ kind: 'melt', dir: 'in', weight: 3, fineness: 750, mazaneh: 400000000 }], payments: [], clientKey: 'k-test-0001-abcdef' };
  const a = await ok('POST', '/api/books/docs', body, E);
  const b = await ok('POST', '/api/books/docs', body, E);
  assert.equal(b.id, a.id);
  assert.equal(b.replayed, true);
  const list = (await ok('GET', `/api/books/docs?party=${p.id}`, null, E)).items;
  assert.equal(list.length, 1);
  // a malformed key is ignored (a normal save), never an error
  const c = await ok('POST', '/api/books/docs', { ...body, clientKey: 'x' }, E);
  assert.notEqual(c.id, a.id);
});

test('اصلاحیه برای سامانه مودیان: سند اصلی ارسال‌شده «جایگزین» می‌شود و اصلاحیه «اصلاحی» با ارجاع به شماره مالیاتی اصل است', async () => {
  await ok('PUT', '/api/books/settings', { memoryId: 'A11216', economicCode: '14000000000000', legalName: 'گالری آزمون' }, M);
  const p = await ok('POST', '/api/books/parties', { name: 'خریدار مالیاتی', nid: '0012345679' }, M);
  const sale = await ok('POST', '/api/books/docs', { type: 'sale', partyId: p.id, lines: [{ kind: 'coin', coin: 'emami', count: 1, price: 90000000, title: 'تمام امامی' }], payments: [{ method: 'cash', dir: 'in', amount: 90000000 }] }, M);
  assert.ok(sale.tax.taxId);
  await ok('POST', '/api/books/docs/bulk', { ids: [sale.id], op: 'tax', value: 'sent' }, M);
  const d = await ok('GET', `/api/books/docs/${sale.id}`, null, M);
  const fix = await ok('PUT', `/api/books/docs/${sale.id}`, { ...d, payments: [{ method: 'cash', dir: 'in', amount: 89000000 }], lines: [{ ...d.lines[0], price: 89000000 }], reason: 'قیمت اشتباه' }, M);
  assert.equal(fix.amends, sale.id);
  assert.equal(fix.tax.pending, 'correction');
  assert.equal(fix.tax.refTaxId, sale.tax.taxId);
  assert.notEqual(fix.tax.taxId, sale.tax.taxId);
  const orig = await ok('GET', `/api/books/docs/${sale.id}`, null, M);
  assert.equal(orig.tax.pending, 'superseded');
  assert.equal(orig.tax.supersededBy, fix.id);
  const mo = await ok('GET', `/api/books/docs/${fix.id}/moadian`, null, M);
  const inv = mo.invoices?.[0] ?? mo.invoice ?? mo;
  const header = inv.header ?? inv;
  assert.equal(header.ins, 2);
  assert.equal(header.irtaxid, sale.tax.taxId);
  // moving a final document to another customer is an amendment too
  const q = await ok('POST', '/api/books/parties', { name: 'خریدار دوم' }, M);
  await ok('POST', '/api/books/docs/bulk', { ids: [fix.id], op: 'party', value: q.id, reason: 'مشتری اشتباه' }, M);
  const moved = await ok('GET', `/api/books/docs/${fix.id}`, null, M);
  assert.equal(moved.status, 'void');
  assert.ok(moved.tax.supersededBy);
  assert.equal((await ok('GET', `/api/books/docs/${moved.tax.supersededBy}`, null, M)).partyId, q.id);
});
