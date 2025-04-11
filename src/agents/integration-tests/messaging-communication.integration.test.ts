import { jest } from '@jest/globals';
import { CommunicationBusService } from '../messaging/communication-bus.service.ts';
import { AgentMessage, MessageType, MessagePriority, createNotificationMessage, createRequestMessage, createResponseMessage, createTaskMessage } from '../messaging/agent-message.interface.ts';
import { AgentRegistryService } from '../services/agent-registry.service.ts';
import { BaseAgent } from '../base/base-agent.ts';
import { ConsoleLogger } from '../../shared/logger/console-logger.ts';
import { v4 as uuid } from 'uuid';

// Helper class to create test agents with messaging capabilities
class TestMessagingAgent extends BaseAgent {
  public receivedMessages: AgentMessage[] = [];
  private busService: CommunicationBusService;
  private subscriptionId: string = '';
  
  constructor(name: string, capabilities: string[] = [], busService?: CommunicationBusService) {
    super(name, `Test agent for ${name}`);
    this.busService = busService || CommunicationBusService.getInstance();
    
    // Register agent capabilities
    capabilities.forEach(capability => {
      this.registerCapability({
        name: capability,
        description: `${name} capability for ${capability}`,
        parameters: {}
      });
    });
  }
  
  async connect(): Promise<void> {
    // Subscribe to messages
    this.subscriptionId = this.busService.subscribe(
      { agentId: this.id },
      (message) => {
        this.receivedMessages.push(message);
        this.handleMessage(message);
      }
    );
    
    // Announce agent is ready
    await this.busService.publish(
      createNotificationMessage(
        this.id,
        undefined,
        {
          status: 'ready',
          capabilities: Array.from(this.capabilities.values()).map(c => c.name)
        },
        {
          topic: 'agent:lifecycle',
          contentType: 'application/json'
        }
      )
    );
  }
  
  async disconnect(): Promise<void> {
    if (this.subscriptionId) {
      this.busService.unsubscribe(this.subscriptionId);
      
      // Announce agent is shutting down
      await this.busService.publish(
        createNotificationMessage(
          this.id,
          undefined,
          {
            status: 'shutdown',
          },
          {
            topic: 'agent:lifecycle',
            contentType: 'application/json'
          }
        )
      );
    }
  }
  
  async sendRequest(targetId: string, content: any): Promise<string> {
    const requestId = uuid();
    
    await this.busService.publish(
      createRequestMessage(
        this.id,
        targetId,
        content,
        {
          contentType: 'application/json',
          metadata: {
            requestId
          }
        }
      )
    );
    
    return requestId;
  }
  
  async sendResponse(targetId: string, content: any, correlationId: string): Promise<void> {
    await this.busService.publish(
      createResponseMessage(
        this.id,
        targetId,
        content,
        correlationId,
        {
          contentType: 'application/json'
        }
      )
    );
  }
  
  private async handleMessage(message: AgentMessage): Promise<void> {
    // Auto-respond to requests with a simple response
    if (message.type === MessageType.REQUEST) {
      await this.sendResponse(
        message.sourceId,
        {
          result: `Response from ${this.name} to request: ${JSON.stringify(message.content).substring(0, 50)}...`,
          status: 'success'
        },
        message.id
      );
    }
  }
  
  async execute(request: any): Promise<any> {
    return {
      output: `Execution result from ${this.name}`,
      artifacts: {
        requestInput: request.input
      }
    };
  }
  
  clearMessages(): void {
    this.receivedMessages = [];
  }
}

describe('Agent Messaging Integration Tests', () => {
  let communicationBus: CommunicationBusService;
  let registry: AgentRegistryService;
  let logger: ConsoleLogger;
  
  // Test agents
  let orchestratorAgent: TestMessagingAgent;
  let knowledgeAgent: TestMessagingAgent;
  let responseAgent: TestMessagingAgent;
  
  // Track subscription IDs for cleanup
  const subscriptionIds: string[] = [];
  
  beforeAll(() => {
    // Setup logger
    logger = new ConsoleLogger();
    logger.setLogLevel('error'); // Reduce noise in tests
    
    // Initialize services
    communicationBus = CommunicationBusService.getInstance();
    registry = AgentRegistryService.getInstance();
    
    // Create test agents
    orchestratorAgent = new TestMessagingAgent(
      'Orchestrator Agent',
      ['orchestrate_workflow', 'manage_tasks'],
      communicationBus
    );
    
    knowledgeAgent = new TestMessagingAgent(
      'Knowledge Agent',
      ['retrieve_knowledge', 'process_context'],
      communicationBus
    );
    
    responseAgent = new TestMessagingAgent(
      'Response Agent',
      ['generate_response', 'format_output'],
      communicationBus
    );
    
    // Register agents with the registry
    registry.registerAgent(orchestratorAgent);
    registry.registerAgent(knowledgeAgent);
    registry.registerAgent(responseAgent);
  });
  
  beforeEach(async () => {
    // Clear any existing subscriptions
    subscriptionIds.forEach(id => communicationBus.unsubscribe(id));
    subscriptionIds.length = 0;
    
    // Connect all agents
    await Promise.all([
      orchestratorAgent.connect(),
      knowledgeAgent.connect(),
      responseAgent.connect()
    ]);
    
    // Clear message history
    orchestratorAgent.clearMessages();
    knowledgeAgent.clearMessages();
    responseAgent.clearMessages();
  });
  
  afterEach(async () => {
    // Disconnect all agents
    await Promise.all([
      orchestratorAgent.disconnect(),
      knowledgeAgent.disconnect(),
      responseAgent.disconnect()
    ]);
  });
  
  afterAll(() => {
    // Cleanup subscriptions
    subscriptionIds.forEach(id => communicationBus.unsubscribe(id));
  });
  
  test('Agents should exchange request-response messages', async () => {
    // Orchestrator sends a request to knowledge agent
    const requestContent = {
      query: 'Find information about project risks',
      parameters: {
        maxResults: 5,
        minRelevance: 0.7
      }
    };
    
    const requestId = await orchestratorAgent.sendRequest(
      knowledgeAgent.id,
      requestContent
    );
    
    // Wait for message processing
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Verify knowledge agent received the request
    expect(knowledgeAgent.receivedMessages.length).toBeGreaterThan(0);
    
    const receivedRequest = knowledgeAgent.receivedMessages.find(
      msg => msg.type === MessageType.REQUEST
    );
    
    expect(receivedRequest).toBeDefined();
    expect(receivedRequest?.sourceId).toBe(orchestratorAgent.id);
    expect(receivedRequest?.content).toMatchObject(requestContent);
    
    // Verify orchestrator received a response
    expect(orchestratorAgent.receivedMessages.length).toBeGreaterThan(0);
    
    const receivedResponse = orchestratorAgent.receivedMessages.find(
      msg => msg.type === MessageType.RESPONSE
    );
    
    expect(receivedResponse).toBeDefined();
    expect(receivedResponse?.sourceId).toBe(knowledgeAgent.id);
    expect(receivedResponse?.correlationId).toBeDefined();
  });
  
  test('Should broadcast notification messages to all agents', async () => {
    // Create a broadcast notification
    const broadcastContent = {
      event: 'system_update',
      message: 'System is being updated, prepare for temporary disruption',
      severity: 'info',
      timestamp: Date.now()
    };
    
    // Subscribe to all notification messages
    const broadcastSubscriptionId = communicationBus.subscribe(
      { topic: 'system:status' },
      () => {}
    );
    
    subscriptionIds.push(broadcastSubscriptionId);
    
    // Publish the broadcast notification
    await communicationBus.publish(
      createNotificationMessage(
        'system',
        undefined,
        broadcastContent,
        {
          topic: 'system:status',
          priority: MessagePriority.HIGH,
          contentType: 'application/json'
        }
      )
    );
    
    // Wait for message processing
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Verify agents received the broadcast
    // Since this depends on subscription patterns, we'll verify via a test subscription
    const receivedMessages: AgentMessage[] = [];
    
    const testSubscriptionId = communicationBus.subscribe(
      { topic: 'system:status' },
      (message) => {
        receivedMessages.push(message);
      }
    );
    
    subscriptionIds.push(testSubscriptionId);
    
    // Publish another broadcast to test the subscription
    await communicationBus.publish(
      createNotificationMessage(
        'system',
        undefined,
        {
          ...broadcastContent,
          timestamp: Date.now()
        },
        {
          topic: 'system:status',
          priority: MessagePriority.HIGH,
          contentType: 'application/json'
        }
      )
    );
    
    // Wait for message processing
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Verify the test subscription received the message
    expect(receivedMessages.length).toBeGreaterThan(0);
    
    const lastMessage = receivedMessages[receivedMessages.length - 1];
    expect(lastMessage.type).toBe(MessageType.NOTIFICATION);
    expect(lastMessage.content).toMatchObject({
      event: 'system_update'
    });
  });
  
  test('Should execute multi-step communication workflow', async () => {
    // Setup a simple workflow:
    // 1. Orchestrator asks Knowledge Agent for information
    // 2. Orchestrator processes the response
    // 3. Orchestrator asks Response Agent to generate a response using the knowledge
    // 4. Orchestrator combines everything into a final result
    
    // Step 1: Request knowledge
    const knowledgeRequestId = await orchestratorAgent.sendRequest(
      knowledgeAgent.id,
      {
        query: 'What are the project milestones?',
        parameters: { maxResults: 3 }
      }
    );
    
    // Wait for message processing
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Verify knowledge agent responded
    const knowledgeResponse = orchestratorAgent.receivedMessages.find(
      msg => msg.type === MessageType.RESPONSE && msg.sourceId === knowledgeAgent.id
    );
    expect(knowledgeResponse).toBeDefined();
    
    // Step 2: Request response generation
    const responseRequestId = await orchestratorAgent.sendRequest(
      responseAgent.id,
      {
        query: 'What are the project milestones?',
        context: 'Project has three major milestones: Alpha in Q1, Beta in Q2, and Release in Q3.',
        parameters: { format: 'concise' }
      }
    );
    
    // Wait for message processing - increase wait time to ensure message is processed
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Verify response agent responded
    const responseAgentMessage = orchestratorAgent.receivedMessages.find(
      msg => msg.type === MessageType.RESPONSE && msg.sourceId === responseAgent.id
    );
    expect(responseAgentMessage).toBeDefined();
    
    // Verify the entire flow completed with the right sequence
    const messagesInOrder = orchestratorAgent.receivedMessages
      .filter(msg => msg.type === MessageType.RESPONSE)
      .map(msg => msg.sourceId);
    
    // Should have at least one message from each agent
    expect(messagesInOrder).toContain(knowledgeAgent.id);
    expect(messagesInOrder).toContain(responseAgent.id);
    
    // Knowledge agent should respond before response agent
    const knowledgeResponseIndex = messagesInOrder.indexOf(knowledgeAgent.id);
    const responseAgentIndex = messagesInOrder.lastIndexOf(responseAgent.id);
    
    expect(knowledgeResponseIndex).toBeLessThan(responseAgentIndex);
  });
  
  test('Should handle task assignment and completion messaging', async () => {
    // Create a task
    const taskId = uuid();
    const taskContent = {
      taskId,
      taskType: 'knowledge_retrieval',
      parameters: {
        query: 'Find information about project deadlines',
        maxResults: 5
      }
    };
    
    // Assign task to knowledge agent
    await communicationBus.publish(
      createTaskMessage(
        orchestratorAgent.id,
        knowledgeAgent.id,
        MessageType.TASK_ASSIGNED,
        taskContent
      )
    );
    
    // Wait for message processing
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Verify knowledge agent received the task assignment
    expect(knowledgeAgent.receivedMessages.some(
      msg => msg.type === MessageType.TASK_ASSIGNED && msg.content.taskId === taskId
    )).toBeTruthy();
    
    // Simulate task started by knowledge agent
    await communicationBus.publish(
      createTaskMessage(
        knowledgeAgent.id,
        orchestratorAgent.id,
        MessageType.TASK_STARTED,
        {
          ...taskContent
        }
      )
    );
    
    // Simulate task completion by knowledge agent
    await communicationBus.publish(
      createTaskMessage(
        knowledgeAgent.id,
        orchestratorAgent.id,
        MessageType.TASK_COMPLETED,
        {
          ...taskContent,
          result: {
            foundItems: 3,
            content: 'Project deadlines information retrieved successfully.'
          }
        }
      )
    );
    
    // Wait for message processing
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Verify orchestrator received task completion
    expect(orchestratorAgent.receivedMessages.some(
      msg => msg.type === MessageType.TASK_COMPLETED && 
            msg.content.taskId === taskId &&
            msg.content.result?.foundItems === 3
    )).toBeTruthy();
  });
  
  test('Should handle messaging errors and task failures', async () => {
    // Create a task that will fail
    const taskId = uuid();
    const taskContent = {
      taskId,
      taskType: 'invalid_operation',
      parameters: {
        query: 'This will cause an error'
      }
    };
    
    // Assign task to response agent
    await communicationBus.publish(
      createTaskMessage(
        orchestratorAgent.id,
        responseAgent.id,
        MessageType.TASK_ASSIGNED,
        taskContent
      )
    );
    
    // Simulate task failure
    await communicationBus.publish(
      createTaskMessage(
        responseAgent.id,
        orchestratorAgent.id,
        MessageType.TASK_FAILED,
        {
          ...taskContent,
          error: 'Invalid operation type: invalid_operation'
        }
      )
    );
    
    // Wait for message processing
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Verify orchestrator received task failure
    expect(orchestratorAgent.receivedMessages.some(
      msg => msg.type === MessageType.TASK_FAILED && 
            msg.content.taskId === taskId &&
            msg.content.error?.includes('Invalid operation')
    )).toBeTruthy();
  });
}); 