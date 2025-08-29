# StratoSort Integration Tests

This directory contains **real integration tests** that validate actual StratoSort application functionality, not mock behavior. These tests ensure the application works correctly by testing real services, file operations, and system interactions.

## Test Files Overview

### `test-real-app-integration.test.js` ⭐ **MOST IMPORTANT**

**Purpose**: Tests actual StratoSort application code and services

- Real `SettingsService` functionality (load/save operations)
- Real `ServiceIntegration` initialization and dependencies
- Real file system operations using Node.js `fs` module
- Real constants validation from `src/shared/constants`
- Real service dependency testing
- **This is the gold standard for integration testing**

### `test-file-move.test.js`

**Purpose**: Tests real file system operations

- Actual file movement using `fs.rename()`
- Directory creation and organization
- File content preservation validation
- Error handling for file operations
- **Tests real file system functionality**

### `test-folder-creation.test.js`

**Purpose**: Tests real directory and folder management

- Real directory creation with `fs.mkdir()`
- Cross-platform path handling
- Folder structure organization
- Permission and accessibility testing
- **Tests real file system organization**

### `test-enhanced-paths.test.js`

**Purpose**: Tests real path resolution and platform-specific behavior

- Actual path resolution logic
- Platform-specific path separators
- Home directory resolution
- Path validation and normalization
- **Tests real path utility functions**

### `test-service-initialization.test.js`

**Purpose**: Tests real service initialization and dependencies

- Actual service initialization order
- Real service dependency management
- Service lifecycle testing
- Circular dependency detection
- **Tests real service coordination**

### `test-file-selection-workflow.test.js`

**Purpose**: Tests real file operations and workflow

- Real file selection and scanning
- File analysis integration
- Workflow state management
- Error handling in file operations
- **Tests real file processing workflows**

### `test-end-to-end-workflow.test.js`

**Purpose**: Tests complete real application workflows

- Full application startup sequences
- End-to-end user journey testing
- Real performance monitoring
- Workflow error recovery
- **Tests complete real application flows**

## Test Quality Standards

### ✅ **Real Functionality Tests** (Current Suite)

- Import and test actual application modules from `src/`
- Use real services, not mocks
- Test actual file system operations
- Validate real application behavior
- **Result**: High confidence in application functionality

### ❌ **Mock-Only Tests** (Previously Removed)

- Test interactions between mock objects
- Validate mock behavior, not real functionality
- Provide false confidence
- Don't catch real integration issues
- **Result**: Low confidence in actual application\*\*

## Running the Tests

### Run All Integration Tests

```bash
npm test -- test/integration
```

### Run Specific Test Files

```bash
# Run real application integration tests (most important)
npm test -- test/integration/test-real-app-integration.test.js

# Run file system operation tests
npm test -- test/integration/test-file-move.test.js

# Run folder creation tests
npm test -- test/integration/test-folder-creation.test.js
```

### Test Results

- **Current Status**: 80/80 tests passing (100% success rate)
- **Test Coverage**: Real application functionality validation
- **Test Quality**: High confidence in application correctness
- **Test Type**: Real integration testing, not mock validation

## Test Philosophy

**"Test what actually matters - real application functionality"**

These tests ensure StratoSort works correctly by:

1. **Testing Real Code**: Import and exercise actual application modules
2. **Validating Real Operations**: Test actual file system operations, service interactions
3. **Ensuring Integration**: Verify components work together correctly
4. **Preventing Regressions**: Catch real functionality issues before they reach users

**Previous mock-heavy tests were removed because they tested mock behavior, not real functionality.**

### Run Tests with Coverage

```bash
npm test -- --coverage test/integration
```

## Test Data

The tests use real files from the `test/test-files/` directory:

- `sample.pdf` - Document test file
- `test-image.jpg` - Image test file
- `project-report.md` - Markdown document
- `guide-2b3a698c.docx` - Word document
- `inventory-4e5a1be6.xlsx` - Excel spreadsheet

## Real Application Testing

These tests focus on real functionality:

- **No mock services** - Uses actual StratoSort services
- **Real file operations** - Tests actual file system interactions
- **Real service integration** - Tests actual service dependencies
- **Real error conditions** - Tests actual error handling

## What the Tests Validate

### Real Functionality Testing

1. **Service Initialization**: Real service loading and dependency management
2. **File System Operations**: Actual file creation, movement, and organization
3. **Settings Persistence**: Real settings save/load operations
4. **Path Resolution**: Cross-platform path handling and validation
5. **Error Recovery**: Real error handling and recovery mechanisms
6. **Performance Monitoring**: Actual performance measurement and validation

## Benefits

### For Development

- **Real Integration Testing**: Tests actual application functionality
- **Regression Prevention**: Catch real functionality issues early
- **High Confidence**: Know the application actually works correctly
- **Workflow Validation**: Ensure complete user journey works
- **CI/CD Integration**: Run tests automatically in build pipeline

### For Manual Testing

- **Quick Verification**: Run tests to verify functionality before manual testing
- **Edge Case Coverage**: Tests cover scenarios hard to reproduce manually
- **Consistent Results**: Same test data and conditions every time
  // Mock electron API calls
