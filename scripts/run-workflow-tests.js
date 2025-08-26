#!/usr/bin/env node

/**
 * Workflow Tests Runner Script
 * Makes it easy to run StratoSort integration tests for workflow validation
 */

const { spawn } = require('child_process');
const path = require('path');

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(color, message) {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function showHelp() {
  log('bright', '\n🚀 StratoSort Workflow Tests Runner\n');
  log('cyan', 'Usage:');
  log('reset', '  node scripts/run-workflow-tests.js [command]');
  log('reset', '  npm run test:workflow [command]');
  log('reset', '');

  log('cyan', 'Commands:');
  log('reset', '  all         - Run all integration tests');
  log('reset', '  user        - Run user workflow tests');
  log('reset', '  files       - Run file selection tests');
  log('reset', '  dragdrop    - Run drag and drop tests');
  log('reset', '  coverage    - Run tests with coverage report');
  log('reset', '  watch       - Run tests in watch mode');
  log('reset', '  help        - Show this help message');
  log('reset', '');

  log('cyan', 'Examples:');
  log('reset', '  node scripts/run-workflow-tests.js all');
  log('reset', '  node scripts/run-workflow-tests.js coverage');
  log('reset', '  npm run test:workflow files');
  log('reset', '');
}

function runTest(testPath, description, extraArgs = []) {
  return new Promise((resolve, reject) => {
    log('blue', `📋 Running: ${description}`);
    log('cyan', `📁 Path: ${testPath}`);

    const args = ['test', '--', testPath, ...extraArgs];
    const child = spawn('npm', args, {
      stdio: 'inherit',
      shell: true,
    });

    child.on('close', (code) => {
      if (code === 0) {
        log('green', `✅ ${description} - PASSED\n`);
        resolve();
      } else {
        log('red', `❌ ${description} - FAILED\n`);
        reject(new Error(`Test failed with exit code ${code}`));
      }
    });

    child.on('error', (error) => {
      log('red', `💥 Error running ${description}: ${error.message}`);
      reject(error);
    });
  });
}

async function runAllTests() {
  log('bright', '🎯 Running All StratoSort Workflow Tests\n');

  const tests = [
    {
      path: 'test/integration/test-user-workflow.test.js',
      description: 'Complete User Workflow Tests',
    },
    {
      path: 'test/integration/test-file-selection-workflow.test.js',
      description: 'File Selection Workflow Tests',
    },
    {
      path: 'test/integration/test-drag-drop-workflow.test.js',
      description: 'Drag and Drop Workflow Tests',
    },
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      await runTest(test.path, test.description);
      passed++;
    } catch (error) {
      failed++;
      log('yellow', `⚠️  Continuing with remaining tests...\n`);
    }
  }

  log('bright', '\n📊 Test Summary:');
  log('green', `✅ Passed: ${passed}`);
  if (failed > 0) {
    log('red', `❌ Failed: ${failed}`);
  }
  log('blue', `📈 Total: ${passed + failed}`);

  if (failed === 0) {
    log('green', '\n🎉 All workflow tests passed! Ready for manual testing.');
  } else {
    log(
      'yellow',
      '\n⚠️  Some tests failed. Please fix issues before manual testing.',
    );
    process.exit(1);
  }
}

async function runCoverageTests() {
  log('bright', '📊 Running Workflow Tests with Coverage\n');

  await runTest('test/integration', 'Integration Tests with Coverage', [
    '--coverage',
    '--coverageDirectory=coverage-workflow',
  ]);

  log('green', '📈 Coverage report generated in coverage-workflow/');
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';

  try {
    switch (command) {
      case 'all':
        await runAllTests();
        break;

      case 'user':
        await runTest(
          'test/integration/test-user-workflow.js',
          'Complete User Workflow Tests',
        );
        break;

      case 'files':
        await runTest(
          'test/integration/test-file-selection-workflow.js',
          'File Selection Workflow Tests',
        );
        break;

      case 'dragdrop':
        await runTest(
          'test/integration/test-drag-drop-workflow.js',
          'Drag and Drop Workflow Tests',
        );
        break;

      case 'coverage':
        await runCoverageTests();
        break;

      case 'watch':
        log('blue', '👀 Running tests in watch mode...');
        await runTest('test/integration', 'Workflow Tests (Watch Mode)', [
          '--watch',
        ]);
        break;

      case 'help':
      default:
        showHelp();
        break;
    }
  } catch (error) {
    log('red', `\n💥 Error: ${error.message}`);
    log('yellow', 'Run with "help" command to see usage instructions.');
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (error) => {
  log('red', `\n💥 Unhandled promise rejection: ${error.message}`);
  process.exit(1);
});

// Handle process termination
process.on('SIGINT', () => {
  log('yellow', '\n⚠️  Tests interrupted by user');
  process.exit(130);
});

if (require.main === module) {
  main();
}

module.exports = { runAllTests, runCoverageTests };
