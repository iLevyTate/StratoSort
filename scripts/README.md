# StratoSort Scripts

This directory contains utility scripts that enhance the development workflow.

## 🚀 Scripts Overview

### `pre-pr.js`

**Command:** `npm run pre-pr`

Comprehensive pre-pull request check and fix script. This is the **most important script** to run before creating a PR.

**What it does:**

- ✅ Auto-fixes code formatting and linting issues
- 🔒 Runs security audits and applies fixes
- 📦 Checks dependency health
- 🧪 Runs complete test suite
- 🏗️ Verifies production build works
- 📋 Provides clear next steps

**Usage:**

```bash
npm run pre-pr
# This handles 99% of PR requirements automatically!
```

### `diagnose.js`

**Commands:** `npm run diagnose` or `npm run doctor`

Health check and diagnostic report for the project setup.

**What it checks:**

- ✅ System requirements (Node.js, npm, Git)
- 📁 Project structure and critical files
- 🏗️ Build artifacts status
- 🔒 Security vulnerabilities
- 🤖 Ollama installation and models
- 💾 Disk usage information

**Usage:**

```bash
npm run diagnose
# Shows comprehensive project health report
```

### `setup.js`

**Commands:** `npm run setup` or `npm run bootstrap`

Complete project setup script for new installations or team member onboarding.

**What it does:**

- ✅ Verifies system requirements
- 📦 Installs all dependencies
- 🔧 Sets up development tools (Git hooks, etc.)
- 🤖 Optionally configures Ollama
- 🏗️ Runs initial build
- 🧪 Verifies installation

**Usage:**

```bash
npm run setup
# Perfect for new team members or fresh installations
```

## 🔄 Workflow Integration

### Daily Development

1. Make your changes
2. `npm run pre-pr` ← **Always run this!**
3. Commit and push
4. Create PR

### Troubleshooting Issues

1. `npm run diagnose` - Identify the problem
2. `npm run fix` - Auto-fix common issues
3. `npm run reset` - Nuclear option if needed

### New Team Member

1. Clone repository
2. `npm run setup` - Complete setup
3. `npm start` - Launch the app

## 📁 Script Files

| File          | Purpose        | Key Features                     |
| ------------- | -------------- | -------------------------------- |
| `pre-pr.js`   | PR preparation | Auto-fix, validation, build test |
| `diagnose.js` | Health check   | System check, file verification  |
| `setup.js`    | Project setup  | Complete onboarding automation   |

## 🎯 Best Practices

- **Always run `pre-pr`** before creating pull requests
- Use `diagnose` when something seems broken
- Run `setup` for clean installations
- These scripts are designed to be safe and non-destructive

## 🛠️ Customization

All scripts use standard npm commands and can be safely modified. They're designed to be:

- **Cross-platform** (Windows, macOS, Linux)
- **Safe** (non-destructive operations)
- **Informative** (clear output and error messages)
- **Robust** (graceful error handling)

---

**💡 Pro Tip:** The `pre-pr` script handles 99% of pull request issues automatically - make it part of your workflow!
