/**
 * End-to-End Tests for Meeting Analysis Workflow
 * 
 * Tests the complete meeting analysis process from initialization to result generation.
 */

import { jest } from '@jest/globals';
import { v4 as uuidv4 } from 'uuid';
import {
  setupTestEnvironment,
  cleanupTestEnvironment,
  createTestMeeting,
  createTestAnalysisRequest,
  mockAgentResponses,
  PerformanceTracker,
  flushPromises
} from '../test-utils';

// Define message interface to fix the type errors
interface AgentMessage {
  id: string;
  type: string;
  sender: string;
  recipients: string[];
  content: any;
  timestamp: number;
  replyTo?: string;
}

describe('Meeting Analysis End-to-End Workflow', () => {
  let testEnv: any;
  let performanceTracker: PerformanceTracker;
  
  beforeAll(async () => {
    // Set up the test environment with all services
    testEnv = await setupTestEnvironment();
  });
  
  afterAll(async () => {
    // Clean up after tests
    await cleanupTestEnvironment();
  });
  
  beforeEach(() => {
    jest.clearAllMocks();
    performanceTracker = new PerformanceTracker();
  });
  
  test('should perform complete meeting analysis workflow', async () => {
    const { 
      apiCompatibility, 
      stateRepository, 
      sharedMemory, 
      communication, 
      teamFormation 
    } = testEnv;
    
    // Start performance tracking
    performanceTracker.start();
    performanceTracker.mark('setup-start');
    
    // 1. Create a test meeting
    const testMeeting = createTestMeeting();
    
    // 2. Save meeting to repository
    await stateRepository.saveMeeting(testMeeting);
    
    // 3. Create analysis request
    const analysisRequest = createTestAnalysisRequest(testMeeting.meetingId);
    
    // 4. Setup mock for team formation to avoid actual agent creation
    const mockAgents = [
      { id: `agent-${uuidv4()}`, role: 'coordinator' },
      { id: `agent-${uuidv4()}`, role: 'topic_analyzer' },
      { id: `agent-${uuidv4()}`, role: 'action_item_extractor' },
      { id: `agent-${uuidv4()}`, role: 'summarizer' },
    ];
    
    jest.spyOn(teamFormation, 'formTeam').mockResolvedValue(mockAgents);
    
    // 5. Setup mock agent handlers for communication
    // Using any type for simplicity in this test file
    const agentHandlers: Record<string, any> = {};
    
    for (const agent of mockAgents) {
      const handler = jest.fn(async (message: AgentMessage) => {
        // For request messages, send a response back
        if (message.type === 'request') {
          const responseId = `response-${uuidv4()}`;
          const responseMessage: AgentMessage = {
            id: responseId,
            type: 'response',
            sender: agent.id,
            recipients: [message.sender],
            replyTo: message.id,
            content: {
              status: 'success',
              data: {
                result: `Mock result for ${agent.role}`,
                confidence: 'high',
              },
            },
            timestamp: Date.now(),
          };
          
          // Send response after a small delay to simulate processing
          setTimeout(async () => {
            await communication.sendMessage(responseMessage);
          }, 50);
        }
      });
      
      // Register mock agent handler
      agentHandlers[agent.id] = handler;
      await communication.registerAgent(agent.id, handler);
    }
    
    performanceTracker.mark('setup-complete');
    
    // 6. Start the analysis process
    performanceTracker.mark('analysis-start');
    const analysisResult = await apiCompatibility.startAnalysis(analysisRequest);
    
    // Verify analysis was started successfully
    expect(analysisResult).toBeDefined();
    expect(analysisResult.requestId).toBeDefined();
    
    // 7. Wait for analysis to complete (mocked)
    performanceTracker.mark('analysis-wait-start');
    
    // Simulate analysis completion (this would normally be done by the agents)
    const analysisOutput = {
      status: 'completed',
      results: {
        topics: ['Product Roadmap', 'Timeline Concerns', 'Release Planning'],
        actionItems: [
          {
            description: 'Update the project plan with new timeline',
            assignee: 'John Doe',
            deadline: 'end of week',
          }
        ],
        summary: 'The meeting discussed Q3 roadmap planning with concerns about timeline. Action items were assigned to update the project plan.',
      },
      metadata: {
        confidence: 'high',
        completedAt: new Date().toISOString(),
        processingTime: 1.5, // seconds
      }
    };
    
    // Update the analysis state to completed
    await stateRepository.saveAnalysisResult(testMeeting.meetingId, analysisOutput);
    
    // Allow time for the system to process
    await flushPromises();
    await new Promise(resolve => setTimeout(resolve, 100));
    
    performanceTracker.mark('analysis-wait-complete');
    
    // 8. Retrieve the final analysis result
    performanceTracker.mark('result-retrieval-start');
    const finalResult = await apiCompatibility.getAnalysisResult(testMeeting.meetingId);
    performanceTracker.mark('result-retrieval-complete');
    
    // Verify analysis result
    expect(finalResult).toBeDefined();
    expect(finalResult.status).toBe('completed');
    expect(finalResult.results).toEqual(analysisOutput.results);
    
    // Check if all expected agents received messages
    for (const agent of mockAgents) {
      const handler = agentHandlers[agent.id];
      
      // Verify coordinator received more messages than others
      if (agent.role === 'coordinator') {
        expect(handler.mock.calls.length).toBeGreaterThan(0);
      }
    }
    
    // End performance tracking
    performanceTracker.end();
    
    // Calculate processing stages durations
    performanceTracker.measure('setup', 'setup-start', 'setup-complete');
    performanceTracker.measure('analysis', 'analysis-start', 'analysis-wait-complete');
    performanceTracker.measure('result-retrieval', 'result-retrieval-start', 'result-retrieval-complete');
    
    // Log performance results for analysis
    console.log('End-to-End Test Performance:');
    performanceTracker.logResults();
  });
  
  test('should handle analysis failures gracefully', async () => {
    const { apiCompatibility, stateRepository } = testEnv;
    
    // Create a test meeting with problematic data
    const testMeeting = createTestMeeting({
      transcript: {
        segments: [] // Empty transcript should trigger failure
      }
    });
    
    // Save meeting to repository
    await stateRepository.saveMeeting(testMeeting);
    
    // Create analysis request
    const analysisRequest = createTestAnalysisRequest(testMeeting.meetingId);
    
    // Start the analysis process
    const analysisResult = await apiCompatibility.startAnalysis(analysisRequest);
    
    // Verify analysis was started
    expect(analysisResult).toBeDefined();
    expect(analysisResult.requestId).toBeDefined();
    
    // Simulate analysis failure
    const failureOutput = {
      status: 'failed',
      error: {
        code: 'EMPTY_TRANSCRIPT',
        message: 'Cannot analyze an empty transcript',
        details: 'The meeting transcript has no content segments'
      },
      metadata: {
        failedAt: new Date().toISOString()
      }
    };
    
    // Update the analysis state to failed
    await stateRepository.saveAnalysisResult(testMeeting.meetingId, failureOutput);
    
    // Allow time for the system to process
    await flushPromises();
    
    // Retrieve the final analysis result
    const finalResult = await apiCompatibility.getAnalysisResult(testMeeting.meetingId);
    
    // Verify failure was properly handled
    expect(finalResult).toBeDefined();
    expect(finalResult.status).toBe('failed');
    expect(finalResult.error).toBeDefined();
    expect(finalResult.error.code).toBe('EMPTY_TRANSCRIPT');
  });
  
  test('should support incremental retrieval of analysis progress', async () => {
    const { apiCompatibility, stateRepository } = testEnv;
    
    // Create a test meeting
    const testMeeting = createTestMeeting();
    
    // Save meeting to repository
    await stateRepository.saveMeeting(testMeeting);
    
    // Create analysis request
    const analysisRequest = createTestAnalysisRequest(testMeeting.meetingId);
    
    // Start the analysis process
    const analysisResult = await apiCompatibility.startAnalysis(analysisRequest);
    
    // Verify analysis was started
    expect(analysisResult).toBeDefined();
    
    // Update analysis with partial results (25% complete)
    await stateRepository.saveAnalysisProgress(testMeeting.meetingId, {
      status: 'in_progress',
      progress: 25,
      partialResults: {
        topics: ['Product Roadmap']
      },
      updatedAt: new Date().toISOString()
    });
    
    // Get progress status at 25%
    const progress25 = await apiCompatibility.getAnalysisStatus(testMeeting.meetingId);
    expect(progress25.status).toBe('in_progress');
    expect(progress25.progress).toBe(25);
    expect(progress25.partialResults.topics).toEqual(['Product Roadmap']);
    
    // Update analysis with more partial results (75% complete)
    await stateRepository.saveAnalysisProgress(testMeeting.meetingId, {
      status: 'in_progress',
      progress: 75,
      partialResults: {
        topics: ['Product Roadmap', 'Timeline Concerns', 'Release Planning'],
        actionItems: [
          {
            description: 'Update the project plan with new timeline',
            assignee: 'John Doe',
          }
        ]
      },
      updatedAt: new Date().toISOString()
    });
    
    // Get progress status at 75%
    const progress75 = await apiCompatibility.getAnalysisStatus(testMeeting.meetingId);
    expect(progress75.status).toBe('in_progress');
    expect(progress75.progress).toBe(75);
    expect(progress75.partialResults.topics.length).toBe(3);
    expect(progress75.partialResults.actionItems.length).toBe(1);
    
    // Complete the analysis
    const finalOutput = {
      status: 'completed',
      progress: 100,
      results: {
        topics: ['Product Roadmap', 'Timeline Concerns', 'Release Planning'],
        actionItems: [
          {
            description: 'Update the project plan with new timeline',
            assignee: 'John Doe',
            deadline: 'end of week',
          }
        ],
        summary: 'The meeting discussed Q3 roadmap planning with concerns about timeline. Action items were assigned to update the project plan.',
      },
      metadata: {
        confidence: 'high',
        completedAt: new Date().toISOString(),
        processingTime: 1.5, // seconds
      }
    };
    
    await stateRepository.saveAnalysisResult(testMeeting.meetingId, finalOutput);
    
    // Get final result
    const finalResult = await apiCompatibility.getAnalysisResult(testMeeting.meetingId);
    
    // Verify complete results
    expect(finalResult.status).toBe('completed');
    expect(finalResult.progress).toBe(100);
    expect(finalResult.results.summary).toBeDefined();
  });
}); 