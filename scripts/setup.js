#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const chalk = require('chalk');

console.log(chalk.blue.bold('\n🚀 StratoSort Project Setup\n'));
console.log('='.repeat(50));

const steps = [
  {
    name: '🔍 System Requirements Check',
    action: checkSystemRequirements,
  },
  {
    name: '📦 Install Dependencies',
    action: installDependencies,
  },
  {
    name: '🔧 Setup Development Tools',
    action: setupDevTools,
  },
  {
    name: '🤖 Ollama Setup (Optional)',
    action: setupOllama,
    optional: true,
  },
  {
    name: '🏗️ Initial Build',
    action: initialBuild,
  },
  {
    name: '🧪 Verify Installation',
    action: verifyInstallation,
  },
];

function runCommand(command, options = {}) {
  try {
    const result = execSync(command, {
      encoding: 'utf8',
      stdio: options.silent ? 'pipe' : 'inherit',
      ...options,
    });
    return { success: true, output: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function checkSystemRequirements() {
  console.log('   Checking Node.js...');
  const nodeCheck = runCommand('node --version', { silent: true });
  if (!nodeCheck.success) {
    throw new Error(
      'Node.js is not installed. Please install Node.js 18+ from https://nodejs.org',
    );
  }

  const nodeVersion = nodeCheck.output.trim().replace('v', '');
  const majorVersion = parseInt(nodeVersion.split('.')[0]);
  if (majorVersion < 18) {
    throw new Error(
      `Node.js ${majorVersion} is too old. Please upgrade to Node.js 18+`,
    );
  }
  console.log(chalk.green(`   ✓ Node.js ${nodeVersion} (compatible)`));

  console.log('   Checking npm...');
  const npmCheck = runCommand('npm --version', { silent: true });
  if (!npmCheck.success) {
    throw new Error('npm is not available');
  }
  console.log(chalk.green(`   ✓ npm ${npmCheck.output.trim()}`));

  console.log('   Checking Git...');
  const gitCheck = runCommand('git --version', { silent: true });
  if (!gitCheck.success) {
    console.log(chalk.yellow('   ⚠️ Git not found (optional for basic usage)'));
  } else {
    console.log(chalk.green(`   ✓ ${gitCheck.output.trim()}`));
  }
}

function installDependencies() {
  console.log('   Installing project dependencies...');
  const result = runCommand('npm ci');
  if (!result.success) {
    console.log(chalk.yellow('   npm ci failed, trying npm install...'));
    const fallback = runCommand('npm install');
    if (!fallback.success) {
      throw new Error('Failed to install dependencies');
    }
  }
  console.log(chalk.green('   ✓ Dependencies installed'));
}

function setupDevTools() {
  console.log('   Setting up Git hooks...');
  const huskyResult = runCommand('npm run prepare', { silent: true });
  if (huskyResult.success) {
    console.log(chalk.green('   ✓ Git hooks configured'));
  } else {
    console.log(chalk.yellow('   ⚠️ Git hooks setup failed (continuing...)'));
  }

  console.log('   Creating necessary directories...');
  const dirs = ['scripts', 'logs', 'release'];
  dirs.forEach((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(chalk.gray(`   Created ${dir}/`));
    }
  });
  console.log(chalk.green('   ✓ Directory structure verified'));
}

async function setupOllama() {
  console.log('   Checking Ollama installation...');
  const ollamaCheck = runCommand('ollama --version', { silent: true });

  if (!ollamaCheck.success) {
    console.log(chalk.yellow('   ⚠️ Ollama not found'));
    console.log('   📥 To install Ollama:');
    console.log('      • Visit: https://ollama.ai');
    console.log('      • Or run: npm run setup:ollama');
    console.log('   ℹ️ StratoSort works without Ollama (limited AI features)');
    return;
  }

  console.log(chalk.green(`   ✓ ${ollamaCheck.output.trim()}`));

  console.log('   Checking Ollama service...');
  const serviceCheck = runCommand('ollama list', { silent: true });
  if (!serviceCheck.success) {
    console.log(chalk.yellow('   ⚠️ Ollama service not running'));
    console.log('   💡 Start with: ollama serve');
    return;
  }

  const models = serviceCheck.output
    .split('\n')
    .filter(
      (line) => line.trim() && !line.includes('NAME') && !line.includes('---'),
    );

  if (models.length === 0) {
    console.log(chalk.yellow('   ⚠️ No Ollama models installed'));
    console.log('   💡 Install models with: npm run setup:ollama');
  } else {
    console.log(chalk.green(`   ✓ ${models.length} model(s) available`));
  }
}

function initialBuild() {
  console.log('   Building project for the first time...');
  const result = runCommand('npm run build:dev');
  if (!result.success) {
    throw new Error('Initial build failed');
  }
  console.log(chalk.green('   ✓ Initial build complete'));
}

function verifyInstallation() {
  console.log('   Running installation verification...');

  // Check critical files
  const criticalFiles = ['dist/index.html', 'dist/renderer.js'];

  for (const file of criticalFiles) {
    if (!fs.existsSync(file)) {
      throw new Error(`Missing critical file: ${file}`);
    }
  }

  console.log('   Running quick tests...');
  const testResult = runCommand('npm run test:quick', { silent: true });
  if (!testResult.success) {
    console.log(chalk.yellow('   ⚠️ Some tests failed (check with: npm test)'));
  } else {
    console.log(chalk.green('   ✓ Basic tests passed'));
  }

  console.log(chalk.green('   ✓ Installation verified'));
}

async function runSetup() {
  let completedSteps = 0;

  try {
    for (const step of steps) {
      console.log(
        chalk.cyan(`\n[${completedSteps + 1}/${steps.length}] ${step.name}`),
      );

      if (step.optional) {
        try {
          await step.action();
        } catch (error) {
          console.log(
            chalk.yellow(`   ⚠️ Optional step failed: ${error.message}`),
          );
        }
      } else {
        await step.action();
      }

      completedSteps++;
      console.log(chalk.green('   ✓ Complete'));
    }

    console.log(chalk.green.bold('\n🎉 Setup completed successfully!'));
    console.log(chalk.blue.bold('\n🚀 Next Steps:'));
    console.log('   1. npm start                    - Launch the app');
    console.log('   2. npm run help                 - See all commands');
    console.log(
      '   3. npm run setup:ollama         - Setup AI models (optional)',
    );
    console.log(
      '   4. npm run diagnose             - Run health check anytime',
    );

    console.log(chalk.green.bold('\n✨ Happy coding with StratoSort!'));
  } catch (error) {
    console.log(
      chalk.red.bold(`\n❌ Setup failed at step ${completedSteps + 1}`),
    );
    console.log(chalk.red(`Error: ${error.message}`));
    console.log(chalk.yellow('\n🔧 Try these troubleshooting steps:'));
    console.log('   • npm run clean && npm install    - Clean and reinstall');
    console.log('   • npm run diagnose                - Run diagnostic');
    console.log('   • npm run reset                   - Nuclear option');

    process.exit(1);
  }
}

runSetup().catch(console.error);
