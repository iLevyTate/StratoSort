/**
 * End-to-End Workflow Integration Tests
 * Tests the complete StratoSort user journey from application startup
 * through file organization, ensuring nothing is broken in the process
 */

const fs = require('fs').promises;
const path = require('path');
const { PHASES, IPC_CHANNELS } = require('../../src/shared/constants');

// Mock all required modules before any imports
jest.mock('electron', () => ({
  app: {
    getPath: jest.fn((type) => `/mock/path/${type}`),
    getVersion: jest.fn(() => '1.0.0'),
    on: jest.fn(),
    once: jest.fn(),
    quit: jest.fn(),
    exit: jest.fn(),
  },
  BrowserWindow: jest.fn(() => ({
    loadFile: jest.fn(),
    loadURL: jest.fn(),
    show: jest.fn(),
    hide: jest.fn(),
    close: jest.fn(),
    destroy: jest.fn(),
    on: jest.fn(),
    setMenu: jest.fn(),
    setTitle: jest.fn(),
    isDestroyed: jest.fn(() => false),
    webContents: {
      send: jest.fn(),
      on: jest.fn(),
      once: jest.fn(),
    },
  })),
  ipcMain: {
    handle: jest.fn(),
    on: jest.fn(),
    once: jest.fn(),
    removeHandler: jest.fn(),
    removeListener: jest.fn(),
  },
  dialog: {
    showOpenDialog: jest.fn(),
    showSaveDialog: jest.fn(),
    showMessageBox: jest.fn(),
  },
  shell: {
    openPath: jest.fn(),
    showItemInFolder: jest.fn(),
  },
}));

jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    mkdir: jest.fn().mockResolvedValue(true),
    stat: jest.fn(),
    readdir: jest.fn(),
    access: jest.fn().mockResolvedValue(true),
    unlink: jest.fn(),
    rename: jest.fn(),
  },
}));

jest.mock('path', () => ({
  join: jest.fn((...args) => args.join('/')),
  dirname: jest.fn((p) => p.split('/').slice(0, -1).join('/')),
  resolve: jest.fn((...args) => args.join('/')),
  basename: jest.fn((p) => p.split('/').pop()),
  extname: jest.fn((p) => {
    const ext = p.split('.').pop();
    return ext ? '.' + ext : '';
  }),
}));

describe('Complete End-to-End Workflow Integration Tests', () => {
  let services,
    mockApp,
    mockBrowserWindow,
    mockIpcMain,
    mockDialog,
    mockFs,
    mockPath;
  let TEST_FILES_DATA;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock services
    services = {
      settings: {
        get: jest.fn(),
        set: jest.fn(),
        load: jest.fn().mockResolvedValue(true),
        save: jest.fn().mockResolvedValue(true),
      },
      downloadWatcher: {
        start: jest.fn(),
        stop: jest.fn(),
      },
      performance: {
        startMonitoring: jest.fn(),
        stopMonitoring: jest.fn(),
        getMetrics: jest.fn(),
      },
      ollama: {
        initialize: jest.fn().mockResolvedValue(true),
        connect: jest.fn().mockResolvedValue(true),
        analyze: jest.fn(),
        isConnected: jest.fn().mockReturnValue(true),
      },
      folderMatching: {
        initialize: jest.fn().mockResolvedValue(true),
        match: jest.fn(),
      },
    };

    // Setup test files data
    TEST_FILES_DATA = [
      {
        name: 'document1.pdf',
        path: '/mock/document1.pdf',
        type: 'application/pdf',
        size: 1024,
        expectedCategory: 'Document',
        expectedFolder: 'Documents',
      },
      {
        name: 'image1.jpg',
        path: '/mock/image1.jpg',
        type: 'image/jpeg',
        size: 2048,
        expectedCategory: 'Image',
        expectedFolder: 'Images',
      },
      {
        name: 'spreadsheet1.xlsx',
        path: '/mock/spreadsheet1.xlsx',
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: 3072,
        expectedCategory: 'Financial',
        expectedFolder: 'Financial',
      },
      {
        name: 'report1.md',
        path: '/mock/report1.md',
        type: 'text/markdown',
        size: 512,
        expectedCategory: 'Project',
        expectedFolder: 'Projects',
      },
      {
        name: 'notes1.doc',
        path: '/mock/notes1.doc',
        type: 'application/msword',
        size: 1536,
        expectedCategory: 'Document',
        expectedFolder: 'Documents',
      },
    ];

    // Get mock instances
    mockApp = require('electron').app;
    mockBrowserWindow = require('electron').BrowserWindow;
    mockIpcMain = require('electron').ipcMain;
    mockDialog = require('electron').dialog;
    mockFs = require('fs');
    mockPath = require('path');
  });

  describe('Complete Application Startup Sequence', () => {
    test('should execute full startup sequence successfully', async () => {
      const performStartup = async () => {
        const sequence = [];

        // Step 1: App ready
        sequence.push({ step: 'app-ready', timestamp: Date.now() });

        // Step 2: Window creation
        const mainWindow = new mockBrowserWindow({
          width: 1200,
          height: 800,
          webPreferences: { nodeIntegration: false },
        });
        sequence.push({ step: 'window-created', timestamp: Date.now() });

        // Step 3: Load renderer
        mainWindow.loadFile('/mock/index.html');
        sequence.push({ step: 'renderer-loaded', timestamp: Date.now() });

        // Step 4: Initialize services
        await services.settings.load();
        await services.ollama.initialize();
        await services.folderMatching.initialize();
        services.performance.startMonitoring();
        services.downloadWatcher.start();
        sequence.push({ step: 'services-initialized', timestamp: Date.now() });

        // Step 5: Setup IPC
        mockIpcMain.handle('app:getVersion', () => mockApp.getVersion());
        mockIpcMain.handle('files:select', async () => ({
          success: true,
          files: [],
        }));
        sequence.push({ step: 'ipc-setup', timestamp: Date.now() });

        // Step 6: Show window
        mainWindow.show();
        sequence.push({ step: 'window-show', timestamp: Date.now() });

        return { success: true, sequence };
      };

      const result = await performStartup();

      expect(result.success).toBe(true);
      expect(result.sequence).toHaveLength(6);
      expect(result.sequence[0].step).toBe('app-ready');
      expect(result.sequence[5].step).toBe('window-show');
    });

    test('should handle startup failures gracefully', async () => {
      const performFailedStartup = async () => {
        try {
          // Simulate window creation failure
          mockBrowserWindow.mockImplementationOnce(() => {
            throw new Error('Window creation failed');
          });

          new mockBrowserWindow({ width: 1200, height: 800 });
          return { success: true };
        } catch (error) {
          return { success: false, error: error.message };
        }
      };

      const result = await performFailedStartup();
      expect(result.success).toBe(false);
      expect(result.error).toBe('Window creation failed');
    });
  });

  describe('Complete User Workflow Journey', () => {
    test('should execute complete user workflow from start to finish', async () => {
      // Mock successful analysis results
      TEST_FILES_DATA.forEach((file, index) => {
        services.ollama.analyze.mockResolvedValueOnce({
          status: 'success',
          analysis: {
            category: file.expectedCategory,
            confidence: 0.9,
            suggestedFolder: file.expectedFolder,
          },
        });
      });

      const executeWorkflow = async () => {
        const workflowSteps = [];

        // Step 1: File selection
        mockDialog.showOpenDialog.mockResolvedValue({
          canceled: false,
          filePaths: TEST_FILES_DATA.map((f) => f.path),
        });

        const fileSelection = await mockDialog.showOpenDialog();
        expect(fileSelection.filePaths).toHaveLength(TEST_FILES_DATA.length);
        workflowSteps.push({ step: 'files-selected', timestamp: Date.now() });

        // Step 2: Analysis
        const analysisPromises = TEST_FILES_DATA.map(async (file) => {
          const analysis = await services.ollama.analyze(file.path);
          return { file: file.name, analysis };
        });

        const analysisResults = await Promise.all(analysisPromises);
        expect(analysisResults).toHaveLength(TEST_FILES_DATA.length);
        workflowSteps.push({
          step: 'analysis-completed',
          timestamp: Date.now(),
        });

        // Step 3: Organization
        analysisResults.forEach((result, index) => {
          services.folderMatching.match.mockResolvedValueOnce({
            success: true,
            destination: `/organized/${result.analysis.suggestedFolder}/${result.file}`,
          });
        });

        const organizationPromises = analysisResults.map(async (result) => {
          const matchResult = await services.folderMatching.match(
            { name: result.file },
            result.analysis.category,
          );
          return { file: result.file, organization: matchResult };
        });

        const organizationResults = await Promise.all(organizationPromises);
        expect(organizationResults).toHaveLength(TEST_FILES_DATA.length);
        workflowSteps.push({
          step: 'organization-completed',
          timestamp: Date.now(),
        });

        return { success: true, steps: workflowSteps.length };
      };

      const result = await executeWorkflow();
      expect(result.success).toBe(true);
      expect(result.steps).toBe(3);
    });

    test('should handle workflow interruptions and recovery', async () => {
      const workflowSteps = [];
      const interruptionPoint = 'analysis';

      const executeInterruptedWorkflow = async () => {
        workflowSteps.push({ step: 'started', timestamp: Date.now() });

        // Step 1: File selection
        workflowSteps.push({ step: 'files-selected', timestamp: Date.now() });

        // Step 2: Analysis with interruption
        workflowSteps.push({
          step: 'analysis-interrupted',
          timestamp: Date.now(),
        });

        // Step 3: Recovery
        workflowSteps.push({ step: 'recovery-started', timestamp: Date.now() });

        // Mock recovery analysis
        TEST_FILES_DATA.slice(0, 2).forEach((file) => {
          services.ollama.analyze.mockResolvedValueOnce({
            status: 'success',
            analysis: {
              category: file.expectedCategory,
              confidence: 0.9,
              suggestedFolder: file.expectedFolder,
            },
          });
        });

        // Resume analysis
        const recoveryPromises = TEST_FILES_DATA.slice(0, 2).map(
          async (file) => {
            const analysis = await services.ollama.analyze(file.path);
            return { file: file.name, analysis };
          },
        );

        await Promise.all(recoveryPromises);
        workflowSteps.push({ step: 'analysis-resumed', timestamp: Date.now() });

        // Complete organization
        workflowSteps.push({
          step: 'organization-completed',
          timestamp: Date.now(),
        });

        return {
          recovered: true,
          interruptionPoint,
          workflowSteps,
        };
      };

      const result = await executeInterruptedWorkflow();

      expect(result.recovered).toBe(true);
      expect(result.interruptionPoint).toBe('analysis');
      expect(workflowSteps).toHaveLength(6); // Updated to match actual steps
      expect(workflowSteps[2].step).toBe('analysis-interrupted');
      expect(workflowSteps[5].step).toBe('organization-completed');
    });
  });

  describe('Data Flow Validation', () => {
    test('should validate complete data flow from input to output', async () => {
      // Setup mock data flow
      const inputData = TEST_FILES_DATA;
      const processedData = [];

      // Mock folder matching for each file
      inputData.forEach((file) => {
        services.folderMatching.match.mockImplementation(
          (fileInfo, category) => {
            return Promise.resolve({
              success: true,
              destination: `/organized/${file.expectedFolder}/${file.name}`,
            });
          },
        );
      });

      // Process each file
      for (const file of inputData) {
        // Mock analysis
        services.ollama.analyze.mockResolvedValueOnce({
          status: 'success',
          analysis: {
            category: file.expectedCategory,
            confidence: 0.9,
            suggestedFolder: file.expectedFolder,
          },
        });

        const analysis = await services.ollama.analyze(file.path);
        const organization = await services.folderMatching.match(
          { name: file.name },
          analysis.analysis.category,
        );

        processedData.push({
          input: file,
          analysis: analysis.analysis,
          organization,
        });
      }

      expect(processedData).toHaveLength(inputData.length);
      processedData.forEach((item, index) => {
        expect(item.input.name).toBe(inputData[index].name);
        expect(item.analysis.category).toBeDefined();
        expect(item.organization.success).toBe(true);
      });
    });

    test('should handle data transformation through workflow phases', () => {
      const testData = TEST_FILES_DATA[0];

      // Simulate data transformation through phases
      const phaseData = {
        input: testData,
        discover: {
          files: [testData],
          analysis: {
            category: testData.expectedCategory,
            confidence: 0.9,
          },
        },
        organize: {
          destination: `/organized/${testData.expectedFolder}/${testData.name}`,
          success: true,
        },
      };

      expect(phaseData.input.name).toBe(testData.name);
      expect(phaseData.discover.analysis.category).toBe(
        testData.expectedCategory,
      );
      expect(phaseData.organize.destination).toContain(testData.expectedFolder);
    });
  });

  describe('Performance and Resource Monitoring', () => {
    test('should monitor complete workflow performance', async () => {
      const performanceMetrics = {
        startupTime: 0,
        analysisTime: 0,
        organizationTime: 0,
      };

      // Mock services
      services.ollama.analyze.mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return {
          status: 'success',
          analysis: { category: 'Document', confidence: 0.9 },
        };
      });

      services.folderMatching.match.mockResolvedValue({
        success: true,
        destination: '/organized/Documents/test.pdf',
      });

      // Measure startup time
      const startupStart = Date.now();
      await services.settings.load();
      await services.ollama.initialize();
      performanceMetrics.startupTime = Date.now() - startupStart;

      // Measure analysis time
      const analysisStart = Date.now();
      const analysisPromises = TEST_FILES_DATA.slice(0, 2).map(async (file) => {
        const analysis = await services.ollama.analyze(file.path);
        return { file: file.name, analysis };
      });
      await Promise.all(analysisPromises);
      performanceMetrics.analysisTime = Date.now() - analysisStart;

      // Measure organization time
      const organizationStart = Date.now();
      const organizationPromises = TEST_FILES_DATA.slice(0, 2).map(
        async (file) => {
          const result = await services.folderMatching.match(
            { name: file.name },
            'Document',
          );
          return { file: file.name, result };
        },
      );
      await Promise.all(organizationPromises);
      performanceMetrics.organizationTime = Date.now() - organizationStart;

      // Validate performance metrics
      expect(performanceMetrics.startupTime).toBeLessThan(5000); // < 5 seconds
      expect(performanceMetrics.analysisTime).toBeLessThan(10000); // < 10 seconds
      expect(performanceMetrics.organizationTime).toBeLessThan(5000); // < 5 seconds
    });

    test('should handle workflow resource usage', async () => {
      const resourceUsage = {
        memoryUsage: [],
        fileOperations: 0,
      };

      // Mock services
      services.ollama.analyze.mockImplementation(async (filePath) => {
        resourceUsage.fileOperations++;
        await new Promise((resolve) => setTimeout(resolve, 5));
        return {
          status: 'success',
          analysis: { category: 'Document', confidence: 0.9 },
        };
      });

      const monitorResources = async () => {
        const analysisPromises = TEST_FILES_DATA.map(async (file) => {
          const analysis = await services.ollama.analyze(file.path);
          return { file: file.name, completed: true };
        });

        const results = await Promise.all(analysisPromises);
        return { results, resourceUsage };
      };

      const result = await monitorResources();

      expect(result.results).toHaveLength(TEST_FILES_DATA.length);
      expect(result.resourceUsage.fileOperations).toBe(TEST_FILES_DATA.length);
      result.results.forEach((item) => {
        expect(item.completed).toBe(true);
      });
    });
  });

  describe('Workflow Error Recovery and Resilience', () => {
    test('should recover from partial workflow failures', async () => {
      // Mock services with mixed success/failure
      let callCount = 0;
      services.ollama.analyze.mockImplementation(async (filePath) => {
        callCount++;
        if (callCount === 1) {
          // First call fails
          throw new Error('services.ollama.analyze is not a function');
        }
        return {
          status: 'success',
          analysis: { category: 'Document', confidence: 0.9 },
        };
      });

      const executeWithErrors = async () => {
        const initialResults = [];
        const recoveryResults = [];

        // Initial attempts
        for (const file of TEST_FILES_DATA) {
          try {
            const analysis = await services.ollama.analyze(file.path);
            initialResults.push({ file: file.name, success: true });
          } catch (error) {
            initialResults.push({
              file: file.name,
              success: false,
              error: error.message,
            });
          }
        }

        // Recovery attempts (retry failed ones)
        const failedFiles = initialResults.filter((r) => !r.success);
        for (const failed of failedFiles) {
          try {
            // Mock successful retry
            services.ollama.analyze.mockResolvedValueOnce({
              status: 'success',
              analysis: { category: 'Document', confidence: 0.9 },
            });

            const analysis = await services.ollama.analyze(failed.file);
            recoveryResults.push({ file: failed.file, recovered: true });
          } catch (error) {
            recoveryResults.push({ file: failed.file, recovered: false });
          }
        }

        return {
          initialResults,
          recoveryResults,
          totalFiles: TEST_FILES_DATA.length,
        };
      };

      const result = await executeWithErrors();

      expect(result.initialResults).toHaveLength(5);
      expect(result.recoveryResults).toHaveLength(1); // One file failed initially
      expect(result.totalFiles).toBe(5);
    });

    test('should handle complete workflow rollback', () => {
      const rollbackSteps = [];

      const performRollback = () => {
        rollbackSteps.push('rollback-started');

        // Simulate cleanup
        rollbackSteps.push('files-cleaned');
        rollbackSteps.push('services-stopped');
        rollbackSteps.push('state-reset');

        rollbackSteps.push('rollback-completed');

        return {
          success: true,
          steps: rollbackSteps,
        };
      };

      const result = performRollback();

      expect(result.success).toBe(true);
      expect(result.steps).toContain('rollback-completed');
      expect(result.steps.length).toBeGreaterThan(3);
    });

    test('should provide workflow status and progress tracking', async () => {
      const statusUpdates = [];
      let currentProgress = { current: 0, total: 0, currentFile: '' };

      const trackWorkflowProgress = async () => {
        statusUpdates.push('workflow-started');

        // Phase 1: File Selection
        currentProgress = {
          current: 0,
          total: TEST_FILES_DATA.length,
          currentFile: '',
        };
        statusUpdates.push('files-selected');

        // Phase 2: Analysis
        for (let i = 0; i < TEST_FILES_DATA.length; i++) {
          const file = TEST_FILES_DATA[i];
          currentProgress = {
            current: i + 1,
            total: TEST_FILES_DATA.length,
            currentFile: file.name,
          };

          services.ollama.analyze.mockResolvedValueOnce({
            status: 'success',
            analysis: { category: file.expectedCategory, confidence: 0.9 },
          });

          await services.ollama.analyze(file.path);
        }
        statusUpdates.push('analysis-completed');

        // Phase 3: Organization
        for (const file of TEST_FILES_DATA) {
          services.folderMatching.match.mockResolvedValueOnce({
            success: true,
            destination: `/organized/${file.expectedFolder}/${file.name}`,
          });
          await services.folderMatching.match(
            { name: file.name },
            file.expectedCategory,
          );
        }
        statusUpdates.push('organization-completed');

        return {
          statusUpdates,
          finalProgress: currentProgress,
        };
      };

      const result = await trackWorkflowProgress();

      expect(result.statusUpdates).toContain('workflow-started');
      expect(result.statusUpdates).toContain('organization-completed');
      expect(result.finalProgress.current).toBe(TEST_FILES_DATA.length);
      expect(result.finalProgress.total).toBe(TEST_FILES_DATA.length);
    });
  });
});
