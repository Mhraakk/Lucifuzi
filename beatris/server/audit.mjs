// ممیز — the automatic auditor of the shop books. It re-reads the ledger the way a careful accountant would at the
// end of every day (and after every document): the event chain, stock that went below zero, cash below zero, prices far
// from the market, the same bank reference used twice, a document typed twice, credit limits, old receivables,
// cheques past due, unreconciled bank lines, provisional assays, large anonymous trades, back-dated documents,
// and the shop's exposure to a move of the مظنه. Read-only: it never changes a document, it only points at one.
import * as B from '../public/js/books.mjs';
import * as TR from '../public/js/trade.mjs';
import { TRADE_COINS as COIN_TYPES, shownCoins } from '../public/js/coins.mjs';
import { jalaliOf } from '../public/js/ta.mjs';

export const AUDIT_DEFAULTS = { auditMazPct: 3, auditCoinPct: 5, agingDays: 30, auditBigAnon: 5_000_000_000, auditKyc: 10_000_000_000, bankOpenDays: 3, assayDays: 3 };
const SEV = { high: 25, mid: 8, low: 2, info: 0 };
const SYS = { id: null, role: 'owner', name: 'ممیز' };
const days = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
const r = (v) => B.fmtMoney(v, 'rial');
const jd = (iso) => {
  const [y, m, d] = jalaliOf(String(iso).slice(0, 10));
  return B.faNum(`${y}/${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}`);
};
const g = (v) => `${B.fmtG(v)} گرم ۷۵۰`;
const unitWord = (u) => (u === 'G750' ? 'طلا' : u.startsWith('COIN:') ? COIN_TYPES[u.slice(5)]?.short ?? u : u.startsWith('FX:') ? TR.FX_CODES[u.slice(3)] ?? u : u);

export function makeAudit({ db, call, settings, verifyLog, tehranDay, livePrices, isAdmin }) {
  const opt = () => ({ ...AUDIT_DEFAULTS, ...Object.fromEntries(Object.keys(AUDIT_DEFAULTS).filter((k) => Number.isFinite(Number(settings()[k]))).map((k) => [k, Number(settings()[k])])) });
  const docRef = (d) => ({ doc: d.id, label: `${B.DOC_TYPES[d.type]?.short ?? ''} ${B.faNum(d.no)}` });
  const partyName = (id) => {
    const p = id && db.get('SELECT * FROM bk_parties WHERE id=?', id);
    return p ? TR.partyLabel(p) : 'مشتری گذری';
  };

  // price checks of one document against the live board (today) — shared by the full run and the after-save check
  function priceFindings(d, o, lp) {
    const out = [];
    if (d.type !== 'trade' || lp.sample) return out;
    const data = JSON.parse(d.data_json), c = JSON.parse(d.calc_json);
    c.lines.forEach((l, i) => {
      if (!l.priced) return;
      const src = data.lines[i] ?? {};
      if ((l.kind === 'melt' || l.kind === 'bar') && lp.mazaneh) {
        const m = l.mazaneh || l.impliedMazaneh;
        const dev = ((m - lp.mazaneh) / lp.mazaneh) * 100;
        // a buy far above, or a sale far below, the board costs the shop money; the other way costs the customer
        if (Math.abs(dev) > o.auditMazPct) out.push({ code: 'price.maz', sev: (l.dir === 'in' && dev > 0) || (l.dir === 'out' && dev < 0) ? 'mid' : 'low', title: `مظنه ${l.dir === 'in' ? 'خرید' : 'فروش'} ${B.faNum(Math.abs(dev).toFixed(1))}٪ ${dev > 0 ? 'بالاتر' : 'پایین‌تر'} از تابلو`, detail: `ردیف ${B.faNum(i + 1)}: ${r(m)} در برابر مظنه تابلو ${r(lp.mazaneh)}${(l.dir === 'in' && dev > 0) || (l.dir === 'out' && dev < 0) ? ' — به زیان مغازه' : ''}.`, ref: docRef(d) });
      }
      if (l.kind === 'coin' && (src.basis ?? 'count') === 'count' && lp.price[`COIN:${l.coin}`]) {
        const each = l.value / l.count, mk = lp.price[`COIN:${l.coin}`];
        const dev = ((each - mk) / mk) * 100;
        if (Math.abs(dev) > o.auditCoinPct) out.push({ code: 'price.coin', sev: (l.dir === 'in' && dev > 0) || (l.dir === 'out' && dev < 0) ? 'mid' : 'low', title: `قیمت ${COIN_TYPES[l.coin]?.short} ${B.faNum(Math.abs(dev).toFixed(1))}٪ ${dev > 0 ? 'بالاتر' : 'پایین‌تر'} از تابلو`, detail: `هر عدد ${r(each)} در برابر ${r(mk)}.`, ref: docRef(d) });
      }
    });
    return out;
  }
  function docFindings(d, o) {
    const out = [];
    const c = JSON.parse(d.calc_json), data = JSON.parse(d.data_json);
    if (d.type === 'trade') {
      const big = Math.max(c.buys ?? 0, c.sells ?? 0);
      if (!d.party_id && big >= o.auditBigAnon) out.push({ code: 'kyc.anon', sev: 'mid', title: 'معامله کلان بدون ثبت هویت مشتری', detail: `${r(big)} بدون طرف حساب؛ برای معاملات بزرگ مشخصات و کد ملی خریدار/فروشنده را ثبت کنید (آستانه در تنظیمات).`, ref: docRef(d) });
      c.lines.forEach((l, i) => {
        if (l.kind === 'melt' && (l.fineness < 500 || l.fineness > 999.9)) out.push({ code: 'odd.fineness', sev: 'low', title: `عیار غیرعادی ${B.faNum(l.fineness)}`, detail: `ردیف ${B.faNum(i + 1)} آبشده؛ ری‌گیری را دوباره بخوانید.`, ref: docRef(d) });
      });
    }
    const created = (d.created_at ?? '').slice(0, 10);
    if (created && days(d.date, created) > 1) out.push({ code: 'backdate', sev: 'low', title: 'سند با تاریخ گذشته', detail: `تاریخ سند ${jd(d.date)} ولی ثبت در ${jd(created)}.`, ref: docRef(d) });
    // the same document typed twice: same customer, day, kind and lines, within fifteen minutes
    const twin = db.get("SELECT id, type, no FROM bk_docs WHERE id<>? AND status='final' AND type=? AND date=? AND COALESCE(party_id,'')=COALESCE(?, '') AND json_extract(data_json,'$.lines')=json_extract(?, '$.lines') AND json_extract(data_json,'$.payments')=json_extract(?, '$.payments') AND abs(julianday(created_at)-julianday(?))*1440 < 15", d.id, d.type, d.date, d.party_id, d.data_json, d.data_json, d.created_at);
    if (twin && (data.lines?.length || data.payments?.length)) out.push({ code: 'dup.doc', sev: 'high', title: 'احتمال ثبت تکراری', detail: `همین سند با همین ردیف‌ها و پرداخت‌ها برای همین طرف حساب در کمتر از ۱۵ دقیقه یک بار دیگر ثبت شده (${B.DOC_TYPES[twin.type]?.short} ${B.faNum(twin.no)}).`, ref: docRef(d) });
    return out;
  }

  function run(user) {
    const o = opt(), today = tehranDay(), lp = livePrices();
    const F = [];
    // 1. the event chain
    const chain = verifyLog();
    F.push(chain.ok ? { code: 'chain.ok', sev: 'info', title: 'زنجیره رویدادها سالم است', detail: `${B.faNum(chain.checked)} رویداد با هش sha256 پشت‌سرهم وارسی شد.` } : { code: 'chain.broken', sev: 'high', title: 'زنجیره رویدادها شکسته است', detail: `از رویداد ${B.faNum(chain.brokenAt)} به بعد با هش قبلی نمی‌خواند؛ احتمال دست‌کاری مستقیم دیتابیس.` });
    // 2. vault: nothing may go below zero
    const v = call('GET', '/api/books/vault', SYS);
    if (v.gold < 0) F.push({ code: 'stock.neg', sev: 'high', title: 'طلای صندوق منفی است', detail: `${g(-v.gold)} بیش از موجودی فروخته یا تحویل شده؛ خرید ثبت‌نشده یا ثبت اشتباه.`, link: '/books/vault' });
    for (const [k, n] of Object.entries(v.coins)) if (n < 0) F.push({ code: 'stock.neg', sev: 'high', title: `موجودی ${COIN_TYPES[k]?.short} منفی است`, detail: `${B.faNum(-n)} عدد بیش از موجودی بیرون رفته؛ خرید یا افتتاحیه ثبت نشده است.`, link: '/books/vault' });
    for (const [k, n] of Object.entries(v.fx)) if (n < 0) F.push({ code: 'stock.neg', sev: 'high', title: `موجودی ${TR.FX_CODES[k]} منفی است`, detail: `${B.faNum(-n)} واحد بیش از موجودی.`, link: '/books/vault' });
    const accs = db.all('SELECT id, kind, title FROM bk_accounts');
    for (const a of accs) {
      const bal = a.kind === 'cash' ? v.cash[a.id] : v.bank[a.id];
      if (a.kind === 'cash' && bal < 0) F.push({ code: 'cash.neg', sev: 'high', title: `صندوق «${a.title}» منفی است`, detail: `${r(-bal)} بیشتر از موجودی پرداخت شده؛ دریافتی ثبت نشده یا پرداخت از حساب دیگر بوده.`, link: '/books/cash' });
    }
    // 3. exposure: how much one percent of the مظنه moves the shop's net worth
    const cust = v.custody ?? {};
    const netG = v.gold - (cust.G750?.owedByShop ?? 0) + (cust.G750?.owedToShop ?? 0);
    if (lp.price.G750 && Math.abs(netG) > 0.001) F.push({ code: 'risk.gold', sev: netG < 0 ? 'mid' : 'info', title: netG < 0 ? 'موقعیت طلای مغازه منفی است (فروش باز)' : 'موقعیت طلای مغازه مثبت است', detail: `خالص ${g(Math.abs(netG))}؛ هر ۱٪ ${netG < 0 ? 'افزایش' : 'کاهش'} مظنه حدود ${r(Math.round(Math.abs(netG) * lp.price.G750 * 0.01))} از ارزش خالص کم می‌کند.`, link: '/books/vault' });
    // 4. customers: credit limit, old receivables, identity for large turnover
    const bals = new Map();
    for (const x of db.all("SELECT acct, unit, SUM(amt) AS s, MAX(date) AS last FROM bk_postings WHERE acct LIKE 'party:%' GROUP BY acct, unit")) {
      const id = x.acct.slice(6);
      const b = bals.get(id) ?? {};
      b[x.unit] = { s: x.s, last: x.last };
      bals.set(id, b);
    }
    for (const p of db.all('SELECT * FROM bk_parties WHERE deleted_at IS NULL')) {
      const b = bals.get(p.id) ?? {};
      const irr = Math.round(b.IRR?.s ?? 0);
      if (p.credit_limit > 0 && irr > p.credit_limit) F.push({ code: 'credit.limit', sev: 'mid', title: `بیش از سقف اعتبار: ${TR.partyLabel(p)}`, detail: `بدهکار مالی ${r(irr)}؛ سقف ${r(p.credit_limit)}.`, link: `/books/party/${p.id}` });
      for (const [u, x] of Object.entries(b)) {
        if (x.s <= (u === 'G750' ? 0.001 : 0.5)) continue;
        const age = days(x.last, today);
        if (age >= o.agingDays) F.push({ code: 'aging', sev: age >= o.agingDays * 3 ? 'mid' : 'low', title: `مطالبه معوق ${B.faNum(age)} روزه: ${TR.partyLabel(p)}`, detail: `${u === 'IRR' ? `بدهکار مالی ${r(Math.round(x.s))}` : u.startsWith('BAR:') ? `شمش ${B.faNum(u.slice(4))} نزد اوست` : `بدهکار جنسی ${u === 'G750' ? g(x.s) : `${B.faNum(Math.round(x.s * 100) / 100)} ${unitWord(u)}`}`}؛ آخرین گردش ${jd(x.last)}.`, link: `/books/party/${p.id}` });
      }
      if (!p.nid) {
        const turn = db.get("SELECT COALESCE(SUM(ABS(amt)),0) AS t FROM bk_postings WHERE acct=? AND unit='IRR'", `party:${p.id}`).t;
        if (turn >= o.auditKyc) F.push({ code: 'kyc.nid', sev: 'low', title: `کد ملی ثبت نشده: ${TR.partyLabel(p)}`, detail: `گردش ریالی ${r(Math.round(turn))} بدون کد ملی؛ برای فاکتور رسمی و قوانین پول‌شویی لازم است.`, link: `/books/party/${p.id}` });
      }
    }
    // 5. documents: duplicates, prices, anonymous large trades, back-dating (last 60 days)
    const since = new Date(Date.parse(`${today}T00:00:00Z`) - 60 * 86400000).toISOString().slice(0, 10);
    const docs = db.all("SELECT * FROM bk_docs WHERE status='final' AND date>=? ORDER BY date", since);
    for (const d of docs) {
      F.push(...docFindings(d, o));
      if (d.date === today) F.push(...priceFindings(d, o, lp));
    }
    // the same bank reference on two documents is a double entry or a reused slip
    const refs = new Map();
    for (const d of docs) {
      const data = JSON.parse(d.data_json);
      for (const p of data.payments ?? []) {
        const ref = B.digitsOnly(p.ref ?? '');
        if (ref.length < 4 || !['pos', 'c2c', 'slip', 'a2a', 'satna', 'paya', 'pol', 'havale', 'gateway'].includes(p.method)) continue;
        const k = `${p.method}|${ref}`;
        refs.set(k, [...(refs.get(k) ?? []), d]);
      }
    }
    for (const [k, list] of refs) {
      const uniq = [...new Map(list.map((d) => [d.id, d])).values()];
      if (uniq.length > 1) F.push({ code: 'dup.ref', sev: 'high', title: `شماره پیگیری تکراری ${B.faNum(k.split('|')[1])}`, detail: `در ${uniq.map((d) => `${B.DOC_TYPES[d.type]?.short} ${B.faNum(d.no)}`).join('، ')} — یک فیش یا تراکنش دو بار ثبت شده است؟`, ref: docRef(uniq[1]) });
    }
    // 6. provisional assays, cheques, bank lines
    for (const x of call('GET', '/api/books/conditional', SYS).items) {
      const age = days(x.date, today);
      F.push({ code: 'assay', sev: age > o.assayDays ? 'mid' : 'info', title: `آبشده شرطی منتظر عیار (${B.faNum(age)} روز)`, detail: `${B.fmtG(x.weight)} گرم با عیار موقت ${B.faNum(x.fineness)} — ${x.party ?? ''}`, ref: { doc: x.doc, label: `سند ${B.faNum(x.no)}` } });
    }
    for (const c of db.all("SELECT * FROM bk_cheques WHERE status IN ('hand','deposited','issued') AND due<?", today)) F.push({ code: 'cheque.due', sev: 'mid', title: `چک ${c.dir === 'in' ? 'دریافتی' : 'پرداختی'} از سررسید گذشته`, detail: `${r(c.amount)} · سررسید ${jd(c.due)} · ${partyName(c.party_id)}`, link: '/books/cash' });
    if (isAdmin(user)) {
      for (const a of accs.filter((x) => x.kind === 'bank')) {
        const led = call('GET', '/api/books/bank/:id', SYS, { params: { id: a.id } });
        const old = led.rows.filter((x) => !x.reconciled && days(x.date, today) > o.bankOpenDays);
        if (old.length) F.push({ code: 'bank.open', sev: 'low', title: `${B.faNum(old.length)} ردیف بانک «${a.title}» تطبیق نشده`, detail: `قدیمی‌ترین ${jd(old[0].date)}؛ صورتحساب بانک را در صفحه تطبیق بچسبانید.`, link: `/books/bank/${a.id}` });
      }
    }
    // 7. what changed today: edits and voids with their reasons
    for (const x of db.all("SELECT v.*, d.type, d.no, u.name FROM bk_versions v JOIN bk_docs d ON d.id=v.doc_id LEFT JOIN users u ON u.id=v.by WHERE v.version>1 AND substr(v.at,1,10)=?", today)) F.push({ code: 'edit', sev: 'info', title: `${x.status === 'void' ? 'ابطال' : 'ویرایش'} ${B.DOC_TYPES[x.type]?.short} ${B.faNum(x.no)}`, detail: `${x.name ?? ''}: ${x.reason || 'بدون دلیل'}`, ref: { doc: x.doc_id, label: `نسخه ${B.faNum(x.version)}` } });
    const order = { high: 0, mid: 1, low: 2, info: 3 };
    F.sort((a, b) => order[a.sev] - order[b.sev]);
    const score = Math.max(0, 100 - F.reduce((s, f) => s + SEV[f.sev], 0));
    const count = { high: 0, mid: 0, low: 0, info: 0 };
    for (const f of F) count[f.sev]++;
    return { at: new Date().toISOString(), day: today, score, count, findings: F, thresholds: o };
  }
  // after-save check of one document (shown on the receipt)
  function doc(id) {
    const d = db.get('SELECT * FROM bk_docs WHERE id=?', id);
    if (!d) return { findings: [] };
    const o = opt();
    return { findings: [...docFindings(d, o), ...(d.date === tehranDay() ? priceFindings(d, o, livePrices()) : [])] };
  }
  return { run, doc };
}
