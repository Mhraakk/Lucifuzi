// Every feature is exercised by a test (the full-feature pass, 2026-10-12). A page route counts when the browser tests
// (scripts/e2e.mjs, scripts/hundred.mjs) open it; an API route counts when a unit test, the browser tests or the
// hundred rounds call it with its method on the same line (GET may be implicit). Routes are matched by their static
// parts, so `/books/doc/:id/edit` needs a line with both `/books/doc/` and `/edit`.
//   node scripts/coverage.mjs        → lists what no test reaches; exits 1 if anything is listed
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const dir = (d) => readdirSync(path.join(ROOT, d)).filter((f) => f.endsWith('.mjs')).map((f) => `${d}/${f}`);
const parts = (route) => route.split(/:[A-Za-z]+/).filter(Boolean);

export function untested() {
  const app = read('public/js/app.mjs');
  const pages = [...new Set([...app.matchAll(/route\('([^']+)'/g)].map((m) => m[1]))];
  const browser = ['scripts/e2e.mjs', 'scripts/hundred.mjs'].map(read).join('\n').split('\n');
  const server = dir('server').map(read).join('\n');
  const apis = [...new Set([...server.matchAll(/on\('(GET|POST|PUT|PATCH|DELETE)', '(\/api\/[^']+)'/g)].map((m) => `${m[1]} ${m[2]}`))];
  const tests = [...dir('tests'), ...dir('tests/helpers'), 'scripts/e2e.mjs', 'scripts/hundred.mjs'].map(read).join('\n').split('\n');
  const hit = (lines, need, method) => lines.some((l) => need.every((p) => l.includes(p)) && (!method || method === 'GET' || new RegExp(`['"\`]${method}['"\`]`).test(l)));
  return {
    pages: pages.filter((r) => r !== '/' && !hit(browser, parts(r))),
    apis: apis.filter((a) => {
      const [method, route] = a.split(' ');
      return !hit(tests, parts(route), method);
    }),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { pages, apis } = untested();
  for (const p of pages) console.log(`page not opened by a browser test: ${p}`);
  for (const a of apis) console.log(`API route no test calls: ${a}`);
  console.log(pages.length + apis.length ? `${pages.length} pages and ${apis.length} API routes untested` : 'every page and API route is exercised by a test');
  process.exitCode = pages.length + apis.length ? 1 : 0;
}
