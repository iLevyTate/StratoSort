module.exports = {
  projects: [
    // Main Process Config
    {
      displayName: 'main',
      testEnvironment: 'node',
      testMatch: ['test/main/**/*.test.js', 'test/integration/**/*.test.js'],
      roots: ['src/main', 'test'],
      setupFilesAfterEnv: ['test/shared/test-setup.js'],
      moduleNameMapper: {
        '^electron$': '__mocks__/electron.js',
        '^ollama$': 'test/shared/mocks/ollama.js',
        '^officeparser$': 'test/shared/mocks/officeparser.js',
        '^node-tesseract-ocr$': 'test/shared/mocks/tesseract.js',
        '^sharp$': 'test/shared/mocks/sharp.js',
        '^xlsx-populate$': 'test/shared/mocks/xlsx.js',
        '^sanitize-html$': 'test/shared/mocks/sanitize-html.js',
      },
    },
    // Renderer Process Config
    {
      displayName: 'renderer',
      testEnvironment: 'jsdom',
      testMatch: [
        'test/renderer/**/*.test.js',
        'test/renderer/**/*.test.jsx',
        'test/components/**/*.test.js',
        'test/components/**/*.test.jsx',
      ],
      roots: ['src/renderer', 'test'],
      setupFilesAfterEnv: ['renderer.setup.js'],
      moduleNameMapper: {
        '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
        '^electron$': '__mocks__/electron.js',
      },
      transform: {
        '^.+\\.(js|jsx)$': 'babel-jest',
      },
    },
  ],
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['json', 'lcov', 'text', 'clover'],
};
