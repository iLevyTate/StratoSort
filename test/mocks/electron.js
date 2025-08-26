module.exports = {
  contextBridge: {
    exposeInMainWorld: jest.fn(),
  },
  ipcRenderer: {
    invoke: jest.fn(),
    on: jest.fn(),
    send: jest.fn(),
    sendSync: jest.fn((channel) => {
      // Mock the IPC channels response for preload script
      if (channel === 'get-ipc-channels') {
        const { IPC_CHANNELS } = require('../../src/shared/constants');
        return IPC_CHANNELS;
      }
      return null;
    }),
    removeListener: jest.fn(),
  },
  ipcMain: {
    _handlers: new Map(),
    _eventHandlers: new Map(),
    handle: jest.fn(function (channel, handler) {
      module.exports.ipcMain._handlers.set(channel, handler);
    }),
    on: jest.fn(function (channel, handler) {
      if (!module.exports.ipcMain._eventHandlers.has(channel)) {
        module.exports.ipcMain._eventHandlers.set(channel, []);
      }
      module.exports.ipcMain._eventHandlers.get(channel).push(handler);
    }),
    removeHandler: jest.fn(),
  },
  dialog: {
    showOpenDialog: jest.fn(async () => ({ canceled: true, filePaths: [] })),
  },
  shell: {
    openPath: jest.fn(async () => {}),
    showItemInFolder: jest.fn(async () => {}),
    openExternal: jest.fn(async () => {}),
  },
  app: {
    getPath: jest.fn((name) => {
      if (name === 'downloads') {
        // Return the same path that the test expects
        const os = require('os');
        const path = require('path');
        return path.join(os.homedir(), 'Downloads');
      }
      return '/test/path';
    }),
    setAppUserModelId: jest.fn(),
    isReady: jest.fn(() => true),
    whenReady: jest.fn(() => Promise.resolve()),
    relaunch: jest.fn(),
    quit: jest.fn(),
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
};
