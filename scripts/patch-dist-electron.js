#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const DIST_PATH = path.join(__dirname, '..', 'dist', 'renderer.js');

function run(dryRun = true) {
  try {
    if (!fs.existsSync(DIST_PATH)) {
      console.error(
        'Error: dist/renderer.js not found. Build the renderer first.',
      );
      return 1;
    }

    let content;
    try {
      content = fs.readFileSync(DIST_PATH, 'utf8');
    } catch (readError) {
      console.error(
        'Error: Failed to read dist/renderer.js:',
        readError.message,
      );
      return 1;
    }

    const needle = "require('electron')";
    const altNeedle = 'require("electron")';

    const matches = content.includes(needle) || content.includes(altNeedle);

    console.log('Electron requires present in dist bundle:', matches);

    let out;

    if (!matches) {
      // Still inject a small shim at the top that maps window.electron to window.electron || {}
      const shim = `// Injected shim: ensure window.electron exists for compatibility\n(function(){if(typeof window!=='undefined' && !window.electron){window.electron=window.electron||{};} })();\n`;

      if (dryRun) {
        console.log(
          'Would inject compatibility shim at top of dist/renderer.js',
        );
        return 0;
      }

      out = shim + content;
    } else {
      // If matches present, replace occurrences with window.electron for safety
      out = content.replace(
        /require\((?:'electron'|"electron")\)/g,
        'window.electron',
      );

      // Inject shim at top to ensure window.electron exists
      const shim = `// Injected shim: ensure window.electron exists for compatibility\n(function(){if(typeof window!=='undefined' && !window.electron){window.electron=window.electron||{};} })();\n`;
      out = shim + out;
    }

    if (dryRun) {
      const action = matches
        ? "Would replace require('electron') occurrences in dist/renderer.js and inject shim"
        : 'Would inject compatibility shim at top of dist/renderer.js';
      console.log(action);
      return 0;
    }

    try {
      fs.writeFileSync(DIST_PATH, out, 'utf8');
      console.log(
        matches
          ? "Patched dist/renderer.js: require('electron') -> window.electron"
          : 'Shim injected into dist/renderer.js',
      );
      return 0;
    } catch (writeError) {
      console.error(
        'Error: Failed to write dist/renderer.js:',
        writeError.message,
      );
      return 1;
    }
  } catch (error) {
    console.error('Unexpected error during patching:', error.message);
    return 1;
  }
}

function main() {
  try {
    const argv = process.argv.slice(2);
    const dryRun = !argv.includes('--apply');
    const exitCode = run(dryRun);
    process.exit(exitCode);
  } catch (error) {
    console.error('Fatal error in patch-dist-electron.js:', error.message);
    process.exit(1);
  }
}

main();
