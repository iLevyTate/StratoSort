#!/usr/bin/env node

/**
 * Comprehensive StratoSort Setup Verification Script
 * Verifies all integrations and wiring between Electron, React, and backend services
 */

const fs = require('fs');
const path = require('path');

// Colors for console output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m'
};

// Verification results
const verificationResults = {
  passed: 0,
  failed: 0,
  warnings: 0,
  details: []
};

/**
 * Check if file exists and log result
 */
function checkFile(filePath, description, required = true) {
  const exists = fs.existsSync(filePath);
  const result = {
    type: required ? (exists ? 'pass' : 'fail') : (exists ? 'pass' : 'warn'),
    description,
    details: exists ? 'Found' : 'Missing'
  };
  
  logResult(result);
  return exists;
}

/**
 * Generic result checker and logger
 */
function checkResult(description, passed, details = '') {
  const result = {
    type: passed ? 'pass' : 'fail',
    description,
    details
  };
  
  logResult(result);
  return passed;
}

/**
 * Log verification result with proper formatting
 */
function logResult(result) {
  const symbol = result.type === 'pass' ? '✓' : result.type === 'warn' ? '⚠' : '✗';
  const color = result.type === 'pass' ? colors.green : result.type === 'warn' ? colors.yellow : colors.red;
  
  console.log(`${color}${symbol}${colors.reset} ${result.description}`);
  if (result.details) {
    console.log(`  → ${result.details}`);
  }
  
  // Update counters
  if (result.type === 'pass') {
    verificationResults.passed++;
  } else if (result.type === 'warn') {
    verificationResults.warnings++;
  } else {
    verificationResults.failed++;
  }
  
  verificationResults.details.push(result);
}

/**
 * Check file content for specific patterns
 */
function checkFileContent(filePath, patterns, description) {
  if (!fs.existsSync(filePath)) {
    verificationResults.failed++;
    console.log(`${colors.red}✗${colors.reset} ${description} - File not found: ${filePath}`);
    return false;
  }
  
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const results = {};
    
    for (const [name, pattern] of Object.entries(patterns)) {
      const regex = new RegExp(pattern, 'g');
      const matches = content.match(regex) || [];
      results[name] = matches.length;
    }
    
    const allFound = Object.values(results).every(count => count > 0);
    
    if (allFound) {
      verificationResults.passed++;
      console.log(`${colors.green}✓${colors.reset} ${description}`);
      
      // Show pattern match counts
      for (const [name, count] of Object.entries(results)) {
        console.log(`  ${colors.blue}→${colors.reset} ${name}: ${count} matches`);
      }
    } else {
      verificationResults.failed++;
      console.log(`${colors.red}✗${colors.reset} ${description}`);
      for (const [name, count] of Object.entries(results)) {
        const color = count > 0 ? colors.green : colors.red;
        console.log(`  ${color}→${colors.reset} ${name}: ${count} matches`);
      }
    }
    
    return allFound;
    } catch (error) {
    verificationResults.failed++;
    console.log(`${colors.red}✗${colors.reset} ${description} - Error reading file: ${error.message}`);
      return false;
    }
  }

/**
 * Check package.json configuration
 */
function checkPackageConfiguration() {
  console.log(`\n${colors.cyan}=== Package Configuration ===${colors.reset}`);
  
  try {
    const packagePath = path.join(process.cwd(), 'package.json');
    const packageData = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    
    checkResult('Root package.json', true, 'Package configuration file exists');
    
    // Check dependencies (including devDependencies for build tools)
    const allDeps = { ...packageData.dependencies, ...packageData.devDependencies };
    
    const requiredDeps = [
      { name: 'electron', key: 'electron', description: 'Electron framework' },
      { name: 'react', key: 'react', description: 'React framework' },
      { name: 'react-dom', key: 'react-dom', description: 'React DOM' },
      { name: 'electron-store', key: 'electron-store', description: 'Settings persistence' },
      { name: 'vite', key: 'vite', description: 'Build tool' },
      { name: 'tailwindcss', key: 'tailwindcss', description: 'CSS framework' },
      { name: '@vitejs/plugin-react', key: '@vitejs/plugin-react', description: 'React Vite plugin' }
    ];
    
    requiredDeps.forEach(dep => {
      const version = allDeps[dep.key];
      checkResult(dep.description, !!version, version ? `${dep.name}: ${version}` : `${dep.name}: Missing`);
    });
    
    // Check scripts
    const requiredScripts = [
      { name: 'dev', description: 'Script dev' },
      { name: 'build', description: 'Script build' },
      { name: 'electron:dev', description: 'Script electron:dev' },
      { name: 'electron:build', description: 'Script electron:build' }
    ];
    
    requiredScripts.forEach(script => {
      const exists = packageData.scripts && packageData.scripts[script.name];
      checkResult(script.description, !!exists, exists ? packageData.scripts[script.name] : 'Missing');
    });
    
    } catch (error) {
    checkResult('Package configuration', false, `Error reading package.json: ${error.message}`);
  }
}

/**
 * Check core file structure
 */
function checkCoreFiles() {
  console.log(`\n${colors.cyan}=== Core File Structure ===${colors.reset}`);
  
  // Entry points
  checkFile('src/main/index.js', 'Main process entry point');
  checkFile('src/preload/index.js', 'Preload script entry point');
  checkFile('src/renderer/App.jsx', 'React app entry point');
  checkFile('src/renderer/index.html', 'HTML entry point');
  
  // Implementation files
  checkFile('src/main/simple-main.js', 'Main process implementation');
  checkFile('src/preload/preload.js', 'Preload script implementation');
  
  // Shared resources
  checkFile('src/shared/constants.js', 'Shared constants');
  checkFile('src/shared/logger.js', 'Logging utility');
  
  // Configuration files
  checkFile('vite.config.ts', 'Vite configuration');
  checkFile('tailwind.config.js', 'Tailwind configuration');
  checkFile('electron-builder.json', 'Electron builder configuration');
  
  // Optional but recommended
  checkFile('webpack.config.js', 'Webpack configuration', false);
  checkFile('postcss.config.js', 'PostCSS configuration', false);
}

/**
 * Check IPC channel definitions and wiring
 */
function checkIPCChannels() {
  console.log(`\n${colors.cyan}=== IPC Channel Verification ===${colors.reset}`);
  
  // Check IPC channel constants
  checkFileContent('src/shared/constants.js', {
    'IPC_CHANNELS': 'const IPC_CHANNELS\\s*=',
    'FILES channels': 'FILES:\\s*{',
    'SMART_FOLDERS channels': 'SMART_FOLDERS:\\s*{',
    'ANALYSIS channels': 'ANALYSIS:\\s*{',
    'SETTINGS channels': 'SETTINGS:\\s*{',
    'OLLAMA channels': 'OLLAMA:\\s*{',
    'UNDO_REDO channels': 'UNDO_REDO:\\s*{',
    'SYSTEM channels': 'SYSTEM:\\s*{'
  }, 'IPC Channel Constants Definition');
  
  // Check IPC handlers in main process
  checkFileContent('src/main/simple-main.js', {
    'File operation handlers': 'ipcMain\\.handle\\(IPC_CHANNELS\\.FILES\\.',
    'Smart folder handlers': 'ipcMain\\.handle\\(IPC_CHANNELS\\.SMART_FOLDERS\\.',
    'Analysis handlers': 'ipcMain\\.handle\\(IPC_CHANNELS\\.ANALYSIS',
    'Settings handlers': 'ipcMain\\.handle\\(IPC_CHANNELS\\.SETTINGS\\.',
    'Ollama handlers': 'ipcMain\\.handle\\(IPC_CHANNELS\\.OLLAMA\\.',
    'Undo/Redo handlers': 'ipcMain\\.handle\\(IPC_CHANNELS\\.UNDO_REDO\\.',
    'System handlers': 'ipcMain\\.handle\\(IPC_CHANNELS\\.SYSTEM\\.'
  }, 'IPC Handlers Registration');
  
  // Check preload API exposure
  checkFileContent('src/preload/preload.js', {
    'Context bridge exposure': 'contextBridge\\.exposeInMainWorld',
    'electronAPI object': 'electronAPI.*{',
    'Files API': 'files:\\s*{',
    'Smart folders API': 'smartFolders:\\s*{',
    'Analysis API': 'analysisHistory:\\s*{',
    'Settings API': 'settings:\\s*{',
    'Undo/Redo API': 'undoRedo:\\s*{',
    'System API': 'system:\\s*{',
    'Events API': 'events:\\s*{'
  }, 'Preload API Exposure');
}

/**
 * Check React component structure
 */
function checkReactComponents() {
  console.log(`\n${colors.cyan}=== React Component Structure ===${colors.reset}`);
  
  // Phase components
  const phases = ['WelcomePhase', 'SetupPhase', 'DiscoverPhase', 'OrganizePhase', 'CompletePhase'];
  phases.forEach(phase => {
    checkFile(`src/renderer/phases/${phase}.jsx`, `${phase} component`);
  });
  
  // Core components
  checkFile('src/renderer/components/NavigationBar.jsx', 'Navigation bar component');
  checkFile('src/renderer/components/Modal.jsx', 'Modal component');
  checkFile('src/renderer/components/Toast.jsx', 'Toast notification component');
  checkFile('src/renderer/components/LoadingSkeleton.jsx', 'Loading skeleton component');
  checkFile('src/renderer/components/UndoRedoSystem.jsx', 'Undo/Redo system component');
  
  // Context providers
  checkFile('src/renderer/contexts/PhaseContext.jsx', 'Phase context provider');
  checkFile('src/renderer/contexts/NotificationContext.jsx', 'Notification context provider');
  checkFile('src/renderer/contexts/ProgressContext.jsx', 'Progress context provider');
  
  // Custom hooks
  checkFile('src/renderer/hooks/useFileAnalysis.jsx', 'File analysis hook');
  checkFile('src/renderer/hooks/useFileOrganization.jsx', 'File organization hook');
  checkFile('src/renderer/hooks/useKeyboardShortcuts.jsx', 'Keyboard shortcuts hook');
  checkFile('src/renderer/hooks/useNamingConvention.jsx', 'Naming convention hook');
}

/**
 * Check service integration
 */
function checkServiceIntegration() {
  console.log(`\n${colors.cyan}=== Service Integration ===${colors.reset}`);
  
  // Main service files
  checkFile('src/main/services/ServiceIntegration.js', 'Service integration orchestrator');
  checkFile('src/main/services/AnalysisHistoryService.js', 'Analysis history service');
  checkFile('src/main/services/UndoRedoService.js', 'Undo/Redo service');
  checkFile('src/main/services/EnhancedLLMService.js', 'Enhanced LLM service');
  checkFile('src/main/services/ModelManager.js', 'Model manager service');
  checkFile('src/main/services/ModelVerifier.js', 'Model verifier service');
  checkFile('src/main/services/PerformanceOptimizer.js', 'Performance optimizer service');
  checkFile('src/main/services/SmartFolderService.js', 'Smart folder service');
  
  // Analysis modules
  checkFile('src/main/analysis/ollamaDocumentAnalysis.js', 'Document analysis module');
  checkFile('src/main/analysis/ollamaImageAnalysis.js', 'Image analysis module');
  
  // Error handling
  checkFile('src/main/errors/AnalysisError.js', 'Analysis error definitions');
  
  // Check service integration patterns
  checkFileContent('src/main/services/ServiceIntegration.js', {
    'Service imports': 'require\\(\'\\./.*Service\\.js\'\\)',
    'Service initialization': 'async initialize\\(\\)',
    'Getter methods': 'get \\w+\\(\\)\\s*{',
    'Analysis with history': 'analyzeFileWithHistory'
  }, 'Service Integration Patterns');
}

/**
 * Check build configuration
 */
function checkBuildConfig() {
  console.log(`\n${colors.cyan}=== Build Configuration ===${colors.reset}`);
  
  // Check Vite config
  if (checkFile('vite.config.ts', 'Vite configuration')) {
    checkFileContent('vite.config.ts', {
      'React plugin': '@vitejs/plugin-react',
      'Build configuration': 'build:\\s*{',
      'Server configuration': 'server:\\s*{',
      'Plugin array': 'plugins:\\s*\\['
    }, 'Vite Configuration Content');
  }
  
  // Check Tailwind config
  if (checkFile('tailwind.config.js', 'Tailwind configuration')) {
    checkFileContent('tailwind.config.js', {
      'Content paths': 'content:\\s*\\[',
      'Theme configuration': 'theme:\\s*{',
      'Plugin array': 'plugins:\\s*\\['
    }, 'Tailwind Configuration Content');
  }
  
  // Check Webpack config (if exists)
  if (fs.existsSync('webpack.config.js')) {
    checkFileContent('webpack.config.js', {
      'Entry points': 'entry:\\s*{',
      'Output configuration': 'output:\\s*{',
      'Module rules': 'module:\\s*{',
      'Target electron': 'target:\\s*[\'"]electron'
    }, 'Webpack Configuration Content');
  }
}

/**
 * Check for node_modules and essential packages
 */
function checkNodeModules() {
  console.log(`\n${colors.cyan}=== Node Modules Verification ===${colors.reset}`);
  
  if (!checkFile('node_modules', 'Node modules directory')) {
    verificationResults.failed++;
    console.log(`${colors.red}✗${colors.reset} Run 'npm install' to install dependencies`);
    return;
  }
  
  // Check critical packages
  const criticalPackages = [
    'electron',
    'react',
    'react-dom',
    'vite',
    'tailwindcss',
    'electron-store'
  ];
  
  for (const pkg of criticalPackages) {
    const pkgPath = path.join('node_modules', pkg);
    if (fs.existsSync(pkgPath)) {
      verificationResults.passed++;
      console.log(`${colors.green}✓${colors.reset} ${pkg} installed`);
    } else {
      verificationResults.failed++;
      console.log(`${colors.red}✗${colors.reset} ${pkg} not installed`);
    }
  }
}

/**
 * Main verification function
 */
function runVerification() {
  console.log(`${colors.magenta}StratoSort Comprehensive Setup Verification${colors.reset}`);
  console.log(`${colors.magenta}===========================================${colors.reset}\n`);
  
  // Run all verification checks
  checkPackageConfiguration();
  checkCoreFiles();
  checkIPCChannels();
  checkReactComponents();
  checkServiceIntegration();
  checkBuildConfig();
  checkNodeModules();
  
  // Summary
  console.log(`\n${colors.cyan}=== Verification Summary ===${colors.reset}`);
  console.log(`${colors.green}Passed: ${verificationResults.passed}${colors.reset}`);
  console.log(`${colors.yellow}Warnings: ${verificationResults.warnings}${colors.reset}`);
  console.log(`${colors.red}Failed: ${verificationResults.failed}${colors.reset}`);
  
  const total = verificationResults.passed + verificationResults.warnings + verificationResults.failed;
  const successRate = ((verificationResults.passed / total) * 100).toFixed(1);
  
  console.log(`\nSuccess Rate: ${successRate}%`);
  
  if (verificationResults.failed === 0) {
    console.log(`\n${colors.green}🎉 All critical checks passed! StratoSort is properly configured.${colors.reset}`);
  } else if (verificationResults.failed <= 3) {
    console.log(`\n${colors.yellow}⚠️  Minor issues found. StratoSort should work but may have some limitations.${colors.reset}`);
  } else {
    console.log(`\n${colors.red}❌ Critical issues found. StratoSort may not work properly.${colors.reset}`);
  }
  
  // Recommendations
  if (verificationResults.failed > 0 || verificationResults.warnings > 0) {
    console.log(`\n${colors.cyan}=== Recommendations ===${colors.reset}`);
    
    if (!fs.existsSync('node_modules')) {
      console.log(`${colors.yellow}→${colors.reset} Run 'npm install' to install dependencies`);
    }
    
    if (verificationResults.failed > 0) {
      console.log(`${colors.yellow}→${colors.reset} Review failed checks above and ensure all required files exist`);
      console.log(`${colors.yellow}→${colors.reset} Check file paths and naming conventions`);
      console.log(`${colors.yellow}→${colors.reset} Verify IPC channel definitions match between main and preload`);
    }
    
    if (verificationResults.warnings > 0) {
      console.log(`${colors.yellow}→${colors.reset} Consider addressing warnings for optimal performance`);
    }
  }
  
  // Exit code
  process.exit(verificationResults.failed > 5 ? 1 : 0);
}

// Run verification
runVerification();
