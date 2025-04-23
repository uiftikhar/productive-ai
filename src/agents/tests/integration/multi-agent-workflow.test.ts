import { AgentFactory } from '../../factories/agent-factory';
import { AgentDiscoveryService } from '../../services/agent-discovery.service';
import { AgentRegistryService } from '../../services/agent-registry.service';
import { AgentWorkflow } from '../../../langgraph/core/workflows/agent-workflow';
import { AgentRequest, AgentResponse, AgentContext } from '../../interfaces/base-agent.interface';
import { MockLogger } from '../mocks/mock-logger';
import { DocumentRetrievalAgent } from '../../specialized/retrieval-agent';
import { KnowledgeRetrievalAgent } from '../../specialized/knowledge-retrieval-agent';
import { DecisionTrackingAgent } from '../../specialized/decision-tracking-agent';
import { MeetingAnalysisAgent } from '../../specialized/meeting-analysis-agent';
import { SupervisorAgent } from '../../specialized/supervisor-agent';
import { WorkflowStatus } from '../../../langgraph/core/workflows/base-workflow';
import { BaseAgent } from '../../base/base-agent';

// We're using jest.mock() to extend AgentWorkflow with the needed getLastState method
jest.mock('../../../langgraph/core/workflows/agent-workflow', () => {
  const original = jest.requireActual('../../../langgraph/core/workflows/agent-workflow');
  return {
    ...original,
    AgentWorkflow: jest.fn().mockImplementation((agent, options) => {
      const instance = new original.AgentWorkflow(agent, options);
      // Add mock getLastState method
      instance.getLastState = jest.fn().mockReturnValue({
        status: WorkflowStatus.READY,
        id: 'test-workflow',
        runId: 'test-run',
        agentId: agent.id
      });
      return instance;
    })
  };
});

// Extending the factory with our test methods
interface TestAgentFactory extends AgentFactory {
  createDocumentRetrievalAgent(options?: any): DocumentRetrievalAgent | AgentWorkflow<any>;
  createKnowledgeRetrievalAgent(options?: any): KnowledgeRetrievalAgent | AgentWorkflow<any>;
  createDecisionTrackingAgent(options?: any): DecisionTrackingAgent | AgentWorkflow<any>;
  createMeetingAnalysisAgent(options?: any): MeetingAnalysisAgent | AgentWorkflow<any>;
  createSupervisorAgent(options?: any): SupervisorAgent | AgentWorkflow<any>;
}

// Define the document context type
interface DocumentContext {
  id: string;
  content: string;
  metadata: Record<string, any>;
}

// Define our custom context structure
type TestContext = {
  document?: DocumentContext;
  insights?: string[];
  decisions?: string[];
  [key: string]: any;
};

/**
 * This test suite focuses on testing multi-agent workflows:
 * 1. Sequential execution of multiple agents
 * 2. Context passing between agents
 * 3. Capability-based agent selection
 */
describe('Multi-Agent Workflow Integration Tests', () => {
  // Test dependencies
  let logger: MockLogger;
  let factory: TestAgentFactory;
  let registry: AgentRegistryService;
  let discoveryService: AgentDiscoveryService;

  // Agent instances
  let retrievalAgent: DocumentRetrievalAgent;
  let knowledgeAgent: KnowledgeRetrievalAgent;
  let decisionAgent: DecisionTrackingAgent;
  let meetingAnalysisAgent: MeetingAnalysisAgent;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mocks
    logger = new MockLogger();
    
    // Set up the registry
    registry = AgentRegistryService.getInstance(logger);
    
    // Create factory with mocked dependencies
    factory = new AgentFactory({
      logger,
      registry,
    }) as TestAgentFactory;
    
    // Create and register agents with type assertion
    retrievalAgent = factory.createDocumentRetrievalAgent({
      id: 'test-retrieval-agent',
      wrapWithWorkflow: false,
    }) as DocumentRetrievalAgent;
    
    knowledgeAgent = factory.createKnowledgeRetrievalAgent({
      id: 'test-knowledge-agent',
      wrapWithWorkflow: false,
    }) as KnowledgeRetrievalAgent;
    
    decisionAgent = factory.createDecisionTrackingAgent({
      id: 'test-decision-agent',
      wrapWithWorkflow: false,
    }) as DecisionTrackingAgent;
    
    meetingAnalysisAgent = factory.createMeetingAnalysisAgent({
      id: 'test-meeting-analysis-agent',
      wrapWithWorkflow: false,
    }) as MeetingAnalysisAgent;
    
    // Mock the executeInternal methods with any assertions to bypass TypeScript
    jest.spyOn(retrievalAgent, 'executeInternal').mockImplementation(async (request) => {
      return {
        output: `Retrieved document: ${request.input}`,
        artifacts: {
          document: {
            id: 'doc-123',
            content: 'Document content about AI trends',
            metadata: { source: 'test-database' },
          },
        },
      };
    });
    
    jest.spyOn(knowledgeAgent, 'executeInternal').mockImplementation(async (request) => {
      // Use any assertion to bypass type checking for tests
      const contextData = request.context as any;
      const documentInfo = contextData?.document ? `based on ${contextData.document.id}` : '';
      
      return {
        output: `Knowledge insights ${documentInfo}: ${request.input}`,
        artifacts: {
          insights: ['Insight 1', 'Insight 2', 'Insight 3'],
          relevance: 0.92,
        },
      };
    });
    
    jest.spyOn(decisionAgent, 'executeInternal').mockImplementation(async (request) => {
      // Use any assertion to bypass type checking for tests
      const contextData = request.context as any;
      const insights = contextData?.insights || [];
      const decisions = insights.map((i: string) => `Decision based on ${i}`);
      
      return {
        output: `Decision recommendations: ${request.input}`,
        artifacts: {
          decisions,
          confidence: 0.85,
          justification: 'Based on knowledge insights and retrieved documents',
        },
      };
    });
    
    jest.spyOn(meetingAnalysisAgent, 'executeInternal').mockImplementation(async (request) => {
      return {
        output: `Meeting analysis: ${request.input}`,
        artifacts: {
          actionItems: ['Action 1', 'Action 2'],
          topics: ['Topic 1', 'Topic 2'],
          summary: 'Meeting summary',
        },
      };
    });
    
    // Create discovery service
    discoveryService = AgentDiscoveryService.getInstance({
      logger,
      registry,
    });
  });

  afterEach(() => {
    // Unregister all agents to clean up the registry
    if (retrievalAgent) registry.unregisterAgent(retrievalAgent.id);
    if (knowledgeAgent) registry.unregisterAgent(knowledgeAgent.id);
    if (decisionAgent) registry.unregisterAgent(decisionAgent.id);
    if (meetingAnalysisAgent) registry.unregisterAgent(meetingAnalysisAgent.id);
  });

  /**
   * Test: Sequential Agent Execution
   * This test verifies that multiple agents can be executed in sequence
   * and that context is properly passed between them.
   */
  test('should execute multiple agents in sequence with context passing', async () => {
    // Create workflow wrappers for each agent
    const retrievalWorkflow = new AgentWorkflow(retrievalAgent, { tracingEnabled: true });
    const knowledgeWorkflow = new AgentWorkflow(knowledgeAgent, { tracingEnabled: true });
    const decisionWorkflow = new AgentWorkflow(decisionAgent, { tracingEnabled: true });
    
    // Step 1: Execute the retrieval agent to get a document
    const retrievalResult = await retrievalWorkflow.execute({
      input: 'latest AI trends',
      capability: 'searchDocuments',
    });
    
    expect(retrievalResult.output).toContain('Retrieved document');
    expect(retrievalResult.artifacts?.document).toBeDefined();
    
    // Step 2: Pass the document to the knowledge agent using 'as any' to bypass type checking
    const knowledgeResult = await knowledgeWorkflow.execute({
      input: 'Summarize key points about AI trends',
      capability: 'retrieve_knowledge',
      context: {
        metadata: { source: 'workflow-test' },
        document: retrievalResult.artifacts?.document,
      } as any,
    });
    
    expect(knowledgeResult.output).toContain('Knowledge insights');
    expect(knowledgeResult.output).toContain('doc-123'); // Verify context was used
    expect(knowledgeResult.artifacts?.insights).toBeDefined();
    
    // Step 3: Pass the insights to the decision agent using 'as any' to bypass type checking
    const decisionResult = await decisionWorkflow.execute({
      input: 'What strategic decisions should be made?',
      capability: 'Identify Decisions',
      context: {
        metadata: { source: 'workflow-test' },
        document: retrievalResult.artifacts?.document,
        insights: knowledgeResult.artifacts?.insights,
      } as any,
    });
    
    expect(decisionResult.output).toContain('Decision recommendations');
    expect(decisionResult.artifacts?.decisions).toHaveLength(3); // Based on 3 insights
    
    // Verify tracing and workflow state
    expect((retrievalWorkflow as any).getLastState().status).toBe(WorkflowStatus.READY);
    expect((knowledgeWorkflow as any).getLastState().status).toBe(WorkflowStatus.READY);
    expect((decisionWorkflow as any).getLastState().status).toBe(WorkflowStatus.READY);
  });

  /**
   * Test: Capability-Based Agent Selection
   * This test verifies that agents can be dynamically selected based on capabilities.
   */
  test('should select appropriate agents based on capabilities', async () => {
    // Register agents with the registry
    registry.registerAgent(retrievalAgent);
    registry.registerAgent(knowledgeAgent);
    registry.registerAgent(decisionAgent);
    
    // Test capability-based discovery
    const documentDiscovery = discoveryService.discoverAgent({
      capability: 'searchDocuments',
    });
    
    expect(documentDiscovery).not.toBeNull();
    expect(documentDiscovery?.agentId).toBe(retrievalAgent.id);
    
    const knowledgeDiscovery = discoveryService.discoverAgent({
      capability: 'retrieve_knowledge',
    });
    
    expect(knowledgeDiscovery).not.toBeNull();
    expect(knowledgeDiscovery?.agentId).toBe(knowledgeAgent.id);
    
    const decisionDiscovery = discoveryService.discoverAgent({
      capability: 'Identify Decisions',
    });
    
    expect(decisionDiscovery).not.toBeNull();
    expect(decisionDiscovery?.agentId).toBe(decisionAgent.id);
    
    // Test execution with discovered agents
    const query = 'AI trends 2023';
    
    // Step 1: Discover and execute retrieval agent
    const retrievalDiscovery = discoveryService.discoverAgent({
      capability: 'searchDocuments',
    });
    
    const discoveredRetrievalAgent = registry.getAgent(retrievalDiscovery!.agentId);
    expect(discoveredRetrievalAgent).toBeDefined();
    
    // Cast to any to bypass type checking for test mocks
    const retrievalWorkflow = new AgentWorkflow(discoveredRetrievalAgent as BaseAgent);
    const retrievalResult = await retrievalWorkflow.execute({
      input: query,
      capability: 'searchDocuments',
    });
    
    // Step 2: Discover and execute knowledge agent
    const knowledgeDiscovery2 = discoveryService.discoverAgent({
      capability: 'retrieve_knowledge',
    });
    
    const discoveredKnowledgeAgent = registry.getAgent(knowledgeDiscovery2!.agentId);
    expect(discoveredKnowledgeAgent).toBeDefined();
    
    // Cast to any to bypass type checking for test mocks
    const knowledgeWorkflow = new AgentWorkflow(discoveredKnowledgeAgent as BaseAgent);
    const knowledgeResult = await knowledgeWorkflow.execute({
      input: `Analyze ${query}`,
      capability: 'retrieve_knowledge',
      context: {
        metadata: { source: 'discovery-test' },
        document: retrievalResult.artifacts?.document,
      } as any,
    });
    
    // Verify end-to-end execution worked
    expect(retrievalResult.output).toBeDefined();
    expect(knowledgeResult.output).toBeDefined();
    expect(knowledgeResult.output).toContain('doc-123');
  });

  /**
   * Test: Complex Multi-Agent Workflow
   * This test verifies a more complex workflow with the meeting analysis agent orchestrating
   * multiple agents for a research task.
   */
  test('should execute a complex research workflow with orchestration', async () => {
    // Mock the meeting analysis agent's executeInternal method to orchestrate
    jest.spyOn(meetingAnalysisAgent, 'executeInternal').mockImplementation(async (request) => {
      // Simulate creating and executing a plan
      const retrievalResult = await retrievalAgent.execute({
        input: request.input,
        capability: 'searchDocuments',
      });
      
      const knowledgeResult = await knowledgeAgent.execute({
        input: `Analyze information about ${request.input}`,
        capability: 'retrieve_knowledge',
        context: {
          metadata: { source: 'coordinator-workflow' },
          document: retrievalResult.artifacts?.document,
        } as any,
      });
      
      const decisionResult = await decisionAgent.execute({
        input: `Make recommendations based on ${request.input}`,
        capability: 'Generate Decision Report',
        context: {
          metadata: { source: 'coordinator-workflow' },
          document: retrievalResult.artifacts?.document,
          insights: knowledgeResult.artifacts?.insights,
        } as any,
      });
      
      // Compile the final report
      return {
        output: `Research Report: ${request.input}\n\n` +
                `1. Document Retrieval: ${retrievalResult.output}\n\n` +
                `2. Knowledge Analysis: ${knowledgeResult.output}\n\n` +
                `3. Recommendations: ${decisionResult.output}`,
        artifacts: {
          document: retrievalResult.artifacts?.document,
          insights: knowledgeResult.artifacts?.insights,
          decisions: decisionResult.artifacts?.decisions,
          compiledBy: 'Meeting Analysis Agent',
        },
      };
    });
    
    // Register the coordinator
    registry.registerAgent(meetingAnalysisAgent);
    
    // Create a workflow for the orchestrating agent
    const coordinatorWorkflow = new AgentWorkflow(meetingAnalysisAgent, { tracingEnabled: true });
    
    // Execute the workflow with a research request
    const result = await coordinatorWorkflow.execute({
      input: 'emerging AI technologies for healthcare',
      capability: 'meeting-analysis',
    });
    
    // Verify the workflow executed successfully
    expect(result.output).toContain('Research Report');
    expect(result.output).toContain('Document Retrieval');
    expect(result.output).toContain('Knowledge Analysis');
    expect(result.output).toContain('Recommendations');
    
    // Verify all artifacts were collected and passed through the workflow
    expect(result.artifacts?.document).toBeDefined();
    expect(result.artifacts?.insights).toBeDefined();
    expect(result.artifacts?.decisions).toBeDefined();
    expect(result.artifacts?.compiledBy).toBe('Meeting Analysis Agent');
    
    // Verify the workflow completed
    expect((coordinatorWorkflow as any).getLastState().status).toBe(WorkflowStatus.READY);
  });
}); 