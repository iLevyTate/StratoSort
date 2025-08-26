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
    // Updated to modern Jest CLI flag name
    jestArgs.push('--testPathPatterns', pattern);
  }
}

const child = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['jest', ...jestArgs],
  {
    stdio: 'inherit',
    env: process.env,
    shell: process.platform === 'win32',
  },
);

// Handle child process events to ensure proper cleanup
child.on('close', (code) => {
  process.exit(code ?? 0);
});

child.on('error', (error) => {
  console.error('Failed to start jest:', error);
  process.exit(1);
});

// Ensure cleanup on process termination
process.on('SIGINT', () => {
  child.kill('SIGINT');
});

process.on('SIGTERM', () => {
  child.kill('SIGTERM');
});
