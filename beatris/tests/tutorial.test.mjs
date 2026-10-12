// spec 0025 §5 and amendment 2: the tutorial films are what the chapter list says they are. Each MP4's own header
// (the H.264 sample entry and its avcC record) gives the frame size, the profile and the level; they must match the
// width, height and codec in chapters.json that the help page relies on: 1920×1080 on the desktop, 1080×2338 standing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, openSync, readSync, closeSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'public', 'media', 'tutorial');
const list = JSON.parse(readFileSync(path.join(DIR, 'chapters.json'), 'utf8')).chapters;

/** The boxes between `start` and `end`: { type, start (payload), end }. */
function boxes(buf, start, end) {
  const out = [];
  for (let i = start; i + 8 <= end; ) {
    let size = buf.readUInt32BE(i), hdr = 8;
    if (size === 1) (size = Number(buf.readBigUInt64BE(i + 8))), (hdr = 16);
    else if (size === 0) size = end - i;
    if (size < hdr) break;
    out.push({ type: buf.toString('latin1', i + 4, i + 8), start: i + hdr, end: Math.min(end, i + size) });
    i += size;
  }
  return out;
}
const child = (buf, box, type, skip = 0) => boxes(buf, box.start + skip, box.end).find((b) => b.type === type);

/** What the MP4 says about itself (the head of the file is enough: the index comes first, for streaming). */
function mp4Info(file) {
  const fd = openSync(file, 'r');
  const buf = Buffer.alloc(Math.min(statSync(file).size, 4 << 20));
  readSync(fd, buf, 0, buf.length, 0);
  closeSync(fd);
  const top = boxes(buf, 0, buf.length);
  const moov = top.find((b) => b.type === 'moov');
  const mdatAt = top.findIndex((b) => b.type === 'mdat');
  assert.ok(moov, `${path.basename(file)}: no index (moov) at the head`);
  const mvhd = child(buf, moov, 'mvhd');
  const v1 = buf[mvhd.start] === 1;
  const scale = buf.readUInt32BE(mvhd.start + (v1 ? 20 : 12));
  const dur = v1 ? Number(buf.readBigUInt64BE(mvhd.start + 24)) : buf.readUInt32BE(mvhd.start + 16);
  for (const trak of boxes(buf, moov.start, moov.end).filter((b) => b.type === 'trak')) {
    const stbl = child(buf, child(buf, child(buf, trak, 'mdia'), 'minf'), 'stbl');
    const stsd = child(buf, stbl, 'stsd');
    const avc = child(buf, stsd, 'avc1', 8); // version, flags and the entry count come first
    if (!avc) continue;
    const avcC = child(buf, avc, 'avcC', 78); // the visual sample entry's own fields come first
    const hex = (x) => x.toString(16).padStart(2, '0');
    return {
      width: buf.readUInt16BE(avc.start + 24),
      height: buf.readUInt16BE(avc.start + 26),
      codec: `avc1.${hex(buf[avcC.start + 1])}${hex(buf[avcC.start + 2])}${hex(buf[avcC.start + 3])}`,
      seconds: dur / scale,
      streamable: mdatAt === -1 || top.indexOf(moov) < mdatAt,
    };
  }
  throw new Error(`${path.basename(file)}: no H.264 track`);
}

test('every tutorial film is full HD (standing: 1080×2338) and its chapter entry says exactly what it is', () => {
  assert.ok(list.length >= 22);
  for (const c of list) {
    const want = c.vertical ? { width: 1080, height: 2338 } : { width: 1920, height: 1080 };
    assert.deepEqual({ width: c.width, height: c.height }, want, `chapter ${c.n}: chapters.json size`);
    const info = mp4Info(path.join(ROOT, 'public', c.file));
    assert.deepEqual({ width: info.width, height: info.height }, want, `chapter ${c.n}: the MP4 itself`);
    assert.equal(info.codec, c.codec, `chapter ${c.n}: the codec the help page names`);
    assert.equal(info.codec, c.vertical ? 'avc1.640032' : 'avc1.640028', `chapter ${c.n}: High profile at level ${c.vertical ? '5.0' : '4.0'}`);
    assert.ok(info.streamable, `chapter ${c.n}: the index is ahead of the picture, so it plays while it loads`);
    assert.ok(Math.abs(info.seconds - c.seconds) <= 1, `chapter ${c.n}: ${info.seconds} s, the list says ${c.seconds}`);
    assert.equal(c.bytes, statSync(path.join(ROOT, 'public', c.file)).size, `chapter ${c.n}: bytes`);
    for (const f of [c.webm, c.poster]) assert.ok(existsSync(path.join(ROOT, 'public', f)) && statSync(path.join(ROOT, 'public', f)).size > 1000, `chapter ${c.n}: ${f}`);
    assert.equal(c.film, true, `chapter ${c.n}: the finished film (cards and sound), not the bare recording`);
  }
});
