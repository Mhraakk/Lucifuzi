// spec 0039: one motion system for every layer of app.css — durations from tokens, no overshoot on interface
// elements, loops only where they mean something, hovers that do not stick on touch, one reduced-motion rule.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const CSS = readFileSync(new URL('../public/app.css', import.meta.url), 'utf8');
const LOOPS = {
  spin: 'a loading spinner turns while something loads',
  'sc-blink': "the desk's caret blinks at rest (spec 0021)",
  'otp-caret': 'the caret in the code cells',
  posPulse: 'the card reader is waiting for the card (spec 0035)',
  'dk-pulse': 'a loading line (the inspection report)',
  'gd-sk': 'a skeleton while the dashboard loads',
  'lt-breathe': 'the living light, which «نور زنده» and reduced motion turn off (spec 0014)',
  'lux-marquee': 'the one marquee of the product site',
  'sh-pulse': 'the cue on the entrance sculpture, until the first touch (spec 0046)',
};
// the few moves that keep a curve of their own, each for its reason
const OWN_CURVE = {
  '#tabbar .goo-head': 'the gooey tab drop: the one spring that must overshoot',
  '.gd-tip': 'the chart tip follows the pointer at the speed of the hand',
  '.holding > .u-hold-fill': 'a hold is a clock: its fill runs at a steady pace for the whole hold (spec 0040)',
};
// layout moves only where a size is the message
const GROWS = {
  '.meter .pbar i': 'a bar grows to its value',
  '.vz-bar i b': 'a bar grows to its value',
  '.mm-bars i': 'a bar grows to its value',
  '.gd-age .gd-bar i': 'a bar grows to its value',
  '.at-bars i::after': 'a bar grows to its value',
  '.lux-dots button': "the product site's dot for the slide on show widens",
  '.btn, .chip, .seg button': 'a button whose words change grows to its new words (spec 0012)',
  'details:not(.tb-work)::details-content': 'a fold opens to its height',
};
const LAYOUT = /^(width|height|block-size|inline-size|min-|max-|padding|margin|gap|row-gap|column-gap|top|left|right|bottom|inset|grid-template|flex|font-size|line-height|letter-spacing|border-width)/;
const ruleOf = (index) => CSS.slice(CSS.lastIndexOf('}', index) + 1, index);
const splitTop = (v) => {
  const out = [];
  let depth = 0, cur = '';
  for (const ch of v) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) (out.push(cur), (cur = ''));
    else cur += ch;
  }
  return [...out, cur];
};
const decls = [...CSS.matchAll(/\b(transition|animation)(-duration|-property)?\s*:\s*([^;{}]+)/g)].map((m) => ({ prop: m[1] + (m[2] ?? ''), value: m[3] }));

test('motion: no `transition: all` — every transition names what it moves', () => {
  assert.deepEqual(decls.filter((d) => /^\s*all\b/.test(d.value) && d.prop !== 'animation').map((d) => d.value.trim()), []);
});

test('motion: every interface duration is a token (loops and moves over 1.2 s keep their own time)', () => {
  const bad = [];
  for (const d of decls.filter((x) => x.prop !== 'transition-property')) {
    for (const item of splitTop(d.value)) {
      if (/\binfinite\b/.test(item)) continue;
      // the first time in a shorthand is the duration (a later one is the delay): a token, or a literal to check
      const first = item.match(/var\(--t-[\w-]+\)|calc\([^)]*\)|(?<![\w.-])(\d*\.?\d+)(ms|s)(?![\w-])/);
      if (!first || !first[1]) continue;
      const s = first[2] === 'ms' ? Number(first[1]) / 1000 : Number(first[1]);
      if (s >= 0.001 && s <= 1.2) bad.push(item.trim());
    }
  }
  assert.deepEqual(bad, []);
});

test('motion: no overshoot curve on interface elements (the gooey tab drop is the one spring that must overshoot)', () => {
  const bad = [];
  for (const m of CSS.matchAll(/cubic-bezier\(([^)]*)\)/g)) {
    const [, y1, , y2] = m[1].split(',').map(Number);
    if (y1 >= 0 && y1 <= 1 && y2 >= 0 && y2 <= 1) continue;
    const rule = CSS.slice(CSS.lastIndexOf('}', m.index) + 1, m.index);
    if (!rule.includes('#tabbar .goo-head')) bad.push(rule.trim().slice(0, 80));
  }
  assert.deepEqual(bad, []);
});

test('motion: every interface move takes its curve from the tokens (a few named moves keep their own)', () => {
  const bad = [];
  for (const m of CSS.matchAll(/\b(?:transition|animation)\s*:\s*([^;{}]+)/g)) {
    for (const item of splitTop(m[1])) {
      // loops and moves over 1.2 s keep their own time and curve
      if (/\binfinite\b/.test(item) || !/var\(--t-[\w-]+\)/.test(item)) continue;
      if (/var\(--(?:ease[\w-]*|spring|lt-spring|lt-soft)\b/.test(item)) continue;
      if (Object.keys(OWN_CURVE).some((s) => ruleOf(m.index).includes(s))) continue;
      bad.push(item.trim());
    }
  }
  for (const m of CSS.matchAll(/\b(?:transition|animation)-timing-function\s*:\s*([^;{}]+)/g)) if (!/^var\(--/.test(m[1].trim())) bad.push(m[0]);
  assert.deepEqual(bad, []);
});

test('motion: things move with transform and opacity; a layout property moves only where a size is the message', () => {
  const bad = [];
  for (const m of CSS.matchAll(/\btransition(-property)?\s*:\s*([^;{}]+)/g)) {
    for (const item of splitTop(m[2])) {
      const prop = item.trim().split(/\s+/)[0];
      if (LAYOUT.test(prop) && !Object.keys(GROWS).some((s) => ruleOf(m.index).includes(s))) bad.push(`${ruleOf(m.index).trim().slice(0, 60)} → ${prop}`);
    }
  }
  for (const m of CSS.matchAll(/@keyframes\s+([\w-]+)\s*\{((?:[^{}]*\{[^{}]*\})*)[^{}]*\}/g)) {
    for (const [, p] of m[2].matchAll(/([\w-]+)\s*:/g)) if (LAYOUT.test(p)) bad.push(`@keyframes ${m[1]} → ${p}`);
    // a blur is soft and gone once arrived (at most 8 px)
    for (const [, px] of m[2].matchAll(/blur\(([\d.]+)px\)/g)) if (Number(px) > 8) bad.push(`@keyframes ${m[1]} → blur(${px}px)`);
  }
  assert.deepEqual(bad, []);
});

test('motion: rows that arrive together share one stagger, twelve steps at most', () => {
  const delays = [...CSS.matchAll(/\b(?:animation|transition)-delay\s*:\s*([^;{}]*var\(--i\b[^;{}]*)/g)].map((m) => m[1].trim());
  assert.ok(delays.length >= 6);
  assert.deepEqual(delays.filter((d) => d !== 'calc(min(var(--i, 0), 12) * var(--t-stagger))'), []);
});

test('motion: one page entry, and page to page stays within page time', () => {
  assert.equal(CSS.split('@keyframes page-in').length - 1, 1);
  assert.match(CSS, /#main > \.page \{ animation: page-in var\(--t-page\)/);
  assert.match(CSS, /::view-transition-new\(root\) \{ animation: var\(--t-page\)/);
  assert.match(CSS, /::view-transition-old\(root\) \{ animation: var\(--t-ui\)/);
});

test('motion: an endless animation is a loop that means something', () => {
  const names = [...CSS.matchAll(/animation:\s*([\w-]+)[^;{}]*\binfinite\b/g)].map((m) => m[1]);
  assert.ok(names.length > 0);
  assert.deepEqual(names.filter((n) => !LOOPS[n]), []);
});

test('motion: a hover that styles the element itself sits in (hover: hover), so a tap leaves nothing stuck on touch', () => {
  // top-level rules only: scan statements, skipping comments, strings and nested blocks
  const bad = [];
  let i = 0;
  while (i < CSS.length) {
    if (CSS.startsWith('/*', i)) {
      i = CSS.indexOf('*/', i + 2) + 2;
      continue;
    }
    let j = i, depth = 0, open = -1;
    while (j < CSS.length) {
      const c = CSS[j];
      if (c === '"' || c === "'") {
        const q = c;
        j++;
        while (j < CSS.length && CSS[j] !== q) j += CSS[j] === '\\' ? 2 : 1;
      } else if (CSS.startsWith('/*', j)) j = CSS.indexOf('*/', j + 2) + 1;
      else if (c === '{') (depth++, open < 0 && (open = j));
      else if (c === '}' && --depth === 0) break;
      j++;
    }
    const sel = open < 0 ? '' : CSS.slice(i, open).trim();
    const body = open < 0 ? '' : CSS.slice(open, j + 1);
    if (!sel.startsWith('@') && sel.includes(':hover') && !/\b(display|visibility|pointer-events)\s*:/.test(body)) {
      for (const s of splitTop(sel)) {
        const after = s.slice(s.lastIndexOf(':hover') + 6).replace(/::?[\w-]+(\([^)]*\))?/g, '').trim();
        if (s.includes(':hover') && after === '' && !/\([^)]*:hover[^)]*\)/.test(s)) bad.push(s.trim());
      }
    }
    i = j + 1;
  }
  assert.deepEqual(bad, []);
});

test('motion: one reduced-motion rule settles every layer at once', () => {
  assert.match(CSS, /@media \(prefers-reduced-motion: reduce\) \{\s*\*, \*::before, \*::after \{ animation-duration: 0\.01ms !important; animation-iteration-count: 1 !important;[^}]*transition-duration: 0\.01ms !important;/);
});

test('motion: the tokens exist once, and the old names no longer overshoot', () => {
  for (const t of ['--t-press', '--t-hover', '--t-ui', '--t-page', '--t-panel', '--t-reveal', '--t-slow', '--t-stagger', '--t-hold', '--ease-out', '--ease-in-out', '--ease-exit']) assert.equal(CSS.split(`${t}:`).length - 1, 1, t);
  assert.match(CSS, /--ease: var\(--ease-out\);/);
  assert.match(CSS, /--spring: var\(--ease-out\);/);
  assert.match(CSS, /--lt-spring: var\(--ease-out\);/);
  assert.match(CSS, /--lt-soft: var\(--ease-out\);/);
});
