// Every class the markup and JS use must have a rule in styles.css.
//
// This exists because a CSS section was once deleted as collateral damage while
// removing an adjacent one, and the calendar silently lost its grid. Nothing in the
// JavaScript failed; the app just rendered wrong. A build step would not have caught
// it either — only checking the two files against each other does.

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { test, eq } from './assert.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const css = readFileSync(join(ROOT, 'css/styles.css'), 'utf8');
const styled = new Set([...css.matchAll(/\.([a-z][a-z0-9-]*)/g)].map((m) => m[1]));

const sources = [
  'index.html',
  ...readdirSync(join(ROOT, 'js')).filter((f) => f.endsWith('.js')).map((f) => `js/${f}`),
  ...readdirSync(join(ROOT, 'js/views')).map((f) => `js/views/${f}`),
];

const used = new Map(); // class -> first file that used it

for (const rel of sources) {
  const src = readFileSync(join(ROOT, rel), 'utf8');

  // el('div.card.is-active', ...) — the selector-ish first argument
  for (const m of src.matchAll(/el\(\s*[`'"]([a-zA-Z]+(?:\.[a-zA-Z0-9-]+)+)/g)) {
    for (const c of m[1].split('.').slice(1)) if (!used.has(c)) used.set(c, rel);
  }
  for (const m of src.matchAll(/classList\.(?:add|toggle|remove)\(\s*['"]([a-z0-9-]+)/g)) {
    if (!used.has(m[1])) used.set(m[1], rel);
  }
  for (const m of src.matchAll(/class="([^"]+)"/g)) {
    for (const c of m[1].split(/\s+/)) if (c && !used.has(c)) used.set(c, rel);
  }
  // string-concatenated variants like '.pill-good'
  for (const m of src.matchAll(/['"]\.([a-z][a-z0-9-]+)['"]/g)) {
    if (!used.has(m[1])) used.set(m[1], rel);
  }
}

test('every class used in markup or JS is styled', () => {
  const missing = [...used]
    .filter(([c]) => !styled.has(c))
    .map(([c, where]) => `.${c} (${where})`);
  eq(missing, [], 'unstyled classes');
});

test('the stylesheet has the sections the app depends on', () => {
  const required = ['cal-grid', 'cal-day', 'cal-dot', 'tabbar', 'card', 'btn', 'modal', 'toast'];
  const absent = required.filter((c) => !styled.has(c));
  eq(absent, [], 'missing core style blocks');
});
