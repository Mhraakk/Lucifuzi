// Test-side reference of the SSP1126 PC⇄POS protocol (Saman / SEP): ISO-8583:1987 packing with BCD numbers and
// lengths, the DE64 DES-CBC MAC, and a fake terminal that speaks it over TCP. Used to check pos-bridge.ps1 end to end.
// Pure-JS DES because Node's OpenSSL 3 keeps des-cbc in the legacy provider.
import net from 'node:net';

/* ---------------- DES (FIPS 46-3) ---------------- */
const PC1 = [57, 49, 41, 33, 25, 17, 9, 1, 58, 50, 42, 34, 26, 18, 10, 2, 59, 51, 43, 35, 27, 19, 11, 3, 60, 52, 44, 36, 63, 55, 47, 39, 31, 23, 15, 7, 62, 54, 46, 38, 30, 22, 14, 6, 61, 53, 45, 37, 29, 21, 13, 5, 28, 20, 12, 4];
const PC2 = [14, 17, 11, 24, 1, 5, 3, 28, 15, 6, 21, 10, 23, 19, 12, 4, 26, 8, 16, 7, 27, 20, 13, 2, 41, 52, 31, 37, 47, 55, 30, 40, 51, 45, 33, 48, 44, 49, 39, 56, 34, 53, 46, 42, 50, 36, 29, 32];
const SHIFTS = [1, 1, 2, 2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 1];
const IP = [58, 50, 42, 34, 26, 18, 10, 2, 60, 52, 44, 36, 28, 20, 12, 4, 62, 54, 46, 38, 30, 22, 14, 6, 64, 56, 48, 40, 32, 24, 16, 8, 57, 49, 41, 33, 25, 17, 9, 1, 59, 51, 43, 35, 27, 19, 11, 3, 61, 53, 45, 37, 29, 21, 13, 5, 63, 55, 47, 39, 31, 23, 15, 7];
const FP = [40, 8, 48, 16, 56, 24, 64, 32, 39, 7, 47, 15, 55, 23, 63, 31, 38, 6, 46, 14, 54, 22, 62, 30, 37, 5, 45, 13, 53, 21, 61, 29, 36, 4, 44, 12, 52, 20, 60, 28, 35, 3, 43, 11, 51, 19, 59, 27, 34, 2, 42, 10, 50, 18, 58, 26, 33, 1, 41, 9, 49, 17, 57, 25];
const E = [32, 1, 2, 3, 4, 5, 4, 5, 6, 7, 8, 9, 8, 9, 10, 11, 12, 13, 12, 13, 14, 15, 16, 17, 16, 17, 18, 19, 20, 21, 20, 21, 22, 23, 24, 25, 24, 25, 26, 27, 28, 29, 28, 29, 30, 31, 32, 1];
const P = [16, 7, 20, 21, 29, 12, 28, 17, 1, 15, 23, 26, 5, 18, 31, 10, 2, 8, 24, 14, 32, 27, 3, 9, 19, 13, 30, 6, 22, 11, 4, 25];
const SBOX = [
  [14, 4, 13, 1, 2, 15, 11, 8, 3, 10, 6, 12, 5, 9, 0, 7, 0, 15, 7, 4, 14, 2, 13, 1, 10, 6, 12, 11, 9, 5, 3, 8, 4, 1, 14, 8, 13, 6, 2, 11, 15, 12, 9, 7, 3, 10, 5, 0, 15, 12, 8, 2, 4, 9, 1, 7, 5, 11, 3, 14, 10, 0, 6, 13],
  [15, 1, 8, 14, 6, 11, 3, 4, 9, 7, 2, 13, 12, 0, 5, 10, 3, 13, 4, 7, 15, 2, 8, 14, 12, 0, 1, 10, 6, 9, 11, 5, 0, 14, 7, 11, 10, 4, 13, 1, 5, 8, 12, 6, 9, 3, 2, 15, 13, 8, 10, 1, 3, 15, 4, 2, 11, 6, 7, 12, 0, 5, 14, 9],
  [10, 0, 9, 14, 6, 3, 15, 5, 1, 13, 12, 7, 11, 4, 2, 8, 13, 7, 0, 9, 3, 4, 6, 10, 2, 8, 5, 14, 12, 11, 15, 1, 13, 6, 4, 9, 8, 15, 3, 0, 11, 1, 2, 12, 5, 10, 14, 7, 1, 10, 13, 0, 6, 9, 8, 7, 4, 15, 14, 3, 11, 5, 2, 12],
  [7, 13, 14, 3, 0, 6, 9, 10, 1, 2, 8, 5, 11, 12, 4, 15, 13, 8, 11, 5, 6, 15, 0, 3, 4, 7, 2, 12, 1, 10, 14, 9, 10, 6, 9, 0, 12, 11, 7, 13, 15, 1, 3, 14, 5, 2, 8, 4, 3, 15, 0, 6, 10, 1, 13, 8, 9, 4, 5, 11, 12, 7, 2, 14],
  [2, 12, 4, 1, 7, 10, 11, 6, 8, 5, 3, 15, 13, 0, 14, 9, 14, 11, 2, 12, 4, 7, 13, 1, 5, 0, 15, 10, 3, 9, 8, 6, 4, 2, 1, 11, 10, 13, 7, 8, 15, 9, 12, 5, 6, 3, 0, 14, 11, 8, 12, 7, 1, 14, 2, 13, 6, 15, 0, 9, 10, 4, 5, 3],
  [12, 1, 10, 15, 9, 2, 6, 8, 0, 13, 3, 4, 14, 7, 5, 11, 10, 15, 4, 2, 7, 12, 9, 5, 6, 1, 13, 14, 0, 11, 3, 8, 9, 14, 15, 5, 2, 8, 12, 3, 7, 0, 4, 10, 1, 13, 11, 6, 4, 3, 2, 12, 9, 5, 15, 10, 11, 14, 1, 7, 6, 0, 8, 13],
  [4, 11, 2, 14, 15, 0, 8, 13, 3, 12, 9, 7, 5, 10, 6, 1, 13, 0, 11, 7, 4, 9, 1, 10, 14, 3, 5, 12, 2, 15, 8, 6, 1, 4, 11, 13, 12, 3, 7, 14, 10, 15, 6, 8, 0, 5, 9, 2, 6, 11, 13, 8, 1, 4, 10, 7, 9, 5, 0, 15, 14, 2, 3, 12],
  [13, 2, 8, 4, 6, 15, 11, 1, 10, 9, 3, 14, 5, 0, 12, 7, 1, 15, 13, 8, 10, 3, 7, 4, 12, 5, 6, 11, 0, 14, 9, 2, 7, 11, 4, 1, 9, 12, 14, 2, 0, 6, 10, 13, 15, 3, 5, 8, 2, 1, 14, 7, 4, 10, 8, 13, 15, 12, 9, 0, 3, 5, 6, 11],
];
const bits = (buf) => [...buf].flatMap((b) => [7, 6, 5, 4, 3, 2, 1, 0].map((i) => (b >> i) & 1));
const perm = (src, table) => table.map((i) => src[i - 1]);
const toBytes = (bs) => Buffer.from(Array.from({ length: bs.length / 8 }, (_, i) => bs.slice(i * 8, i * 8 + 8).reduce((a, b) => (a << 1) | b, 0)));
function subkeys(key) {
  const k = perm(bits(key), PC1);
  let c = k.slice(0, 28), d = k.slice(28);
  return SHIFTS.map((s) => {
    c = [...c.slice(s), ...c.slice(0, s)];
    d = [...d.slice(s), ...d.slice(0, s)];
    return perm([...c, ...d], PC2);
  });
}
function desBlock(block, keys) {
  const x = perm(bits(block), IP);
  let l = x.slice(0, 32), r = x.slice(32);
  for (const k of keys) {
    const e = perm(r, E).map((b, i) => b ^ k[i]);
    const s = [];
    for (let j = 0; j < 8; j++) {
      const six = e.slice(j * 6, j * 6 + 6);
      const v = SBOX[j][(six[0] << 5) | (six[5] << 4) | (six[1] << 3) | (six[2] << 2) | (six[3] << 1) | six[4]];
      s.push((v >> 3) & 1, (v >> 2) & 1, (v >> 1) & 1, v & 1);
    }
    const f = perm(s, P);
    [l, r] = [r, l.map((b, i) => b ^ f[i])];
  }
  return toBytes(perm([...r, ...l], FP));
}
export function desCbc(data, key, iv = Buffer.alloc(8)) {
  const keys = subkeys(key);
  const out = Buffer.alloc(data.length);
  let prev = Buffer.from(iv);
  for (let o = 0; o < data.length; o += 8) {
    const blk = Buffer.from(data.subarray(o, o + 8).map((b, i) => b ^ prev[i]));
    prev = desBlock(blk, keys);
    prev.copy(out, o);
  }
  return out;
}

/* ---------------- ISO-8583:1987, SSP1126 dialect ---------------- */
export const MAC_KEY = Buffer.from('23ABE182CAB5647D', 'hex');
export function mac(body) {
  const pad = body.length % 8 ? 8 - (body.length % 8) : 0;
  const enc = desCbc(Buffer.concat([body, Buffer.alloc(pad)]), MAC_KEY);
  return enc.subarray(enc.length - 8);
}
// [type, length, lengthDigits(0 fixed | 2 | 3)] for the fields this dialect uses
const DEF = {
  2: ['n', 19, 2], 3: ['n', 6, 0], 4: ['n', 12, 0], 6: ['n', 12, 0], 11: ['n', 6, 0], 12: ['n', 6, 0], 13: ['n', 4, 0], 24: ['n', 3, 0], 25: ['n', 2, 0],
  37: ['a', 12, 0], 38: ['a', 6, 0], 39: ['a', 2, 0], 41: ['a', 8, 0], 49: ['a', 3, 0], 64: ['b', 8, 0],
};
for (const f of [46, 47, 48, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63]) DEF[f] = ['a', 999, 3];
const bcd = (digits) => Buffer.from(digits.length % 2 ? `0${digits}` : digits, 'hex');
const lenPrefix = (n, d) => (d === 2 ? bcd(String(n).padStart(2, '0')) : bcd(String(n).padStart(4, '0')));
/** Pack {field: string} with the MTI 0300 and a DE64 MAC. */
export function pack(fields, { badMac = false } = {}) {
  const present = Object.keys(fields).map(Number).filter((f) => f !== 64);
  const bitmap = Buffer.alloc(8);
  for (const f of [...present, 64]) bitmap[(f - 1) >> 3] |= 0x80 >> ((f - 1) & 7);
  const parts = [bcd('0300'), bitmap];
  for (const f of present.sort((a, b) => a - b)) {
    const [t, len, d] = DEF[f];
    const v = String(fields[f]);
    if (t === 'n') parts.push(d ? Buffer.concat([lenPrefix(v.length, d), bcd(v)]) : bcd(v.padStart(len, '0')));
    else if (d) parts.push(lenPrefix(v.length, d), Buffer.from(v, 'latin1'));
    else parts.push(Buffer.from(v.padEnd(len, ' '), 'latin1'));
  }
  const body = Buffer.concat(parts);
  const m = mac(body);
  if (badMac) m[0] ^= 0xff;
  return Buffer.concat([body, m]);
}
export function unpack(buf) {
  let off = 2;
  const bm = buf.subarray(off, off + 8);
  off += 8;
  const out = { mti: buf.subarray(0, 2).toString('hex') };
  for (let f = 2; f <= 64; f++) {
    if (!(bm[(f - 1) >> 3] & (0x80 >> ((f - 1) & 7)))) continue;
    const def = DEF[f];
    if (!def) throw new Error(`field ${f} not in the test table`);
    const [t, len, d] = def;
    let n = len;
    if (d) {
      const lb = d === 2 ? 1 : 2;
      n = Number(buf.subarray(off, off + lb).toString('hex'));
      off += lb;
    }
    if (t === 'n') {
      const nb = Math.ceil(n / 2);
      out[f] = buf.subarray(off, off + nb).toString('hex').slice(-n);
      off += nb;
    } else {
      out[f] = t === 'b' ? buf.subarray(off, off + n).toString('hex').toUpperCase() : buf.subarray(off, off + n).toString('latin1').replace(/\0+$/, '').trimEnd();
      off += n;
    }
  }
  out.macOk = mac(buf.subarray(0, buf.length - 8)).equals(buf.subarray(buf.length - 8));
  return out;
}
/** POS→PC framing: 2-byte big-endian length, header 60 00 00 00 00, then the message. */
export const frame = (msg) => {
  const head = Buffer.from([0, 0, 0x60, 0, 0, 0, 0]);
  head.writeUInt16BE(msg.length + 5, 0);
  return Buffer.concat([head, msg]);
};

/**
 * A terminal on 127.0.0.1 that answers a PC-starter purchase. `script(req)` decides the outcome:
 *  { rc: '00' | '51' | '98' …, rrn, mask, silent: true (never answer), badMac: true, noFinal: true }
 * Every message the PC sends is recorded in `received` (unpacked) for assertions.
 */
export function fakeTerminal(script = () => ({ rc: '00' })) {
  const received = [];
  const server = net.createServer((sock) => {
    let pending = Buffer.alloc(0);
    let plan = null;
    sock.on('error', () => {});
    sock.on('data', (chunk) => {
      pending = Buffer.concat([pending, chunk]);
      // PC→POS has no length prefix: parse whole messages greedily (the bridge sends one at a time)
      let m;
      try {
        m = unpack(pending);
      } catch {
        return;
      }
      pending = Buffer.alloc(0);
      received.push(m);
      const tid = '12345678';
      if (m[3] === '000000' || m[3] === '410000') {
        plan = script(m);
        if (plan.silent) return;
        sock.write(frame(pack({ 12: '104831', 13: '1023', 39: '15', 41: tid })));
        setTimeout(() => {
          if (m[3] === '410000') return sock.write(frame(pack({ 3: '410003', 39: '00', 41: tid })));
          if (plan.rc === '98' || plan.rc === '99') return sock.write(frame(pack({ 3: '000000', 39: plan.rc, 41: tid })));
          sock.write(frame(pack({ 3: '000008', 11: '801912', 37: plan.rrn ?? '863583063456', 38: '123456', 39: plan.rc, 41: tid, 62: plan.mask ?? '603799******1234' }, { badMac: !!plan.badMac })));
        }, plan.delay ?? 150);
      } else if (m[3] === '000004') {
        if (!plan?.noFinal) sock.write(frame(pack({ 39: '17', 41: tid })));
      } else if (m[3] === '000001') sock.end();
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ port: server.address().port, received, close: () => new Promise((r) => server.close(r)) })));
}
