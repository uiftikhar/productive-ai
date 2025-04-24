/**
 * Context Window Example
 *
 * This example demonstrates how to use the ConversationContextService's
 * context window capabilities to retrieve conversation history tailored
 * for different agent needs.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  ConversationContextService,
  RetentionPolicy,
} from '../../shared/services/user-context/conversation-context.service';
import { PineconeConnectionService } from '../../pinecone/pinecone-connection.service';
import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';

// Mock embedding service for the example
const mockEmbeddingService = {
  generateEmbedding: async (text: string): Promise<number[]> => {
    // In a real implementation, this would call an embedding model
    // For this example, we'll just create a simple mock embedding
    return Array(3072)
      .fill(0)
      .map(() => Math.random() - 0.5);
  },
};

// Create a logger
const logger: Logger = new ConsoleLogger();

// Initialize the services
const pineconeService = new PineconeConnectionService({
  config: {
    maxRetries: 3,
    batchSize: 100,
  },
  logger,
});

// Configure the conversation context service with segmentation enabled
const conversationService = new ConversationContextService({
  pineconeService,
  logger,
  segmentationConfig: {
    enabled: true,
    detectTopicChanges: true,
    assignTopicNames: true,
  },
});

/**
 * Run the example
 */
async function runExample() {
  try {
    console.log('Context Window Example - Starting');

    // Create test user and conversation
    const userId = `test-user-${uuidv4().substring(0, 8)}`;
    const conversationId = `conv-${uuidv4().substring(0, 8)}`;

    console.log(`Created test user: ${userId}`);
    console.log(`Created conversation: ${conversationId}`);

    // Store conversation turns with different agent IDs and segment topics
    await storeTestConversation(userId, conversationId);

    // Demonstrate different context window scenarios
    await demonstrateContextWindows(userId, conversationId);

    // Clean up test data
    const deletedTurns = await conversationService.deleteConversation(
      userId,
      conversationId,
    );
    console.log(
      `Cleaned up test data: deleted ${deletedTurns} conversation turns`,
    );

    console.log('Context Window Example - Complete');
  } catch (error) {
    console.error('Error running example:', error);
  }
}

/**
 * Store a test conversation with multiple segments and agents
 */
async function storeTestConversation(userId: string, conversationId: string) {
  console.log(
    'Creating test conversation with multiple segments and agents...',
  );

  // First segment: General inquiry (agent: customer-service-agent)
  console.log('- Creating "General Inquiry" segment');
  const generalInquiryEmbed = await mockEmbeddingService.generateEmbedding(
    'customer support general inquiry',
  );

  await conversationService.storeConversationTurn(
    userId,
    conversationId,
    'Hi, I need help with my recent order.',
    generalInquiryEmbed,
    'user',
    undefined,
    {
      segmentId: 'segment-general',
      segmentTopic: 'General Inquiry',
      isSegmentStart: true,
    },
  );

  await conversationService.storeConversationTurn(
    userId,
    conversationId,
    "I'd be happy to help with your order. Could you provide your order number?",
    await mockEmbeddingService.generateEmbedding('help with order'),
    'assistant',
    undefined,
    {
      segmentId: 'segment-general',
      agentId: 'customer-service-agent',
      agentName: 'Customer Service',
      capability: 'order-management',
    },
  );

  await conversationService.storeConversationTurn(
    userId,
    conversationId,
    'My order number is ABC123456.',
    await mockEmbeddingService.generateEmbedding('order number'),
    'user',
    undefined,
    {
      segmentId: 'segment-general',
    },
  );

  // Second segment: Technical issue (agent: technical-support-agent)
  console.log('- Creating "Technical Support" segment');
  const techSupportEmbed = await mockEmbeddingService.generateEmbedding(
    'technical support hardware issue',
  );

  await conversationService.storeConversationTurn(
    userId,
    conversationId,
    "I'm having a problem with the product. It won't turn on.",
    techSupportEmbed,
    'user',
    undefined,
    {
      segmentId: 'segment-technical',
      segmentTopic: 'Technical Support',
      isSegmentStart: true,
    },
  );

  await conversationService.storeConversationTurn(
    userId,
    conversationId,
    "I'm sorry to hear that. Let's troubleshoot the issue. Have you tried charging it for at least 30 minutes?",
    await mockEmbeddingService.generateEmbedding('troubleshoot power issue'),
    'assistant',
    undefined,
    {
      segmentId: 'segment-technical',
      agentId: 'technical-support-agent',
      agentName: 'Technical Support',
      capability: 'troubleshooting',
    },
  );

  await conversationService.storeConversationTurn(
    userId,
    conversationId,
    "Yes, I've charged it overnight but it still won't turn on.",
    await mockEmbeddingService.generateEmbedding("charging didn't help"),
    'user',
    undefined,
    {
      segmentId: 'segment-technical',
    },
  );

  // Third segment: Warranty claim (agent: warranty-agent)
  console.log('- Creating "Warranty Claim" segment');
  const warrantyEmbed = await mockEmbeddingService.generateEmbedding(
    'warranty claim replacement',
  );

  await conversationService.storeConversationTurn(
    userId,
    conversationId,
    'I think the product might be defective. How do I make a warranty claim?',
    warrantyEmbed,
    'user',
    undefined,
    {
      segmentId: 'segment-warranty',
      segmentTopic: 'Warranty Claim',
      isSegmentStart: true,
      retentionPolicy: RetentionPolicy.EXTENDED,
      isHighValue: true,
    },
  );

  await conversationService.storeConversationTurn(
    userId,
    conversationId,
    'I understand your frustration. Since this is still under warranty, I can help you process a replacement. Please provide your shipping address.',
    await mockEmbeddingService.generateEmbedding(
      'process warranty replacement',
    ),
    'assistant',
    undefined,
    {
      segmentId: 'segment-warranty',
      agentId: 'warranty-agent',
      agentName: 'Warranty Services',
      capability: 'warranty-processing',
      retentionPolicy: RetentionPolicy.EXTENDED,
      isHighValue: true,
    },
  );

  await conversationService.storeConversationTurn(
    userId,
    conversationId,
    'My address is 123 Main St, Anytown, CA 12345.',
    await mockEmbeddingService.generateEmbedding('shipping address'),
    'user',
    undefined,
    {
      segmentId: 'segment-warranty',
      retentionPolicy: RetentionPolicy.EXTENDED,
      isHighValue: true,
    },
  );

  console.log('Test conversation created with 9 turns across 3 segments');
}

/**
 * Demonstrate different context window scenarios
 */
async function demonstrateContextWindows(
  userId: string,
  conversationId: string,
) {
  console.log('\nDemonstrating different context window scenarios:');

  // Scenario 1: Get context window for technical support agent
  console.log('\n1. Context window for technical support agent:');
  const technicalContext = await conversationService.createContextWindow(
    userId,
    conversationId,
    {
      includeAgentIds: ['technical-support-agent'],
      windowSize: 5,
      includeTurnMetadata: true,
    },
  );

  console.log(
    `Retrieved ${technicalContext.messages.length} messages for technical support agent`,
  );
  for (const message of technicalContext.messages) {
    console.log(
      `- ${message.metadata.role}: "${message.metadata.message?.substring(0, 50)}..." (Agent: ${message.metadata.agentId || 'User'})`,
    );
  }

  // Scenario 2: Get segment-specific context window
  console.log('\n2. Segment-specific context window for warranty claims:');
  const warrantyContext = await conversationService.createContextWindow(
    userId,
    conversationId,
    {
      includeCurrentSegmentOnly: false,
      windowSize: 5,
    },
  );

  // Get the segment messages separately
  const segmentMessages = await conversationService.getConversationHistory(
    userId,
    conversationId,
    10,
    { segmentId: 'segment-warranty' },
  );

  console.log(
    `Retrieved ${segmentMessages.length} messages from warranty segment`,
  );
  console.log(
    `Segment info: ${segmentMessages[0]?.metadata?.segmentTopic || 'N/A'}`,
  );
  for (const message of segmentMessages) {
    if (message.metadata) {
      const role = (message.metadata.role as string) || 'unknown';
      const content = (message.metadata.message as string) || '';
      console.log(`- ${role}: "${content.substring(0, 50)}..."`);
    }
  }

  // Scenario 3: Capability-based filtering
  console.log('\n3. Capability-based context filtering:');
  const capabilityContext = await conversationService.createContextWindow(
    userId,
    conversationId,
    {
      filterByCapabilities: ['warranty-processing'],
      windowSize: 5,
    },
  );

  console.log(
    `Retrieved ${capabilityContext.messages.length} messages related to warranty processing capability`,
  );
  for (const message of capabilityContext.messages) {
    console.log(
      `- ${message.metadata.role}: "${message.metadata.message?.substring(0, 50)}..." (Capability: ${message.metadata.capability || 'N/A'})`,
    );
  }

  // Scenario 4: Relevance-based context with recency weighting
  console.log('\n4. Relevance-based context with recency weighting:');
  const queryEmbedding = await mockEmbeddingService.generateEmbedding(
    'warranty replacement shipping',
  );

  const relevanceContext = await conversationService.createContextWindow(
    userId,
    conversationId,
    {
      relevanceEmbedding: queryEmbedding,
      recencyWeight: 0.3, // 30% weight to recency, 70% to relevance
      windowSize: 5,
    },
  );

  console.log(
    `Retrieved ${relevanceContext.messages.length} messages sorted by relevance and recency`,
  );
  for (const message of relevanceContext.messages) {
    console.log(
      `- ${message.metadata.role}: "${message.metadata.message?.substring(0, 50)}..." (Score: ${message.score?.toFixed(3) || 'N/A'})`,
    );
  }

  // Scenario 5: Generate context summary
  console.log('\n5. Generate segment summary:');
  const summary = await conversationService.generateContextSummary(
    userId,
    conversationId,
    'segment-technical',
  );

  console.log(`Summary: ${summary}`);
}

// Run the example
if (require.main === module) {
  runExample().catch(console.error);
}

export default runExample;
