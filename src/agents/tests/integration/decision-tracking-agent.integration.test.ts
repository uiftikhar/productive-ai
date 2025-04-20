import { DecisionTrackingAgent } from '../../specialized/decision-tracking-agent';
import { OpenAIConnector } from '../../integrations/openai-connector';
import { Logger } from '../../../shared/logger/logger.interface';
import { AgentResponse } from '../../interfaces/base-agent.interface';
import { 
  Decision, 
  DecisionReport, 
  ImpactAssessment,
  DecisionCategory,
  DecisionStatus,
  DecisionReportConfig 
} from '../../specialized/interfaces/decision-tracking.interface';
import { MockLogger } from '../mocks/mock-logger';

// Define MockLoggerType for compatibility with other tests
interface MockLoggerType extends Logger {
  messages: Array<{level: string, message: string, meta?: any}>;
  clear(): void;
  getLogsByLevel(level: string): Array<{level: string, message: string, meta?: any}>;
  hasMessage(messageSubstring: string, level?: string): boolean;
  currentLogLevel: string;
}

// Declare the global mockLogger
declare global {
  // eslint-disable-next-line no-var
  var mockLogger: MockLoggerType;
}

// Mock the OpenAI connector
jest.mock('../../integrations/openai-connector');

describe('DecisionTrackingAgent Integration', () => {
  let agent: DecisionTrackingAgent;
  let mockOpenAIConnector: jest.Mocked<OpenAIConnector>;
  let mockLogger: MockLoggerType;

  // Sample meeting transcript with decisions
  const sampleTranscript = `
John: Welcome everyone to our Q2 planning meeting.
Sarah: Thanks John. We need to decide on our marketing budget for the quarter.
John: Based on last quarter's results, I propose we increase it by 15%.
Emily: I think that's too aggressive. Maybe 10% would be more prudent given the economic climate.
John: Let's meet in the middle and go with 12% increase.
Emily: That sounds reasonable.
Sarah: I agree, 12% it is.
John: Great, decision made. Next item is the product roadmap priorities.
Sarah: I believe we should prioritize the mobile app redesign over the API improvements.
John: Any objections to that?
Emily: No, I agree the mobile experience needs attention.
John: Then it's decided, mobile redesign is our top priority for Q2.
`;

  // Mock decision analysis result
  const mockDecisions: Decision[] = [
    {
      id: 'decision-123',
      text: 'Increase marketing budget by 12%',
      category: 'financial' as DecisionCategory,
      impact: 'medium',
      status: 'approved' as DecisionStatus,
      relatedTopics: ['Budget', 'Marketing'],
      source: {
        meetingId: 'meeting-001',
        segmentId: 'segment-123',
        rawText: 'Increase marketing budget by 12%'
      },
      timestamp: Date.now()
    },
    {
      id: 'decision-124',
      text: 'Prioritize mobile app redesign over API improvements',
      category: 'technical' as DecisionCategory,
      impact: 'high',
      status: 'approved' as DecisionStatus,
      relatedTopics: ['Product Roadmap', 'Mobile App'],
      source: {
        meetingId: 'meeting-001',
        segmentId: 'segment-124',
        rawText: 'Prioritize mobile app redesign over API improvements'
      },
      timestamp: Date.now()
    }
  ];

  // Sample decision report
  const mockDecisionReport: DecisionReport = {
    title: 'Q2 Decision Report',
    generateTime: Date.now(),
    parameters: {
      format: 'detailed',
      includeRationale: true,
      includeImpact: true,
      filters: {
        categories: ['financial', 'technical'],
        status: ['approved', 'under_review', 'rejected']
      }
    } as DecisionReportConfig,
    summary: {
      totalDecisions: 2,
      byStatus: { 
        approved: 2, 
        under_review: 0, 
        rejected: 0,
        proposed: 0,
        implemented: 0,
        blocked: 0,
        deferred: 0,
        superseded: 0
      },
      byCategory: { 
        financial: 1, 
        technical: 1,
        strategic: 0,
        tactical: 0,
        operational: 0,
        personnel: 0,
        policy: 0,
        other: 0
      },
      byImpact: { high: 1, medium: 1, low: 0 }
    },
    decisions: mockDecisions
  };

  // Sample impact assessment
  const mockImpactAssessment: ImpactAssessment = {
    areas: [
      { 
        area: 'Marketing', 
        impact: 'positive',
        severity: 'medium',
        description: 'Increased spend may lead to higher customer acquisition'
      },
      { 
        area: 'Finance', 
        impact: 'negative',
        severity: 'low',
        description: 'Will reduce available funds for other departments'
      }
    ],
    risks: [
      { 
        description: 'ROI might not justify increased spending',
        probability: 'medium', 
        severity: 'high'
      }
    ],
    timeline: {
      shortTerm: 'Immediate reduction in available cash',
      mediumTerm: 'Expected increase in marketing reach and customer base',
      longTerm: 'Potential long-term growth if campaign is successful'
    },
    confidenceScore: 0.75
  };

  beforeEach(() => {
    // Clear the global mockLogger
    if (global.mockLogger) {
      global.mockLogger.clear();
      mockLogger = global.mockLogger;
    } else {
      // Create new MockLogger instance if none exists
      mockLogger = new MockLogger();
      global.mockLogger = mockLogger;
    }

    // Create mock OpenAI connector
    mockOpenAIConnector = {
      initialize: jest.fn().mockResolvedValue(undefined),
      generateEmbedding: jest.fn().mockResolvedValue(new Array(1536).fill(0.1)),
      chat: jest.fn().mockResolvedValue({ 
        text: JSON.stringify(mockDecisions) 
      })
    } as unknown as jest.Mocked<OpenAIConnector>;

    // Mock the OpenAIConnector constructor
    (OpenAIConnector as jest.MockedClass<typeof OpenAIConnector>).mockImplementation(
      () => mockOpenAIConnector
    );

    // Mock agent methods
    jest.spyOn(DecisionTrackingAgent.prototype as any, 'identifyDecisions')
      .mockImplementation(async () => mockDecisions);
    
    jest.spyOn(DecisionTrackingAgent.prototype as any, 'trackDecisions')
      .mockImplementation(async () => mockDecisions);
    
    jest.spyOn(DecisionTrackingAgent.prototype as any, 'generateDecisionReport')
      .mockImplementation(async () => mockDecisionReport);
    
    jest.spyOn(DecisionTrackingAgent.prototype as any, 'analyzeDecisionImpact')
      .mockImplementation(async () => mockImpactAssessment);

    // Create the agent with mocked dependencies
    agent = new DecisionTrackingAgent({
      logger: mockLogger,
      openAIConnector: mockOpenAIConnector
    });
  });

  test('should initialize successfully', async () => {
    await agent.initialize();
    
    expect(agent.getInitializationStatus()).toBe(true);
    expect(global.mockLogger.hasMessage('DecisionTrackingAgent initialized successfully', 'info')).toBe(true);
  });

  test('should identify decisions in meeting transcripts', async () => {
    await agent.initialize();
    
    const response = await agent.execute({
      input: sampleTranscript,
      capability: 'identify-decisions'
    });
    
    expect(response.output).toBeDefined();
    const decisions = response.output as unknown as Decision[];
    expect(Array.isArray(decisions)).toBe(true);
    expect(decisions).toHaveLength(2);
    
    // Verify decision structure
    const decision = decisions[0];
    expect(decision).toHaveProperty('id');
    expect(decision).toHaveProperty('text');
    expect(decision).toHaveProperty('category');
    expect(decision).toHaveProperty('status');
  });

  test('should track decisions across meetings', async () => {
    await agent.initialize();
    
    // Create a request with parameters for tracking decisions
    const request = {
      input: 'marketing budget',
      capability: 'track-decisions',
      parameters: {
        searchText: 'marketing budget',
        categories: ['financial', 'technical'],
        fromDate: new Date('2023-01-01'),
        toDate: new Date()
      }
    };
    
    const response = await agent.execute(request);
    
    expect(response.output).toBeDefined();
    const decisions = response.output as unknown as Decision[];
    expect(Array.isArray(decisions)).toBe(true);
    
    // Verify decision tracking results
    const decision = decisions[0];
    expect(decision).toHaveProperty('id');
    expect(decision).toHaveProperty('text');
    expect(decision).toHaveProperty('category');
    expect(decision).toHaveProperty('status');
  });

  test('should generate decision reports', async () => {
    await agent.initialize();
    
    const response = await agent.execute({
      input: 'Q2 decisions',
      capability: 'generate-decision-report',
      parameters: {
        format: 'detailed',
        includeRationale: true,
        includeImpact: true,
        filters: {
          categories: ['financial', 'technical'],
          status: ['approved', 'under_review', 'rejected']
        }
      }
    });
    
    expect(response.output).toBeDefined();
    const report = response.output as unknown as DecisionReport;
    expect(report).toHaveProperty('title');
    expect(report).toHaveProperty('summary');
    expect(report).toHaveProperty('decisions');
    
    // Verify report structure
    expect(report.title).toBe('Q2 Decision Report');
    expect(report.summary.totalDecisions).toBe(2);
    expect(report.decisions).toHaveLength(2);
  });

  test('should analyze decision impact', async () => {
    await agent.initialize();
    
    const response = await agent.execute({
      input: 'Increase marketing budget by 12%',
      capability: 'analyze-decision-impact',
      parameters: {
        decision: {
          id: 'decision-123',
          text: 'Increase marketing budget by 12%',
          category: 'financial'
        }
      }
    });
    
    expect(response.output).toBeDefined();
    const impact = response.output as unknown as ImpactAssessment;
    expect(impact).toHaveProperty('areas');
    expect(impact).toHaveProperty('risks');
    expect(impact).toHaveProperty('timeline');
    
    // Verify impact assessment structure
    expect(impact.areas).toBeInstanceOf(Array);
    expect(impact.areas.length).toBeGreaterThan(0);
    expect(impact.timeline).toHaveProperty('shortTerm');
    expect(impact.timeline).toHaveProperty('mediumTerm');
    expect(impact.timeline).toHaveProperty('longTerm');
  });

  test('should handle errors gracefully', async () => {
    await agent.initialize();
    
    // Force an error by using an unsupported capability
    const response = await agent.execute({
      input: 'test',
      capability: 'unsupported-capability'
    });
    
    // Verify we get an error response rather than a thrown error
    expect(response.output).toContain('Error: Unsupported capability');
    
    // Verify error was logged
    expect(global.mockLogger.hasMessage('Error executing DecisionTrackingAgent', 'error')).toBe(true);
  });
}); 