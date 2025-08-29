/**
 * Comprehensive Electron API Mock for Main Process Testing
 * Provides high-fidelity replacements for all Electron APIs used by StratoSort
 */

const path = require('path');

// Mock webContents
const mockWebContents = {
  send: jest.fn(),
  on: jest.fn(),
  once: jest.fn(),
  removeListener: jest.fn(),
  removeAllListeners: jest.fn(),
  openDevTools: jest.fn(),
  closeDevTools: jest.fn(),
  isDevToolsOpened: jest.fn(() => false),
  isDestroyed: jest.fn(() => false),
  getURL: jest.fn(() => 'http://localhost:3000'),
  loadURL: jest.fn(),
  reload: jest.fn(),
  executeJavaScript: jest.fn(),
  insertCSS: jest.fn(),
  setZoomFactor: jest.fn(),
  getZoomFactor: jest.fn(() => 1.0),
  setZoomLevel: jest.fn(),
  getZoomLevel: jest.fn(() => 0),
};

// Mock BrowserWindow
const mockBrowserWindow = jest.fn().mockImplementation((options = {}) => {
  return {
    id: Math.floor(Math.random() * 10000),
    options,
    loadFile: jest.fn(),
    loadURL: jest.fn(),
    reload: jest.fn(),
    show: jest.fn(),
    hide: jest.fn(),
    close: jest.fn(),
    destroy: jest.fn(),
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
    on: jest.fn(),
    once: jest.fn(),
    removeListener: jest.fn(),
    removeAllListeners: jest.fn(),
    webContents: mockWebContents,
  };
});

// Mock ipcMain
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

// Mock app
const mockApp = {
  getPath: jest.fn((name) => {
    const paths = {
      home: '/mock/home',
      appData: '/mock/appData',
      userData: '/mock/userData',
      temp: '/mock/temp',
      desktop: '/mock/desktop',
      documents: '/mock/documents',
      downloads: '/mock/downloads',
      pictures: '/mock/pictures',
      videos: '/mock/videos',
      music: '/mock/music',
      logs: '/mock/logs',
      cache: '/mock/cache',
    };
    return paths[name] || `/mock/path/for/${name}`;
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

// Mock dialog
const mockDialog = {
  showOpenDialog: jest.fn().mockResolvedValue({
    canceled: false,
    filePaths: ['/mock/selected/file.txt'],
  }),
  showOpenDialogSync: jest.fn(() => ['/mock/selected/file.txt']),
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

// Mock Menu
const mockMenu = {
  setApplicationMenu: jest.fn(),
  getApplicationMenu: jest.fn(() => null),
  sendActionToFirstResponder: jest.fn(),
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

// Mock shell
const mockShell = {
  showItemInFolder: jest.fn(),
  openPath: jest.fn().mockResolvedValue(''),
  openExternal: jest.fn().mockResolvedValue(true),
  moveItemToTrash: jest.fn().mockResolvedValue(true),
  beep: jest.fn(),
  writeShortcutLink: jest.fn(),
  readShortcutLink: jest.fn(),
};

// Mock globalShortcut
const mockGlobalShortcut = {
  register: jest.fn(),
  registerAll: jest.fn(),
  isRegistered: jest.fn(() => false),
  unregister: jest.fn(),
  unregisterAll: jest.fn(),
};

// Mock nativeTheme
const mockNativeTheme = {
  shouldUseDarkColors: false,
  themeSource: 'system',
  on: jest.fn(),
  once: jest.fn(),
  removeListener: jest.fn(),
  removeAllListeners: jest.fn(),
};

// Mock screen
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

// Mock powerMonitor
const mockPowerMonitor = {
  on: jest.fn(),
  once: jest.fn(),
  removeListener: jest.fn(),
  removeAllListeners: jest.fn(),
  getSystemIdleState: jest.fn(() => 'active'),
  getSystemIdleTime: jest.fn(() => 0),
  isOnBatteryPower: jest.fn(() => false),
};

// Export all mocks
module.exports = {
  app: mockApp,
  BrowserWindow: mockBrowserWindow,
  ipcMain: mockIpcMain,
  dialog: mockDialog,
  Menu: mockMenu,
  shell: mockShell,
  globalShortcut: mockGlobalShortcut,
  nativeTheme: mockNativeTheme,
  screen: mockScreen,
  powerMonitor: mockPowerMonitor,
  webContents: {
    fromId: jest.fn().mockReturnValue(mockWebContents),
    getAllWebContents: jest.fn(() => [mockWebContents]),
    getFocusedWebContents: jest.fn(() => mockWebContents),
  },
  // Additional Electron modules that might be used
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
  contextBridge: {
    exposeInMainWorld: jest.fn(),
  },
  ipcRenderer: {
    send: jest.fn(),
    sendSync: jest.fn(),
    invoke: jest.fn(),
    on: jest.fn(),
    once: jest.fn(),
    removeListener: jest.fn(),
    removeAllListeners: jest.fn(),
  },
};
