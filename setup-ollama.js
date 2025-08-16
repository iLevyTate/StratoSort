#!/usr/bin/env node
'use strict';

const { spawnSync } = require('child_process');
const chalk = require('chalk');

function run(cmd, args = [], opts = {}) {
  const res = spawnSync(cmd, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...opts,
  });
  return res.status === 0;
}

function check(cmd, args = []) {
  const res = spawnSync(cmd, args, {
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  return { ok: res.status === 0, stdout: (res.stdout || '').toString() };
}

const args = process.argv.slice(2);
const isCheck = args.includes('--check');
const isStart = args.includes('--start');

const host = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';

if (isCheck) {
  // eslint-disable-next-line no-console
  console.log(chalk.cyan('Checking Ollama status...'));
  const curl = check(
    process.platform === 'win32' ? 'powershell.exe' : 'curl',
    process.platform === 'win32'
      ? [
          '-NoProfile',
          '-Command',
          `(Invoke-WebRequest -Uri "${host}/api/tags" -UseBasicParsing).StatusCode`,
        ]
      : ['-s', '-o', '/dev/null', '-w', '%{http_code}', `${host}/api/tags`],
  );
  const code = (curl.stdout || '').trim();
  const ok = code && code !== '0' && code !== '000';
  // eslint-disable-next-line no-console
  console.log(
    ok
      ? chalk.green(`✓ Ollama reachable at ${host}`)
      : chalk.yellow(`! Ollama not reachable at ${host}`),
  );
  process.exit(ok ? 0 : 1);
}

if (isStart) {
  // eslint-disable-next-line no-console
  console.log(chalk.cyan('Starting Ollama server (ollama serve)...'));
  const ok = run('ollama', ['serve']);
  process.exit(ok ? 0 : 1);
}

// Default behavior: guided setup
// eslint-disable-next-line no-console
console.log(chalk.cyan('\nStratoSort Ollama Setup'));
// eslint-disable-next-line no-console
console.log('- Ensure Ollama is installed: https://ollama.ai');
// eslint-disable-next-line no-console
console.log('- Pull recommended models:');
// eslint-disable-next-line no-console
console.log('  ollama pull llama3.2:latest');
// eslint-disable-next-line no-console
console.log('  ollama pull llava:latest');
// eslint-disable-next-line no-console
console.log('  ollama pull mxbai-embed-large');

// Offer to pull models interactively (non-interactive default: skip)
if (process.env.CI) {
  process.exit(0);
}

// Try pulling models non-interactively but allow failure
run('ollama', ['pull', 'llama3.2:latest']);
run('ollama', ['pull', 'llava:latest']);
run('ollama', ['pull', 'mxbai-embed-large']);

// eslint-disable-next-line no-console
console.log(
  chalk.green(
    '\nSetup steps attempted. You can start the server with: ollama serve',
  ),
);
