#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const chalk = require('chalk');

try {
  // eslint-disable-next-line global-require
  require('dotenv').config({ path: path.join(__dirname, '.env') });
} catch (_) {}

function checkFileExists(relativePath) {
  const fullPath = path.join(__dirname, relativePath);
  return fs.existsSync(fullPath);
}

function printStatus(ok, label, details) {
  const icon = ok ? chalk.green('✓') : chalk.red('✗');
  // eslint-disable-next-line no-console
  console.log(`${icon} ${label}${details ? chalk.gray(` — ${details}`) : ''}`);
}

function runCmd(cmd, args = []) {
  return spawnSync(cmd, args, { encoding: 'utf8' });
}

function main() {
  // eslint-disable-next-line no-console
  console.log(chalk.cyan.bold('\nStratoSort Startup Checklist'));
  // Basic file presence
  const hasDistIndex = checkFileExists('dist/index.html');
  const hasWebpackConfig = checkFileExists('webpack.config.js');
  const hasRendererIndex = checkFileExists('src/renderer/index.js');
  printStatus(hasWebpackConfig, 'Webpack config present', 'webpack.config.js');
  printStatus(
    hasRendererIndex,
    'Renderer index present',
    'src/renderer/index.js',
  );
  printStatus(hasDistIndex, 'Built renderer present', 'dist/index.html');

  // Check Ollama (optional)
  const ollamaHost = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
  const curl = runCmd(
    process.platform === 'win32' ? 'powershell.exe' : 'curl',
    process.platform === 'win32'
      ? [
          '-NoProfile',
          '-Command',
          `try { (Invoke-WebRequest -Uri "${ollamaHost}/api/tags" -UseBasicParsing).StatusCode } catch { 0 }`,
        ]
      : [
          '-s',
          '-o',
          '/dev/null',
          '-w',
          '%{http_code}',
          `${ollamaHost}/api/tags`,
        ],
  );
  const httpCode = (curl.stdout || '').toString().trim();
  const connected = httpCode && httpCode !== '0' && httpCode !== '000';
  printStatus(
    connected,
    'Ollama reachable',
    connected ? `${ollamaHost}` : 'Optional: start with "ollama serve"',
  );

  // Final hint
  // eslint-disable-next-line no-console
  console.log(
    `\n${chalk.gray('Tip:')} Run ${chalk.yellow('npm run dev')} to build and launch in development mode.`,
  );
}

main();
