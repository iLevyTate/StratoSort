# 🔧 CI/CD Build Guide for StratoSort

## Overview

This guide explains how StratoSort's continuous integration and deployment works, particularly for building release installers.

## GitHub Actions Workflows

### Main Release Workflow (`.github/workflows/release.yml`)

Triggers on:

- Git tags matching `v*.*.*` (e.g., `v1.0.0`)
- Manual workflow dispatch

Builds for:

- Windows (NSIS installer + portable)
- macOS (DMG + ZIP)
- Linux (AppImage + DEB)

### Key Features

1. **Multi-Platform Support**: Builds on Windows, macOS, and Linux runners
2. **Automatic Ollama Skip**: CI environment is detected, Ollama setup is skipped
3. **Artifact Upload**: All installers uploaded as GitHub Release assets
4. **Draft Releases**: Option to create draft releases for review

## CI Environment Handling

### Ollama Setup Skip

The `setup-ollama.js` script automatically detects CI environments and skips:

```javascript
// Detected CI environment variables:
- CI=true
- GITHUB_ACTIONS=true
- CONTINUOUS_INTEGRATION=true
```

### Package Installation

In CI, use `npm ci` instead of `npm install`:

- Faster installation
- Uses `package-lock.json` exactly
- Skips Ollama setup automatically

## Building Releases

### Local Build

```bash
# Windows
npm run dist:win

# macOS
npm run dist:mac

# Linux
npm run dist:linux
```

### CI Build (GitHub Actions)

1. **Create a Git Tag**:

```bash
git tag v1.0.0
git push origin v1.0.0
```

2. **Automatic Build**:
   - GitHub Actions triggers on tag push
   - Builds all platforms in parallel
   - Creates GitHub Release with all installers

3. **Manual Trigger**:
   - Go to Actions tab in GitHub
   - Select "Build and Release" workflow
   - Click "Run workflow"

## Handling Build Warnings

### Common Warnings (Safe to Ignore)

1. **Node Version Mismatch**:

```
npm warn EBADENGINE Unsupported engine
```

Solution: Project works with Node 18+, warning about Node 22 requirement is from optional dependency

2. **Deprecated Packages**:

```
npm warn deprecated [package]
```

These are from dependencies and don't affect functionality

### Build Failures

If builds fail in CI:

1. **Check Environment Variables**:

```yaml
env:
  CI: true
  GITHUB_ACTIONS: true
```

2. **Verify Ollama Skip**:
   Look for: `CI environment detected - skipping Ollama setup`

3. **Node Version**:
   Ensure using Node 18+ (20 recommended)

## Release Process

### Step-by-Step Release

1. **Update Version**:

```bash
npm version patch  # or minor/major
```

2. **Commit Changes**:

```bash
git add .
git commit -m "Release v1.0.0"
```

3. **Create Tag**:

```bash
git tag v1.0.0
```

4. **Push to GitHub**:

```bash
git push origin main
git push origin v1.0.0
```

5. **Monitor Build**:

- Go to Actions tab
- Watch build progress
- Check for errors

6. **Review Release**:

- Go to Releases page
- Edit release notes if needed
- Publish when ready

## Troubleshooting

### Build Fails on npm install

**Problem**: Ollama setup runs in CI
**Solution**: Ensure CI environment variable is set:

```yaml
env:
  CI: true
```

### Missing Artifacts

**Problem**: Installers not uploaded
**Solution**: Check artifact paths in workflow:

```yaml
path: |
  release/build/*.exe
  release/build/*.dmg
  release/build/*.AppImage
```

### Release Not Created

**Problem**: Tag pushed but no release
**Solution**:

- Verify tag format matches `v*.*.*`
- Check GitHub Actions permissions
- Ensure GITHUB_TOKEN is available

## Local Testing of CI Build

Test the CI build locally:

```bash
# Set CI environment
export CI=true

# Clean install
rm -rf node_modules
npm ci

# Build
npm run build
npm run dist:win
```

## Best Practices

1. **Always Test Locally First**: Build locally before pushing tags
2. **Use Semantic Versioning**: Follow v{major}.{minor}.{patch}
3. **Draft Releases**: Create as draft first, review, then publish
4. **Include Release Notes**: Document changes clearly
5. **Test Installers**: Download and test installers from release

## Security

- **Code Signing**: Not currently implemented (future enhancement)
- **Checksums**: GitHub automatically provides file hashes
- **Private Keys**: Never commit signing certificates

## Future Improvements

- [ ] Automatic code signing for Windows/macOS
- [ ] Automatic update system
- [ ] Beta/stable release channels
- [ ] Installer size optimization
- [ ] Cross-platform testing automation

---

## Quick Reference

### Create Release

```bash
npm version patch
git push origin main
git tag v1.0.1
git push origin v1.0.1
```

### Check CI Build

```bash
# Set CI mode
export CI=true
npm ci
npm run build
```

### Manual Workflow Trigger

1. GitHub → Actions → Build and Release
2. Run workflow → Select branch
3. Optional: Set as draft release

---

**Note**: The CI/CD system is designed to work without manual intervention. If you encounter issues, check the logs in GitHub Actions for detailed error messages.
