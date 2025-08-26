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
  (async () => {
    // eslint-disable-next-line no-console
    console.log(chalk.cyan('Starting Ollama server (ollama serve)...'));
    // Ensure GPU environment variables are set to prefer GPU when available.
    // Respect any existing environment overrides but default to enabling GPU.
    const env = Object.assign({}, process.env, {
      OLLAMA_GPU:
        process.env.OLLAMA_GPU === 'true' || process.env.OLLAMA_GPU === '1'
          ? process.env.OLLAMA_GPU
          : 'true',
    });

    // Optional multi-GPU and layer settings if available in the environment
    if (!env.OLLAMA_NUM_GPU && process.env.OLLAMA_NUM_GPU) {
      env.OLLAMA_NUM_GPU = process.env.OLLAMA_NUM_GPU;
    }
    if (!env.OLLAMA_GPU_LAYERS && process.env.OLLAMA_GPU_LAYERS) {
      env.OLLAMA_GPU_LAYERS = process.env.OLLAMA_GPU_LAYERS;
    }

    // Print effective settings for user visibility
    // eslint-disable-next-line no-console
    console.log(
      chalk.yellow(
        `Using OLLAMA_GPU=${env.OLLAMA_GPU}` +
          (env.OLLAMA_NUM_GPU ? ` OLLAMA_NUM_GPU=${env.OLLAMA_NUM_GPU}` : '') +
          (env.OLLAMA_GPU_LAYERS
            ? ` OLLAMA_GPU_LAYERS=${env.OLLAMA_GPU_LAYERS}`
            : ''),
      ),
    );

    // Start Ollama in detached/background mode so this script doesn't block the app
    try {
      const { spawn } = require('child_process');
      const child = spawn('ollama', ['serve'], {
        env,
        shell: process.platform === 'win32',
        detached: true,
        stdio: 'ignore',
      });
      // Allow process to continue independently
      child.unref();
      console.log(
        chalk.green(`Started Ollama (pid: ${child.pid}) in background.`),
      );

      // Quick best-effort check: poll /api/tags for up to 5s to confirm it's reachable
      const start = Date.now();
      let reachable = false;
      while (Date.now() - start < 5000) {
        const res = check(
          process.platform === 'win32' ? 'powershell.exe' : 'curl',
          process.platform === 'win32'
            ? [
                '-NoProfile',
                '-Command',
                `(Invoke-WebRequest -Uri "${host}/api/tags" -UseBasicParsing).StatusCode`,
              ]
            : [
                '-s',
                '-o',
                '/dev/null',
                '-w',
                '%{http_code}',
                `${host}/api/tags`,
              ],
        );
        const code = (res.stdout || '').trim();
        if (code && code !== '0' && code !== '000') {
          reachable = true;
          break;
        }
        // non-blocking sleep 500ms
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 500));
      }

      if (reachable) {
        console.log(chalk.green(`✓ Ollama reachable at ${host}`));
        // Optional: try to detect GPU-backed containers via `ollama ps`
        try {
          const ps = check('ollama', ['ps']);
          if (ps.ok && (ps.stdout || '').toLowerCase().includes('gpu')) {
            console.log(
              chalk.green(
                'Ollama appears to be running with GPU-enabled containers',
              ),
            );
          } else {
            console.log(
              chalk.yellow(
                'Ollama started but GPU-backed containers were not detected.',
              ),
            );
          }
        } catch (e) {
          console.log(
            chalk.yellow(
              'Started Ollama; could not determine container GPU status.',
            ),
          );
        }
      } else {
        console.log(
          chalk.yellow(
            `! Ollama not reachable at ${host} after start (give it a few seconds).`,
          ),
        );
      }

      process.exit(0);
    } catch (startErr) {
      console.error('Failed to start Ollama:', startErr.message || startErr);
      process.exit(1);
    }
  })();
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
