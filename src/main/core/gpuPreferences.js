const { app } = require('electron');

function applyGpuPreferences(logger) {
  try {
    const angleBackend = process.env.ANGLE_BACKEND || 'gl';
    app.commandLine.appendSwitch('use-angle', angleBackend);
    app.commandLine.appendSwitch('disable-gpu-sandbox');
    app.commandLine.appendSwitch('disable-software-rasterizer');
    app.commandLine.appendSwitch('enable-gpu-rasterization');
    app.commandLine.appendSwitch('ignore-gpu-blocklist');
    app.commandLine.appendSwitch('disable-features', 'VizDisplayCompositor');
    app.commandLine.appendSwitch('use-gl', 'swiftshader');
    if (logger && typeof logger.info === 'function') {
      logger.info(
        `[GPU] Flags set: ANGLE=${angleBackend}, WebGL fallback enabled`,
      );
    }
  } catch (error) {
    if (logger && typeof logger.warn === 'function') {
      logger.warn('[GPU] Failed to apply GPU flags:', error.message);
    }
  }
}

module.exports = { applyGpuPreferences };
