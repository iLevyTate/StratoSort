#!/usr/bin/env node
'use strict';

const path = require('path');
const { spawn } = require('child_process');
try {
  // eslint-disable-next-line global-require
  require('dotenv').config({ path: path.join(__dirname, '.env') });
} catch (_) {}

const args = process.argv.slice(2);
const jestArgs = [];

if (args.includes('--help')) {
  // eslint-disable-next-line no-console
  console.log(
    'Usage: node run-tests.js [--coverage] [--bail] [--categories <name>]',
  );
  process.exit(0);
}

if (args.includes('--coverage')) jestArgs.push('--coverage');
if (args.includes('--bail')) jestArgs.push('--bail');

const catIndex = args.indexOf('--categories');
if (catIndex !== -1) {
  const value = args[catIndex + 1];
  if (value) {
    const map = {
      'file-upload': 'react-app|integration',
      'ai-processing': 'ollama|model-verifier',
      performance: 'performance',
    };
    const pattern = map[String(value)] || String(value);
    jestArgs.push('--testPathPattern', pattern);
  }
}

const child = spawn(
  process.platform === 'win32' ? 'npm.cmd' : 'npm',
  ['test', '--', ...jestArgs],
  {
    stdio: 'inherit',
    env: process.env,
  },
);

child.on('close', (code) => process.exit(code ?? 0));
