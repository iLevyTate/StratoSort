'use strict';

const path = require('path');

const mockWebContents = {
  send: jest.fn(),
  on: jest.fn(),
  once: jest.fn(),
  removeListener: jest.fn(),
  removeAllListeners: jest.fn(),
  executeJavaScript: jest.fn().mockResolvedValue(undefined),
  isDestroyed: jest.fn(() => false),
  loadURL: jest.fn(),
  reload: jest.fn(),
  goBack: jest.fn(),
  goForward: jest.fn(),
  canGoBack: jest.fn(() => false),
  canGoForward: jest.fn(() => false),
  getURL: jest.fn(() => 'http://localhost:3000'),
  getTitle: jest.fn(() => 'StratoSort'),
  setZoomFactor: jest.fn(),
  getZoomFactor: jest.fn(() => 1.0),
  setZoomLevel: jest.fn(),
  getZoomLevel: jest.fn(() => 0),
};

const mockBrowserWindow = jest.fn().mockImplementation(() => ({
  loadURL: jest.fn(),
  loadFile: jest.fn(),
  on: jest.fn(),
  once: jest.fn(),
  removeListener: jest.fn(),
  removeAllListeners: jest.fn(),
  destroy: jest.fn(),
  close: jest.fn(),
  show: jest.fn(),
  hide: jest.fn(),
  minimize: jest.fn(),
  maximize: jest.fn(),
  restore: jest.fn(),
  isMinimized: jest.fn(() => false),
  isMaximized: jest.fn(() => false),
  isDestroyed: jest.fn(() => false),
  focus: jest.fn(),
  blur: jest.fn(),
  setTitle: jest.fn(),
  getTitle: jest.fn(() => 'StratoSort'),
  setSize: jest.fn(),
  getSize: jest.fn(() => [1200, 800]),
  setPosition: jest.fn(),
  getPosition: jest.fn(() => [100, 100]),
  setMenuBarVisibility: jest.fn(),
  setAutoHideMenuBar: jest.fn(),
  webContents: mockWebContents,
}));

const mockIpcMain = {
  on: jest.fn(),
  once: jest.fn(),
  handle: jest.fn(),
  handleOnce: jest.fn(),
  removeHandler: jest.fn(),
  removeListener: jest.fn(),
  removeAllListeners: jest.fn(),
  eventNames: jest.fn(() => []),
  listeners: jest.fn(() => []),
};

const mockApp = {
  getPath: jest.fn((name) => {
    const mockPaths = {
      userData: '/mock/user/data',
      appData: '/mock/app/data',
      logs: '/mock/logs',
      temp: '/mock/temp',
      home: '/mock/home',
      desktop: '/mock/desktop',
      documents: '/mock/documents',
      downloads: '/mock/downloads',
      pictures: '/mock/pictures',
      videos: '/mock/videos',
      music: '/mock/music',
      cache: '/mock/cache',
    };
    return mockPaths[name] || `/mock/path/for/${name}`;
  }),
  getAppPath: jest.fn(() => '/mock/app/path'),
  getVersion: jest.fn(() => '1.0.0'),
  getName: jest.fn(() => 'StratoSort'),
  getLocale: jest.fn(() => 'en-US'),
  getSystemLocale: jest.fn(() => 'en-US'),
  isReady: jest.fn(() => true),
  whenReady: jest.fn(() => Promise.resolve()),
  quit: jest.fn(),
  exit: jest.fn(),
  relaunch: jest.fn(),
  isPackaged: jest.fn(() => false),
  on: jest.fn(),
  once: jest.fn(),
  removeListener: jest.fn(),
  removeAllListeners: jest.fn(),
  setAboutPanelOptions: jest.fn(),
  showAboutPanel: jest.fn(),
  hide: jest.fn(),
  show: jest.fn(),
  focus: jest.fn(),
  isHidden: jest.fn(() => false),
  setAppLogsPath: jest.fn(),
  getAppMetrics: jest.fn(() => []),
  getGPUFeatureStatus: jest.fn(() => ({
    webgl: 'enabled',
    vulkan: 'disabled',
  })),
  getLoginItemSettings: jest.fn(() => ({
    openAtLogin: false,
    openAsHidden: false,
  })),
  setLoginItemSettings: jest.fn(),
  isInApplicationsFolder: jest.fn(() => true),
};

const mockDialog = {
  showOpenDialog: jest
    .fn()
    .mockResolvedValue({ canceled: false, filePaths: ['/mock/selected/path'] }),
  showOpenDialogSync: jest.fn(() => ['/mock/selected/path']),
  showSaveDialog: jest.fn().mockResolvedValue({
    canceled: false,
    filePath: '/mock/save/location/file.txt',
  }),
  showSaveDialogSync: jest.fn(() => '/mock/save/location/file.txt'),
  showMessageBox: jest
    .fn()
    .mockResolvedValue({ response: 0, checkboxChecked: false }),
  showMessageBoxSync: jest.fn(() => 0),
  showErrorBox: jest.fn(),
  showCertificateTrustDialog: jest.fn(),
};

const mockMenu = {
  setApplicationMenu: jest.fn(),
  getApplicationMenu: jest.fn(() => null),
  buildFromTemplate: jest.fn((template) => ({
    items: template,
    popup: jest.fn(),
    closePopup: jest.fn(),
    append: jest.fn(),
    insert: jest.fn(),
    getMenuItemById: jest.fn(),
    on: jest.fn(),
    once: jest.fn(),
    removeListener: jest.fn(),
  })),
  getMenuItemById: jest.fn(),
};

const mockShell = {
  showItemInFolder: jest.fn(),
  openPath: jest.fn().mockResolvedValue(''),
  openExternal: jest.fn().mockResolvedValue(true),
  moveItemToTrash: jest.fn().mockResolvedValue(true),
  beep: jest.fn(),
  writeShortcutLink: jest.fn(),
  readShortcutLink: jest.fn(),
};

const mockGlobalShortcut = {
  register: jest.fn(),
  registerAll: jest.fn(),
  isRegistered: jest.fn(() => false),
  unregister: jest.fn(),
  unregisterAll: jest.fn(),
};

const mockScreen = {
  getPrimaryDisplay: jest.fn(() => ({
    id: 1,
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    workArea: { x: 0, y: 23, width: 1920, height: 1057 },
    scaleFactor: 1,
    rotation: 0,
    touchSupport: 'unknown',
  })),
  getAllDisplays: jest.fn(() => [
    {
      id: 1,
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      workArea: { x: 0, y: 23, width: 1920, height: 1057 },
      scaleFactor: 1,
      rotation: 0,
      touchSupport: 'unknown',
    },
  ]),
  getDisplayNearestPoint: jest.fn(),
  getDisplayMatching: jest.fn(),
  on: jest.fn(),
  once: jest.fn(),
  removeListener: jest.fn(),
};

const mockIpcRenderer = {
  send: jest.fn(),
  sendSync: jest.fn(),
  invoke: jest.fn().mockResolvedValue({}),
  on: jest.fn(),
  once: jest.fn(),
  removeListener: jest.fn(),
  removeAllListeners: jest.fn(),
  eventNames: jest.fn(() => []),
  listeners: jest.fn(() => []),
  listenerCount: jest.fn(() => 0),
};

module.exports = {
  app: mockApp,
  BrowserWindow: mockBrowserWindow,
  ipcMain: mockIpcMain,
  dialog: mockDialog,
  Menu: mockMenu,
  shell: mockShell,
  globalShortcut: mockGlobalShortcut,
  screen: mockScreen,
  webContents: {
    fromId: jest.fn().mockReturnValue(mockWebContents),
    getAllWebContents: jest.fn(() => [mockWebContents]),
    getFocusedWebContents: jest.fn(() => mockWebContents),
  },
  ipcRenderer: mockIpcRenderer,
  // Additional modules that might be imported
  contextBridge: {
    exposeInMainWorld: jest.fn(),
  },
  clipboard: {
    readText: jest.fn(() => ''),
    writeText: jest.fn(),
    readHTML: jest.fn(() => ''),
    writeHTML: jest.fn(),
    readImage: jest.fn(),
    writeImage: jest.fn(),
    readRTF: jest.fn(() => ''),
    writeRTF: jest.fn(),
    clear: jest.fn(),
    availableFormats: jest.fn(() => []),
  },
  nativeTheme: {
    shouldUseDarkColors: false,
    themeSource: 'system',
    on: jest.fn(),
    once: jest.fn(),
    removeListener: jest.fn(),
    removeAllListeners: jest.fn(),
  },
  powerMonitor: {
    on: jest.fn(),
    once: jest.fn(),
    removeListener: jest.fn(),
    removeAllListeners: jest.fn(),
    getSystemIdleState: jest.fn(() => 'active'),
    getSystemIdleTime: jest.fn(() => 0),
    isOnBatteryPower: jest.fn(() => false),
  },
};
