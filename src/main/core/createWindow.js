const { BrowserWindow, shell, app, dialog, ipcMain } = require('electron');
const path = require('path');
const { logger } = require('../../shared/logger');
const windowStateKeeper = require('electron-window-state');
const fs = require('fs');
const { spawn } = require('child_process');
const { IPC_CHANNELS } = require('../../shared/constants');

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

  // Platform flags can be reintroduced when needed

  const win = new BrowserWindow({
    x: mainWindowState.x,
    y: mainWindowState.y,
    width: mainWindowState.width,
    height: mainWindowState.height,
    minWidth: 800,
    minHeight: 600,
    // Use native frame with dark theme
    frame: true,
    backgroundColor: '#ffffff', // Clean white background while loading
    darkTheme: false, // Use system theme
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
      safeDialogs: true,
    },
    icon: path.join(__dirname, '../../../assets/stratosort-logo.png'),
    show: false,
    titleBarStyle: 'default',
    autoHideMenuBar: false, // Keep menu bar visible
  });

  logger.debug('[DEBUG] BrowserWindow created');

  // One-time registration for themed dialog response handler
  try {
    if (!global.__STRATOSORT_UI_DIALOG_HANDLER__) {
      const pendingDialogs = new Map();
      global.__STRATOSORT_UI_DIALOG_PENDING__ = pendingDialogs;
      ipcMain.handle(IPC_CHANNELS.UI.DIALOG_RESPONSE, (_event, payload) => {
        try {
          const { token, index } = payload || {};
          const resolver = pendingDialogs.get(token);
          if (typeof resolver === 'function') {
            resolver(typeof index === 'number' ? index : 0);
            pendingDialogs.delete(token);
          }
        } catch {}
        return { ok: true };
      });
      global.__STRATOSORT_UI_DIALOG_HANDLER__ = true;

      // Helper to show themed dialog and await response
      global.__STRATOSORT_SHOW_UI_DIALOG__ = (browserWindow, data) =>
        new Promise((resolve) => {
          try {
            const token = `${Date.now()}-${Math.random()
              .toString(36)
              .slice(2)}`;
            global.__STRATOSORT_UI_DIALOG_PENDING__.set(token, resolve);
            browserWindow.webContents.send('ui-dialog', {
              token,
              title: data?.title || 'Confirm',
              message: data?.message || '',
              buttons:
                Array.isArray(data?.buttons) && data.buttons.length > 0
                  ? data.buttons
                  : ['OK'],
              variant: data?.variant || 'info',
            });
            // Fallback timeout (auto-select last button after 60s)
            setTimeout(() => {
              if (global.__STRATOSORT_UI_DIALOG_PENDING__.has(token)) {
                try {
                  global.__STRATOSORT_UI_DIALOG_PENDING__.delete(token);
                } catch {}
                resolve(Math.max(0, (data?.buttons?.length || 1) - 1));
              }
            }, 60000).unref?.();
          } catch {
            resolve(0);
          }
        });
    }
  } catch {}

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

  // Development diagnostics: open DevTools and log load lifecycle
  if (isDev) {
    try {
      win.webContents.openDevTools({ mode: 'detach' });
    } catch {}
  }

  win.webContents.on('did-finish-load', () => {
    try {
      logger.info('[WINDOW] did-finish-load fired');
    } catch {}
  });

  win.webContents.on(
    'did-fail-load',
    (_e, errorCode, errorDescription, validatedURL, isMainFrame) => {
      try {
        logger.error('[WINDOW] did-fail-load', {
          errorCode,
          errorDescription,
          validatedURL,
          isMainFrame,
        });
      } catch {}
    },
  );

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
        // Remove unrecognized features (e.g., ambient-light-sensor, battery) to avoid console errors
        'Permissions-Policy': [
          [
            'accelerometer=(), autoplay=(), camera=(), clipboard-read=(), clipboard-write=(), display-capture=(), encrypted-media=(), fullscreen=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), midi=(), payment=(), picture-in-picture=(), publickey-credentials-get=(), screen-wake-lock=(), usb=(), xr-spatial-tracking=()',
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

    // Minimal first-run helper for Ollama + models
    setTimeout(async () => {
      try {
        const setupScript = path.join(__dirname, '../../../setup-ollama.js');
        if (!fs.existsSync(setupScript)) return;

        // eslint-disable-next-line global-require, import/no-dynamic-require
        const {
          isOllamaInstalled,
          getInstalledModels,
          startOllamaServer,
        } = require(setupScript);

        const recommended = [
          { name: 'llama3.2:latest', category: 'Text' },
          { name: 'llava:latest', category: 'Vision' },
          { name: 'nomic-embed-text:latest', category: 'Embedding' },
        ];

        const openOllamaDownload = () => {
          const downloadUrl =
            process.platform === 'win32'
              ? 'https://ollama.com/download/windows'
              : 'https://ollama.com/download';
          shell.openExternal(downloadUrl);
        };

        // If Ollama isn't installed, offer to install (and optionally models)
        if (!isOllamaInstalled()) {
          // Send themed dialog request to renderer and await response
          const responseIndex = await global.__STRATOSORT_SHOW_UI_DIALOG__(
            win,
            {
              title: 'Ollama not detected',
              message:
                'To enable AI features, install Ollama. You may continue without it, but features will be limited.',
              buttons: [
                'Install Ollama + models',
                'Install Ollama only',
                'Skip',
              ],
              variant: 'info',
            },
          );

          if (responseIndex === 0 || responseIndex === 1) {
            openOllamaDownload();
            if (responseIndex === 0) {
              // Secondary themed dialog with recommendations
              await global.__STRATOSORT_SHOW_UI_DIALOG__(win, {
                title: 'Next steps',
                message: `After installing Ollama, reopen StratoSort to download models\n\nRecommended:\n - ${recommended
                  .map((m) => `${m.name} (${m.category})`)
                  .join('\n - ')}`,
                buttons: ['OK'],
                variant: 'info',
              });
            }
          }
          return;
        }

        // If installed, check models and prompt to download missing
        let installed = [];
        try {
          installed = await getInstalledModels();
        } catch {}

        const missing = recommended.filter(({ name }) => {
          const base = name.split(':')[0].toLowerCase();
          return !installed.some((m) => m.toLowerCase().startsWith(base));
        });

        if (missing.length > 0) {
          const resIndex3 = await global.__STRATOSORT_SHOW_UI_DIALOG__(win, {
            title: 'Download recommended AI models?',
            message: `This will download:\n - ${missing
              .map((m) => `${m.name} (${m.category})`)
              .join('\n - ')}\nYou can change models anytime in Settings.`,
            buttons: ['Download models', 'Later'],
            variant: 'info',
          });
          if (resIndex3 === 0) {
            try {
              await startOllamaServer();
            } catch {}

            const pull = (modelName) =>
              new Promise((resolve) => {
                try {
                  logger.info(`[OLLAMA] Pulling model: ${modelName}`);
                  const cp = spawn('ollama', ['pull', modelName], {
                    shell: process.platform === 'win32',
                  });
                  // Forward coarse progress updates to renderer (optional)
                  const emitProgress = (chunk) => {
                    try {
                      const text = chunk?.toString?.() || '';
                      const match = text.match(/(\d{1,3})%/);
                      const percent = match ? Number(match[1]) : undefined;
                      if (!Number.isNaN(percent)) {
                        win.webContents.send('operation-progress', {
                          type: 'ollama-pull',
                          model: modelName,
                          progress: { percent },
                        });
                      }
                    } catch {}
                  };
                  cp.stdout?.on('data', emitProgress);
                  cp.stderr?.on('data', emitProgress);
                  cp.on('close', () => resolve());
                  cp.on('error', () => resolve());
                } catch {
                  resolve();
                }
              });

            // Notify renderer that downloads have started (banner + toast)
            try {
              win.webContents.send('operation-progress', {
                type: 'models-downloading',
                message: 'Downloading essential AI models in the background...',
              });
            } catch {}

            // Start all pulls concurrently and notify when done
            const promises = missing.map(({ name }) => pull(name));
            Promise.all(promises)
              .then(() => {
                try {
                  win.webContents.send('operation-progress', {
                    type: 'models-download-complete',
                  });
                } catch {}
              })
              .catch(() => {
                // Even on errors, we don't block UI; no-op here
              });

            // Themed UI notifications handled in renderer via ModelDownloadBanner and toasts
          }
        }
      } catch (e) {
        try {
          logger.debug('[WINDOW] First-run Ollama prompt skipped:', e?.message);
        } catch {}
      }
    }, 600);
  });

  win.on('closed', () => {
    // noop; main process holds the reference
  });

  // Block navigation attempts within the app (e.g., dropped links or external redirects)
  win.webContents.on('will-navigate', (event, _url) => {
    try {
      // Always prevent in-app navigations; open externally only if explicitly allowed elsewhere
      event.preventDefault();
    } catch {}
  });

  // Disallow embedding arbitrary webviews
  win.webContents.on(
    'will-attach-webview',
    (event, _webPreferences, _params) => {
      event.preventDefault();
    },
  );

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
      'https://ollama.com',
    ];
    if (allowedDomains.some((domain) => url.startsWith(domain))) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  return win;
}

module.exports = createMainWindow;
