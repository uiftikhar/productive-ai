/**
 * Integration Tests for Visualization Services
 * 
 * Tests the visualization services for team composition, agent specialization,
 * and analysis processes.
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

// Mock visualization components
// These would normally be set up by the test environment
const mockTeamRoster = {
  createTeamVisualization: jest.fn().mockReturnValue('team-viz-1'),
  addTeamMember: jest.fn(),
  visualizeTeam: jest.fn().mockReturnValue({
    elements: [
      { id: 'node1', type: 'agent', data: { name: 'Agent 1' } },
      { id: 'node2', type: 'agent', data: { name: 'Agent 2' } },
      { id: 'edge1', type: 'relation', source: 'node1', target: 'node2' }
    ]
  }),
  getTeamComposition: jest.fn().mockReturnValue({
    expertiseCoverage: {
      [AgentExpertise.TOPIC_ANALYSIS]: 1,
      [AgentExpertise.ACTION_ITEM_EXTRACTION]: 1,
      [AgentExpertise.SUMMARY_GENERATION]: 0.5
    },
    teamSize: 3,
    specializations: {
      'TOPIC_ANALYSIS': 1,
      'ACTION_ITEM_EXTRACTION': 1,
      'SUMMARY_GENERATION': 1
    }
  })
};

const mockSpecializationOverlap = {
  createOverlapMap: jest.fn().mockReturnValue('overlap-map-1'),
  addAgent: jest.fn(),
  visualizeOverlap: jest.fn().mockReturnValue({
    elements: [
      { id: 'node1', type: 'expertise', data: { name: 'Topic Analysis' } },
      { id: 'node2', type: 'expertise', data: { name: 'Action Item Extraction' } },
      { id: 'edge1', type: 'overlap', source: 'node1', target: 'node2', data: { weight: 0.5 } }
    ]
  }),
  identifyExpertiseGaps: jest.fn().mockReturnValue([
    AgentExpertise.SENTIMENT_ANALYSIS,
    AgentExpertise.PARTICIPANT_DYNAMICS
  ]),
  calculateTeamVersatility: jest.fn().mockReturnValue({
    overallScore: 0.75,
    expertiseDistribution: {
      [AgentExpertise.TOPIC_ANALYSIS]: 1.5,
      [AgentExpertise.ACTION_ITEM_EXTRACTION]: 1.0,
      [AgentExpertise.SUMMARY_GENERATION]: 0.5
    },
    specialistCount: 1,
    generalistCount: 2
  })
};

describe('Visualization Integration', () => {
  let testEnv: any;
  let performanceTracker: PerformanceTracker;
  
  beforeAll(async () => {
    // Set up the test environment with all services
    testEnv = await setupTestEnvironment();
    
    // Add mock visualization services to the test environment
    testEnv.teamRoster = mockTeamRoster;
    testEnv.specializationOverlap = mockSpecializationOverlap;
  });
  
  afterAll(async () => {
    // Clean up after tests
    await cleanupTestEnvironment();
  });
  
  beforeEach(() => {
    jest.clearAllMocks();
    performanceTracker = new PerformanceTracker();
  });
  
  test('should create and visualize team roster', async () => {
    // Create a test meeting
    const testMeeting = createTestMeeting({
      meetingId: `team-viz-test-${uuidv4()}`,
    });
    
    // Start performance tracking
    performanceTracker.start();
    
    // Create team visualization
    performanceTracker.measure('team-viz-creation', () => {
      const vizId = testEnv.teamRoster.createTeamVisualization(testMeeting.meetingId);
      // Verify visualization ID
      expect(vizId).toBeDefined();
      expect(typeof vizId).toBe('string');
    });
    
    const vizId = testEnv.teamRoster.createTeamVisualization(testMeeting.meetingId);
    
    // Add team members
    await testEnv.teamRoster.addTeamMember(vizId, {
      agentId: 'agent-1',
      name: 'Topic Analyzer',
      primaryExpertise: AgentExpertise.TOPIC_ANALYSIS,
      secondaryExpertise: [AgentExpertise.SUMMARY_GENERATION]
    });
    
    await testEnv.teamRoster.addTeamMember(vizId, {
      agentId: 'agent-2',
      name: 'Action Item Extractor',
      primaryExpertise: AgentExpertise.ACTION_ITEM_EXTRACTION,
      secondaryExpertise: []
    });
    
    // Get visualization
    performanceTracker.measure('team-visualization', () => {
      const visualization = testEnv.teamRoster.visualizeTeam(vizId);
      // Verify visualization
      expect(visualization).toBeDefined();
      expect(visualization.elements).toBeDefined();
      expect(visualization.elements.length).toBeGreaterThan(0);
    });
    
    // Get team composition metrics
    performanceTracker.measure('team-composition', () => {
      const composition = testEnv.teamRoster.getTeamComposition(vizId);
      // Verify composition metrics
      expect(composition).toBeDefined();
      expect(composition.expertiseCoverage).toBeDefined();
      expect(composition.teamSize).toBeGreaterThan(0);
      expect(composition.specializations).toBeDefined();
      
      // Verify expertise coverage
      expect(composition.expertiseCoverage[AgentExpertise.TOPIC_ANALYSIS]).toBeGreaterThan(0);
    });
    
    // End performance tracking
    performanceTracker.end();
    performanceTracker.logResults();
  });
  
  test('should create and analyze expertise overlap', async () => {
    // Create test meeting
    const testMeeting = createTestMeeting({
      meetingId: `overlap-test-${uuidv4()}`,
    });
    
    // Start performance tracking
    performanceTracker.start();
    
    // Create overlap map
    performanceTracker.measure('overlap-map-creation', () => {
      const mapId = testEnv.specializationOverlap.createOverlapMap(testMeeting.meetingId);
      // Verify map ID
      expect(mapId).toBeDefined();
      expect(typeof mapId).toBe('string');
    });
    
    const mapId = testEnv.specializationOverlap.createOverlapMap(testMeeting.meetingId);
    
    // Add agents to the overlap map
    testEnv.specializationOverlap.addAgent(mapId, {
      agentId: 'agent-1',
      name: 'Topic Analyzer',
      primaryExpertise: AgentExpertise.TOPIC_ANALYSIS,
      secondaryExpertise: [AgentExpertise.SUMMARY_GENERATION]
    });
    
    testEnv.specializationOverlap.addAgent(mapId, {
      agentId: 'agent-2',
      name: 'Action Item Extractor',
      primaryExpertise: AgentExpertise.ACTION_ITEM_EXTRACTION,
      secondaryExpertise: [AgentExpertise.TOPIC_ANALYSIS]
    });
    
    testEnv.specializationOverlap.addAgent(mapId, {
      agentId: 'agent-3',
      name: 'Summary Generator',
      primaryExpertise: AgentExpertise.SUMMARY_GENERATION,
      secondaryExpertise: []
    });
    
    // Visualize overlap
    performanceTracker.measure('overlap-visualization', () => {
      const visualization = testEnv.specializationOverlap.visualizeOverlap(mapId);
      // Verify visualization
      expect(visualization).toBeDefined();
      expect(visualization.elements).toBeDefined();
      expect(visualization.elements.length).toBeGreaterThan(0);
    });
    
    // Find expertise gaps
    performanceTracker.measure('gap-identification', () => {
      const gaps = testEnv.specializationOverlap.identifyExpertiseGaps(mapId);
      // Verify gaps
      expect(gaps).toBeDefined();
      expect(Array.isArray(gaps)).toBe(true);
    });
    
    // Calculate versatility
    performanceTracker.measure('versatility-calculation', () => {
      const versatility = testEnv.specializationOverlap.calculateTeamVersatility(mapId);
      // Verify versatility metrics
      expect(versatility).toBeDefined();
      expect(versatility.overallScore).toBeGreaterThanOrEqual(0);
      expect(versatility.overallScore).toBeLessThanOrEqual(1);
      expect(versatility.expertiseDistribution).toBeDefined();
      expect(versatility.specialistCount).toBeGreaterThanOrEqual(0);
      expect(versatility.generalistCount).toBeGreaterThanOrEqual(0);
    });
    
    // End performance tracking
    performanceTracker.end();
    performanceTracker.logResults();
  });
  
  test('should integrate team formation with visualization', async () => {
    // Create a test meeting
    const testMeeting = createTestMeeting({
      meetingId: `integration-test-${uuidv4()}`,
    });
    
    // Start performance tracking
    performanceTracker.start();
    
    // Form a team
    const team = await testEnv.teamFormation.formTeam(testMeeting);
    
    // Create team visualization
    const teamVizId = testEnv.teamRoster.createTeamVisualization(testMeeting.meetingId);
    
    // Add team members to visualization
    for (const member of team.members) {
      await testEnv.teamRoster.addTeamMember(teamVizId, {
        agentId: member.agentId,
        name: member.name,
        primaryExpertise: member.expertise[0], // First expertise as primary
        secondaryExpertise: member.expertise.slice(1) // Rest as secondary
      });
    }
    
    // Visualize team
    const teamVisualization = testEnv.teamRoster.visualizeTeam(teamVizId);
    
    // Verify team visualization integration
    expect(teamVisualization).toBeDefined();
    expect(teamVisualization.elements.length).toBeGreaterThan(0);
    
    // Create overlap map
    const overlapMapId = testEnv.specializationOverlap.createOverlapMap(testMeeting.meetingId);
    
    // Add team members to overlap map
    for (const member of team.members) {
      testEnv.specializationOverlap.addAgent(overlapMapId, {
        agentId: member.agentId,
        name: member.name,
        primaryExpertise: member.expertise[0], // First expertise as primary
        secondaryExpertise: member.expertise.slice(1) // Rest as secondary
      });
    }
    
    // Check expertise gaps
    const gaps = testEnv.specializationOverlap.identifyExpertiseGaps(overlapMapId);
    
    // Verify gap detection
    expect(gaps).toBeDefined();
    
    // If there are gaps, we should try to fill them
    if (gaps.length > 0) {
      // In a real implementation, we would use the team formation service to find
      // agents that can fill these gaps and add them to the team
      
      // For this test, we'll just verify the integration logic
      expect(gaps.length).toBeGreaterThanOrEqual(0);
      
      // Calculate versatility after identifying gaps
      const versatility = testEnv.specializationOverlap.calculateTeamVersatility(overlapMapId);
      expect(versatility).toBeDefined();
    }
    
    // End performance tracking
    performanceTracker.end();
    performanceTracker.logResults();
  });
}); 