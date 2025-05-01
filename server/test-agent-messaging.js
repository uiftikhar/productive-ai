/**
 * Test Agent Messaging System
 *
 * This script demonstrates the agent messaging capabilities including:
 * - Natural language communication
 * - Intents and conversation tracking
 * - Multi-modal messages
 * - Message transformations based on agent capability
 */

const { EventEmitter } = require('events');
const {
  AgentMessagingService,
} = require('./dist/agents/services/agent-messaging.service');
const {
  MessageIntent,
  CommunicationModality,
  CommunicationCompetencyLevel,
} = require('./dist/agents/interfaces/message-protocol.interface');
const {
  ContentFormat,
} = require('./dist/agents/interfaces/communication-modality.interface');

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
        { id: 'agent-4', name: 'Basic Agent', capabilities: ['simple_tasks'] },
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
  console.log('=== Testing Agent Messaging System ===\n');

  // Create our services
  const mockMessaging = new MockMessagingService();
  const mockAgentRegistry = new MockAgentRegistry();
  const agentMessaging = new AgentMessagingService(
    mockMessaging,
    mockAgentRegistry,
  );

  // Set up agent competency levels
  agentMessaging.setAgentCompetencyLevel(
    'agent-1',
    CommunicationCompetencyLevel.EXPERT,
  );
  agentMessaging.setAgentCompetencyLevel(
    'agent-2',
    CommunicationCompetencyLevel.ADVANCED,
  );
  agentMessaging.setAgentCompetencyLevel(
    'agent-3',
    CommunicationCompetencyLevel.STANDARD,
  );
  agentMessaging.setAgentCompetencyLevel(
    'agent-4',
    CommunicationCompetencyLevel.BASIC,
  );

  // Set up recipient preferences
  agentMessaging.setRecipientPreferences({
    agentId: 'agent-2',
    preferredModalities: [CommunicationModality.STRUCTURED_DATA],
    detailLevel: 'detailed',
    formatPreferences: {
      [CommunicationModality.STRUCTURED_DATA]: ContentFormat.JSON,
    },
  });

  // Set up message handlers for agents
  const subscriptionIds = [];

  // Agent 1 (Expert) handler
  const sub1 = agentMessaging.subscribeToMessages(
    'agent-1',
    async (message) => {
      console.log(`[AGENT-1] Received message with intent: ${message.intent}`);

      if (
        message.intent === MessageIntent.ASK ||
        message.intent === MessageIntent.REQUEST
      ) {
        // Create a response
        const response = agentMessaging.createResponse(
          message,
          'agent-1',
          'Research Agent',
          'I have researched this topic and found several relevant papers.',
          MessageIntent.INFORM,
          CommunicationModality.TEXT,
        );

        await agentMessaging.sendMessage(response);
      }
    },
  );
  subscriptionIds.push(sub1);

  // Agent 2 (Advanced) handler
  const sub2 = agentMessaging.subscribeToMessages(
    'agent-2',
    async (message) => {
      console.log(`[AGENT-2] Received message with intent: ${message.intent}`);
      console.log(`[AGENT-2] Message modality: ${message.modality}`);

      if (message.intent === MessageIntent.INFORM) {
        const response = agentMessaging.createResponse(
          message,
          'agent-2',
          'Analysis Agent',
          { analysis: 'The data shows significant trends', confidence: 0.87 },
          MessageIntent.REPORT,
          CommunicationModality.STRUCTURED_DATA,
        );

        await agentMessaging.sendMessage(response);
      }
    },
  );
  subscriptionIds.push(sub2);

  // Agent 3 (Standard) handler
  const sub3 = agentMessaging.subscribeToMessages(
    'agent-3',
    async (message) => {
      console.log(`[AGENT-3] Received message with intent: ${message.intent}`);
      console.log(
        `[AGENT-3] Content: ${typeof message.content === 'string' ? message.content : JSON.stringify(message.content)}`,
      );
    },
  );
  subscriptionIds.push(sub3);

  // Agent 4 (Basic) handler
  const sub4 = agentMessaging.subscribeToMessages(
    'agent-4',
    async (message) => {
      console.log(
        `[AGENT-4] Received simplified message: ${typeof message.content === 'string' ? message.content : JSON.stringify(message.content)}`,
      );
    },
  );
  subscriptionIds.push(sub4);

  console.log('Setting up test conversations...');

  // Create a conversation
  const conversation = agentMessaging.createConversation(
    ['agent-1', 'agent-2', 'agent-3', 'agent-4'],
    'Research project planning',
  );

  console.log(`Created conversation with ID: ${conversation.conversationId}`);

  // Test 1: Direct request message (transforms based on recipient)
  console.log(
    '\nTest 1: Direct request message with different transformations per recipient',
  );
  await agentMessaging.sendMessage({
    id: 'msg-1',
    conversationId: conversation.conversationId,
    senderId: 'agent-2',
    senderName: 'Analysis Agent',
    recipientId: 'agent-1',
    intent: MessageIntent.REQUEST,
    modality: CommunicationModality.TEXT,
    content:
      'Could you research the latest papers on large language models for team collaboration? I need comprehensive information on memory mechanisms and team coordination patterns.',
    timestamp: Date.now(),
    priority: 1,
  });

  // Short delay to allow for async processing
  await delay(100);

  // Send same message to agent-4 (basic) - should be simplified
  await agentMessaging.sendMessage({
    id: 'msg-2',
    conversationId: conversation.conversationId,
    senderId: 'agent-2',
    senderName: 'Analysis Agent',
    recipientId: 'agent-4',
    intent: MessageIntent.REQUEST,
    modality: CommunicationModality.TEXT,
    content:
      'Could you research the latest papers on large language models for team collaboration? I need comprehensive information on memory mechanisms and team coordination patterns.',
    timestamp: Date.now(),
    priority: 1,
  });

  await delay(100);

  // Test 2: Broadcast message
  console.log('\nTest 2: Broadcast message to all agents');
  await agentMessaging.sendGlobalBroadcast({
    conversationId: conversation.conversationId,
    senderId: 'agent-3',
    senderName: 'Writing Agent',
    intent: MessageIntent.NOTIFY,
    modality: CommunicationModality.TEXT,
    content:
      'I have completed the draft report on our findings. Please review and provide feedback by tomorrow.',
    timestamp: Date.now(),
    priority: 2,
  });

  await delay(100);

  // Test 3: Multi-turn conversation
  console.log('\nTest 3: Multi-turn conversation with referenced messages');
  const msg3 = await agentMessaging.sendMessage({
    id: 'msg-3',
    conversationId: conversation.conversationId,
    senderId: 'agent-1',
    senderName: 'Research Agent',
    recipientId: 'agent-2',
    intent: MessageIntent.ASK,
    modality: CommunicationModality.TEXT,
    content:
      'What specific aspects of the language models should I focus on for the research?',
    timestamp: Date.now(),
    priority: 1,
  });

  await delay(100);

  // Get the content of the conversation
  const messages = agentMessaging.getConversationMessages(
    conversation.conversationId,
  );
  console.log(`\nConversation has ${messages.length} messages`);

  // Clean up subscriptions
  console.log('\nCleaning up subscriptions...');
  for (const id of subscriptionIds) {
    agentMessaging.unsubscribe(id);
  }

  console.log('\n=== Agent Messaging Test Complete ===');
}

// Run the test
runTest().catch(console.error);
