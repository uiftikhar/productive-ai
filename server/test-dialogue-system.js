/**
 * Test Agent Dialogue System
 *
 * This script demonstrates the agent dialogue capabilities including:
 * - Structured conversations with phases
 * - Request/response patterns
 * - Negotiation between agents
 */

const { EventEmitter } = require('events');
const { v4: uuidv4 } = require('uuid');

// Import services
const {
  AgentMessagingService,
} = require('./dist/agents/services/agent-messaging.service');
const {
  DialogueManagementService,
} = require('./dist/agents/services/dialogue-management.service');
const {
  RequestFormulationService,
} = require('./dist/agents/services/request-formulation.service');
const {
  ResponseGenerationService,
} = require('./dist/agents/services/response-generation.service');
const {
  NegotiationDialogueService,
} = require('./dist/agents/services/negotiation-dialogue.service');

// Import interfaces
const {
  MessageIntent,
  CommunicationModality,
  CommunicationCompetencyLevel,
} = require('./dist/agents/interfaces/message-protocol.interface');
const {
  DialogueType,
  DialoguePhase,
  RequestPattern,
} = require('./dist/agents/interfaces/dialogue-system.interface');

// Mock messaging service
class MockMessagingService {
  constructor() {
    this.messages = [];
  }

  async sendMessage(message) {
    console.log(
      `[LEGACY] Sending message: ${message.type} from ${message.senderId} to ${message.recipientId || 'broadcast'}`,
    );
    this.messages.push(message);
    return { success: true, messageId: message.id, timestamp: Date.now() };
  }
}

// Mock agent registry
class MockAgentRegistry {
  constructor() {
    this.agents = new Map([
      [
        'agent-1',
        {
          id: 'agent-1',
          name: 'Research Agent',
          capabilities: ['research', 'information_gathering'],
        },
      ],
      [
        'agent-2',
        {
          id: 'agent-2',
          name: 'Analysis Agent',
          capabilities: ['data_analysis', 'reasoning'],
        },
      ],
      [
        'agent-3',
        {
          id: 'agent-3',
          name: 'Writing Agent',
          capabilities: ['content_creation', 'summarization'],
        },
      ],
      [
        'agent-4',
        {
          id: 'agent-4',
          name: 'Negotiator Agent',
          capabilities: ['negotiation', 'planning'],
        },
      ],
    ]);
  }

  async getAgent(id) {
    return this.agents.get(id);
  }
}

// Helper for delayed execution
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Run the test
async function runTest() {
  console.log('=== Testing Agent Dialogue System ===\n');

  // Create our services
  const mockMessaging = new MockMessagingService();
  const mockAgentRegistry = new MockAgentRegistry();
  const messagingService = new AgentMessagingService(
    mockMessaging,
    mockAgentRegistry,
  );
  const dialogueManagement = new DialogueManagementService(
    messagingService,
    mockAgentRegistry,
  );
  const requestFormulation = new RequestFormulationService(
    messagingService,
    dialogueManagement,
    mockAgentRegistry,
  );
  const responseGeneration = new ResponseGenerationService(
    messagingService,
    dialogueManagement,
    mockAgentRegistry,
  );
  const negotiationDialogue = new NegotiationDialogueService(
    messagingService,
    dialogueManagement,
    requestFormulation,
    responseGeneration,
    mockAgentRegistry,
  );

  // Set up agent competency levels
  messagingService.setAgentCompetencyLevel(
    'agent-1',
    CommunicationCompetencyLevel.EXPERT,
  );
  messagingService.setAgentCompetencyLevel(
    'agent-2',
    CommunicationCompetencyLevel.ADVANCED,
  );
  messagingService.setAgentCompetencyLevel(
    'agent-3',
    CommunicationCompetencyLevel.STANDARD,
  );
  messagingService.setAgentCompetencyLevel(
    'agent-4',
    CommunicationCompetencyLevel.EXPERT,
  );

  // Set up message handlers for agents
  const subscriptionIds = [];

  // Agent 1 (Research Agent) handler
  const sub1 = messagingService.subscribeToMessages(
    'agent-1',
    async (message) => {
      console.log(`[AGENT-1] Received message with intent: ${message.intent}`);

      // Handle information requests
      if (message.intent === MessageIntent.ASK) {
        if (message.modality === CommunicationModality.STRUCTURED_DATA) {
          const request = message.content;

          if (request.pattern === RequestPattern.INFORMATION_REQUEST) {
            await delay(500); // Simulate processing time
            console.log(
              `[AGENT-1] Responding to information request about: ${request.content.topic}`,
            );

            // Generate response
            await responseGeneration.respondToRequest(
              message,
              {
                topic: request.content.topic,
                answers: request.content.questions.map((q) => ({
                  question: q,
                  answer: `Research shows that ${q.toLowerCase().replace(/\?/, '')}.`,
                  confidence: 0.9,
                  sources: ['Academic Journal 1', 'Research Paper 2'],
                })),
              },
              'success',
              1.0,
              0.9,
              false,
            );
          }
        }
      }
    },
  );
  subscriptionIds.push(sub1);

  // Agent 2 (Analysis Agent) handler
  const sub2 = messagingService.subscribeToMessages(
    'agent-2',
    async (message) => {
      console.log(`[AGENT-2] Received message with intent: ${message.intent}`);

      // Handle clarification requests
      if (message.intent === MessageIntent.CLARIFY) {
        await delay(500); // Simulate processing time
        console.log('[AGENT-2] Responding to clarification request');

        await responseGeneration.respondToClarification(message, {
          clarificationPoint1: 'Here is the clarification for point 1',
          clarificationPoint2: 'Here is the clarification for point 2',
        });
      }
    },
  );
  subscriptionIds.push(sub2);

  // Agent 3 (Writing Agent) handler - responds to action requests
  const sub3 = messagingService.subscribeToMessages(
    'agent-3',
    async (message) => {
      console.log(`[AGENT-3] Received message with intent: ${message.intent}`);

      if (message.intent === MessageIntent.REQUEST) {
        await delay(700); // Simulate processing time
        console.log('[AGENT-3] Responding to action request');

        if (message.modality === CommunicationModality.STRUCTURED_DATA) {
          const request = message.content;

          if (request.pattern === RequestPattern.ACTION_REQUEST) {
            await responseGeneration.respondToRequest(
              message,
              {
                status: 'completed',
                result: `I have ${request.content.actionType} with parameters ${JSON.stringify(request.content.parameters)}`,
                artifacts: [`artifact-${uuidv4().substring(0, 8)}`],
              },
              'success',
              1.0,
              0.9,
              false,
            );
          }
        }
      }
    },
  );
  subscriptionIds.push(sub3);

  // Agent 4 (Negotiator Agent) handler - handles proposals
  const sub4 = messagingService.subscribeToMessages(
    'agent-4',
    async (message) => {
      console.log(`[AGENT-4] Received message with intent: ${message.intent}`);

      if (
        message.intent === MessageIntent.REQUEST ||
        message.intent === MessageIntent.PROPOSE
      ) {
        await delay(800); // Simulate processing time
        console.log('[AGENT-4] Responding to proposal');

        if (message.modality === CommunicationModality.STRUCTURED_DATA) {
          const request = message.content;

          if (request.pattern === RequestPattern.PROPOSAL_REQUEST) {
            // In a real agent, this would be more sophisticated decision-making
            // Here we make a simple counter-proposal
            await responseGeneration.generateNegotiationResponse(
              message,
              'counter',
              {
                counterProposal:
                  "I'd like to suggest a modified plan with the following changes...",
                modifications: [
                  { aspect: 'timeline', change: 'extended by 2 days' },
                  {
                    aspect: 'resources',
                    change: 'additional computational resources',
                  },
                ],
                reasoning: 'This ensures higher quality results',
              },
              'The original timeline is too aggressive',
            );
          }
        }
      } else if (message.intent === MessageIntent.COUNTER_PROPOSE) {
        await delay(500);
        console.log('[AGENT-4] Accepting counter proposal');

        // Accept the counter proposal
        await responseGeneration.generateNegotiationResponse(
          message,
          'accept',
          {
            acceptance: 'I agree to the counter proposal',
            comments: 'This is a good compromise',
          },
        );
      }
    },
  );
  subscriptionIds.push(sub4);

  console.log('Setting up test scenarios...\n');

  // Test 1: Information exchange dialogue
  console.log('=== Test 1: Information Exchange Dialogue ===');
  const infoDialogue = await dialogueManagement.initiateDialogue(
    'agent-2', // initiator
    ['agent-1'], // participants
    DialogueType.INFORMATION_EXCHANGE,
    'Research on large language models',
    undefined,
    'information-exchange', // template ID
  );

  console.log(`Created dialogue with ID: ${infoDialogue.dialogueId}`);

  // Send an information request
  await requestFormulation.createInformationRequest(
    'agent-2', // sender
    'agent-1', // recipient
    'Large Language Models',
    [
      'What are the latest advancements in LLM architecture?',
      'How do LLMs handle context windows?',
      'What are the limitations of current models?',
    ],
    { purpose: 'project planning' },
    'medium',
  );

  // Wait for the response
  await delay(1000);

  // Check dialogue state
  const updatedInfoDialogue = dialogueManagement.getDialogue(
    infoDialogue.dialogueId,
  );
  console.log(`Dialogue phase: ${updatedInfoDialogue.currentPhase}`);
  console.log(`Dialogue status: ${updatedInfoDialogue.status}`);

  // Test 2: Clarification request
  console.log('\n=== Test 2: Clarification Request ===');
  const clarificationMsg = await messagingService.sendMessage({
    id: uuidv4(),
    conversationId: uuidv4(),
    senderId: 'agent-3',
    senderName: 'Writing Agent',
    recipientId: 'agent-2',
    recipientName: 'Analysis Agent',
    intent: MessageIntent.ASK,
    modality: CommunicationModality.TEXT,
    content:
      'What exactly do you mean by "contextual analysis" in your report? And could you clarify the metrics you used?',
    timestamp: Date.now(),
    priority: 1,
  });

  // Create clarification request through dialogue service
  const clarificationRequest = dialogueManagement.createClarificationRequest(
    clarificationMsg.id,
    'ambiguity',
    'The terms "contextual analysis" and metrics are ambiguous',
    [
      'What specific methodology was used for contextual analysis?',
      'Which metrics were used and how were they calculated?',
    ],
    undefined,
    'medium',
  );

  // Send clarification request
  await dialogueManagement.sendClarificationRequest(
    'agent-3',
    'agent-2',
    clarificationRequest,
    clarificationMsg.conversationId,
  );

  // Wait for the response
  await delay(1000);

  // Test 3: Action request
  console.log('\n=== Test 3: Action Request ===');
  await requestFormulation.createActionRequest(
    'agent-2',
    'agent-3',
    'summarize',
    {
      document: 'research-report-xyz',
      maxLength: 500,
      focus: 'methodology and results',
    },
    { purpose: 'team briefing' },
    'high',
  );

  // Wait for the response
  await delay(1000);

  // Test 4: Negotiation between agents
  console.log('\n=== Test 4: Negotiation Dialogue ===');
  const negotiation = await negotiationDialogue.initiateNegotiation(
    'agent-2', // initiator
    ['agent-4'], // parties
    'Project resource allocation',
    {
      timeline: '5 days',
      computeResources: 'standard',
      assistants: 2,
      priority: 'medium',
    },
    [
      { constraint: 'budget', value: 'must not exceed allocation' },
      { constraint: 'quality', value: 'must meet quality threshold' },
    ],
    Date.now() + 60000, // 1 minute deadline
    'consensus',
  );

  console.log(`Created negotiation with ID: ${negotiation.negotiationId}`);

  // Wait for proposal, counter-proposal, and acceptance sequence
  await delay(2500);

  // Check negotiation status
  const updatedNegotiation = negotiationDialogue.getNegotiation(
    negotiation.negotiationId,
  );
  console.log(`Negotiation status: ${updatedNegotiation.status}`);
  console.log(`Proposals: ${updatedNegotiation.proposalHistory.length}`);
  console.log(`Agreements: ${updatedNegotiation.agreements.length}`);

  // Clean up
  console.log('\nCleaning up...');
  for (const id of subscriptionIds) {
    messagingService.unsubscribe(id);
  }

  console.log('\n=== Agent Dialogue System Test Complete ===');
}

// Run the test
runTest().catch(console.error);
