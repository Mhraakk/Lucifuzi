import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { openDb } from './db.mjs';
import { makeSigner, makeSealer, resolveSecret } from './auth.mjs';
import { createApi, seedUsers, HttpError } from './api.mjs';
import { validateContent } from '../content/index.mjs';
import { MEDIA_NAME } from './media.mjs';
import { createPlatform, PlatformError, MAIN } from './platform.mjs';
import { createPeers } from './peers.mjs';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { createBus } from './bus.mjs';
import { createMetrics } from './metrics.mjs';
import { backupAll, listBackups } from './backup.mjs';
import { createFlags } from './flags.mjs';
import { can } from './rbac.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.mp4': 'video/mp4', '.webm': 'video/webm', '.vtt': 'text/vtt; charset=utf-8' };
const SECURITY = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' blob: data:; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

const PHOTO_BODY = 48 * 1024 * 1024; // two faces × (4096 + 2048 + relief) as base64
const COMPRESSED = new Set(['.webp', '.jpg', '.png', '.woff2']);
const STREAMED = new Set(['.mp4', '.webm']); // large media: streamed from disk with byte ranges (seeking), never held in memory

/** `bytes=a-b` → [start, end] inside size, or null when unsatisfiable. Only the first range is served. */
export function parseRange(h, size) {
  const m = /^bytes=(\d*)-(\d*)/.exec(h ?? '');
  if (!m || (!m[1] && !m[2])) return null;
  let start;
  let end;
  if (!m[1]) {
    start = Math.max(0, size - Number(m[2]));
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
  }
  return start <= end && start < size ? [start, end] : null;
}

export function createServer({ db, secret, demo, quiet = false, mediaDir = path.resolve(process.env.BEATRIS_DATA_DIR || 'data', 'media'), marketOpts, tenantsDir = db.raw.location?.() ? path.join(path.dirname(db.raw.location()), 'tenants') : ':memory:', backupDir = db.raw.location?.() ? path.join(path.dirname(db.raw.location()), 'backups') : null, rateLimit = 1500, accessLog = process.env.BEATRIS_ACCESS_LOG === '1' }) {
  const signer = makeSigner(secret);
  const sealer = makeSealer(secret);
  const metrics = createMetrics();
  const onEvent = (name) => metrics.inc(`ai.${name}`); // model gateway and guardrail events, all shops together
  const flags = createFlags({ db });
  const handle = createApi({ db, signer, demo, mediaDir, marketOpts, sealer, onEvent, flags: () => flags.forShop(MAIN) });
  // every other shop: its own database file under tenants/, the shared price feed of the main shop
  const platform = createPlatform({
    mainDb: db,
    signer,
    mainHandle: handle,
    openTenant: (row) => createApi({ db: openDb(tenantsDir, `${row.id}.db`), signer, demo: false, mediaDir, tenant: row, sharedMarket: handle.market, sealer, onEvent, flags: () => flags.forShop(row.id) }),
  });

  const peers = createPeers({ mainDb: db, platform, enabled: (tn) => flags.on(tn, 'peers') });

  /* ---------- operations: metrics, event bus + job queue, persistent market worker, backups (spec 0001 #8 #18 #20) ---------- */
  const bus = createBus({ db, onError: (e, ctx) => (metrics.inc('bus.errors'), quiet || console.error('[beatris] bus', JSON.stringify(ctx), e?.message)) });
  let lastBackup = null;
  bus.handle('market.poll', async () => {
    const run = handle.market.poll();
    if (!run) return;
    const st = await run;
    metrics.inc(st.ok ? 'market.poll.ok' : 'market.poll.fail');
    if (st.ok) bus.publish('market.tick', { at: st.at ?? new Date().toISOString(), board: handle.market.board() });
  });
  const allDbs = () => [['main', db], ...[...platform.all()].filter(([id]) => id !== MAIN).map(([id, h]) => [id, h.db])];
  const runBackup = () => {
    if (!backupDir) throw new HttpError(409, 'پشتیبان‌گیری برای دیتابیس درون حافظه غیرفعال است.');
    lastBackup = backupAll({ dbs: allDbs(), dir: backupDir });
    metrics.inc('backup.ok');
    return lastBackup;
  };
  bus.handle('ops.backup', () => void runBackup());
  /** Deep health: the database answers, the price feed is fresh, the queue has no dead jobs, a recent backup exists. */
  function health() {
    const out = { ok: true, time: new Date().toISOString(), db: 'ok' };
    try {
      db.get('SELECT 1 AS x');
    } catch {
      out.db = 'down';
      out.ok = false;
    }
    const cfg = handle.market.config();
    const at = handle.market.status()?.at;
    out.feed = cfg.mode === 'off' ? 'off' : at && Date.now() - Date.parse(at) < 3 * handle.market.everyMs() + 120000 ? 'ok' : 'stale';
    const q = bus.stats();
    out.queue = { queued: q.queued, dead: q.dead };
    const b = backupDir ? listBackups(backupDir)[0] : null;
    out.backup = b ? { stamp: b.stamp, files: b.files } : null;
    return out;
  }
  const mainDb = db;
  function ops(method, pathname, req, body = {}) {
    const user = handle.authenticate(req);
    if (!user) throw new HttpError(401, 'ورود لازم است.');
    if (!platform.isVendor(user) || !can(user, 'ops.view', { main: true })) throw new HttpError(403, 'این بخش مخصوص ارائه‌دهنده است.');
    if (method === 'GET' && pathname === '/api/ops/metrics') return { health: health(), metrics: metrics.snapshot(), bus: bus.stats(), backups: backupDir ? listBackups(backupDir).slice(0, 14) : [], lastBackup, market: handle.market.status() };
    if (method === 'POST' && pathname === '/api/ops/backup') return runBackup();
    const flagView = () => {
      const l = flags.list();
      return { flags: l.flags, all: l.all, overrides: l.shops, shops: mainDb.all('SELECT id, name FROM tenants ORDER BY created_at') };
    };
    if (method === 'GET' && pathname === '/api/ops/flags') return flagView();
    if (method === 'PUT' && pathname === '/api/ops/flags') {
      const scope = String(body.scope ?? 'all');
      if (scope !== 'all' && scope !== MAIN && !platform.tenantRow(scope)) throw new HttpError(400, 'فروشگاه پیدا نشد.');
      try {
        flags.set(scope, String(body.key ?? ''), body.value ?? null, user.id);
      } catch (e) {
        throw new HttpError(400, e.message);
      }
      return flagView();
    }
    const m = /^\/api\/ops\/jobs\/([0-9a-f-]{36})\/retry$/.exec(pathname);
    if (method === 'POST' && m) return { ok: bus.retry(m[1]) };
    throw new HttpError(404, 'مسیر API وجود ندارد.');
  }
  /* real-time market data (spec 0001 #6): one Server-Sent Events stream per open page, fed by market.tick */
  const streams = new Set();
  function marketStream(req, res, send) {
    const auth = String(req.headers.authorization ?? '');
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    const tn = (token && platform.tenantOfToken(token)) || MAIN;
    const user = platform.handleFor(tn).authenticate(req);
    if (!user) throw new HttpError(401, 'ورود لازم است.');
    if (!flags.on(tn, 'market.stream')) throw new HttpError(403, 'قیمت زنده برای این فروشگاه خاموش است.');
    if (streams.size >= 500) throw new HttpError(503, 'اتصال‌های زنده پر است؛ صفحه قیمت‌ها را عادی باز کنید.');
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no', ...SECURITY });
    const write = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    write('board', handle.market.board());
    const off = bus.subscribe('market.tick', (d) => write('board', d.board));
    const beat = setInterval(() => res.write(': ping\n\n'), 25000);
    beat.unref?.();
    streams.add(res);
    metrics.inc('stream.opened');
    req.on('close', () => {
      off();
      clearInterval(beat);
      streams.delete(res);
    });
  }
  const perIp = new Map();
  const overLimit = (ip) => {
    const t = Date.now();
    const h = perIp.get(ip);
    if (!h || t - h.t0 > 60000) {
      if (perIp.size > 20000) perIp.clear();
      perIp.set(ip, { t0: t, n: 1 });
      return false;
    }
    return ++h.n > rateLimit;
  };

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
    if (STREAMED.has(path.extname(file))) {
      const base = { 'Content-Type': MIME[path.extname(file)], ETag: etag, 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=86400', ...SECURITY };
      if (req.headers.range) {
        const r = parseRange(req.headers.range, st.size);
        if (!r) {
          res.writeHead(416, { 'Content-Range': `bytes */${st.size}`, ...SECURITY });
          return res.end();
        }
        res.writeHead(206, { ...base, 'Content-Range': `bytes ${r[0]}-${r[1]}/${st.size}`, 'Content-Length': r[1] - r[0] + 1 });
        if (req.method === 'HEAD') return res.end();
        return createReadStream(file, { start: r[0], end: r[1] }).on('error', () => res.destroy()).pipe(res);
      }
      res.writeHead(200, { ...base, 'Content-Length': st.size });
      if (req.method === 'HEAD') return res.end();
      return createReadStream(file).on('error', () => res.destroy()).pipe(res);
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
    // API gateway (spec 0001 #3): request id, timing, metrics, a per-IP ceiling, structured logs
    const t0 = performance.now();
    const hdrId = String(req.headers['x-request-id'] ?? '');
    const rid = /^[\w-]{8,64}$/.test(hdrId) ? hdrId : randomUUID();
    res.setHeader('x-request-id', rid);
    res.on('finish', () => {
      const ms = performance.now() - t0;
      metrics.record(req.method, url.pathname, res.statusCode, ms);
      if (accessLog || res.statusCode >= 500 || ms > 1500) quiet || console.log(JSON.stringify({ at: new Date().toISOString(), rid, m: req.method, p: url.pathname, s: res.statusCode, ms: Math.round(ms) }));
    });
    const send = (status, obj) => {
      const body = JSON.stringify(obj);
      const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', Vary: 'Accept-Encoding', 'Server-Timing': `app;dur=${(performance.now() - t0).toFixed(1)}`, ...SECURITY };
      if (body.length > 8192 && /\bgzip\b/.test(req.headers['accept-encoding'] ?? '')) {
        res.writeHead(status, { ...headers, 'Content-Encoding': 'gzip' });
        return res.end(gzipSync(body));
      }
      res.writeHead(status, headers);
      res.end(body);
    };
    if (url.pathname !== '/api/health' && overLimit(ip)) {
      res.setHeader('Retry-After', '60');
      return send(429, { error: 'درخواست‌ها بیش از حد است؛ یک دقیقه بعد دوباره تلاش کنید.', requestId: rid });
    }
    if (url.pathname === '/api/health' && url.searchParams.get('deep') === '1') {
      const h = health();
      return send(h.ok ? 200 : 503, h);
    }
    if (url.pathname === '/api/market/stream' && req.method === 'GET') {
      try {
        return marketStream(req, res);
      } catch (e) {
        if (e instanceof HttpError || e instanceof PlatformError) return send(e.status, { error: e.message, requestId: rid });
        throw e;
      }
    }
    try {
      const limit = url.pathname === '/api/designs' || url.pathname === '/api/market/bars' ? 2.5 * 1024 * 1024 : url.pathname === '/api/coin-photos' ? PHOTO_BODY : /^\/api\/books\/bars\/[^/]+\/card$/.test(url.pathname) ? 1.5 * 1024 * 1024 : undefined;
      const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readBody(req, limit) : {};
      const auth = String(req.headers.authorization ?? '');
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
      let out;
      if (url.pathname === '/api/auth/login' && req.method === 'POST') out = platform.login(body, ip, req.headers['user-agent']);
      else if (url.pathname.startsWith('/api/ops/')) {
        if (token && platform.tenantOfToken(token) && platform.tenantOfToken(token) !== MAIN) throw new HttpError(403, 'این بخش مخصوص ارائه‌دهنده است.');
        out = ops(req.method, url.pathname, req, body);
      }
      else if (url.pathname.startsWith('/api/vendor/')) {
        if (token && platform.tenantOfToken(token) && platform.tenantOfToken(token) !== MAIN) throw new HttpError(403, 'این بخش مخصوص ارائه‌دهنده است.');
        const user = handle.authenticate(req);
        if (!user) throw new HttpError(401, 'ورود لازم است.');
        out = platform.vendor(req.method, url.pathname, body, user);
      } else if (url.pathname === '/api/peers' || url.pathname.startsWith('/api/peers/')) {
        // تطبیق با همکار spans two shops: the registry is in the main database, each side's books in its own
        const tn = (token && platform.tenantOfToken(token)) || MAIN;
        out = peers.route(req.method, url.pathname.slice('/api/peers'.length), body, platform.handleFor(tn).authenticate(req), tn);
      } else if (url.pathname.startsWith('/api/public/statement/')) {
        // a customer's statement link names its shop: «<shop>~<random>»
        const tok = decodeURIComponent(url.pathname.split('/')[4] ?? '');
        const tn = tok.split('~')[0];
        if (!/^(main|t_[0-9a-f]{12})$/.test(tn)) throw new HttpError(404, 'این برگه وجود ندارد.');
        out = await (tn === MAIN ? handle : platform.handleFor(tn))(req, url, body, ip);
      } else if (url.pathname.startsWith('/api/verify/')) {
        // the authenticity page is public and printed on every shop's invoices: look the code up in each shop
        let found = null;
        for (const [, h] of platform.all()) {
          try {
            found = await h(req, url, body, ip);
            break;
          } catch (e) {
            if (!(e instanceof HttpError) || e.status !== 404) throw e;
          }
        }
        if (!found) throw new HttpError(404, 'سندی با این کد پیدا نشد.');
        out = found;
      } else {
        const tn = (token && platform.tenantOfToken(token)) || MAIN;
        out = await (tn === MAIN ? handle : platform.handleFor(tn))(req, url, body, ip);
      }
      send(200, out);
    } catch (e) {
      if (e instanceof HttpError || e instanceof PlatformError) return send(e.status, { error: e.message, requestId: rid });
      if (!quiet) console.error('[beatris]', rid, req.method, url.pathname, e);
      send(500, { error: 'خطای داخلی سرور. دوباره تلاش کنید.', requestId: rid });
    }
  });
  server.market = handle.market;
  server.bus = bus;
  server.metrics = metrics;
  server.health = health;
  server.streams = streams;
  /** The persistent workers: the market feed every minute (it polls when its own period is due) and a daily backup. */
  server.startWorkers = () => {
    bus.every('market', 60000, 'market.poll', {}, { maxAttempts: 1 });
    if (backupDir) bus.every('backup', 24 * 3600 * 1000, 'ops.backup', {}, { maxAttempts: 3 });
    bus.start(1000);
  };
  server.platform = platform;
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
  if (process.env.NODE_ENV !== 'test') server.startWorkers(); // price feed (when switched on) and daily backups, on the job queue
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
    server.bus.stop();
    server.close(done);
    server.closeIdleConnections();
    setTimeout(done, 5000).unref();
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
