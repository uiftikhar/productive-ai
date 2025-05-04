/**
 * Test Utilities for Agentic Meeting Analysis System
 * 
 * This file contains utilities for writing integration and end-to-end tests
 * for the agentic workflow system.
 */

import { v4 as uuidv4 } from 'uuid';
import { AnalysisGoalType, IMeetingAnalysisAgent, SharedMemoryService, StateRepositoryService, CommunicationService, TeamFormationService, ApiCompatibilityService } from '../agentic-meeting-analysis';
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
 * Create a test meeting record with realistic data
 */
export function createTestMeeting(customData: any = {}) {
  const meetingId = customData.meetingId || `meeting-${uuidv4()}`;
  const timestamp = Date.now();
  
  return {
    meetingId,
    metadata: {
      meetingId,
      title: customData.title || 'Test Meeting',
      description: customData.description || 'This is a test meeting for integration tests',
      date: customData.date || new Date().toISOString(),
      participants: customData.participants || [
        { id: 'user1', name: 'Jane Smith', role: 'Presenter' },
        { id: 'user2', name: 'John Doe', role: 'Attendee' },
        { id: 'user3', name: 'Alice Johnson', role: 'Attendee' },
      ],
      duration: customData.duration || 3600, // 1 hour in seconds
    },
    transcript: {
      meetingId,
      segments: customData.segments || [
        {
          id: `segment-${uuidv4()}`,
          speakerId: 'user1',
          speakerName: 'Jane Smith',
          content: 'Welcome to our project planning meeting. Today we need to discuss the Q3 roadmap.',
          startTime: 0,
          endTime: 10000,
        },
        {
          id: `segment-${uuidv4()}`,
          speakerId: 'user2',
          speakerName: 'John Doe',
          content: 'I have some concerns about the timeline for the new feature rollout.',
          startTime: 11000,
          endTime: 18000,
        },
        {
          id: `segment-${uuidv4()}`,
          speakerId: 'user3',
          speakerName: 'Alice Johnson',
          content: 'I agree. We should consider pushing back the release date by at least two weeks.',
          startTime: 19000,
          endTime: 28000,
        },
        {
          id: `segment-${uuidv4()}`,
          speakerId: 'user1',
          speakerName: 'Jane Smith',
          content: "That's a valid point. Let's adjust our timeline. Can someone take an action item to update the project plan?",
          startTime: 30000,
          endTime: 38000,
        },
        {
          id: `segment-${uuidv4()}`,
          speakerId: 'user2',
          speakerName: 'John Doe',
          content: "I'll take care of updating the project plan by end of week.",
          startTime: 40000,
          endTime: 45000,
        },
      ],
    },
    status: customData.status || 'pending',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

/**
 * Create a test analysis request
 */
export function createTestAnalysisRequest(meetingId: string, customGoals?: AnalysisGoalType[]): AgenticMeetingAnalysisRequest {
  return {
    meetingId,
    goals: customGoals || [
      AnalysisGoalType.EXTRACT_TOPICS,
      AnalysisGoalType.EXTRACT_ACTION_ITEMS,
      AnalysisGoalType.GENERATE_SUMMARY,
    ],
    options: {
      detailLevel: 'high',
      includeTranscriptReferences: true,
      formatType: 'structured',
    },
  };
}

/**
 * Mock for the agent lifecycle methods to prevent actual LLM calls during tests
 */
export function mockAgentResponses(agent: IMeetingAnalysisAgent, mockResponses: Record<string, any> = {}) {
  // Store original methods to restore them later
  const originalExecuteMethod = (agent as any).execute;
  
  // Replace execute with mock implementation
  jest.spyOn(agent as any, 'execute').mockImplementation(async (...args: unknown[]) => {
    const request = args[0] as AgentExecutionRequest;
    const capability = request.capability || 'default';
    
    if (mockResponses[capability]) {
      return { output: mockResponses[capability] };
    }
    
    // Default mock response
    return {
      output: {
        status: 'success',
        message: `Mock response for ${capability}`,
        data: { mockData: true },
      }
    };
  });
  
  // Return a function to restore the original methods
  return () => {
    (agent as any).execute = originalExecuteMethod;
  };
}

/**
 * Wait for all pending promises to resolve (useful for async test flows)
 */
export function flushPromises() {
  return new Promise(resolve => setImmediate(resolve));
}

/**
 * Performance measurement utility for tests
 */
export class PerformanceTracker {
  private startTime: number = 0;
  private endTime: number = 0;
  private marks: Record<string, number> = {};
  private measures: Record<string, {duration: number, memoryUsage?: NodeJS.MemoryUsage}> = {};
  
  start() {
    this.startTime = performance.now();
    this.marks = {};
    this.measures = {};
    this.mark('start');
    return this;
  }
  
  mark(name: string) {
    this.marks[name] = performance.now();
    return this;
  }
  
  measure(name: string, startMark: string, endMark: string, captureMemory: boolean = false) {
    if (!this.marks[startMark] || !this.marks[endMark]) {
      throw new Error(`Cannot measure: marks "${startMark}" or "${endMark}" not found`);
    }
    
    const duration = this.marks[endMark] - this.marks[startMark];
    
    this.measures[name] = {
      duration,
      ...(captureMemory ? { memoryUsage: process.memoryUsage() } : {})
    };
    
    return this;
  }
  
  end() {
    this.endTime = performance.now();
    this.mark('end');
    this.measure('total', 'start', 'end', true);
    return this;
  }
  
  getResults() {
    return {
      totalDuration: this.measures.total?.duration || (this.endTime - this.startTime),
      marks: this.marks,
      measures: this.measures,
    };
  }
  
  logResults() {
    console.log('Performance Results:');
    console.log(`Total duration: ${(this.measures.total?.duration || 0).toFixed(2)}ms`);
    
    console.log('Measures:');
    Object.entries(this.measures).forEach(([name, { duration, memoryUsage }]) => {
      console.log(`- ${name}: ${duration.toFixed(2)}ms`);
      if (memoryUsage) {
        console.log(`  Memory: ${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB heap used`);
      }
    });
    
    return this;
  }
}

/**
 * Set up a complete test environment with all required services
 */
export async function setupTestEnvironment() {
  // Initialize all required services
  const logger = new ConsoleLogger();
  logger.setLogLevel('info');
  
  const sharedMemory = getServiceInstance(SharedMemoryService, { logger });
  const stateRepository = getServiceInstance(StateRepositoryService, { logger });
  const communication = getServiceInstance(CommunicationService, { logger });
  const teamFormation = getServiceInstance(TeamFormationService, { logger });
  const apiCompatibility = getServiceInstance(ApiCompatibilityService, { 
    logger,
    stateRepository,
    sharedMemory,
    communication,
    teamFormation,
  });
  
  // Initialize services
  await (sharedMemory as any).initialize();
  await (stateRepository as any).initialize();
  await (communication as any).initialize();
  await (teamFormation as any).initialize();
  await (apiCompatibility as any).initialize();
  
  return {
    logger,
    sharedMemory,
    stateRepository,
    communication,
    teamFormation,
    apiCompatibility,
  };
}

/**
 * Clean up the test environment
 */
export async function cleanupTestEnvironment() {
  // Clear all service caches
  serviceCache.clear();
}

/**
 * Cache implementation for testing
 */
export class TestCache {
  private cache: Map<string, any> = new Map();
  private hits: number = 0;
  private misses: number = 0;
  
  get(key: string) {
    const value = this.cache.get(key);
    if (value !== undefined) {
      this.hits++;
      return value;
    }
    this.misses++;
    return null;
  }
  
  set(key: string, value: any, ttlMs?: number) {
    this.cache.set(key, value);
    
    if (ttlMs) {
      setTimeout(() => {
        this.cache.delete(key);
      }, ttlMs);
    }
    
    return true;
  }
  
  delete(key: string) {
    return this.cache.delete(key);
  }
  
  clear() {
    this.cache.clear();
    return true;
  }
  
  getStats() {
    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      hitRatio: this.hits / (this.hits + this.misses || 1),
    };
  }
} 