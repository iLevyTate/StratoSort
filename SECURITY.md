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

## Reporting a Vulnerability

We take security vulnerabilities seriously. If you discover a security issue, please follow these steps:

### How to Report

1. **DO NOT** open a public GitHub issue for security vulnerabilities
2. Send a detailed report to: **security@stratosort.com** (or create a private security advisory)
3. Include the following information:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Any suggested fixes (if you have them)

### Response Timeline

- **Initial response**: Within 48 hours
- **Assessment**: Within 5 business days
- **Fix timeline**: Critical issues within 7 days, others within 30 days
- **Disclosure**: Coordinated disclosure after fix is released

### What to Expect

1. **Acknowledgment**: We'll confirm receipt of your report
2. **Investigation**: Our team will investigate and validate the issue
3. **Fix development**: We'll develop and test a fix
4. **Release**: Security fixes are released as soon as possible
5. **Credit**: We'll acknowledge your contribution (if desired)

### Scope

**In scope:**
- StratoSort desktop application
- File processing and analysis features
- AI integration components
- Configuration and settings management

**Out of scope:**
- Third-party dependencies (report to upstream)
- Operating system vulnerabilities
- Network infrastructure
- Social engineering attacks

### Security Best Practices for Users

To keep your StratoSort installation secure:

1. **Keep updated**: Always use the latest version
2. **Verify signatures**: Check that downloaded binaries are properly signed
3. **Review permissions**: Monitor which directories StratoSort can access
4. **Local processing**: Ensure AI processing stays local (check Ollama configuration)
5. **Regular backups**: Keep backups of your organized files

### Security Testing

Our security testing includes:

- **Static analysis**: Code scanning for vulnerabilities
- **Dynamic testing**: Runtime security testing
- **Penetration testing**: Regular security assessments
- **Dependency audits**: Ongoing vulnerability monitoring
- **Fuzzing**: Input validation testing

### Contact

For general security questions or concerns:
- Email: security@stratosort.com
- Security advisories: GitHub Security tab
- General questions: GitHub Discussions

---

**Note**: This security policy applies to StratoSort v0.1.x and will be updated as the project evolves.