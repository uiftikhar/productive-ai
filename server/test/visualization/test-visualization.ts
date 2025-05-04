/**
 * Test Visualization Components for Agentic Meeting Analysis
 * 
 * This test harness demonstrates the integration of specialized 
 * meeting analysis visualization services with core visualization services.
 */
import { Logger } from '../../src/shared/logger/logger.interface';
import { ConsoleLogger } from '../../src/shared/logger/console-logger';
import { AgentExpertise } from '../../src/langgraph/agentic-meeting-analysis/interfaces/agent.interface';

import {
  // Team visualization
  TeamRosterVisualizationImpl,
  RoleDistributionVisualizationImpl,
  TeamEvolutionVisualizationImpl,
  AgentActivityVisualizationImpl,
  SpecializationOverlapVisualizationImpl,
  
  // Process visualization
  AnalysisTimelineVisualizationImpl,
  InsightDiscoveryVisualizationImpl,
  
  // Collaborative dynamics visualization
  CommunicationNetworkVisualizationImpl,
  
  // Content visualization
  TopicRelationshipVisualizationImpl,
  DecisionPointVisualizationImpl,
  
  // Core visualization services
  DecisionCaptureImpl,
  RealTimeGraphRendererImpl
} from '../../src/langgraph/agentic-meeting-analysis/visualization';

/**
 * Logger for the test harness
 */
const logger: Logger = new ConsoleLogger();

/**
 * Run the test for visualization services
 */
async function testVisualization() {
  logger.info('Starting visualization test harness');
  
  // Step 1: Create an instance of each core visualization service
  logger.info('Step 1: Initializing core visualization services');
  const decisionCapture = new DecisionCaptureImpl({ logger });
  const graphRenderer = new RealTimeGraphRendererImpl({ logger });
  
  // Step 2: Create an instance of each specialized visualization service
  logger.info('Step 2: Initializing specialized visualization services');
  
  // Initialize team visualization services using core services
  const roleDistribution = new RoleDistributionVisualizationImpl({ 
    logger,
    graphRenderer 
  });
  const teamRoster = new TeamRosterVisualizationImpl({ 
    logger 
  });
  const teamEvolution = new TeamEvolutionVisualizationImpl({
    logger
  });
  const agentActivity = new AgentActivityVisualizationImpl({
    logger
  });
  const specializationOverlap = new SpecializationOverlapVisualizationImpl({
    logger
  });
  
  // Initialize process visualization services
  const analysisTimeline = new AnalysisTimelineVisualizationImpl({ 
    logger 
  });
  const insightDiscovery = new InsightDiscoveryVisualizationImpl({
    logger
  });
  
  // Initialize collaborative dynamics visualization services using core services
  const communicationNetwork = new CommunicationNetworkVisualizationImpl({ 
    logger,
    graphRenderer 
  });
  
  // Initialize content visualization services using core services
  const topicRelationship = new TopicRelationshipVisualizationImpl({ 
    logger 
  });
  const decisionPoint = new DecisionPointVisualizationImpl({ 
    logger,
    decisionCaptureService: decisionCapture 
  });
  
  // Step 3: Test team roster visualization
  logger.info('Step 3: Testing team roster visualization');
  const teamVisualizationId = teamRoster.createTeamVisualization('meeting-123', 'Engineering Team');
  
  // Add some team members
  teamRoster.addAgentToRoster(teamVisualizationId, {
    agentId: 'agent-1',
    primaryExpertise: AgentExpertise.ACTION_ITEM_EXTRACTION,
    secondaryExpertise: [AgentExpertise.SUMMARY_GENERATION],
    responsibility: 'Extract action items from meeting transcripts',
    contributionScore: 0.8
  });
  
  teamRoster.addAgentToRoster(teamVisualizationId, {
    agentId: 'agent-2',
    primaryExpertise: AgentExpertise.DECISION_TRACKING,
    secondaryExpertise: [AgentExpertise.COORDINATION],
    responsibility: 'Track decisions made during meetings',
    contributionScore: 0.75
  });
  
  teamRoster.addAgentToRoster(teamVisualizationId, {
    agentId: 'agent-3',
    primaryExpertise: AgentExpertise.TOPIC_ANALYSIS,
    secondaryExpertise: [AgentExpertise.SENTIMENT_ANALYSIS],
    responsibility: 'Analyze meeting topics and sentiment',
    contributionScore: 0.9
  });
  
  // Visualize the team
  const teamGraph = teamRoster.visualizeTeamRoster(teamVisualizationId);
  logger.info(`Team graph created with ${teamGraph.elements.length} elements`);
  
  // Step 4: Test role distribution visualization
  logger.info('Step 4: Testing role distribution visualization');
  const rosterData = teamRoster.getTeamComposition(teamVisualizationId);
  
  const roleDistributionGraph = roleDistribution.visualizeRoleDistribution(
    rosterData.expertiseCoverage,
    rosterData.specializations
  );
  
  logger.info(`Role distribution graph created with ${roleDistributionGraph.elements.length} elements`);
  
  // Step 5: Test team evolution visualization
  logger.info('Step 5: Testing team evolution visualization');
  // Track team changes
  teamEvolution.trackTeamChange('meeting-123', new Date(), {
    added: [{
      agentId: 'agent-1',
      primaryExpertise: AgentExpertise.ACTION_ITEM_EXTRACTION,
      secondaryExpertise: [AgentExpertise.SUMMARY_GENERATION],
      responsibility: 'Extract action items from meeting transcripts',
      contributionScore: 0.8
    }],
    removed: [],
    modified: []
  });
  
  // Add another agent an hour later
  const laterTimestamp = new Date();
  laterTimestamp.setHours(laterTimestamp.getHours() + 1);
  teamEvolution.trackTeamChange('meeting-123', laterTimestamp, {
    added: [{
      agentId: 'agent-2',
      primaryExpertise: AgentExpertise.DECISION_TRACKING,
      secondaryExpertise: [AgentExpertise.COORDINATION],
      responsibility: 'Track decisions made during meetings',
      contributionScore: 0.75
    }],
    removed: [],
    modified: []
  });
  
  // Visualize team evolution
  const evolutionGraph = teamEvolution.visualizeTeamEvolution('meeting-123');
  logger.info(`Team evolution graph created with ${evolutionGraph.elements.length} elements`);
  
  // Step 6: Test specialization overlap visualization
  logger.info('Step 6: Testing specialization overlap visualization');
  const overlapMap = specializationOverlap.createOverlapMap('Team Expertise Overlap');
  
  // Add agents to overlap map
  specializationOverlap.addAgent(overlapMap, {
    agentId: 'agent-1',
    name: 'Action Item Extractor',
    primaryExpertise: AgentExpertise.ACTION_ITEM_EXTRACTION,
    secondaryExpertise: [AgentExpertise.SUMMARY_GENERATION, AgentExpertise.DECISION_TRACKING]
  });
  
  specializationOverlap.addAgent(overlapMap, {
    agentId: 'agent-2',
    name: 'Decision Tracker',
    primaryExpertise: AgentExpertise.DECISION_TRACKING,
    secondaryExpertise: [AgentExpertise.COORDINATION]
  });
  
  specializationOverlap.addAgent(overlapMap, {
    agentId: 'agent-3',
    name: 'Topic Analyzer',
    primaryExpertise: AgentExpertise.TOPIC_ANALYSIS,
    secondaryExpertise: [AgentExpertise.SENTIMENT_ANALYSIS, AgentExpertise.SUMMARY_GENERATION]
  });
  
  // Visualize overlap
  const overlapGraph = specializationOverlap.visualizeOverlap(overlapMap);
  logger.info(`Specialization overlap graph created with ${overlapGraph.elements.length} elements`);
  
  // Find expertise gaps
  const gaps = specializationOverlap.identifyExpertiseGaps(overlapMap);
  logger.info(`Identified ${gaps.length} expertise gaps`);
  
  // Step 7: Test agent activity visualization
  logger.info('Step 7: Testing agent activity visualization');
  // Record some agent activities
  agentActivity.recordAgentActivity({
    timestamp: new Date(),
    agentId: 'agent-1',
    meetingId: 'meeting-123',
    activityType: 'extraction',
    description: 'Extracting action items from transcript segment',
    duration: 120, // seconds
    outcome: 'success',
    relatedEntityIds: ['transcript-1']
  });
  
  const laterActivityTimestamp = new Date();
  laterActivityTimestamp.setMinutes(laterActivityTimestamp.getMinutes() + 5);
  
  agentActivity.recordAgentActivity({
    timestamp: laterActivityTimestamp,
    agentId: 'agent-2',
    meetingId: 'meeting-123',
    activityType: 'decision',
    description: 'Tracking decision on product roadmap',
    duration: 90, // seconds
    outcome: 'completed',
    relatedEntityIds: ['decision-1']
  });
  
  // Visualize agent activities
  const activityGraph = agentActivity.visualizeActivityTimeline('meeting-123');
  logger.info(`Agent activity graph created with ${activityGraph.elements.length} elements`);
  
  // Step 8: Test analysis timeline visualization  
  logger.info('Step 8: Testing analysis timeline visualization');
  const timelineId = analysisTimeline.createTimelineVisualization('meeting-123');
  
  // Add a few events
  analysisTimeline.addEvent(timelineId, {
    eventId: 'event-1',
    name: 'Analysis Started',
    timestamp: new Date(),
    type: 'process',
    description: 'Meeting analysis process started',
    agentId: 'coordinator',
    relatedEntityIds: []
  });
  
  const laterEventTimestamp = new Date();
  laterEventTimestamp.setMinutes(laterEventTimestamp.getMinutes() + 10);
  
  analysisTimeline.addEvent(timelineId, {
    eventId: 'event-2',
    name: 'Topic Identified',
    timestamp: laterEventTimestamp,
    type: 'insight',
    description: 'Primary meeting topic identified: Roadmap Planning',
    agentId: 'agent-3',
    relatedEntityIds: ['topic-1']
  });
  
  // Visualize the timeline
  const timelineGraph = analysisTimeline.visualizeTimeline(timelineId);
  logger.info(`Timeline graph created with ${timelineGraph.elements.length} elements`);
  
  // Step 9: Test insight discovery visualization
  logger.info('Step 9: Testing insight discovery visualization');
  // Record insights
  insightDiscovery.recordInsight('meeting-123', {
    timestamp: new Date(),
    description: 'Team needs more coordination on release planning',
    sourceAgentId: 'agent-3',
    importance: 0.8,
    confidence: 0.75,
    type: 'pattern'
  });
  
  const laterInsightTimestamp = new Date();
  laterInsightTimestamp.setMinutes(laterInsightTimestamp.getMinutes() + 15);
  
  const insight2Id = insightDiscovery.recordInsight('meeting-123', {
    timestamp: laterInsightTimestamp,
    description: 'Customer feedback indicates need for improved UI',
    sourceAgentId: 'agent-1',
    importance: 0.9,
    confidence: 0.6,
    type: 'topic'
  });
  
  // Add a refinement
  insightDiscovery.refineInsight(insight2Id, {
    timestamp: new Date(),
    description: 'Specifically the dashboard needs simplification',
    confidence: 0.85,
    agentId: 'agent-2'
  });
  
  // Visualize insights
  const insightGraph = insightDiscovery.visualizeInsightDiscovery('meeting-123');
  logger.info(`Insight discovery graph created with ${insightGraph.elements.length} elements`);
  
  // Step 10: Test communication network visualization
  logger.info('Step 10: Testing communication network visualization');
  const networkId = communicationNetwork.createCommunicationNetwork('meeting-123');
  
  // Add participants
  communicationNetwork.addParticipantNode(networkId, {
    participantId: 'participant-1',
    name: 'Alice',
    role: 'Product Manager'
  });
  
  communicationNetwork.addParticipantNode(networkId, {
    participantId: 'participant-2',
    name: 'Bob',
    role: 'Engineer'
  });
  
  communicationNetwork.addParticipantNode(networkId, {
    participantId: 'participant-3',
    name: 'Charlie',
    role: 'Designer'
  });
  
  // Add connections
  communicationNetwork.addCommunicationLink(networkId, {
    sourceId: 'participant-1',
    targetId: 'participant-2',
    messageCount: 5,
    strength: 0.7,
    type: 'question-answer'
  });
  
  communicationNetwork.addCommunicationLink(networkId, {
    sourceId: 'participant-1',
    targetId: 'participant-3',
    messageCount: 3,
    strength: 0.5,
    type: 'information-sharing'
  });
  
  communicationNetwork.addCommunicationLink(networkId, {
    sourceId: 'participant-2',
    targetId: 'participant-3',
    messageCount: 2,
    strength: 0.3,
    type: 'collaboration'
  });
  
  // Visualize the network
  const networkGraph = communicationNetwork.visualizeNetwork(networkId);
  logger.info(`Communication network graph created with ${networkGraph.elements.length} elements`);
  
  // Step 11: Test topic relationship visualization
  logger.info('Step 11: Testing topic relationship visualization');
  const topicMapId = topicRelationship.createTopicGraph('meeting-123');
  
  // Add topics
  const rootTopicId = topicRelationship.addTopic(topicMapId, {
    name: 'Product Roadmap',
    description: 'Discussion about upcoming product features',
    relevanceScore: 0.9,
    timeSpent: 600, // 10 minutes
    participantIds: ['participant-1', 'participant-2', 'participant-3'],
    sentimentScore: 0.2,
    keywords: ['roadmap', 'features', 'timeline']
  });
  
  const subtopic1Id = topicRelationship.addTopic(topicMapId, {
    name: 'UI Improvements',
    description: 'Discussion about improving the user interface',
    relevanceScore: 0.8,
    timeSpent: 300, // 5 minutes
    participantIds: ['participant-1', 'participant-3'],
    sentimentScore: 0.5,
    keywords: ['UI', 'user experience', 'design'],
    parentTopicId: rootTopicId
  });
  
  const subtopic2Id = topicRelationship.addTopic(topicMapId, {
    name: 'Performance Optimization',
    description: 'Discussion about improving application performance',
    relevanceScore: 0.7,
    timeSpent: 240, // 4 minutes
    participantIds: ['participant-1', 'participant-2'],
    sentimentScore: -0.1,
    keywords: ['performance', 'optimization', 'speed'],
    parentTopicId: rootTopicId
  });
  
  // Add relationships
  topicRelationship.addTopicRelationship(topicMapId, {
    sourceTopicId: subtopic1Id,
    targetTopicId: subtopic2Id,
    relationshipType: 'related',
    strength: 0.6,
    description: 'UI improvements may affect performance'
  });
  
  // Visualize the topic map
  const topicGraph = topicRelationship.visualizeTopicGraph(topicMapId);
  logger.info(`Topic relationship graph created with ${topicGraph.elements.length} elements`);
  
  // Step 12: Test decision point visualization
  logger.info('Step 12: Testing decision point visualization');
  const decisionGraphId = decisionPoint.createDecisionGraph('meeting-123');
  
  // Add decisions
  const decision1Id = decisionPoint.addDecision(decisionGraphId, {
    title: 'Prioritize UI improvements',
    description: 'Team decided to prioritize UI improvements over performance optimizations for Q2',
    timestamp: new Date(),
    confidence: 0.9,
    participantIds: ['participant-1', 'participant-3'],
    supportingEvidence: [
      'User feedback shows UI is the primary pain point',
      'UI improvements will have more customer impact'
    ],
    impact: 0.8,
    topicIds: [rootTopicId, subtopic1Id]
  });
  
  const laterDecisionTimestamp = new Date();
  laterDecisionTimestamp.setMinutes(laterDecisionTimestamp.getMinutes() + 20);
  
  const decision2Id = decisionPoint.addDecision(decisionGraphId, {
    title: 'Hire additional designer',
    description: 'Team decided to request an additional designer to support UI improvements',
    timestamp: laterDecisionTimestamp,
    confidence: 0.7,
    participantIds: ['participant-1', 'participant-3'],
    supportingEvidence: [
      'Current design team is overloaded',
      'UI improvements require dedicated resources'
    ],
    impact: 0.6,
    relatedDecisionIds: [decision1Id],
    topicIds: [subtopic1Id]
  });
  
  // Visualize decisions
  const decisionGraph = decisionPoint.visualizeDecisions(decisionGraphId);
  logger.info(`Decision point graph created with ${decisionGraph.elements.length} elements`);
  
  logger.info('Visualization test harness completed successfully');
}

// Run the test
testVisualization()
  .then(() => {
    logger.info('Test completed successfully');
  })
  .catch((error) => {
    logger.error('Test failed', error);
  }); 