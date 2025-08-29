#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔧 Applying critical bug fixes...\n');

// Ensure dist directory exists
const distDir = path.join(__dirname, '../dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
  console.log('✅ Created dist directory');
}

// Copy renderer HTML to dist
const srcHtml = path.join(__dirname, '../src/renderer/index.html');
const distHtml = path.join(distDir, 'index.html');
if (fs.existsSync(srcHtml)) {
  fs.copyFileSync(srcHtml, distHtml);
  console.log('✅ Copied index.html to dist');
}

// Build the app
console.log('\n📦 Building application...');
try {
  execSync('npm run build:dev', { stdio: 'inherit' });
  console.log('✅ Build completed successfully');
} catch (error) {
  console.error('❌ Build failed:', error.message);
  process.exit(1);
}

console.log('\n✨ Fixes applied! Run: npm start');
