#!/usr/bin/env node

/**
 * StratoSort Startup Check
 * Quick verification that all systems are ready before launching
 */

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

async function checkOllamaHealth() {
  console.log(`${colors.blue}🔍 Checking Ollama health...${colors.reset}`);
  
  try {
    const response = await fetch('http://localhost:11434/api/tags', {
      method: 'GET',
      timeout: 5000
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    const modelCount = data.models ? data.models.length : 0;
    
    console.log(`${colors.green}✅ Ollama service is healthy${colors.reset}`);
    console.log(`${colors.green}✅ Found ${modelCount} installed models${colors.reset}`);
    
    // Check for required models
    const requiredModels = ['gemma3:4b', 'whisper'];
    const installedModels = data.models.map(m => m.name);
    
    const missingModels = requiredModels.filter(required => 
      !installedModels.some(installed => 
        installed === required || installed.startsWith(required + ':')
      )
    );
    
    if (missingModels.length > 0) {
      console.log(`${colors.yellow}⚠️  Missing models: ${missingModels.join(', ')}${colors.reset}`);
      console.log(`${colors.cyan}   Run: node scripts/setup-ollama.js${colors.reset}`);
      return { healthy: true, warnings: missingModels };
    }
    
    return { healthy: true, warnings: [] };
    
  } catch (error) {
    console.log(`${colors.red}❌ Ollama service unavailable: ${error.message}${colors.reset}`);
    console.log(`${colors.cyan}   Start with: ollama serve${colors.reset}`);
    return { healthy: false, error: error.message };
  }
}

async function quickStartupCheck() {
  console.log(`${colors.blue}🚀 StratoSort Startup Check${colors.reset}\n`);
  
  const checks = [];
  
  // Check Ollama
  const ollamaHealth = await checkOllamaHealth();
  checks.push({ name: 'Ollama', ...ollamaHealth });
  
  console.log('');
  
  // Summary
  const failedChecks = checks.filter(c => !c.healthy);
  const warningChecks = checks.filter(c => c.healthy && c.warnings?.length > 0);
  
  if (failedChecks.length === 0) {
    console.log(`${colors.green}🎉 All systems ready! Starting StratoSort...${colors.reset}`);
    
    if (warningChecks.length > 0) {
      console.log(`${colors.yellow}⚠️  ${warningChecks.length} warning(s) - some features may be limited${colors.reset}`);
    }
    
    return true;
  } else {
    console.log(`${colors.red}❌ ${failedChecks.length} system(s) not ready${colors.reset}`);
    console.log(`${colors.yellow}Please fix the issues above before starting StratoSort${colors.reset}`);
    return false;
  }
}

// Main execution
if (require.main === module) {
  quickStartupCheck().then(ready => {
    process.exit(ready ? 0 : 1);
  }).catch(error => {
    console.error(`${colors.red}Startup check failed: ${error.message}${colors.reset}`);
    process.exit(1);
  });
}

module.exports = { quickStartupCheck, checkOllamaHealth };
