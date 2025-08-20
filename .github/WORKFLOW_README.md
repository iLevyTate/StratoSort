# GitHub Actions Configuration

## Overview

This repository is configured with automated dependency updates and release builds.

## Workflows

### 1. Dependabot Configuration (`.github/dependabot.yml`)

- **Automatically creates PRs** for dependency updates daily
- Groups minor and patch updates together
- Labels PRs with `dependencies` and `automerge`

### 2. Dependabot Auto-merge (`.github/workflows/dependabot-automerge.yml`)

- **Automatically merges** safe dependency updates
- Enables auto-merge for all Dependabot PRs
- Immediately merges patch and minor updates if checks pass
- Major updates wait for manual review

**Optional Setup**: If your repository has branch protection requiring PR approval:

1. Create a Personal Access Token (PAT) with `repo` scope
2. Add it as a repository secret named `DEPENDABOT_PAT`
3. Uncomment the auto-approve step in the workflow

### 3. Release Builds (`.github/workflows/release.yml`)

#### Automatic Releases

- **Triggers on version tags** (e.g., `v1.0.0`, `v2.1.3`)
- Automatically builds Windows installer
- Publishes to GitHub Releases

To create a release:

```bash
git tag v1.0.0
git push origin v1.0.0
```

#### Manual Builds

- Go to Actions → "Build and Release" → Run workflow
- Select platform: `windows`, `macos`, `linux`, or `all`
- Artifacts are uploaded to the workflow run

## Build Outputs

### Windows

- **NSIS Installer**: `StratoSort-<version>-win-x64.exe`
- **Portable**: `StratoSort-<version>-win-x64.portable.exe`

### macOS (manual only)

- **DMG**: `StratoSort-<version>-mac-<arch>.dmg`
- **ZIP**: `StratoSort-<version>-mac-<arch>.zip`

### Linux (manual only)

- **AppImage**: `StratoSort-<version>-linux-x64.AppImage`
- **DEB**: `StratoSort-<version>-linux-x64.deb`

## Configuration Files

### `electron-builder.json`

- Configures build outputs and installer settings
- Publishes to GitHub when `GH_TOKEN` is available
- Clean artifact naming: `StratoSort-${version}-${os}-${arch}.${ext}`

## Required Secrets

### Built-in (no setup needed)

- `GITHUB_TOKEN`: Automatically provided by GitHub Actions

### Optional

- `DEPENDABOT_PAT`: Personal Access Token for auto-approving PRs (only if branch protection requires reviews)

## Testing Locally

### Build Windows installer:

```bash
npm run dist:win
```

### Build without packaging (faster):

```bash
npx electron-builder --win --dir
```

Output location: `release/build/`

## Troubleshooting

### Dependabot PRs not auto-merging

1. Check if branch protection requires reviews
2. If yes, add `DEPENDABOT_PAT` secret
3. Ensure required status checks are passing

### Release not publishing

1. Ensure tag follows format `v*.*.*`
2. Check Actions tab for build errors
3. Verify `GH_TOKEN` is available (automatic in Actions)

### Build errors

1. Run `npm ci` to ensure clean dependencies
2. Run `npm run build` before electron-builder
3. Check `release/build/` for partial outputs
