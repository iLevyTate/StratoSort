const { exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

async function checkSystem() {
  console.log('=== SYSTEM CHECK ===');

  // Check if logs directory exists
  try {
    await fs.access('./logs');
    console.log('✅ Logs directory exists');

    // Check log subdirectories
    const subdirs = ['performance', 'actions', 'errors', 'ollama'];
    for (const subdir of subdirs) {
      try {
        await fs.access(`./logs/${subdir}`);
        console.log(`✅ logs/${subdir} directory exists`);
      } catch {
        console.log(`❌ logs/${subdir} directory missing`);
      }
    }
  } catch {
    console.log('❌ Logs directory missing');
  }

  // Check Ollama service
  exec('curl -s http://localhost:11434/api/tags', (error, stdout, stderr) => {
    if (error) {
      console.log('❌ Ollama service not running or not accessible');
      console.log('   Error:', error.message);
      console.log('   Make sure Ollama is running: ollama serve');
    } else {
      try {
        const data = JSON.parse(stdout);
        console.log('✅ Ollama service running');
        console.log('   Models available:', data.models.length);
        if (data.models.length > 0) {
          console.log('   Models:', data.models.map((m) => m.name).join(', '));
        } else {
          console.log('   No models installed yet');
        }
      } catch (e) {
        console.log('❌ Ollama service returned invalid response');
        console.log('   Response:', stdout);
      }
    }
  });

  console.log('\n=== CONFIGURATION CHECK ===');

  // Check if we can import the logging modules
  try {
    const { fileLogger } = require('./src/shared/fileLogger');
    console.log('✅ File logger module loads successfully');
  } catch (error) {
    console.log('❌ File logger module failed to load:', error.message);
  }

  try {
    const logger = require('./src/shared/logger');
    console.log('✅ Main logger module loads successfully');
  } catch (error) {
    console.log('❌ Main logger module failed to load:', error.message);
  }
}

checkSystem();
