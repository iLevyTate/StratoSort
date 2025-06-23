#!/usr/bin/env node

/**
 * StratoSort Setup Verification Script
 * Verifies all required dependencies and configurations
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// ANSI color codes for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

// Configuration
const REQUIRED_MODELS = [
  'gemma3:4b',
  'mxbai-embed-large'
];

const OPTIONAL_MODELS = [
  'llama3.2:latest',
  'llama3.2',
  'llama3',
  'llava:latest',
  'mistral',
  'phi3'
];

class SetupVerifier {
  constructor() {
    this.errors = [];
    this.warnings = [];
    this.info = [];
  }

  log(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = `[${timestamp}]`;
    
    switch (type) {
      case 'error':
        console.log(`${colors.red}❌ ${prefix} ${message}${colors.reset}`);
        this.errors.push(message);
        break;
      case 'warning':
        console.log(`${colors.yellow}⚠️  ${prefix} ${message}${colors.reset}`);
        this.warnings.push(message);
        break;
      case 'success':
        console.log(`${colors.green}✅ ${prefix} ${message}${colors.reset}`);
        break;
      case 'info':
        console.log(`${colors.blue}ℹ️  ${prefix} ${message}${colors.reset}`);
        this.info.push(message);
        break;
      default:
        console.log(`${prefix} ${message}`);
    }
  }

  async checkNodeDependencies() {
    this.log('Checking Node.js dependencies...', 'info');
    
    try {
      const packageJsonPath = path.join(__dirname, '..', 'package.json');
      if (!fs.existsSync(packageJsonPath)) {
        this.log('package.json not found', 'error');
        return false;
      }

      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      const nodeModulesPath = path.join(__dirname, '..', 'node_modules');
      
      if (!fs.existsSync(nodeModulesPath)) {
        this.log('node_modules directory not found. Run: npm install', 'error');
        return false;
      }

      // Check critical dependencies
      const criticalDeps = ['electron', 'react', 'ollama'];
      for (const dep of criticalDeps) {
        const depPath = path.join(nodeModulesPath, dep);
        if (!fs.existsSync(depPath)) {
          this.log(`Missing critical dependency: ${dep}`, 'error');
          return false;
        }
      }

      this.log('Node.js dependencies are installed', 'success');
      return true;
    } catch (error) {
      this.log(`Error checking dependencies: ${error.message}`, 'error');
      return false;
    }
  }

  async checkOllamaInstallation() {
    this.log('Checking Ollama installation...', 'info');
    
    return new Promise((resolve) => {
      const ollama = spawn('ollama', ['--version'], { stdio: 'pipe' });
      
      let output = '';
      ollama.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      ollama.stderr.on('data', (data) => {
        output += data.toString();
      });
      
      ollama.on('close', (code) => {
        if (code === 0) {
          this.log(`Ollama is installed: ${output.trim()}`, 'success');
          resolve(true);
        } else {
          this.log('Ollama is not installed or not in PATH', 'error');
          this.log('Install Ollama from: https://ollama.ai/', 'info');
          resolve(false);
        }
      });
      
      ollama.on('error', (error) => {
        this.log('Ollama is not installed or not in PATH', 'error');
        this.log('Install Ollama from: https://ollama.ai/', 'info');
        resolve(false);
      });
    });
  }

  async checkOllamaService() {
    this.log('Checking Ollama service...', 'info');
    
    try {
      const response = await fetch('http://localhost:11434/api/tags');
      if (response.ok) {
        this.log('Ollama service is running on localhost:11434', 'success');
        return true;
      } else {
        this.log('Ollama service is not responding', 'error');
        this.log('Start Ollama service with: ollama serve', 'info');
        return false;
      }
    } catch (error) {
      this.log('Cannot connect to Ollama service', 'error');
      this.log('Start Ollama service with: ollama serve', 'info');
      return false;
    }
  }

  async checkOllamaModels() {
    this.log('Checking Ollama models...', 'info');
    
    try {
      const response = await fetch('http://localhost:11434/api/tags');
      if (!response.ok) {
        this.log('Cannot fetch model list from Ollama', 'error');
        return false;
      }
      
      const data = await response.json();
      const installedModels = data.models.map(m => m.name);
      
      this.log(`Found ${installedModels.length} installed models`, 'info');
      
      // Check required models
      const missingRequired = [];
      const foundRequired = [];
      
      for (const model of REQUIRED_MODELS) {
        const isInstalled = installedModels.some(installed => 
          installed === model || installed.startsWith(model + ':')
        );
        
        if (isInstalled) {
          foundRequired.push(model);
          this.log(`✓ Required model found: ${model}`, 'success');
        } else {
          missingRequired.push(model);
          this.log(`✗ Required model missing: ${model}`, 'error');
        }
      }
      
      // Check optional models
      const foundOptional = [];
      for (const model of OPTIONAL_MODELS) {
        const isInstalled = installedModels.some(installed => 
          installed === model || installed.startsWith(model + ':')
        );
        
        if (isInstalled) {
          foundOptional.push(model);
          this.log(`✓ Optional model found: ${model}`, 'info');
        }
      }
      
      // Provide installation instructions for missing models
      if (missingRequired.length > 0) {
        this.log('Missing required models. Install with:', 'error');
        for (const model of missingRequired) {
          console.log(`  ${colors.cyan}ollama pull ${model}${colors.reset}`);
        }
      }
      
      return missingRequired.length === 0;
    } catch (error) {
      this.log(`Error checking models: ${error.message}`, 'error');
      return false;
    }
  }

  async checkProjectStructure() {
    this.log('Checking project structure...', 'info');
    
    const requiredPaths = [
      'src/main',
      'src/preload', 
      'src/renderer',
      'src/shared',
      'dist'
    ];
    
    let allGood = true;
    
    for (const requiredPath of requiredPaths) {
      const fullPath = path.join(__dirname, '..', requiredPath);
      if (!fs.existsSync(fullPath)) {
        this.log(`Missing directory: ${requiredPath}`, 'error');
        allGood = false;
      }
    }
    
    if (allGood) {
      this.log('Project structure is valid', 'success');
    }
    
    return allGood;
  }

  async checkBuildArtifacts() {
    this.log('Checking build artifacts...', 'info');
    
    const distPath = path.join(__dirname, '..', 'dist');
    if (!fs.existsSync(distPath)) {
      this.log('Build artifacts not found. Run: npm run build', 'warning');
      return false;
    }
    
    const requiredBuildFiles = [
      'main/index.js',
      'preload/index.js', 
      'renderer/index.html'
    ];
    
    let allBuilt = true;
    for (const file of requiredBuildFiles) {
      const filePath = path.join(distPath, file);
      if (!fs.existsSync(filePath)) {
        this.log(`Missing build file: dist/${file}`, 'warning');
        allBuilt = false;
      }
    }
    
    if (allBuilt) {
      this.log('Build artifacts are present', 'success');
    } else {
      this.log('Some build artifacts are missing. Run: npm run build', 'warning');
    }
    
    return allBuilt;
  }

  async generateReport() {
    console.log(`\n${colors.bright}=== STRATOSORT SETUP VERIFICATION REPORT ===${colors.reset}\n`);
    
    const totalChecks = this.errors.length + this.warnings.length + this.info.length;
    
    if (this.errors.length === 0) {
      console.log(`${colors.green}🎉 Setup verification completed successfully!${colors.reset}`);
      console.log(`${colors.green}StratoSort is ready to run.${colors.reset}\n`);
    } else {
      console.log(`${colors.red}❌ Setup verification found ${this.errors.length} error(s)${colors.reset}`);
    }
    
    if (this.warnings.length > 0) {
      console.log(`${colors.yellow}⚠️  ${this.warnings.length} warning(s) found${colors.reset}`);
    }
    
    // Quick start instructions
    console.log(`${colors.bright}Quick Start:${colors.reset}`);
    console.log(`1. ${colors.cyan}npm install${colors.reset}                 # Install dependencies`);
    console.log(`2. ${colors.cyan}ollama serve${colors.reset}                # Start Ollama service`);
    console.log(`3. ${colors.cyan}ollama pull gemma3:4b${colors.reset}       # Install AI model`);
    console.log(`4. ${colors.cyan}ollama pull whisper${colors.reset}         # Install speech model`);
    console.log(`5. ${colors.cyan}npm run build${colors.reset}               # Build the application`);
    console.log(`6. ${colors.cyan}npm start${colors.reset}                   # Start StratoSort\n`);
    
    return this.errors.length === 0;
  }

  async run() {
    console.log(`${colors.bright}${colors.blue}🚀 StratoSort Setup Verification${colors.reset}\n`);
    
    const checks = [
      () => this.checkProjectStructure(),
      () => this.checkNodeDependencies(),
      () => this.checkOllamaInstallation(),
      () => this.checkOllamaService(),
      () => this.checkOllamaModels(),
      () => this.checkBuildArtifacts()
    ];
    
    for (const check of checks) {
      await check();
      console.log(''); // Add spacing between checks
    }
    
    return await this.generateReport();
  }
}

// Main execution
if (require.main === module) {
  const verifier = new SetupVerifier();
  verifier.run().then(success => {
    process.exit(success ? 0 : 1);
  }).catch(error => {
    console.error(`${colors.red}Setup verification failed: ${error.message}${colors.reset}`);
    process.exit(1);
  });
}

module.exports = SetupVerifier;
