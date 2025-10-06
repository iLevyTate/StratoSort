# Contributing to StratoSort

Thank you for your interest in contributing! StratoSort is a privacy-first, AI-powered file organization tool built with Rust and Tauri.

---

## 🎯 Current Status

**Backend**: ✅ 100% Complete - Production ready  
**Frontend**: ⚠️ Basic Placeholder - **NEEDS DEVELOPERS**

The Rust backend is fully functional with 119 API commands, 300+ passing tests, and comprehensive documentation. **The main priority is building a proper frontend UI.**

---

## 🚀 Quick Start for Contributors

### Prerequisites

```bash
# Required
- Rust 1.75+ (https://rustup.rs/)
- Git

# Optional (for AI features)
- Ollama (https://ollama.ai/)
- Node.js 18+ (for frontend development)
```

### Clone & Build

```powershell
# Clone repository
git clone https://github.com/iLevyTate/StratoSortRust.git
cd StratoSortRust

# Build backend
cd src-tauri
cargo build --release

# Run application
.\target\release\stratosort-app.exe

# Run tests
cargo test

# Run CLI
.\target\release\stratosort-cli.exe --help
```

---

## 💡 Ways to Contribute

### 🎨 Frontend Development (HIGH PRIORITY)

**Status**: ⚠️ **NEEDED** - This is the main blocker

**What Exists**:
- Basic HTML placeholder at `dist/index.html`
- Shows backend status badges
- Has Tauri API connection example

**What's Needed**:
- Replace with React/Svelte/Vue application
- Build UI for file discovery, analysis, and organization
- Connect to 119 existing backend commands
- Implement real-time progress tracking
- Design settings interface

**Tech Stack Suggestions**:
- **React** + TypeScript + Tailwind CSS
- **Svelte** + TypeScript + Tailwind CSS
- **Vue 3** + TypeScript + Tailwind CSS

**Getting Started**:
1. Read the "Frontend Development Guide" in README.md
2. Review the 119 available commands (documented in README)
3. Check `dist/index.html` for Tauri API usage examples
4. Start with a simple file discovery page

### 🦀 Backend Contributions

**Status**: ✅ Complete, but enhancements welcome

**Areas for Improvement**:
- Performance optimizations
- Additional file type support
- New analysis algorithms
- Enhanced AI prompts
- Plugin system architecture
- REST API layer

### 🧪 Testing

**Current Coverage**: 300+ tests passing

**Areas to Expand**:
- Frontend integration tests (once UI exists)
- End-to-end workflows
- Performance benchmarks
- Cross-platform testing (macOS, Linux)
- Stress testing with large file sets

### 📚 Documentation

**What's Needed**:
- Video tutorials
- Architecture diagrams
- API usage examples
- Frontend integration guides
- Troubleshooting guides

---

## 🏗️ Development Workflow

### 1. Fork & Branch

```bash
# Fork on GitHub, then:
git clone https://github.com/YOUR_USERNAME/StratoSortRust.git
cd StratoSortRust

# Create feature branch
git checkout -b feature/your-feature-name
```

### 2. Make Changes

#### Backend Changes (Rust)

```powershell
cd src-tauri

# Make changes to Rust files
# Add tests in tests/ directory

# Run tests
cargo test

# Check formatting
cargo fmt --check

# Run clippy
cargo clippy -- -D warnings

# Build
cargo build --release
```

#### Frontend Changes

```bash
# Create/modify files in dist/
# Or set up your React/Svelte/Vue project

# Test with live backend
cd src-tauri
cargo tauri dev
```

### 3. Test Thoroughly

```powershell
# Run all tests
cargo test

# Run specific test
cargo test test_name

# Run integration tests
cargo test --test integration_tests

# Test CLI
.\target\release\stratosort-cli.exe analyze test-data/
```

### 4. Commit & Push

```bash
# Stage changes
git add .

# Commit with descriptive message
git commit -m "feat: Add file discovery UI with drag & drop"

# Push to your fork
git push origin feature/your-feature-name
```

### 5. Create Pull Request

1. Go to your fork on GitHub
2. Click "Compare & pull request"
3. Fill out the PR template
4. Reference any related issues
5. Wait for review

---

## 📝 Commit Message Convention

Use conventional commits format:

```
feat: Add new feature
fix: Fix a bug
docs: Update documentation
test: Add or update tests
refactor: Refactor code
style: Format code
perf: Improve performance
chore: Update build config
```

Examples:
```
feat(frontend): Add file discovery page with drag & drop
fix(backend): Resolve race condition in file analysis
docs(readme): Update build instructions
test(ai): Add tests for fallback mode
```

---

## 🧪 Testing Guidelines

### Backend Testing

```rust
// Unit tests in same file
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_feature() {
        // Test code
    }
}

// Integration tests in tests/ directory
#[tokio::test]
async fn test_integration() {
    // Integration test code
}
```

### Frontend Testing

```typescript
// Component tests
describe('FileDiscovery', () => {
  it('should render drag & drop zone', () => {
    // Test code
  });
});

// Integration tests
it('should call backend API on file drop', async () => {
  // Test Tauri command invocation
});
```

---

## 🎨 Code Style

### Rust

```rust
// Follow Rust conventions
// Use cargo fmt
// Pass cargo clippy

// Good
pub async fn analyze_file(path: &Path) -> Result<Analysis> {
    // Implementation
}

// Bad
pub async fn AnalyzeFile(Path: &Path) -> Result<Analysis> { ... }
```

### TypeScript/JavaScript

```typescript
// Use TypeScript
// Follow ESLint rules
// Use Prettier formatting

// Good
export async function analyzeFile(path: string): Promise<Analysis> {
  const result = await invoke('analyze_file', { path });
  return result;
}

// Bad
export async function AnalyzeFile(Path) {
  return await invoke('analyze_file', { path: Path })
}
```

---

## 🔍 Code Review Checklist

Before submitting a PR, ensure:

- [ ] Code compiles without errors
- [ ] All tests pass (`cargo test`)
- [ ] No new clippy warnings (`cargo clippy`)
- [ ] Code is formatted (`cargo fmt`)
- [ ] Documentation is updated
- [ ] Commit messages follow convention
- [ ] PR description explains changes
- [ ] Breaking changes are documented
- [ ] Performance impact is considered

---

## 🐛 Reporting Issues

### Before Reporting

1. Check existing issues
2. Try latest version
3. Verify it's not a configuration issue
4. Review troubleshooting guide in README

### Issue Template

```markdown
**Description**
Clear description of the issue

**Steps to Reproduce**
1. Step one
2. Step two
3. Step three

**Expected Behavior**
What should happen

**Actual Behavior**
What actually happens

**Environment**
- OS: Windows 10 / macOS 14 / Linux
- Rust version: 1.75
- StratoSort version: 0.1.0

**Logs**
Paste relevant logs or error messages

**Screenshots**
If applicable
```

---

## 💬 Communication

- **Issues**: For bugs and feature requests
- **Discussions**: For questions and ideas
- **Pull Requests**: For code contributions
- **Wiki**: For documentation

---

## 📜 License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

## 🙏 Recognition

All contributors will be:
- Listed in CONTRIBUTORS.md
- Mentioned in release notes
- Credited in the application's About page (once UI exists)

---

## 🎯 Priority Areas for New Contributors

### ⭐ High Priority

1. **Frontend Development** - Build the UI (biggest need)
2. **Documentation** - Write guides and tutorials
3. **Testing** - Expand test coverage

### 🌟 Medium Priority

4. **Backend Enhancements** - New features and optimizations
5. **Cross-Platform Testing** - Test on macOS and Linux
6. **Performance** - Optimize for large file sets

### ✨ Low Priority

7. **Packaging** - Create installers
8. **CI/CD** - Improve automation
9. **Localization** - Add language support

---

<div align="center">

## 🚀 Ready to Contribute?

**Frontend developers especially welcome!**

[Fork Repository](https://github.com/iLevyTate/StratoSortRust/fork) | 
[Open Issue](https://github.com/iLevyTate/StratoSortRust/issues/new) | 
[Start Discussion](https://github.com/iLevyTate/StratoSortRust/discussions/new)

</div>

