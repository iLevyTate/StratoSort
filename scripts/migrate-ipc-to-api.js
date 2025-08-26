#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const glob = require('glob');
const recast = require('recast');
const babelParser = require('@babel/parser');

const ROOT = path.join(__dirname, '..');
const RENDERER_SRC = path.join(ROOT, 'src', 'renderer');

// Basic mapping — extend as needed. Keys are literal channel strings used in ipcRenderer.invoke
const CHANNEL_TO_API = {
  'system:get-log-files': 'system.getLogFiles',
  'system:get-recent-logs': 'system.getRecentLogs',
  'system:get-log-stats': 'system.getLogStats',
  'system:read-log-file': 'system.readLogFile',
  'system:get-metrics': 'system.getMetrics',
  'system:get-system-status': 'system.getSystemStatus',
  'system:perform-health-check': 'system.performHealthCheck',
  // Add additional mappings as required
};

function findFiles() {
  return glob.sync('**/*.+(js|jsx|ts|tsx)', {
    cwd: RENDERER_SRC,
    absolute: true,
  });
}

function transformFile(file, dryRun = true) {
  const src = fs.readFileSync(file, 'utf8');
  let ast;
  try {
    ast = recast.parse(src, {
      parser: {
        parse(source) {
          return babelParser.parse(source, {
            sourceType: 'unambiguous',
            plugins: [
              'jsx',
              'classProperties',
              'optionalChaining',
              'nullishCoalescingOperator',
              'typescript',
            ],
          });
        },
      },
    });
  } catch (err) {
    console.error('Parse failed for', file, err.message);
    return null;
  }

  let changed = false;

  recast.types.visit(ast, {
    visitCallExpression(pathNode) {
      const { node } = pathNode;
      // Match ipcRenderer.invoke('channel', ...args)
      const callee = node.callee;
      if (
        callee &&
        ((callee.type === 'MemberExpression' &&
          callee.property &&
          callee.property.name === 'invoke') ||
          (callee.type === 'Identifier' && callee.name === 'invoke'))
      ) {
        // get the object name (ipcRenderer.invoke)
        let objectName = null;
        if (
          callee.type === 'MemberExpression' &&
          callee.object &&
          callee.object.name
        ) {
          objectName = callee.object.name;
        }

        // Only transform when objectName === 'ipcRenderer' OR we previously replaced it with our shim
        if (
          objectName === 'ipcRenderer' ||
          objectName === 'ipcRendererShim' ||
          objectName === 'ipc'
        ) {
          const args = node.arguments || [];
          if (args.length > 0 && args[0].type === 'Literal') {
            const channel = args[0].value;
            const mapping = CHANNEL_TO_API[channel];
            if (mapping) {
              const apiParts = mapping.split('.');
              const method = apiParts.pop();
              const objPath = apiParts.join('.');

              // Build replacement: window.electronAPI.<objPath>.<method>(...restArgs)
              const restArgs =
                args
                  .slice(1)
                  .map((a) => recast.print(a).code)
                  .join(', ') || '';
              const replacementCode = `window.electronAPI.${objPath}.${method}(${restArgs})`;

              pathNode.replace(recast.parseExpression(replacementCode));
              changed = true;
              return false;
            } else {
              console.warn(`${file}: Unmapped IPC channel: ${channel}`);
            }
          }
        }
      }

      this.traverse(pathNode);
    },
  });

  if (!changed) return null;

  const output = recast.print(ast).code;
  if (!dryRun) {
    fs.writeFileSync(file, output, 'utf8');
  }

  return { file, before: src, after: output };
}

function main() {
  const argv = process.argv.slice(2);
  const dryRun = !argv.includes('--apply');
  const files = findFiles();
  const results = [];

  files.forEach((f) => {
    const res = transformFile(f, dryRun);
    if (res) results.push(res);
  });

  if (results.length === 0) {
    console.log('No ipcRenderer.invoke(...) usages mapped for replacement.');
    return 0;
  }

  console.log(`Prepared ${results.length} file(s) for update.`);
  if (dryRun)
    console.log(
      'Dry run mode — no files changed. Run with --apply to write changes.',
    );
  else
    console.log('Applied changes to files. Please run your build and tests.');

  return 0;
}

main();
