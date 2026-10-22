// spec 0039: the link check finds a named import nobody exports and an /api path no route serves, and accepts the
// route styles the server really uses (quoted, backticked with ${…}, pathname tests).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { brokenLinks } from '../scripts/links.mjs';

test('links: a missing export and an unserved /api path are reported; real route styles pass', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'links-'));
  try {
    const put = (f, s) => (mkdirSync(path.dirname(path.join(root, f)), { recursive: true }), writeFileSync(path.join(root, f), s));
    for (const d of ['content', 'scripts', 'tests']) mkdirSync(path.join(root, d), { recursive: true });
    put('server/api.mjs', [
      "on('GET', '/api/books/docs/:id', 'auth', () => 1);",
      "for (const verb of ['approve']) on('POST', `/api/books/approvals/:id/${verb}`, 'auth', () => 1);",
      "if (url.pathname === '/api/health') x();",
      "if (url.pathname.startsWith('/api/peers/')) y();",
    ].join('\n'));
    put('public/js/lib.mjs', 'export const shown = 1;\nexport function draw() {}\nconst a = 1, b = 2;\nexport { a as alpha, b };\n');
    put('public/js/page.mjs', [
      // assembled so that this test file itself holds no import line for the check to read
      ['import', '{ shown, draw, alpha, b, gone }', 'from', "'./lib.mjs';"].join(' '),
      "api(`/api/books/docs/${id}`); api(`/api/books/approvals/${id}/${verb}`); fetch('/api/health'); api(`/api/peers/${x}`);",
      "api('/api/books/nowhere');",
    ].join('\n'));
    const r = brokenLinks(root);
    assert.deepEqual(r.imports, [`${path.join('public', 'js', 'page.mjs')}: 'gone' is not exported by ${path.join('public', 'js', 'lib.mjs')}`]);
    assert.deepEqual(r.api, [`${path.join('public', 'js', 'page.mjs')}: /api/books/nowhere has no server route`]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('links: the app itself has no broken import and no unserved /api path', () => {
  assert.deepEqual(brokenLinks(), { imports: [], api: [] });
});
