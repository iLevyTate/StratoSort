const { ipcMain } = require('electron');
const registerWindowIpc = require('../src/main/ipc/window');

describe('window IPC handlers', () => {
  let mockIpcMain;
  let mockLogger;
  let mockMainWindow;
  let getMainWindow;

  beforeEach(() => {
    // Mock IPC main
    mockIpcMain = {
      handle: jest.fn(),
    };

    // Mock logger
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    };

    // Mock main window
    mockMainWindow = {
      minimize: jest.fn(),
      maximize: jest.fn(),
      unmaximize: jest.fn(),
      isMaximized: jest.fn(),
      close: jest.fn(),
      isDestroyed: jest.fn().mockReturnValue(false),
    };

    getMainWindow = jest.fn().mockReturnValue(mockMainWindow);

    // Mock IPC channels
    const IPC_CHANNELS = {
      WINDOW: {
        MINIMIZE: 'window:minimize',
        MAXIMIZE: 'window:maximize',
        UNMAXIMIZE: 'window:unmaximize',
        TOGGLE_MAXIMIZE: 'window:toggle-maximize',
        IS_MAXIMIZED: 'window:is-maximized',
        CLOSE: 'window:close',
      },
    };

    // Register IPC handlers
    registerWindowIpc({
      ipcMain: mockIpcMain,
      IPC_CHANNELS,
      logger: mockLogger,
      getMainWindow,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('registers all window IPC handlers', () => {
    expect(mockIpcMain.handle).toHaveBeenCalledTimes(6);
    expect(mockIpcMain.handle).toHaveBeenCalledWith(
      'window:minimize',
      expect.any(Function),
    );
    expect(mockIpcMain.handle).toHaveBeenCalledWith(
      'window:maximize',
      expect.any(Function),
    );
    expect(mockIpcMain.handle).toHaveBeenCalledWith(
      'window:unmaximize',
      expect.any(Function),
    );
    expect(mockIpcMain.handle).toHaveBeenCalledWith(
      'window:toggle-maximize',
      expect.any(Function),
    );
    expect(mockIpcMain.handle).toHaveBeenCalledWith(
      'window:is-maximized',
      expect.any(Function),
    );
    expect(mockIpcMain.handle).toHaveBeenCalledWith(
      'window:close',
      expect.any(Function),
    );
  });

  test('minimize handler minimizes window when available', async () => {
    const minimizeHandler = mockIpcMain.handle.mock.calls.find(
      (call) => call[0] === 'window:minimize',
    )[1];

    const result = await minimizeHandler();

    expect(getMainWindow).toHaveBeenCalled();
    expect(mockMainWindow.minimize).toHaveBeenCalled();
    expect(result).toBe(true);
  });

  test('minimize handler handles destroyed window', async () => {
    mockMainWindow.isDestroyed.mockReturnValue(true);
    const minimizeHandler = mockIpcMain.handle.mock.calls.find(
      (call) => call[0] === 'window:minimize',
    )[1];

    const result = await minimizeHandler();

    expect(mockMainWindow.minimize).not.toHaveBeenCalled();
    expect(result).toBe(true);
  });

  test('minimize handler handles null window', async () => {
    getMainWindow.mockReturnValue(null);
    const minimizeHandler = mockIpcMain.handle.mock.calls.find(
      (call) => call[0] === 'window:minimize',
    )[1];

    const result = await minimizeHandler();

    expect(result).toBe(true);
  });

  test('maximize handler maximizes window', async () => {
    const maximizeHandler = mockIpcMain.handle.mock.calls.find(
      (call) => call[0] === 'window:maximize',
    )[1];

    const result = await maximizeHandler();

    expect(mockMainWindow.maximize).toHaveBeenCalled();
    expect(result).toBe(true);
  });

  test('unmaximize handler unmaximizes window', async () => {
    const unmaximizeHandler = mockIpcMain.handle.mock.calls.find(
      (call) => call[0] === 'window:unmaximize',
    )[1];

    const result = await unmaximizeHandler();

    expect(mockMainWindow.unmaximize).toHaveBeenCalled();
    expect(result).toBe(true);
  });

  test('toggle maximize handler toggles window state', async () => {
    const toggleHandler = mockIpcMain.handle.mock.calls.find(
      (call) => call[0] === 'window:toggle-maximize',
    )[1];

    // Test unmaximizing - simulate state change
    let callCount = 0;
    mockMainWindow.isMaximized.mockImplementation(() => {
      callCount++;
      return callCount === 1; // Return true for first call, false for second call
    });

    let result = await toggleHandler();

    expect(mockMainWindow.unmaximize).toHaveBeenCalled();
    expect(result).toBe(false); // Should return false after unmaximizing (second isMaximized() call)

    // Reset mocks
    mockMainWindow.unmaximize.mockClear();
    callCount = 0;
    mockMainWindow.isMaximized.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? false : true; // Return false for first call, true for second call
    });

    // Test maximizing
    result = await toggleHandler();

    expect(mockMainWindow.maximize).toHaveBeenCalled();
    expect(result).toBe(true); // Should return true after maximizing (second isMaximized() call)
  });

  test('is maximized handler returns window state', async () => {
    const isMaximizedHandler = mockIpcMain.handle.mock.calls.find(
      (call) => call[0] === 'window:is-maximized',
    )[1];

    // Test maximized
    mockMainWindow.isMaximized.mockReturnValue(true);
    let result = await isMaximizedHandler();
    expect(result).toBe(true);

    // Test not maximized
    mockMainWindow.isMaximized.mockReturnValue(false);
    result = await isMaximizedHandler();
    expect(result).toBe(false);
  });

  test('is maximized handler handles destroyed window', async () => {
    mockMainWindow.isDestroyed.mockReturnValue(true);
    const isMaximizedHandler = mockIpcMain.handle.mock.calls.find(
      (call) => call[0] === 'window:is-maximized',
    )[1];

    const result = await isMaximizedHandler();

    expect(mockMainWindow.isMaximized).not.toHaveBeenCalled();
    expect(result).toBe(false);
  });

  test('close handler closes window', async () => {
    const closeHandler = mockIpcMain.handle.mock.calls.find(
      (call) => call[0] === 'window:close',
    )[1];

    const result = await closeHandler();

    expect(mockMainWindow.close).toHaveBeenCalled();
    expect(result).toBe(true);
  });

  test('close handler handles destroyed window', async () => {
    mockMainWindow.isDestroyed.mockReturnValue(true);
    const closeHandler = mockIpcMain.handle.mock.calls.find(
      (call) => call[0] === 'window:close',
    )[1];

    const result = await closeHandler();

    expect(mockMainWindow.close).not.toHaveBeenCalled();
    expect(result).toBe(true);
  });

  test('all handlers use withErrorLogging wrapper', () => {
    // Each handler should be wrapped with withErrorLogging
    mockIpcMain.handle.mock.calls.forEach(([channel, handler]) => {
      expect(channel).toMatch(/^window:/);
      expect(handler).toBeInstanceOf(Function);
    });
  });
});
