const { BrowserWindow, shell, app, dialog } = require('electron');
const path = require('path');
const { logger } = require('../../shared/logger');
const windowStateKeeper = require('electron-window-state');

const isDev = process.env.NODE_ENV === 'development';
const fsSync = require('fs');

// Fallback content loader with better error handling
async function loadFallbackContent(win, logger) {
  const fallbackPaths = [
    path.join(__dirname, '../../../dist/index.html'),
    path.join(__dirname, '../../renderer/index.html'),
    path.join(__dirname, '../../../src/renderer/index.html'),
  ];

  for (const fallbackPath of fallbackPaths) {
    try {
      await win.loadFile(fallbackPath);
      logger.info('Successfully loaded fallback content:', fallbackPath);
      return;
    } catch (error) {
      logger.debug(`Fallback path failed: ${fallbackPath}`, error.message);
    }
  }

  // Final fallback - show error page
  try {
    win.loadURL(
      'data:text/html;charset=utf-8,' +
        encodeURIComponent(`
      <!DOCTYPE html>
      <html>
      <head><title>StratoSort - Loading Error</title></head>
      <body style="background: #0f0f10; color: white; font-family: Arial, sans-serif; text-align: center; padding: 50px;">
        <h1>⚠️ StratoSort Loading Error</h1>
        <p>Unable to load the application. Please check if the build process completed successfully.</p>
        <p><small>Try running: <code>npm run build</code></small></p>
      </body>
      </html>
    `),
    );
    logger.error('All loading attempts failed, showing error page');
  } catch (finalError) {
    logger.error(
      'Critical error: Could not load any content',
      finalError.message,
    );
  }
}

function createMainWindow() {
  logger.debug('[DEBUG] Creating new window...');

  try {
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

    // Decide whether to enable legacy nodeIntegration - kept disabled for security
    let nodeIntegrationEnabled = false;
    try {
      // Only enable nodeIntegration for explicit debugging in development
      // This should NEVER be set in production builds
      const isExplicitDebugMode =
        process.env.ALLOW_NODE_REQUIRE === 'true' &&
        process.env.NODE_ENV === 'development';

      if (isExplicitDebugMode) {
        nodeIntegrationEnabled = true;
        logger.warn(
          '[WINDOW] ⚠️  ENABLING nodeIntegration for debugging - this reduces security!',
        );
        logger.warn(
          '[WINDOW] This should only be used during development and NEVER in production',
        );
      } else {
        // Secure default: keep nodeIntegration disabled and rely on preload API
        // The renderer should use window.electronAPI instead of require('electron')
        logger.debug(
          '[WINDOW] Using secure preload API (nodeIntegration=false)',
        );
      }
    } catch (e) {
      logger.debug('[WINDOW] NodeIntegration configuration failed:', e.message);
    }

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
        // CORE SECURITY SETTINGS - Never change these in production
        nodeIntegration: nodeIntegrationEnabled,
        nodeIntegrationInWorker: false, // Always false for security
        nodeIntegrationInSubFrames: false, // Always false for security
        contextIsolation: true, // Critical security boundary
        sandbox: true, // Enhanced security isolation
        enableRemoteModule: false, // Deprecated and insecure

        // Web security settings
        webSecurity: true,
        allowRunningInsecureContent: false,

        // Content Security Policy will be set via headers

        // Additional security measures
        experimentalFeatures: false,
        webviewTag: false, // Disable webview tag for security
        safeDialogs: true,
        disableDialogOptions: true, // Prevent dialog customization
        spellcheck: true,

        // Navigation and new window restrictions
        disableBlinkFeatures: 'Auxclick', // Disable middle-click features
        disableWebSecurity: false, // Explicitly enable web security

        // Preload script - secure gateway to IPC
        preload: path.join(__dirname, '../../preload/preload.js'),

        // Performance settings (secure)
        backgroundThrottling: false,
        devTools: isDev,
        hardwareAcceleration: true,
        enableWebGL: true,

        // Additional hardening
        enablePreferredSizeMode: false, // Prevent size manipulation
        nativeWindowOpen: false, // Use secure window.open handling
        safeDialogsMessage: 'This dialog was blocked for security reasons',

        // Removed invalid Electron flag: additionalArguments; rely on secure defaults instead
      },
      icon: path.join(__dirname, '../../../assets/stratosort-logo.png'),
      show: false,
      titleBarStyle: 'default',
      autoHideMenuBar: false, // Keep menu bar visible
    });

    logger.debug('[DEBUG] BrowserWindow created');

    // Security audit of webPreferences
    // Note: calling `win.webContents.getWebPreferences()` is not available
    // in some Electron versions / environments. Use the configured
    // `webPreferences` object we passed when creating the BrowserWindow
    // instead of querying `webContents` at runtime.
    const windowWebPreferences = {
      contextIsolation: true,
      nodeIntegration: nodeIntegrationEnabled,
      sandbox: true,
      webSecurity: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, '../../preload/preload.js'),
    };

    if (isDev) {
      const webPrefs = windowWebPreferences;
      const securityAudit = {
        contextIsolation: webPrefs.contextIsolation,
        nodeIntegration: webPrefs.nodeIntegration,
        sandbox: webPrefs.sandbox,
        webSecurity: webPrefs.webSecurity,
        enableRemoteModule: webPrefs.enableRemoteModule,
        preload: webPrefs.preload ? 'configured' : 'missing',
      };

      logger.debug('[SECURITY] WebPreferences audit:', securityAudit);

      // Warn about any insecure settings
      if (!webPrefs.contextIsolation) {
        logger.warn('[SECURITY] WARNING: contextIsolation is disabled!');
      }
      if (webPrefs.nodeIntegration) {
        logger.warn('[SECURITY] WARNING: nodeIntegration is enabled!');
      }
      if (!webPrefs.sandbox) {
        logger.warn('[SECURITY] WARNING: sandbox is disabled!');
      }
      if (!webPrefs.webSecurity) {
        logger.warn('[SECURITY] WARNING: webSecurity is disabled!');
      }
      if (webPrefs.enableRemoteModule) {
        logger.warn('[SECURITY] WARNING: enableRemoteModule is enabled!');
      }
    }

    // Manage window state
    mainWindowState.manage(win);

    const useDevServer = isDev && process.env.USE_DEV_SERVER === 'true';
    if (useDevServer) {
      try {
        win.loadURL('http://localhost:3000').catch((error) => {
          logger.warn('Development server not available:', error.message);
          logger.info('Loading from built files instead...');
          const distPath = path.join(__dirname, '../../../dist/index.html');

          // Check if dist file exists before trying to load (skip in test environment)
          if (process.env.JEST_WORKER_ID) {
            // In test environment, load directly (mocks will handle success/failure)
            win.loadFile(distPath).catch((fileError) => {
              logger.error(
                'Failed to load from built files:',
                fileError.message,
              );
              loadFallbackContent(win, logger);
            });
          } else {
            // In production, check file existence first
            const fs = require('fs').promises;
            fs.access(distPath)
              .then(() => {
                win.loadFile(distPath).catch((fileError) => {
                  logger.error(
                    'Failed to load from built files:',
                    fileError.message,
                  );
                  loadFallbackContent(win, logger);
                });
              })
              .catch(() => {
                logger.warn('Built files not available, loading fallback...');
                loadFallbackContent(win, logger);
              });
          }
        });
        if (process.env.FORCE_DEV_TOOLS === 'true') {
          win.webContents.openDevTools();
        }
      } catch (error) {
        logger.error('Failed to load development server:', error.message);
        loadFallbackContent(win, logger);
      }
    } else {
      const distPath = path.join(__dirname, '../../../dist/index.html');

      // Check if dist file exists before trying to load (skip in test environment)
      if (process.env.JEST_WORKER_ID) {
        // In test environment, load directly (mocks will handle success/failure)
        win.loadFile(distPath).catch((error) => {
          logger.error('Failed to load from dist:', error.message);
          loadFallbackContent(win, logger);
        });
      } else {
        // In production, check file existence first
        const fs = require('fs').promises;
        fs.access(distPath)
          .then(() => {
            win.loadFile(distPath).catch((error) => {
              logger.error('Failed to load from dist:', error.message);
              loadFallbackContent(win, logger);
            });
          })
          .catch(() => {
            logger.error('Dist files not found, loading fallback...');
            loadFallbackContent(win, logger);
          });
      }
    }

    // Prevent external scripts and isolate renderer with strict Content Security Policy
    win.webContents.session.webRequest.onHeadersReceived(
      (details, callback) => {
        try {
          let ollamaHost = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';

          // Safely get Ollama host with validation
          try {
            const { getOllamaHost } = require('../ollamaUtils');
            const configured =
              typeof getOllamaHost === 'function' ? getOllamaHost() : null;
            if (
              configured &&
              typeof configured === 'string' &&
              configured.trim()
            ) {
              // Basic URL validation
              try {
                new URL(configured);
                ollamaHost = configured;
              } catch (urlError) {
                logger.warn(
                  '[WINDOW] Invalid Ollama host URL:',
                  configured,
                  urlError.message,
                );
              }
            }
          } catch (error) {
            logger.debug('[WINDOW] Failed to get Ollama host:', error.message);
          }

          let wsHost = '';
          try {
            const url = new URL(ollamaHost);
            wsHost =
              url.protocol === 'https:'
                ? `wss://${url.host}`
                : `ws://${url.host}`;
          } catch (error) {
            logger.debug(
              '[WINDOW] Failed to parse Ollama host URL:',
              error.message,
            );
            wsHost = '';
          }

          // Material-UI requires 'unsafe-inline' for styles to work
          // In a more secure setup, we'd use nonces or hashes, but for now we need inline styles
          const styleSrc = "'self' 'unsafe-inline'";
          const connectSrc = wsHost
            ? `'self' ${ollamaHost} ${wsHost}`
            : `'self' ${ollamaHost}`;
          const csp = `default-src 'self'; script-src 'self'; style-src ${styleSrc}; img-src 'self' data: blob:; font-src 'self' data:; connect-src ${connectSrc}; object-src 'none'; base-uri 'self'; form-action 'self';`;

          // Ensure responseHeaders exists and is an object
          const responseHeaders = details.responseHeaders || {};

          callback({
            responseHeaders: {
              ...responseHeaders,
              'Content-Security-Policy': [csp],
              'X-Content-Type-Options': ['nosniff'],
              'X-Frame-Options': ['DENY'],
              'X-XSS-Protection': ['1; mode=block'],
              'Strict-Transport-Security': [
                'max-age=31536000; includeSubDomains',
              ],
              'Referrer-Policy': ['strict-origin-when-cross-origin'],
              // COOP/COEP can break some integrations; set COOP only
              'Cross-Origin-Opener-Policy': ['same-origin'],
              'Cross-Origin-Resource-Policy': ['same-origin'],
              'Cross-Origin-Embedder-Policy': ['require-corp'],
              // Enhanced Permissions Policy
              'Permissions-Policy': [
                'accelerometer=(), ambient-light-sensor=(), autoplay=(self), battery=(), camera=(), clipboard-read=(self), clipboard-write=(self), display-capture=(), encrypted-media=(), fullscreen=(self), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), midi=(), payment=(), picture-in-picture=(), publickey-credentials-get=(), screen-wake-lock=(), usb=(), xr-spatial-tracking=()',
              ],
            },
          });
        } catch (error) {
          logger.error(
            '[WINDOW] Error setting security headers:',
            error.message,
          );
          // Fallback with enhanced security headers
          callback({
            responseHeaders: {
              ...details.responseHeaders,
              'Content-Security-Policy': [
                "default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'self'",
              ],
              'X-Content-Type-Options': ['nosniff'],
              'X-Frame-Options': ['DENY'],
              'X-XSS-Protection': ['1; mode=block'],
              'Strict-Transport-Security': [
                'max-age=31536000; includeSubDomains',
              ],
              'Referrer-Policy': ['strict-origin-when-cross-origin'],
              'Cross-Origin-Opener-Policy': ['same-origin'],
              'Cross-Origin-Resource-Policy': ['same-origin'],
              'Permissions-Policy': [
                'camera=(), microphone=(), geolocation=()',
              ],
            },
          });
        }
      },
    );

    // Removed forced show timeout; rely on the 'ready-to-show' event to
    // display the window only when the renderer is ready. This avoids
    // race conditions and flashing content on startup.

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
        logger.debug('[WINDOW] Blocked navigation attempt:', url);
      } catch (error) {
        logger.error('[WINDOW] Error handling navigation:', error.message);
      }
    });

    // Disallow embedding arbitrary webviews
    win.webContents.on(
      'will-attach-webview',
      (event, webPreferences, params) => {
        try {
          event.preventDefault();
          logger.warn(
            '[WINDOW] Blocked webview attachment attempt:',
            params?.src,
          );
        } catch (error) {
          logger.error(
            '[WINDOW] Error handling webview attachment:',
            error.message,
          );
        }
      },
    );

    // Handle crashed or unresponsive renderers
    win.webContents.on('crashed', (event) => {
      logger.error('[WINDOW] Renderer process crashed');
      try {
        // Attempt to reload the page
        win.reload();
      } catch (error) {
        logger.error('[WINDOW] Failed to reload after crash:', error.message);
      }
    });

    win.webContents.on('unresponsive', () => {
      logger.warn('[WINDOW] Renderer process became unresponsive');
      try {
        // Show dialog to user
        dialog
          .showMessageBox(win, {
            type: 'warning',
            title: 'Application Unresponsive',
            message:
              'The application has become unresponsive. Would you like to reload?',
            buttons: ['Reload', 'Wait'],
            defaultId: 0,
          })
          .then((result) => {
            if (result.response === 0) {
              win.reload();
            }
          })
          .catch((error) => {
            logger.error(
              '[WINDOW] Error showing unresponsive dialog:',
              error.message,
            );
          });
      } catch (error) {
        logger.error(
          '[WINDOW] Error handling unresponsive state:',
          error.message,
        );
      }
    });

    // Deny all permission requests by default (camera, mic, etc.)
    try {
      win.webContents.session.setPermissionRequestHandler(
        (_wc, permission, callback) => {
          logger.debug('[WINDOW] Permission request blocked:', permission);
          callback(false);
        },
      );
    } catch (error) {
      logger.error('[WINDOW] Failed to set permission handler:', error.message);
    }

    win.webContents.setWindowOpenHandler(({ url }) => {
      try {
        const allowedDomains = [
          'https://github.com',
          'https://docs.github.com',
          'https://microsoft.com',
          'https://docs.microsoft.com',
          'https://ollama.ai',
        ];

        // Validate URL before checking domains
        let isValidUrl = false;
        try {
          new URL(url);
          isValidUrl = true;
        } catch {
          logger.warn('[WINDOW] Invalid URL in window open handler:', url);
          return { action: 'deny' };
        }

        if (
          isValidUrl &&
          allowedDomains.some((domain) => url.startsWith(domain))
        ) {
          logger.debug('[WINDOW] Opening external URL:', url);
          shell.openExternal(url);
          return { action: 'deny' }; // Still deny the window.open, but we opened it externally
        }

        logger.debug('[WINDOW] Blocked window.open attempt:', url);
        return { action: 'deny' };
      } catch (error) {
        logger.error('[WINDOW] Error in window open handler:', error.message);
        return { action: 'deny' };
      }
    });

    return win;
  } catch (error) {
    logger.error('Failed to create main window:', error);
    logger.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
    });
    throw error; // Re-throw to allow caller to handle
  }
}

module.exports = createMainWindow;
