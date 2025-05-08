/**
 * Example implementation of the hierarchical meeting analysis system
 * 
 * This example demonstrates how to create and use the hierarchical agent system
 * with a true supervisor → manager → worker structure.
 */
import { createHierarchicalAgentTeam } from '../factories/hierarchical-team-factory';
import { createHierarchicalMeetingAnalysisGraph } from '../graph/hierarchical-meeting-analysis-graph';
import { AgentExpertise, AnalysisGoalType, MessageType, AgentMessage } from '../interfaces/agent.interface';
import { ConsoleLogger } from '../../../shared/logger/console-logger';
import { v4 as uuidv4 } from 'uuid';

/**
 * A sample meeting transcript
 */
const SAMPLE_TRANSCRIPT = `
Sarah (CEO): Good morning everyone. Today we need to discuss the Q3 product roadmap and make some decisions about resource allocation.

Michael (Product): I've analyzed user feedback from the last release. Users are asking for better mobile support and more intuitive UI.

Jane (Engineering): My team can work on the mobile improvements, but we'll need to delay the API upgrade if we prioritize that.

Sarah (CEO): What's the timeline impact if we delay the API work?

Jane (Engineering): About 2 months, but mobile improvements could be delivered in 6 weeks.

Michael (Product): Mobile should be our focus - metrics show 60% of users now access via mobile.

Tom (Marketing): I agree with Michael. Our competitors are all mobile-first now, and we're falling behind.

Sarah (CEO): Alright, let's prioritize mobile for Q3. Jane, please prepare a detailed plan by next week.

Jane (Engineering): Will do. I'll need some input from the UX team though.

Sarah (CEO): Good point. Tom, can you make sure the UX team is available to work with Jane?

Tom (Marketing): Yes, I'll coordinate with them. Also, we should prepare an announcement about this mobile focus for our customers.

Sarah (CEO): Great idea. Draft something and we'll review it next week. Anything else we need to cover?

Michael (Product): Just a reminder that we need to decide on the pricing model changes before the end of the month.

Sarah (CEO): Let's schedule a separate meeting for that - it deserves its own discussion. I'll send out an invite.

Tom (Marketing): Sounds good.

Sarah (CEO): Alright, thanks everyone. Action items: Jane to prepare mobile implementation plan, Tom to coordinate with UX and draft customer announcement, and I'll schedule the pricing discussion.
`;

/**
 * Create agent message from content
 */
function createAgentMessage(
  content: string,
  senderId: string,
  recipientIds: string[]
): AgentMessage {
  return {
    id: `msg-${uuidv4()}`,
    type: MessageType.REQUEST,
    sender: senderId,
    recipients: recipientIds,
    content,
    timestamp: Date.now()
  };
}

/**
 * Run the example
 */
async function runHierarchicalAnalysisExample() {
  const logger = new ConsoleLogger();
  logger.info('Starting hierarchical meeting analysis example');
  
  // 1. Create the agent team using the factory
  logger.info('Creating hierarchical agent team');
  const team = createHierarchicalAgentTeam({
    debugMode: true,
    analysisGoal: AnalysisGoalType.FULL_ANALYSIS,
    enabledExpertise: [
      AgentExpertise.TOPIC_ANALYSIS,
      AgentExpertise.ACTION_ITEM_EXTRACTION,
      AgentExpertise.SUMMARY_GENERATION
    ]
  });
  
  // 2. Create the hierarchical graph using the team
  logger.info('Creating hierarchical meeting analysis graph');
  const graph = createHierarchicalMeetingAnalysisGraph({
    supervisorAgent: team.supervisor,
    managerAgents: team.managers,
    workerAgents: team.workers,
    analysisGoal: AnalysisGoalType.FULL_ANALYSIS
  });
  
  // Set up progress tracking
  graph.on('progressUpdate', (progress) => {
    logger.info(`Progress: ${progress.completedNodes}/${progress.totalNodes} nodes (${progress.currentNode})`);
  });
  
  graph.on('nodeStart', (data) => {
    logger.info(`Started processing node: ${data.id}`);
  });
  
  graph.on('nodeComplete', (data) => {
    logger.info(`Completed processing node: ${data.id}`);
  });
  
  // 3. Prepare initial messages
  const initialMessage = createAgentMessage(
    'Please analyze this meeting transcript for key topics, action items, and provide a summary.',
    'user-1',
    [team.supervisor.id]
  );
  
  // 4. Execute the graph with initial state
  logger.info('Executing the hierarchical analysis graph');
  const result = await graph.invoke({
    id: `hierarchical-analysis-${uuidv4()}`,
    runId: uuidv4(),
    messages: [initialMessage],
    transcript: SAMPLE_TRANSCRIPT,
    visitedNodes: [],
    completedNodes: [],
    traversedEdges: [],
    nodes: new Map(),
    edges: new Map(),
    modificationHistory: [],
    metadata: {},
    executionPath: [],
    analysisGoal: AnalysisGoalType.FULL_ANALYSIS,
    teamStructure: {
      supervisor: team.supervisor.id,
      managers: {}
    },
    currentNode: 'supervisor',
    nextStep: 'supervisor',
    results: {}
  });
  
  // 5. Log the results
  logger.info('Analysis complete!');
  logger.info('Final results:', result.results);
  
  // Display the hierarchical structure that processed the data
  logger.info('\n--- Hierarchical Team Structure ---');
  logger.info(`Supervisor: ${team.supervisor.name} (${team.supervisor.id})`);
  
  logger.info('\nManagers:');
  for (const manager of team.managers) {
    logger.info(`- ${manager.name} (${manager.id}): ${manager.managedExpertise.join(', ')}`);
  }
  
  logger.info('\nWorkers:');
  for (const worker of team.workers) {
    // Find manager for this worker using team structure
    const expertise = worker.expertise[0]; // Get primary expertise
    const teamInfo = team.teamMap.get(expertise);
    const managerName = teamInfo ? teamInfo.manager.name : 'No manager';
    
    logger.info(`- ${worker.name} (${worker.id}): ${worker.expertise.join(', ')} → Reports to: ${managerName}`);
  }
  
  // Display graph visualization data
  logger.info('\n--- Graph Visualization Data ---');
  logger.info(`Total Nodes: ${graph.getNodes().length}`);
  logger.info(`Total Edges: ${graph.getEdges().length}`);
  logger.info(`Completed Nodes: ${result.completedNodes?.length || 0}`);
  logger.info(`Visited Nodes: ${result.visitedNodes?.length || 0}`);
  
  return result;
}

// Only run if called directly
if (require.main === module) {
  runHierarchicalAnalysisExample()
    .then(() => {
      console.log('Example execution complete!');
      process.exit(0);
    })
    .catch(err => {
      console.error('Error running example:', err);
      process.exit(1);
    });
}

export { runHierarchicalAnalysisExample }; 