#!/usr/bin/env node
'use strict';

const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
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

function runJestDirect() {
  try {
    // Prefer running Jest via Node to avoid Windows .cmd spawn issues
    let jestJsPath;
    try {
      // eslint-disable-next-line global-require
      jestJsPath = require.resolve('jest/bin/jest.js');
    } catch (_) {
      const candidate = path.resolve(
        __dirname,
        'node_modules',
        'jest',
        'bin',
        'jest.js',
      );
      if (fs.existsSync(candidate)) jestJsPath = candidate;
    }
    if (jestJsPath) {
      const child = spawn(process.execPath, [jestJsPath, ...jestArgs], {
        stdio: 'inherit',
        env: process.env,
      });
      child.on('close', (code) => process.exit(code ?? 0));
      child.on('error', () => fallbackRunViaNpm());
      return;
    }
  } catch (_) {}
  fallbackRunViaNpm();
}

function fallbackRunViaNpm() {
  try {
    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const child = spawn(npmCmd, ['test', '--', ...jestArgs], {
      stdio: 'inherit',
      env: process.env,
      shell: process.platform === 'win32',
    });
    child.on('close', (code) => process.exit(code ?? 0));
    child.on('error', () => process.exit(1));
  } catch (_) {
    process.exit(1);
  }
}

runJestDirect();
