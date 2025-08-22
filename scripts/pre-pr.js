#!/usr/bin/env node

const { execSync } = require('child_process');
const chalk = require('chalk');

console.log(chalk.blue.bold('\n🚀 StratoSort Pre-PR Check & Fix\n'));
console.log('='.repeat(50));

const steps = [
  {
    name: '🔧 Auto-fixing code issues',
    commands: ['npm run lint:fix', 'npm run format'],
  },
  {
    name: '🔒 Security audit & fixes',
    commands: ['npm run security:fix'],
    allowFailure: true,
  },
  {
    name: '📦 Dependency health check',
    commands: ['npm run deps:check'],
    allowFailure: true,
  },
  {
    name: '✅ Code quality validation',
    commands: ['npm run lint', 'npm run format:check', 'npm run typecheck'],
  },
  {
    name: '🧪 Test suite',
    commands: ['npm test'],
  },
  {
    name: '🏗️ Production build test',
    commands: ['npm run build'],
  },
];

const totalSteps = steps.length;
let currentStep = 0;
let hasWarnings = false;

function runCommand(command, allowFailure = false) {
  try {
    console.log(chalk.gray(`   → ${command}`));
    execSync(command, {
      stdio: allowFailure ? 'pipe' : 'inherit',
      cwd: process.cwd(),
    });
    return true;
  } catch (error) {
    if (allowFailure) {
      console.log(
        chalk.yellow(`   ⚠️ Warning: ${command} had issues (non-critical)`),
      );
      hasWarnings = true;
      return false;
    } else {
      console.log(chalk.red(`   ❌ Failed: ${command}`));
      console.log(chalk.red(`   Error: ${error.message}`));
      throw error;
    }
  }
}

function runStep(step) {
  currentStep++;
  console.log(chalk.cyan(`\n[${currentStep}/${totalSteps}] ${step.name}`));

  for (const command of step.commands) {
    runCommand(command, step.allowFailure);
  }

  console.log(chalk.green('   ✓ Complete'));
}

async function main() {
  try {
    for (const step of steps) {
      runStep(step);
    }

    console.log(chalk.green.bold('\n🎉 Pre-PR checks completed successfully!'));

    if (hasWarnings) {
      console.log(
        chalk.yellow('\n⚠️ Some warnings were found but are non-critical.'),
      );
      console.log(
        chalk.yellow(
          '   Review the output above and consider addressing them.',
        ),
      );
    }

    console.log(chalk.blue.bold('\n📋 Next Steps:'));
    console.log('   1. Review any changes made by auto-fixes');
    console.log('   2. git add . && git commit -m "your commit message"');
    console.log('   3. git push');
    console.log('   4. Create your pull request');

    console.log(chalk.green.bold('\n✅ Your code is ready for PR!'));
  } catch (error) {
    console.log(chalk.red.bold('\n❌ Pre-PR checks failed!'));
    console.log(chalk.red('\n🔧 Quick fixes to try:'));
    console.log('   • npm run fix          - Auto-fix common issues');
    console.log('   • npm run clean        - Clear build cache');
    console.log('   • npm run reset        - Nuclear option: clean all deps');
    console.log('   • npm run help         - See all available commands');

    console.log(
      chalk.red.bold('\n💡 Manual review needed before creating PR.'),
    );
    process.exit(1);
  }
}

main().catch(console.error);
