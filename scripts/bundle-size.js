#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const BUNDLE_SIZE_LIMIT_MB = 1.8;
const RENDERER_BUNDLE_PATH = path.join(__dirname, '../dist/renderer.js');

function getFileSizeMB(filePath) {
  try {
    const stats = fs.statSync(filePath);
    return stats.size / (1024 * 1024);
  } catch (error) {
    console.error(`❌ Could not read bundle file: ${filePath}`);
    process.exit(1);
  }
}

function main() {
  console.log('📦 Checking bundle size...');
  
  if (!fs.existsSync(RENDERER_BUNDLE_PATH)) {
    console.error(`❌ Bundle not found: ${RENDERER_BUNDLE_PATH}`);
    console.error('   Run `npm run build:dev` first');
    process.exit(1);
  }
  
  const bundleSizeMB = getFileSizeMB(RENDERER_BUNDLE_PATH);
  
  console.log(`📊 Current bundle size: ${bundleSizeMB.toFixed(2)} MB`);
  console.log(`🎯 Size limit: ${BUNDLE_SIZE_LIMIT_MB} MB`);
  
  if (bundleSizeMB > BUNDLE_SIZE_LIMIT_MB) {
    console.error('❌ Bundle size exceeds limit!');
    console.error(`   Current: ${bundleSizeMB.toFixed(2)} MB`);
    console.error(`   Limit: ${BUNDLE_SIZE_LIMIT_MB} MB`);
    console.error(`   Overage: +${(bundleSizeMB - BUNDLE_SIZE_LIMIT_MB).toFixed(2)} MB`);
    process.exit(1);
  }
  
  console.log('✅ Bundle size within limits');
  
  // Write size to snapshot file for tracking
  const snapshotPath = path.join(__dirname, '../.bundle-size-snapshot');
  const snapshot = {
    size: bundleSizeMB,
    timestamp: new Date().toISOString(),
    limit: BUNDLE_SIZE_LIMIT_MB
  };
  
  fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));
  console.log('📸 Snapshot saved to .bundle-size-snapshot');
}

if (require.main === module) {
  main();
}

module.exports = { getFileSizeMB, BUNDLE_SIZE_LIMIT_MB }; 