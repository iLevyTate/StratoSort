const { BrowserWindow, shell } = require('electron');
const path = require('path');
const { logger } = require('../../shared/logger');

const isDev = process.env.NODE_ENV === 'development';

function createMainWindow() {
  logger.debug('[DEBUG] Creating new window...');

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      enableRemoteModule: false,
      preload: path.join(__dirname, '../../preload/preload.js'),
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      backgroundThrottling: false,
      devTools: isDev,
      hardwareAcceleration: true,
      enableWebGL: true
    },
    icon: path.join(__dirname, '../../../assets/stratosort-logo.png'),
    show: false,
    titleBarStyle: 'default',
    autoHideMenuBar: !isDev
  });

  logger.debug('[DEBUG] BrowserWindow created');

  if (isDev) {
    win.loadURL('http://localhost:3000').catch((error) => {
      logger.info('Development server not available:', error.message);
      logger.info('Loading from built files instead...');
      const distPath = path.join(__dirname, '../../../dist/index.html');
      win.loadFile(distPath).catch((fileError) => {
        logger.error('Failed to load from built files, trying original:', fileError);
        win.loadFile(path.join(__dirname, '../../renderer/index.html'));
      });
    });
    if (process.env.FORCE_DEV_TOOLS === 'true') {
      win.webContents.openDevTools();
    }
  } else {
    const distPath = path.join(__dirname, '../../../dist/index.html');
    win.loadFile(distPath).catch((error) => {
      logger.error('Failed to load from dist, falling back:', error);
      win.loadFile(path.join(__dirname, '../../renderer/index.html'));
    });
  }

  win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' http://127.0.0.1:11434 http://localhost:11434 ws://localhost:*; object-src 'none'; base-uri 'self'; form-action 'self';"
        ]
      }
    });
  });

  win.once('ready-to-show', () => {
    win.show();
    win.focus();
    logger.info('✅ StratoSort window ready and focused');
    logger.debug('[DEBUG] Window state:', {
      isVisible: win.isVisible(),
      isFocused: win.isFocused(),
      isMinimized: win.isMinimized()
    });
  });

  win.on('closed', () => {
    // noop; main process holds the reference
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    const allowedDomains = [
      'https://github.com',
      'https://docs.github.com',
      'https://microsoft.com',
      'https://docs.microsoft.com',
      'https://ollama.ai'
    ];
    if (allowedDomains.some(domain => url.startsWith(domain))) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  return win;
}

module.exports = createMainWindow;


