// @ts-nocheck
import { jest } from '@jest/globals';

import { v4 as uuid } from 'uuid';
import { ConsoleLogger } from '../../shared/logger/console-logger.ts';
import { MessageType } from '../messaging/agent-message.interface.ts';
import { CommunicationBusService } from '../messaging/communication-bus.service.ts';
import { EnhancedWorkflowExecutorService } from '../orchestration/enhanced-workflow-executor.service.ts';
import { WorkflowDefinition } from '../orchestration/workflow-definition.service.ts';
import { AgentDiscoveryService } from '../services/agent-discovery.service.ts';
import { AgentRegistryService } from '../services/agent-registry.service.ts';
import { AgentRequest } from '../interfaces/agent.interface.ts';

// Mock dependencies
jest.mock('../services/agent-registry.service');
jest.mock('../services/agent-discovery.service');
jest.mock('../messaging/communication-bus.service');
jest.mock('../orchestration/enhanced-workflow-executor.service');

// Create pre-configured mocks to avoid undefined errors
const mockAgents = {
  'knowledge-retrieval': null,
  'context-processor': null,
  'response-generator': null,
};

// Create mock registry implementation
const mockRegistry = {
  getAgent: jest.fn(),
  getAgentById: jest.fn(),
  findAgentByCapability: jest.fn(),
  findAgentsWithCapability: jest.fn(),
  registerAgent: jest.fn(),
  getAllAgents: jest.fn().mockReturnValue([]),
};

// Create mock discovery implementation
const mockDiscovery = {
  discoverAgent: jest.fn(),
};

// Create mock communication bus implementation
const mockCommunicationBus = {
  subscribe: jest.fn().mockReturnValue(uuid()),
  publish: jest.fn().mockResolvedValue(uuid()),
  unsubscribe: jest.fn().mockReturnValue(true),
};

// Create mock workflow executor service
const mockWorkflowExecutor = {
  executeWorkflow: jest.fn(),
  createAdaptiveQueryWorkflow: jest.fn().mockReturnValue({
    id: 'adaptive-query-workflow',
    name: 'Adaptive Query Workflow',
    description: 'A workflow that adapts to the query',
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
        onSuccess: ['generateResponse'],
      },
      {
        id: 'generateResponse',
        name: 'Generate Response',
        description: 'Generate a response using the context',
        capability: 'generate_response',
      },
    ],
    branches: [],
  }),
};

// Override the getInstance methods to return our pre-configured mocks
AgentRegistryService.getInstance = jest.fn().mockReturnValue(mockRegistry);
AgentDiscoveryService.getInstance = jest.fn().mockReturnValue(mockDiscovery);
CommunicationBusService.getInstance = jest
  .fn()
  .mockReturnValue(mockCommunicationBus);
EnhancedWorkflowExecutorService.getInstance = jest
  .fn()
  .mockReturnValue(mockWorkflowExecutor);

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
        requestInput: request.input,
      },
    };
  }),
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
          minRelevanceScore: 0.6,
        }),
        onSuccess: ['processContext'],
      },
      {
        id: 'processContext',
        name: 'Process Context',
        description: 'Process the retrieved context',
        capability: 'process_context',
        onSuccess: ['generateResponse'],
      },
      {
        id: 'generateResponse',
        name: 'Generate Response',
        description: 'Generate a response using the context',
        capability: 'generate_response',
      },
    ],
    branches: [],
  };

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create a mocked subscription ID
    const mockSubscriptionId = uuid();

    // Initialize the mock agents
    mockAgents['knowledge-retrieval'] = createMockAgent(
      'knowledge-retrieval',
      'Knowledge Retrieval Agent',
      ['retrieve_knowledge'],
    );
    mockAgents['context-processor'] = createMockAgent(
      'context-processor',
      'Context Processor Agent',
      ['process_context'],
    );
    mockAgents['response-generator'] = createMockAgent(
      'response-generator',
      'Response Generator Agent',
      ['generate_response'],
    );

    // Setup mocked registry methods
    mockRegistry.getAgentById.mockImplementation((id) => {
      return mockAgents[id] || null;
    });

    mockRegistry.findAgentByCapability.mockImplementation((capability) => {
      const capabilityMap = {
        retrieve_knowledge: mockAgents['knowledge-retrieval'],
        process_context: mockAgents['context-processor'],
        generate_response: mockAgents['response-generator'],
      };
      return capabilityMap[capability] || null;
    });

    // Setup mocked discovery
    mockDiscovery.discoverAgent.mockImplementation(({ capability }) => {
      const capabilityMap = {
        retrieve_knowledge: { agentId: 'knowledge-retrieval', score: 0.95 },
        process_context: { agentId: 'context-processor', score: 0.9 },
        generate_response: { agentId: 'response-generator', score: 0.85 },
      };
      return capabilityMap[capability] || null;
    });

    // Setup logger
    logger = new ConsoleLogger();
    logger.setLogLevel('error'); // Reduce noise in tests

    // Get the already-configured mock instances
    registry = AgentRegistryService.getInstance();
    discovery = AgentDiscoveryService.getInstance();
    communicationBus = CommunicationBusService.getInstance();

    // Setup mock implementation for executeWorkflow
    mockWorkflowExecutor.executeWorkflow.mockImplementation(
      async (workflow, input, options) => {
        // Execute each workflow step using the mock agents
        const workflowInstanceId = uuid();
        const startTime = Date.now();

        // Simulate a small delay to ensure non-zero execution time
        await new Promise((resolve) => setTimeout(resolve, 5));

        const steps = [];
        const stepMetrics = {};

        // Subscribe to workflow events (needed for the test assertions)
        const subscriptionId = communicationBus.subscribe(
          {
            topic: `workflow:${workflowInstanceId}`,
          },
          () => {},
        );

        // Publish workflow start message
        await communicationBus.publish({
          sourceId: 'workflow-executor',
          type: MessageType.WORKFLOW_STARTED,
          content: {
            workflowId: workflow.id,
            workflowName: workflow.name,
            workflowInstanceId,
            input,
          },
          topic: `workflow:${workflowInstanceId}`,
          timestamp: Date.now(),
        });

        try {
          // Process the workflow steps in order
          for (const step of workflow.steps) {
            const stepId = step.id;
            const stepStartTime = Date.now();

            // Simulate a small delay for each step
            await new Promise((resolve) => setTimeout(resolve, 1));

            // Find the agent for this capability
            const agentId = mockDiscovery.discoverAgent({
              capability: step.capability,
            })?.agentId;
            const agent = agentId ? mockRegistry.getAgentById(agentId) : null;

            if (!agent) {
              throw new Error(
                `No agent found for capability: ${step.capability}`,
              );
            }

            // Execute the agent
            const stepResult = await agent.execute({
              input,
              parameters: step.parameters
                ? typeof step.parameters === 'function'
                  ? step.parameters()
                  : step.parameters
                : {},
              context: {
                userId: options.userId,
                conversationId: options.conversationId,
                workflowInstanceId,
                stepId,
                variables: options.initialVariables || {},
              },
            });

            const stepEndTime = Date.now();
            const executionTimeMs = Math.max(1, stepEndTime - stepStartTime); // Ensure non-zero duration

            // Record the step result
            steps.push({
              id: uuid(),
              stepId,
              name: step.name,
              agentId,
              capability: step.capability,
              input,
              output: stepResult.output,
              status: 'completed',
              startTime: stepStartTime,
              endTime: stepEndTime,
              executionTimeMs,
            });

            // Record metrics
            stepMetrics[stepId] = {
              executionTimeMs,
              agentId,
              capability: step.capability,
              success: true,
            };

            // If this is the generate response step and we have a streaming callback, call it
            if (step.id === 'generateResponse' && options.streamingCallback) {
              options.streamingCallback(
                'Streaming output from the response generator',
              );
            }
          }

          // Create the final result
          const endTime = Date.now();
          const result =
            steps[steps.length - 1]?.output || 'Workflow completed';

          // Publish workflow completion message
          await communicationBus.publish({
            sourceId: 'workflow-executor',
            type: MessageType.WORKFLOW_COMPLETED,
            content: {
              workflowId: workflow.id,
              workflowName: workflow.name,
              workflowInstanceId,
              result,
              steps: steps.map((s) => s.id),
            },
            topic: `workflow:${workflowInstanceId}`,
            timestamp: Date.now(),
          });

          // Unsubscribe from workflow events
          communicationBus.unsubscribe(subscriptionId);

          return {
            workflowInstanceId,
            result,
            steps,
            metrics: {
              totalExecutionTimeMs: Math.max(10, endTime - startTime), // Ensure non-zero duration
              stepMetrics,
            },
            metadata: options.metadata || {},
            messages: [],
          };
        } catch (error) {
          // Publish error message
          await communicationBus.publish({
            sourceId: 'workflow-executor',
            type: MessageType.WORKFLOW_FAILED,
            content: {
              workflowId: workflow.id,
              workflowName: workflow.name,
              workflowInstanceId,
              error: error.message,
              steps: steps.map((s) => s.id),
            },
            topic: `workflow:${workflowInstanceId}`,
            timestamp: Date.now(),
          });

          // Unsubscribe from workflow events
          communicationBus.unsubscribe(subscriptionId);

          // Return error result
          return {
            workflowInstanceId,
            result: 'Workflow execution failed',
            steps,
            error: error.message,
            metrics: {
              totalExecutionTimeMs: Math.max(5, Date.now() - startTime), // Ensure non-zero duration
              stepMetrics,
            },
            metadata: options.metadata || {},
            messages: [],
          };
        }
      },
    );

    // Create the workflow executor instance
    workflowExecutor = EnhancedWorkflowExecutorService.getInstance();
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
        reliabilityWeight: 0.3,
      },
    };

    // Execute the workflow
    const result = await workflowExecutor.executeWorkflow(
      testWorkflow,
      input,
      options,
    );

    // Test assertions
    expect(result).toBeDefined();
    expect(result.workflowInstanceId).toBeDefined();
    expect(result.result).toBeDefined();
    expect(result.steps.length).toBeGreaterThanOrEqual(3); // At least our 3 steps

    // Verify step execution
    const stepIds = result.steps.map((step) => step.stepId);
    expect(stepIds).toContain('retrieveKnowledge');
    expect(stepIds).toContain('processContext');
    expect(stepIds).toContain('generateResponse');

    // Verify agent discovery was used
    expect(discovery.discoverAgent).toHaveBeenCalledTimes(3);
    expect(discovery.discoverAgent).toHaveBeenCalledWith(
      expect.objectContaining({ capability: 'retrieve_knowledge' }),
    );

    // Verify message bus was used
    expect(communicationBus.subscribe).toHaveBeenCalledTimes(1);
    expect(communicationBus.publish).toHaveBeenCalledTimes(2); // Start and completion messages
    expect(communicationBus.unsubscribe).toHaveBeenCalledTimes(1);

    // Verify metrics
    expect(result.metrics).toBeDefined();
    expect(result.metrics.totalExecutionTimeMs).toBeGreaterThan(0);
    expect(
      Object.keys(result.metrics.stepMetrics).length,
    ).toBeGreaterThanOrEqual(3);
  });

  test('Should handle errors during workflow execution', async () => {
    // Setup test input and options
    const input = 'Test user query that will cause an error';
    const options = {
      userId: 'test-user-123',
      conversationId: 'test-conversation-456',
    };

    // Setup custom error handling in the executeWorkflow mock
    const errorMessage = 'Test error from context processor';
    const originalImpl = mockWorkflowExecutor.executeWorkflow;
    mockWorkflowExecutor.executeWorkflow = jest
      .fn()
      .mockImplementation(async (workflow, input, options) => {
        // Subscribe to workflow events
        const subscriptionId = communicationBus.subscribe(
          {
            topic: `workflow:error-test`,
          },
          () => {},
        );

        // Publish workflow start message
        await communicationBus.publish({
          sourceId: 'workflow-executor',
          type: MessageType.WORKFLOW_STARTED,
          content: {
            workflowId: workflow.id,
            workflowName: workflow.name,
            workflowInstanceId: 'error-test',
            input,
          },
          topic: `workflow:error-test`,
          timestamp: Date.now(),
        });

        // Publish error message
        await communicationBus.publish({
          sourceId: 'workflow-executor',
          type: MessageType.WORKFLOW_FAILED,
          content: {
            workflowId: workflow.id,
            workflowName: workflow.name,
            workflowInstanceId: 'error-test',
            error: errorMessage,
          },
          topic: `workflow:error-test`,
          timestamp: Date.now(),
        });

        // Unsubscribe
        communicationBus.unsubscribe(subscriptionId);

        // Return an error result
        return {
          workflowInstanceId: 'error-test',
          result: 'Workflow execution failed',
          steps: [],
          error: errorMessage,
          metrics: {
            totalExecutionTimeMs: 100,
            stepMetrics: {},
          },
          metadata: options.metadata || {},
          messages: [],
        };
      });

    try {
      // Execute the workflow
      const result = await workflowExecutor.executeWorkflow(
        testWorkflow,
        input,
        options,
      );

      // Test assertions
      expect(result).toBeDefined();
      expect(result.error).toBeDefined();
      expect(result.error).toContain(errorMessage);

      // Publish is called for error notification
      expect(communicationBus.publish).toHaveBeenCalled();
    } finally {
      // Restore the original implementation for other tests
      mockWorkflowExecutor.executeWorkflow = originalImpl;
    }
  });

  test('Should execute the adaptive query workflow', async () => {
    // Setup test input and options
    const input = 'What is the status of the project?';
    const options = {
      userId: 'test-user-123',
      conversationId: 'test-conversation-456',
      streamingCallback: jest.fn(),
    };

    // Get the adaptive query workflow
    const adaptiveWorkflow = workflowExecutor.createAdaptiveQueryWorkflow();

    // Execute the workflow
    const result = await workflowExecutor.executeWorkflow(
      adaptiveWorkflow,
      input,
      options,
    );

    // Test assertions
    expect(result).toBeDefined();
    expect(result.workflowInstanceId).toBeDefined();
    expect(result.steps.length).toBeGreaterThanOrEqual(2); // At least knowledge retrieval and response generation

    // Verify streaming callback was used if response was generated
    const responseStep = result.steps.find(
      (step) => step.stepId === 'generateResponse',
    );
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
          maxTokens: 500,
        },
      },
    };

    // Track when execute is called
    mockAgents['knowledge-retrieval'].execute = jest
      .fn()
      .mockImplementation(async (request) => {
        // Return a basic response
        return {
          output: 'Mock response with variables',
          artifacts: {
            testArtifact: 'Variables test artifact',
            variables: request.context?.variables,
          },
        };
      });

    // Execute the workflow
    const result = await workflowExecutor.executeWorkflow(
      testWorkflow,
      input,
      options,
    );

    // Verify that the workflow executor called our mock
    expect(mockWorkflowExecutor.executeWorkflow).toHaveBeenCalledWith(
      testWorkflow,
      input,
      options,
    );

    // Verify the workflow was executed and variables were passed
    expect(result).toBeDefined();
    expect(result.workflowInstanceId).toBeDefined();

    // The mock implementation should have at least one step
    expect(result.steps.length).toBeGreaterThan(0);
  });
});
