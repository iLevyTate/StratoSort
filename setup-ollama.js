#!/usr/bin/env node

const os = require('os');
const { spawn, spawnSync } = require('child_process');

// Node 18+ has global fetch
const fetchFn = typeof fetch !== 'undefined' ? fetch : null;

const REQUIRED_MODELS = [
  'llama3.2:latest',          // Text
  'llava:latest',             // Vision
  'mxbai-embed-large',        // Embeddings
  'dimavz/whisper-tiny:latest' // Audio (small, fast)
];

const DEFAULT_HOST = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';

function log(section, message) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [${section}] ${message}`);
}

function run(command, args = [], options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: 'inherit', shell: false, ...options });
    child.on('close', (code) => resolve({ code }));
  });
}

function runShell(cmd, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, { stdio: 'inherit', shell: true, ...options });
    child.on('close', (code) => resolve({ code }));
  });
}

function commandExists(cmd) {
  try {
    if (process.platform === 'win32') {
      const r = spawnSync('where', [cmd], { stdio: 'ignore' });
      return r.status === 0;
    }
    const r = spawnSync('bash', ['-lc', `command -v ${cmd}`], { stdio: 'ignore' });
    return r.status === 0;
  } catch (_) {
    return false;
  }
}

async function isServerRunning(host = DEFAULT_HOST) {
  try {
    if (!fetchFn) return false;
    const res = await fetchFn(`${host}/api/tags`, { method: 'GET' });
    return res.ok;
  } catch (_) {
    return false;
  }
}

async function startOllamaService() {
  log('OLLAMA', 'Starting ollama service...');
  // Start in background, detached
  try {
    const child = spawn('ollama', ['serve'], {
      detached: true,
      stdio: 'ignore'
    });
    child.on('error', (err) => {
      log('OLLAMA', `Failed to start service: ${err.message}`);
    });
    child.unref();
  } catch (err) {
    log('OLLAMA', `Start error: ${err.message}`);
    return false;
  }

  // Wait up to ~20s for the server
  const start = Date.now();
  while (Date.now() - start < 20000) {
    if (await isServerRunning()) {
      log('OLLAMA', 'Service is running.');
      return true;
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  log('OLLAMA', 'Service did not respond in time. You may need to run `ollama serve` manually.');
  return false;
}

async function installOllama() {
  const platform = process.platform;
  log('INSTALL', `Detected platform: ${platform}`);

  if (commandExists('ollama')) {
    log('INSTALL', 'Ollama is already installed.');
    return true;
  }

  if (platform === 'linux') {
    log('INSTALL', 'Installing Ollama on Linux via official script...');
    const { code } = await runShell('curl -fsSL https://ollama.ai/install.sh | sh');
    if (code === 0) {
      log('INSTALL', 'Ollama installed successfully.');
      return true;
    }
    log('INSTALL', 'Failed to install Ollama automatically. Please install manually: https://ollama.ai');
    return false;
  }

  if (platform === 'darwin') {
    if (commandExists('brew')) {
      log('INSTALL', 'Installing Ollama on macOS via Homebrew...');
      const { code } = await run('brew', ['install', 'ollama']);
      if (code === 0) {
        log('INSTALL', 'Ollama installed successfully via Homebrew.');
        return true;
      }
    }
    log('INSTALL', 'Please install Ollama from https://ollama.ai or `brew install ollama`.');
    return false;
  }

  if (platform === 'win32') {
    log('INSTALL', 'Attempting to install Ollama on Windows via winget...');
    if (commandExists('winget')) {
      const { code } = await run('winget', ['install', '--silent', 'Ollama.Ollama']);
      if (code === 0) {
        log('INSTALL', 'Ollama installed successfully via winget.');
        return true;
      }
    }
    log('INSTALL', 'Please install Ollama from https://ollama.ai (Windows installer).');
    return false;
  }

  log('INSTALL', 'Unsupported platform for automatic installation. Please install from https://ollama.ai');
  return false;
}

async function pullModel(model) {
  log('MODELS', `Pulling model: ${model}`);
  const { code } = await run('ollama', ['pull', model]);
  if (code !== 0) {
    log('MODELS', `Failed to pull model: ${model}`);
  }
  return code === 0;
}

async function listInstalledModels() {
  try {
    const { Ollama } = require('ollama');
    const client = new Ollama({ host: DEFAULT_HOST });
    const res = await client.list();
    return (res.models || []).map(m => m.name.toLowerCase());
  } catch (e) {
    return [];
  }
}

async function ensureModels(models = REQUIRED_MODELS) {
  const installed = (await listInstalledModels()) || [];
  const toInstall = models.filter(m => !installed.some(x => x === m.toLowerCase() || x.startsWith(m.toLowerCase().split(':')[0])));
  if (toInstall.length === 0) {
    log('MODELS', 'All required models are already installed.');
    return true;
  }

  log('MODELS', `Missing models: ${toInstall.join(', ')}`);
  let ok = true;
  for (const m of toInstall) {
    // eslint-disable-next-line no-await-in-loop
    const pulled = await pullModel(m);
    ok = ok && pulled;
  }
  return ok;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const doCheck = args.has('--check');
  const doStart = args.has('--start');
  const doPullOnly = args.has('--pull');
  const doFull = args.has('--full') || (!doCheck && !doStart && !doPullOnly);

  log('SETUP', `Host: ${DEFAULT_HOST}`);

  if (doCheck) {
    const installed = commandExists('ollama');
    log('CHECK', `Ollama binary: ${installed ? 'FOUND' : 'NOT FOUND'}`);
    const running = await isServerRunning();
    log('CHECK', `Ollama service: ${running ? 'RUNNING' : 'NOT RUNNING'}`);

    let missing = [];
    if (installed && running) {
      const installedModels = await listInstalledModels();
      missing = REQUIRED_MODELS.filter(m => !installedModels.some(x => x === m.toLowerCase() || x.startsWith(m.toLowerCase().split(':')[0])));
      log('CHECK', `Models installed: ${installedModels.length}. Missing: ${missing.join(', ') || 'none'}`);
    }

    const ok = installed && running && missing.length === 0;
    process.exitCode = ok ? 0 : 1;
    return;
  }

  if (doStart) {
    if (!commandExists('ollama')) {
      log('ERROR', 'Ollama is not installed. Run with --full or install manually: https://ollama.ai');
      process.exitCode = 1;
      return;
    }
    const running = await isServerRunning();
    if (!running) {
      const started = await startOllamaService();
      process.exitCode = started ? 0 : 1;
    }
    return;
  }

  if (doPullOnly) {
    if (!(await isServerRunning())) {
      log('INFO', 'Ollama service is not running. Attempting to start...');
      const started = await startOllamaService();
      if (!started) {
        process.exitCode = 1;
        return;
      }
    }
    const ok = await ensureModels();
    process.exitCode = ok ? 0 : 1;
    return;
  }

  if (doFull) {
    const installed = await installOllama();
    if (!installed) {
      log('ERROR', 'Could not install Ollama automatically. Please install manually: https://ollama.ai');
      process.exitCode = 1;
      return;
    }

    if (!(await isServerRunning())) {
      const started = await startOllamaService();
      if (!started) {
        process.exitCode = 1;
        return;
      }
    }

    const ok = await ensureModels();
    process.exitCode = ok ? 0 : 1;
    return;
  }
}

main().catch((err) => {
  log('FATAL', err && err.stack ? err.stack : String(err));
  process.exitCode = 1;
});