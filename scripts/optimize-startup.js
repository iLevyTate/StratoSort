#!/usr/bin/env node

/**
 * Optimized startup script for StratoSort
 * Applies Node.js performance optimizations before launching the app
 */

const { spawn } = require('child_process');
const path = require('path');
const v8 = require('v8');

// V8 flags that must be set before any other modules are loaded
// Using only well-supported V8 flags
const V8_FLAGS = [
  '--max-old-space-size=4096', // Move this to V8 flags as it needs early application
  '--expose-gc',
];

// Node.js flags that can be safely set via NODE_OPTIONS
const NODE_FLAGS = [
  '--enable-source-maps', // Better debugging in development
];

// Apply V8 flags before spawning the process
console.log('🚀 Applying V8 performance optimizations...');
V8_FLAGS.forEach((flag) => {
  try {
    v8.setFlagsFromString(flag);
    console.log(`✅ Applied: ${flag}`);
  } catch (error) {
    console.warn(`⚠️  Could not apply ${flag}:`, error.message);
  }
});

// Get the main script path
const mainScript = path.join(__dirname, '..', 'src', 'main', 'simple-main.js');

// Get any additional arguments
const args = process.argv.slice(2);

// Spawn the optimized Electron process
// Use the local electron binary
const electronBin = process.platform === 'win32' ? 'electron.cmd' : 'electron';
const electronPath = path.join(
  __dirname,
  '..',
  'node_modules',
  '.bin',
  electronBin,
);

// On Windows, we need shell: true for .cmd files to work properly
const spawnOptions = {
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_OPTIONS: NODE_FLAGS.join(' '),
    // More conservative GPU settings to avoid errors
    ELECTRON_DISABLE_GPU: 'false', // Allow GPU if available
    ELECTRON_FORCE_WINDOW_MENU_BAR: 'false',
    // Add GPU safety settings
    ELECTRON_ENABLE_LOGGING: 'false', // Reduce GPU logging noise
  },
  ...(process.platform === 'win32' ? { shell: true } : {}),
};

const child = spawn(electronPath, [mainScript, ...args], spawnOptions);

// Handle process events
child.on('error', (error) => {
  console.error('Failed to start optimized Electron process:', error);
  process.exit(1);
});

child.on('exit', (code) => {
  process.exit(code);
});

// Handle SIGINT (Ctrl+C)
process.on('SIGINT', () => {
  child.kill('SIGINT');
});

// Handle SIGTERM
process.on('SIGTERM', () => {
  child.kill('SIGTERM');
});

console.log('🚀 Starting StratoSort with performance optimizations...');
console.log(`📊 V8 flags applied: ${V8_FLAGS.join(' ')}`);
console.log(`📊 Node.js flags: ${NODE_FLAGS.join(' ')}`);
console.log('⚡ GPU acceleration: Enabled');
console.log('💾 Memory limit: 4GB');
