#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const chalk = require('chalk');

console.log(chalk.blue.bold('\n🔍 StratoSort Diagnostic Report\n'));
console.log('='.repeat(50));

function checkCommand(command, name) {
  try {
    const result = execSync(command, { encoding: 'utf8', stdio: 'pipe' });
    return { name, status: '✅', version: result.trim() };
  } catch (error) {
    return { name, status: '❌', error: error.message };
  }
}

function checkFile(filePath, description) {
  try {
    const exists = fs.existsSync(filePath);
    const stats = exists ? fs.statSync(filePath) : null;
    return {
      path: filePath,
      description,
      exists,
      size: stats ? stats.size : 0,
      modified: stats ? stats.mtime : null,
    };
  } catch (error) {
    return {
      path: filePath,
      description,
      exists: false,
      error: error.message,
    };
  }
}

function runDiagnostic() {
  console.log(chalk.cyan('🔧 System Requirements'));
  const systemChecks = [
    checkCommand('node --version', 'Node.js'),
    checkCommand('npm --version', 'npm'),
    checkCommand('git --version', 'Git'),
  ];

  systemChecks.forEach((check) => {
    if (check.status === '✅') {
      console.log(
        `   ${check.status} ${check.name}: ${chalk.green(check.version)}`,
      );
    } else {
      console.log(
        `   ${check.status} ${check.name}: ${chalk.red('Not found')}`,
      );
    }
  });

  console.log(chalk.cyan('\n📦 Project Structure'));
  const fileChecks = [
    checkFile('package.json', 'Package configuration'),
    checkFile('tsconfig.json', 'TypeScript configuration'),
    checkFile('webpack.config.js', 'Webpack configuration'),
    checkFile('electron-builder.json', 'Electron Builder configuration'),
    checkFile('src/main/simple-main.js', 'Main process entry'),
    checkFile('src/renderer/index.js', 'Renderer entry'),
    checkFile('src/preload/preload.js', 'Preload script'),
    checkFile('.github/workflows/ci.yml', 'CI workflow'),
  ];

  fileChecks.forEach((check) => {
    const status = check.exists ? '✅' : '❌';
    const sizeInfo = check.exists ? `(${Math.round(check.size / 1024)}KB)` : '';
    console.log(
      `   ${status} ${check.description}: ${check.path} ${chalk.gray(sizeInfo)}`,
    );
  });

  console.log(chalk.cyan('\n🗂️ Build Artifacts'));
  const buildChecks = [
    checkFile('dist/index.html', 'Built HTML'),
    checkFile('dist/renderer.js', 'Built renderer'),
    checkFile('node_modules', 'Dependencies'),
  ];

  buildChecks.forEach((check) => {
    const status = check.exists ? '✅' : '❌';
    console.log(
      `   ${status} ${check.description}: ${check.exists ? 'Present' : 'Missing'}`,
    );
  });

  console.log(chalk.cyan('\n🔒 Security & Quality'));
  try {
    const auditResult = execSync('npm audit --audit-level moderate --json', {
      encoding: 'utf8',
      stdio: 'pipe',
    });
    const audit = JSON.parse(auditResult);
    const vulnCount = audit.metadata?.vulnerabilities?.total || 0;
    const status = vulnCount === 0 ? '✅' : '⚠️';
    console.log(
      `   ${status} Security vulnerabilities: ${vulnCount === 0 ? 'None found' : `${vulnCount} found`}`,
    );
  } catch (error) {
    console.log(`   ❌ Security audit: Failed to run`);
  }

  console.log(chalk.cyan('\n🤖 Ollama Integration'));
  try {
    const ollamaResult = execSync('ollama --version', {
      encoding: 'utf8',
      stdio: 'pipe',
    });
    console.log(`   ✅ Ollama: ${ollamaResult.trim()}`);

    try {
      const modelsResult = execSync('ollama list', {
        encoding: 'utf8',
        stdio: 'pipe',
      });
      const modelCount = modelsResult.split('\n').length - 2; // Subtract header and empty line
      console.log(`   ✅ Models installed: ${modelCount}`);
    } catch (error) {
      console.log(`   ⚠️ Models: Unable to check (Ollama may not be running)`);
    }
  } catch (error) {
    console.log(`   ❌ Ollama: Not installed or not in PATH`);
  }

  console.log(chalk.cyan('\n💾 Disk Usage'));
  try {
    const nodeModulesSize = execSync(
      'du -sh node_modules 2>/dev/null || echo "Unknown"',
      {
        encoding: 'utf8',
        stdio: 'pipe',
        shell: true,
      },
    ).trim();
    console.log(`   📦 node_modules: ${nodeModulesSize}`);
  } catch (error) {
    console.log(`   📦 node_modules: Present`);
  }

  try {
    const distSize = fs.existsSync('dist')
      ? execSync('du -sh dist 2>/dev/null || echo "Unknown"', {
          encoding: 'utf8',
          stdio: 'pipe',
          shell: true,
        }).trim()
      : 'Not built';
    console.log(`   🏗️ dist folder: ${distSize}`);
  } catch (error) {
    console.log(
      `   🏗️ dist folder: ${fs.existsSync('dist') ? 'Present' : 'Not built'}`,
    );
  }

  console.log(chalk.green.bold('\n📋 Quick Actions'));
  console.log('   npm run help         - Show all available commands');
  console.log('   npm run pre-pr       - Complete pre-PR check and fix');
  console.log('   npm run fix          - Auto-fix common issues');
  console.log('   npm run clean        - Clean build artifacts');
  console.log('   npm run reset        - Nuclear reset (clean everything)');

  console.log(chalk.blue.bold('\n✨ Diagnostic complete!'));
}

runDiagnostic();
