// Assertion helpers and the shared result collector.
//
// Deliberately separate from run.js: test files import this, run.js imports both, so
// there is no import cycle. A cycle plus run.js's top-level await deadlocks silently.

export const results = { passed: 0, failed: 0, failures: [], file: '' };

/** Runs one assertion group immediately and records the outcome. */
export function test(name, fn) {
  try {
    fn();
    results.passed++;
  } catch (err) {
    results.failed++;
    results.failures.push({ file: results.file, name, message: err.message });
  }
}

export function eq(actual, expected, note = '') {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${note ? note + ': ' : ''}expected ${e}, got ${a}`);
}

export function ok(value, note = 'expected truthy') {
  if (!value) throw new Error(note);
}

export function throws(fn, note = 'expected a throw') {
  try {
    fn();
  } catch {
    return;
  }
  throw new Error(note);
}

/** Floating-point comparison, for grade and duration maths. */
export function close(actual, expected, tolerance = 0.01, note = '') {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${note ? note + ': ' : ''}expected ~${expected}, got ${actual}`);
  }
}
