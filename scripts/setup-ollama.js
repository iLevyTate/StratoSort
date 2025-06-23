#!/usr/bin/env node

/**
 * StratoSort Ollama Setup Script
 * Automatically installs and configures required Ollama models
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

// Required models for StratoSort
const REQUIRED_MODELS = [
  {
    name: 'gemma3:4b',
    description: 'Multimodal AI model for text and image analysis',
    size: '~2.7GB',
    priority: 1,
    required: true
  },
  {
    name: 'whisper',
    description: 'Speech-to-text model for audio analysis',
    size: '~39MB',
    priority: 2,
    required: true
  },
  {
    name: 'mxbai-embed-large',
    description: 'Embedding model for semantic search',
    size: '~669MB',
    priority: 3,
    required: true
  }
];

// Optional models for enhanced functionality
const OPTIONAL_MODELS = [
  {
    name: 'llama3.2:latest',
    description: 'Alternative text analysis model',
    size: '~2.0GB',
    priority: 4,
    required: false
  },
  {
    name: 'whisper:medium',
    description: 'Higher accuracy speech model',
    size: '~769MB',
    priority: 5,
    required: false
  }
];

class OllamaSetup {
  constructor() {
    this.installedModels = [];
    this.failedModels = [];
    this.skippedModels = [];
  }

  log(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = `[${timestamp}]`;
    
    switch (type) {
      case 'error':
        console.log(`${colors.red}❌ ${prefix} ${message}${colors.reset}`);
        break;
      case 'warning':
        console.log(`${colors.yellow}⚠️  ${prefix} ${message}${colors.reset}`);
        break;
      case 'success':
        console.log(`${colors.green}✅ ${prefix} ${message}${colors.reset}`);
        break;
      case 'info':
        console.log(`${colors.blue}ℹ️  ${prefix} ${message}${colors.reset}`);
    break;
      case 'progress':
        console.log(`${colors.cyan}🔄 ${prefix} ${message}${colors.reset}`);
    break;
  default:
        console.log(`${prefix} ${message}`);
    }
  }

  async checkOllamaInstalled() {
    this.log('Checking if Ollama is installed...', 'info');
    
    return new Promise((resolve) => {
      const ollama = spawn('ollama', ['--version'], { stdio: 'pipe' });
      
      let output = '';
      ollama.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      ollama.on('close', (code) => {
        if (code === 0) {
          this.log(`Ollama is installed: ${output.trim()}`, 'success');
          resolve(true);
        } else {
          this.log('Ollama is not installed', 'error');
          resolve(false);
        }
      });
      
      ollama.on('error', () => {
        this.log('Ollama is not installed', 'error');
        resolve(false);
      });
    });
  }

  async checkOllamaService() {
    this.log('Checking if Ollama service is running...', 'info');
    
    try {
      const response = await fetch('http://localhost:11434/api/tags');
      if (response.ok) {
        this.log('Ollama service is running', 'success');
        return true;
      } else {
        this.log('Ollama service is not responding', 'warning');
        return false;
      }
    } catch (error) {
      this.log('Cannot connect to Ollama service', 'warning');
      return false;
    }
  }

  async startOllamaService() {
    this.log('Attempting to start Ollama service...', 'progress');
    
    return new Promise((resolve) => {
      const ollama = spawn('ollama', ['serve'], { 
        stdio: 'ignore',
        detached: true
      });
      
      ollama.unref();
      
      // Wait a moment for service to start
      setTimeout(async () => {
        const isRunning = await this.checkOllamaService();
        if (isRunning) {
          this.log('Ollama service started successfully', 'success');
          resolve(true);
        } else {
          this.log('Failed to start Ollama service automatically', 'warning');
          this.log('Please run "ollama serve" manually in another terminal', 'info');
          resolve(false);
        }
      }, 3000);
    });
  }

  async getInstalledModels() {
    try {
      const response = await fetch('http://localhost:11434/api/tags');
      if (!response.ok) {
        throw new Error('Cannot fetch model list');
      }
      
      const data = await response.json();
      return data.models.map(m => m.name);
    } catch (error) {
      this.log(`Error fetching installed models: ${error.message}`, 'error');
      return [];
    }
  }

  async installModel(model) {
    this.log(`Installing ${model.name} (${model.size})...`, 'progress');
    this.log(`Description: ${model.description}`, 'info');
    
    return new Promise((resolve) => {
      const pullProcess = spawn('ollama', ['pull', model.name], { stdio: 'pipe' });
      
      let output = '';
      let errorOutput = '';
      
      pullProcess.stdout.on('data', (data) => {
        const chunk = data.toString();
        output += chunk;
        
        // Show progress for large models
        if (chunk.includes('downloading') || chunk.includes('pulling')) {
          process.stdout.write(`\r${colors.cyan}📥 ${chunk.trim()}${colors.reset}`);
        }
      });
      
      pullProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      pullProcess.on('close', (code) => {
        process.stdout.write('\n'); // Clear progress line
        
        if (code === 0) {
          this.log(`Successfully installed ${model.name}`, 'success');
          this.installedModels.push(model);
          resolve(true);
        } else {
          this.log(`Failed to install ${model.name}: ${errorOutput}`, 'error');
          this.failedModels.push(model);
          resolve(false);
        }
      });
      
      pullProcess.on('error', (error) => {
        this.log(`Error installing ${model.name}: ${error.message}`, 'error');
        this.failedModels.push(model);
        resolve(false);
      });
    });
  }

  async promptUserChoice(message, defaultChoice = 'y') {
    return new Promise((resolve) => {
      const readline = require('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      rl.question(`${message} [${defaultChoice}/n]: `, (answer) => {
        rl.close();
        const choice = answer.toLowerCase().trim() || defaultChoice.toLowerCase();
        resolve(choice === 'y' || choice === 'yes');
      });
    });
  }

  async setupModels(interactive = true) {
    const installedModels = await this.getInstalledModels();
    this.log(`Found ${installedModels.length} installed models`, 'info');
    
    // Check required models
    const allModels = [...REQUIRED_MODELS, ...OPTIONAL_MODELS];
    const missingModels = [];
    const presentModels = [];
    
    for (const model of allModels) {
      const isInstalled = installedModels.some(installed => 
        installed === model.name || installed.startsWith(model.name + ':')
      );
      
      if (isInstalled) {
        presentModels.push(model);
        this.log(`✓ ${model.name} is already installed`, 'success');
      } else {
        missingModels.push(model);
      }
    }
    
    if (missingModels.length === 0) {
      this.log('All models are already installed!', 'success');
      return true;
    }
    
    // Show installation plan
    console.log(`\n${colors.bright}Installation Plan:${colors.reset}`);
    let totalSize = 0;
    
    for (const model of missingModels) {
      const status = model.required ? `${colors.red}[REQUIRED]${colors.reset}` : `${colors.yellow}[OPTIONAL]${colors.reset}`;
      console.log(`  ${status} ${model.name} - ${model.description} (${model.size})`);
      
      // Rough size calculation (for display only)
      const sizeMatch = model.size.match(/~?(\d+\.?\d*)(GB|MB)/);
      if (sizeMatch) {
        const size = parseFloat(sizeMatch[1]);
        const unit = sizeMatch[2];
        totalSize += unit === 'GB' ? size * 1024 : size;
      }
    }
    
    console.log(`\nTotal download size: ~${(totalSize / 1024).toFixed(1)}GB\n`);
    
    // Install models
    if (interactive) {
      const shouldInstall = await this.promptUserChoice(
        'Do you want to install the missing models?', 'y'
      );
      
      if (!shouldInstall) {
        this.log('Installation cancelled by user', 'warning');
        return false;
      }
    }
    
    // Install required models first
    const requiredMissing = missingModels.filter(m => m.required);
    const optionalMissing = missingModels.filter(m => !m.required);
    
    for (const model of requiredMissing) {
      await this.installModel(model);
    }
    
    // Ask about optional models
    if (optionalMissing.length > 0 && interactive) {
      const installOptional = await this.promptUserChoice(
        'Do you want to install optional models for enhanced functionality?', 'n'
      );
      
      if (installOptional) {
        for (const model of optionalMissing) {
          await this.installModel(model);
        }
      } else {
        this.skippedModels.push(...optionalMissing);
      }
    } else if (optionalMissing.length > 0 && !interactive) {
      // In non-interactive mode, skip optional models
      this.skippedModels.push(...optionalMissing);
    }
    
    return this.failedModels.length === 0;
  }

  async generateReport() {
    console.log(`\n${colors.bright}=== OLLAMA SETUP REPORT ===${colors.reset}\n`);
    
    if (this.installedModels.length > 0) {
      console.log(`${colors.green}✅ Successfully installed models:${colors.reset}`);
      for (const model of this.installedModels) {
        console.log(`   • ${model.name} - ${model.description}`);
      }
      console.log('');
    }
    
    if (this.skippedModels.length > 0) {
      console.log(`${colors.yellow}⏭️  Skipped optional models:${colors.reset}`);
      for (const model of this.skippedModels) {
        console.log(`   • ${model.name} - ${model.description}`);
      }
      console.log('');
    }
    
    if (this.failedModels.length > 0) {
      console.log(`${colors.red}❌ Failed to install models:${colors.reset}`);
      for (const model of this.failedModels) {
        console.log(`   • ${model.name} - ${model.description}`);
      }
      console.log('');
    }
    
    const requiredFailed = this.failedModels.filter(m => m.required);
    if (requiredFailed.length === 0) {
      console.log(`${colors.green}🎉 Ollama setup completed successfully!${colors.reset}`);
      console.log(`${colors.green}StratoSort AI functionality is ready to use.${colors.reset}\n`);
      
      console.log(`${colors.bright}Next steps:${colors.reset}`);
      console.log(`1. ${colors.cyan}npm run build${colors.reset}     # Build StratoSort`);
      console.log(`2. ${colors.cyan}npm start${colors.reset}        # Launch StratoSort\n`);
      
      return true;
    } else {
      console.log(`${colors.red}❌ Setup incomplete. Required models failed to install.${colors.reset}`);
      console.log(`${colors.yellow}Please try installing manually:${colors.reset}`);
      for (const model of requiredFailed) {
        console.log(`   ${colors.cyan}ollama pull ${model.name}${colors.reset}`);
      }
      console.log('');
      return false;
    }
  }

  async run(interactive = true) {
    console.log(`${colors.bright}${colors.blue}🚀 StratoSort Ollama Setup${colors.reset}\n`);
    
    // Check if Ollama is installed
    const isInstalled = await this.checkOllamaInstalled();
    if (!isInstalled) {
      this.log('Please install Ollama first:', 'error');
      this.log('Visit: https://ollama.ai/', 'info');
      this.log('Or use: curl -fsSL https://ollama.ai/install.sh | sh', 'info');
      return false;
    }
    
    // Check if service is running
    let serviceRunning = await this.checkOllamaService();
    if (!serviceRunning) {
      serviceRunning = await this.startOllamaService();
      if (!serviceRunning) {
        return false;
      }
    }
    
    // Setup models
    const success = await this.setupModels(interactive);
    
    // Generate report
    return await this.generateReport();
  }
}

// Main execution
if (require.main === module) {
  const setup = new OllamaSetup();
  const interactive = !process.argv.includes('--no-interactive');
  
  setup.run(interactive).then(success => {
    process.exit(success ? 0 : 1);
  }).catch(error => {
    console.error(`${colors.red}Setup failed: ${error.message}${colors.reset}`);
    process.exit(1);
  });
}

module.exports = OllamaSetup;
