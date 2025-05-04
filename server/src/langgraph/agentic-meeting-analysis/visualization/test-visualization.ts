/**
 * Test Script for Agentic Meeting Analysis Visualization Components
 * 
 * This script tests the various visualization components implemented
 * for the agentic meeting analysis system.
 */

import { ConfidenceEvolutionVisualizationImpl } from './process/confidence-evolution.service';
import { ExplorationPathVisualizationImpl } from './process/exploration-path.service';
import { KnowledgeFlowVisualizationImpl } from './collaborative/knowledge-flow.service';
import { SpeakerParticipationVisualizationImpl } from './content/speaker-participation.service';
import { DecisionPointVisualizationImpl } from './content/decision-point.service';
import { CollaborationPatternVisualizationImpl } from './collaborative/collaboration-pattern.service';
import { ConflictResolutionVisualizationImpl } from './collaborative/conflict-resolution.service';
import { ConsensusBuildingVisualizationImpl } from './collaborative/consensus-building.service';
import { SentimentLandscapeVisualizationImpl } from './content/sentiment-landscape.service';
import { ActionNetworkVisualizationImpl } from './content/action-network.service';
import { ConsoleLogger } from '../../../shared/logger/console-logger';

// Create logger for all tests
const logger = new ConsoleLogger();
logger.setLogLevel('debug');

function testConfidenceEvolutionVisualization() {
  logger.info('Testing ConfidenceEvolutionVisualization...');
  
  const visualization = new ConfidenceEvolutionVisualizationImpl({
    logger
  });
  
  // Test scenario: Meeting with multiple confidence updates
  const meetingId = 'test-meeting-1';
  
  // Record confidence evolutions
  visualization.recordConfidenceUpdate(meetingId, {
    agentId: 'agent-1',
    timestamp: new Date(2023, 5, 1, 10, 0),
    confidence: 0.5,
    entityId: 'quarterly-results',
    entityType: 'topic',
    reason: 'Initial assessment'
  });
  
  visualization.recordConfidenceUpdate(meetingId, {
    agentId: 'agent-1',
    timestamp: new Date(2023, 5, 1, 10, 15),
    confidence: 0.7,
    entityId: 'quarterly-results',
    entityType: 'topic',
    reason: 'After financial data review'
  });
  
  visualization.recordConfidenceUpdate(meetingId, {
    agentId: 'agent-2',
    timestamp: new Date(2023, 5, 1, 10, 5),
    confidence: 0.3,
    entityId: 'quarterly-results',
    entityType: 'topic',
    reason: 'Limited information'
  });
  
  visualization.recordConfidenceUpdate(meetingId, {
    agentId: 'agent-2',
    timestamp: new Date(2023, 5, 1, 10, 20),
    confidence: 0.6,
    entityId: 'quarterly-results',
    entityType: 'topic',
    reason: 'After discussion'
  });
  
  // Generate visualization
  const graph = visualization.visualizeConfidenceEvolution(meetingId);
  logger.debug('Confidence evolution graph', { graph });
  
  // Analyze trends
  const trends = visualization.getConfidenceTrend('quarterly-results');
  logger.debug('Confidence trends', { trends });
  
  // Analyze convergence
  const convergence = visualization.analyzeConfidenceConvergence(meetingId);
  logger.debug('Confidence convergence', { convergence });
  
  logger.info('ConfidenceEvolutionVisualization test completed');
}

function testExplorationPathVisualization() {
  logger.info('Testing ExplorationPathVisualization...');
  
  const visualization = new ExplorationPathVisualizationImpl({
    logger
  });
  
  // Test scenario: Meeting with exploration steps
  const meetingId = 'test-meeting-1';
  
  // Record exploration steps
  visualization.recordExplorationStep(meetingId, {
    agentId: 'agent-1',
    timestamp: new Date(2023, 5, 1, 10, 0),
    entityId: 'document-1',
    entityType: 'document',
    explorationAction: 'review',
    result: 'Found key performance metrics',
    nextStepOptions: ['Review document-2', 'Analyze trends']
  });
  
  visualization.recordExplorationStep(meetingId, {
    agentId: 'agent-1',
    timestamp: new Date(2023, 5, 1, 10, 10),
    entityId: 'document-2',
    entityType: 'document',
    explorationAction: 'review',
    result: 'Identified market trends',
    nextStepOptions: ['Analyze impact', 'Review competitor data']
  });
  
  visualization.recordExplorationStep(meetingId, {
    agentId: 'agent-2',
    timestamp: new Date(2023, 5, 1, 10, 5),
    entityId: 'topic-1',
    entityType: 'topic',
    explorationAction: 'analyze',
    result: 'Connected revenue decline to market shift',
    nextStepOptions: ['Propose strategy', 'Further analysis']
  });
  
  // Generate visualization
  const graph = visualization.visualizeExplorationPaths(meetingId);
  logger.debug('Exploration path graph', { graph });
  
  // Just use the same visualization data for patterns analysis
  const patterns = visualization.visualizeExplorationPaths(meetingId);
  logger.debug('Exploration patterns', { patterns });
  
  logger.info('ExplorationPathVisualization test completed');
}

function testKnowledgeFlowVisualization() {
  logger.info('Testing KnowledgeFlowVisualization...');
  
  const visualization = new KnowledgeFlowVisualizationImpl({
    logger
  });
  
  // Test scenario: Meeting with knowledge transfers
  const meetingId = 'test-meeting-1';
  
  // Record knowledge transfers
  visualization.recordKnowledgeTransfer(meetingId, {
    timestamp: new Date(2023, 5, 1, 10, 5),
    sourceAgentId: 'agent-1',
    targetAgentId: 'agent-2',
    knowledgeType: 'factual_knowledge',
    content: 'Q1 revenue was $2.3M, down 5% YoY',
    utilityScore: 0.8
  });
  
  visualization.recordKnowledgeTransfer(meetingId, {
    timestamp: new Date(2023, 5, 1, 10, 15),
    sourceAgentId: 'agent-2',
    targetAgentId: 'agent-3',
    knowledgeType: 'analytical_insight',
    content: 'Revenue decline due to delayed product launch',
    utilityScore: 0.7
  });
  
  visualization.recordKnowledgeTransfer(meetingId, {
    timestamp: new Date(2023, 5, 1, 10, 20),
    sourceAgentId: 'agent-3',
    targetAgentId: 'agent-1',
    knowledgeType: 'strategic_knowledge',
    content: 'Should prioritize product delivery over new features',
    utilityScore: 0.9
  });
  
  // Generate visualization
  const graph = visualization.visualizeKnowledgeFlow(meetingId);
  logger.debug('Knowledge flow graph', { graph });
  
  // Identify knowledge hubs
  const hubs = visualization.identifyKnowledgeHubs(meetingId);
  logger.debug('Knowledge hubs', { hubs });
  
  // Analyze knowledge distribution
  const distribution = visualization.analyzeKnowledgeDistribution(meetingId);
  logger.debug('Knowledge distribution', { distribution });
  
  logger.info('KnowledgeFlowVisualization test completed');
}

function testSpeakerParticipationVisualization() {
  logger.info('Testing SpeakerParticipationVisualization...');
  
  const visualization = new SpeakerParticipationVisualizationImpl({
    logger
  });
  
  // Test scenario: Meeting with speaker participation
  const meetingId = 'test-meeting-1';
  
  // Record participation
  visualization.recordParticipation(meetingId, {
    participantId: 'speaker-1',
    timestamp: new Date(2023, 5, 1, 10, 0),
    durationSeconds: 120, // seconds
    topicId: 'topic-1',
    durationType: 'speaking',
    interactsWithIds: []
  });
  
  visualization.recordParticipation(meetingId, {
    participantId: 'speaker-2',
    timestamp: new Date(2023, 5, 1, 10, 3),
    durationSeconds: 60, // seconds
    topicId: 'topic-1',
    durationType: 'question',
    interactsWithIds: ['speaker-1']
  });
  
  visualization.recordParticipation(meetingId, {
    participantId: 'speaker-1',
    timestamp: new Date(2023, 5, 1, 10, 5),
    durationSeconds: 90, // seconds
    topicId: 'topic-2',
    durationType: 'speaking',
    interactsWithIds: ['speaker-2']
  });
  
  visualization.recordParticipation(meetingId, {
    participantId: 'speaker-3',
    timestamp: new Date(2023, 5, 1, 10, 7),
    durationSeconds: 180, // seconds
    topicId: 'topic-2',
    durationType: 'speaking',
    interactsWithIds: ['speaker-1', 'speaker-2']
  });
  
  // Generate visualization
  const graph = visualization.visualizeSpeakerParticipation(meetingId);
  logger.debug('Speaker participation graph', { graph });
  
  // Get participation dynamics
  const dynamics = visualization.getParticipantDynamics(meetingId, 'topic-1');
  logger.debug('Participant dynamics', { dynamics });
  
  // Compare engagement
  const engagement = visualization.compareParticipantEngagement(meetingId);
  logger.debug('Participant engagement', { engagement });
  
  // Analyze equality
  const equality = visualization.analyzeParticipationEquality(meetingId);
  logger.debug('Participation equality', { equality });
  
  logger.info('SpeakerParticipationVisualization test completed');
}

function testDecisionPointVisualization() {
  logger.info('Testing DecisionPointVisualization...');
  
  const visualization = new DecisionPointVisualizationImpl({
    logger
  });
  
  // Test scenario: Meeting with decision points
  const meetingId = 'test-meeting-1';
  
  // Record decision points
  visualization.recordDecision({
    timestamp: new Date(2023, 5, 1, 10, 15),
    description: 'Delay feature launch to prioritize stability',
    decisionMakers: ['agent-1', 'agent-2', 'agent-3'],
    alternatives: [
      {
        description: 'Launch all features',
        pros: ['Market competitiveness'],
        cons: ['Stability risks'],
        selected: false
      },
      {
        description: 'Delay feature launch to prioritize stability',
        pros: ['Improved reliability', 'Customer satisfaction'],
        cons: ['Delayed market entry'],
        selected: true
      }
    ],
    rationale: 'Reliability data and customer feedback indicate need for stability',
    topicId: 'product-strategy',
    confidence: 0.8
  });
  
  visualization.recordDecision({
    timestamp: new Date(2023, 5, 1, 10, 30),
    description: 'Increase Q2 advertising budget by 15%',
    decisionMakers: ['agent-2', 'agent-4'],
    alternatives: [
      {
        description: 'Maintain current budget',
        pros: ['Conservative spending'],
        cons: ['Missing market opportunity'],
        selected: false
      },
      {
        description: 'Increase budget by 15%',
        pros: ['Capitalize on competitor weakness', 'Support new launch'],
        cons: ['Financial risk'],
        selected: true
      }
    ],
    rationale: 'Q1 campaign performance shows good ROI potential',
    topicId: 'marketing-budget',
    confidence: 0.7
  });
  
  // Generate visualization
  const graph = visualization.visualizeDecisions(meetingId);
  logger.debug('Decision points graph', { graph });
  
  // Get decision quality analysis
  const quality = visualization.analyzeDecisionQuality(meetingId);
  logger.debug('Decision influence', { quality });
  
  logger.info('DecisionPointVisualization test completed');
}

function testCollaborationPatternVisualization() {
  logger.info('Testing CollaborationPatternVisualization...');
  
  const visualization = new CollaborationPatternVisualizationImpl({
    logger
  });
  
  // Test scenario: Meeting with collaboration interactions
  const meetingId = 'test-meeting-1';
  
  // Record collaboration interactions
  visualization.recordCollaborationInteraction(meetingId, {
    timestamp: new Date(2023, 5, 1, 10, 5),
    sourceAgentId: 'agent-1',
    targetAgentId: 'agent-2',
    interactionType: 'question',
    context: 'Discussing Q1 financial results',
    strength: 0.6
  });
  
  visualization.recordCollaborationInteraction(meetingId, {
    timestamp: new Date(2023, 5, 1, 10, 8),
    sourceAgentId: 'agent-2',
    targetAgentId: 'agent-1',
    interactionType: 'response',
    context: 'Answering about financial metrics',
    strength: 0.7
  });
  
  visualization.recordCollaborationInteraction(meetingId, {
    timestamp: new Date(2023, 5, 1, 10, 12),
    sourceAgentId: 'agent-3',
    targetAgentId: 'agent-2',
    interactionType: 'support',
    context: 'Supporting analysis of market trends',
    strength: 0.8
  });
  
  visualization.recordCollaborationInteraction(meetingId, {
    timestamp: new Date(2023, 5, 1, 10, 15),
    sourceAgentId: 'agent-1',
    targetAgentId: 'agent-3',
    interactionType: 'challenge',
    context: 'Questioning assumptions about market growth',
    strength: 0.5
  });
  
  // Generate visualization
  const graph = visualization.visualizeCollaborationPatterns(meetingId);
  logger.debug('Collaboration patterns graph', { graph });
  
  // Get significant patterns
  const patterns = visualization.getSignificantPatterns(meetingId);
  logger.debug('Significant patterns', { patterns });
  
  // Analyze collaboration styles
  const styles = visualization.analyzeCollaborationStyles(meetingId);
  logger.debug('Collaboration styles', { styles });
  
  logger.info('CollaborationPatternVisualization test completed');
}

function testConflictResolutionVisualization() {
  logger.info('Testing ConflictResolutionVisualization...');
  
  const visualization = new ConflictResolutionVisualizationImpl({
    logger
  });
  
  // Test scenario: Meeting with conflicts and resolutions
  const meetingId = 'test-meeting-1';
  
  // Record conflicts
  const conflict1Id = visualization.recordConflict(meetingId, {
    timestamp: new Date(2023, 5, 1, 10, 10),
    conflictType: 'product roadmap priorities',
    description: 'Disagreement on whether to prioritize new features or stability',
    involvedAgentIds: ['agent-1', 'agent-2', 'agent-3'],
    resolutionStatus: 'in_progress'
  });
  
  const conflict2Id = visualization.recordConflict(meetingId, {
    timestamp: new Date(2023, 5, 1, 10, 25),
    conflictType: 'marketing budget allocation',
    description: 'Disagreement on how to allocate Q2 marketing budget',
    involvedAgentIds: ['agent-2', 'agent-4'],
    resolutionStatus: 'detected'
  });
  
  // Record disagreements
  visualization.recordDisagreement(conflict1Id, {
    timestamp: new Date(2023, 5, 1, 10, 12),
    sourceAgentId: 'agent-1',
    targetAgentId: 'agent-2',
    topic: 'product roadmap priorities',
    statement: 'We need to focus on new features to stay competitive',
    intensity: 0.6
  });
  
  visualization.recordDisagreement(conflict1Id, {
    timestamp: new Date(2023, 5, 1, 10, 14),
    sourceAgentId: 'agent-2',
    targetAgentId: 'agent-1',
    topic: 'product roadmap priorities',
    statement: 'Stability is more important for customer retention',
    intensity: 0.7
  });
  
  // Record conflict resolution
  visualization.updateConflictResolution(conflict1Id, {
    timestamp: new Date(2023, 5, 1, 10, 20),
    resolutionType: 'compromise',
    outcome: 'Agreed to focus on stability for Q2 and new features for Q3',
    resolutionAgentId: 'agent-3',
    acceptedByAgentIds: ['agent-1', 'agent-2', 'agent-3']
  });
  
  // Generate visualization
  const graph = visualization.visualizeConflictResolution(meetingId);
  logger.debug('Conflict resolution graph', { graph });
  
  // Analyze conflict patterns
  const patterns = visualization.analyzeConflictPatterns(meetingId);
  logger.debug('Resolution effectiveness', { patterns });
  
  logger.info('ConflictResolutionVisualization test completed');
}

function testConsensusBuildingVisualization() {
  logger.info('Testing ConsensusBuildingVisualization...');
  
  const visualization = new ConsensusBuildingVisualizationImpl({
    logger
  });
  
  // Test scenario: Meeting with consensus building
  const meetingId = 'test-meeting-1';
  
  // Initialize consensus tracking
  const consensusId = visualization.initializeConsensusTracking(meetingId, {
    topic: 'product launch date',
    description: 'Determining optimal date for next product launch',
    initialPositions: {
      'agent-1': 'Launch in June',
      'agent-2': 'Launch in August',
      'agent-3': 'Launch in July',
      'agent-4': 'Launch in August'
    }
  });
  
  // Update agent positions
  visualization.updateConsensusStep(consensusId, {
    timestamp: new Date(),
    agentId: 'agent-1',
    newPosition: 'Launch in July',
    contributionType: 'After reviewing development timeline',
    influenceLevel: 0.7
  });
  
  visualization.updateConsensusStep(consensusId, {
    timestamp: new Date(),
    agentId: 'agent-3',
    newPosition: 'Launch in late July',
    contributionType: 'Compromise position after discussion',
    influenceLevel: 0.8
  });
  
  visualization.updateConsensusStep(consensusId, {
    timestamp: new Date(),
    agentId: 'agent-2',
    newPosition: 'Launch in late July',
    contributionType: 'Marketing campaign considerations',
    influenceLevel: 0.6
  });
  
  visualization.updateConsensusStep(consensusId, {
    timestamp: new Date(),
    agentId: 'agent-4',
    newPosition: 'Launch in late July',
    contributionType: 'Aligning with team consensus',
    influenceLevel: 0.9
  });
  
  // Mark consensus as reached
  visualization.completeConsensusProcess(consensusId, {
    timestamp: new Date(),
    finalPosition: 'Product will launch on July 28th',
    agreementLevel: 0.95
  });
  
  // Generate visualization
  const graph = visualization.visualizeConsensusBuilding(meetingId);
  logger.debug('Consensus building graph', { graph });
  
  // Analyze consensus effectiveness
  const effectiveness = visualization.analyzeConsensusEfficiency(meetingId);
  logger.debug('Consensus effectiveness', { effectiveness });
  
  // Track position changes for an agent
  const positionChanges = visualization.trackAgentPositionChanges(meetingId, 'agent-1');
  logger.debug('Agent position changes', { positionChanges });
  
  logger.info('ConsensusBuildingVisualization test completed');
}

function testSentimentLandscapeVisualization() {
  logger.info('Testing SentimentLandscapeVisualization...');
  
  const visualization = new SentimentLandscapeVisualizationImpl({
    logger
  });
  
  // Test scenario: Meeting with sentiment data
  const meetingId = 'test-meeting-1';
  
  // Record sentiment data
  visualization.recordSentiment(meetingId, {
    timestamp: new Date(2023, 5, 1, 10, 0),
    speakerId: 'speaker-1',
    content: 'I think our Q1 results were better than expected',
    topicId: 'topic-1',
    sentiment: 0.7,
    intensity: 0.6,
    emotions: ['optimistic', 'satisfied']
  });
  
  visualization.recordSentiment(meetingId, {
    timestamp: new Date(2023, 5, 1, 10, 5),
    speakerId: 'speaker-2',
    content: 'I disagree, we missed several key targets',
    topicId: 'topic-1',
    sentiment: -0.5,
    intensity: 0.8,
    emotions: ['concerned', 'disappointed']
  });
  
  visualization.recordSentiment(meetingId, {
    timestamp: new Date(2023, 5, 1, 10, 10),
    speakerId: 'speaker-1',
    content: 'That\'s a fair point, but we overcame significant challenges',
    topicId: 'topic-1',
    sentiment: 0.3,
    intensity: 0.4,
    emotions: ['reflective', 'cautious']
  });
  
  visualization.recordSentiment(meetingId, {
    timestamp: new Date(2023, 5, 1, 10, 15),
    speakerId: 'speaker-3',
    content: "I'm excited about our new product direction",
    topicId: 'topic-2',
    sentiment: 0.9,
    intensity: 0.9,
    emotions: ['excited', 'enthusiastic']
  });
  
  // Generate visualization
  const graph = visualization.visualizeSentimentLandscape(meetingId);
  logger.debug('Sentiment landscape graph', { graph });
  
  // Track sentiment by topic
  const topicSentiment = visualization.trackSentimentByTopic(meetingId);
  logger.debug('Topic sentiment', { topicSentiment });
  
  // Analyze sentiment by speaker
  const speakerSentiment = visualization.analyzeSentimentBySpeaker(meetingId);
  logger.debug('Speaker sentiment', { speakerSentiment });
  
  // Detect sentiment turning points
  const turningPoints = visualization.detectSentimentTurningPoints(meetingId);
  logger.debug('Sentiment turning points', { turningPoints });
  
  logger.info('SentimentLandscapeVisualization test completed');
}

function testActionNetworkVisualization() {
  logger.info('Testing ActionNetworkVisualization...');
  
  const visualization = new ActionNetworkVisualizationImpl({
    logger
  });
  
  // Test scenario: Meeting with action items
  const meetingId = 'test-meeting-1';
  
  // Record action items
  const action1Id = visualization.recordAction({
    description: 'Revise Q2 forecast',
    deadline: new Date(2023, 5, 15),
    priority: 'high',
    assignees: ['agent-1', 'agent-2'],
    status: 'pending',
    topicId: 'topic-1'
  });
  
  const action2Id = visualization.recordAction({
    description: 'Prepare marketing materials',
    deadline: new Date(2023, 6, 1),
    priority: 'medium',
    assignees: ['agent-3'],
    status: 'pending',
    topicId: 'topic-2',
    dependsOn: [action1Id]
  });
  
  const action3Id = visualization.recordAction({
    description: 'Schedule customer feedback sessions',
    deadline: new Date(2023, 5, 20),
    priority: 'high',
    assignees: ['agent-2'],
    status: 'pending',
    topicId: 'topic-3',
    dependsOn: [action1Id]
  });
  
  // Update action status
  visualization.updateActionStatus(action1Id, 'in_progress');
  
  // Generate visualization
  const graph = visualization.visualizeActionNetwork(meetingId);
  logger.debug('Action network graph', { graph });
  
  // Get participant action summary
  const summary = visualization.getParticipantActionSummary(meetingId, 'agent-2');
  logger.debug('Participant action summary', { summary });
  
  // Analyze action dependencies
  const dependencies = visualization.analyzeActionDependencies(meetingId);
  logger.debug('Action dependencies', { dependencies });
  
  logger.info('ActionNetworkVisualization test completed');
}

// Run all tests
(async function runTests() {
  logger.info('Starting visualization component tests...');
  
  try {
    // Test each component
    testConfidenceEvolutionVisualization();
    testExplorationPathVisualization();
    testKnowledgeFlowVisualization();
    testSpeakerParticipationVisualization();
    testDecisionPointVisualization();
    testCollaborationPatternVisualization();
    testConflictResolutionVisualization();
    testConsensusBuildingVisualization();
    testSentimentLandscapeVisualization();
    testActionNetworkVisualization();
    
    logger.info('All visualization component tests completed successfully!');
  } catch (error) {
    logger.error('Error during visualization component tests', { error });
  }
})(); 