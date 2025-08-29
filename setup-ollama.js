#!/usr/bin/env node
'use strict';

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

const OLLAMA_HOST = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
const RECOMMENDED_MODELS = [
  'llama3.2:latest',
  'llava:latest',
  'mxbai-embed-large:latest',
];

function printStatus(ok, label, details) {
  const icon = ok ? chalk.green('✓') : chalk.red('✗');
  console.log(`${icon} ${label}${details ? chalk.gray(` — ${details}`) : ''}`);
}

function runCommand(cmd, args = [], options = {}) {
  try {
    return spawn(cmd, args, { stdio: 'inherit', ...options });
  } catch (error) {
    console.error(chalk.red(`Failed to run ${cmd}:`), error.message);
    return null;
  }
}

function checkOllamaInstallation() {
  try {
    const result = execSync('ollama --version', { encoding: 'utf8' });
    return result.trim();
  } catch (error) {
    return null;
  }
}

function checkOllamaServer() {
  try {
    execSync(`curl -s -o /dev/null -w "%{http_code}" ${OLLAMA_HOST}/api/tags`, {
      encoding: 'utf8',
    });
    return true;
  } catch (error) {
    return false;
  }
}

function getInstalledModels() {
  try {
    const result = execSync('ollama list', { encoding: 'utf8' });
    const lines = result.trim().split('\n').slice(1); // Skip header
    return lines
      .map((line) => {
        const parts = line.trim().split(/\s+/);
        return parts[0];
      })
      .filter((name) => name && name !== 'NAME');
  } catch (error) {
    return [];
  }
}

function startOllamaServer() {
  console.log(chalk.cyan('\n🚀 Starting Ollama server...'));

  const ollamaProcess = runCommand('ollama', ['serve']);
  if (ollamaProcess) {
    console.log(chalk.green('✓ Ollama server started'));
    console.log(chalk.gray('Server running at:'), OLLAMA_HOST);
    console.log(chalk.gray('Press Ctrl+C to stop the server'));

    // Keep the process running
    process.on('SIGINT', () => {
      console.log(chalk.yellow('\n🛑 Stopping Ollama server...'));
      ollamaProcess.kill();
      process.exit(0);
    });
  }
}

function checkMode() {
  console.log(chalk.cyan.bold('\n🔍 Ollama Status Check'));
  console.log('='.repeat(50));

  // Check installation
  const version = checkOllamaInstallation();
  printStatus(!!version, 'Ollama installed', version || 'Not found');

  if (!version) {
    console.log(chalk.red('\n❌ Ollama is not installed.'));
    console.log(chalk.yellow('Please install Ollama from: https://ollama.ai'));
    return;
  }

  // Check server
  const serverRunning = checkOllamaServer();
  printStatus(
    serverRunning,
    'Ollama server running',
    serverRunning ? OLLAMA_HOST : 'Server not responding',
  );

  // Check models
  const installedModels = getInstalledModels();
  console.log(chalk.blue(`\n📦 Installed models: ${installedModels.length}`));
  if (installedModels.length > 0) {
    installedModels.forEach((model) => {
      console.log(chalk.gray(`   • ${model}`));
    });
  }

  // Check recommended models
  console.log(chalk.blue(`\n🎯 Recommended models:`));
  RECOMMENDED_MODELS.forEach((model) => {
    const installed = installedModels.includes(model);
    const status = installed ? chalk.green('✓') : chalk.gray('○');
    console.log(`${status} ${model}`);
  });

  if (!serverRunning) {
    console.log(
      chalk.yellow('\n💡 Tip: Run "npm run start:ollama" to start the server'),
    );
  }
}

function setupMode() {
  console.log(chalk.cyan.bold('\n⚙️ Ollama Setup'));
  console.log('='.repeat(50));

  // Check installation
  const version = checkOllamaInstallation();
  if (!version) {
    console.log(chalk.red('❌ Ollama is not installed.'));
    console.log(chalk.yellow('Please install Ollama from: https://ollama.ai'));
    return;
  }

  console.log(chalk.green('✓ Ollama installed:'), version);

  // Check server
  const serverRunning = checkOllamaServer();
  printStatus(
    serverRunning,
    'Server running',
    serverRunning ? 'Ready' : 'Starting...',
  );

  if (!serverRunning) {
    console.log(chalk.yellow('🚀 Starting Ollama server...'));
    const serverProcess = spawn('ollama', ['serve'], {
      detached: true,
      stdio: 'ignore',
    });
    serverProcess.unref();

    // Wait a bit for server to start
    console.log(chalk.gray('Waiting for server to start...'));
    setTimeout(() => {
      const nowRunning = checkOllamaServer();
      printStatus(
        nowRunning,
        'Server started',
        nowRunning ? 'Ready' : 'Failed to start',
      );
    }, 3000);
  }

  // Check and install models
  const installedModels = getInstalledModels();
  console.log(chalk.blue(`\n📦 Checking recommended models...`));

  for (const model of RECOMMENDED_MODELS) {
    const installed = installedModels.includes(model);
    if (installed) {
      printStatus(true, `${model}`, 'Already installed');
    } else {
      console.log(chalk.yellow(`📥 Installing ${model}...`));
      try {
        execSync(`ollama pull ${model}`, { stdio: 'inherit' });
        printStatus(true, `${model}`, 'Installed successfully');
      } catch (error) {
        printStatus(false, `${model}`, 'Failed to install');
      }
    }
  }

  console.log(chalk.green('\n✅ Setup complete!'));
}

// Main execution
function main() {
  const args = process.argv.slice(2);
  const mode = args[0];

  switch (mode) {
    case '--check':
      checkMode();
      break;
    case '--start':
      startOllamaServer();
      break;
    default:
      setupMode();
      break;
  }
}

main();
