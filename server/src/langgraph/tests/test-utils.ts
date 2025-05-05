/**
 * Test Utilities for Agentic Meeting Analysis
 *
 * Provides helper functions and mocks for testing the meeting analysis system.
 */

import { v4 as uuidv4 } from 'uuid';
import { AnalysisGoalType, IMeetingAnalysisAgent, SharedMemoryService, StateRepositoryService, CommunicationService, TeamFormationService, ApiCompatibilityService, AgentExpertise } from '../agentic-meeting-analysis';
import { ConsoleLogger } from '../../shared/logger/console-logger';

// Interface for agent execution request
interface AgentExecutionRequest {
  capability: string;
  [key: string]: any;
}

// Interface for meeting analysis request
export interface AgenticMeetingAnalysisRequest {
  meetingId: string;
  goals: AnalysisGoalType[];
  options: {
    detailLevel: string;
    includeTranscriptReferences: boolean;
    formatType: string;
  };
}

// Cache for service instances to optimize test performance
const serviceCache = new Map<string, any>();

/**
 * Get a shared instance of a service with caching for tests
 */
export function getServiceInstance<T>(
  ServiceClass: new (...args: any[]) => T,
  args: any = {},
  cacheKey?: string
): T {
  const key = cacheKey || ServiceClass.name;
  
  if (serviceCache.has(key)) {
    return serviceCache.get(key) as T;
  }
  
  const instance = new ServiceClass({
    ...args,
    logger: new ConsoleLogger(),
  });
  
  serviceCache.set(key, instance);
  return instance;
}

/**
 * Performance tracking utility for tests
 */
export class PerformanceTracker {
  private startTime: number = 0;
  private endTime: number = 0;
  private measurements = new Map<string, number>();

  /**
   * Start tracking performance
   */
  start(): void {
    this.startTime = performance.now();
  }

  /**
   * End tracking performance
   */
  end(): void {
    this.endTime = performance.now();
  }

  log(message: string): void {
    console.log(message);
  }

  /**
   * Measure time between two marks
   */
  measure(name: string, fn: () => void): void {
    const start = performance.now();
    fn();
    const duration = performance.now() - start;
    this.measurements.set(name, duration);
    this.log(`Measure ${name}: ${Math.round(duration)}ms`);
  }

  // Add async measurement method
  async measureAsync(name: string, fn: () => Promise<void>): Promise<void> {
    const start = performance.now();
    await fn();
    const duration = performance.now() - start;
    this.measurements.set(name, duration);
    this.log(`Measure ${name}: ${Math.round(duration)}ms`);
  }

  /**
   * Log all performance results
   */
  logResults(): void {
    console.log('--- Performance Results ---');
    console.log(`Total duration: ${this.endTime - this.startTime}ms`);
    
    console.log('\nMeasurements:');
    this.measurements.forEach((value, key) => {
      console.log(`- ${key}: ${value}ms`);
    });
  }
  
  /**
   * Get results for assertions
   */
  getResults(): { measurements: Map<string, number> } {
    return {
      measurements: this.measurements
    };
  }
}

/**
 * Simple cache implementation for tests
 */
export class TestCache {
  private cache: Map<string, any> = new Map();
  private hits: number = 0;
  private misses: number = 0;
  
  /**
   * Get a value from cache
   */
  get(key: string): any {
    if (this.cache.has(key)) {
      this.hits++;
      return this.cache.get(key);
    }
    this.misses++;
    return undefined;
  }
  
  /**
   * Set a value in cache
   */
  set(key: string, value: any): void {
    this.cache.set(key, value);
  }
  
  /**
   * Clear the cache
   */
  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }
  
  /**
   * Get cache statistics
   */
  getStats(): { hits: number; misses: number; hitRatio: number } {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      hitRatio: total > 0 ? this.hits / total : 0,
    };
  }
}

/**
 * Create a test meeting
 */
export function createTestMeeting(options: any = {}): any {
  const meetingId = options.meetingId || `meeting-${uuidv4()}`;
  
  return {
    meetingId,
    title: options.title || 'Test Meeting',
    date: options.date || new Date().toISOString(),
    participants: options.participants || [
      { id: 'user1', name: 'John Doe' },
      { id: 'user2', name: 'Mary Smith' },
      { id: 'user3', name: 'Sarah Johnson' },
    ],
    transcript: options.transcript || {
      segments: [
        {
          speaker: 'John Doe',
          text: 'Welcome everyone to our Q3 roadmap planning meeting. Today we need to discuss the timeline for our next release.',
          startTime: 0,
          endTime: 10,
        },
        {
          speaker: 'Mary Smith',
          text: 'I have concerns about the current timeline. The development team needs more time for testing.',
          startTime: 11,
          endTime: 20,
        },
        {
          speaker: 'Sarah Johnson',
          text: 'I agree with Mary. We should adjust the timeline to ensure quality.',
          startTime: 21,
          endTime: 30,
        },
        {
          speaker: 'John Doe',
          text: 'Okay, then we need to update the project plan. Mary, can you handle that by the end of the week?',
          startTime: 31,
          endTime: 40,
        },
        {
          speaker: 'Mary Smith',
          text: 'Yes, I will update the plan and send it to everyone.',
          startTime: 41,
          endTime: 50,
        },
      ],
    },
    metadata: options.metadata || {
      duration: 50,
      source: 'test',
    },
  };
}

/**
 * Create a test analysis request
 */
export function createTestAnalysisRequest(meetingId: string, goalTypes?: AnalysisGoalType[]): any {
  return {
    meetingId,
    requestId: `request-${uuidv4()}`,
    options: {
      includeTopics: true,
      includeActionItems: true,
      includeSummary: true,
      includeParticipantAnalysis: true,
    },
    goals: goalTypes || [
      AnalysisGoalType.EXTRACT_TOPICS,
      AnalysisGoalType.EXTRACT_ACTION_ITEMS,
      AnalysisGoalType.GENERATE_SUMMARY
    ],
    timestamp: Date.now(),
  };
}

/**
 * Mock agent responses
 */
export function mockAgentResponses(agentType: string, data: any = {}): any {
  switch (agentType) {
    case 'topic_analyzer':
      return {
        topics: data.topics || [
          { name: 'Product Roadmap', duration: '20 minutes' },
          { name: 'Timeline Concerns', duration: '15 minutes' },
          { name: 'Release Planning', duration: '15 minutes' },
        ],
        confidence: data.confidence || 'high',
      };
      
    case 'action_item_extractor':
      return {
        actionItems: data.actionItems || [
          {
            description: 'Update the project plan with new timeline',
            assignee: 'Mary Smith',
            deadline: 'end of week',
          },
        ],
        confidence: data.confidence || 'high',
      };
      
    case 'summarizer':
      return {
        summary: data.summary || 'The meeting discussed Q3 roadmap planning with concerns about timeline. Action items were assigned to update the project plan.',
        confidence: data.confidence || 'high',
      };
      
    default:
      return data;
  }
}

// Define the mock objects outside the function to export them
const stateRepository = {
  saveMeeting: jest.fn(),
  getMeeting: jest.fn(),
  saveAnalysisResult: jest.fn(),
  getAnalysisResult: jest.fn(),
  saveAnalysisProgress: jest.fn(),
  getAnalysisStatus: jest.fn(),
  _progressForMeeting: {} as Record<string, number>,
};

const sharedMemory = {
  storeAnalysis: jest.fn(),
  getAnalysis: jest.fn(),
  storeMetadata: jest.fn(),
  getMetadata: jest.fn(),
  _memoryStore: new Map<string, any>(),
  _subscribers: new Map<string, { agentId: string, namespace: string, callback: Function }[]>(),
  set: jest.fn(),
  get: jest.fn(),
  subscribe: jest.fn(),
  unsubscribe: jest.fn(),
  publish: jest.fn(),
  clearMessageHistory: jest.fn(),
};

const communication = {
  sendMessage: jest.fn(),
  registerAgent: jest.fn(),
  unregisterAgent: jest.fn(),
  broadcastMessage: jest.fn(),
  clearMessageHistory: jest.fn(),
  getMessageHistory: jest.fn(),
  agentHandlers: {} as Record<string, Function>,
  messageHistory: [] as any[],
};

// Export the mock objects
export { stateRepository, sharedMemory, communication };

/**
 * Set up the test environment
 */
export async function setupTestEnvironment(): Promise<any> {
  // Initialize mocks with proper implementations
  
  // Set up state repository mocks
  stateRepository.getMeeting.mockImplementation((meetingId: string) => {
    if (meetingId.includes('empty-transcript')) {
      return {
        meetingId,
        transcript: { segments: [] },
        status: 'pending',
      };
    }
    
    // Check if this meeting is stored in the memory store for consistent state
    const memoryKey = `meeting:${meetingId}`;
    const storedMeeting = sharedMemory._memoryStore.get(`default:${memoryKey}`);
    
    if (storedMeeting) {
      return { ...storedMeeting };
    }
    
    return {
      ...createTestMeeting({ meetingId }),
      status: 'completed',
    };
  });
  
  stateRepository.saveMeeting.mockImplementation(async (meeting) => {
    // When saving a meeting, also update it in memory
    const memoryKey = `meeting:${meeting.meetingId}`;
    await sharedMemory.set(memoryKey, meeting);
    
    return true;
  });
  
  stateRepository.getAnalysisResult.mockImplementation((meetingId: string) => {
    // Return appropriate mock data based on meetingId
    if (meetingId.includes('nonexistent')) {
      return {
        status: 'not_found',
        error: {
          code: 'MEETING_NOT_FOUND',
          message: 'Meeting not found',
        },
      };
    }
    
    if (meetingId.includes('empty-transcript')) {
      return {
        status: 'failed',
        error: {
          code: 'EMPTY_TRANSCRIPT',
          message: 'Cannot analyze an empty transcript',
        },
      };
    }
    // Default to a completed result
    return {
      status: 'completed',
      results: {
        topics: ['Product Roadmap', 'Timeline Concerns', 'Release Planning'],
        actionItems: [
          {
            description: 'Update the project plan with new timeline',
            assignee: 'John Doe',
            deadline: 'end of week',
          },
        ],
        summary: 'The meeting discussed Q3 roadmap planning with concerns about timeline. Action items were assigned to update the project plan.',
      },
    };
  });
  
  stateRepository.getAnalysisStatus.mockImplementation((meetingId: string) => {
    // Return status based on test progress parameter stored in state
    const progressValue = stateRepository._progressForMeeting?.[meetingId] || 50;
    
    return {
      status: 'in_progress',
      progress: progressValue,
      partialResults: progressValue === 25 ? 
        { topics: ['Product Roadmap'] } : 
        { 
          topics: progressValue >= 75 ? 
            ['Product Roadmap', 'Timeline Concerns', 'Release Planning'] : 
            ['Product Roadmap', 'Timeline Concerns'],
          actionItems: progressValue >= 75 ? [
            {
              description: 'Update the project plan with new timeline',
              assignee: 'John Doe',
            }
          ] : []
        },
    };
  });
  
  // Add saveAnalysisProgress implementation to store progress value
  stateRepository.saveAnalysisProgress.mockImplementation((meetingId: string, data: any) => {
    if (!stateRepository._progressForMeeting) {
      stateRepository._progressForMeeting = {};
    }
    stateRepository._progressForMeeting[meetingId] = data.progress;
    return Promise.resolve({ success: true });
  });
  
  // Set up shared memory mock implementations
  sharedMemory.set.mockImplementation((key, value, namespace = 'default') => {
    const fullKey = `${namespace}:${key}`;
    sharedMemory._memoryStore.set(fullKey, { ...value });
    
    // Notify subscribers
    if (sharedMemory._subscribers.has(fullKey)) {
      const subscribers = sharedMemory._subscribers.get(fullKey) || [];
      subscribers.forEach(sub => sub.callback(value));
    }
    
    return Promise.resolve(true);
  });
  
  sharedMemory.get.mockImplementation((key, namespace = 'default') => {
    const fullKey = `${namespace}:${key}`;
    return Promise.resolve(sharedMemory._memoryStore.get(fullKey));
  });
  
  sharedMemory.subscribe.mockImplementation((key, namespace = 'default', agentId, callback) => {
    const fullKey = `${namespace}:${key}`;
    
    if (!sharedMemory._subscribers.has(fullKey)) {
      sharedMemory._subscribers.set(fullKey, []);
    }
    
    const subscribers = sharedMemory._subscribers.get(fullKey) || [];
    subscribers.push({ agentId, namespace, callback });
    
    return Promise.resolve(true);
  });
  
  sharedMemory.unsubscribe.mockImplementation((key, namespace = 'default', agentId) => {
    const fullKey = `${namespace}:${key}`;
    
    if (sharedMemory._subscribers.has(fullKey)) {
      const subscribers = sharedMemory._subscribers.get(fullKey) || [];
      const newSubscribers = subscribers.filter(sub => sub.agentId !== agentId);
      sharedMemory._subscribers.set(fullKey, newSubscribers);
    }
    
    return Promise.resolve(true);
  });
  
  sharedMemory.publish.mockImplementation((key, value, namespace = 'default') => {
    const fullKey = `${namespace}:${key}`;
    
    // Store the value
    sharedMemory._memoryStore.set(fullKey, { ...value });
    
    // Notify subscribers
    if (sharedMemory._subscribers.has(fullKey)) {
      const subscribers = sharedMemory._subscribers.get(fullKey) || [];
      subscribers.forEach(sub => sub.callback(value));
    }
    
    return Promise.resolve(true);
  });
  
  // Set up communication mock implementations
  communication.sendMessage.mockImplementation(async (message) => {
    // Store message in history
    communication.messageHistory.push({...message});
    
    // If there are recipients, call their handlers
    if (message.recipients && Array.isArray(message.recipients) && message.recipients.length > 0) {
      for (const recipient of message.recipients) {
        const handler = communication.agentHandlers[recipient];
        if (handler) {
          await handler(message);
        }
      }
    }
    // For broadcasts, call all handlers except sender
    else if (message.recipients === 'broadcast' && message.sender) {
      Object.entries(communication.agentHandlers).forEach(async ([agentId, handler]) => {
        if (agentId !== message.sender) {
          await handler(message);
        }
      });
    }
    return { success: true, messageId: message.id };
  });
  
  communication.registerAgent.mockImplementation((agentId, handler) => {
    if (!communication.agentHandlers) {
      communication.agentHandlers = {};
    }
    communication.agentHandlers[agentId] = handler;
    return true;
  });
  
  communication.unregisterAgent.mockImplementation((agentId) => {
    if (communication.agentHandlers && communication.agentHandlers[agentId]) {
      delete communication.agentHandlers[agentId];
      return true;
    }
    return false;
  });
  
  communication.broadcastMessage.mockImplementation(async (message) => {
    if (!message.recipients) {
      message.recipients = 'broadcast';
    }
    return await communication.sendMessage(message);
  });
  
  communication.clearMessageHistory.mockImplementation(() => {
    communication.messageHistory = [];
    return Promise.resolve(true);
  });
  
  communication.getMessageHistory.mockImplementation((agentId) => {
    // Filter messages where agentId is either the sender or in recipients
    const agentMessages = communication.messageHistory.filter(msg => {
      if (msg.sender === agentId) return true;
      
      if (Array.isArray(msg.recipients)) {
        return msg.recipients.includes(agentId);
      }
      
      if (msg.recipients === 'broadcast' && msg.sender !== agentId) {
        return true;
      }
      
      return false;
    });
    
    return Promise.resolve(agentMessages);
  });
  
  // Create mock team formation service
  const teamFormation = {
    assessMeetingCharacteristics: jest.fn().mockImplementation((meeting) => {
      return {
        complexity: 0.75,
        topicDiversity: 0.6,
        requiredExpertise: {
          [AgentExpertise.TOPIC_ANALYSIS]: 0.9,
          [AgentExpertise.ACTION_ITEM_EXTRACTION]: 0.8,
          [AgentExpertise.SUMMARY_GENERATION]: 0.7,
          [AgentExpertise.DECISION_TRACKING]: 0.5,
          [AgentExpertise.SENTIMENT_ANALYSIS]: 0.3
        }
      };
    }),
    formTeam: jest.fn().mockImplementation((meeting) => {
      return {
        teamId: `team-${meeting.meetingId}`,
        meetingId: meeting.meetingId,
        members: [
          {
            agentId: 'agent-1',
            name: 'Topic Analyzer',
            expertise: [AgentExpertise.TOPIC_ANALYSIS, AgentExpertise.SUMMARY_GENERATION]
          },
          {
            agentId: 'agent-2',
            name: 'Action Item Extractor',
            expertise: [AgentExpertise.ACTION_ITEM_EXTRACTION]
          },
          {
            agentId: 'agent-3',
            name: 'Summary Generator',
            expertise: [AgentExpertise.SUMMARY_GENERATION, AgentExpertise.SENTIMENT_ANALYSIS]
          }
        ],
        coverage: {
          expertiseCoverage: 0.85,
          specializations: {
            [AgentExpertise.TOPIC_ANALYSIS]: 1,
            [AgentExpertise.ACTION_ITEM_EXTRACTION]: 1,
            [AgentExpertise.SUMMARY_GENERATION]: 2,
            [AgentExpertise.SENTIMENT_ANALYSIS]: 1
          }
        }
      };
    })
  };
  
  // Create mock API compatibility layer
  const apiCompatibility = {
    startAnalysis: jest.fn().mockImplementation(async (request: any) => {
      await stateRepository.saveMeeting(request);
      return {
        requestId: request.requestId,
        meetingId: request.meetingId,
        status: 'in_progress',
      };
    }),
    getAnalysisResult: jest.fn().mockImplementation(async (meetingId: string) => {
      const result = await stateRepository.getAnalysisResult(meetingId);
      return result || { status: 'not_found' };
    }),
    getAnalysisStatus: jest.fn().mockImplementation(async (meetingId: string) => {
      const status = await stateRepository.getAnalysisStatus(meetingId);
      return status || { status: 'not_found' };
    }),
  };
  
  // Mock task decomposer
  const taskDecomposer = {
    assessComplexity: jest.fn(),
    decomposeTask: jest.fn(),
    detectDependencies: jest.fn(),
    estimateResources: jest.fn()
  };

  // Mock workflow manager
  const workflowManager = {
    createWorkflow: jest.fn(),
    executeWorkflow: jest.fn(),
    getWorkflowStatus: jest.fn(),
    updateWorkflow: jest.fn()
  };

  // Mock scheduler
  const scheduler = {
    prioritizeTasks: jest.fn(),
    scheduleTask: jest.fn(),
    rescheduleTask: jest.fn(),
    calculateDeadlines: jest.fn()
  };

  // Mock dependency verifier
  const dependencyVerifier = {
    getExecutableTasks: jest.fn(),
    verifyDependencies: jest.fn(),
    updateTaskStatus: jest.fn(),
    detectCircularDependencies: jest.fn()
  };
  
  return {
    stateRepository,
    sharedMemory,
    communication,
    teamFormation,
    apiCompatibility,
    taskDecomposer,
    workflowManager,
    scheduler,
    dependencyVerifier
  };
}

/**
 * Clean up the test environment
 */
export async function cleanupTestEnvironment(): Promise<void> {
  // Clean up any resources as needed
  await flushPromises();
}

/**
 * Utility to flush all promises in the event queue
 */
export async function flushPromises(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve));
} 