// Builds beatris.ico from PNG files (Windows Vista+ reads PNG-compressed icon entries). No dependencies.
//   node make-ico.mjs out.ico a-256.png a-48.png a-32.png a-16.png
import { readFileSync, writeFileSync } from 'node:fs';

const [out, ...pngs] = process.argv.slice(2);
const imgs = pngs.map((p) => {
  const b = readFileSync(p);
  if (b.readUInt32BE(0) !== 0x89504e47) throw new Error(`${p} is not a PNG`);
  return { b, w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
});
const head = Buffer.alloc(6 + 16 * imgs.length);
head.writeUInt16LE(0, 0);
head.writeUInt16LE(1, 2); // icon
head.writeUInt16LE(imgs.length, 4);
let off = head.length;
imgs.forEach((im, i) => {
  const e = 6 + i * 16;
  head.writeUInt8(im.w >= 256 ? 0 : im.w, e);
  head.writeUInt8(im.h >= 256 ? 0 : im.h, e + 1);
  head.writeUInt16LE(1, e + 4); // planes
  head.writeUInt16LE(32, e + 6); // bits per pixel
  head.writeUInt32LE(im.b.length, e + 8);
  head.writeUInt32LE(off, e + 12);
  off += im.b.length;
});
writeFileSync(out, Buffer.concat([head, ...imgs.map((x) => x.b)]));
console.log(`${out}: ${imgs.map((x) => x.w).join(', ')} px`);
