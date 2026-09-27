// Syntax-check every module and validate curriculum integrity.
import { readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
const walk = (d) => readdirSync(d).flatMap((f) => { const p = path.join(d, f); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.mjs') ? [p] : []; });
const files = ['api', 'server', 'content', 'public/js', 'scripts', 'tests'].flatMap(walk);
for (const f of files) execFileSync(process.execPath, ['--check', f]);
const { validateContent } = await import('../content/index.mjs');
const errors = validateContent();
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log(`ok — ${files.length} modules, content valid`);
