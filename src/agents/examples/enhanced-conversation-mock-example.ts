/**
 * Enhanced Conversation Management Example with Mock Storage
 *
 * This example demonstrates the enhanced conversation context features:
 * - Agent-specific segmentation
 * - Retention policies
 * - Enhanced metadata support for conversation turns
 *
 * Using a mock storage implementation that doesn't require Pinecone
 */

import { v4 as uuidv4 } from 'uuid';
import { RetentionPolicy } from '../../shared/services/user-context/conversation-context.service';
import { ConsoleLogger } from '../../shared/logger/console-logger';
import { Logger } from '../../shared/logger/logger.interface';

// Setup logger
const logger = new ConsoleLogger();
logger.setLogLevel('debug');

// Create a simple mock implementation of UserContextFacade and required services
class MockContextStorage {
  private conversations: Map<string, Array<any>> = new Map();
  private segments: Map<string, Array<any>> = new Map();
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  async storeConversationTurn(
    userId: string,
    conversationId: string,
    message: string,
    role: 'user' | 'assistant' | 'system',
    options: any = {},
  ): Promise<string> {
    const key = `${userId}:${conversationId}`;

    if (!this.conversations.has(key)) {
      this.conversations.set(key, []);
    }

    const turnId = options.turnId || `turn-${Date.now()}`;
    const segmentId =
      options.segmentId || options.isSegmentStart
        ? `segment-${Date.now()}`
        : this.getCurrentSegmentId(userId, conversationId);

    const turnData = {
      turnId,
      userId,
      conversationId,
      message,
      role,
      timestamp: Date.now(),
      metadata: {
        ...options,
        segmentId,
      },
    };

    this.conversations.get(key)?.push(turnData);

    // Handle segmentation
    if (options.isSegmentStart || !this.segments.has(key)) {
      if (!this.segments.has(key)) {
        this.segments.set(key, []);
      }

      const segmentData = {
        segmentId,
        segmentTopic: options.segmentTopic || 'General',
        firstTimestamp: Date.now(),
        lastTimestamp: Date.now(),
        turnCount: 1,
        agentIds: options.agentId ? [options.agentId] : [],
      };

      this.segments.get(key)?.push(segmentData);
    } else {
      // Update existing segment
      const segments = this.segments.get(key) || [];
      const segmentIndex = segments.findIndex((s) => s.segmentId === segmentId);

      if (segmentIndex >= 0) {
        segments[segmentIndex].lastTimestamp = Date.now();
        segments[segmentIndex].turnCount += 1;

        if (
          options.agentId &&
          !segments[segmentIndex].agentIds.includes(options.agentId)
        ) {
          segments[segmentIndex].agentIds.push(options.agentId);
        }
      }
    }

    this.logger.debug('Stored conversation turn', {
      userId,
      conversationId,
      role,
      segmentId,
      messageLength: message.length,
    });

    return Promise.resolve(turnId);
  }

  private getCurrentSegmentId(userId: string, conversationId: string): string {
    const key = `${userId}:${conversationId}`;

    if (!this.segments.has(key) || this.segments.get(key)?.length === 0) {
      return `segment-${conversationId}`;
    }

    const segments = this.segments.get(key) || [];
    segments.sort((a, b) => b.lastTimestamp - a.lastTimestamp);

    return segments[0].segmentId;
  }

  async getConversationHistory(
    userId: string,
    conversationId: string,
    limit: number = 20,
    options: any = {},
  ): Promise<any[]> {
    const key = `${userId}:${conversationId}`;

    if (!this.conversations.has(key)) {
      return Promise.resolve([]);
    }

    let history = this.conversations.get(key) || [];

    // Apply filters if specified
    if (options.segmentId) {
      history = history.filter(
        (turn) => turn.metadata?.segmentId === options.segmentId,
      );
    }

    if (options.agentId) {
      history = history.filter(
        (turn) => turn.metadata?.agentId === options.agentId,
      );
    }

    if (options.role) {
      history = history.filter((turn) => turn.role === options.role);
    }

    // Sort by timestamp (newest first)
    history.sort((a, b) => b.timestamp - a.timestamp);

    // Apply limit
    history = history.slice(0, limit);

    return Promise.resolve(history);
  }

  async getConversationSegments(
    userId: string,
    conversationId: string,
  ): Promise<any[]> {
    const key = `${userId}:${conversationId}`;

    if (!this.segments.has(key)) {
      return Promise.resolve([]);
    }

    return Promise.resolve(this.segments.get(key) || []);
  }

  async updateRetentionPolicy(
    userId: string,
    conversationId: string,
    policy: RetentionPolicy,
    options: any = {},
  ): Promise<number> {
    const key = `${userId}:${conversationId}`;

    if (!this.conversations.has(key)) {
      return Promise.resolve(0);
    }

    let turns = this.conversations.get(key) || [];
    let updateCount = 0;

    // Apply filters
    if (options.segmentId) {
      turns = turns.filter(
        (turn) => turn.metadata?.segmentId === options.segmentId,
      );
    }

    // Update retention policy
    for (const turn of turns) {
      turn.metadata.retentionPolicy = policy;
      turn.metadata.isHighValue =
        options.isHighValue || turn.metadata.isHighValue;

      if (options.retentionPriority !== undefined) {
        turn.metadata.retentionPriority = options.retentionPriority;
      }

      if (options.retentionTags) {
        turn.metadata.retentionTags = options.retentionTags;
      }

      updateCount++;
    }

    return Promise.resolve(updateCount);
  }

  async searchConversations(
    userId: string,
    searchQuery: string,
    options: any = {},
  ): Promise<any[]> {
    // Get all user conversations
    const userConversations: string[] = [];

    for (const key of this.conversations.keys()) {
      if (key.startsWith(`${userId}:`)) {
        const conversationId = key.split(':')[1];
        userConversations.push(conversationId);
      }
    }

    if (userConversations.length === 0) {
      return Promise.resolve([]);
    }

    // Get all matching turns from all conversations or specified ones
    let results: any[] = [];

    for (const conversationId of userConversations) {
      const key = `${userId}:${conversationId}`;

      if (!this.conversations.has(key)) {
        continue;
      }

      // Only include specified conversations if provided
      if (options.conversationIds && options.conversationIds.length > 0) {
        if (!options.conversationIds.includes(conversationId)) {
          continue;
        }
      }

      let turns = this.conversations.get(key) || [];

      // Simple text search - in a real system this would use vector similarity
      turns = turns.filter((turn) =>
        turn.message.toLowerCase().includes(searchQuery.toLowerCase()),
      );

      // Apply role filter
      if (options.role) {
        turns = turns.filter((turn) => turn.role === options.role);
      }

      results = [...results, ...turns];
    }

    // Sort by relevance (mock - just use timestamp)
    results.sort((a, b) => b.timestamp - a.timestamp);

    // Apply limit
    if (options.maxResults) {
      results = results.slice(0, options.maxResults);
    }

    return Promise.resolve(results);
  }

  async deleteConversation(
    userId: string,
    conversationId: string,
  ): Promise<number> {
    const key = `${userId}:${conversationId}`;

    if (!this.conversations.has(key)) {
      return Promise.resolve(0);
    }

    const count = this.conversations.get(key)?.length || 0;
    this.conversations.delete(key);
    this.segments.delete(key);

    return Promise.resolve(count);
  }
}

/**
 * Main function to demonstrate enhanced conversation features
 */
async function demonstrateEnhancedConversation() {
  try {
    logger.info(
      '=== Enhanced Conversation Management Demo with Mock Storage ===',
    );

    // Create mock storage
    const mockStorage = new MockContextStorage(logger);

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
      if (message.role === 'assistant' && message.agentId) {
        // Use agent-specific storage
        await mockStorage.storeConversationTurn(
          userId,
          conversationId,
          message.content,
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
        await mockStorage.storeConversationTurn(
          userId,
          conversationId,
          message.content,
          message.role,
          { retentionPolicy: RetentionPolicy.STANDARD },
        );
      }

      logger.info(
        `Stored ${message.role} message: "${message.content.substring(0, 30)}..."${message.agentId ? ` (Agent: ${message.agentId})` : ''}`,
      );
    }

    // 2. Demonstrate Conversation Segments
    logger.info('\n2. Demonstrating Conversation Segments');

    const segments = await mockStorage.getConversationSegments(
      userId,
      conversationId,
    );
    logger.info(`Found ${segments.length} segments in the conversation`);

    for (const segment of segments) {
      logger.info(
        `Segment: ${segment.segmentId}, Topic: ${segment.segmentTopic || 'General'}, Turns: ${segment.turnCount}`,
      );

      // Get messages in this segment
      const segmentMessages = await mockStorage.getConversationHistory(
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
      const agentMessages = await mockStorage.getConversationHistory(
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
    const updatedCount = await mockStorage.updateRetentionPolicy(
      userId,
      conversationId,
      RetentionPolicy.PERMANENT,
      { isHighValue: true },
    );

    logger.info(
      `Updated retention policy for ${updatedCount} turns in conversation ${conversationId} to PERMANENT`,
    );

    // 5. Demonstrate Searching Conversations with Enhanced Filters
    logger.info('\n5. Demonstrating Enhanced Search Capabilities');

    const searchQuery = 'risk assessment';

    const searchResults = await mockStorage.searchConversations(
      userId,
      searchQuery,
      {
        conversationIds: [conversationId],
        role: 'assistant',
        maxResults: 5,
      },
    );

    logger.info(`Search results for "${searchQuery}": ${searchResults.length}`);

    // 6. Clean up test data
    logger.info('\n6. Cleaning up test data');

    const deletedCount = await mockStorage.deleteConversation(
      userId,
      conversationId,
    );
    logger.info(
      `Deleted test conversation with ${deletedCount} turns: ${conversationId}`,
    );

    logger.info('\n=== Demo Complete ===');
  } catch (error) {
    logger.error('Error in demo:', {
      error: error instanceof Error ? error.message : String(error),
    });
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
      logger.error('Demonstration failed:', {
        error: error instanceof Error ? error.message : String(error),
      });
      process.exit(1);
    });
}

export { demonstrateEnhancedConversation };
