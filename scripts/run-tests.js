#!/usr/bin/env node
const { execSync } = require('child_process');
const args = process.argv.slice(2).join(' ');
try {
  execSync(`npm test -- ${args}`, { stdio: 'inherit' });
} catch (err) {
  process.exitCode = err.status || 1;
}
