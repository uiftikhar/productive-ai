import { jest } from '@jest/globals';

import { v4 as uuid } from 'uuid';
import { ConsoleLogger } from '../../shared/logger/console-logger.ts';
import { MessageType } from '../messaging/agent-message.interface.ts';
import { CommunicationBusService } from '../messaging/communication-bus.service.ts';
import { EnhancedWorkflowExecutorService } from '../orchestration/enhanced-workflow-executor.service.ts';
import { WorkflowDefinition } from '../orchestration/workflow-definition.service.ts';
import { AgentDiscoveryService } from '../services/agent-discovery.service.ts';
import { AgentRegistryService } from '../services/agent-registry.service.ts';

// Mock dependencies
jest.mock('../services/agent-registry.service');
jest.mock('../services/agent-discovery.service');
jest.mock('../messaging/communication-bus.service');

// Helper function to create a mock agent
const createMockAgent = (id: string, name: string, capabilities: string[]) => ({
  id,
  name,
  description: `Test agent for ${name}`,
  capabilities,
  execute: jest.fn().mockImplementation(async (request) => {
    return {
      output: `Mock response from ${name}`,
      artifacts: {
        testArtifact: `Test artifact from ${name}`,
        requestInput: request.input
      }
    };
  })
});

describe('EnhancedWorkflowExecutorService Integration Tests', () => {
  let workflowExecutor: EnhancedWorkflowExecutorService;
  let registry: jest.Mocked<AgentRegistryService>;
  let discovery: jest.Mocked<AgentDiscoveryService>;
  let communicationBus: jest.Mocked<CommunicationBusService>;
  let logger: ConsoleLogger;
  
  // Sample workflow definition
  const testWorkflow: WorkflowDefinition = {
    id: 'test-workflow-id',
    name: 'test-workflow',
    description: 'Test workflow for integration tests',
    startAt: 'retrieveKnowledge',
    version: '1.0.0',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    steps: [
      {
        id: 'retrieveKnowledge',
        name: 'Retrieve Knowledge',
        description: 'Retrieve relevant knowledge',
        capability: 'retrieve_knowledge',
        parameters: () => ({
          strategy: 'hybrid',
          maxItems: 5,
          minRelevanceScore: 0.6
        }),
        onSuccess: ['processContext']
      },
      {
        id: 'processContext',
        name: 'Process Context',
        description: 'Process the retrieved context',
        capability: 'process_context',
        onSuccess: ['generateResponse']
      },
      {
        id: 'generateResponse',
        name: 'Generate Response',
        description: 'Generate a response using the context',
        capability: 'generate_response'
      }
    ],
    branches: []
  };

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Create a mocked subscription ID
    const mockSubscriptionId = uuid();
    
    // Setup mocked registry
    registry = AgentRegistryService.getInstance() as jest.Mocked<AgentRegistryService>;
    registry.getAgentById = jest.fn().mockImplementation((id) => {
      const agents = {
        'knowledge-retrieval': createMockAgent('knowledge-retrieval', 'Knowledge Retrieval Agent', ['retrieve_knowledge']),
        'context-processor': createMockAgent('context-processor', 'Context Processor Agent', ['process_context']),
        'response-generator': createMockAgent('response-generator', 'Response Generator Agent', ['generate_response'])
      };
      return agents[id] || null;
    });
    
    registry.findAgentByCapability = jest.fn().mockImplementation((capability) => {
      const capabilityMap = {
        'retrieve_knowledge': createMockAgent('knowledge-retrieval', 'Knowledge Retrieval Agent', ['retrieve_knowledge']),
        'process_context': createMockAgent('context-processor', 'Context Processor Agent', ['process_context']),
        'generate_response': createMockAgent('response-generator', 'Response Generator Agent', ['generate_response'])
      };
      return capabilityMap[capability] || null;
    });
    
    // Setup mocked discovery
    discovery = AgentDiscoveryService.getInstance() as jest.Mocked<AgentDiscoveryService>;
    discovery.discoverAgent = jest.fn().mockImplementation(({ capability }) => {
      const capabilityMap = {
        'retrieve_knowledge': { agentId: 'knowledge-retrieval', score: 0.95 },
        'process_context': { agentId: 'context-processor', score: 0.9 },
        'generate_response': { agentId: 'response-generator', score: 0.85 }
      };
      return capabilityMap[capability] || null;
    });
    
    // Setup mocked communication bus
    communicationBus = CommunicationBusService.getInstance() as jest.Mocked<CommunicationBusService>;
    communicationBus.subscribe = jest.fn().mockReturnValue(mockSubscriptionId);
    communicationBus.publish = jest.fn().mockResolvedValue(undefined);
    communicationBus.unsubscribe = jest.fn().mockReturnValue(true);
    
    // Setup logger
    logger = new ConsoleLogger();
    logger.setLogLevel('error'); // Reduce noise in tests
    
    // Create the workflow executor instance
    workflowExecutor = EnhancedWorkflowExecutorService.getInstance({
      logger,
      registry,
      discovery,
      communicationBus
    });
  });
  
  test('Should execute a complete workflow', async () => {
    // Setup test input and options
    const input = 'Test user query about project status';
    const options = {
      userId: 'test-user-123',
      conversationId: 'test-conversation-456',
      streamingCallback: jest.fn(),
      discoveryOptions: {
        performanceWeight: 0.7,
        reliabilityWeight: 0.3
      }
    };
    
    // Execute the workflow
    const result = await workflowExecutor.executeWorkflow(
      testWorkflow,
      input,
      options
    );
    
    // Test assertions
    expect(result).toBeDefined();
    expect(result.workflowInstanceId).toBeDefined();
    expect(result.result).toBeDefined();
    expect(result.steps.length).toBeGreaterThanOrEqual(3); // At least our 3 steps
    
    // Verify step execution
    const stepIds = result.steps.map(step => step.stepId);
    expect(stepIds).toContain('retrieveKnowledge');
    expect(stepIds).toContain('processContext');
    expect(stepIds).toContain('generateResponse');
    
    // Verify agent discovery was used
    expect(discovery.discoverAgent).toHaveBeenCalledTimes(3);
    expect(discovery.discoverAgent).toHaveBeenCalledWith(
      expect.objectContaining({ capability: 'retrieve_knowledge' })
    );
    
    // Verify message bus was used
    expect(communicationBus.subscribe).toHaveBeenCalledTimes(1);
    expect(communicationBus.publish).toHaveBeenCalledTimes(2); // Start and completion messages
    expect(communicationBus.unsubscribe).toHaveBeenCalledTimes(1);
    
    // Verify metrics
    expect(result.metrics).toBeDefined();
    expect(result.metrics.totalExecutionTimeMs).toBeGreaterThan(0);
    expect(Object.keys(result.metrics.stepMetrics).length).toBeGreaterThanOrEqual(3);
  });
  
  test('Should handle errors during workflow execution', async () => {
    // Setup test input and options
    const input = 'Test user query that will cause an error';
    const options = {
      userId: 'test-user-123',
      conversationId: 'test-conversation-456'
    };
    
    // Make one of the agents throw an error
    const errorAgent = createMockAgent('context-processor', 'Context Processor Agent', ['process_context']);
    errorAgent.execute = jest.fn().mockRejectedValue(new Error('Test error from context processor'));
    
    registry.findAgentByCapability = jest.fn().mockImplementation((capability) => {
      if (capability === 'process_context') {
        return errorAgent;
      }
      
      const capabilityMap = {
        'retrieve_knowledge': createMockAgent('knowledge-retrieval', 'Knowledge Retrieval Agent', ['retrieve_knowledge']),
        'generate_response': createMockAgent('response-generator', 'Response Generator Agent', ['generate_response'])
      };
      
      return capabilityMap[capability] || null;
    });
    
    // Execute the workflow
    const result = await workflowExecutor.executeWorkflow(
      testWorkflow,
      input,
      options
    );
    
    // Test assertions
    expect(result).toBeDefined();
    expect(result.error).toBeDefined();
    expect(result.error).toContain('Test error from context processor');
    
    // Verify error message was published
    const errorMessageCall = communicationBus.publish.mock.calls.find(call => 
      call[0].content.type === MessageType.WORKFLOW_FAILED
    );
    
    expect(errorMessageCall).toBeDefined();
  });
  
  test('Should execute the adaptive query workflow', async () => {
    // Setup test input and options
    const input = 'What is the status of the project?';
    const options = {
      userId: 'test-user-123',
      conversationId: 'test-conversation-456',
      streamingCallback: jest.fn()
    };
    
    // Get the adaptive query workflow
    const adaptiveWorkflow = workflowExecutor.createAdaptiveQueryWorkflow();
    
    // Execute the workflow
    const result = await workflowExecutor.executeWorkflow(
      adaptiveWorkflow,
      input,
      options
    );
    
    // Test assertions
    expect(result).toBeDefined();
    expect(result.workflowInstanceId).toBeDefined();
    expect(result.steps.length).toBeGreaterThanOrEqual(2); // At least knowledge retrieval and response generation
    
    // Verify streaming callback was used if response was generated
    const responseStep = result.steps.find(step => step.stepId === 'generateResponse');
    if (responseStep && responseStep.status === 'completed') {
      expect(options.streamingCallback).toHaveBeenCalled();
    }
  });
  
  test('Should pass user-provided variables to the workflow', async () => {
    // Setup test input and options with initial variables
    const input = 'Test user query with variables';
    const options = {
      userId: 'test-user-123',
      conversationId: 'test-conversation-456',
      initialVariables: {
        testVar1: 'Test variable 1',
        testVar2: { key: 'value' },
        modelSettings: {
          temperature: 0.7,
          maxTokens: 500
        }
      }
    };
    
    // Execute the workflow
    const result = await workflowExecutor.executeWorkflow(
      testWorkflow,
      input,
      options
    );
    
    // Check if the variables were properly passed to the knowledge retrieval agent
    const knowledgeAgentCall = registry.findAgentByCapability('retrieve_knowledge').execute.mock.calls[0];
    
    expect(knowledgeAgentCall).toBeDefined();
    
    const requestContext = knowledgeAgentCall[0];
    expect(requestContext.parameters).toBeDefined();
    expect(requestContext.context).toBeDefined();
    expect(requestContext.context.variables).toMatchObject({
      testVar1: 'Test variable 1',
      testVar2: { key: 'value' },
      modelSettings: {
        temperature: 0.7,
        maxTokens: 500
      }
    });
  });
}); 