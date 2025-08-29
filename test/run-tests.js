#!/usr/bin/env node
'use strict';

/**
 * Unified Test Runner for StratoSort
 * Simple, focused testing for file organization functionality
 */

const path = require('path');
const { spawn } = require('child_process');

// Load environment if available
try {
  require('dotenv').config({ path: path.join(__dirname, '.env') });
} catch (_) {}

const args = process.argv.slice(2);

// Test categories focused on file organization
const TEST_CATEGORIES = {
  unit: 'test/unit/',
  integration: 'test/integration/',
  e2e: 'test/e2e/',
  ai: '(analysis|ollama|model)',
  files: '(file|document|upload)',
  ui: '(react|component)',
  ipc: '(ipc|communication)',
  performance: '(performance|benchmark)',
  all: '',
};

function showHelp() {
  console.log(`
🧪 StratoSort Test Runner
Focused testing for AI-powered file organization

USAGE:
  node run-tests.js [options] [category]

CATEGORIES:
  unit        - Core functionality tests
  integration - Workflow integration tests
  e2e         - End-to-end file organization tests
  ai          - AI analysis and processing tests
  files       - File handling and processing tests
  ui          - React component tests
  ipc         - Inter-process communication tests
  performance - Performance and benchmarking tests
  all         - Run all tests (default)

OPTIONS:
  --coverage  - Generate coverage report
  --watch     - Run tests in watch mode
  --bail      - Stop on first failure
  --verbose   - Verbose output
  --help      - Show this help

EXAMPLES:
  node run-tests.js unit           # Run unit tests
  node run-tests.js ai --coverage  # Run AI tests with coverage
  node run-tests.js --watch        # Watch mode for all tests
  node run-tests.js performance    # Performance tests only
`);
  process.exit(0);
}

if (args.includes('--help')) {
  showHelp();
}

// Build Jest arguments
const jestArgs = [];

// Handle project selection
if (args.includes('--project=main')) {
  jestArgs.push('--testPathPatterns', 'test/main/');
  args.splice(args.indexOf('--project=main'), 1);
} else if (args.includes('--project=renderer')) {
  jestArgs.push('--testPathPatterns', 'test/renderer/');
  args.splice(args.indexOf('--project=renderer'), 1);
} else if (args.includes('--project=integration')) {
  jestArgs.push('--testPathPatterns', 'test/integration/');
  args.splice(args.indexOf('--project=integration'), 1);
}

// Add coverage if requested
if (args.includes('--coverage')) {
  jestArgs.push('--coverage');
  args.splice(args.indexOf('--coverage'), 1);
}

// Add watch mode if requested
if (args.includes('--watch')) {
  jestArgs.push('--watch');
  args.splice(args.indexOf('--watch'), 1);
}

// Add bail if requested
if (args.includes('--bail')) {
  jestArgs.push('--bail');
  args.splice(args.indexOf('--bail'), 1);
}

// Add verbose if requested
if (args.includes('--verbose')) {
  jestArgs.push('--verbose');
  args.splice(args.indexOf('--verbose'), 1);
}

// Determine test category (first remaining argument)
const category = args[0] || 'all';
const testPattern = TEST_CATEGORIES[category];

if (!testPattern && category !== 'all') {
  console.error(`❌ Unknown category: ${category}`);
  console.log('Use --help to see available categories');
  process.exit(1);
}

// Add test pattern filter if not running all tests
if (category !== 'all') {
  jestArgs.push('--testPathPatterns', testPattern);
}

// Show what we're running
console.log(`🚀 Running StratoSort ${category} tests...`);
if (jestArgs.length > 0) {
  console.log(`📋 Jest args: ${jestArgs.join(' ')}`);
}
console.log(`📁 Working directory: ${process.cwd()}`);
console.log(
  `🧪 Jest binary: ${process.platform === 'win32' ? 'npx.cmd' : 'npx'}`,
);

// Run the tests
const child = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['jest', ...jestArgs],
  {
    stdio: 'inherit',
    env: { ...process.env, TEST_PATTERN: testPattern },
    shell: process.platform === 'win32',
    cwd: path.dirname(__dirname), // Run from project root
  },
);

// Handle process events
child.on('close', (code) => {
  const status = code === 0 ? '✅' : '❌';
  console.log(`\n${status} Tests completed with exit code ${code}`);
  process.exit(code ?? 0);
});

child.on('error', (error) => {
  console.error('❌ Failed to start tests:', error.message);
  process.exit(1);
});

// Cleanup on termination
process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
