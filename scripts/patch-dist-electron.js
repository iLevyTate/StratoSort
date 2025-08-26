#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const DIST_PATH = path.join(__dirname, '..', 'dist', 'renderer.js');

function run(dryRun = true) {
  if (!fs.existsSync(DIST_PATH)) {
    console.error('dist/renderer.js not found. Build the renderer first.');
    return 1;
  }

  const content = fs.readFileSync(DIST_PATH, 'utf8');
  const needle = "require('electron')";
  const altNeedle = 'require("electron")';

  const matches = content.includes(needle) || content.includes(altNeedle);

  console.log('Electron requires present in dist bundle:', matches);

  if (!matches) {
    // Still inject a small shim at the top that maps window.electron to window.electron || {}
    const shim = `// Injected shim: ensure window.electron exists for compatibility\n(function(){if(typeof window!=='undefined' && !window.electron){window.electron=window.electron||{};} })();\n`;
    if (dryRun) {
      console.log('Would inject compatibility shim at top of dist/renderer.js');
      return 0;
    }
    const out = shim + content;
    fs.writeFileSync(DIST_PATH, out, 'utf8');
    console.log('Shim injected into dist/renderer.js');
    return 0;
  }

  // If matches present, replace occurrences with window.electron for safety
  let out = content.replace(
    /require\((?:'electron'|"electron")\)/g,
    'window.electron',
  );

  // Inject shim at top to ensure window.electron exists
  const shim = `// Injected shim: ensure window.electron exists for compatibility\n(function(){if(typeof window!=='undefined' && !window.electron){window.electron=window.electron||{};} })();\n`;
  out = shim + out;

  if (dryRun) {
    console.log(
      "Would replace require('electron') occurrences in dist/renderer.js and inject shim",
    );
    return 0;
  }

  fs.writeFileSync(DIST_PATH, out, 'utf8');
  console.log(
    "Patched dist/renderer.js: require('electron') -> window.electron",
  );
  return 0;
}

function main() {
  const argv = process.argv.slice(2);
  const dryRun = !argv.includes('--apply');
  return run(dryRun);
}

main();
