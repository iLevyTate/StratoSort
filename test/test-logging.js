// Test the file logging system
const { fileLogger } = require('./src/shared/fileLogger');

async function testLogging() {
  console.log('Testing file logger...');

  try {
    // Log some test entries
    await fileLogger.logSystemInfo();
    console.log('✓ System info logged');

    await fileLogger.logAction('test_action', {
      user: 'test_user',
      action: 'click_button',
    });
    console.log('✓ Action logged');

    await fileLogger.logPerformance('test_operation', 150, { details: 'test' });
    console.log('✓ Performance logged');

    await fileLogger.logOllamaCall('text_analysis', 'llama2', 2000, true, {
      promptLength: 100,
    });
    console.log('✓ Ollama call logged');

    await fileLogger.logError('test_context', new Error('Test error'), {
      details: 'test',
    });
    console.log('✓ Error logged');

    // Get stats
    const stats = await fileLogger.getStats();
    console.log('Log statistics:', stats);

    console.log('All test logs written successfully!');
  } catch (error) {
    console.error('Test failed:', error);
  }
}

testLogging();
