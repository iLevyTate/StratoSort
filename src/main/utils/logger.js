const isDev = process.env.NODE_ENV === 'development';
let log;
try {
  log = require('electron-log');
} catch (e) {
  log = console;
}

const info = (...args) => log.info(...args);
const warn = (...args) => log.warn(...args);
const error = (...args) => log.error(...args);
const debug = (...args) => {
  if (isDev && log.debug) {
    log.debug(...args);
  } else if (isDev) {
    // if log has no debug method (console), fallback to info
    log.info(...args);
  }
};

module.exports = { info, warn, error, debug };
