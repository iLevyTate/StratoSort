#!/usr/bin/env node

const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

function runCommand(command, args = [], options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      shell: true,
      stdio: options.stdio || 'pipe',
      detached: !!options.detached,
      env: { ...process.env, ...(options.env || {}) },
    });

    let stdout = '';
    let stderr = '';
    if (child.stdout) child.stdout.on('data', (d) => { stdout += d.toString(); options.onStdout?.(d.toString()); });
    if (child.stderr) child.stderr.on('data', (d) => { stderr += d.toString(); options.onStderr?.(d.toString()); });

    child.on('error', (error) => {
      resolve({ code: -1, stdout, stderr: stderr + (error?.message || '') });
    });

    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

async function checkCommandExists(command) {
  const checkCmd = process.platform === 'win32' ? `where ${command}` : `command -v ${command}`;
  const result = await runCommand(checkCmd);
  return result.code === 0 && result.stdout.trim().length > 0;
}

async function checkOllamaInstalled() {
  const exists = await checkCommandExists('ollama');
  if (!exists) return { installed: false };
  const v = await runCommand('ollama --version');
  return { installed: v.code === 0, version: v.stdout.trim() };
}

async function installOllama(logger = console) {
  const platform = process.platform;
  logger.log(`[setup-ollama] Installing Ollama on ${platform}`);

  if (platform === 'win32') {
    // Prefer winget
    if (await checkCommandExists('winget')) {
      const res = await runCommand('winget install Ollama.Ollama --silent --accept-package-agreements --accept-source-agreements', [], { stdio: 'pipe' });
      if (res.code === 0) return { success: true, method: 'winget' };
      logger.warn('[setup-ollama] winget install failed, trying Chocolatey if available');
    }
    if (await checkCommandExists('choco')) {
      const res = await runCommand('choco install ollama -y', [], { stdio: 'pipe' });
      if (res.code === 0) return { success: true, method: 'choco' };
    }
    return {
      success: false,
      error: 'Automatic installation failed. Please install manually via Windows installer from https://ollama.ai',
    };
  }

  if (platform === 'darwin') {
    if (await checkCommandExists('brew')) {
      const res = await runCommand('brew install ollama');
      if (res.code === 0) return { success: true, method: 'brew' };
      logger.warn('[setup-ollama] brew install failed, trying official script');
    }
    const script = await runCommand('curl -fsSL https://ollama.ai/install.sh | sh', [], { stdio: 'pipe' });
    if (script.code === 0) return { success: true, method: 'install.sh' };
    return {
      success: false,
      error: 'Automatic installation failed. Please install from https://ollama.ai',
    };
  }

  // linux and others
  const script = await runCommand('curl -fsSL https://ollama.ai/install.sh | sh', [], { stdio: 'pipe' });
  if (script.code === 0) return { success: true, method: 'install.sh' };
  return {
    success: false,
    error: 'Automatic installation failed. Please install via your package manager or https://ollama.ai',
  };
}

async function startOllamaService(logger = console) {
  logger.log('[setup-ollama] Starting Ollama service (ollama serve)');
  // Try to ping first
  const ping = await fetchOllama('/api/tags');
  if (ping.ok) return { success: true, alreadyRunning: true };

  const child = spawn('ollama', ['serve'], {
    detached: true,
    stdio: 'ignore',
    shell: true,
  });
  try {
    child.unref();
  } catch {}

  // Wait up to ~15s for service
  const start = Date.now();
  while (Date.now() - start < 15000) {
    await delay(750);
    const check = await fetchOllama('/api/tags');
    if (check.ok) return { success: true, started: true };
  }
  return { success: false, error: 'Timed out waiting for Ollama service to start' };
}

async function installOllamaModels(models, logger = console) {
  const list = Array.isArray(models) && models.length > 0 ? models : DEFAULT_MODELS_ALL;
  const results = [];
  for (const model of list) {
    logger.log(`[setup-ollama] Pulling model: ${model}`);
    const res = await runCommand(`ollama pull ${model}`);
    results.push({ model, success: res.code === 0, stdout: res.stdout, stderr: res.stderr });
  }
  const success = results.every(r => r.success);
  return { success, results };
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

const DEFAULT_MODELS = {
  TEXT: 'llama3.2:latest',
  VISION: 'llava:latest',
  AUDIO: 'dimavz/whisper-tiny:latest',
  EMBEDDINGS: 'mxbai-embed-large',
};
const DEFAULT_MODELS_ALL = [
  DEFAULT_MODELS.TEXT,
  DEFAULT_MODELS.VISION,
  DEFAULT_MODELS.AUDIO,
  DEFAULT_MODELS.EMBEDDINGS,
];

async function fetchOllama(pathname = '/api/tags') {
  const host = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
  try {
    const res = await fetch(host + pathname, { method: 'GET' });
    return { ok: res.ok, status: res.status };
  } catch (e) {
    return { ok: false, error: e?.message };
  }
}

async function mainCLI() {
  const argv = process.argv.slice(2);
  const flags = new Set(argv.filter(a => a.startsWith('--')));

  if (flags.has('--help') || argv.length === 0) {
    console.log(`\nStratoSort Ollama Setup\n\nUsage:\n  node setup-ollama.js --check\n  node setup-ollama.js --install\n  node setup-ollama.js --start\n  node setup-ollama.js --models [comma-separated]\n  node setup-ollama.js --install --start --models\n`);
    process.exit(0);
  }

  const modelsArgIdx = argv.findIndex(a => a === '--models');
  const modelsList = modelsArgIdx !== -1 ? (argv[modelsArgIdx + 1] || '') : '';
  const models = modelsList ? modelsList.split(',').map(s => s.trim()).filter(Boolean) : DEFAULT_MODELS_ALL;

  try {
    if (flags.has('--check')) {
      const status = await checkOllamaInstalled();
      console.log(JSON.stringify(status));
      process.exit(status.installed ? 0 : 1);
    }

    if (flags.has('--install')) {
      const res = await installOllama();
      if (!res.success) {
        console.error(res.error || 'Install failed');
        process.exit(2);
      }
      console.log(`[setup-ollama] Installed via ${res.method}`);
    }

    if (flags.has('--start')) {
      const s = await startOllamaService();
      if (!s.success) {
        console.error(s.error || 'Failed to start ollama');
        process.exit(3);
      }
      console.log('[setup-ollama] Ollama service is running');
    }

    if (flags.has('--models')) {
      const m = await installOllamaModels(models);
      if (!m.success) {
        console.error('Some models failed to install');
        process.exit(4);
      }
      console.log('[setup-ollama] Models installed');
    }

    process.exit(0);
  } catch (e) {
    console.error('[setup-ollama] Error:', e?.message || e);
    process.exit(99);
  }
}

if (require.main === module) {
  mainCLI();
}

module.exports = {
  checkOllamaInstalled,
  installOllama,
  startOllamaService,
  installOllamaModels,
  DEFAULT_MODELS,
  DEFAULT_MODELS_ALL,
};