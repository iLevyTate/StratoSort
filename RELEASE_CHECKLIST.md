# 📋 StratoSort Release Checklist

Use this checklist when preparing a new release of StratoSort.

## Pre-Release

### Code Quality

- [ ] All tests passing (`npm test`)
- [ ] No linting errors (`npm run lint`)
- [ ] Code formatted (`npm run format`)
- [ ] No console.log statements in production code

### Documentation

- [ ] README.md updated with new features
- [ ] QUICK_START.md reflects current UI
- [ ] OLLAMA_SETUP_GUIDE.md is accurate
- [ ] Version number updated in package.json

### Testing

- [ ] Fresh install tested on clean Windows machine
- [ ] Ollama auto-setup verified
- [ ] File organization tested with real files
- [ ] Undo/redo functionality verified
- [ ] Settings persistence checked

## Build Process

### 1. Update Version

```bash
# Update version in package.json
npm version patch  # or minor/major
```

### 2. Build Installers

#### Windows

```bash
# Option 1: Use build script
./BUILD_INSTALLER.bat

# Option 2: Manual build
npm run build
npm run dist:win
```

#### macOS

```bash
npm run build
npm run dist:mac
```

#### Linux

```bash
npm run build
npm run dist:linux
```

### 3. Verify Installers

- [ ] Windows installer runs without admin rights
- [ ] Ollama setup prompt appears for new users
- [ ] Application launches after installation
- [ ] Shortcuts created correctly
- [ ] Uninstaller removes all components

## Release

### GitHub Release

1. Go to [Releases](https://github.com/stratosort/stratosort/releases)
2. Click "Draft a new release"
3. Create tag: `v1.0.0` (match package.json version)
4. Title: `StratoSort v1.0.0 - [Feature Name]`
5. Upload installers:
   - `StratoSort-Setup-1.0.0.exe` (Windows)
   - `StratoSort-1.0.0.dmg` (macOS)
   - `StratoSort-1.0.0.AppImage` (Linux)

### Release Notes Template

```markdown
## 🎉 StratoSort v1.0.0

### ✨ What's New

- Feature 1: Description
- Feature 2: Description

### 🐛 Bug Fixes

- Fixed issue with...
- Resolved problem where...

### 💪 Improvements

- Enhanced performance of...
- Better handling of...

### 📦 Installation

**Windows**: Download `StratoSort-Setup-1.0.0.exe` and run the installer
**macOS**: Download `StratoSort-1.0.0.dmg` and drag to Applications
**Linux**: Download `StratoSort-1.0.0.AppImage`, make executable, and run

### 🚀 First Time Setup

The installer will automatically:

1. Check for Ollama AI engine
2. Offer to install if missing
3. Download required AI models (~6GB, one-time)

### 📚 Documentation

- [Quick Start Guide](QUICK_START.md)
- [Full Documentation](README.md)
- [Ollama Setup](OLLAMA_SETUP_GUIDE.md)
```

## Post-Release

### Verification

- [ ] Download installer from GitHub (not local file)
- [ ] Clean install on test machine
- [ ] Verify auto-update notification (if applicable)

### Communication

- [ ] Update website (if exists)
- [ ] Post on social media
- [ ] Notify beta testers
- [ ] Update any external documentation

### Monitoring

- [ ] Check GitHub Issues for installation problems
- [ ] Monitor crash reports (if telemetry enabled)
- [ ] Respond to user feedback

## Rollback Plan

If critical issues found:

1. Mark release as pre-release on GitHub
2. Fix issues in hotfix branch
3. Rebuild with patch version bump
4. Re-test thoroughly
5. Upload fixed installers
6. Update release notes with fix information

## Version Numbering

Follow Semantic Versioning:

- **Major** (1.0.0 → 2.0.0): Breaking changes
- **Minor** (1.0.0 → 1.1.0): New features
- **Patch** (1.0.0 → 1.0.1): Bug fixes

## Automated Release (Future)

Consider setting up GitHub Actions:

```yaml
# .github/workflows/release.yml
name: Release
on:
  push:
    tags:
      - 'v*'
jobs:
  build:
    # Auto-build and upload installers
```

---

**Remember**: Always test the installer on a clean machine before releasing!
