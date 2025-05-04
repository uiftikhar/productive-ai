/**
 * Performance Tests for Agentic Meeting Analysis System
 * 
 * Tests performance characteristics including memory usage and response times.
 */

import { jest } from '@jest/globals';
import { v4 as uuidv4 } from 'uuid';
import {
  setupTestEnvironment,
  cleanupTestEnvironment,
  createTestMeeting,
  createTestAnalysisRequest,
  PerformanceTracker,
  TestCache,
  flushPromises
} from '../test-utils';

describe('Agentic Meeting Analysis Performance', () => {
  let testEnv: any;
  let performanceTracker: PerformanceTracker;
  let testCache: TestCache;
  
  beforeAll(async () => {
    // Set up the test environment with all services
    testEnv = await setupTestEnvironment();
    testCache = new TestCache();
  });
  
  afterAll(async () => {
    // Clean up after tests
    await cleanupTestEnvironment();
  });
  
  beforeEach(() => {
    jest.clearAllMocks();
    performanceTracker = new PerformanceTracker();
    testCache.clear();
  });
  
  test('should measure memory usage during analysis', async () => {
    const { apiCompatibility, stateRepository } = testEnv;
    
    // Start performance tracking with memory capture
    performanceTracker.start();
    
    // Create test meetings (multiple to measure memory impact)
    const numMeetings = 10;
    const meetings = [];
    
    performanceTracker.mark('creation-start');
    
    for (let i = 0; i < numMeetings; i++) {
      // Create meeting with varying number of transcript segments to test scaling
      const segments = [];
      const numSegments = 5 + i * 5; // 5, 10, 15, ... segments
      
      for (let j = 0; j < numSegments; j++) {
        segments.push({
          id: `segment-${uuidv4()}`,
          speakerId: `user-${j % 3 + 1}`,
          speakerName: `Speaker ${j % 3 + 1}`,
          content: `This is test content for segment ${j} with some additional words to make it more realistic in terms of length and content variety.`,
          startTime: j * 10000,
          endTime: (j + 1) * 10000 - 1000,
        });
      }
      
      const meeting = createTestMeeting({
        meetingId: `perf-meeting-${i}`,
        transcript: { segments }
      });
      
      meetings.push(meeting);
      
      // Save meeting to repository
      await stateRepository.saveMeeting(meeting);
    }
    
    performanceTracker.mark('creation-end');
    performanceTracker.measure('meeting-creation', 'creation-start', 'creation-end', true);
    
    // Test retrieving meetings in sequence (no caching)
    performanceTracker.mark('sequential-retrieval-start');
    
    for (const meeting of meetings) {
      const retrievedMeeting = await stateRepository.getMeeting(meeting.meetingId);
      expect(retrievedMeeting).toBeDefined();
    }
    
    performanceTracker.mark('sequential-retrieval-end');
    performanceTracker.measure('sequential-retrieval', 'sequential-retrieval-start', 'sequential-retrieval-end', true);
    
    // Test retrieving meetings with caching
    performanceTracker.mark('cached-retrieval-start');
    
    for (const meeting of meetings) {
      const cacheKey = `meeting:${meeting.meetingId}`;
      
      // Try to get from cache first
      let retrievedMeeting = testCache.get(cacheKey);
      
      if (!retrievedMeeting) {
        // If not in cache, get from repository and cache it
        retrievedMeeting = await stateRepository.getMeeting(meeting.meetingId);
        testCache.set(cacheKey, retrievedMeeting);
      }
      
      expect(retrievedMeeting).toBeDefined();
    }
    
    // Get cache stats
    const cacheStats = testCache.getStats();
    
    performanceTracker.mark('cached-retrieval-end');
    performanceTracker.measure('cached-retrieval', 'cached-retrieval-start', 'cached-retrieval-end', true);
    
    // Now test analysis requests (use fewer meetings for this to avoid excessive memory use)
    const analysisGroup = meetings.slice(0, 3);
    performanceTracker.mark('analysis-requests-start');
    
    const analysisPromises = analysisGroup.map(async (meeting) => {
      // Create analysis request
      const analysisRequest = createTestAnalysisRequest(meeting.meetingId);
      
      // Start analysis
      const result = await apiCompatibility.startAnalysis(analysisRequest);
      expect(result).toBeDefined();
      
      // Simulate completion
      await stateRepository.saveAnalysisResult(meeting.meetingId, {
        status: 'completed',
        results: {
          topics: ['Test Topic 1', 'Test Topic 2'],
          actionItems: [{ description: 'Test action', assignee: 'User 1' }],
          summary: 'This is a test summary'
        }
      });
      
      return meeting.meetingId;
    });
    
    // Wait for all analyses to complete
    await Promise.all(analysisPromises);
    
    performanceTracker.mark('analysis-requests-end');
    performanceTracker.measure('analysis-requests', 'analysis-requests-start', 'analysis-requests-end', true);
    
    // Retrieve all results (should be fast with caching)
    performanceTracker.mark('results-retrieval-start');
    
    for (const meeting of analysisGroup) {
      const result = await apiCompatibility.getAnalysisResult(meeting.meetingId);
      expect(result).toBeDefined();
      expect(result.status).toBe('completed');
    }
    
    performanceTracker.mark('results-retrieval-end');
    performanceTracker.measure('results-retrieval', 'results-retrieval-start', 'results-retrieval-end', true);
    
    // End performance tracking
    performanceTracker.end();
    
    // Output performance results
    console.log('Performance Test Results:');
    console.log(`Created ${numMeetings} meetings with varying transcript lengths`);
    console.log(`Cache stats: ${cacheStats.hits} hits, ${cacheStats.misses} misses, ${(cacheStats.hitRatio * 100).toFixed(2)}% hit ratio`);
    
    // Log all performance metrics
    performanceTracker.logResults();
    
    // Expectations about performance
    expect(performanceTracker.getResults().measures['cached-retrieval'].duration)
      .toBeLessThan(performanceTracker.getResults().measures['sequential-retrieval'].duration);
  });
  
  test('should handle concurrent requests efficiently', async () => {
    const { apiCompatibility, stateRepository } = testEnv;
    
    // Start performance tracking
    performanceTracker.start();
    
    // Create a single test meeting with a substantial transcript
    const segments = Array(50).fill(0).map((_, i) => ({
      id: `segment-${uuidv4()}`,
      speakerId: `user-${i % 3 + 1}`,
      speakerName: `Speaker ${i % 3 + 1}`,
      content: `This is test content for segment ${i} with some additional words to make it more realistic.`,
      startTime: i * 10000,
      endTime: (i + 1) * 10000 - 1000,
    }));
    
    const meeting = createTestMeeting({
      meetingId: `perf-concurrent-meeting`,
      transcript: { segments }
    });
    
    // Save meeting to repository
    await stateRepository.saveMeeting(meeting);
    
    // Create different types of analysis requests
    const requestTypes = [
      [{ meetingId: meeting.meetingId, goalType: 'extract_topics' }],
      [{ meetingId: meeting.meetingId, goalType: 'extract_action_items' }],
      [{ meetingId: meeting.meetingId, goalType: 'generate_summary' }],
      [{ meetingId: meeting.meetingId, goalType: 'full_analysis' }]
    ];
    
    // Test concurrent request handling
    performanceTracker.mark('concurrent-requests-start');
    
    // Launch concurrent requests (5 of each type)
    const allRequests = [];
    
    for (const requestType of requestTypes) {
      for (let i = 0; i < 5; i++) {
        const request = createTestAnalysisRequest(meeting.meetingId, [requestType[0].goalType as any]);
        allRequests.push(apiCompatibility.startAnalysis(request));
      }
    }
    
    // Wait for all requests to be initiated
    const analysisResults = await Promise.all(allRequests);
    
    // Verify all requests were accepted
    for (const result of analysisResults) {
      expect(result).toBeDefined();
      expect(result.requestId).toBeDefined();
    }
    
    performanceTracker.mark('concurrent-requests-end');
    performanceTracker.measure('concurrent-requests', 'concurrent-requests-start', 'concurrent-requests-end', true);
    
    // Simulate completing all requests
    performanceTracker.mark('concurrent-completions-start');
    
    for (const result of analysisResults) {
      await stateRepository.saveAnalysisResult(meeting.meetingId, {
        requestId: result.requestId,
        status: 'completed',
        results: {
          topics: ['Concurrent Topic 1', 'Concurrent Topic 2'],
          actionItems: [{ description: 'Concurrent action', assignee: 'User 1' }],
          summary: 'This is a concurrent test summary'
        }
      });
    }
    
    performanceTracker.mark('concurrent-completions-end');
    performanceTracker.measure('concurrent-completions', 'concurrent-completions-start', 'concurrent-completions-end', true);
    
    // End performance tracking
    performanceTracker.end();
    
    // Output performance results
    console.log('Concurrent Requests Performance Test Results:');
    console.log(`Processed ${allRequests.length} concurrent requests`);
    performanceTracker.logResults();
    
    // Verify performance remains reasonable even under concurrent load
    expect(performanceTracker.getResults().measures['concurrent-requests'].duration / allRequests.length)
      .toBeLessThan(500); // Average time per request should be under 500ms
  });
}); 