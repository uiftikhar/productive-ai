/**
 * Integration Tests for Team Formation Service
 * 
 * Tests the team formation service's capability to form teams based on meeting characteristics,
 * assess expertise coverage, and manage team composition for meeting analysis.
 */

import { jest } from '@jest/globals';
import {
  setupTestEnvironment,
  cleanupTestEnvironment,
  createTestMeeting,
  PerformanceTracker,
  flushPromises
} from '../test-utils';
import { v4 as uuidv4 } from 'uuid';
import { AgentExpertise } from '../../agentic-meeting-analysis';

describe('Team Formation Integration', () => {
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
  
  test('should assess meeting characteristics correctly', async () => {
    // Create a test meeting with specific characteristics
    const testMeeting = createTestMeeting({
      meetingId: `team-formation-test-${uuidv4()}`,
      title: 'Product Strategy Meeting',
    });
    
    // Start performance tracking
    performanceTracker.start();
    
    // Assess meeting characteristics
    performanceTracker.measure('meeting-assessment', async () => {
      const characteristics = await testEnv.teamFormation.assessMeetingCharacteristics(testMeeting);
      
      // Verify the assessment
      expect(characteristics).toBeDefined();
      expect(characteristics.complexity).toBeGreaterThan(0);
      expect(characteristics.topicDiversity).toBeGreaterThan(0);
      expect(characteristics.requiredExpertise).toBeDefined();
      
      // Verify the required expertise includes basic competencies
      expect(Object.keys(characteristics.requiredExpertise).length).toBeGreaterThan(0);
      expect(characteristics.requiredExpertise[AgentExpertise.TOPIC_ANALYSIS]).toBeDefined();
      expect(characteristics.requiredExpertise[AgentExpertise.ACTION_ITEM_EXTRACTION]).toBeDefined();
    });
    
    // End performance tracking
    performanceTracker.end();
    performanceTracker.logResults();
  });
  
  test('should form an appropriate team for a meeting', async () => {
    // Create a test meeting
    const testMeeting = createTestMeeting({
      meetingId: `team-formation-test-${uuidv4()}`,
      participants: [
        { id: 'user1', name: 'John Doe', role: 'Product Manager' },
        { id: 'user2', name: 'Mary Smith', role: 'Developer' },
        { id: 'user3', name: 'Sarah Johnson', role: 'Designer' },
        { id: 'user4', name: 'Michael Brown', role: 'Marketing' },
      ],
    });
    
    // Start performance tracking
    performanceTracker.start();
    
    // Form a team for the meeting
    let team: any;
    await performanceTracker.measureAsync('team-formation', async () => {
      team = await testEnv.teamFormation.formTeam(testMeeting);
      
      // Verify the formed team
      expect(team).toBeDefined();
      expect(team.members).toBeDefined();
      expect(team.members.length).toBeGreaterThan(0);
      
      // Verify team coverage
      expect(team.coverage).toBeDefined();
      expect(team.coverage.expertiseCoverage).toBeGreaterThan(0.5); // At least 50% coverage
    });
    
    // Verify team members have appropriate expertise
    const hasSummarizer = team.members.some(
      (member: {expertise: AgentExpertise[]}) => member.expertise.includes(AgentExpertise.SUMMARY_GENERATION)
    );
    const hasTopicAnalyzer = team.members.some(
      (member: {expertise: AgentExpertise[]}) => member.expertise.includes(AgentExpertise.TOPIC_ANALYSIS)
    );
    const hasActionItemExtractor = team.members.some(
      (member: {expertise: AgentExpertise[]}) => member.expertise.includes(AgentExpertise.ACTION_ITEM_EXTRACTION)
    );
    
    expect(hasSummarizer).toBe(true);
    expect(hasTopicAnalyzer).toBe(true);
    expect(hasActionItemExtractor).toBe(true);
    
    // Verify team size is appropriate
    expect(team.members.length).toBeGreaterThanOrEqual(3); // Minimum team size for basic coverage
    
    // End performance tracking
    performanceTracker.end();
    performanceTracker.logResults();
  });
  
  test('should calculate expertise coverage correctly', async () => {
    // Create a test meeting with specific needs
    const testMeeting = createTestMeeting({
      meetingId: `coverage-test-${uuidv4()}`,
      title: 'Technical Design Review',
    });
    
    // Start performance tracking
    performanceTracker.start();
    
    // Form team first to get access to the team
    const team = await testEnv.teamFormation.formTeam(testMeeting);
    
    // Calculate expertise coverage directly (not through the public API)
    // We'll check the coverage value returned from the formTeam method
    const expertiseCoverage = team.coverage.expertiseCoverage;
    
    // Verify the expertise coverage calculation
    expect(expertiseCoverage).toBeGreaterThan(0);
    expect(expertiseCoverage).toBeLessThanOrEqual(1);
    
    // Verify coverage ratio aligns with team composition
    // Number of expertise areas covered divided by total expertise areas needed
    const coveredExpertise = new Set();
    for (const member of team.members) {
      for (const expertise of member.expertise) {
        coveredExpertise.add(expertise);
      }
    }
    
    // The coverage ratio should be close to the number of expertise areas covered
    // divided by the number of expertise types
    const expertiseValues = Object.values(AgentExpertise);
    const calculatedCoverage = coveredExpertise.size / expertiseValues.length;
    
    // The calculated coverage should be close to the returned coverage
    // but they may not be exactly equal due to weighting factors
    expect(Math.abs(expertiseCoverage - calculatedCoverage)).toBeLessThan(0.5);
    
    // End performance tracking
    performanceTracker.end();
    performanceTracker.logResults();
  });
}); 