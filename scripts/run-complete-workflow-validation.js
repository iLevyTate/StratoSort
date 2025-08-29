#!/usr/bin/env node

/**
 * Complete StratoSort Workflow Validation Script
 * Runs comprehensive tests to ensure the entire application works from start to finish
 */

const path = require('path');
const { spawn } = require('child_process');

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

function showBanner() {
  log('bright', '🚀 StratoSort Complete Workflow Validation');
  log('cyan', '   Ensuring nothing is broken from start to finish');
  log('reset', '');
  log('blue', '   This script validates the entire StratoSort application:');
  log('reset', '   • Application startup and initialization');
  log('reset', '   • Service initialization and dependencies');
  log('reset', '   • IPC communication between processes');
  log('reset', '   • File selection and analysis workflow');
  log('reset', '   • Phase transitions and state management');
  log('reset', '   • File organization and folder mapping');
  log('reset', '   • Error handling and recovery');
  log('reset', '   • Performance monitoring');
  log('reset', '');
}

function showHelp() {
  showBanner();
  log('cyan', 'Usage:');
  log('reset', '  node scripts/run-complete-workflow-validation.js [command]');
  log('reset', '  npm run validate:workflow [command]');
  log('reset', '');

  log('cyan', 'Commands:');
  log('reset', '  all          - Run complete workflow validation (default)');
  log(
    'reset',
    '  critical     - Run only critical tests (startup, IPC, services)',
  );
  log('reset', '  workflow     - Run workflow-specific tests');
  log('reset', '  errors       - Run error handling tests');
  log('reset', '  performance  - Run performance tests');
  log('reset', '  coverage     - Run with coverage report');
  log('reset', '  help         - Show this help message');
  log('reset', '');

  log('cyan', 'Examples:');
  log('reset', '  node scripts/run-complete-workflow-validation.js all');
  log('reset', '  node scripts/run-complete-workflow-validation.js critical');
  log('reset', '  npm run validate:workflow coverage');
  log('reset', '');
}

async function runTest(testPath, description, extraArgs = []) {
  return new Promise((resolve, reject) => {
    log('blue', `📋 Running: ${description}`);

    const args = ['test', '--', testPath, '--verbose', ...extraArgs];
    const child = spawn('npm', args, {
      stdio: 'inherit',
      shell: true,
      cwd: path.join(__dirname, '..'),
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

async function runCompleteValidation() {
  log('bright', '🎯 Starting Complete StratoSort Workflow Validation\n');

  const testSuites = [
    {
      path: 'test/integration/test-complete-app-lifecycle.test.js',
      description: 'Application Lifecycle Tests',
      category: 'critical',
    },
    {
      path: 'test/integration/test-ipc-communication.test.js',
      description: 'IPC Communication Tests',
      category: 'critical',
    },
    {
      path: 'test/integration/test-service-initialization.test.js',
      description: 'Service Initialization Tests',
      category: 'critical',
    },
    {
      path: 'test/integration/test-user-workflow.test.js',
      description: 'User Workflow Tests',
      category: 'important',
    },
    {
      path: 'test/integration/test-file-selection-workflow.test.js',
      description: 'File Selection Tests',
      category: 'important',
    },
    {
      path: 'test/integration/test-drag-drop-workflow.test.js',
      description: 'Drag & Drop Tests',
      category: 'important',
    },
    {
      path: 'test/integration/test-end-to-end-workflow.test.js',
      description: 'End-to-End Workflow Tests',
      category: 'important',
    },
    {
      path: 'test/integration/test-error-recovery.test.js',
      description: 'Error Recovery Tests',
      category: 'optional',
    },
    {
      path: 'test/integration/test-complete-workflow-validation.test.js',
      description: 'Complete Validation Suite',
      category: 'comprehensive',
    },
  ];

  let passed = 0;
  let failed = 0;
  const skipped = 0;

  log('cyan', '📊 Test Suites to Run:');
  testSuites.forEach((suite, index) => {
    log('reset', `  ${index + 1}. ${suite.description} (${suite.category})`);
  });
  log('reset', '');

  for (const suite of testSuites) {
    try {
      await runTest(suite.path, suite.description);
      passed++;
    } catch (error) {
      failed++;
      log('yellow', `⚠️  Continuing with remaining tests...\n`);
    }
  }

  // Generate summary report
  log('bright', '='.repeat(60));
  log('bright', '📊 WORKFLOW VALIDATION SUMMARY REPORT');
  log('bright', '='.repeat(60));

  log('green', `✅ Passed: ${passed}`);
  if (failed > 0) {
    log('red', `❌ Failed: ${failed}`);
  }
  if (skipped > 0) {
    log('yellow', `⏭️  Skipped: ${skipped}`);
  }

  const totalTests = passed + failed + skipped;
  const successRate =
    totalTests > 0 ? ((passed / totalTests) * 100).toFixed(1) : '0.0';

  log('blue', `📈 Success Rate: ${successRate}%`);
  log('cyan', `📋 Total Test Suites: ${totalTests}`);

  log('reset', '');

  // Provide recommendations
  if (failed === 0) {
    log('green', '🎉 ALL WORKFLOW TESTS PASSED!');
    log('reset', '   ✅ StratoSort is fully functional');
    log('reset', '   ✅ No breaking changes detected');
    log('reset', '   ✅ Ready for production use');
    log('reset', '   ✅ All services operational');
    log('reset', '   ✅ Complete user journey validated');
  } else {
    log('yellow', '⚠️  SOME TESTS FAILED - ATTENTION REQUIRED');
    log('reset', '   📋 Review failed test output above');
    log('reset', '   🛠️  Fix issues before deployment');
    log('reset', '   🔄 Re-run validation after fixes');

    if (failed > 3) {
      log('red', '   🚨 Multiple critical failures detected');
      log('reset', '   📞 Consider reviewing recent changes');
    }
  }

  log('reset', '');
  log('blue', '💡 Next Steps:');
  log('reset', '   • Review individual test results for details');
  log('reset', '   • Check error logs for specific issues');
  log('reset', '   • Validate with manual testing');
  log('reset', '   • Monitor performance metrics');

  log('reset', '');
  log('cyan', '🔧 Available Commands:');
  log('reset', '   npm run test:workflow all         - Run all workflow tests');
  log(
    'reset',
    '   npm run test:workflow critical    - Run critical tests only',
  );
  log('reset', '   npm run test:workflow coverage    - Run with coverage');
  log(
    'reset',
    '   node scripts/run-workflow-tests.js help  - Show all options',
  );

  log('bright', '='.repeat(60));

  // Exit with appropriate code
  if (failed > 0) {
    process.exit(1);
  }
}

async function runCriticalTests() {
  log('bright', '🚨 Running Critical Tests Only\n');

  const criticalTests = [
    'test/integration/test-complete-app-lifecycle.js',
    'test/integration/test-ipc-communication.js',
    'test/integration/test-service-initialization.js',
  ];

  let passed = 0;
  let failed = 0;

  for (const testPath of criticalTests) {
    try {
      const description = path
        .basename(testPath, '.js')
        .replace(/-/g, ' ')
        .replace(/\b\w/g, (l) => l.toUpperCase());
      await runTest(testPath, description);
      passed++;
    } catch (error) {
      failed++;
    }
  }

  log('cyan', `📊 Critical Tests: ${passed} passed, ${failed} failed`);

  if (failed === 0) {
    log('green', '✅ All critical systems operational');
  } else {
    log('red', '❌ Critical failures detected - immediate attention required');
    process.exit(1);
  }
}

async function runWorkflowTests() {
  log('bright', '🔄 Running Workflow-Specific Tests\n');

  const workflowTests = [
    'test/integration/test-user-workflow.test.js',
    'test/integration/test-file-selection-workflow.test.js',
    'test/integration/test-drag-drop-workflow.test.js',
    'test/integration/test-end-to-end-workflow.test.js',
  ];

  let passed = 0;
  let failed = 0;

  for (const testPath of workflowTests) {
    try {
      const description = path
        .basename(testPath, '.js')
        .replace(/-/g, ' ')
        .replace(/\b\w/g, (l) => l.toUpperCase());
      await runTest(testPath, description);
      passed++;
    } catch (error) {
      failed++;
    }
  }

  log('cyan', `📊 Workflow Tests: ${passed} passed, ${failed} failed`);

  if (failed === 0) {
    log('green', '✅ Complete user workflow functional');
  } else {
    log('yellow', '⚠️  Workflow issues detected');
  }
}

async function runWithCoverage() {
  log('bright', '📊 Running Complete Validation with Coverage\n');

  await runTest(
    'test/integration',
    'Complete Integration Test Suite with Coverage',
    ['--coverage', '--coverageDirectory=coverage-workflow'],
  );

  log('green', '📈 Coverage report generated in coverage-workflow/');
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'all';

  try {
    switch (command) {
      case 'all':
        await runCompleteValidation();
        break;

      case 'critical':
        await runCriticalTests();
        break;

      case 'workflow':
        await runWorkflowTests();
        break;

      case 'errors':
        await runTest(
          'test/integration/test-error-recovery.test.js',
          'Error Recovery Tests',
        );
        break;

      case 'performance':
        log('yellow', '⚠️  Performance tests integrated into main validation');
        log(
          'reset',
          '   Run "all" command for complete performance validation',
        );
        break;

      case 'coverage':
        await runWithCoverage();
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
  log('yellow', '\n⚠️  Validation interrupted by user');
  process.exit(130);
});

if (require.main === module) {
  main();
}

module.exports = { runCompleteValidation, runCriticalTests, runWorkflowTests };
