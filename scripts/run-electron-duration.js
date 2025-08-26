#!/usr/bin/env node
'use strict';

// Lightweight script to start Electron for a fixed duration for profiling tools
// Usage: node scripts/run-electron-duration.js [seconds]

const { spawn } = require('child_process');
const seconds = Number(process.argv[2]) || 15;

const cmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const args = ['electron', '.'];

console.log(`Starting Electron for ${seconds}s (pid will be shown)`);

const child = spawn(cmd, args, {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

console.log('Electron PID:', child.pid);

setTimeout(() => {
  console.log('Stopping Electron process...');
  try {
    child.kill();
  } catch (e) {
    console.error('Failed to kill Electron process:', e.message);
  }
}, seconds * 1000);

child.on('close', (code) => {
  console.log('Electron exited with code', code);
  process.exit(code ?? 0);
});
