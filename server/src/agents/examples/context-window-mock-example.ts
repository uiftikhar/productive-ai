/**
 * Context Window Mock Example
 *
 * This example demonstrates how to use the ConversationContextService's
 * context window capabilities with an in-memory mock for testing.
 */

import { v4 as uuidv4 } from 'uuid';
import { ConsoleLogger } from '../../shared/logger/console-logger';
import { Logger } from '../../shared/logger/logger.interface';

// Types
type MessageRole = 'user' | 'assistant' | 'system';

interface ConversationMessage {
  id: string;
  userId: string;
  conversationId: string;
  segmentId: string;
  segmentTopic?: string;
  message: string;
  role: MessageRole;
  timestamp: number;
  agentId?: string;
  agentName?: string;
  capability?: string;
  embedding: number[];
  isSegmentStart?: boolean;
  score?: number;
}

// Mock in-memory conversation storage
class MockConversationStorage {
  private messages: ConversationMessage[] = [];
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  async storeMessage(message: ConversationMessage): Promise<string> {
    this.messages.push(message);
    this.logger.info(`Stored message: ${message.id}`);
    return message.id;
  }

  async getMessages(
    userId: string,
    conversationId: string,
    options: {
      limit?: number;
      beforeTimestamp?: number;
      afterTimestamp?: number;
      segmentId?: string;
      agentId?: string;
      role?: MessageRole;
    } = {},
  ): Promise<ConversationMessage[]> {
    let filtered = this.messages.filter(
      (m) => m.userId === userId && m.conversationId === conversationId,
    );

    if (options.beforeTimestamp) {
      filtered = filtered.filter((m) => m.timestamp < options.beforeTimestamp!);
    }

    if (options.afterTimestamp) {
      filtered = filtered.filter((m) => m.timestamp > options.afterTimestamp!);
    }

    if (options.segmentId) {
      filtered = filtered.filter((m) => m.segmentId === options.segmentId);
    }

    if (options.agentId) {
      filtered = filtered.filter((m) => m.agentId === options.agentId);
    }

    if (options.role) {
      filtered = filtered.filter((m) => m.role === options.role);
    }

    // Sort by timestamp (chronological)
    filtered.sort((a, b) => a.timestamp - b.timestamp);

    // Apply limit if specified
    if (options.limit && options.limit > 0) {
      filtered = filtered.slice(0, options.limit);
    }

    return filtered;
  }

  async deleteConversation(
    userId: string,
    conversationId: string,
  ): Promise<number> {
    const count = this.messages.filter(
      (m) => m.userId === userId && m.conversationId === conversationId,
    ).length;

    this.messages = this.messages.filter(
      (m) => !(m.userId === userId && m.conversationId === conversationId),
    );

    return count;
  }

  async getSegments(
    userId: string,
    conversationId: string,
  ): Promise<
    {
      segmentId: string;
      segmentTopic?: string;
      turnCount: number;
      firstTimestamp: number;
      lastTimestamp: number;
      agentIds?: string[];
    }[]
  > {
    const segments = new Map<
      string,
      {
        segmentId: string;
        segmentTopic?: string;
        turnCount: number;
        firstTimestamp: number;
        lastTimestamp: number;
        agentIds: Set<string>;
      }
    >();

    // Get all messages for this conversation
    const messages = await this.getMessages(userId, conversationId);

    // Group by segment ID
    for (const message of messages) {
      const segmentId = message.segmentId;
      const timestamp = message.timestamp;
      const segmentTopic = message.segmentTopic;
      const agentId = message.agentId;

      if (segmentId) {
        const existing = segments.get(segmentId);
        if (existing) {
          existing.turnCount++;
          existing.firstTimestamp = Math.min(
            existing.firstTimestamp,
            timestamp,
          );
          existing.lastTimestamp = Math.max(existing.lastTimestamp, timestamp);
          if (agentId) existing.agentIds.add(agentId);
          // Update topic if not set
          if (!existing.segmentTopic && segmentTopic) {
            existing.segmentTopic = segmentTopic;
          }
        } else {
          segments.set(segmentId, {
            segmentId,
            segmentTopic,
            turnCount: 1,
            firstTimestamp: timestamp,
            lastTimestamp: timestamp,
            agentIds: new Set(agentId ? [agentId] : []),
          });
        }
      }
    }

    // Convert to array and format for return
    return Array.from(segments.values())
      .map((segment) => ({
        segmentId: segment.segmentId,
        segmentTopic: segment.segmentTopic,
        turnCount: segment.turnCount,
        firstTimestamp: segment.firstTimestamp,
        lastTimestamp: segment.lastTimestamp,
        agentIds:
          segment.agentIds.size > 0 ? Array.from(segment.agentIds) : undefined,
      }))
      .sort((a, b) => a.firstTimestamp - b.firstTimestamp);
  }

  async getMessagesByRelevance(
    userId: string,
    conversationId: string,
    queryEmbedding: number[],
    options: {
      limit?: number;
      segmentId?: string;
      agentId?: string;
      minScore?: number;
    } = {},
  ): Promise<ConversationMessage[]> {
    // Get filtered messages
    let filtered = await this.getMessages(userId, conversationId, {
      segmentId: options.segmentId,
      agentId: options.agentId,
    });

    // Calculate similarity scores (cosine similarity)
    // This is a simple mock implementation
    filtered = filtered.map((message) => {
      // Calculate dot product
      let dotProduct = 0;
      let queryMagnitude = 0;
      let messageMagnitude = 0;

      for (let i = 0; i < queryEmbedding.length; i++) {
        dotProduct += queryEmbedding[i] * message.embedding[i];
        queryMagnitude += queryEmbedding[i] * queryEmbedding[i];
        messageMagnitude += message.embedding[i] * message.embedding[i];
      }

      queryMagnitude = Math.sqrt(queryMagnitude);
      messageMagnitude = Math.sqrt(messageMagnitude);

      // Cosine similarity
      const similarity = dotProduct / (queryMagnitude * messageMagnitude);

      return {
        ...message,
        score: similarity,
      };
    });

    // Apply minimum score filter if specified
    if (options.minScore) {
      filtered = filtered.filter((m) => (m.score || 0) >= options.minScore!);
    }

    // Sort by score (most similar first)
    filtered.sort((a, b) => (b.score || 0) - (a.score || 0));

    // Apply limit if specified
    if (options.limit && options.limit > 0) {
      filtered = filtered.slice(0, options.limit);
    }

    return filtered;
  }
}

// Mock Embedding Service
const mockEmbeddingService = {
  generateEmbedding: async (text: string): Promise<number[]> => {
    // In a real implementation, this would call an embedding model
    // For this example, we'll just create a simple mock embedding
    // that's unique for each text input but deterministic
    const seed = text
      .split('')
      .reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const rng = (n: number) => ((seed * 9301 + 49297) % 233280) / 233280;

    return Array(128)
      .fill(0)
      .map((_, i) => rng(i) * 2 - 1);
  },
};

// Mock Context Window Service
class ContextWindowService {
  private storage: MockConversationStorage;
  private logger: Logger;

  constructor(storage: MockConversationStorage, logger: Logger) {
    this.storage = storage;
    this.logger = logger;
  }

  async storeConversationTurn(
    userId: string,
    conversationId: string,
    message: string,
    role: MessageRole,
    options: {
      segmentId?: string;
      segmentTopic?: string;
      isSegmentStart?: boolean;
      agentId?: string;
      agentName?: string;
      capability?: string;
    } = {},
  ): Promise<string> {
    const messageId = `turn-${uuidv4()}`;
    const timestamp = Date.now();

    // Generate embedding
    const embedding = await mockEmbeddingService.generateEmbedding(message);

    // Create message object
    const messageObj: ConversationMessage = {
      id: messageId,
      userId,
      conversationId,
      message,
      role,
      timestamp,
      segmentId: options.segmentId || conversationId,
      segmentTopic: options.segmentTopic,
      isSegmentStart: options.isSegmentStart || false,
      agentId: options.agentId,
      agentName: options.agentName,
      capability: options.capability,
      embedding,
    };

    // Store in mock storage
    return this.storage.storeMessage(messageObj);
  }

  async getCurrentSegmentId(
    userId: string,
    conversationId: string,
  ): Promise<string> {
    const messages = await this.storage.getMessages(userId, conversationId, {
      limit: 1,
    });

    if (messages.length > 0 && messages[0].segmentId) {
      return messages[0].segmentId;
    }

    return `segment-${conversationId}`;
  }

  async getConversationHistory(
    userId: string,
    conversationId: string,
    limit: number = 20,
    options: {
      beforeTimestamp?: number;
      afterTimestamp?: number;
      segmentId?: string;
      agentId?: string;
      role?: MessageRole;
      includeMetadata?: boolean;
      sortBy?: 'chronological' | 'relevance';
      relevanceEmbedding?: number[];
    } = {},
  ): Promise<ConversationMessage[]> {
    if (options.sortBy === 'relevance' && options.relevanceEmbedding) {
      return this.storage.getMessagesByRelevance(
        userId,
        conversationId,
        options.relevanceEmbedding,
        {
          limit,
          segmentId: options.segmentId,
          agentId: options.agentId,
        },
      );
    } else {
      return this.storage.getMessages(userId, conversationId, {
        limit,
        beforeTimestamp: options.beforeTimestamp,
        afterTimestamp: options.afterTimestamp,
        segmentId: options.segmentId,
        agentId: options.agentId,
        role: options.role,
      });
    }
  }

  async getConversationSegments(userId: string, conversationId: string) {
    return this.storage.getSegments(userId, conversationId);
  }

  async createContextWindow(
    userId: string,
    conversationId: string,
    options: {
      windowSize?: number;
      includeCurrentSegmentOnly?: boolean;
      includeAgentIds?: string[];
      excludeAgentIds?: string[];
      relevanceThreshold?: number;
      relevanceQuery?: string;
      relevanceEmbedding?: number[];
      recencyWeight?: number;
      filterByCapabilities?: string[];
      maxTokens?: number;
      includeTurnMetadata?: boolean;
    } = {},
  ): Promise<{
    messages: ConversationMessage[];
    contextSummary?: string;
    segmentInfo?: {
      id: string;
      topic?: string;
    };
    tokenCount?: number;
  }> {
    // Set default window size
    const windowSize = options.windowSize || 10;

    // Get the current segment if needed
    let segmentId: string | undefined;
    if (options.includeCurrentSegmentOnly) {
      segmentId = await this.getCurrentSegmentId(userId, conversationId);
    }

    // Get base messages (either by relevance or chronological)
    let messages: ConversationMessage[];
    if (options.relevanceQuery || options.relevanceEmbedding) {
      const queryEmbedding =
        options.relevanceEmbedding ||
        (await mockEmbeddingService.generateEmbedding(
          options.relevanceQuery || '',
        ));

      messages = await this.storage.getMessagesByRelevance(
        userId,
        conversationId,
        queryEmbedding,
        {
          limit: windowSize * 2, // Fetch more initially as we may filter some out
          segmentId,
        },
      );
    } else {
      messages = await this.storage.getMessages(userId, conversationId, {
        limit: windowSize * 2, // Fetch more initially as we may filter some out
        segmentId,
      });
    }

    // Post-processing: Apply agent filters
    if (options.includeAgentIds && options.includeAgentIds.length > 0) {
      messages = messages.filter((message) => {
        return (
          message.agentId && options.includeAgentIds?.includes(message.agentId)
        );
      });
    }

    if (options.excludeAgentIds && options.excludeAgentIds.length > 0) {
      messages = messages.filter((message) => {
        return (
          !message.agentId ||
          !options.excludeAgentIds?.includes(message.agentId)
        );
      });
    }

    // Filter by capabilities if specified
    if (
      options.filterByCapabilities &&
      options.filterByCapabilities.length > 0
    ) {
      messages = messages.filter((message) => {
        return (
          message.capability &&
          options.filterByCapabilities?.includes(message.capability)
        );
      });
    }

    // Apply recency weighting if doing relevance search with recency bias
    if (
      options.recencyWeight &&
      options.recencyWeight > 0 &&
      (options.relevanceQuery || options.relevanceEmbedding)
    ) {
      const maxTimestamp = Math.max(...messages.map((m) => m.timestamp));
      const minTimestamp = Math.min(...messages.map((m) => m.timestamp));
      const timeRange = maxTimestamp - minTimestamp || 1; // Avoid division by zero

      // Adjust scores based on recency
      messages = messages.map((message) => {
        const recencyScore = (message.timestamp - minTimestamp) / timeRange;
        const originalScore = message.score || 0;

        // Weighted average of relevance and recency
        const combinedScore =
          originalScore * (1 - options.recencyWeight!) +
          recencyScore * options.recencyWeight!;

        return {
          ...message,
          score: combinedScore,
        };
      });

      // Re-sort by combined score
      messages.sort((a, b) => (b.score || 0) - (a.score || 0));
    }

    // Apply relevance threshold if specified
    if (options.relevanceThreshold && options.relevanceThreshold > 0) {
      messages = messages.filter(
        (message) => (message.score || 0) >= (options.relevanceThreshold || 0),
      );
    }

    // Limit to window size after all filtering
    messages = messages.slice(0, windowSize);

    // Get segment information if this is a segment-specific context window
    let segmentInfo;
    if (segmentId) {
      const segments = await this.storage.getSegments(userId, conversationId);
      const segment = segments.find((s) => s.segmentId === segmentId);
      if (segment) {
        segmentInfo = {
          id: segment.segmentId,
          topic: segment.segmentTopic,
        };
      }
    }

    // Calculate token count if maxTokens is specified
    // This is a simple approximation assuming 1 token per 4 characters
    let tokenCount;
    if (options.maxTokens) {
      const totalContent = messages.reduce((content, message) => {
        return content + message.message;
      }, '');
      tokenCount = Math.ceil(totalContent.length / 4);
    }

    // If token count exceeds the max, truncate messages
    if (tokenCount && options.maxTokens && tokenCount > options.maxTokens) {
      // Sort by importance (keeping most recent and most relevant)
      const sortedByImportance = [...messages].sort((a, b) => {
        const scoreA = (a.score || 0) + a.timestamp / Date.now();
        const scoreB = (b.score || 0) + b.timestamp / Date.now();
        return scoreB - scoreA;
      });

      // Keep messages until we reach the token limit
      let currentTokens = 0;
      const keptMessages: ConversationMessage[] = [];
      for (const message of sortedByImportance) {
        const messageTokens = Math.ceil(message.message.length / 4);

        if (currentTokens + messageTokens <= options.maxTokens) {
          keptMessages.push(message);
          currentTokens += messageTokens;
        }
      }

      // Restore original order
      messages = messages.filter((msg) => keptMessages.includes(msg));
      tokenCount = currentTokens;
    }

    return {
      messages,
      segmentInfo,
      tokenCount,
    };
  }

  async generateContextSummary(
    userId: string,
    conversationId: string,
    segmentId?: string,
  ): Promise<string> {
    // If segment ID not provided, get current segment
    if (!segmentId) {
      segmentId = await this.getCurrentSegmentId(userId, conversationId);
    }

    // Get the segment messages
    const messages = await this.storage.getMessages(userId, conversationId, {
      segmentId,
      limit: 50, // Reasonable number of messages to summarize
    });

    if (messages.length === 0) {
      return 'No conversation history available.';
    }

    // Get segments
    const segments = await this.storage.getSegments(userId, conversationId);
    const segment = segments.find((s) => s.segmentId === segmentId);

    const messageCount = messages.length;
    const topic = segment?.segmentTopic || 'Unspecified topic';
    const firstTimestamp = new Date(
      segment?.firstTimestamp || Date.now(),
    ).toLocaleString();

    return `This conversation segment "${topic}" contains ${messageCount} messages starting from ${firstTimestamp}.`;
  }

  async deleteConversation(
    userId: string,
    conversationId: string,
  ): Promise<number> {
    return this.storage.deleteConversation(userId, conversationId);
  }
}

/**
 * Run the example
 */
async function runExample() {
  try {
    console.log('Context Window Mock Example - Starting');

    // Create a logger
    const logger: Logger = new ConsoleLogger();

    // Create mock storage and context service
    const storage = new MockConversationStorage(logger);
    const contextService = new ContextWindowService(storage, logger);

    // Create test user and conversation
    const userId = `test-user-${uuidv4().substring(0, 8)}`;
    const conversationId = `conv-${uuidv4().substring(0, 8)}`;

    console.log(`Created test user: ${userId}`);
    console.log(`Created conversation: ${conversationId}`);

    // Store conversation turns with different agent IDs and segment topics
    await storeTestConversation(userId, conversationId, contextService);

    // Demonstrate different context window scenarios
    await demonstrateContextWindows(userId, conversationId, contextService);

    // Clean up test data
    const deletedTurns = await contextService.deleteConversation(
      userId,
      conversationId,
    );
    console.log(
      `Cleaned up test data: deleted ${deletedTurns} conversation turns`,
    );

    console.log('Context Window Mock Example - Complete');
  } catch (error) {
    console.error('Error running example:', error);
  }
}

/**
 * Store a test conversation with multiple segments and agents
 */
async function storeTestConversation(
  userId: string,
  conversationId: string,
  contextService: ContextWindowService,
) {
  console.log(
    'Creating test conversation with multiple segments and agents...',
  );

  // First segment: General inquiry (agent: customer-service-agent)
  console.log('- Creating "General Inquiry" segment');

  await contextService.storeConversationTurn(
    userId,
    conversationId,
    'Hi, I need help with my recent order.',
    'user',
    {
      segmentId: 'segment-general',
      segmentTopic: 'General Inquiry',
      isSegmentStart: true,
    },
  );

  await contextService.storeConversationTurn(
    userId,
    conversationId,
    "I'd be happy to help with your order. Could you provide your order number?",
    'assistant',
    {
      segmentId: 'segment-general',
      agentId: 'customer-service-agent',
      agentName: 'Customer Service',
      capability: 'order-management',
    },
  );

  await contextService.storeConversationTurn(
    userId,
    conversationId,
    'My order number is ABC123456.',
    'user',
    {
      segmentId: 'segment-general',
    },
  );

  // Second segment: Technical issue (agent: technical-support-agent)
  console.log('- Creating "Technical Support" segment');

  await contextService.storeConversationTurn(
    userId,
    conversationId,
    "I'm having a problem with the product. It won't turn on.",
    'user',
    {
      segmentId: 'segment-technical',
      segmentTopic: 'Technical Support',
      isSegmentStart: true,
    },
  );

  await contextService.storeConversationTurn(
    userId,
    conversationId,
    "I'm sorry to hear that. Let's troubleshoot the issue. Have you tried charging it for at least 30 minutes?",
    'assistant',
    {
      segmentId: 'segment-technical',
      agentId: 'technical-support-agent',
      agentName: 'Technical Support',
      capability: 'troubleshooting',
    },
  );

  await contextService.storeConversationTurn(
    userId,
    conversationId,
    "Yes, I've charged it overnight but it still won't turn on.",
    'user',
    {
      segmentId: 'segment-technical',
    },
  );

  // Third segment: Warranty claim (agent: warranty-agent)
  console.log('- Creating "Warranty Claim" segment');

  await contextService.storeConversationTurn(
    userId,
    conversationId,
    'I think the product might be defective. How do I make a warranty claim?',
    'user',
    {
      segmentId: 'segment-warranty',
      segmentTopic: 'Warranty Claim',
      isSegmentStart: true,
    },
  );

  await contextService.storeConversationTurn(
    userId,
    conversationId,
    'I understand your frustration. Since this is still under warranty, I can help you process a replacement. Please provide your shipping address.',
    'assistant',
    {
      segmentId: 'segment-warranty',
      agentId: 'warranty-agent',
      agentName: 'Warranty Services',
      capability: 'warranty-processing',
    },
  );

  await contextService.storeConversationTurn(
    userId,
    conversationId,
    'My address is 123 Main St, Anytown, CA 12345.',
    'user',
    {
      segmentId: 'segment-warranty',
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
  contextService: ContextWindowService,
) {
  console.log('\nDemonstrating different context window scenarios:');

  // Scenario 1: Get context window for technical support agent
  console.log('\n1. Context window for technical support agent:');
  const technicalContext = await contextService.createContextWindow(
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
      `- ${message.role}: "${message.message.substring(0, 50)}..." (Agent: ${message.agentId || 'User'})`,
    );
  }

  // Scenario 2: Get segment-specific context window
  console.log('\n2. Segment-specific context window for warranty claims:');
  const warrantyMessages = await contextService.getConversationHistory(
    userId,
    conversationId,
    10,
    { segmentId: 'segment-warranty' },
  );

  console.log(
    `Retrieved ${warrantyMessages.length} messages from warranty segment`,
  );
  const segments = await contextService.getConversationSegments(
    userId,
    conversationId,
  );
  const warrantySegment = segments.find(
    (s) => s.segmentId === 'segment-warranty',
  );
  console.log(`Segment info: ${warrantySegment?.segmentTopic || 'N/A'}`);

  for (const message of warrantyMessages) {
    console.log(`- ${message.role}: "${message.message.substring(0, 50)}..."`);
  }

  // Scenario 3: Capability-based filtering
  console.log('\n3. Capability-based context filtering:');
  const capabilityContext = await contextService.createContextWindow(
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
      `- ${message.role}: "${message.message.substring(0, 50)}..." (Capability: ${message.capability || 'N/A'})`,
    );
  }

  // Scenario 4: Relevance-based context with recency weighting
  console.log('\n4. Relevance-based context with recency weighting:');
  const queryEmbedding = await mockEmbeddingService.generateEmbedding(
    'warranty replacement shipping',
  );

  const relevanceContext = await contextService.createContextWindow(
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
      `- ${message.role}: "${message.message.substring(0, 50)}..." (Score: ${message.score?.toFixed(3) || 'N/A'})`,
    );
  }

  // Scenario 5: Generate context summary
  console.log('\n5. Generate segment summary:');
  const summary = await contextService.generateContextSummary(
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
