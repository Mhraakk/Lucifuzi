import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { openDb } from './db.mjs';
import { makeSigner, resolveSecret } from './auth.mjs';
import { createApi, seedUsers, HttpError } from './api.mjs';
import { validateContent } from '../content/index.mjs';
import { MEDIA_NAME } from './media.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
const SECURITY = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' blob: data:; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

const PHOTO_BODY = 48 * 1024 * 1024; // two faces × (4096 + 2048 + relief) as base64
const COMPRESSED = new Set(['.webp', '.jpg', '.png', '.woff2']);

export function createServer({ db, secret, demo, quiet = false, mediaDir = path.resolve(process.env.BEATRIS_DATA_DIR || 'data', 'media'), marketOpts }) {
  const handle = createApi({ db, signer: makeSigner(secret), demo, mediaDir, marketOpts });

  /** Uploaded coin photos: immutable, server-named files on the data volume. */
  async function serveMedia(req, res, name) {
    const file = MEDIA_NAME.test(name) ? path.join(mediaDir, 'coins', name) : null;
    const st = file && (await stat(file).catch(() => null));
    if (!st || !st.isFile()) {
      res.writeHead(404, SECURITY);
      return res.end();
    }
    const etag = `"${st.size.toString(36)}-${st.mtimeMs.toString(36)}"`;
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, { ETag: etag, ...SECURITY });
      return res.end();
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream', 'Content-Length': st.size, ETag: etag, 'Cache-Control': 'public, max-age=31536000, immutable', ...SECURITY });
    if (req.method === 'HEAD') return res.end();
    createReadStream(file).on('error', () => res.destroy()).pipe(res);
  }
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
      entry = { etag, buf, gz: buf.length > 1024 && !COMPRESSED.has(path.extname(file)) ? gzipSync(buf) : null };
      fileCache.set(file, entry);
    }
    const headers = { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream', ETag: etag, 'Cache-Control': 'no-cache', ...SECURITY };
    const useGz = entry.gz && /\bgzip\b/.test(req.headers['accept-encoding'] ?? '');
    if (useGz) headers['Content-Encoding'] = 'gzip';
    res.writeHead(200, headers);
    res.end(req.method === 'HEAD' ? undefined : useGz ? entry.gz : entry.buf);
  }

  function readBody(req, limit = 128 * 1024) {
    return new Promise((resolve, reject) => {
      let size = 0;
      const chunks = [];
      req.on('data', (c) => {
        size += c.length;
        if (size > limit) {
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

  /** MCP (Streamable HTTP, JSON answers only): POST /mcp with a bearer token; no GET stream, no sessions. */
  const mcpHits = new Map();
  async function serveMcp(req, res, ip) {
    const H = { ...SECURITY, 'Cache-Control': 'no-store' };
    const json = (status, obj, extra = {}) => {
      res.writeHead(status, { ...H, 'Content-Type': 'application/json; charset=utf-8', ...extra });
      res.end(JSON.stringify(obj));
    };
    if (req.method !== 'POST') {
      res.writeHead(405, { ...H, Allow: 'POST' });
      return res.end();
    }
    // browsers from other sites may not drive this endpoint (DNS-rebinding protection from the MCP spec)
    const origin = req.headers.origin;
    let sameOrigin = true;
    try {
      sameOrigin = !origin || new URL(origin).host === req.headers.host;
    } catch {
      sameOrigin = false;
    }
    if (!sameOrigin) return json(403, { jsonrpc: '2.0', id: null, error: { code: -32000, message: 'Origin not allowed' } });
    const now = Date.now(), hit = mcpHits.get(ip);
    if (!hit || now - hit.t0 > 5 * 60000) mcpHits.set(ip, { t0: now, n: 1 });
    else if (++hit.n > 300) return json(429, { jsonrpc: '2.0', id: null, error: { code: -32000, message: 'Too many requests' } }, { 'Retry-After': '60' });
    if (mcpHits.size > 5000) mcpHits.clear();
    const auth = String(req.headers.authorization ?? '');
    if (!handle.mcpAuth(auth.startsWith('Bearer ') ? auth.slice(7).trim() : '')) return json(401, { jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Unauthorized: create an MCP token in Beatris (team → settings) and send it as "Authorization: Bearer <token>".' } }, { 'WWW-Authenticate': 'Bearer realm="beatris-mcp"' });
    let body;
    try {
      body = await readBody(req, 256 * 1024);
    } catch (e) {
      return json(e.status === 413 ? 413 : 400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
    }
    const out = await handle.mcp(body);
    if (out.status === 202) {
      res.writeHead(202, H);
      return res.end();
    }
    json(out.status, out.body);
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://local');
    const ip = String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? '').split(',')[0].trim();
    if (url.pathname === '/mcp')
      return serveMcp(req, res, ip).catch((e) => {
        if (!quiet) console.error('[beatris] mcp', e);
        if (!res.headersSent) res.writeHead(500);
        res.end();
      });
    if (!url.pathname.startsWith('/api/')) {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405);
        return res.end();
      }
      if (url.pathname.startsWith('/media/coins/'))
        return serveMedia(req, res, url.pathname.slice('/media/coins/'.length)).catch(() => {
          res.writeHead(500);
          res.end();
        });
      return serveStatic(req, res, url.pathname).catch(() => {
        res.writeHead(500);
        res.end();
      });
    }
    const send = (status, obj) => {
      const body = JSON.stringify(obj);
      const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', Vary: 'Accept-Encoding', ...SECURITY };
      if (body.length > 8192 && /\bgzip\b/.test(req.headers['accept-encoding'] ?? '')) {
        res.writeHead(status, { ...headers, 'Content-Encoding': 'gzip' });
        return res.end(gzipSync(body));
      }
      res.writeHead(status, headers);
      res.end(body);
    };
    try {
      const limit = url.pathname === '/api/designs' || url.pathname === '/api/market/bars' ? 2.5 * 1024 * 1024 : url.pathname === '/api/coin-photos' ? PHOTO_BODY : undefined;
      const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readBody(req, limit) : {};
      const out = await handle(req, url, body, ip);
      send(200, out);
    } catch (e) {
      if (e instanceof HttpError) return send(e.status, { error: e.message });
      if (!quiet) console.error('[beatris]', req.method, url.pathname, e);
      send(500, { error: 'خطای داخلی سرور. دوباره تلاش کنید.' });
    }
  });
  server.market = handle.market;
  return server;
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
  if (process.env.NODE_ENV !== 'test') server.market.start(); // price feed polling, when the owner has switched one on
  // redeploys send SIGTERM: stop accepting, drop idle keep-alive sockets, give requests in flight 5 s
  const stop = () => {
    const done = () => {
      try {
        db.close();
      } catch {
        /* already closed */
      }
      process.exit(0);
    };
    server.close(done);
    server.closeIdleConnections();
    setTimeout(done, 5000).unref();
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
