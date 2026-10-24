// spec 0039: the two connections a page can break without a syntax error — a named import the target module does not
// export, and an /api path a page calls that no server route serves. scripts/check.mjs runs this on every gate.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const walk = (d) => readdirSync(d).flatMap((f) => { const p = path.join(d, f); return statSync(p).isDirectory() ? (f.startsWith('frames') ? [] : walk(p)) : p.endsWith('.mjs') ? [p] : []; });

/** Names a module exports: declarations, export lists (with `as`), destructured consts and `default`; re-exports with `*` accept any name. */
function exportsOf(file, cache) {
  if (cache.has(file)) return cache.get(file);
  const s = readFileSync(file, 'utf8');
  const names = new Set();
  for (const m of s.matchAll(/export\s+(?:async\s+)?(?:function\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  for (const m of s.matchAll(/export\s*\{([^}]*)\}/g)) for (const part of m[1].split(',')) { const [name, alias] = part.trim().split(/\s+as\s+/); if (name) names.add((alias || name).trim()); }
  for (const m of s.matchAll(/export\s+const\s*\{([^}]*)\}/g)) for (const part of m[1].split(',')) { const [name, alias] = part.trim().split(':'); names.add((alias || name).trim()); }
  if (/export\s+default/.test(s)) names.add('default');
  const any = /export\s*\*\s*from/.test(s);
  cache.set(file, { names, any });
  return cache.get(file);
}

/** Route patterns the server serves: on()/route()/vr() registrations in quotes or backticks, and pathname tests. */
function serverRoutes(files) {
  const routes = [];
  const toRe = (p, exact = true) => new RegExp(`^${p.replace(/\$\{[^}]*\}/g, '[^/]+').replace(/:(\w+)/g, '[^/]+')}${exact ? '$' : ''}`);
  for (const f of files) {
    const s = readFileSync(f, 'utf8');
    for (const m of s.matchAll(/\b(?:on|route|vr)\('(?:GET|POST|PUT|PATCH|DELETE)',\s*(['`])(\/api\/[^'`]+)\1/g)) routes.push(toRe(m[2]));
    for (const m of s.matchAll(/pathname === '(\/api\/[^']+)'/g)) routes.push(toRe(m[1]));
    for (const m of s.matchAll(/pathname\.startsWith\('(\/api\/[^']+)'\)/g)) routes.push(toRe(m[1], false));
  }
  return routes;
}

export function brokenLinks(root = ROOT) {
  const files = ['server', 'content', 'public/js', 'scripts', 'tests'].flatMap((d) => walk(path.join(root, d)));
  const cache = new Map();
  const imports = [];
  for (const f of files) {
    for (const m of readFileSync(f, 'utf8').matchAll(/import\s*\{([^}]*)\}\s*from\s*['"](\.[^'"]+)['"]/g)) {
      const target = path.join(path.dirname(f), m[2]);
      const rel = path.relative(root, f);
      if (!existsSync(target)) { imports.push(`${rel}: imports from missing ${m[2]}`); continue; }
      const ex = exportsOf(target, cache);
      for (const part of m[1].split(',')) {
        const name = part.trim().split(/\s+as\s+/)[0].trim();
        if (name && !ex.any && !ex.names.has(name)) imports.push(`${rel}: '${name}' is not exported by ${path.relative(root, target)}`);
      }
    }
  }
  const routes = serverRoutes(files.filter((f) => path.relative(root, f).startsWith('server')));
  const api = [];
  for (const f of files.filter((x) => path.relative(root, x).startsWith(path.join('public', 'js')))) {
    for (const m of readFileSync(f, 'utf8').matchAll(/[`'"](\/api\/[^`'"?\s]*)/g)) {
      // a template's trailing ${…} is a query string or an id; inner ones are path segments
      const p = m[1].replace(/\$\{[^}]*\}?$/, '').replace(/\$\{[^}]*\}/g, 'X').replace(/\/$/, '');
      if (!routes.some((r) => r.test(p) || r.test(`${p}/X`))) api.push(`${path.relative(root, f)}: ${m[1]} has no server route`);
    }
  }
  return { imports, api: [...new Set(api)] };
}
