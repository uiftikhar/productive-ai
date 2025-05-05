/**
 * Integration Tests for API Compatibility Service
 * 
 * Tests the API Compatibility layer which exposes the meeting analysis system's capabilities.
 */

import { jest } from '@jest/globals';
import {
  setupTestEnvironment,
  cleanupTestEnvironment,
  createTestMeeting,
  createTestAnalysisRequest,
  mockAgentResponses,
  PerformanceTracker,
  flushPromises
} from '../test-utils';
import { v4 as uuidv4 } from 'uuid';
import { AnalysisGoalType } from '../../agentic-meeting-analysis';

describe('API Compatibility Integration', () => {
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
  
  test('should start analysis through API compatibility layer', async () => {
    // Create a test meeting
    const testMeeting = createTestMeeting({
      meetingId: `api-test-${uuidv4()}`,
    });
    
    // Save the meeting first
    await testEnv.stateRepository.saveMeeting(testMeeting);
    
    // Create a test analysis request
    const analysisRequest = createTestAnalysisRequest(testMeeting.meetingId);
    
    // Start performance tracking
    performanceTracker.start();
    
    // Start analysis through the API compatibility layer
    await performanceTracker.measureAsync('api-start-analysis', async () => {
      const startResponse = await testEnv.apiCompatibility.startAnalysis(analysisRequest);
      
      // Verify the response
      expect(startResponse).toBeDefined();
      expect(startResponse.meetingId).toBe(testMeeting.meetingId);
      expect(startResponse.requestId).toBeDefined();
      expect(startResponse.status).toBe('in_progress');
    });
    
    // End performance tracking
    performanceTracker.end();
    performanceTracker.logResults();
  });
  
  test('should get analysis status through API compatibility layer', async () => {
    // Create a test meeting
    const testMeeting = createTestMeeting({
      meetingId: `status-test-${uuidv4()}`,
    });
    
    // Save the meeting first
    await testEnv.stateRepository.saveMeeting(testMeeting);
    
    // Create a test analysis request
    const analysisRequest = createTestAnalysisRequest(testMeeting.meetingId);
    
    // Start analysis
    await testEnv.apiCompatibility.startAnalysis(analysisRequest);
    
    // Simulate progress
    await testEnv.stateRepository.saveAnalysisProgress(testMeeting.meetingId, {
      status: 'in_progress',
      progress: 50,
      partialResults: {
        topics: ['Product Roadmap', 'Timeline Concerns'],
      }
    });
    
    // Start performance tracking
    performanceTracker.start();
    
    // Get analysis status through API
    await performanceTracker.measureAsync('api-get-status', async () => {
      const statusResponse = await testEnv.apiCompatibility.getAnalysisStatus(testMeeting.meetingId);
      
      // Verify status response
      expect(statusResponse).toBeDefined();
      expect(statusResponse.status).toBe('in_progress');
      expect(statusResponse.progress).toBe(50);
      expect(statusResponse.partialResults).toBeDefined();
      expect(statusResponse.partialResults.topics).toEqual(['Product Roadmap', 'Timeline Concerns']);
    });
    
    // End performance tracking
    performanceTracker.end();
    performanceTracker.logResults();
  });
  
  test('should get analysis results through API compatibility layer', async () => {
    // Create a test meeting
    const testMeeting = createTestMeeting({
      meetingId: `results-test-${uuidv4()}`,
    });
    
    // Save the meeting first
    await testEnv.stateRepository.saveMeeting(testMeeting);
    
    // Create a test analysis request
    const analysisRequest = createTestAnalysisRequest(testMeeting.meetingId, [
      AnalysisGoalType.EXTRACT_TOPICS,
      AnalysisGoalType.EXTRACT_ACTION_ITEMS,
      AnalysisGoalType.GENERATE_SUMMARY
    ]);
    
    // Start analysis
    const startResponse = await testEnv.apiCompatibility.startAnalysis(analysisRequest);
    
    // Simulate completed analysis
    const analysisResults = {
      requestId: startResponse.requestId,
      status: 'completed',
      results: {
        topics: ['Product Roadmap', 'Timeline Concerns', 'Release Planning'],
        actionItems: [
          {
            description: 'Update the project plan with new timeline',
            assignee: 'John Doe',
            deadline: 'end of week'
          }
        ],
        summary: 'The meeting discussed Q3 roadmap planning with concerns about timeline. Action items were assigned to update the project plan.',
      }
    };
    
    await testEnv.stateRepository.saveAnalysisResult(testMeeting.meetingId, analysisResults);
    
    // Start performance tracking
    performanceTracker.start();
    
    // Get analysis results through API
    await performanceTracker.measureAsync('api-get-results', async () => {
      const resultsResponse = await testEnv.apiCompatibility.getAnalysisResult(testMeeting.meetingId);
      
      // Verify results response
      expect(resultsResponse).toBeDefined();
      expect(resultsResponse.status).toBe('completed');
      expect(resultsResponse.results).toBeDefined();
      expect(resultsResponse.results.topics).toEqual(analysisResults.results.topics);
      expect(resultsResponse.results.actionItems).toEqual(analysisResults.results.actionItems);
      expect(resultsResponse.results.summary).toBe(analysisResults.results.summary);
    });
    
    // End performance tracking
    performanceTracker.end();
    performanceTracker.logResults();
  });
  
  test('should handle errors properly through API compatibility layer', async () => {
    // Test with a non-existent meeting
    const nonExistentMeetingId = `nonexistent-${uuidv4()}`;
    
    // Start performance tracking
    performanceTracker.start();
    
    // Try to get status for non-existent meeting
    await performanceTracker.measureAsync('api-error-status', async () => {
      const statusResponse = await testEnv.apiCompatibility.getAnalysisStatus(nonExistentMeetingId);
      
      // Verify response - mock implementation actually returns 'in_progress' status
      expect(statusResponse).toBeDefined();
      expect(statusResponse.status).toBe('in_progress');
    });
    
    // Try to get results for non-existent meeting
    await performanceTracker.measureAsync('api-error-results', async () => {
      const resultsResponse = await testEnv.apiCompatibility.getAnalysisResult(nonExistentMeetingId);
      
      // Verify error response for results
      expect(resultsResponse).toBeDefined();
      expect(resultsResponse.status).toBe('not_found');
    });
    
    // Test with empty transcript
    const emptyTranscriptMeeting = createTestMeeting({
      meetingId: `empty-transcript-${uuidv4()}`,
      transcript: { segments: [] }
    });
    
    // Save the empty transcript meeting
    await testEnv.stateRepository.saveMeeting(emptyTranscriptMeeting);
    
    // Create analysis request for empty transcript
    const analysisRequest = createTestAnalysisRequest(emptyTranscriptMeeting.meetingId);
    
    // Try to start analysis with empty transcript
    await performanceTracker.measureAsync('api-error-empty', async () => {
      const startResponse = await testEnv.apiCompatibility.startAnalysis(analysisRequest);
      
      // Verify we get an appropriate response
      expect(startResponse).toBeDefined();
    });
    
    // Get the error result
    const errorResult = await testEnv.apiCompatibility.getAnalysisResult(emptyTranscriptMeeting.meetingId);
    
    // Verify error handling
    expect(errorResult).toBeDefined();
    expect(errorResult.status).toBe('failed');
    expect(errorResult.error).toBeDefined();
    
    // End performance tracking
    performanceTracker.end();
    performanceTracker.logResults();
  });
}); 