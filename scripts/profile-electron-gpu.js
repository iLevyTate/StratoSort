#!/usr/bin/env node
'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const seconds = Number(process.argv[2]) || 20;
const outRoot = path.join(process.cwd(), 'profile-output');
if (!fs.existsSync(outRoot)) fs.mkdirSync(outRoot, { recursive: true });
const ts = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = path.join(outRoot, `electron-gpu-${ts}`);
fs.mkdirSync(outDir);

const logFile = (name) => path.join(outDir, name);

console.log(`Starting Electron for ${seconds}s; output -> ${outDir}`);

// Start Electron via npx so local environment is respected
const electronCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const electronArgs = ['electron', '.'];
const electronOut = fs.openSync(logFile('electron.stdout.log'), 'a');
const electronErr = fs.openSync(logFile('electron.stderr.log'), 'a');

const electron = spawn(electronCmd, electronArgs, {
  stdio: ['ignore', electronOut, electronErr],
  shell: process.platform === 'win32',
});

console.log('Electron PID:', electron.pid);

// Start nvidia-smi polling if available
let smi = null;
const smiOutPath = logFile('nvidia-smi.log');
try {
  const smiCmd = process.platform === 'win32' ? 'nvidia-smi.exe' : 'nvidia-smi';
  const smiArgs = [
    '--query-gpu=utilization.gpu,utilization.memory,memory.total,memory.used',
    '--format=csv,noheader,nounits',
    '-l',
    '1',
  ];
  const smiOut = fs.openSync(smiOutPath, 'a');
  smi = spawn(smiCmd, smiArgs, {
    stdio: ['ignore', smiOut, smiOut],
    shell: false,
  });
  console.log('nvidia-smi PID:', smi.pid);
} catch (e) {
  fs.writeFileSync(smiOutPath, `nvidia-smi not available: ${e.message}\n`);
}

// Stop after duration
setTimeout(() => {
  console.log('Stopping profiling run...');
  try {
    if (smi && !smi.killed) smi.kill();
  } catch (e) {
    // ignore
  }
  try {
    if (!electron.killed) electron.kill();
  } catch (e) {
    // ignore
  }
}, seconds * 1000);

electron.on('close', (code) => {
  console.log('Electron exited with', code);
  // Close log fds
  try {
    fs.closeSync(electronOut);
    fs.closeSync(electronErr);
  } catch (e) {}
});

process.on('exit', () => {
  console.log('Profile run complete. Output saved to', outDir);
});
