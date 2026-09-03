// Test runner. No dependencies, no framework: `node tests/run.js`.
//
// Only modules with no network imports can be tested here — js/db.js imports
// supabase-js from a CDN, which Node cannot resolve. That is a useful constraint
// rather than a limitation: it keeps real logic in pure modules and away from I/O.

import { readdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { results } from './assert.js';

const here = dirname(fileURLToPath(import.meta.url));

const files = (await readdir(here))
  .filter((f) => f.endsWith('.test.js'))
  .sort();

for (const file of files) {
  results.file = file;
  // pathToFileURL, not a bare path: on Windows an absolute path like C:\... is
  // rejected by the ESM loader as an unknown "c:" URL scheme.
  await import(pathToFileURL(join(here, file)).href);
}

const total = results.passed + results.failed;
console.log(`\n${files.length} file${files.length === 1 ? '' : 's'}, ${total} assertions`);

if (results.failed) {
  console.log(`\n${results.failed} FAILED:\n`);
  for (const f of results.failures) {
    console.log(`  ${f.file} › ${f.name}\n    ${f.message}\n`);
  }
  process.exit(1);
}

console.log(`${results.passed} passed\n`);
