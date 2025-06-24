#!/usr/bin/env node

/**
 * StratoSort Performance Mode Controller
 * Easily toggle performance monitoring features for debugging vs energy efficiency
 */

const fs = require('fs');
const path = require('path');

const modes = {
  'energy-efficient': {
    description: 'Minimal monitoring for best battery life',
    env: {
      NODE_ENV: 'production',
      ENABLE_SYSTEM_MONITORING: 'false',
      ENABLE_PERFORMANCE_MONITORING: 'false'
    }
  },
  'balanced': {
    description: 'Light monitoring for development',
    env: {
      NODE_ENV: 'development',
      ENABLE_SYSTEM_MONITORING: 'false',
      ENABLE_PERFORMANCE_MONITORING: 'false'
    }
  },
  'debug': {
    description: 'Full monitoring for debugging issues',
    env: {
      NODE_ENV: 'development',
      ENABLE_SYSTEM_MONITORING: 'true',
      ENABLE_PERFORMANCE_MONITORING: 'true'
    }
  }
};

function setPerformanceMode(mode) {
  if (!modes[mode]) {
    console.error(`❌ Unknown mode: ${mode}`);
    console.log('Available modes:', Object.keys(modes).join(', '));
    process.exit(1);
  }

  const envFile = path.join(__dirname, '../.env');
  const config = modes[mode];

  console.log(`🔧 Setting performance mode to: ${mode}`);
  console.log(`   ${config.description}`);
  
  const envContent = Object.entries(config.env)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n') + '\n';

  fs.writeFileSync(envFile, envContent);
  console.log('✅ Performance mode updated');
  console.log('📝 Restart the application for changes to take effect');
}

function showCurrentMode() {
  try {
    const envFile = path.join(__dirname, '../.env');
    const content = fs.readFileSync(envFile, 'utf8');
    console.log('Current .env settings:');
    console.log(content);
  } catch (error) {
    console.log('No .env file found');
  }
}

// Command line interface
const command = process.argv[2];
const mode = process.argv[3];

switch (command) {
  case 'set':
    if (!mode) {
      console.error('Usage: node scripts/performance-mode.js set <mode>');
      console.log('Available modes:', Object.keys(modes).join(', '));
      process.exit(1);
    }
    setPerformanceMode(mode);
    break;
    
  case 'show':
    showCurrentMode();
    break;
    
  case 'list':
    console.log('Available performance modes:');
    Object.entries(modes).forEach(([name, config]) => {
      console.log(`  ${name}: ${config.description}`);
    });
    break;
    
  default:
    console.log('StratoSort Performance Mode Controller');
    console.log('');
    console.log('Commands:');
    console.log('  set <mode>  - Set performance mode');
    console.log('  show        - Show current settings');
    console.log('  list        - List available modes');
    console.log('');
    console.log('Examples:');
    console.log('  node scripts/performance-mode.js set energy-efficient');
    console.log('  node scripts/performance-mode.js set debug');
} 