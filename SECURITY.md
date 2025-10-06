# Security Policy

This document describes security measures for the StratoSort backend. The backend is production-ready and has passed all security tests. No frontend exists yet.

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |
| < 0.1   | :x:                |

## Security Measures

StratoSort implements comprehensive security measures to protect your data and privacy:

### Data Protection
- **Local-first processing**: All AI analysis happens locally using Ollama - no data leaves your machine
- **File system isolation**: Limited access to specific user directories only (Documents, Pictures, Desktop, Videos, Music)
- **Restricted permissions**: Explicit deny rules for sensitive directories (.ssh, .gnupg, .config, hidden files)

### Application Security
- **Content Security Policy (CSP)**: Strict CSP rules prevent XSS and code injection attacks
- **Input validation**: All user inputs and file paths are validated and sanitized
- **Secure communication**: All Tauri IPC communications use type-safe interfaces
- **Memory safety**: Rust backend provides memory safety guarantees

### Development Security
- **Signing keys**: Application binaries are signed with secure keys (not stored in repository)
- **Dependency scanning**: Regular security audits of dependencies
- **Test coverage**: Comprehensive security test suite including:
  - XSS prevention testing
  - Input validation testing
  - File system access testing
  - Event system security testing
  - Rate limiting testing
