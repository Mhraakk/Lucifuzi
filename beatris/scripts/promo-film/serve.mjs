// A tiny static server rooted at beatris/ for the film pages: ES modules (the Elliott engine, the thinking orb, the
// anatomy figures) cannot load from file://. A path missing at the root is looked up in public/, as the app serves it.
// Bound to 127.0.0.1 on a free port; GET only; never leaves the root.
import http from 'node:http';
import path from 'node:path';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2' };

export async function serveRoot() {
  const srv = http.createServer((q, r) => {
    // the app's own absolute paths (/js, /fonts, /vendor, /app.css) resolve inside public/, as the app serves them
    const p = decodeURIComponent(new URL(q.url, 'http://x').pathname);
    const isFile = (x) => x.startsWith(ROOT + path.sep) && existsSync(x) && statSync(x).isFile();
    const f = [path.join(ROOT, p), path.join(ROOT, 'public', p)].find(isFile);
    if (!f) return r.writeHead(404).end();
    r.writeHead(200, { 'content-type': TYPES[path.extname(f)] ?? 'application/octet-stream' }).end(readFileSync(f));
  });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  return { url: `http://127.0.0.1:${srv.address().port}`, close: () => srv.close() };
}
