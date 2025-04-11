import { jest } from '@jest/globals';
import { MasterOrchestratorAgent } from '../orchestration/master-orchestrator.ts';
import { EnhancedOrchestratorService } from '../orchestration/enhanced-orchestrator.service.ts';
import { WorkflowDefinitionService } from '../orchestration/workflow-definition.service.ts';
import { AgentRegistryService } from '../services/agent-registry.service.ts';
import { AgentCommunicationBus } from '../messaging/communication-bus-agent.ts';
import { ConsoleLogger } from '../../shared/logger/console-logger.ts';
import { AgentMessageType } from '../messaging/messaging-agent.ts';
import { v4 as uuid } from 'uuid';

// Mock dependencies
jest.mock('../orchestration/enhanced-orchestrator.service');
jest.mock('../orchestration/workflow-definition.service');
jest.mock('../services/agent-registry.service');
jest.mock('../messaging/communication-bus-agent');

describe('MasterOrchestratorAgent Integration Tests', () => {
  let masterOrchestrator: MasterOrchestratorAgent;
  let orchestratorService: jest.Mocked<EnhancedOrchestratorService>;
  let workflowDefinitionService: jest.Mocked<WorkflowDefinitionService>;
  let registry: jest.Mocked<AgentRegistryService>;
  let communicationBus: jest.Mocked<AgentCommunicationBus>;
  let logger: ConsoleLogger;
  
  // Sample workflow definitions
  const sampleWorkflows = [
    {
      id: 'workflow-1',
      name: 'knowledge-query',
      description: 'Workflow for handling knowledge queries',
      startAt: 'retrieveKnowledge',
      version: '1.0.0',
      createdAt: Date.now() - 86400000,
      updatedAt: Date.now() - 86400000,
      steps: [
        {
          id: 'retrieveKnowledge',
          name: 'Retrieve Knowledge',
          description: 'Retrieve relevant knowledge',
          capability: 'retrieve_knowledge',
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
    },
    {
      id: 'workflow-2',
      name: 'task-management',
      description: 'Workflow for handling task management',
      startAt: 'parseTask',
      version: '1.0.0',
      createdAt: Date.now() - 43200000,
      updatedAt: Date.now() - 43200000,
      steps: [
        {
          id: 'parseTask',
          name: 'Parse Task',
          description: 'Parse and understand the task',
          capability: 'parse_task',
          onSuccess: ['routeTask']
        },
        {
          id: 'routeTask',
          name: 'Route Task',
          description: 'Route the task to appropriate handler',
          capability: 'route_task',
          onSuccess: ['executeTask']
        },
        {
          id: 'executeTask',
          name: 'Execute Task',
          description: 'Execute the task',
          capability: 'execute_task'
        }
      ],
      branches: []
    }
  ];
  
  // Sample workflow execution result
  const sampleExecutionResult = {
    workflowInstanceId: uuid(),
    result: 'Sample workflow execution result',
    steps: [
      {
        id: 'execution-1',
        stepId: 'retrieveKnowledge',
        name: 'Retrieve Knowledge',
        agentId: 'knowledge-retrieval',
        capability: 'retrieve_knowledge',
        input: 'What are the project deadlines?',
        output: 'Retrieved 3 relevant knowledge items',
        status: 'completed',
        startTime: Date.now() - 2000,
        endTime: Date.now() - 1000,
        executionTimeMs: 1000
      },
      {
        id: 'execution-2',
        stepId: 'generateResponse',
        name: 'Generate Response',
        agentId: 'response-generator',
        capability: 'generate_response',
        input: 'What are the project deadlines?',
        output: 'The project has three deadlines: Phase 1 (June), Phase 2 (August), and Final Release (October)',
        status: 'completed',
        startTime: Date.now() - 1000,
        endTime: Date.now() - 500,
        executionTimeMs: 500
      }
    ],
    metrics: {
      totalExecutionTimeMs: 1500,
      stepMetrics: {
        'retrieveKnowledge': {
          executionTimeMs: 1000,
          agentId: 'knowledge-retrieval',
          capability: 'retrieve_knowledge',
          success: true
        },
        'generateResponse': {
          executionTimeMs: 500,
          agentId: 'response-generator',
          capability: 'generate_response',
          success: true
        }
      }
    },
    metadata: {
      executionTime: 1500
    },
    messages: []
  };
  
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Setup logger
    logger = new ConsoleLogger();
    logger.setLogLevel('error'); // Reduce noise in tests
    
    // Setup mocked EnhancedOrchestratorService
    orchestratorService = new EnhancedOrchestratorService() as jest.Mocked<EnhancedOrchestratorService>;
    orchestratorService.executeWorkflow = jest.fn().mockResolvedValue(sampleExecutionResult);
    orchestratorService.getActiveExecutions = jest.fn().mockReturnValue([]);
    
    // Setup mocked WorkflowDefinitionService
    workflowDefinitionService = new WorkflowDefinitionService() as jest.Mocked<WorkflowDefinitionService>;
    workflowDefinitionService.listWorkflows = jest.fn().mockReturnValue(sampleWorkflows);
    workflowDefinitionService.getWorkflow = jest.fn().mockImplementation((id) => {
      return sampleWorkflows.find(w => w.id === id) || null;
    });
    workflowDefinitionService.getWorkflowByName = jest.fn().mockImplementation((name) => {
      return sampleWorkflows.find(w => w.name === name) || null;
    });
    
    // Setup mocked AgentRegistryService
    registry = AgentRegistryService.getInstance() as jest.Mocked<AgentRegistryService>;
    
    // Setup mocked AgentCommunicationBus
    communicationBus = new AgentCommunicationBus() as jest.Mocked<AgentCommunicationBus>;
    communicationBus.subscribe = jest.fn().mockReturnValue(uuid());
    communicationBus.publish = jest.fn().mockResolvedValue(undefined);
    communicationBus.request = jest.fn().mockResolvedValue({
      type: AgentMessageType.RESPONSE,
      content: {
        result: 'Mock agent response'
      }
    });
    
    // Create the MasterOrchestratorAgent instance
    masterOrchestrator = new MasterOrchestratorAgent({
      orchestratorService,
      workflowDefinitionService,
      registry,
      communicationBus,
      logger
    });
  });
  
  test('Should execute a workflow by name', async () => {
    // Prepare request with workflow name
    const request = {
      input: 'What are the project deadlines?',
      parameters: {
        workflowName: 'knowledge-query',
        userId: 'test-user-123',
        conversationId: 'test-conversation-456'
      }
    };
    
    // Execute the agent
    const response = await masterOrchestrator.execute(request);
    
    // Test assertions
    expect(response).toBeDefined();
    expect(response.output).toBeDefined();
    expect(response.artifacts).toBeDefined();
    expect(response.artifacts.workflowInstanceId).toBe(sampleExecutionResult.workflowInstanceId);
    expect(response.artifacts.workflowResult).toBe(sampleExecutionResult.result);
    
    // Verify workflow was retrieved and executed
    expect(workflowDefinitionService.getWorkflowByName).toHaveBeenCalledWith('knowledge-query');
    expect(orchestratorService.executeWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'knowledge-query'
      }),
      'What are the project deadlines?',
      expect.objectContaining({
        userId: 'test-user-123',
        conversationId: 'test-conversation-456'
      })
    );
  });
  
  test('Should execute a workflow by ID', async () => {
    // Prepare request with workflow ID
    const request = {
      input: 'Create a new task for the team',
      parameters: {
        workflowId: 'workflow-2',
        userId: 'test-user-123',
        conversationId: 'test-conversation-456'
      }
    };
    
    // Mock execution result for this specific workflow
    orchestratorService.executeWorkflow = jest.fn().mockResolvedValue({
      ...sampleExecutionResult,
      workflowInstanceId: uuid(),
      result: 'Task created successfully'
    });
    
    // Execute the agent
    const response = await masterOrchestrator.execute(request);
    
    // Test assertions
    expect(response).toBeDefined();
    expect(response.output).toBeDefined();
    expect(response.artifacts).toBeDefined();
    
    // Verify workflow was retrieved and executed
    expect(workflowDefinitionService.getWorkflow).toHaveBeenCalledWith('workflow-2');
    expect(orchestratorService.executeWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'workflow-2',
        name: 'task-management'
      }),
      'Create a new task for the team',
      expect.objectContaining({
        userId: 'test-user-123',
        conversationId: 'test-conversation-456'
      })
    );
  });
  
  test('Should select appropriate workflow for input query when not specified', async () => {
    // Prepare request without specifying workflow
    const request = {
      input: 'What are the key risks identified in the last meeting?',
      parameters: {
        userId: 'test-user-123',
        conversationId: 'test-conversation-456'
      }
    };
    
    // Mock the workflow selection
    workflowDefinitionService.findWorkflowForInput = jest.fn().mockReturnValue(sampleWorkflows[0]);
    
    // Execute the agent
    const response = await masterOrchestrator.execute(request);
    
    // Test assertions
    expect(response).toBeDefined();
    expect(response.output).toBeDefined();
    
    // Verify workflow was selected and executed
    expect(workflowDefinitionService.findWorkflowForInput).toHaveBeenCalledWith(
      'What are the key risks identified in the last meeting?'
    );
    expect(orchestratorService.executeWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'workflow-1',
        name: 'knowledge-query'
      }),
      'What are the key risks identified in the last meeting?',
      expect.any(Object)
    );
  });
  
  test('Should handle workflow execution errors', async () => {
    // Prepare request
    const request = {
      input: 'This will cause an error',
      parameters: {
        workflowName: 'non-existent-workflow',
        userId: 'test-user-123'
      }
    };
    
    // Mock workflow not found
    workflowDefinitionService.getWorkflowByName = jest.fn().mockReturnValue(null);
    
    // Execute the agent
    const response = await masterOrchestrator.execute(request);
    
    // Test assertions
    expect(response).toBeDefined();
    expect(response.output).toContain('error');
    expect(response.artifacts.error).toBeDefined();
    
    // Verify orchestrator service was not called
    expect(orchestratorService.executeWorkflow).not.toHaveBeenCalled();
  });
  
  test('Should handle workflow execution failure', async () => {
    // Prepare request
    const request = {
      input: 'This will cause workflow execution to fail',
      parameters: {
        workflowName: 'knowledge-query',
        userId: 'test-user-123'
      }
    };
    
    // Mock workflow execution failure
    orchestratorService.executeWorkflow = jest.fn().mockRejectedValue(
      new Error('Workflow execution failed: Unknown agent capability')
    );
    
    // Execute the agent
    const response = await masterOrchestrator.execute(request);
    
    // Test assertions
    expect(response).toBeDefined();
    expect(response.output).toContain('failed');
    expect(response.artifacts.error).toContain('Workflow execution failed');
  });
  
  test('Should execute workflow with streaming enabled', async () => {
    // Prepare request with streaming
    const request = {
      input: 'Generate a detailed report',
      parameters: {
        workflowName: 'knowledge-query',
        userId: 'test-user-123',
        streamingEnabled: true
      }
    };
    
    // Mock streaming callback collection
    const streamingTokens: string[] = [];
    const mockStreamingCallback = (token: string) => {
      streamingTokens.push(token);
    };
    
    // Execute the agent
    const response = await masterOrchestrator.execute(request, {
      streamingCallback: mockStreamingCallback
    });
    
    // Test assertions
    expect(response).toBeDefined();
    
    // Verify streaming was enabled in workflow execution
    expect(orchestratorService.executeWorkflow).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(String),
      expect.objectContaining({
        streamingCallback: expect.any(Function)
      })
    );
  });
  
  test('Should include workflow metadata and variables', async () => {
    // Prepare request with metadata and variables
    const request = {
      input: 'What is the project status?',
      parameters: {
        workflowName: 'knowledge-query',
        userId: 'test-user-123',
        metadata: {
          priority: 'high',
          source: 'mobile-app'
        },
        variables: {
          contextTypes: ['project', 'status'],
          maxResultCount: 10,
          modelSettings: {
            temperature: 0.7
          }
        }
      }
    };
    
    // Execute the agent
    const response = await masterOrchestrator.execute(request);
    
    // Test assertions
    expect(response).toBeDefined();
    
    // Verify metadata and variables were passed to workflow execution
    expect(orchestratorService.executeWorkflow).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(String),
      expect.objectContaining({
        metadata: {
          priority: 'high',
          source: 'mobile-app'
        },
        initialVariables: {
          contextTypes: ['project', 'status'],
          maxResultCount: 10,
          modelSettings: {
            temperature: 0.7
          }
        }
      })
    );
  });
}); 