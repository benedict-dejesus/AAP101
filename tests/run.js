#!/usr/bin/env node
/* Runs the whole AAP101 security suite. Exits non-zero if anything fails. */
const { execFileSync } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..');
let failed = 0;

for (const suite of ['test-backend.js', 'test-frontend.js']) {
  try {
    execFileSync(process.execPath, [path.join(__dirname, suite)],
                 { cwd: root, stdio: 'inherit' });
  } catch (e) {
    failed++;
  }
}

console.log(failed ? '\n❌ ' + failed + ' suite(s) failed.\n'
                   : '\n✅ All suites passed.\n');
process.exit(failed ? 1 : 0);
