import { DefaultAgentService } from '../default-agent.service';
import { initializeDefaultAgentSystem } from '../initialize-default-agent';
import { AgentRegistryService } from '../agent-registry.service';
import { BaseAgent } from '../../base/base-agent';
import {
  AgentRequest,
  AgentResponse,
  AgentCapability,
} from '../../interfaces/base-agent.interface';
import { ConsoleLogger } from '../../../shared/logger/console-logger';
import { v4 as uuidv4 } from 'uuid';

// Create a test agent class
class TestAgent extends BaseAgent {
  constructor(
    name: string,
    description: string,
    generalPurpose: boolean = false,
  ) {
    const id = `test-agent-${uuidv4().substring(0, 8)}`;

    // If it's a general purpose agent, add relevant terms to the description
    const fullDescription = generalPurpose
      ? `${description} (generalist assistant for general purpose tasks)`
      : description;

    super(name, fullDescription, { id });
  }

  // Implement the abstract method from BaseAgent
  public async executeInternal(request: AgentRequest): Promise<AgentResponse> {
    return {
      output: `Test response from ${this.name}`,
    };
  }

  async initialize(config?: Record<string, any>): Promise<void> {
    await super.initialize(config);

    // Register capabilities based on whether this is a general purpose agent
    if (this.description.includes('generalist')) {
      this.registerCapability({
        name: 'general-assistance',
        description: 'Provides general assistance for various tasks',
      });

      this.registerCapability({
        name: 'default-handling',
        description: 'Handles requests when no specialized agent is available',
      });

      this.registerCapability({
        name: 'fallback-support',
        description: 'Acts as a fallback for other agents',
      });
    } else {
      this.registerCapability({
        name: 'specific-task',
        description: 'Handles specific task types',
      });
    }
  }
}

describe('DefaultAgentService Integration Tests', () => {
  let agentRegistry: AgentRegistryService;
  let logger: ConsoleLogger;
  let defaultAgentService: DefaultAgentService;
  let generalAgent: TestAgent;
  let specializedAgent1: TestAgent;
  let specializedAgent2: TestAgent;

  beforeAll(async () => {
    // Suppress console output during tests
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'info').mockImplementation(() => {});
    jest.spyOn(console, 'debug').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});

    // Create logger with minimal output
    logger = new ConsoleLogger();
    logger.setLogLevel('error');

    // Get a clean instance of the agent registry
    // @ts-ignore - accessing private static property for testing
    AgentRegistryService.instance = undefined;
    agentRegistry = AgentRegistryService.getInstance(logger);

    // Create test agents
    generalAgent = new TestAgent(
      'General Assistant',
      'A general purpose assistant that can handle various tasks',
      true,
    );

    specializedAgent1 = new TestAgent(
      'Weather Agent',
      'Specialized agent for weather information',
    );

    specializedAgent2 = new TestAgent(
      'Calculator Agent',
      'Specialized agent for mathematical calculations',
    );

    // Initialize the agents
    await Promise.all([
      generalAgent.initialize(),
      specializedAgent1.initialize(),
      specializedAgent2.initialize(),
    ]);

    // Register the agents
    agentRegistry.registerAgent(generalAgent);
    agentRegistry.registerAgent(specializedAgent1);
    agentRegistry.registerAgent(specializedAgent2);

    // Reset DefaultAgentService instance
    // @ts-ignore - accessing private static property for testing
    DefaultAgentService.instance = undefined;

    // Get the service instance
    defaultAgentService = DefaultAgentService.getInstance({
      logger,
      agentRegistry,
    });
  });

  afterAll(() => {
    // Restore console functions
    jest.restoreAllMocks();
  });

  it('should initialize the default agent system and select a general agent automatically', async () => {
    // Act - initialize the system without specifying a default agent
    await initializeDefaultAgentSystem({
      logger,
      agentRegistry,
      confidenceThreshold: 0.7,
    });

    // Get the current default agent from the service
    const defaultAgent = defaultAgentService.getDefaultAgent();

    // Assert - should have selected the general agent
    expect(defaultAgent).not.toBeNull();
    expect(defaultAgent?.id).toBe(generalAgent.id);
  });

  it('should configure with a specific agent when provided', async () => {
    // Reset DefaultAgentService instance
    // @ts-ignore - accessing private static property for testing
    DefaultAgentService.instance = undefined;

    // Act - initialize with a specific agent ID
    await initializeDefaultAgentSystem({
      logger,
      agentRegistry,
      defaultAgentId: specializedAgent1.id,
    });

    // Get the service instance and check the default agent
    const service = DefaultAgentService.getInstance();
    const defaultAgent = service.getDefaultAgent();

    // Assert
    expect(defaultAgent).not.toBeNull();
    expect(defaultAgent?.id).toBe(specializedAgent1.id);
  });

  it('should process classification results and apply fallback when needed', async () => {
    // Reset DefaultAgentService instance
    // @ts-ignore - accessing private static property for testing
    DefaultAgentService.instance = undefined;

    // Initialize with specified default agent
    await initializeDefaultAgentSystem({
      logger,
      agentRegistry,
      defaultAgentId: generalAgent.id,
      confidenceThreshold: 0.7,
    });

    // Get service instance
    const service = DefaultAgentService.getInstance();

    // Create a low confidence classification result
    const lowConfidenceResult = {
      selectedAgentId: specializedAgent2.id,
      confidence: 0.5, // Below threshold of 0.7
      reasoning: 'Low confidence identification',
      isFollowUp: false,
      entities: [],
      intent: 'calculate',
    };

    // Act - apply fallback logic
    const result = service.processFallbackLogic(
      lowConfidenceResult,
      'What is 2+2?',
    );

    // Assert
    expect(result.selectedAgentId).toBe(generalAgent.id);
    expect(result.confidence).toBe(1.0);
    expect(result.reasoning).toContain('Low confidence');
    expect(result.reasoning).toContain('Falling back to default agent');

    // Check metrics
    const metrics = service.getFallbackMetrics();
    expect(metrics.totalFallbacks).toBe(1);
    expect(metrics.lowConfidenceFallbacks).toBe(1);
    expect(metrics.fallbacksByIntent['calculate']).toBe(1);
  });

  it('should not apply fallback when confidence is above threshold', async () => {
    // Get service instance
    const service = DefaultAgentService.getInstance();

    // Create a high confidence classification result
    const highConfidenceResult = {
      selectedAgentId: specializedAgent2.id,
      confidence: 0.9, // Above threshold
      reasoning: 'High confidence identification',
      isFollowUp: false,
      entities: [],
      intent: 'calculate',
    };

    // Act - apply fallback logic
    const result = service.processFallbackLogic(
      highConfidenceResult,
      'What is the square root of 64?',
    );

    // Assert - should keep the original agent
    expect(result.selectedAgentId).toBe(specializedAgent2.id);
    expect(result.confidence).toBe(0.9);

    // Get current metrics count to verify no increment
    const currentMetrics = service.getFallbackMetrics();
    expect(currentMetrics.totalFallbacks).toBe(1); // Still 1 from previous test
  });

  it('should fall back when no agent is selected', async () => {
    // Get service instance
    const service = DefaultAgentService.getInstance();

    // Create a result with no agent selected
    const noAgentResult = {
      selectedAgentId: null,
      confidence: 0.0,
      reasoning: 'No suitable agent found',
      isFollowUp: false,
      entities: [],
      intent: 'unknown',
    };

    // Act
    const result = service.processFallbackLogic(
      noAgentResult,
      'Something completely unrecognizable',
    );

    // Assert
    expect(result.selectedAgentId).toBe(generalAgent.id);
    expect(result.confidence).toBe(1.0);

    // Check metrics
    const metrics = service.getFallbackMetrics();
    expect(metrics.totalFallbacks).toBe(2); // Increased by 1
    expect(metrics.missingAgentFallbacks).toBe(1);
  });
});
