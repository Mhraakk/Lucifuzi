// Syntax-check every module and validate curriculum integrity.
import { readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
const walk = (d) => readdirSync(d).flatMap((f) => { const p = path.join(d, f); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.mjs') ? [p] : []; });
const files = ['server', 'content', 'public/js', 'scripts', 'tests'].flatMap(walk);
for (const f of files) execFileSync(process.execPath, ['--check', f]);
const { validateContent } = await import('../content/index.mjs');
const errors = validateContent();
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
// Spec Coach rule 8 (instruction bloat): the always-on instructions stay small; details live in docs/ARCHITECTURE.md
const claudeMd = statSync(new URL('../CLAUDE.md', import.meta.url)).size;
if (claudeMd > 4096) { console.error(`CLAUDE.md is ${claudeMd} bytes; keep it under 4096 and move details to docs/ARCHITECTURE.md`); process.exit(1); }
// spec 0039: every named import is exported, and every /api path a page calls has a server route
const { brokenLinks } = await import('./links.mjs');
const links = brokenLinks();
if (links.imports.length || links.api.length) { console.error([...links.imports, ...links.api].join('\n')); process.exit(1); }
// every page and API route is exercised by some test (scripts/coverage.mjs): a new feature comes with its test
const { untested } = await import('./coverage.mjs');
const gaps = untested();
if (gaps.pages.length || gaps.apis.length) { console.error([...gaps.pages.map((p) => `page not opened by a browser test: ${p}`), ...gaps.apis.map((a) => `API route no test calls: ${a}`)].join('\n')); process.exit(1); }
console.log(`ok — ${files.length} modules, content valid, imports and /api paths linked, every page and API route tested`);
