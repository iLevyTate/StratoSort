// Ensure global/globalThis polyfills for libraries expecting Node-like globals
if (typeof global === 'undefined') {
  // eslint-disable-next-line no-undef
  window.global = window;
}
if (typeof globalThis === 'undefined') {
  // eslint-disable-next-line no-undef
  window.globalThis = window;
}
