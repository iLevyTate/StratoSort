# 🚀 StratoSort E2E Tests - Quick Start Guide

## Prerequisites

Your project already has WebDriverIO installed! 🎉

```bash
# Verify installation
npm list webdriverio
npm list wdio-electron-service
```

## 🏃‍♂️ Quick Start (5 minutes)

### Step 1: Install Playwright (Optional but Recommended)

```bash
npm install -D @playwright/test playwright
npx playwright install electron
```

### Step 2: Create Your First E2E Test

```javascript
// e2e-tests/specs/user-journey.e2e.js
const { expect } = require('chai');

describe('StratoSort User Journey', () => {
  it('should complete file organization workflow', async () => {
    // Wait for app to load
    const mainWindow = await browser.$('.main-window');
    await mainWindow.waitForDisplayed({ timeout: 10000 });

    // Click file selection
    const fileSelectBtn = await browser.$('[data-testid="file-select-button"]');
    await fileSelectBtn.click();

    // Simulate file selection (mock for now)
    await browser.execute(() => {
      window.mockFileSelection([
        {
          name: 'report.pdf',
          path: '/test-files/report.pdf',
          type: 'application/pdf',
        },
      ]);
    });

    // Verify file appears
    const fileItem = await browser.$('.file-item');
    await fileItem.waitForDisplayed();

    // Start organization
    const organizeBtn = await browser.$('[data-testid="organize-button"]');
    await organizeBtn.click();

    // Wait for completion
    const successMsg = await browser.$('.success-message');
    await successMsg.waitForDisplayed({ timeout: 30000 });

    // Verify results
    const successText = await successMsg.getText();
    expect(successText).to.include('Successfully organized');
  });
});
```

### Step 3: Run Your First Test

```bash
# Build the app first
npm run build

# Run E2E tests
npm run test:e2e

# Or run with WebDriverIO directly
npx wdio run e2e-tests/wdio.conf.js
```

## 🎯 Test Scenarios to Implement

### **Phase 1: Core Workflows (Week 1)**

1. **File Selection & Upload**

   ```javascript
   describe('File Selection', () => {
     it('should handle single file upload');
     it('should handle multiple file upload');
     it('should validate file types');
     it('should show file previews');
   });
   ```

2. **Basic Organization**
   ```javascript
   describe('File Organization', () => {
     it('should organize files by type');
     it('should create organized folder structure');
     it('should handle existing files');
     it('should show progress during organization');
   });
   ```

### **Phase 2: Advanced Features (Week 2)**

3. **AI-Powered Features**

   ```javascript
   describe('AI Processing', () => {
     it('should analyze document content');
     it('should categorize files intelligently');
     it('should handle processing errors');
     it('should show confidence scores');
   });
   ```

4. **User Experience**
   ```javascript
   describe('User Interface', () => {
     it('should provide real-time progress');
     it('should handle user cancellations');
     it('should show helpful error messages');
     it('should maintain responsive UI');
   });
   ```

## 🛠️ Test Data Setup

### Create Test Files Directory

```bash
mkdir -p e2e-tests/test-files

# Add sample files for testing
echo "Sample PDF content" > e2e-tests/test-files/sample.pdf
echo "Sample document content" > e2e-tests/test-files/sample.docx
echo "Sample spreadsheet content" > e2e-tests/test-files/sample.xlsx
```

### Mock Helper Functions

```javascript
// e2e-tests/helpers/mock-helpers.js
export const mockFileSelection = (files) => {
  // Simulate file selection in the Electron app
  return browser.execute((fileList) => {
    window.mockSelectedFiles = fileList;
    // Trigger file selection event
    const event = new CustomEvent('files-selected', { detail: fileList });
    window.dispatchEvent(event);
  }, files);
};

export const waitForOrganization = (timeout = 30000) => {
  return browser.waitUntil(
    async () => {
      const progress = await browser.$('.progress-bar');
      const isComplete = await progress.getAttribute('data-complete');
      return isComplete === 'true';
    },
    { timeout },
  );
};
```

## 🔧 Configuration Tips

### WebDriverIO Configuration

```javascript
// e2e-tests/wdio.conf.js
export.config = {
  capabilities: [{
    browserName: 'electron',
    'wdio:electronServiceOptions': {
      appPath: './dist/main.js',
      appArgs: ['--enable-logging'],
      chromedriver: { port: 9515 }
    }
  }],

  // Add test IDs to your components
  before: async () => {
    // Wait for app to be ready
    await browser.waitUntil(async () => {
      const title = await browser.getTitle();
      return title.includes('StratoSort');
    }, { timeout: 30000 });
  },

  // Screenshot on failure
  afterTest: async (test, context, { error }) => {
    if (error) {
      await browser.takeScreenshot();
    }
  }
};
```

## 🎯 Success Metrics

Aim for these targets:

- ✅ **80%+ E2E Test Coverage** of user workflows
- ✅ **< 30 seconds** test execution time
- ✅ **< 5% flaky tests** (consistent results)
- ✅ **Real user scenario validation**

## 🚨 Common Issues & Solutions

### 1. **App Not Starting**

```javascript
// Check your wdio.conf.js
'wdio:electronServiceOptions': {
  appPath: path.join(process.cwd(), 'dist', 'main.js'), // Correct path
  appArgs: ['--enable-logging']
}
```

### 2. **Elements Not Found**

```javascript
// Add data-testid attributes to your components
<button data-testid="file-select-button">Select Files</button>;

// Use specific selectors in tests
await browser.$('[data-testid="file-select-button"]').click();
```

### 3. **Timing Issues**

```javascript
// Wait for async operations
await browser.waitUntil(
  async () => {
    const files = await browser.$$('.file-item');
    return files.length > 0;
  },
  { timeout: 10000 },
);
```

## 📊 Integration with Existing Tests

Your existing tests are excellent! Add E2E tests as a complementary layer:

```bash
# Run all tests together
npm run test:workflow:all  # Your existing tests (100% pass)
npm run test:e2e          # New E2E tests

# Combined CI/CD
npm run test:full && npm run test:e2e
```

## 🎉 You're Ready!

Your StratoSort project has:

- ✅ **100% existing test coverage**
- ✅ **WebDriverIO already configured**
- ✅ **Clear E2E testing strategy**
- ✅ **Practical implementation guide**

**Start with one simple test and build from there!** 🚀

---

_Need help? Check the full guide at `e2e-tests/README.md`_
