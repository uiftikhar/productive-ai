/**
 * Simple test script to verify OpenAI API connection
 */
import { OpenAIConnector } from './src/connectors/openai-connector';
import { ConsoleLogger } from './src/shared/logger/console-logger';
import { MessageConfig } from './src/connectors/language-model-provider.interface';
import { config } from 'dotenv';

// Load environment variables
config();

async function testOpenAIConnection() {
  const logger = new ConsoleLogger();
  logger.info('Testing OpenAI API connection');
  logger.info('Environment configuration', { 
    mockMode: process.env.USE_MOCK_IMPLEMENTATIONS === 'true',
    apiKey: process.env.OPENAI_API_KEY ? '****' + process.env.OPENAI_API_KEY.slice(-4) : 'not set'
  });

  try {
    // Create the OpenAI connector with explicit options
    const openAiConnector = new OpenAIConnector({
      logger,
      modelConfig: {
        model: process.env.DEFAULT_MODEL || 'gpt-4-turbo',
        temperature: 0.1,
        maxTokens: 500
      }
    });

    logger.info('OpenAI connector initialized, testing connection...');

    // Simple test message
    const testMessages: MessageConfig[] = [
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