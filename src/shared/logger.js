// Lightweight logger used across main, preload, and renderer.
// In production builds (NODE_ENV === 'production'), debug logs are suppressed.
// Errors and warnings still pass through the native console methods.
/*
  Usage examples:
    const { log, warn, error } = require('../shared/logger');
    log('debug message');
    warn('something odd');
*/

const isDev = process.env.NODE_ENV !== 'production';

function noop() {}

module.exports = {
  log: isDev ? console.log.bind(console) : noop,
  warn: isDev ? console.warn.bind(console) : console.warn.bind(console),
  error: console.error.bind(console),
}; 