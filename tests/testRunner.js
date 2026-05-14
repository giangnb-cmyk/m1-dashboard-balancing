// tests/testRunner.js
let _passed = 0, _failed = 0;

function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); _passed++; }
  catch (e) { console.error(`  ✗ ${name}: ${e.message}`); _failed++; }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Expected true, got false');
}

function assertEqual(a, b, msg) {
  if (a !== b) throw new Error(msg || `Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

function assertDeepEqual(a, b, msg) {
  const as = JSON.stringify(a), bs = JSON.stringify(b);
  if (as !== bs) throw new Error(msg || `Expected ${bs}, got ${as}`);
}

function assertNull(a, msg) {
  if (a !== null && a !== undefined) throw new Error(msg || `Expected null/undefined, got ${JSON.stringify(a)}`);
}

function suite(name, fn) {
  console.log(`\n${name}`);
  fn();
}

function summary() {
  console.log(`\n${_passed} passed, ${_failed} failed`);
  if (_failed > 0) process.exit(1);
}

module.exports = { test, assert, assertEqual, assertDeepEqual, assertNull, suite, summary };
