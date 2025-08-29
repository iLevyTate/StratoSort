// WebDriverIO configuration for future Electron E2E testing
// Currently using simple Jest/Node.js tests for E2E validation
// TODO: Implement full WebDriverIO Electron integration

const { join } = require('path');

exports.config = {
  // ====================
  // Runner Configuration
  // ====================
  runner: 'local',

  // ============
  // Specs
  // ============
  specs: [join(process.cwd(), 'e2e-tests', 'specs', '*.e2e.js')],

  // ============
  // Capabilities
  // ============
  // For now, using simple validation tests that don't require WebDriver
  capabilities: [
    {
      browserName: 'chrome',
      'goog:chromeOptions': {
        args: [
          '--headless',
          '--disable-gpu',
          '--no-sandbox',
          '--disable-dev-shm-usage',
        ],
      },
    },
  ],

  // ===================
  // Test Configurations
  // ===================
  logLevel: 'info',
  bail: 0,
  waitforTimeout: 30000,

  // ===================
  // Test Runner Services
  // ===================
  services: [],

  // ========
  // Frameworks
  // ========
  framework: 'mocha',

  // ============
  // Reporters
  // ============
  reporters: ['spec'],

  // ============
  // Hooks
  // ============
  before: function (capabilities, specs) {
    console.log('🧪 Starting E2E Test Suite...');
  },

  afterTest: function (
    test,
    context,
    { error, result, duration, passed, retries },
  ) {
    if (error) {
      console.log(`❌ Test failed: ${test.title}`);
    } else {
      console.log(`✅ Test passed: ${test.title}`);
    }
  },

  // ===================
  // Mocha Configuration
  // ===================
  mochaOpts: {
    ui: 'bdd',
    timeout: 60000,
    retries: 0,
    slow: 10000,
  },
};
