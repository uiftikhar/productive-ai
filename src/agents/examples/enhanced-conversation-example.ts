/**
 * Enhanced Conversation Management Example
 *
 * This example demonstrates the enhanced conversation context features:
 * - Agent-specific segmentation
 * - Retention policies
 * - Enhanced metadata support for conversation turns
 */

import { v4 as uuidv4 } from 'uuid';
import { UserContextFacade } from '../../shared/services/user-context/user-context.facade';
import {
  ConversationContextService,
  RetentionPolicy,
} from '../../shared/services/user-context/conversation-context.service';
import { ConsoleLogger } from '../../shared/logger/console-logger';
import { EmbeddingServiceFactory } from '../../shared/services/embedding.factory';
import { IEmbeddingService } from '../../shared/services/embedding.interface';

// Setup logger
const logger = new ConsoleLogger();
logger.setLogLevel('debug');

// Initialize services
const embeddingService: IEmbeddingService =
  EmbeddingServiceFactory.getService();

// Initialize conversation context service with segmentation enabled
const conversationService = new ConversationContextService({
  logger,
  segmentationConfig: {
    enabled: true,
    detectTopicChanges: true,
    assignTopicNames: true,
  },
});

// Initialize user context facade
const userContextFacade = new UserContextFacade({
  logger,
});

/**
 * Main function to demonstrate enhanced conversation features
 */
async function demonstrateEnhancedConversation() {
  try {
    logger.info('=== Enhanced Conversation Management Demo ===');

    // Create a test user and conversation
    const userId = `test-user-${uuidv4().substring(0, 8)}`;
    const conversationId = `conv-${uuidv4().substring(0, 8)}`;
    logger.info(
      `Created test user: ${userId} and conversation: ${conversationId}`,
    );

    // 1. Demonstrate Agent-Specific Conversation Turns
    logger.info('\n1. Demonstrating Agent-Specific Conversation Turns');

    // Create conversation with multiple agents
    const messages = [
      {
        role: 'user' as const,
        content: 'I need help creating a weekly report template.',
        agentId: null,
      },
      {
        role: 'assistant' as const,
        content:
          'I can help you with that. What kind of information do you want to include in your weekly report?',
        agentId: 'report-assistant-agent',
        capability: 'document-creation',
      },
      {
        role: 'user' as const,
        content:
          'I want to include project status, hours worked, and any blockers.',
        agentId: null,
      },
      {
        role: 'assistant' as const,
        content:
          'I notice you mentioned blockers. Would you like me to include a risk assessment section as well?',
        agentId: 'risk-assessment-agent',
        capability: 'risk-analysis',
      },
      {
        role: 'user' as const,
        content: 'Yes, that would be helpful.',
        agentId: null,
      },
      {
        role: 'assistant' as const,
        content:
          "Great! I've created a template that includes project status, hours worked, blockers, and a risk assessment section.",
        agentId: 'report-template-agent',
        capability: 'template-generation',
      },
    ];

    // Store the conversation with agent-specific data
    for (const message of messages) {
      const embeddings = await embeddingService.generateEmbedding(
        message.content,
      );

      if (message.role === 'assistant' && message.agentId) {
        // Use agent-specific storage
        await userContextFacade.storeAgentConversationTurn(
          userId,
          conversationId,
          message.content,
          embeddings,
          message.role,
          {
            agentId: message.agentId,
            agentName: message.agentId.split('-')[0],
            capability: message.capability,
            retentionPolicy: RetentionPolicy.EXTENDED,
            isSegmentStart: message.agentId === 'risk-assessment-agent', // Mark topic change
            segmentTopic:
              message.agentId === 'risk-assessment-agent'
                ? 'Risk Assessment'
                : undefined,
          },
        );
      } else {
        // Regular storage for user messages
        await userContextFacade.storeConversationTurn(
          userId,
          conversationId,
          message.content,
          embeddings,
          message.role,
          undefined,
          { retentionPolicy: RetentionPolicy.STANDARD },
        );
      }

      logger.info(
        `Stored ${message.role} message: "${message.content.substring(0, 30)}..."${message.agentId ? ` (Agent: ${message.agentId})` : ''}`,
      );
    }

    // 2. Demonstrate Conversation Segments
    logger.info('\n2. Demonstrating Conversation Segments');

    const segments = await userContextFacade.getConversationSegments(
      userId,
      conversationId,
    );
    logger.info(`Found ${segments.length} segments in the conversation`);

    for (const segment of segments) {
      logger.info(
        `Segment: ${segment.segmentId}, Topic: ${segment.segmentTopic || 'General'}, Turns: ${segment.turnCount}`,
      );

      // Get messages in this segment
      const segmentMessages = await userContextFacade.getConversationHistory(
        userId,
        conversationId,
        10,
        {
          segmentId: segment.segmentId,
        },
      );

      logger.info(
        `Messages in segment "${segment.segmentTopic || 'General'}": ${segmentMessages.length}`,
      );
    }

    // 3. Demonstrate Agent-Specific Filtering
    logger.info('\n3. Demonstrating Agent-Specific Filtering');

    const agentIds = [
      'report-assistant-agent',
      'risk-assessment-agent',
      'report-template-agent',
    ];

    for (const agentId of agentIds) {
      const agentMessages = await userContextFacade.getConversationHistory(
        userId,
        conversationId,
        10,
        {
          agentId,
        },
      );

      logger.info(`Messages from ${agentId}: ${agentMessages.length}`);
    }

    // 4. Demonstrate Retention Policy Updates
    logger.info('\n4. Demonstrating Retention Policy Updates');

    // Update retention policy for the entire conversation
    await userContextFacade.updateRetentionPolicy(
      userId,
      conversationId,
      RetentionPolicy.PERMANENT,
      { isHighValue: true },
    );

    logger.info(
      `Updated retention policy for conversation ${conversationId} to PERMANENT`,
    );

    // 5. Demonstrate Searching Conversations with Enhanced Filters
    logger.info('\n5. Demonstrating Enhanced Search Capabilities');

    const searchQuery = 'risk assessment';
    const searchEmbeddings =
      await embeddingService.generateEmbedding(searchQuery);

    const searchResults = await userContextFacade.searchConversations(
      userId,
      searchEmbeddings,
      {
        conversationIds: [conversationId],
        role: 'assistant',
        // Custom metadata filtering would be handled internally
        minRelevanceScore: 0.7,
        maxResults: 5,
      },
    );

    logger.info(`Search results for "${searchQuery}": ${searchResults.length}`);

    // 6. Clean up test data
    logger.info('\n6. Cleaning up test data');

    await userContextFacade.deleteConversation(userId, conversationId);
    logger.info(`Deleted test conversation: ${conversationId}`);

    logger.info('\n=== Demo Complete ===');
  } catch (error) {
    logger.error('Error in demo:', { error });
  }
}

// Run the demonstration if this is executed directly
if (require.main === module) {
  demonstrateEnhancedConversation()
    .then(() => {
      logger.info('Demonstration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Demonstration failed:', { error });
      process.exit(1);
    });
}

export { demonstrateEnhancedConversation };
