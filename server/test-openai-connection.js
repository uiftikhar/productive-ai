/**
 * Simple test script to verify OpenAI API connection
 */
const { OpenAIConnector } = require('./src/connectors/openai-connector');
const { ConsoleLogger } = require('./src/shared/logger/console-logger');

async function testOpenAIConnection() {
  const logger = new ConsoleLogger();
  logger.info('Testing OpenAI API connection');

  try {
    // Create the OpenAI connector with explicit options
    const openAiConnector = new OpenAIConnector({
      logger,
      apiKey: process.env.OPENAI_API_KEY,
      modelConfig: {
        model: process.env.DEFAULT_MODEL || 'gpt-4-turbo',
        temperature: 0.1,
        maxTokens: 500
      }
    });

    logger.info('OpenAI connector initialized, testing connection...');
    logger.info('Mock mode:', process.env.USE_MOCK_IMPLEMENTATIONS);

    // Simple test message
    const testMessages = [
      {
        role: 'system',
        content: 'You are a helpful assistant.'
      },
      {
        role: 'user',
        content: 'Say "OpenAI API is working correctly!" and include the current timestamp.'
      }
    ];

    // Generate a response
    const response = await openAiConnector.generateResponse(testMessages);
    
    logger.info('OpenAI API response:', response);
    logger.info('API connection test successful! ✅');
    
    // Get token usage stats
    const tokenUsage = openAiConnector.getTokenUsage();
    logger.info('Token usage:', tokenUsage);
    
    return true;
  } catch (error) {
    logger.error('OpenAI API connection test failed! ❌', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    return false;
  }
}

// Run the test
testOpenAIConnection()
  .then(success => {
    console.log(`Test ${success ? 'PASSED' : 'FAILED'}`);
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Unexpected error:', error);
    process.exit(1);
  }); 