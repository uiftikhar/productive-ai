/**
 * Test script for validating the Tool Integration Enhancements
 * Milestone 2.1: Tool Integration Enhancement
 */

// Import required modules for Node.js environment
const path = require('path');
require('dotenv').config();

// Enable TypeScript support
require('ts-node').register({
  transpileOnly: true,
  compilerOptions: {
    module: 'commonjs',
    target: 'es2020',
  },
});

// Import the tool-related components
const { ToolRegistryService } = require('./src/tools/base/tool-registry.service');
const { ToolExecutorService } = require('./src/tools/base/tool-executor.service');
const { ActionExtractionTool } = require('./src/tools/meeting/action-extraction.tool');
const { ToolUsageLogger } = require('./src/tools/logging/tool-usage-logger');
const { FallbackMechanismService, FallbackStrategy } = require('./src/tools/error-handling/fallback-mechanisms');
const { ConsoleLogger } = require('./src/shared/logger/console-logger');
const { ToolCategory, ToolAccessLevel, ToolExecutionStatus } = require('./src/tools/base/tool.interface');

// A test implementation of a fallback tool
class SimpleActionExtractionTool extends ActionExtractionTool {
  constructor(logger) {
    super(logger);
    // Override configuration
    this.config = {
      ...this.config,
      name: 'simple-action-extraction',
      description: 'Simplified version of action extraction tool (fallback)',
      timeout: 5000,
      fallbackToolName: null, // Prevent infinite fallback loops
    };
  }

  // Override the execute method with a simpler implementation
  async execute(input, context) {
    const startTime = Date.now();
    const { transcript } = input;
    
    try {
      // Very simple extraction - just find sentences with action words
      const actionKeywords = ['will', 'should', 'must', 'need to'];
      const actionItems = [];
      
      for (const utterance of transcript.utterances) {
        const sentences = utterance.text.split(/[.!?]+/).filter(s => s.trim().length > 0);
        
        for (const sentence of sentences) {
          if (actionKeywords.some(keyword => sentence.toLowerCase().includes(keyword))) {
            actionItems.push({
              id: crypto.randomUUID(),
              text: sentence.trim(),
              status: 'pending',
              confidence: 0.7,
              startTime: utterance.startTime,
              endTime: utterance.endTime
            });
          }
        }
      }
      
      return this.createSuccessResult(
        {
          actionItems,
          metadata: {
            totalExtracted: actionItems.length,
            processingTimeMs: Date.now() - startTime
          }
        },
        context
      );
    } catch (error) {
      return this.createErrorResult(error, context);
    }
  }
}

/**
 * Run the test script
 */
async function runTest() {
  // Create a logger
  const logger = new ConsoleLogger();
  logger.info('Starting tool integration test');
  
  try {
    // Initialize the tool usage logger
    const toolUsageLogger = new ToolUsageLogger({
      logToFile: true,
      logDirectory: path.join(__dirname, 'logs', 'tools'),
      logger
    });
    
    // Create the tool registry
    const toolRegistry = new ToolRegistryService(logger);
    
    // Create the tool executor
    const toolExecutor = new ToolExecutorService(toolRegistry, logger);
    
    // Create the fallback mechanism service
    const fallbackService = new FallbackMechanismService(toolRegistry, logger);
    
    // Create and register tools
    const actionExtractionTool = new ActionExtractionTool(logger);
    const simpleExtractionTool = new SimpleActionExtractionTool(logger);
    
    toolRegistry.registerTool(actionExtractionTool);
    toolRegistry.registerTool(simpleExtractionTool);
    
    // Register fallback mechanisms
    fallbackService.registerFallback({
      toolName: 'action-extraction',
      fallbackToolName: 'simple-action-extraction',
      strategy: FallbackStrategy.ALTERNATE_TOOL
    });
    
    fallbackService.registerFallback({
      toolName: 'action-extraction',
      strategy: FallbackStrategy.RETRY,
      maxRetries: 2,
      retryDelay: 500
    });
    
    // Display registered tools
    logger.info(`Registered ${toolRegistry.getToolCount()} tools`);
    for (const tool of toolRegistry.getAllTools()) {
      logger.info(`- ${tool.config.name}: ${tool.config.description}`);
    }
    
    // Create a sample transcript for testing
    const sampleTranscript = createSampleTranscript();
    
    // Execute the action extraction tool
    logger.info('Executing action extraction tool...');
    
    const result = await toolExecutor.executeTool(
      'action-extraction',
      { 
        transcript: sampleTranscript,
        options: {
          minConfidence: 0.6,
          assignParticipants: true,
          maxActionItems: 5
        }
      },
      {
        sessionId: 'test-session-123',
        agentId: 'test-agent-456',
        userId: 'test-user-789'
      }
    );
    
    // Log the result
    if (result.status === ToolExecutionStatus.SUCCESS) {
      logger.info(`Tool executed successfully, found ${result.data.actionItems.length} action items`);
      
      for (const item of result.data.actionItems) {
        logger.info(`- ${item.text}${item.assignedTo ? ` (Assigned to: ${item.assignedTo.join(', ')})` : ''}`);
      }
      
      logger.info(`Execution time: ${result.executionTime}ms`);
    } else {
      logger.error(`Tool execution failed: ${result.error}`);
    }
    
    // Test tool with invalid parameters
    logger.info('\nTesting tool with invalid parameters...');
    
    const invalidResult = await toolExecutor.executeTool(
      'action-extraction',
      { 
        // Missing required transcript field
        options: { minConfidence: 0.5 }
      }
    );
    
    if (invalidResult.status === ToolExecutionStatus.ERROR) {
      logger.info('Invalid parameters correctly rejected');
    }
    
    // Test fallback mechanisms
    logger.info('\nTesting fallback mechanisms...');
    
    // Create a test error
    const testError = new Error('Simulated error for testing fallbacks');
    
    // Test FallbackMechanismService
    const fallbackResult = await fallbackService.handleError(
      'action-extraction',
      testError,
      { transcript: sampleTranscript },
      'test-execution-id-fallback'
    );
    
    if (fallbackResult && fallbackResult.status === ToolExecutionStatus.SUCCESS) {
      logger.info('Fallback mechanism successfully recovered from simulated error');
      logger.info(`Fallback found ${fallbackResult.data.actionItems.length} action items`);
    } else {
      logger.warn('Fallback mechanism could not recover from simulated error');
    }
    
    // Get tool usage analytics
    logger.info('\nTool usage analytics:');
    const analytics = toolUsageLogger.getToolUsageAnalytics();
    logger.info(`Total executions: ${analytics.totalToolExecutions}`);
    logger.info(`Success rate: ${(analytics.successRate * 100).toFixed(1)}%`);
    logger.info(`Average execution time: ${analytics.averageExecutionTime.toFixed(2)}ms`);
    
    logger.info('\nTool integration test completed successfully');
  } catch (error) {
    logger.error('Test failed with error', { error });
  }
}

/**
 * Create a sample transcript for testing
 */
function createSampleTranscript() {
  const now = new Date();
  const startTime = new Date(now.getTime() - 3600000); // 1 hour ago
  
  // Sample participants
  const participants = [
    { id: 'p1', name: 'Alice', role: 'Product Manager', isHost: true },
    { id: 'p2', name: 'Bob', role: 'Developer' },
    { id: 'p3', name: 'Charlie', role: 'Designer' },
    { id: 'p4', name: 'Diana', role: 'Engineering Manager' }
  ];
  
  // Sample utterances
  const utterances = [
    {
      speakerId: 'p1',
      text: 'Welcome everyone to our weekly planning meeting. Today we need to discuss the new feature rollout.',
      startTime: new Date(startTime.getTime() + 0),
      endTime: new Date(startTime.getTime() + 10000),
    },
    {
      speakerId: 'p2',
      text: 'I have completed the backend API for user authentication. I will prepare documentation by Friday.',
      startTime: new Date(startTime.getTime() + 11000),
      endTime: new Date(startTime.getTime() + 20000),
    },
    {
      speakerId: 'p3',
      text: 'The UI designs are almost ready. I need another day to finalize the mobile layouts.',
      startTime: new Date(startTime.getTime() + 21000),
      endTime: new Date(startTime.getTime() + 30000),
    },
    {
      speakerId: 'p1',
      text: 'Great progress! Bob, can you help Charlie with implementing those designs next week?',
      startTime: new Date(startTime.getTime() + 31000),
      endTime: new Date(startTime.getTime() + 40000),
    },
    {
      speakerId: 'p2',
      text: 'Sure, I should be available by Tuesday after I finish the documentation work.',
      startTime: new Date(startTime.getTime() + 41000),
      endTime: new Date(startTime.getTime() + 50000),
    },
    {
      speakerId: 'p4',
      text: 'We need to finalize the test plan before we proceed. Charlie and I will work on creating test scenarios.',
      startTime: new Date(startTime.getTime() + 51000),
      endTime: new Date(startTime.getTime() + 60000),
    },
    {
      speakerId: 'p1',
      text: 'Perfect. As an action item, I will update the project timeline and share it with everyone by tomorrow.',
      startTime: new Date(startTime.getTime() + 61000),
      endTime: new Date(startTime.getTime() + 70000),
    },
    {
      speakerId: 'p4',
      text: 'One more thing: we must schedule a security review before launch. This is critical.',
      startTime: new Date(startTime.getTime() + 71000),
      endTime: new Date(startTime.getTime() + 80000),
    },
    {
      speakerId: 'p1',
      text: 'Good point. I will set that up for next Thursday. Any other concerns?',
      startTime: new Date(startTime.getTime() + 81000),
      endTime: new Date(startTime.getTime() + 90000),
    },
    {
      speakerId: 'p3',
      text: 'Just a reminder that we need to update the design system documentation as well.',
      startTime: new Date(startTime.getTime() + 91000),
      endTime: new Date(startTime.getTime() + 100000),
    }
  ];
  
  // Create the transcript
  return {
    id: crypto.randomUUID(),
    meetingId: 'meeting-123',
    participants,
    utterances,
    language: 'en',
    startTime,
    endTime: new Date(startTime.getTime() + 3600000),
    metadata: {
      title: 'Weekly Planning Meeting',
      project: 'Feature X Launch'
    }
  };
}

// Run the test
runTest().catch(console.error); 