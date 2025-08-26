#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const glob = require('glob');

const ROOT = path.join(__dirname, '..');
const RENDERER_SRC = path.join(ROOT, 'src', 'renderer');

const CHANNEL_TO_API = {
  'system:get-log-files': 'system.getLogFiles',
  'system:get-recent-logs': 'system.getRecentLogs',
  'system:get-log-stats': 'system.getLogStats',
  'system:read-log-file': 'system.readLogFile',
  'system:get-metrics': 'system.getMetrics',
  'system:get-system-status': 'system.getSystemStatus',
  'system:perform-health-check': 'system.performHealthCheck',
};

function findFiles() {
  return glob.sync('**/*.+(js|jsx|ts|tsx)', {
    cwd: RENDERER_SRC,
    absolute: true,
  });
}

function run(dryRun = true) {
  const files = findFiles();
  const changes = [];

  const channelPattern = Object.keys(CHANNEL_TO_API)
    .map((c) => c.replace(/[-\\^$*+?.()|[\]{}]/g, '\\$&'))
    .join('|');
  const regex = new RegExp(
    'ipcRenderer\\.invoke\\(\\s*(["\'])(' +
      channelPattern +
      ')\\1\\s*(,([\\s\\S]*?))?\\)',
    'g',
  );

  files.forEach((file) => {
    const src = fs.readFileSync(file, 'utf8');
    let out = src;
    let match;
    const fileChanges = [];

    while ((match = regex.exec(src)) !== null) {
      const full = match[0];
      const channel = match[2];
      const rest = match[4] || '';
      const api = CHANNEL_TO_API[channel];
      if (!api) continue;

      // build replacement
      const replacement = `window.electronAPI.${api}(${rest.replace(/^,\s*/, '')})`;
      out = out.replace(full, replacement);
      fileChanges.push({ before: full, after: replacement });
    }

    if (fileChanges.length > 0) {
      changes.push({ file, fileChanges });
      if (!dryRun) fs.writeFileSync(file, out, 'utf8');
    }
  });

  if (changes.length === 0) {
    console.log('No ipcRenderer.invoke(...) patterns matched the mapping.');
    return 0;
  }

  console.log(`Found ${changes.length} files with replacements.`);
  changes.forEach((c) => {
    console.log('---', path.relative(ROOT, c.file));
    c.fileChanges.forEach((f) => {
      console.log('- ', f.before);
      console.log('+ ', f.after);
    });
  });

  if (dryRun)
    console.log('\nDry run complete. Run with --apply to write changes.');
  else console.log('\nApplied changes. Please rebuild and test.');

  return 0;
}

function main() {
  const argv = process.argv.slice(2);
  const dryRun = !argv.includes('--apply');
  return run(dryRun);
}

main();
