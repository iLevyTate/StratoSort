/**
 * Jest configuration for StratoSort tests (unit + integration).
 * Updated to Jest 29 syntax—removed deprecated options that triggered warnings.
 */

module.exports = {
  displayName: 'Stratosort Tests',
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  testMatch: ['**/__tests__/**/*.+(js|ts)', '**/*.(test|spec).+(js|ts)'],
  transform: {
    '^.+\\.(ts)$': 'ts-jest',
    '^.+\\.(js)$': 'babel-jest',
  },
  collectCoverageFrom: [
    '../src/**/*.{js,ts}',
    '!../src/**/*.d.ts',
    '!../src/**/node_modules/**',
  ],
  coverageDirectory: '../coverage',
  setupFilesAfterEnv: ['<rootDir>/test-setup.js'],
  // Sequential execution keeps Ollama mocks deterministic
  maxWorkers: 1,

  moduleNameMapper: {
    '^electron$': '<rootDir>/mocks/electron.js',
    '^ollama$': '<rootDir>/mocks/ollama.js',
    '^officeparser$': '<rootDir>/mocks/officeparser.js',
    '^node-tesseract-ocr$': '<rootDir>/mocks/tesseract.js',
    '^sharp$': '<rootDir>/mocks/sharp.js',
    '^xlsx-populate$': '<rootDir>/mocks/xlsx.js',
    '^sanitize-html$': '<rootDir>/mocks/sanitize-html.js',
  },

  // Global setup for DOM-dependent packages
  setupFiles: ['<rootDir>/test-globals.js'],
};
