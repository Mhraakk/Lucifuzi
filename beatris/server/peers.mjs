// تطبیق با همکار — two shops that both keep their books here link the account each keeps for the other (with a
// one-time code the other side types in), and see at any moment whether the two books agree: per unit (rial, gram
// 750, each coin, currency, bar) my balance for them must be exactly the opposite of their balance for me. When it is
// not, the lines of both sides are paired (same unit, opposite amount, within a few days) and what is left over is the
// document that is missing on one side. Read-only: nothing here books anything in either shop.
// The registry lives in the main database; each side sees only the account the two shops keep for each other.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { ADMIN_ROLES } from './auth.mjs';
import { PlatformError, MAIN } from './platform.mjs';
import { SHOP_NAME } from '../public/js/crown.mjs';

export const PEERS_SCHEMA = `
CREATE TABLE IF NOT EXISTS peer_invites (code_hash TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, party_id TEXT NOT NULL, created_by TEXT, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, used_at TEXT);
CREATE TABLE IF NOT EXISTS peer_links (id TEXT PRIMARY KEY, a_tenant TEXT NOT NULL, a_party TEXT NOT NULL, b_tenant TEXT NOT NULL, b_party TEXT NOT NULL, created_at TEXT NOT NULL, a_user TEXT, b_user TEXT, ended_at TEXT, ended_by TEXT);
CREATE INDEX IF NOT EXISTS idx_peer_a ON peer_links(a_tenant, a_party);
CREATE INDEX IF NOT EXISTS idx_peer_b ON peer_links(b_tenant, b_party);
`;

const now = () => new Date().toISOString();
const HOUR = 36e5;
const DAY = 864e5;
const CODE_ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const hashCode = (c) => createHash('sha256').update(`peer:${c}`).digest('hex');
export const normCode = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/[01IO]/g, '');
/** How close two amounts of the same unit must be to count as the same entry. */
const TOL = (u) => (u === 'G750' ? 0.0015 : u === 'IRR' ? 0.5 : 1e-6);
const days = (a, b) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY;

/**
 * Compare the two sides. mine/theirs: { balance: {unit: amt}, lines: [{date, unit, amt, ...}] } where a positive amount
 * is "the other shop owes" in each book. Agreement means mine + theirs = 0 for every unit.
 */
export function comparePeer(mine, theirs, { windowDays = 3 } = {}) {
  const units = [...new Set([...Object.keys(mine.balance ?? {}), ...Object.keys(theirs.balance ?? {})])];
  const rows = units
    .map((u) => {
      const a = mine.balance?.[u] ?? 0, b = theirs.balance?.[u] ?? 0;
      const diff = a + b;
      return { unit: u, mine: a, theirs: b, diff: Math.abs(diff) <= TOL(u) ? 0 : diff };
    })
    .filter((r) => r.mine || r.theirs);
  // pair the lines: same unit, opposite amount, closest date first (and within the window)
  const A = mine.lines.filter((l) => l.amt).map((l, i) => ({ ...l, i }));
  const Bl = theirs.lines.filter((l) => l.amt).map((l, i) => ({ ...l, i }));
  const cand = [];
  for (const a of A) for (const b of Bl) if (a.unit === b.unit && Math.abs(a.amt + b.amt) <= TOL(a.unit) && days(a.date, b.date) <= windowDays) cand.push([days(a.date, b.date), a, b]);
  cand.sort((x, y) => x[0] - y[0] || x[1].date.localeCompare(y[1].date));
  const usedA = new Set(), usedB = new Set(), pairs = [];
  for (const [, a, b] of cand) {
    if (usedA.has(a.i) || usedB.has(b.i)) continue;
    usedA.add(a.i);
    usedB.add(b.i);
    pairs.push({ mine: a, theirs: b });
  }
  const strip = ({ i, ...l }) => l;
  return {
    agree: rows.every((r) => r.diff === 0),
    units: rows,
    matched: pairs.length,
    onlyMine: A.filter((a) => !usedA.has(a.i)).map(strip),
    onlyTheirs: Bl.filter((b) => !usedB.has(b.i)).map(strip),
  };
}

/** platform: { handleFor, tenantRow }. */
export function createPeers({ mainDb, platform }) {
  mainDb.raw.exec(PEERS_SCHEMA);
  const shopName = (tn) => {
    const h = platform.handleFor(tn);
    const get = (k) => {
      try {
        return JSON.parse(h.db.get('SELECT value_json FROM settings WHERE key=?', k)?.value_json ?? '{}');
      } catch {
        return {};
      }
    };
    return get('brand').shopName || get('books').legalName || (tn === MAIN ? SHOP_NAME : platform.tenantRow(tn)?.name) || 'فروشگاه همکار';
  };
  const party = (tn, id) => platform.handleFor(tn).db.get('SELECT id, name, alias, mobile, code FROM bk_parties WHERE id=? AND deleted_at IS NULL', id);
  const label = (p) => (p ? [p.name, p.alias && `(${p.alias})`].filter(Boolean).join(' ') : '—');
  const activeFor = (tn, pid) => mainDb.get('SELECT * FROM peer_links WHERE ended_at IS NULL AND ((a_tenant=? AND a_party=?) OR (b_tenant=? AND b_party=?))', tn, pid, tn, pid);
  /** The link seen from shop tn: my side and the other side. */
  const sides = (l, tn) => (l.a_tenant === tn ? { me: { tn: l.a_tenant, party: l.a_party }, peer: { tn: l.b_tenant, party: l.b_party } } : { me: { tn: l.b_tenant, party: l.b_party }, peer: { tn: l.a_tenant, party: l.a_party } });
  const view = (tn, pid, since) => {
    const v = platform.handleFor(tn).books.partyView(pid);
    return {
      balance: v.balance ?? {},
      lines: v.statement.filter((r) => r.amt && (!since || r.date >= since)).map((r) => ({ date: r.date, unit: r.unit, amt: r.amt, type: r.doc?.type ?? 'opening', track: r.doc?.track ?? null })),
    };
  };
  /** Balances are all-time; the paired lines cover the last 90 days (summary: balances only). */
  function compare(l, tn, { lines = true } = {}) {
    const { me, peer } = sides(l, tn);
    const since = lines ? new Date(Date.now() - 90 * DAY).toISOString().slice(0, 10) : '9999';
    return { ...comparePeer(view(me.tn, me.party, since), view(peer.tn, peer.party, since)), since: lines ? since : null };
  }
  const out = (l, tn, withCompare) => {
    const { me, peer } = sides(l, tn);
    let peerShop = '';
    let cmp = null;
    let error = null;
    try {
      peerShop = shopName(peer.tn);
      if (withCompare) cmp = compare(l, tn, { lines: withCompare === 'full' });
    } catch (e) {
      error = e instanceof PlatformError ? e.message : 'دفتر همکار در دسترس نیست.';
    }
    const p = party(me.tn, me.party);
    return { id: l.id, createdAt: l.created_at, party: { id: me.party, label: label(p) }, peerShop, compare: cmp && withCompare !== 'full' ? { agree: cmp.agree, units: cmp.units } : cmp, error };
  };

  /** method, path (after /api/peers), body, user, tn (the caller's shop). */
  function route(method, path, body, user, tn) {
    if (!user) throw new PlatformError(401, 'ورود لازم است.');
    if (!ADMIN_ROLES.has(user.role)) throw new PlatformError(403, 'تطبیق با همکار مخصوص مدیر و مالک است.');
    if (method === 'GET' && path === '') {
      const links = mainDb.all('SELECT * FROM peer_links WHERE ended_at IS NULL AND (a_tenant=? OR b_tenant=?) ORDER BY created_at DESC', tn, tn);
      const pending = mainDb.all('SELECT party_id, expires_at FROM peer_invites WHERE tenant_id=? AND used_at IS NULL AND expires_at>? ORDER BY created_at DESC', tn, now());
      return { items: links.map((l) => out(l, tn, 'summary')), pending: pending.map((p) => ({ partyId: p.party_id, party: label(party(tn, p.party_id)), expiresAt: p.expires_at })) };
    }
    if (method === 'POST' && path === '/invite') {
      const p = party(tn, String(body.partyId ?? ''));
      if (!p) throw new PlatformError(400, 'حساب همکار را از فهرست مشتریان انتخاب کنید.');
      if (activeFor(tn, p.id)) throw new PlatformError(409, 'این حساب قبلاً به یک همکار وصل شده است.');
      const b = randomBytes(8);
      const raw = Array.from(b, (x) => CODE_ABC[x % CODE_ABC.length]).join('');
      const expiresAt = new Date(Date.now() + 24 * HOUR).toISOString();
      mainDb.run('DELETE FROM peer_invites WHERE tenant_id=? AND party_id=? AND used_at IS NULL', tn, p.id);
      mainDb.run('INSERT INTO peer_invites(code_hash,tenant_id,party_id,created_by,created_at,expires_at) VALUES (?,?,?,?,?,?)', hashCode(raw), tn, p.id, user.id, now(), expiresAt);
      return { code: `${raw.slice(0, 4)}-${raw.slice(4)}`, expiresAt, party: label(p) };
    }
    if (method === 'POST' && path === '/accept') {
      const code = normCode(body.code);
      const inv = code.length === 8 ? mainDb.get('SELECT * FROM peer_invites WHERE code_hash=?', hashCode(code)) : null;
      if (!inv || inv.used_at) throw new PlatformError(404, 'این کد درست نیست یا قبلاً استفاده شده است.');
      if (inv.expires_at < now()) throw new PlatformError(410, 'مهلت این کد تمام شده است؛ از همکار کد تازه بخواهید.');
      if (inv.tenant_id === tn) throw new PlatformError(400, 'این کد را فروشگاه خودتان ساخته است؛ باید در فروشگاه همکار وارد شود.');
      const p = party(tn, String(body.partyId ?? ''));
      if (!p) throw new PlatformError(400, 'حساب همکار را از فهرست مشتریان انتخاب کنید.');
      if (activeFor(tn, p.id) || activeFor(inv.tenant_id, inv.party_id)) throw new PlatformError(409, 'یکی از این دو حساب قبلاً به همکار دیگری وصل شده است.');
      if (!party(inv.tenant_id, inv.party_id)) throw new PlatformError(410, 'حساب سازنده کد دیگر وجود ندارد.');
      const id = randomUUID();
      mainDb.tx(() => {
        mainDb.run('UPDATE peer_invites SET used_at=? WHERE code_hash=?', now(), inv.code_hash);
        mainDb.run('INSERT INTO peer_links(id,a_tenant,a_party,b_tenant,b_party,created_at,a_user,b_user) VALUES (?,?,?,?,?,?,?,?)', id, inv.tenant_id, inv.party_id, tn, p.id, now(), inv.created_by, user.id);
      });
      return out(mainDb.get('SELECT * FROM peer_links WHERE id=?', id), tn, 'summary');
    }
    const m = /^\/([0-9a-f-]{36})$/.exec(path);
    const l = m && mainDb.get('SELECT * FROM peer_links WHERE id=? AND ended_at IS NULL AND (a_tenant=? OR b_tenant=?)', m[1], tn, tn);
    if (m && !l) throw new PlatformError(404, 'این اتصال پیدا نشد.');
    if (l && method === 'GET') return out(l, tn, 'full');
    if (l && method === 'DELETE') {
      mainDb.run('UPDATE peer_links SET ended_at=?, ended_by=? WHERE id=?', now(), `${tn}:${user.id}`, l.id);
      return { ok: true };
    }
    throw new PlatformError(404, 'مسیر API وجود ندارد.');
  }
  return { route, compare };
}
