/**
 * Jest configuration for StratoSort tests - Optimized
 * Updated to Jest 29 syntax with optimized settings for current test structure
 */

module.exports = {
  displayName: 'StratoSort Tests',
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  testMatch: [
    '**/__tests__/**/*.+(js|ts)',
    '**/*.(test|spec).+(js|ts)'
  ],
  transform: {
    '^.+\\.(ts)$': 'ts-jest',
    '^.+\\.(js)$': 'babel-jest'
  },
  collectCoverageFrom: [
    '../src/**/*.{js,ts}',
    '!../src/**/*.d.ts',
    '!../src/**/node_modules/**',
    '!../src/main/simple-main.js', // Exclude main entry point from coverage
    '!../src/shared/logger.js' // Exclude logger utility
  ],
  coverageDirectory: '../coverage',
  setupFilesAfterEnv: ['<rootDir>/test-setup.js'],
  setupFiles: ['<rootDir>/test-globals.js'],
  
  // Optimized for current test structure
  maxWorkers: 2, // Increased from 1 for better performance
  
  // Module mocking for external dependencies
  moduleNameMapper: {
    '^electron$': '<rootDir>/mocks/electron.js',
    '^ollama$': '<rootDir>/mocks/ollama.js',
    '^officeparser$': '<rootDir>/mocks/officeparser.js',
    '^node-tesseract-ocr$': '<rootDir>/mocks/tesseract.js',
    '^sharp$': '<rootDir>/mocks/sharp.js',
    '^xlsx-populate$': '<rootDir>/mocks/xlsx.js'
  },
  
  // Coverage thresholds for quality assurance
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    }
  },
  
  // Ignore patterns for performance
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/release/',
    '/coverage/'
  ],
  
  // Clear mocks between tests for reliability
  clearMocks: true,
  restoreMocks: true
}; 