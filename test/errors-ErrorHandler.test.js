const fs = require('fs').promises;
const path = require('path');
const os = require('os');

// Mock electron BEFORE requiring ErrorHandler
jest.mock('electron', () => ({
  app: {
    getPath: jest.fn(() => '/mock/user/data'),
    on: jest.fn(),
    getVersion: jest.fn(() => '1.0.0'),
    getName: jest.fn(() => 'StratoSort'),
    relaunch: jest.fn(),
    quit: jest.fn(),
  },
  dialog: {
    showMessageBox: jest.fn(),
    showErrorBox: jest.fn(),
  },
  BrowserWindow: {
    getFocusedWindow: jest.fn(),
  },
}));

// Now require ErrorHandler after the mock is set up
const { app, dialog, BrowserWindow } = require('electron');
const errorHandler = require('../src/main/errors/ErrorHandler');

describe('ErrorHandler', () => {
  let tempDir;
  let loggerSpy;

  beforeEach(async () => {
    // Create temporary directory for tests
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'error-handler-test-'));

    // Reset mocks
    jest.clearAllMocks();

    // Set up specific mock behaviors for this test
    BrowserWindow.getFocusedWindow.mockReturnValue(null);
    dialog.showMessageBox.mockResolvedValue({ response: 0 });

    // Mock logger (shared constants)
    loggerSpy = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    };

    // Reset error handler state
    errorHandler.logPath = path.join(tempDir, 'logs');
    errorHandler.currentLogFile = null;
    errorHandler.errorQueue = [];
    errorHandler.isInitialized = false;
  });

  afterEach(async () => {
    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }

    jest.clearAllMocks();
  });

  describe('initialization', () => {
    test('initializes successfully', async () => {
      await errorHandler.initialize();

      expect(errorHandler.isInitialized).toBe(true);
      expect(errorHandler.logPath).toBe(path.join(tempDir, 'logs'));
      expect(errorHandler.currentLogFile).toMatch(/stratosort-.*\.log$/);

      // Check that logs directory was created
      const stats = await fs.stat(errorHandler.logPath);
      expect(stats.isDirectory()).toBe(true);
    });

    test('handles initialization failure gracefully', async () => {
      // Mock fs.mkdir to fail
      jest.spyOn(fs, 'mkdir').mockRejectedValue(new Error('Permission denied'));

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await errorHandler.initialize();

      expect(errorHandler.isInitialized).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to initialize ErrorHandler:',
        expect.any(Error),
      );

      consoleSpy.mockRestore();
      fs.mkdir.mockRestore();
    });

    test('sets up global error handlers', async () => {
      const processOnSpy = jest.spyOn(process, 'on');
      const appOnSpy = jest.spyOn(app, 'on');

      await errorHandler.initialize();

      expect(processOnSpy).toHaveBeenCalledWith(
        'uncaughtException',
        expect.any(Function),
      );
      expect(processOnSpy).toHaveBeenCalledWith(
        'unhandledRejection',
        expect.any(Function),
      );
      expect(appOnSpy).toHaveBeenCalledWith(
        'render-process-gone',
        expect.any(Function),
      );
      expect(appOnSpy).toHaveBeenCalledWith(
        'child-process-gone',
        expect.any(Function),
      );

      processOnSpy.mockRestore();
      appOnSpy.mockRestore();
    });
  });

  describe('error handling', () => {
    beforeEach(async () => {
      await errorHandler.initialize();
    });

    test('handles regular errors', async () => {
      const testError = new Error('Test error');
      const context = { userId: '123', action: 'file_upload' };

      const result = await errorHandler.handleError(testError, context);

      expect(result.type).toBeDefined();
      expect(result.message).toBe('Test error');
      expect(result.stack).toBe(testError.stack);
    });

    test('handles critical errors', async () => {
      const criticalError = new Error('Permission denied');
      criticalError.code = 'EACCES';

      const showMessageBoxSpy = jest.spyOn(dialog, 'showMessageBox');

      await errorHandler.handleError(criticalError);

      expect(showMessageBoxSpy).toHaveBeenCalledWith({
        type: 'error',
        title: 'Critical Error',
        message: 'Stratosort encountered a critical error',
        detail: expect.stringContaining('Permission denied'),
        buttons: ['Restart', 'Quit'],
        defaultId: 0,
      });
    });

    test('parses different error types correctly', () => {
      const testCases = [
        {
          error: new Error('File not found'),
          code: 'ENOENT',
          expectedType: 'FILE_NOT_FOUND',
          expectedMessage: 'File or directory not found',
        },
        {
          error: new Error('Permission denied'),
          code: 'EACCES',
          expectedType: 'PERMISSION_DENIED',
          expectedMessage: 'Permission denied',
        },
        {
          error: new Error('Network error'),
          code: 'ENOTFOUND',
          expectedType: 'NETWORK_ERROR',
          expectedMessage: 'Network connection error',
        },
        {
          error: new Error('AI service unavailable'),
          expectedType: 'AI_UNAVAILABLE',
          expectedMessage: 'AI service is unavailable',
        },
        {
          error: 'String error',
          expectedType: 'UNKNOWN',
          expectedMessage: 'An unexpected error occurred',
        },
      ];

      testCases.forEach(({ error, code, expectedType, expectedMessage }) => {
        if (code) error.code = code;
        const result = errorHandler.parseError(error);

        expect(result.type).toBe(expectedType);
        expect(result.message).toBe(expectedMessage);
      });
    });

    test('determines error severity correctly', () => {
      const testCases = [
        { type: 'PERMISSION_DENIED', expectedSeverity: 'critical' },
        { type: 'UNKNOWN', expectedSeverity: 'critical' },
        { type: 'FILE_NOT_FOUND', expectedSeverity: 'error' },
        { type: 'AI_UNAVAILABLE', expectedSeverity: 'error' },
        { type: 'INVALID_FORMAT', expectedSeverity: 'warning' },
        { type: 'FILE_TOO_LARGE', expectedSeverity: 'warning' },
        { type: 'SOME_OTHER_TYPE', expectedSeverity: 'info' },
      ];

      testCases.forEach(({ type, expectedSeverity }) => {
        const severity = errorHandler.determineSeverity(type);
        expect(severity).toBe(expectedSeverity);
      });
    });
  });

  describe('user notifications', () => {
    beforeEach(async () => {
      await errorHandler.initialize();
    });

    test('notifies user via focused window when available', async () => {
      const mockWindow = {
        isDestroyed: jest.fn().mockReturnValue(false),
        webContents: {
          send: jest.fn(),
        },
      };

      BrowserWindow.getFocusedWindow.mockReturnValue(mockWindow);

      await errorHandler.notifyUser('Test message', 'error');

      expect(mockWindow.webContents.send).toHaveBeenCalledWith('app:error', {
        message: 'Test message',
        type: 'error',
        timestamp: expect.stringMatching(
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
        ),
      });
    });

    test('falls back to dialog when no focused window', async () => {
      BrowserWindow.getFocusedWindow.mockReturnValue(null);
      const showMessageBoxSpy = jest.spyOn(dialog, 'showMessageBox');

      await errorHandler.notifyUser('Test message', 'warning');

      expect(showMessageBoxSpy).toHaveBeenCalledWith({
        type: 'warning',
        title: 'Warning',
        message: 'Test message',
        buttons: ['OK'],
      });
    });

    test('uses dialog when focused window is destroyed', async () => {
      const mockWindow = {
        isDestroyed: jest.fn().mockReturnValue(true),
        webContents: {
          send: jest.fn(),
        },
      };

      BrowserWindow.getFocusedWindow.mockReturnValue(mockWindow);
      const showMessageBoxSpy = jest.spyOn(dialog, 'showMessageBox');

      await errorHandler.notifyUser('Test message', 'error');

      expect(mockWindow.webContents.send).not.toHaveBeenCalled();
      expect(showMessageBoxSpy).toHaveBeenCalled();
    });
  });

  describe('logging', () => {
    test('logs to console when not initialized', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      errorHandler.isInitialized = false;
      await errorHandler.log('info', 'Test message', { test: 'data' });

      expect(consoleSpy).toHaveBeenCalledWith('[INFO] Test message', {
        test: 'data',
      });

      consoleSpy.mockRestore();
    });

    test('logs to file when initialized', async () => {
      await errorHandler.initialize();

      await errorHandler.log('error', 'Test error message', { userId: '123' });

      // Check that log file was created and contains the log entry
      const logContent = await fs.readFile(
        errorHandler.currentLogFile,
        'utf-8',
      );
      const logLines = logContent.trim().split('\n');
      const lastLogLine = logLines[logLines.length - 1];
      const logEntry = JSON.parse(lastLogLine);

      expect(logEntry.level).toBe('ERROR');
      expect(logEntry.message).toBe('Test error message');
      expect(logEntry.data.userId).toBe('123');
      expect(logEntry.timestamp).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
      );
    });

    test('handles log file write errors gracefully', async () => {
      await errorHandler.initialize();

      // Mock fs.appendFile to fail
      jest.spyOn(fs, 'appendFile').mockRejectedValue(new Error('Disk full'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await errorHandler.log('error', 'Test message');

      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to write to log file:',
        expect.any(Error),
      );

      consoleSpy.mockRestore();
      fs.appendFile.mockRestore();
    });
  });

  describe('error retrieval', () => {
    beforeEach(async () => {
      await errorHandler.initialize();

      // Add some test log entries
      await errorHandler.log('error', 'Error message 1', { severity: 'high' });
      await errorHandler.log('info', 'Info message', { severity: 'low' });
      await errorHandler.log('error', 'Error message 2', {
        severity: 'medium',
      });
      await errorHandler.log('critical', 'Critical message', {
        severity: 'high',
      });
    });

    test('retrieves recent errors', async () => {
      const errors = await errorHandler.getRecentErrors(10);

      expect(errors.length).toBe(3); // Only ERROR and CRITICAL level entries
      expect(errors[0].message).toBe('Error message 1');
      expect(errors[1].message).toBe('Error message 2');
      expect(errors[2].message).toBe('Critical message');
    });

    test('limits number of retrieved errors', async () => {
      const errors = await errorHandler.getRecentErrors(2);

      expect(errors.length).toBe(2);
      expect(errors[0].message).toBe('Error message 2');
      expect(errors[1].message).toBe('Critical message');
    });

    test('handles log file read errors', async () => {
      // Mock fs.readFile to fail
      jest.spyOn(fs, 'readFile').mockRejectedValue(new Error('File not found'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const errors = await errorHandler.getRecentErrors();

      expect(errors).toEqual([]);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to read error log:',
        expect.any(Error),
      );

      consoleSpy.mockRestore();
      fs.readFile.mockRestore();
    });

    test('handles malformed log entries', async () => {
      // Add a malformed log entry
      await fs.appendFile(errorHandler.currentLogFile, 'invalid json\n');

      const errors = await errorHandler.getRecentErrors();

      // Should still parse valid entries and ignore invalid ones
      expect(errors.length).toBe(3);
    });
  });

  describe('log cleanup', () => {
    test('cleans up old log files', async () => {
      await errorHandler.initialize();

      // Create some test log files
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 10); // 10 days ago

      const oldLogFile = path.join(errorHandler.logPath, 'stratosort-old.log');
      const newLogFile = path.join(errorHandler.logPath, 'stratosort-new.log');

      await fs.writeFile(oldLogFile, 'old log content');
      await fs.writeFile(newLogFile, 'new log content');

      // Set old file modification time
      await fs.utimes(oldLogFile, oldDate, oldDate);

      await errorHandler.cleanupLogs(7); // Keep 7 days

      // Old file should be deleted
      const oldFileExists = await fs
        .access(oldLogFile)
        .then(() => true)
        .catch(() => false);
      expect(oldFileExists).toBe(false);

      // New file should still exist
      const newFileExists = await fs
        .access(newLogFile)
        .then(() => true)
        .catch(() => false);
      expect(newFileExists).toBe(true);
    });

    test('handles cleanup errors gracefully', async () => {
      await errorHandler.initialize();

      // Mock fs.readdir to fail
      jest
        .spyOn(fs, 'readdir')
        .mockRejectedValue(new Error('Permission denied'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await errorHandler.cleanupLogs();

      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to cleanup logs:',
        expect.any(Error),
      );

      consoleSpy.mockRestore();
      fs.readdir.mockRestore();
    });
  });

  describe('critical error handling', () => {
    beforeEach(async () => {
      await errorHandler.initialize();
    });

    test('handles critical errors with restart dialog', async () => {
      const appSpy = {
        relaunch: jest.fn(),
        quit: jest.fn(),
      };

      jest.spyOn(app, 'relaunch').mockImplementation(appSpy.relaunch);
      jest.spyOn(app, 'quit').mockImplementation(appSpy.quit);

      await errorHandler.handleCriticalError(
        'Critical error message',
        new Error('Test error'),
      );

      expect(dialog.showMessageBox).toHaveBeenCalled();
      expect(appSpy.relaunch).toHaveBeenCalled();
      expect(appSpy.quit).toHaveBeenCalled();
    });

    test('handles critical errors with quit dialog', async () => {
      dialog.showMessageBox.mockResolvedValue({ response: 1 }); // User chooses "Quit"

      const appSpy = {
        relaunch: jest.fn(),
        quit: jest.fn(),
      };

      jest.spyOn(app, 'relaunch').mockImplementation(appSpy.relaunch);
      jest.spyOn(app, 'quit').mockImplementation(appSpy.quit);

      await errorHandler.handleCriticalError(
        'Critical error message',
        new Error('Test error'),
      );

      expect(appSpy.relaunch).not.toHaveBeenCalled();
      expect(appSpy.quit).toHaveBeenCalled();
    });
  });
});
