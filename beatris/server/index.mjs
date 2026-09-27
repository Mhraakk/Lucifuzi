import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { openDb } from './db.mjs';
import { makeSigner, resolveSecret } from './auth.mjs';
import { createApi, seedUsers, HttpError } from './api.mjs';
import { validateContent } from '../content/index.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
const SECURITY = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' blob: data:; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

export function createServer({ db, secret, demo, quiet = false }) {
  const handle = createApi({ db, signer: makeSigner(secret), demo });
  const fileCache = new Map();

  async function serveStatic(req, res, pathname) {
    let rel = decodeURIComponent(pathname);
    if (rel.includes('\0')) rel = '/';
    let file = path.join(ROOT, path.normalize(rel));
    if (!file.startsWith(ROOT)) file = path.join(ROOT, 'index.html');
    let st = await stat(file).catch(() => null);
    if (!st || st.isDirectory() || !path.extname(file)) {
      file = path.join(ROOT, 'index.html');
      st = await stat(file);
    }
    const etag = `"${st.size.toString(36)}-${st.mtimeMs.toString(36)}"`;
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, { ETag: etag, ...SECURITY });
      return res.end();
    }
    let entry = fileCache.get(file);
    if (!entry || entry.etag !== etag) {
      const buf = await readFile(file);
      entry = { etag, buf, gz: buf.length > 1024 ? gzipSync(buf) : null };
      fileCache.set(file, entry);
    }
    const headers = { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream', ETag: etag, 'Cache-Control': 'no-cache', ...SECURITY };
    const useGz = entry.gz && /\bgzip\b/.test(req.headers['accept-encoding'] ?? '');
    if (useGz) headers['Content-Encoding'] = 'gzip';
    res.writeHead(200, headers);
    res.end(req.method === 'HEAD' ? undefined : useGz ? entry.gz : entry.buf);
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      let size = 0;
      const chunks = [];
      req.on('data', (c) => {
        size += c.length;
        if (size > 128 * 1024) {
          reject(new HttpError(413, 'درخواست بیش از حد بزرگ است.'));
          req.destroy();
        } else chunks.push(c);
      });
      req.on('end', () => {
        if (!chunks.length) return resolve({});
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch {
          reject(new HttpError(400, 'بدنه درخواست JSON معتبر نیست.'));
        }
      });
      req.on('error', reject);
    });
  }

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://local');
    const ip = String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? '').split(',')[0].trim();
    if (!url.pathname.startsWith('/api/')) {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405);
        return res.end();
      }
      return serveStatic(req, res, url.pathname).catch(() => {
        res.writeHead(500);
        res.end();
      });
    }
    const send = (status, obj) => {
      const body = JSON.stringify(obj);
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SECURITY });
      res.end(body);
    };
    try {
      const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readBody(req) : {};
      const out = await handle(req, url, body, ip);
      send(200, out);
    } catch (e) {
      if (e instanceof HttpError) return send(e.status, { error: e.message });
      if (!quiet) console.error('[beatris]', req.method, url.pathname, e);
      send(500, { error: 'خطای داخلی سرور. دوباره تلاش کنید.' });
    }
  });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const errors = validateContent();
  if (errors.length) {
    console.error('[beatris] content errors:\n' + errors.join('\n'));
    process.exit(1);
  }
  const demo = process.env.BEATRIS_DEMO === 'true' || process.env.BEATRIS_DEMO_OTP === 'true';
  const db = openDb();
  seedUsers(db, process.env, demo);
  const server = createServer({ db, secret: resolveSecret(), demo });
  const port = Number(process.env.PORT) || 3000;
  server.listen(port, '0.0.0.0', () => console.log(`[beatris] listening on :${port}${demo ? ' (demo accounts on)' : ''}`));
  const stop = () => server.close(() => (db.close(), process.exit(0)));
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
