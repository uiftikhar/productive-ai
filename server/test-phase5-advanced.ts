/**
 * Test file to demonstrate the Phase 5 Advanced Functionality
 * for the Agentic Meeting Analysis System
 */
import { AgenticMeetingAnalysis } from './src/langgraph/agentic-meeting-analysis';
import { AgentExpertise } from './src/langgraph/agentic-meeting-analysis/interfaces/agent.interface';
import {
  SemanticChunkingService,
  TeamFormationService,
} from './src/langgraph/agentic-meeting-analysis/team-formation';
import {
  AdaptationTriggerService,
  AdaptationManagerService,
  AdaptationTriggerType,
} from './src/langgraph/agentic-meeting-analysis/adaptation';
import { StateManager } from './src/langgraph/agentic-meeting-analysis/state/state.manager';
import { ConsoleLogger } from './src/shared/logger/console-logger';

// Sample meeting transcript
const SAMPLE_TRANSCRIPT = `
John: Good morning everyone, let's start our weekly product meeting.
Sarah: Thanks John. I've prepared the new feature roadmap we discussed last time.
Michael: I have some concerns about the timeline for the Q3 release.
Sarah: What specifically concerns you, Michael?
Michael: I think we're trying to fit too many features into the release. We should prioritize better.
John: I see your point. Let's review the features and see if we can adjust the timeline.
Sarah: I've listed the features in priority order on page 2 of my document.
Michael: Great, let's go through them one by one.
John: First feature is the dashboard redesign. Design team says it will take 3 weeks.
Sarah: That's right, and it's a high priority for our users based on the feedback we've collected.
Michael: I agree it's important, but we need to consider the technical debt implications.
John: What do you mean exactly?
Michael: The current dashboard has some underlying architecture issues. If we just redesign the UI without addressing those, we're going to face more problems later.
Sarah: That's a good point. Should we add a technical debt phase to the project?
John: Let's make a decision on this. I propose we allocate an additional 2 weeks to address the technical debt before working on the redesign.
Michael: I think that's a good compromise.
Sarah: Agreed. I'll update the roadmap.
John: Great. Let's mark that as an action item. Now, let's move on to the next feature...
`;

// Sample technical transcript segment
const TECHNICAL_SEGMENT = `
Alex: As we discussed in the architectural review, we need to refactor the database layer.
Brian: Yes, the current ORM implementation is causing performance bottlenecks.
Alex: I've been experimenting with a new query builder pattern that might help.
Cindy: Have you considered the impact on our microservices architecture?
Brian: Good point. We'll need to ensure backward compatibility with existing service interfaces.
Alex: Definitely. I've drafted some interface contracts that should maintain compatibility.
Cindy: Let's also make sure we implement proper error handling and transaction management.
Brian: Agreed. I'll prepare a detailed technical specification for the team to review.
`;

// Sample business-focused transcript segment
const BUSINESS_SEGMENT = `
Diana: Based on the market research, our competitors are gaining ground in the enterprise segment.
Edward: Yes, our sales team is reporting increased pricing pressure as well.
Diana: I think we need to revise our go-to-market strategy for the next quarter.
Fiona: What if we bundle some of our premium features into the base product?
Edward: That could impact our upsell opportunities though.
Diana: True, but we might gain market share and improve customer retention.
Fiona: The customer success team is reporting that retention is already strong.
Diana: Let's do a cost-benefit analysis before our next meeting.
Edward: Good idea. I'll work with the finance team to model different scenarios.
`;

// Sample unexpected topic segment
const UNEXPECTED_TOPIC_SEGMENT = `
John: Before we continue with the roadmap, I want to bring up something urgent.
Sarah: What is it?
John: We just learned that one of our main competitors was acquired by Big Tech Corp.
Michael: That's unexpected! How will this affect our market position?
Sarah: This could change everything about our competitive landscape.
John: Exactly. We might need to reconsider our product strategy entirely.
Michael: Do we have any details on the acquisition terms or integration plans?
John: Not yet, but our market intelligence team is gathering information.
Sarah: We should schedule a specific meeting to discuss this development.
John: Agreed. Let's set that up for tomorrow morning.
Michael: In the meantime, I suggest we continue with today's agenda but keep this in mind.
`;

/**
 * Demonstrate Phase 5 Advanced Functionality
 */
async function demonstratePhase5() {
  console.log('Starting Phase 5 Advanced Functionality Demonstration');
  console.log('===================================================');

  // Set up state manager and core services
  const logger = new ConsoleLogger();
  const stateManager = new StateManager({ logger });

  // Create semantic chunking service
  const semanticChunkingService = new SemanticChunkingService({ logger });

  // Create team formation service
  const teamFormationService = new TeamFormationService({
    logger,
    stateManager,
    semanticChunkingService,
  });

  // Initialize team formation service
  await teamFormationService.initialize();

  // Create adaptation trigger service
  const adaptationTriggerService = new AdaptationTriggerService({
    logger,
    stateManager,
    semanticChunkingService,
  });

  // Initialize adaptation trigger service
  await adaptationTriggerService.initialize();

  // Create adaptation manager service
  const adaptationManagerService = new AdaptationManagerService({
    logger,
    stateManager,
    triggerService: adaptationTriggerService,
    teamFormationService,
  });

  // Initialize adaptation manager service
  await adaptationManagerService.initialize();

  console.log('\n1. Team Formation Logic Demonstration');
  console.log('------------------------------------');

  // Set up a test meeting
  const meetingId = 'demo-meeting-1';

  // Step 1: Assess meeting characteristics
  console.log('\n1.1 Assessing meeting characteristics...');

  const complexity = await teamFormationService.assessMeetingCharacteristics(
    meetingId,
    SAMPLE_TRANSCRIPT,
  );

  console.log(`Meeting complexity assessed as: ${complexity.overall}`);
  console.log(`Technical score: ${complexity.technicalScore.toFixed(2)}`);
  console.log(`Interactive score: ${complexity.interactiveScore.toFixed(2)}`);
  console.log(`Decision score: ${complexity.decisionScore.toFixed(2)}`);
  console.log(
    `Topic diversity score: ${complexity.topicDiversityScore.toFixed(2)}`,
  );
  console.log(`Recommended team size: ${complexity.recommendedTeamSize}`);

  // Step 2: Form team for meeting
  console.log('\n1.2 Forming team based on meeting characteristics...');

  // Simulate available agents
  const availableAgents = [
    'agent-coordinator-1',
    'agent-summary-1',
    'agent-action-1',
    'agent-decision-1',
    'agent-topic-1',
    'agent-sentiment-1',
    'agent-participant-1',
    'agent-context-1',
  ];

  // Set up mock agent state
  await stateManager.setState('agent:agent-coordinator-1', {
    expertise: [AgentExpertise.COORDINATION],
  });
  await stateManager.setState('agent:agent-summary-1', {
    expertise: [AgentExpertise.SUMMARY_GENERATION],
  });
  await stateManager.setState('agent:agent-action-1', {
    expertise: [AgentExpertise.ACTION_ITEM_EXTRACTION],
  });
  await stateManager.setState('agent:agent-decision-1', {
    expertise: [AgentExpertise.DECISION_TRACKING],
  });
  await stateManager.setState('agent:agent-topic-1', {
    expertise: [AgentExpertise.TOPIC_ANALYSIS],
  });
  await stateManager.setState('agent:agent-sentiment-1', {
    expertise: [AgentExpertise.SENTIMENT_ANALYSIS],
  });
  await stateManager.setState('agent:agent-participant-1', {
    expertise: [AgentExpertise.PARTICIPANT_DYNAMICS],
  });
  await stateManager.setState('agent:agent-context-1', {
    expertise: [AgentExpertise.CONTEXT_INTEGRATION],
  });

  const teamComposition = await teamFormationService.formTeam(
    meetingId,
    SAMPLE_TRANSCRIPT,
    availableAgents,
  );

  console.log(`Team formed with ${teamComposition.members.length} members`);
  console.log('Team members:');

  for (const member of teamComposition.members) {
    console.log(`- ${member.id} (Primary role: ${member.primaryRole})`);
  }

  console.log('\nRequired expertise:');
  for (const [expertise, priority] of Object.entries(
    teamComposition.requiredExpertise,
  )) {
    console.log(`- ${expertise}: ${priority.toFixed(2)}`);
  }

  // Step 3: Optimize team for simple meeting
  console.log('\n1.3 Optimizing team for simple meeting...');

  if (complexity.overall === 'simple') {
    const optimizedTeam = await teamFormationService.optimizeForSimpleMeeting(
      meetingId,
      teamComposition.id,
    );

    console.log(
      `Team optimized from ${teamComposition.members.length} to ${optimizedTeam.members.length} members`,
    );
  } else {
    console.log(
      `No optimization performed (meeting complexity: ${complexity.overall})`,
    );
  }

  console.log('\n2. Adaptation Mechanisms Demonstration');
  console.log('-------------------------------------');

  // Set expected topics for the meeting
  await adaptationTriggerService.setExpectedTopics(meetingId, [
    'product roadmap',
    'feature prioritization',
    'release planning',
    'technical debt',
  ]);

  // Register event listeners
  adaptationTriggerService.on('adaptation_trigger', (trigger) => {
    console.log(`\nAdaptation trigger detected: ${trigger.type}`);
    console.log(`- Source: ${trigger.source}`);
    console.log(`- Confidence: ${trigger.confidence.toFixed(2)}`);
    console.log(`- Recommended action: ${trigger.recommendedAction}`);
  });

  adaptationManagerService.on('adaptation_completed', (data) => {
    console.log(`\nAdaptation action completed: ${data.type}`);
    console.log(`- Result: ${JSON.stringify(data.result)}`);
  });

  // Step 1: Content-based adaptation trigger - Technical methodology
  console.log('\n2.1 Testing content-based adaptation triggers (Technical)...');

  const technicalTriggers =
    await adaptationTriggerService.analyzeContentForTriggers(
      meetingId,
      TECHNICAL_SEGMENT,
      [SAMPLE_TRANSCRIPT],
    );

  console.log(
    `Detected ${technicalTriggers.length} triggers from technical content`,
  );

  // Step 2: Content-based adaptation trigger - Business methodology
  console.log('\n2.2 Testing content-based adaptation triggers (Business)...');

  const businessTriggers =
    await adaptationTriggerService.analyzeContentForTriggers(
      meetingId,
      BUSINESS_SEGMENT,
      [SAMPLE_TRANSCRIPT, TECHNICAL_SEGMENT],
    );

  console.log(
    `Detected ${businessTriggers.length} triggers from business content`,
  );

  // Step 3: Unexpected topic adaptation
  console.log('\n2.3 Testing unexpected topic adaptation...');

  const unexpectedTopicTriggers =
    await adaptationTriggerService.analyzeContentForTriggers(
      meetingId,
      UNEXPECTED_TOPIC_SEGMENT,
      [SAMPLE_TRANSCRIPT, TECHNICAL_SEGMENT, BUSINESS_SEGMENT],
    );

  console.log(
    `Detected ${unexpectedTopicTriggers.length} triggers from unexpected topic`,
  );

  // Step 4: Performance-based adaptation
  console.log('\n2.4 Testing performance-based adaptation triggers...');

  const performanceTriggers =
    await adaptationTriggerService.analyzePerformanceForTriggers(
      meetingId,
      {
        'agent-summary-1': 0.9,
        'agent-action-1': 0.85,
        'agent-decision-1': 0.4, // Simulating poor performance
        'agent-topic-1': 0.75,
      },
      {
        'agent-summary-1': true,
        'agent-action-1': true,
        'agent-decision-1': false, // Simulating task failure
        'agent-topic-1': true,
      },
    );

  console.log(
    `Detected ${performanceTriggers.length} triggers from performance analysis`,
  );

  // Get all adaptation actions
  const adaptationActions =
    await adaptationManagerService.getAdaptationActions(meetingId);

  console.log('\n2.5 Summary of adaptation actions:');

  for (const action of adaptationActions) {
    console.log(`- ${action.type} (Status: ${action.status})`);

    if (action.result) {
      console.log(`  Result: ${action.result.adaptationType}`);
    }
  }

  console.log('\nPhase 5 Advanced Functionality Demonstration Complete');
  console.log('===================================================');
}

// Run the demonstration
demonstratePhase5().catch((error) => {
  console.error('Error in Phase 5 demonstration:', error);
});
