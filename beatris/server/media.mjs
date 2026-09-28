// Coin reference photos: header validation, storage on the data volume, and the built-in set.
// Uploaded images are processed in the manager's browser (public/js/coinphoto.mjs) and arrive here as
// finished textures; the server never decodes pixels, it only checks format, dimensions and size.
import { readFileSync } from 'node:fs';
import { mkdir, writeFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PHOTO_KINDS = {
  c4: { size: 4096, max: 9 * 1024 * 1024 },
  c2: { size: 2048, max: 4 * 1024 * 1024 },
  h: { size: 2048, max: 4 * 1024 * 1024 },
};
export const PHOTO_SIDES = ['obv', 'rev'];
const EXT = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' };

/** Read width/height from a WebP, JPEG or PNG header. Returns null for anything else or malformed data. */
export function imageInfo(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 32) return null;
  // PNG
  if (buf.readUInt32BE(0) === 0x89504e47 && buf.readUInt32BE(4) === 0x0d0a1a0a && buf.toString('ascii', 12, 16) === 'IHDR') return { type: 'image/png', w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  // WebP
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = buf.toString('ascii', 12, 16);
    if (chunk === 'VP8 ' && buf[23] === 0x9d && buf[24] === 0x01 && buf[25] === 0x2a) return { type: 'image/webp', w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
    if (chunk === 'VP8L' && buf[20] === 0x2f) {
      const b = buf.readUInt32LE(21);
      return { type: 'image/webp', w: (b & 0x3fff) + 1, h: ((b >>> 14) & 0x3fff) + 1 };
    }
    if (chunk === 'VP8X') return { type: 'image/webp', w: buf.readUIntLE(24, 3) + 1, h: buf.readUIntLE(27, 3) + 1 };
    return null;
  }
  // JPEG: walk the markers to the first start-of-frame
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) return null;
      const m = buf[i + 1];
      if (m === 0xff) {
        i++;
        continue;
      }
      if (m === 0xd9 || m === 0xda) return null;
      const len = buf.readUInt16BE(i + 2);
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(m)) return { type: 'image/jpeg', h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      i += 2 + len;
    }
  }
  return null;
}

/** data:image/…;base64,… → { mime, buf }; null if not a base64 image data URL. */
export function decodeDataUrl(s) {
  const m = typeof s === 'string' && /^data:(image\/(?:webp|jpeg|png));base64,([A-Za-z0-9+/=]+)$/.exec(s);
  if (!m) return null;
  return { mime: m[1], buf: Buffer.from(m[2], 'base64') };
}

/** Validate one texture; returns { buf, ext } or a Persian error message. */
export function checkTexture(dataUrl, kind) {
  const spec = PHOTO_KINDS[kind];
  const d = decodeDataUrl(dataUrl);
  if (!d) return { error: 'تصویر باید WebP، JPEG یا PNG باشد.' };
  if (d.buf.length > spec.max) return { error: `حجم تصویر ${kind} بیش از حد مجاز است.` };
  const info = imageInfo(d.buf);
  if (!info || info.type !== d.mime) return { error: 'محتوای فایل با نوع اعلام‌شده نمی‌خواند.' };
  if (info.w !== spec.size || info.h !== spec.size) return { error: `ابعاد ${kind} باید ${spec.size}×${spec.size} باشد.` };
  return { buf: d.buf, ext: EXT[d.mime] };
}

/** Write files atomically (tmp + rename); on any failure the files already written are removed. */
export async function storeFiles(dir, files) {
  await mkdir(dir, { recursive: true });
  const done = [];
  try {
    for (const f of files) {
      const tmp = path.join(dir, `.${f.name}.tmp`);
      await writeFile(tmp, f.buf);
      await rename(tmp, path.join(dir, f.name));
      done.push(f.name);
    }
  } catch (e) {
    await removeFiles(dir, done);
    throw e;
  }
}
export const removeFiles = (dir, names) => Promise.all(names.map((n) => unlink(path.join(dir, n)).catch(() => {})));

/** File names the server itself generates: id-side-kind.ext */
export const MEDIA_NAME = /^[a-z0-9]{6,32}-(obv|rev)-(c4|c2|h)\.(webp|jpg|png)$/;

let builtin = null;
/** Built-in reference set shipped with the app (public/coins/photos/manifest.json). */
export function builtinPhotos() {
  if (builtin) return builtin;
  try {
    const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'coins', 'photos', 'manifest.json');
    builtin = JSON.parse(readFileSync(file, 'utf8')).items.map((it) => ({ ...it, builtin: true }));
  } catch {
    builtin = [];
  }
  return builtin;
}
