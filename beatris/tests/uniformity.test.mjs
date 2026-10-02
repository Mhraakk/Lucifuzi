// spec 0019 / spec 0006: the app stays one piece. These guards fail the gate when a page drifts from the shared kit —
// a browser dialog instead of the app's own, a colour outside the tokens, a second UI font, or the same place
// called by two names in two menus.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const root = new URL('../public/js/', import.meta.url);
const files = [...readdirSync(root).filter((f) => f.endsWith('.mjs')).map((f) => [f, new URL(f, root)]), ...readdirSync(new URL('pages/', root)).filter((f) => f.endsWith('.mjs')).map((f) => [`pages/${f}`, new URL(`pages/${f}`, root)])].map(([f, u]) => [f, readFileSync(u, 'utf8')]);
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('no browser dialogs: every question goes through dialog.mjs', () => {
  const bad = files.filter(([, s]) => /(^|[^.\w])(alert|confirm|prompt)\(/m.test(code(s))).map(([f]) => f);
  assert.deepEqual(bad, []);
});

test('page markup takes colours from tokens, not hex', () => {
  const bad = files.filter(([f]) => f.startsWith('pages/')).flatMap(([f, s]) => [...s.matchAll(/style="[^"]*#[0-9a-fA-F]{3,8}\b[^"]*"/g)].map((m) => `${f}: ${m[0].slice(0, 60)}`));
  assert.deepEqual(bad, []);
});

test('one UI font: charts, the Elliott view and the dashboard use Estedad like every page', () => {
  for (const f of ['charts.mjs', 'elliott-view.mjs']) assert.match(files.find(([n]) => n === f)[1], /px Estedad,/, f);
  const css = readFileSync(new URL('../public/app.css', import.meta.url), 'utf8').replace(/@font-face\s*\{[^}]*\}/g, '');
  // a declaration whose first family is Vazirmatn (the @font-face and the token fallbacks name it second)
  const vaz = [...css.matchAll(/font(?:-family)?:\s*(?:[\d.]+(?:px)?(?:\/[\d.]+)?\s+)*'Vazirmatn'[^;}]*/g)].map((m) => m[0]);
  assert.deepEqual(vaz, []);
});

test('the same place has the same name in the books menu and the manager dashboard', () => {
  const books = files.find(([f]) => f === 'pages/books.mjs')[1];
  const dash = files.find(([f]) => f === 'pages/dashboard.mjs')[1];
  const names = (s) => Object.fromEntries([...s.matchAll(/\['[\w]+', '(\/[^']*)', '([^']+)'/g)].map((m) => [m[1], m[2]]));
  const b = names(books.slice(books.indexOf('export function booksNav'), books.indexOf('const QUICK')));
  const d = names(dash.slice(dash.indexOf('const NAV = '), dash.indexOf('const RANGES')));
  const differ = Object.entries(d).filter(([href, label]) => b[href] && b[href] !== label).map(([h, l]) => `${h}: ${l} ≠ ${b[h]}`);
  assert.deepEqual(differ, []);
  assert.ok(Object.keys(d).filter((h) => b[h]).length >= 6, 'the menus share most places');
});
