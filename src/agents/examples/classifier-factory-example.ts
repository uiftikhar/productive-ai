import { ClassifierFactory, ClassificationTelemetry } from '../factories/classifier-factory';
import { ConsoleLogger } from '../../shared/logger/console-logger';
import { ParticipantRole } from '../types/conversation.types';

/**
 * Example demonstrating the usage of the ClassifierFactory with 
 * enhanced configuration, telemetry, and fallback options.
 * 
 * This example shows how to:
 * 1. Create a classifier factory with custom configuration
 * 2. Set up telemetry handling
 * 3. Configure fallback classifiers
 * 4. Use the factory for classification with different options
 */
async function classifierFactoryExample() {
  // Create a custom logger
  const logger = new ConsoleLogger();
  logger.setLogLevel('debug');
  
  console.log('=== Classifier Factory Example ===');
  
  // Create the factory with enhanced options
  const factory = new ClassifierFactory({
    logger,
    defaultType: 'openai',
    maxRetries: 2,
    logLevel: 'debug',
    fallbackOptions: {
      enabled: true,
      classifierType: 'bedrock'
    }
  });
  
  // Set up telemetry handling
  factory.setTelemetryHandler((telemetry: ClassificationTelemetry) => {
    console.log('\n--- Classification Telemetry ---');
    console.log(`Classifier: ${telemetry.classifierType}`);
    console.log(`Execution Time: ${telemetry.executionTimeMs}ms`);
    console.log(`Selected Agent: ${telemetry.selectedAgentId || 'None'}`);
    console.log(`Confidence: ${telemetry.confidence}`);
    console.log(`Is Follow-up: ${telemetry.isFollowUp}`);
    if (telemetry.error) {
      console.log(`Error: ${telemetry.error}`);
    }
    console.log('-------------------------------\n');
  });
  
  // Sample conversation history
  const conversationHistory = [
    {
      id: '1',
      role: ParticipantRole.USER,
      content: 'I need help with my project.',
      timestamp: new Date().toISOString()
    },
    {
      id: '2',
      role: ParticipantRole.ASSISTANT,
      content: 'I can help you with your project. What specific assistance do you need?',
      agentId: 'project-assistant',
      timestamp: new Date().toISOString()
    }
  ];
  
  // Example 1: Basic classification with default classifier
  console.log('\nExample 1: Basic classification with default classifier');
  try {
    const result1 = await factory.classify(
      'Can you continue helping me organize my tasks?',
      conversationHistory
    );
    
    console.log('Classification Result:');
    console.log(`- Selected Agent: ${result1.selectedAgentId || 'None'}`);
    console.log(`- Confidence: ${result1.confidence}`);
    console.log(`- Is Follow-up: ${result1.isFollowUp}`);
    console.log(`- Reasoning: ${result1.reasoning}`);
    console.log(`- Entities: ${result1.entities.join(', ')}`);
    console.log(`- Intent: ${result1.intent}`);
  } catch (error) {
    console.error('Classification failed:', error);
  }
  
  // Example 2: Classification with specific classifier and metadata
  console.log('\nExample 2: Classification with specific classifier and metadata');
  try {
    const result2 = await factory.classify(
      'What do you think about machine learning frameworks?',
      conversationHistory,
      {
        classifierType: 'openai',
        metadata: {
          priority: 'high',
          category: 'technical'
        }
      }
    );
    
    console.log('Classification Result:');
    console.log(`- Selected Agent: ${result2.selectedAgentId || 'None'}`);
    console.log(`- Confidence: ${result2.confidence}`);
    console.log(`- Is Follow-up: ${result2.isFollowUp}`);
    console.log(`- Intent: ${result2.intent}`);
  } catch (error) {
    console.error('Classification failed:', error);
  }
  
  // Example 3: Classification with fallback
  console.log('\nExample 3: Classification with fallback (simulated error)');
  
  // Configure a test classifier that will fail
  const originalClassify = factory.classify.bind(factory);
  factory.classify = async (input, history, options = {}) => {
    if (options.classifierType === 'openai') {
      // Simulate failure in the OpenAI classifier
      throw new Error('Simulated OpenAI classifier failure');
    }
    return originalClassify(input, history, options);
  };
  
  try {
    const result3 = await factory.classify(
      'Tell me about cloud computing options',
      conversationHistory,
      {
        classifierType: 'openai',
        enableFallback: true
      }
    );
    
    console.log('Classification Result (after fallback):');
    console.log(`- Selected Agent: ${result3.selectedAgentId || 'None'}`);
    console.log(`- Confidence: ${result3.confidence}`);
    console.log(`- Reasoning: ${result3.reasoning}`);
  } catch (error) {
    console.error('Classification with fallback failed:', error);
  }
  
  // Restore original method
  factory.classify = originalClassify;
  
  console.log('\n=== End of Classifier Factory Example ===');
}

// Execute the example
classifierFactoryExample().catch(error => {
  console.error('Example failed:', error);
});

export default classifierFactoryExample; 