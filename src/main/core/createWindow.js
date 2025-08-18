const { BrowserWindow, shell, app } = require('electron');
const path = require('path');
const { logger } = require('../../shared/logger');
const windowStateKeeper = require('electron-window-state');

const isDev = process.env.NODE_ENV === 'development';

function createMainWindow() {
  logger.debug('[DEBUG] Creating new window...');

  // Ensure AppUserModelID for Windows integration (notifications, jump list)
  try {
    app.setAppUserModelId('com.stratosort.app');
  } catch (error) {
    logger.debug('[WINDOW] Failed to set AppUserModelId:', error.message);
  }

  // Restore previous window position/size
  const mainWindowState = windowStateKeeper({
    defaultWidth: 1200,
    defaultHeight: 800,
  });

  const isWindows = process.platform === 'win32';
  const win = new BrowserWindow({
    x: mainWindowState.x,
    y: mainWindowState.y,
    width: mainWindowState.width,
    height: mainWindowState.height,
    // Use native title bar/caption buttons on all platforms for now
    frame: true,
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
      enableWebGL: true,
    },
    icon: path.join(__dirname, '../../../assets/stratosort-logo.png'),
    show: false,
    // For custom controls on Windows, use frameless window and do NOT enable titleBarOverlay
    titleBarStyle: 'default',
    autoHideMenuBar: !isDev,
  });

  logger.debug('[DEBUG] BrowserWindow created');

  // Manage window state
  mainWindowState.manage(win);

  const useDevServer = isDev && process.env.USE_DEV_SERVER === 'true';
  if (useDevServer) {
    win.loadURL('http://localhost:3000').catch((error) => {
      logger.info('Development server not available:', error.message);
      logger.info('Loading from built files instead...');
      const distPath = path.join(__dirname, '../../../dist/index.html');
      win.loadFile(distPath).catch((fileError) => {
        logger.error(
          'Failed to load from built files, trying original:',
          fileError,
        );
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
    let ollamaHost = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
    try {
      const { getOllamaHost } = require('../ollamaUtils');
      const configured =
        typeof getOllamaHost === 'function' ? getOllamaHost() : null;
      if (configured && typeof configured === 'string') {
        ollamaHost = configured;
      }
    } catch (error) {
      logger.debug('[WINDOW] Failed to get Ollama host:', error.message);
    }
    let wsHost = '';
    try {
      const url = new URL(ollamaHost);
      wsHost =
        url.protocol === 'https:' ? `wss://${url.host}` : `ws://${url.host}`;
    } catch (error) {
      logger.debug('[WINDOW] Failed to parse Ollama host URL:', error.message);
      wsHost = '';
    }

    const isProduction = process.env.NODE_ENV === 'production';
    const styleSrc = isProduction ? "'self'" : "'self' 'unsafe-inline'";
    const csp = `default-src 'self'; script-src 'self'; style-src ${styleSrc}; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' ${ollamaHost} ${wsHost}; object-src 'none'; base-uri 'self'; form-action 'self';`;

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    });
  });

  win.once('ready-to-show', () => {
    win.show();
    win.focus();
    logger.info('✅ StratoSort window ready and focused');
    logger.debug('[DEBUG] Window state:', {
      isVisible: win.isVisible(),
      isFocused: win.isFocused(),
      isMinimized: win.isMinimized(),
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
      'https://ollama.ai',
    ];
    if (allowedDomains.some((domain) => url.startsWith(domain))) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  return win;
}

module.exports = createMainWindow;
