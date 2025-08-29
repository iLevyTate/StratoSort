const path = require('path');

/**
 * Basic safe path validation to prevent directory traversal and malformed inputs.
 * Returns true if the inputPath is considered safe; false otherwise.
 */
function isSafePath(inputPath) {
  if (!inputPath) return false;
  if (typeof inputPath !== 'string') return false;

  // Trim whitespace and check for empty string
  const trimmed = inputPath.trim();
  if (!trimmed) return false;

  const normalized = path.normalize(trimmed);

  // Reject any directory traversal attempts
  if (
    normalized.includes('../') ||
    normalized.includes('..\\') ||
    normalized.startsWith('..') ||
    normalized.endsWith('..')
  )
    return false;

  // Reject control characters, null bytes, and other dangerous characters
  if (
    inputPath.includes('\0') ||
    inputPath.includes('\n') ||
    inputPath.includes('\r') ||
    inputPath.includes('\t') ||
    inputPath.includes('|') ||
    inputPath.includes('<') ||
    inputPath.includes('>') ||
    inputPath.includes('"') ||
    inputPath.includes('*') ||
    inputPath.includes('?')
  )
    return false;

  // Reject paths with consecutive slashes or unusual patterns
  if (inputPath.includes('\\\\') || inputPath.includes('//')) return false;

  // Basic length guard
  if (inputPath.length > 4096) return false;

  return true;
}

/**
 * Shell-safe path validation: build on top of isSafePath and block absolute system dirs.
 */
function isShellSafePath(inputPath) {
  if (!isSafePath(inputPath)) return false;
  const lower = inputPath.toLowerCase();
  const sensitivePaths = [
    '/system',
    '/windows',
    '/boot',
    '/etc',
    '/usr',
    '/bin',
    '/sbin',
    'c:\\windows',
    'c:\\system32',
    'c:\\program files',
    'c:\\program files (x86)',
    '/proc',
    '/sys',
    '/dev',
  ];
  return !sensitivePaths.some((s) => lower.includes(s.toLowerCase()));
}

module.exports = { isSafePath, isShellSafePath };
