# StratoSort Testing Strategy

## Overview

StratoSort implements a comprehensive, production-ready testing strategy that mirrors the Electron application's two-process architecture. The testing framework provides complete isolation from external dependencies while maintaining full fidelity to the application's IPC communication patterns.

## Architecture-Aligned Test Structure

The test structure mirrors StratoSort's Electron architecture:

```
test/
├── main/                    # Main Process Tests (Node.js)
│   └── electron-mocking-demo.test.js  # ✅ 7 passing tests
├── renderer/                # Renderer Process Tests (JSDOM)
│   └── components/          # Ready for React component tests
├── integration/             # IPC Integration Tests (14 suites)
│   └── [comprehensive integration test suite]
├── e2e/                     # End-to-End Tests
│   └── specs/
│       └── file-organization-workflow.spec.js  # ✅ 10 passing tests
├── shared/                  # Shared Test Infrastructure
│   ├── mocks/              # Comprehensive Mocks
│   │   ├── electron.js     # Main process Electron API
│   │   ├── electron-renderer.js  # Renderer IPC bridge
│   │   ├── electron-integration.js  # IPC testing utilities
│   │   ├── ollama.js       # AI service mock
│   │   └── [other dependency mocks]
│   ├── test-setup.js       # Main process setup
│   ├── test-globals.js     # Global test utilities
│   ├── renderer-setup.js   # Renderer process setup
│   └── integration-setup.js # IPC integration setup
├── jest.config.js          # Multi-project Jest configuration
└── run-tests.js            # Unified test runner
```

### Test Project Separation

- **Main Process**: Node.js environment, tests backend logic with mocked Electron APIs
- **Renderer Process**: JSDOM environment, tests React components with mocked IPC bridge
- **Integration**: Node.js environment, tests IPC communication between processes

## Running Tests

### Quick Commands

```bash
# Test entire application (all processes)
npm test

# Test specific processes
npm run test:main           # Main process (backend) tests only
npm run test:renderer       # Renderer process (frontend) tests only
npm run test:integration    # IPC integration tests only

# Test by functionality
npm run test:unit           # Core business logic
npm run test:e2e            # End-to-end workflows
npm run test:ai             # AI analysis and processing
npm run test:files          # File operations
npm run test:ui             # React components
npm run test:ipc            # Inter-process communication
npm run test:performance    # Performance benchmarks

# With coverage by process
npm run test:coverage:main
npm run test:coverage:renderer
npm run test:coverage:integration

# Development workflow
npm run test:watch          # Watch mode for all tests
npm run test:quick          # Fast validation (stop on first failure)
npm run test:coverage       # Full coverage report
```

### Test Runner

The custom test runner provides:

- **Process-specific testing**: Separate main/renderer/integration test execution
- **Category-based testing**: Focus on specific functionality
- **Clear output**: User-friendly test results with status indicators
- **Performance optimized**: Parallel execution with intelligent worker allocation
- **Coverage reporting**: Separate coverage reports for each process

## Mocking Strategy

### Electron API Mocking

StratoSort implements comprehensive Electron API mocks that faithfully replicate the runtime environment:

**Main Process Mocks** (`test/shared/mocks/electron.js`):

- `app`: Application lifecycle, paths, and metadata
- `BrowserWindow`: Window creation and management
- `ipcMain`: Inter-process communication handling
- `dialog`: Native file/directory dialogs
- `Menu`, `shell`, `globalShortcut`: Additional Electron APIs

**Renderer Process Mocks** (`test/shared/mocks/electron-renderer.js`):

- `ipcRenderer`: IPC communication from renderer
- `contextBridge`: Exposed API simulation
- Window.electronAPI: Complete preload script mock

**Integration Mocks** (`test/shared/mocks/electron-integration.js`):

- IPC round-trip simulation
- Event flow testing utilities
- Channel registration verification

### External Service Mocking

**Ollama AI Service** (`test/shared/mocks/ollama.js`):

- Complete AI analysis simulation
- Configurable response patterns
- Error condition testing
- Streaming response support

### File System Mocking

The file system is mocked using Jest's module mocking with in-memory state:

```javascript
// Example: Mock file system with specific state
const MOCK_FILES = {
  '/documents/invoice.pdf': 'PDF content',
  '/documents/contract.docx': 'Word content',
};
fs.__setMockFiles(MOCK_FILES);
```

```bash
# Get help
node test/run-tests.js --help

# Run with verbose output
npm run test:unit -- --verbose
```

## Test Categories

| Category      | Focus             | Description                          |
| ------------- | ----------------- | ------------------------------------ |
| `unit`        | Core logic        | Individual functions and modules     |
| `integration` | Workflows         | Multi-component interactions         |
| `e2e`         | Full workflows    | Complete user journeys               |
| `ai`          | AI processing     | Document analysis and categorization |
| `files`       | File operations   | Upload, processing, organization     |
| `ui`          | Components        | React component behavior             |
| `ipc`         | Communication     | Main/renderer process communication  |
| `performance` | Speed & resources | Performance benchmarks               |

## Writing Tests

### Unit Tests

```javascript
describe('File Organizer Core Logic', () => {
  test('analyzes document content correctly', () => {
    const result = analyzeDocument(testContent);
    expect(result.category).toBe('Financial');
  });
});
```

### Integration Tests

```javascript
describe('File Organization Workflow', () => {
  test('processes files end-to-end', async () => {
    const files = [createTestFile('doc.pdf')];
    const result = await processFiles(files);
    expect(result.success).toBe(true);
  });
});
```

## Mocks and Test Utilities

### Global Test Utilities

- `global.testUtils`: Common test helper functions
- `global.testFileSystem`: Mock file system operations
- `global.performanceUtils`: Performance measurement tools
- `global.testDataGenerators`: Test data factories

### Mock Services

- **Ollama**: AI analysis service
- **Electron**: Desktop app framework
- **File System**: OS file operations
- **External APIs**: Document processing libraries

## Best Practices

1. **Focus on functionality**: Test the file organization workflow
2. **Keep it simple**: Avoid over-engineering test setup
3. **Mock external deps**: Use mocks for external services
4. **Test edge cases**: Handle corrupted files, permissions, etc.
5. **Performance matters**: Include performance validation
6. **Clear naming**: Use descriptive test names

## Configuration

- **Jest config**: `test/jest.config.js`
- **Test runner**: `test/run-tests.js`
- **Setup files**: `test/shared/`
- **Coverage**: HTML and LCOV reports in `coverage/`

## Troubleshooting

### Common Issues

1. **Path resolution**: Ensure correct relative paths in mocks
2. **Async tests**: Use proper async/await patterns
3. **Mock setup**: Reset mocks between tests
4. **Performance**: Monitor test execution time

### Debug Mode

```bash
# Run with debugging
npm run test:unit -- --verbose

# Check test discovery
npx jest --listTests --testPathPatterns test/unit/
```

## Contributing

When adding new tests:

1. Follow the existing directory structure
2. Use appropriate test categories
3. Include both positive and negative test cases
4. Add performance considerations for heavy operations
5. Update this documentation if needed

## Future Improvements

- Enhanced E2E testing with realistic file scenarios
- Performance regression detection
- Visual testing for UI components
- Automated test generation for edge cases
