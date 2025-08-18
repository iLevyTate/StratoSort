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
  const isMac = process.platform === 'darwin';

  const win = new BrowserWindow({
    x: mainWindowState.x,
    y: mainWindowState.y,
    width: mainWindowState.width,
    height: mainWindowState.height,
    minWidth: 800,
    minHeight: 600,
    // Use native frame with dark theme
    frame: true,
    backgroundColor: '#0f0f10', // Dark background while loading
    darkTheme: true, // Force dark theme on Windows
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
      safeDialogs: true,
    },
    icon: path.join(__dirname, '../../../assets/stratosort-logo.png'),
    show: false,
    titleBarStyle: 'default',
    autoHideMenuBar: false, // Keep menu bar visible
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

    // Material-UI requires 'unsafe-inline' for styles to work
    // In a more secure setup, we'd use nonces or hashes, but for now we need inline styles
    const styleSrc = "'self' 'unsafe-inline'";
    const csp = `default-src 'self'; script-src 'self'; style-src ${styleSrc}; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' ${ollamaHost} ${wsHost}; object-src 'none'; base-uri 'self'; form-action 'self';`;

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
        'X-Content-Type-Options': ['nosniff'],
        'Referrer-Policy': ['no-referrer'],
        // COOP/COEP can break some integrations; set COOP only
        'Cross-Origin-Opener-Policy': ['same-origin'],
        'Cross-Origin-Resource-Policy': ['same-origin'],
        // Disable sensitive features by default
        'Permissions-Policy': [
          [
            'accelerometer=(), ambient-light-sensor=(), autoplay=(), battery=(), camera=(), clipboard-read=(), clipboard-write=(), display-capture=(), encrypted-media=(), fullscreen=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), midi=(), payment=(), picture-in-picture=(), publickey-credentials-get=(), screen-wake-lock=(), usb=(), xr-spatial-tracking=()',
          ].join(''),
        ],
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

  // Block navigation attempts within the app (e.g., dropped links or external redirects)
  win.webContents.on('will-navigate', (event, url) => {
    try {
      // Always prevent in-app navigations; open externally only if explicitly allowed elsewhere
      event.preventDefault();
    } catch {}
  });

  // Disallow embedding arbitrary webviews
  win.webContents.on('will-attach-webview', (event, webPreferences, params) => {
    event.preventDefault();
  });

  // Deny all permission requests by default (camera, mic, etc.)
  try {
    win.webContents.session.setPermissionRequestHandler(
      (_wc, _permission, callback) => {
        callback(false);
      },
    );
  } catch {}

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
