#!/usr/bin/env node
/**
 * Automated Bug Fix Script
 * Run: node auto-fix-bugs.js
 */

const fs = require('fs');
const path = require('path');

const fixes = [
  // FIX 1: ServiceIntegration export
  {
    file: 'src/main/services/ServiceIntegration.js',
    find: /\/\/ Singleton instance[\s\S]*?module\.exports = \{ ServiceIntegration, getServiceIntegration \};/,
    replace: `module.exports = ServiceIntegration;
module.exports.getServiceIntegration = function() {
  if (!module.exports.instance) {
    module.exports.instance = new ServiceIntegration();
  }
  return module.exports.instance;
};`,
  },

  // FIX 2: ServiceIntegration return promise
  {
    file: 'src/main/services/ServiceIntegration.js',
    find: /initializeBackground\(\) \{[\s\S]*?Promise\.all\(\[/,
    replace: `initializeBackground() {
    if (this.initialized) return;
    this.analysisHistory = new AnalysisHistoryService();
    this.undoRedo = new UndoRedoService();
    this.processingState = new ProcessingStateService();

    return Promise.all([`,
  },

  // FIX 3: UndoRedo import
  {
    file: 'src/main/ipc/undoRedo.js',
    find: /^const \{ withErrorLogging \}/,
    replace: `const { getServiceIntegration } = require('../services/ServiceIntegration');
const { withErrorLogging }`,
  },

  // FIX 4: ErrorHandler async
  {
    file: 'src/main/errors/ErrorHandler.js',
    find: /setupGlobalHandlers\(\) \{[\s\S]*?\n {2}\}/,
    replace: `setupGlobalHandlers() {
    const { app } = require('electron');

    process.removeAllListeners('uncaughtException');
    process.removeAllListeners('unhandledRejection');

    process.on('uncaughtException', (error) => {
      Promise.resolve(this.handleCriticalError('Uncaught Exception', error))
        .catch(e => console.error('[ERROR-HANDLER] Failed:', e));
    });

    process.on('unhandledRejection', (reason) => {
      Promise.resolve(this.handleCriticalError('Unhandled Rejection', reason))
        .catch(e => console.error('[ERROR-HANDLER] Failed:', e));
    });

    if (app && app.removeAllListeners) {
      app.removeAllListeners('render-process-gone');
      app.removeAllListeners('child-process-gone');

      app.on('render-process-gone', (_, __, details) => {
        Promise.resolve(this.handleCriticalError('Renderer Crashed', details))
          .catch(e => console.error('[ERROR-HANDLER] Failed:', e));
      });

      app.on('child-process-gone', (_, details) => {
        Promise.resolve(this.handleCriticalError('Child Crashed', details))
          .catch(e => console.error('[ERROR-HANDLER] Failed:', e));
      });
    }
  }`,
  },

  // FIX 5: Simple-main ServiceIntegration import
  {
    file: 'src/main/simple-main.js',
    find: /const ServiceIntegration = require\('\.\/services\/ServiceIntegration'\);/,
    replace: `const { ServiceIntegration, getServiceIntegration } = require('./services/ServiceIntegration');
let serviceIntegration = null;`,
  },

  // FIX 6: Simple-main duplicate ServiceIntegration
  {
    file: 'src/main/simple-main.js',
    find: /\/\/ 3\. Initialize service integration[\s\S]*?const ServiceIntegration = require[\s\S]*?await serviceIntegration\.initialize\(\);/,
    replace: `// 3. Initialize service integration
      serviceIntegration = new ServiceIntegration();
      await serviceIntegration.initialize();`,
  },

  // FIX 7: Lazy loaders
  {
    file: 'src/main/simple-main.js',
    find: /async function getAnalyzeDocumentFile\(\) \{[\s\S]*?\n\}/,
    replace: `async function getAnalyzeDocumentFile() {
  if (!analyzeDocumentFile) {
    try {
      analyzeDocumentFile = require('./analysis/ollamaDocumentAnalysis').analyzeDocumentFile;
    } catch (error) {
      logger.error('[LAZY] Document analysis failed:', error);
      analyzeDocumentFile = () => Promise.reject(new Error('Document analysis unavailable'));
    }
  }
  return analyzeDocumentFile;
}`,
  },

  {
    file: 'src/main/simple-main.js',
    find: /async function getAnalyzeImageFile\(\) \{[\s\S]*?\n\}/,
    replace: `async function getAnalyzeImageFile() {
  if (!analyzeImageFile) {
    try {
      analyzeImageFile = require('./analysis/ollamaImageAnalysis').analyzeImageFile;
    } catch (error) {
      logger.error('[LAZY] Image analysis failed:', error);
      analyzeImageFile = () => Promise.reject(new Error('Image analysis unavailable'));
    }
  }
  return analyzeImageFile;
}`,
  },

  // FIX 8: IPC index import
  {
    file: 'src/main/ipc/index.js',
    find: /^const registerAnalysisIpc/,
    replace: `const { getServiceIntegration } = require('../services/ServiceIntegration');
const registerAnalysisIpc`,
  },

  // FIX 9: IPC undoRedo call
  {
    file: 'src/main/ipc/index.js',
    find: /registerUndoRedoIpc\(\{[\s\S]*?logger,?\n?\s*\}\);/,
    replace: `registerUndoRedoIpc({
    ipcMain,
    IPC_CHANNELS,
    logger,
    getServiceIntegration
  });`,
  },

  // FIX 10: SettingsService constructor
  {
    file: 'src/main/services/SettingsService.js',
    find: /constructor\(\) \{[\s\S]*?this\.settingsPath = path[\s\S]*?\n {4}\}/,
    replace: `constructor() {
    const fs = require('fs');
    const os = require('os');

    try {
      const { app } = require('electron');
      this.settingsPath = path.join(app.getPath('userData'), 'settings.json');
    } catch {
      const dir = path.join(os.tmpdir(), 'stratosort');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      this.settingsPath = path.join(dir, 'settings.json');
    }`,
  },

  // FIX 11: CreateWindow error recovery
  {
    file: 'src/main/core/createWindow.js',
    find: /\} catch \(error\) \{[\s\S]*?throw error;[\s\S]*?\}/,
    replace: `} catch (error) {
    logger.error('Failed to create main window:', error);
    const { app, dialog } = require('electron');

    if (app && app.isReady()) {
      setTimeout(() => {
        try {
          return createMainWindow(systemAnalytics, logger);
        } catch (retryError) {
          dialog.showErrorBox('Fatal Error', \`Window failed: \${retryError.message}\`);
          app.quit();
        }
      }, 1000);
    }
    throw error;
  }`,
  },

  // FIX 12: RegisterAllIpc - add getServiceIntegration param
  {
    file: 'src/main/simple-main.js',
    find: /registerAllIpc\(\{[\s\S]*?addCustomFolder,[\s\S]*?removeCustomFolder,?[\s\S]*?\}\);/,
    replace: (match) => {
      if (match.includes('getServiceIntegration')) return match;
      return match.replace(
        /removeCustomFolder,?\n?\s*\}/,
        `removeCustomFolder,
    getServiceIntegration
  }`,
      );
    },
  },
];

// Apply fixes
let fixCount = 0;
let errorCount = 0;

fixes.forEach((fix, index) => {
  try {
    const filePath = path.join(process.cwd(), fix.file);

    if (!fs.existsSync(filePath)) {
      console.log(`⚠️  SKIP[${index + 1}]: ${fix.file} - File not found`);
      return;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const backup = content;

    let newContent;
    if (typeof fix.replace === 'function') {
      newContent = content.replace(fix.find, fix.replace);
    } else {
      newContent = content.replace(fix.find, fix.replace);
    }

    if (newContent === content) {
      console.log(
        `ℹ️  SKIP[${index + 1}]: ${fix.file} - Already fixed or pattern not found`,
      );
      return;
    }

    // Backup original
    const backupPath = filePath + '.backup.' + Date.now();
    fs.writeFileSync(backupPath, backup);

    // Write fix
    fs.writeFileSync(filePath, newContent);
    console.log(`✅ FIX[${index + 1}]: ${fix.file}`);
    fixCount++;
  } catch (error) {
    console.error(`❌ ERROR[${index + 1}]: ${fix.file} - ${error.message}`);
    errorCount++;
  }
});

console.log('\n=== SUMMARY ===');
console.log(`✅ Fixed: ${fixCount} files`);
console.log(`❌ Errors: ${errorCount} files`);
console.log(`ℹ️  Skipped: ${fixes.length - fixCount - errorCount} files`);

// Verify critical fixes
console.log('\n=== VERIFICATION ===');
const verifications = [
  {
    file: 'src/main/services/ServiceIntegration.js',
    check: (content) =>
      content.includes('module.exports = ServiceIntegration') &&
      content.includes('module.exports.getServiceIntegration'),
    name: 'ServiceIntegration export',
  },
  {
    file: 'src/main/ipc/undoRedo.js',
    check: (content) => content.includes('getServiceIntegration'),
    name: 'UndoRedo import',
  },
  {
    file: 'src/main/errors/ErrorHandler.js',
    check: (content) =>
      content.includes('Promise.resolve(this.handleCriticalError'),
    name: 'ErrorHandler async',
  },
];

verifications.forEach((v) => {
  try {
    const content = fs.readFileSync(path.join(process.cwd(), v.file), 'utf8');
    console.log(`${v.check(content) ? '✅' : '❌'} ${v.name}`);
  } catch {
    console.log(`❌ ${v.name} - File not found`);
  }
});

console.log('\n=== NEXT STEPS ===');
console.log('1. npm run build');
console.log('2. npm test');
console.log('3. npm start');
console.log('\nBackups created with .backup.[timestamp] extension');
