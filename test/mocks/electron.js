module.exports = {
  contextBridge: {
    exposeInMainWorld: jest.fn(),
  },
  ipcRenderer: {
    invoke: jest.fn(),
    on: jest.fn(),
    send: jest.fn(),
    removeListener: jest.fn(),
  },
  ipcMain: {
    _handlers: new Map(),
    handle: jest.fn(function (channel, handler) {
      module.exports.ipcMain._handlers.set(channel, handler);
    }),
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
    getPath: jest.fn(() => '/test/path'),
    setAppUserModelId: jest.fn(),
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
