import { BaseClassifier } from '../base-classifier';
import { ClassifierResult, TemplateVariables } from '../../interfaces/classifier.interface';
import { ConversationMessage, ParticipantRole } from '../../types/conversation.types';
import { MockLogger } from '../../tests/mocks/mock-logger';
import { AgentCapability, AgentMetrics, AgentState, AgentStatus, BaseAgentInterface } from '../../interfaces/base-agent.interface';

/**
 * Test implementation of BaseClassifier for testing
 */
class TestClassifier extends BaseClassifier {
  // Mock to simulate classification results
  public mockResult: Partial<ClassifierResult> = {
    selectedAgentId: 'test-agent',
    confidence: 0.9,
    reasoning: 'Test reasoning',
    isFollowUp: false,
    entities: ['test entity'],
    intent: 'test intent'
  };
  
  // Mock to simulate errors
  public shouldThrowError = false;
  
  // Track calls to methods
  public classifyInternalCalls: { 
    input: string;
    history: ConversationMessage[];
    variables: TemplateVariables;
    metadata?: Record<string, any>;
  }[] = [];
  
  /**
   * Implementation of the internal classification logic
   */
  protected async classifyInternal(
    input: string,
    conversationHistory: ConversationMessage[],
    variables: TemplateVariables,
    metadata?: Record<string, any>
  ): Promise<ClassifierResult> {
    // Track the call
    this.classifyInternalCalls.push({
      input,
      history: conversationHistory,
      variables,
      metadata
    });
    
    if (this.shouldThrowError) {
      throw new Error('Test classification error');
    }
    
    return this.mockResult as ClassifierResult;
  }
}

// Mock implementation of BaseAgentInterface for testing
class MockAgent implements BaseAgentInterface {
  public id: string;
  public name: string;
  public description: string;
  
  constructor(id: string, description: string) {
    this.id = id;
    this.name = id;
    this.description = description;
  }
  
  async initialize(): Promise<void> {}
  async terminate(): Promise<void> {}
  getAgentType(): string { return 'mock'; }
  
  getCapabilities(): AgentCapability[] { 
    return [{ name: 'test', description: 'test capability' }]; 
  }
  
  canHandle(): boolean { return true; }
  
  getMetrics(): AgentMetrics { 
    return {
      totalExecutions: 0,
      totalExecutionTimeMs: 0,
      averageExecutionTimeMs: 0,
      tokensUsed: 0,
      errorRate: 0
    }; 
  }
  
  getState(): AgentState { 
    return {
      status: AgentStatus.READY,
      errorCount: 0,
      executionCount: 0,
      metadata: {}
    }; 
  }
  
  async execute(): Promise<any> { return {}; }
  getInitializationStatus(): boolean { return true; }
}

describe('BaseClassifier', () => {
  let classifier: TestClassifier;
  let mockLogger: MockLogger;
  
  beforeEach(() => {
    mockLogger = new MockLogger();
    classifier = new TestClassifier({ logger: mockLogger });
    
    // Reset mocks
    classifier.mockResult = {
      selectedAgentId: 'test-agent',
      confidence: 0.9,
      reasoning: 'Test reasoning',
      isFollowUp: false,
      entities: ['test entity'],
      intent: 'test intent'
    };
    classifier.shouldThrowError = false;
    classifier.classifyInternalCalls = [];
  });
  
  describe('initialization', () => {
    test('should initialize with default options', async () => {
      await classifier.initialize();
      expect(mockLogger.hasMessage('Initializing classifier')).toBe(true);
    });
    
    test('should override options during initialization', async () => {
      await classifier.initialize({ maxRetries: 5 });
      expect(mockLogger.hasMessage('Initializing classifier')).toBe(true);
      
      // Internal options should be updated (private field, test indirectly)
      classifier.shouldThrowError = true;
      try {
        await classifier.classify('test', []);
      } catch (error) {
        // Should have tried maxRetries times
        expect(classifier.classifyInternalCalls.length).toBe(5);
      }
    });
  });
  
  describe('agent setting', () => {
    test('should set agents and format descriptions', () => {
      const agents = {
        'agent1': new MockAgent('agent1', 'Agent 1 description'),
        'agent2': new MockAgent('agent2', 'Agent 2 description')
      };
      
      classifier.setAgents(agents);
      expect(mockLogger.hasMessage('Set agents for classification')).toBe(true);
      
      // Test formatting by verifying it's used in template variables 
      // during a classification call
      classifier.classify('test', []);
      const variables = classifier.classifyInternalCalls[0].variables;
      
      expect(variables.AGENT_DESCRIPTIONS).toContain('agent1: Agent 1 description');
      expect(variables.AGENT_DESCRIPTIONS).toContain('agent2: Agent 2 description');
    });
  });
  
  describe('template handling', () => {
    test('should set custom prompt template', () => {
      const template = 'Custom template {{USER_INPUT}}';
      classifier.setPromptTemplate(template);
      
      expect(mockLogger.hasMessage('Set custom prompt template')).toBe(true);
      
      // Verify template is used
      classifier.classify('test input', []);
      const variables = classifier.classifyInternalCalls[0].variables;
      
      // Check if template filling works by examining the full template after variables are filled
      expect(classifier['fillTemplate'](template, variables)).toBe('Custom template test input');
    });
    
    test('should properly fill template with variables', () => {
      const template = 'Hello {{NAME}}, your role is {{ROLE}}';
      const variables = {
        NAME: 'John',
        ROLE: 'Admin',
        UNUSED: 'Not used'
      };
      
      const result = classifier['fillTemplate'](template, variables);
      expect(result).toBe('Hello John, your role is Admin');
    });
    
    test('should handle missing template variables', () => {
      const template = 'Hello {{NAME}}, your role is {{MISSING}}';
      const variables = {
        NAME: 'John'
      };
      
      const result = classifier['fillTemplate'](template, variables);
      expect(result).toBe('Hello John, your role is ');
    });
  });
  
  describe('conversation history formatting', () => {
    test('should format conversation history correctly', () => {
      const history: ConversationMessage[] = [
        {
          role: ParticipantRole.USER,
          content: 'Hello',
          timestamp: '2023-01-01T00:00:00Z'
        },
        {
          role: ParticipantRole.ASSISTANT,
          content: 'Hi there',
          agentId: 'assistant-1',
          timestamp: '2023-01-01T00:00:01Z'
        },
        {
          role: ParticipantRole.SYSTEM,
          content: 'System message',
          timestamp: '2023-01-01T00:00:02Z'
        }
      ];
      
      const formatted = classifier['formatConversationHistory'](history);
      expect(formatted).toContain('user: Hello');
      expect(formatted).toContain('Assistant [assistant-1]: Hi there');
      expect(formatted).toContain('system: System message');
    });
    
    test('should find previous agent from history', () => {
      const history: ConversationMessage[] = [
        {
          role: ParticipantRole.USER,
          content: 'Hello',
          timestamp: '2023-01-01T00:00:00Z'
        },
        {
          role: ParticipantRole.ASSISTANT,
          content: 'Hi there',
          agentId: 'agent-1',
          timestamp: '2023-01-01T00:00:01Z'
        },
        {
          role: ParticipantRole.USER,
          content: 'How are you?',
          timestamp: '2023-01-01T00:00:02Z'
        }
      ];
      
      const previousAgent = classifier['findPreviousAgent'](history);
      expect(previousAgent).toBe('agent-1');
    });
    
    test('should return null if no previous agent', () => {
      const history: ConversationMessage[] = [
        {
          role: ParticipantRole.USER,
          content: 'Hello',
          timestamp: '2023-01-01T00:00:00Z'
        },
        {
          role: ParticipantRole.SYSTEM,
          content: 'System message',
          timestamp: '2023-01-01T00:00:01Z'
        }
      ];
      
      const previousAgent = classifier['findPreviousAgent'](history);
      expect(previousAgent).toBeNull();
    });
  });
  
  describe('classification', () => {
    test('should classify input and return result', async () => {
      const input = 'Test input';
      const history: ConversationMessage[] = [
        {
          role: ParticipantRole.USER,
          content: 'Previous message',
          timestamp: '2023-01-01T00:00:00Z'
        }
      ];
      
      const result = await classifier.classify(input, history);
      
      expect(result).toEqual(classifier.mockResult);
      expect(mockLogger.hasMessage('Classifying input')).toBe(true);
      expect(mockLogger.hasMessage('Classification completed')).toBe(true);
      
      // Verify correct parameters were passed to classifyInternal
      expect(classifier.classifyInternalCalls.length).toBe(1);
      expect(classifier.classifyInternalCalls[0].input).toBe(input);
      expect(classifier.classifyInternalCalls[0].history).toBe(history);
    });
    
    test('should retry classification on error', async () => {
      classifier.shouldThrowError = true;
      
      try {
        await classifier.classify('test', []);
      } catch (error) {
        expect(error).toBeTruthy();
      }
      
      // Default max retries is 3
      expect(classifier.classifyInternalCalls.length).toBe(3);
      expect(mockLogger.hasMessage('Classification attempt 1 failed')).toBe(true);
      expect(mockLogger.hasMessage('Classification attempt 2 failed')).toBe(true);
      expect(mockLogger.hasMessage('Classification attempt 3 failed')).toBe(true);
    });
    
    test('should return default result on classification error', async () => {
      classifier.shouldThrowError = true;
      
      // Override the parent class method to not throw after retries
      const originalClassify = classifier.classify;
      classifier.classify = async function(input, history, metadata) {
        try {
          return await originalClassify.call(this, input, history, metadata);
        } catch (error) {
          return {
            selectedAgentId: null,
            confidence: 0,
            reasoning: `Classification error: ${error instanceof Error ? error.message : String(error)}`,
            isFollowUp: false,
            entities: [],
            intent: ''
          };
        }
      };
      
      const result = await classifier.classify('test', []);
      
      expect(result.selectedAgentId).toBeNull();
      expect(result.confidence).toBe(0);
      expect(result.reasoning).toContain('Classification error: Error: Test classification error');
      expect(mockLogger.hasMessage('Classification error')).toBe(true);
    });
    
    test('should pass metadata to internal classification', async () => {
      const metadata = { custom: 'data' };
      await classifier.classify('test', [], metadata);
      
      expect(classifier.classifyInternalCalls[0].metadata).toEqual(metadata);
    });
  });
}); 