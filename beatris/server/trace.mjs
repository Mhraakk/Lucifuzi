// رهگیری — find anything by any number a person might have in hand (the document's tracking code M1405-00012 or a
// line/payment of it M1405-00012/L2, the 12-letter authenticity code, a card or slip reference, a bar serial, a cheque
// number or Sayad id, a customer code or mobile) and show its whole life: every version with who, when and why, every
// event of the hash-chained log, the payments, the bank reconciliation, and the exact postings it made to each account.
import * as B from '../public/js/books.mjs';
import * as TR from '../public/js/trade.mjs';
import { TRADE_COINS as COIN_TYPES, shownCoins } from '../public/js/coins.mjs';

export const ACTION_FA = {
  'doc.create': 'ثبت سند', 'doc.update': 'ویرایش / نسخه جدید', 'doc.void': 'ابطال', 'doc.tax': 'مالیات / مودیان', 'doc.print': 'چاپ',
  'doc.share': 'ارسال رسید', 'doc.pdf': 'خروجی PDF', 'doc.view': 'مشاهده', 'cheque.status': 'تغییر وضعیت چک', 'bank.recon': 'تطبیق بانک',
};
const latin = (s) => String(s ?? '').replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).trim();

export function makeTrace({ db, docOut, verifyCode }) {
  const names = () => Object.fromEntries(db.all('SELECT id, name FROM users').map((u) => [u.id, u.name]));
  const party = (id) => {
    const p = id && db.get('SELECT * FROM bk_parties WHERE id=?', id);
    return p ? { id: p.id, code: p.code, label: TR.partyLabel(p) } : null;
  };
  const accounts = () => Object.fromEntries(db.all('SELECT id, title, kind FROM bk_accounts').map((a) => [a.id, a]));
  function acctLabel(acct, acc) {
    const [k, id] = acct.split(/:(.*)/s);
    if (k === 'party') return `حساب ${party(id)?.label ?? 'مشتری'}`;
    if (k === 'cash' || k === 'bank') return `${k === 'cash' ? 'صندوق' : 'بانک'} ${acc[id]?.title ?? ''}`;
    if (acct === 'gold') return 'صندوق طلا (گرم ۷۵۰)';
    if (k === 'coin') return `موجودی ${COIN_TYPES[id]?.short ?? id}`;
    if (k === 'bar') return `شمش ${id}`;
    if (k === 'fx') return `موجودی ${TR.FX_CODES[id] ?? id}`;
    if (k === 'chq') return 'چک‌های در جریان';
    return acct;
  }
  function docTrace(r, part = null) {
    const d = docOut(r);
    const nm = names(), acc = accounts();
    const track = d.track;
    const c = d.calc;
    const lines = (c.lines ?? []).map((l, i) => ({ trace: `${track}/L${i + 1}`, ...l, src: d.lines?.[i] ?? {} }));
    const payments = (c.payments ?? []).map((p, i) => {
      const src = d.payments?.[i] ?? {};
      return { trace: `${track}/P${i + 1}`, method: p.method, label: B.payMethod(p.method)?.label ?? p.method, dir: p.dir, value: p.value, ref: src.ref ?? '', account: acc[src.account]?.title ?? '', card: src.card ? String(src.card).slice(-4) : '', chequeNo: src.chequeNo ?? '', due: src.due ?? '' };
    });
    const recon = db.all('SELECT * FROM bk_recon WHERE src=? OR src LIKE ?', r.id, `${r.id}#%`).map((x) => ({ trace: x.src.includes('#') ? `${track}/P${Number(x.src.split('#')[1]) + 1}` : track, ref: x.ref, at: x.at, by: nm[x.by] ?? '' }));
    const postings = db.all('SELECT acct, unit, SUM(amt) AS amt FROM bk_postings WHERE src=? GROUP BY acct, unit ORDER BY acct', r.id).filter((x) => Math.abs(x.amt) > 1e-9).map((x) => ({ acct: x.acct, label: acctLabel(x.acct, acc), unit: x.unit, amt: x.unit === 'G750' ? B.r3(x.amt) : x.unit === 'FX' || x.unit.startsWith('FX:') ? Math.round(x.amt * 100) / 100 : Math.round(x.amt) }));
    const versions = db.all('SELECT * FROM bk_versions WHERE doc_id=? ORDER BY version', r.id).map((v) => ({ version: v.version, status: v.status, at: v.at, by: nm[v.by] ?? '', reason: v.reason, verify: verifyCode(v.hash) }));
    const events = db.all('SELECT * FROM bk_log WHERE ref=? ORDER BY seq', r.id).map((e) => ({ seq: e.seq, at: e.at, by: nm[e.user_id] ?? '', action: e.action, label: ACTION_FA[e.action] ?? e.action, detail: JSON.parse(e.detail_json), hash: e.hash.slice(0, 12) }));
    return { kind: 'doc', id: r.id, track, part, type: r.type, typeLabel: B.DOC_TYPES[r.type]?.label ?? r.type, status: r.status, date: r.date, version: r.version, verify: d.verify, party: party(r.party_id), hawala: c.hawala ? { ...c.hawala, fromLabel: party(c.hawala.from)?.label, toLabel: party(c.hawala.to)?.label } : null, convert: c.convert ?? null, by: nm[r.created_by] ?? '', createdAt: r.created_at, issuedAt: r.issued_at, net: c.net, credit: c.credit, lines, payments, recon, postings, versions, events, note: d.note ?? '' };
  }
  function search(qRaw) {
    const q = latin(qRaw);
    if (q.length < 3) return { q, items: [], hint: 'دست‌کم ۳ کاراکتر: کد رهگیری، کد اصالت، شماره پیگیری، سریال، شماره چک یا کد مشتری.' };
    const items = [];
    const seen = new Set();
    const addDoc = (r, part, why) => {
      if (!r || seen.has(r.id)) return;
      seen.add(r.id);
      items.push({ ...docTrace(r, part), why });
    };
    const t = B.parseTrack(q);
    if (t) addDoc(db.get('SELECT * FROM bk_docs WHERE type=? AND fy=? AND no=?', t.type, t.fy, t.no), t.part, 'کد رهگیری');
    const hex = q.toLowerCase().replace(/[^0-9a-f]/g, '');
    if (/^[0-9a-f]{12}$/i.test(q.replace(/[\s-]/g, ''))) {
      const v = db.get('SELECT doc_id FROM bk_versions WHERE substr(hash,1,12)=? ORDER BY version DESC LIMIT 1', hex);
      if (v) addDoc(db.get('SELECT * FROM bk_docs WHERE id=?', v.doc_id), null, 'کد اصالت');
    }
    const digits = q.replace(/\D/g, '');
    if (!t && digits.length >= 3) {
      for (const r of db.all('SELECT * FROM bk_docs WHERE data_json LIKE ? ORDER BY date DESC LIMIT 20', `%"ref":"%${digits}%"%`)) addDoc(r, null, 'شماره پیگیری پرداخت');
      for (const c of db.all('SELECT * FROM bk_cheques WHERE no LIKE ? OR sayad LIKE ? LIMIT 10', `%${digits}%`, `%${digits}%`)) addDoc(db.get('SELECT * FROM bk_docs WHERE id=?', c.doc_id), null, `چک ${c.no || c.sayad}`);
    }
    const serial = TR.normSerial(q);
    if (!t && serial.length >= 3) {
      for (const r of db.all("SELECT DISTINCT acct FROM bk_postings WHERE acct LIKE ? LIMIT 10", `bar:%${serial}%`)) {
        const s = r.acct.slice(4);
        for (const d of db.all("SELECT * FROM bk_docs WHERE data_json LIKE ? ORDER BY date", `%"serial":"${s}"%`)) addDoc(d, null, `شمش ${s}`);
      }
    }
    const parties = [];
    if (!t && /^\d{3,11}$/.test(digits)) for (const p of db.all('SELECT * FROM bk_parties WHERE (CAST(code AS TEXT)=? OR mobile LIKE ? OR nid=?) AND deleted_at IS NULL LIMIT 10', digits, `%${digits}`, digits)) parties.push({ id: p.id, code: p.code, label: TR.partyLabel(p) });
    return { q, items: items.slice(0, 25), parties };
  }
  return { search, docTrace };
}
