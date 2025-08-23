// Mock electron modules at the top level
jest.mock('electron', () => ({
  BrowserWindow: jest.fn(() => ({
    loadURL: jest.fn().mockResolvedValue(),
    loadFile: jest.fn().mockResolvedValue(),
    show: jest.fn(),
    focus: jest.fn(),
    isVisible: jest.fn().mockReturnValue(true),
    isFocused: jest.fn().mockReturnValue(true),
    isMinimized: jest.fn().mockReturnValue(false),
    on: jest.fn(),
    once: jest.fn(),
    webContents: {
      openDevTools: jest.fn(),
      on: jest.fn(),
      setWindowOpenHandler: jest.fn(),
      session: {
        webRequest: {
          onHeadersReceived: jest.fn(),
        },
        setPermissionRequestHandler: jest.fn(),
      },
    },
  })),
  app: {
    setAppUserModelId: jest.fn(),
    getPath: jest.fn().mockReturnValue('/mock/path'),
  },
  shell: {
    openExternal: jest.fn(),
  },
  screen: {
    getPrimaryDisplay: jest.fn(() => ({
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      workArea: { x: 0, y: 0, width: 1920, height: 1040 },
      scaleFactor: 1,
    })),
    getAllDisplays: jest.fn(() => [
      {
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        workArea: { x: 0, y: 0, width: 1920, height: 1040 },
        scaleFactor: 1,
      },
    ]),
  },
}));

// Mock electron-window-state
jest.mock('electron-window-state', () =>
  jest.fn(() => ({
    manage: jest.fn(),
    x: 100,
    y: 100,
    width: 1200,
    height: 800,
  })),
);

const { BrowserWindow, app, shell } = require('electron');
const path = require('path');
const createMainWindow = require('../src/main/core/createWindow');

// Mock logger at top level
jest.mock('../src/shared/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

// Mock ollamaUtils at top level
jest.mock('../src/main/ollamaUtils', () => ({
  getOllamaHost: jest.fn().mockReturnValue('http://localhost:11434'),
}));

describe('createWindow', () => {
  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Set up environment
    process.env.NODE_ENV = 'development';
    process.env.USE_DEV_SERVER = 'false';
    process.env.OLLAMA_HOST = 'http://127.0.0.1:11434';
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.USE_DEV_SERVER;
    delete process.env.FORCE_DEV_TOOLS;
  });

  test('creates a BrowserWindow with correct configuration', () => {
    const windowStateKeeper = require('electron-window-state');
    const path = require('path');

    const result = createMainWindow();

    expect(windowStateKeeper).toHaveBeenCalledWith({
      defaultWidth: 1200,
      defaultHeight: 800,
    });

    expect(BrowserWindow).toHaveBeenCalledWith({
      x: 100,
      y: 100,
      width: 1200,
      height: 800,
      minWidth: 800,
      minHeight: 600,
      frame: true,
      backgroundColor: '#0f0f10',
      darkTheme: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,
        enableRemoteModule: false,
        preload: expect.stringContaining('preload.js'),
        webSecurity: true,
        allowRunningInsecureContent: false,
        experimentalFeatures: false,
        backgroundThrottling: false,
        devTools: true,
        hardwareAcceleration: true,
        enableWebGL: true,
        safeDialogs: true,
      },
      icon: expect.stringContaining('stratosort-logo.png'),
      show: false,
      titleBarStyle: 'default',
      autoHideMenuBar: false,
    });

    expect(result).toBeDefined();
  });

  test('sets AppUserModelId for Windows integration', () => {
    const { app } = require('electron');

    const result = createMainWindow();

    expect(app.setAppUserModelId).toHaveBeenCalledWith('com.stratosort.app');
    expect(result).toBeDefined();
  });

  test('handles AppUserModelId setting failure gracefully', () => {
    const { app } = require('electron');
    app.setAppUserModelId.mockImplementation(() => {
      throw new Error('Failed to set AppUserModelId');
    });

    expect(() => createMainWindow()).not.toThrow();
  });

  test('loads from development server when USE_DEV_SERVER is true', () => {
    process.env.USE_DEV_SERVER = 'true';

    const result = createMainWindow();

    expect(BrowserWindow).toHaveBeenCalled();
    const mockWin =
      BrowserWindow.mock.results[BrowserWindow.mock.results.length - 1].value;
    expect(mockWin.loadURL).toHaveBeenCalledWith('http://localhost:3000');
    expect(result).toBeDefined();
  });

  test('falls back to built files when dev server fails', async () => {
    process.env.USE_DEV_SERVER = 'true';

    // Set up the mock to reject before creating the window
    const mockWin = {
      loadURL: jest.fn().mockRejectedValue(new Error('Server not available')),
      loadFile: jest.fn().mockResolvedValue(),
      show: jest.fn(),
      focus: jest.fn(),
      isVisible: jest.fn().mockReturnValue(true),
      isFocused: jest.fn().mockReturnValue(true),
      isMinimized: jest.fn().mockReturnValue(false),
      on: jest.fn(),
      once: jest.fn(),
      webContents: {
        openDevTools: jest.fn(),
        on: jest.fn(),
        setWindowOpenHandler: jest.fn(),
        session: {
          webRequest: {
            onHeadersReceived: jest.fn(),
          },
          setPermissionRequestHandler: jest.fn(),
        },
      },
    };

    BrowserWindow.mockReturnValue(mockWin);

    const result = createMainWindow();

    expect(BrowserWindow).toHaveBeenCalled();

    // Should call loadURL first
    expect(mockWin.loadURL).toHaveBeenCalledWith('http://localhost:3000');

    // Wait for the promise chain to resolve
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Check that loadFile was called with a path containing 'dist/index.html'
    expect(mockWin.loadFile).toHaveBeenCalled();
    const loadFileCalls = mockWin.loadFile.mock.calls;
    if (loadFileCalls.length > 0) {
      const lastCall = loadFileCalls[loadFileCalls.length - 1][0];
      expect(lastCall.replace(/\\/g, '/')).toContain('dist/index.html');
    }
    expect(result).toBeDefined();
  });

  test('opens DevTools when FORCE_DEV_TOOLS is true', async () => {
    process.env.USE_DEV_SERVER = 'true';
    process.env.FORCE_DEV_TOOLS = 'true';

    const result = createMainWindow();

    expect(BrowserWindow).toHaveBeenCalled();
    const mockWin =
      BrowserWindow.mock.results[BrowserWindow.mock.results.length - 1].value;

    // Wait for the promise chain to resolve
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockWin.webContents.openDevTools).toHaveBeenCalled();
    expect(result).toBeDefined();
  });

  test('loads from built files in production mode', () => {
    process.env.NODE_ENV = 'production';

    const result = createMainWindow();

    expect(BrowserWindow).toHaveBeenCalled();
    const mockWin =
      BrowserWindow.mock.results[BrowserWindow.mock.results.length - 1].value;

    // Check that loadFile was called with a path containing 'dist/index.html'
    const loadFileCalls = mockWin.loadFile.mock.calls;
    expect(loadFileCalls.length).toBeGreaterThan(0);

    const lastCall = loadFileCalls[loadFileCalls.length - 1][0];
    expect(lastCall.replace(/\\/g, '/')).toContain('dist/index.html');

    expect(result).toBeDefined();
  });

  test('sets up Content Security Policy headers', () => {
    const result = createMainWindow();

    expect(BrowserWindow).toHaveBeenCalled();
    const mockWin =
      BrowserWindow.mock.results[BrowserWindow.mock.results.length - 1].value;

    const cspCallback = jest.fn();
    mockWin.webContents.session.webRequest.onHeadersReceived.mockImplementation(
      cspCallback,
    );

    expect(
      mockWin.webContents.session.webRequest.onHeadersReceived,
    ).toHaveBeenCalled();

    // Simulate headers received event
    const headersCallback =
      mockWin.webContents.session.webRequest.onHeadersReceived.mock.calls[0][0];
    const mockDetails = {
      responseHeaders: {},
    };

    // Create a mock callback function
    const mockCallback = jest.fn();

    headersCallback(mockDetails, mockCallback);

    // Check that the callback was called with modified headers
    expect(mockCallback).toHaveBeenCalledWith({
      responseHeaders: expect.objectContaining({
        'Content-Security-Policy': [
          expect.stringContaining("default-src 'self'"),
        ],
        'X-Content-Type-Options': ['nosniff'],
        'Referrer-Policy': ['no-referrer'],
        'Cross-Origin-Opener-Policy': ['same-origin'],
        'Cross-Origin-Resource-Policy': ['same-origin'],
        'Permissions-Policy': [expect.stringContaining('accelerometer=()')],
      }),
    });
    expect(result).toBeDefined();
  });

  test('shows window when ready-to-show event fires', () => {
    const result = createMainWindow();

    expect(BrowserWindow).toHaveBeenCalled();
    const mockWin =
      BrowserWindow.mock.results[BrowserWindow.mock.results.length - 1].value;

    expect(mockWin.once).toHaveBeenCalledWith(
      'ready-to-show',
      expect.any(Function),
    );

    // Simulate ready-to-show event
    const readyCallback = mockWin.once.mock.calls.find(
      (call) => call[0] === 'ready-to-show',
    )[1];
    readyCallback();

    expect(mockWin.show).toHaveBeenCalled();
    expect(mockWin.focus).toHaveBeenCalled();
    expect(result).toBeDefined();
  });

  test('prevents navigation within the app', () => {
    const result = createMainWindow();

    expect(BrowserWindow).toHaveBeenCalled();
    const mockWin =
      BrowserWindow.mock.results[BrowserWindow.mock.results.length - 1].value;

    expect(mockWin.webContents.on).toHaveBeenCalledWith(
      'will-navigate',
      expect.any(Function),
    );

    // Simulate navigation event
    const navigateCallback = mockWin.webContents.on.mock.calls.find(
      (call) => call[0] === 'will-navigate',
    )[1];
    const mockEvent = {
      preventDefault: jest.fn(),
    };

    navigateCallback(mockEvent, 'http://example.com');

    expect(mockEvent.preventDefault).toHaveBeenCalled();
    expect(result).toBeDefined();
  });

  test('prevents webview attachment', () => {
    const result = createMainWindow();

    expect(BrowserWindow).toHaveBeenCalled();
    const mockWin =
      BrowserWindow.mock.results[BrowserWindow.mock.results.length - 1].value;

    expect(mockWin.webContents.on).toHaveBeenCalledWith(
      'will-attach-webview',
      expect.any(Function),
    );

    // Simulate webview attachment event
    const webviewCallback = mockWin.webContents.on.mock.calls.find(
      (call) => call[0] === 'will-attach-webview',
    )[1];
    const mockEvent = {
      preventDefault: jest.fn(),
    };

    webviewCallback(mockEvent);

    expect(mockEvent.preventDefault).toHaveBeenCalled();
    expect(result).toBeDefined();
  });

  test('denies all permission requests by default', () => {
    const result = createMainWindow();

    expect(BrowserWindow).toHaveBeenCalled();
    const mockWin =
      BrowserWindow.mock.results[BrowserWindow.mock.results.length - 1].value;

    expect(
      mockWin.webContents.session.setPermissionRequestHandler,
    ).toHaveBeenCalledWith(expect.any(Function));

    // Simulate permission request
    const permissionCallback =
      mockWin.webContents.session.setPermissionRequestHandler.mock.calls[0][0];
    const mockCallback = jest.fn();

    permissionCallback(null, 'camera', mockCallback);

    expect(mockCallback).toHaveBeenCalledWith(false);
    expect(result).toBeDefined();
  });

  test('handles external links with allowed domains', () => {
    const { shell } = require('electron');

    const result = createMainWindow();

    expect(BrowserWindow).toHaveBeenCalled();
    const mockWin =
      BrowserWindow.mock.results[BrowserWindow.mock.results.length - 1].value;

    expect(mockWin.webContents.setWindowOpenHandler).toHaveBeenCalledWith(
      expect.any(Function),
    );

    // Simulate window open request
    const windowOpenCallback =
      mockWin.webContents.setWindowOpenHandler.mock.calls[0][0];

    const result2 = windowOpenCallback({ url: 'https://github.com/user/repo' });
    expect(result2.action).toBe('deny');
    expect(shell.openExternal).toHaveBeenCalledWith(
      'https://github.com/user/repo',
    );
    expect(result).toBeDefined();
  });

  test('blocks external links from disallowed domains', () => {
    const { shell } = require('electron');

    const result = createMainWindow();

    expect(BrowserWindow).toHaveBeenCalled();
    const mockWin =
      BrowserWindow.mock.results[BrowserWindow.mock.results.length - 1].value;

    const windowOpenCallback =
      mockWin.webContents.setWindowOpenHandler.mock.calls[0][0];

    const result2 = windowOpenCallback({ url: 'https://malicious-site.com' });
    expect(result2.action).toBe('deny');
    expect(shell.openExternal).not.toHaveBeenCalledWith(
      'https://malicious-site.com',
    );
    expect(result).toBeDefined();
  });

  test('handles Ollama host configuration errors gracefully', () => {
    const { getOllamaHost } = require('../src/main/ollamaUtils');
    getOllamaHost.mockImplementation(() => {
      throw new Error('Configuration error');
    });

    expect(() => createMainWindow()).not.toThrow();
  });

  test('returns the created window instance', () => {
    const result = createMainWindow();

    expect(BrowserWindow).toHaveBeenCalled();
    const mockWin =
      BrowserWindow.mock.results[BrowserWindow.mock.results.length - 1].value;
    expect(result).toBe(mockWin);
  });
});
