# 🚀 StratoSort Production Deployment Guide

This guide covers deploying StratoSort to production environments with enterprise-grade reliability, security, and performance.

## 📋 Pre-Deployment Checklist

### ✅ Code Quality
- [ ] All linting rules pass (`npm run lint`)
- [ ] Code formatting is consistent (`npm run format:check`)
- [ ] Test suite passes with >90% coverage (`npm test`)
- [ ] No security vulnerabilities (`npm audit`)
- [ ] Dependencies are up-to-date

### ✅ Configuration
- [ ] Environment variables configured (`.env` from `.env.example`)
- [ ] Ollama service configured and accessible
- [ ] Log directories have proper permissions
- [ ] CSP and security headers configured

### ✅ Infrastructure
- [ ] Target OS requirements met
- [ ] Sufficient disk space (minimum 2GB)
- [ ] Network access to Ollama API
- [ ] User permissions for file operations

## 🔧 Environment Setup

### 1. System Requirements

**Minimum:**
- Node.js 18.x or 20.x
- 4GB RAM
- 2GB disk space
- Ollama service running

**Recommended:**
- Node.js 20.x (LTS)
- 8GB RAM
- 10GB disk space
- SSD storage
- Dedicated GPU (for Ollama)

### 2. Environment Configuration

```bash
# Copy and customize environment
cp .env.example .env

# Key production settings
NODE_ENV=production
LOG_LEVEL=info
ENABLE_AUTO_UPDATE=true
ENABLE_CRASH_REPORTING=true
CSP_ENABLED=true
CONTEXT_ISOLATION=true
```

### 3. Ollama Setup

```bash
# Install Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# Pull required models
ollama pull llama3.2:latest
ollama pull llava:latest
ollama pull dimavz/whisper-tiny:latest

# Start Ollama service
ollama serve
```

## 🏗️ Build Process

### Development Build
```bash
npm install
npm run build:dev
npm run start:dev
```

### Production Build
```bash
# Clean install
npm ci --only=production

# Build application
npm run build

# Run tests
npm test

# Package for distribution
npm run package
```

### Cross-Platform Distribution
```bash
# Build for all platforms
npm run dist:all

# Platform-specific builds
npm run dist:win    # Windows
npm run dist:mac    # macOS
npm run dist:linux  # Linux
```

## 🔐 Security Configuration

### Content Security Policy
```javascript
// Automatically configured based on CSP_ENABLED
const csp = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';"
```

### Process Isolation
- Context isolation: ✅ Enabled
- Node integration: ❌ Disabled in renderer
- Remote module: ❌ Disabled

### File System Security
- Sandboxed file operations
- Path validation and sanitization
- Permission-based access control

## 📊 Performance Optimization

### Memory Management
- **File Processing**: Maximum 3 concurrent files
- **Memory Limit**: 100MB per file
- **Cache Strategy**: Intelligent file caching
- **Garbage Collection**: Automatic cleanup

### Ollama Optimization
- **Connection Pooling**: Persistent connections
- **Timeout Handling**: 30-second timeouts
- **Retry Logic**: 3 retry attempts
- **Model Caching**: Local model storage

### UI Performance
- **React Optimization**: Memoization and virtualization
- **Bundle Splitting**: Code splitting for faster loads
- **Asset Optimization**: Compressed assets and images

## 🔍 Monitoring & Logging

### Application Logs
```
Production Log Locations:
- Windows: %APPDATA%\StratoSort\logs\
- macOS: ~/Library/Logs/StratoSort/
- Linux: ~/.config/StratoSort/logs/
```

### Error Tracking
- Crash reports: Automatic collection (if enabled)
- Error boundaries: React error catching
- Unhandled exceptions: Main process error handling

### Performance Metrics
- File processing times
- Memory usage tracking
- Ollama response times
- UI responsiveness metrics

## 🚀 Deployment Strategies

### Desktop Distribution

#### Option 1: Direct Distribution
```bash
# Build installers
npm run dist:win    # Creates .exe and .msi
npm run dist:mac    # Creates .dmg
npm run dist:linux  # Creates .AppImage and .deb

# Distribute via:
# - Website download
# - GitHub Releases
# - Package managers (Homebrew, Chocolatey, etc.)
```

#### Option 2: Auto-Update
```bash
# Enable auto-updates
ENABLE_AUTO_UPDATE=true

# Configure update server
# - electron-updater compatible
# - Signed releases for security
```

### Enterprise Deployment

#### MSI/PKG Deployment
```bash
# Windows MSI
npm run dist:win
# Outputs: release/build/*.msi

# macOS PKG
npm run dist:mac
# Outputs: release/build/*.pkg
```

#### Configuration Management
- GPO/MDM policy deployment
- Centralized configuration files
- Enterprise license management

## 📋 Production Checklist

### Pre-Launch (T-1 Week)
- [ ] Load testing completed
- [ ] Security audit passed
- [ ] Backup procedures tested
- [ ] Rollback plan prepared
- [ ] Documentation updated

### Launch Day (T-0)
- [ ] Production environment configured
- [ ] Ollama service verified
- [ ] Application deployed and tested
- [ ] Monitoring systems active
- [ ] Support team briefed

### Post-Launch (T+1 Week)
- [ ] Performance metrics reviewed
- [ ] Error rates within acceptable limits
- [ ] User feedback collected
- [ ] Auto-update system verified
- [ ] Backup procedures confirmed

## 🔧 Troubleshooting

### Common Issues

#### Ollama Connection Failed
```bash
# Check Ollama service
curl http://localhost:11434/api/version

# Restart Ollama
ollama serve

# Verify models
ollama list
```

#### File Processing Errors
```bash
# Check permissions
ls -la /path/to/documents

# Verify disk space
df -h

# Check logs
tail -f ~/.config/StratoSort/logs/main.log
```

#### Performance Issues
```bash
# Monitor resource usage
top -p $(pgrep -f stratosort)

# Check Ollama performance
nvidia-smi  # For GPU usage

# Review logs for bottlenecks
grep "SLOW" ~/.config/StratoSort/logs/performance.log
```

### Support Resources
- GitHub Issues: [Report bugs](https://github.com/stratosort/stratosort/issues)
- Documentation: [Full docs](https://stratosort.com/docs)
- Community: [Discord support](https://discord.gg/stratosort)

## 🔄 Maintenance

### Regular Tasks (Weekly)
- [ ] Check for security updates
- [ ] Review error logs
- [ ] Monitor disk usage
- [ ] Verify backup integrity

### Periodic Tasks (Monthly)
- [ ] Update dependencies
- [ ] Performance review
- [ ] Security audit
- [ ] User feedback analysis

---

**Need Help?** Contact the StratoSort team at [support@stratosort.com](mailto:support@stratosort.com)