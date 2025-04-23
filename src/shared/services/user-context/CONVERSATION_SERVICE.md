# Enhanced Conversation Context Service

## Overview

The Enhanced Conversation Context Service provides advanced functionality for managing, storing, retrieving, and analyzing conversation history in AI applications. It is designed to support complex agent interactions, conversation segmentation, and contextual awareness in multi-turn dialogues.

## Key Features

- **Conversation History Management**: Store and retrieve conversation turns with rich metadata
- **Conversation Segmentation**: Automatically detect topic changes and segment conversations
- **Retention Policies**: Apply different retention periods to conversation data
- **Agent-Specific Context**: Filter and retrieve agent-specific conversation history
- **Context Windows**: Generate optimized context windows for different agent needs
- **Conversation Analytics**: Analyze conversation patterns, topics, and quality
- **Relevance-Based Retrieval**: Sort and retrieve conversation turns by relevance

## Components

The enhanced conversation management consists of these core components:

1. **ConversationContextService**: Fundamental storage and retrieval of conversation turns
2. **ConversationIndexingService**: Optimized indexing for faster retrieval and complex queries
3. **ConversationAnalyticsService**: Analytics capabilities for conversation data
4. **UserContextFacade**: Unified interface that provides access to all conversation features

## Usage

### Storing Conversation Turns

```typescript
import { UserContextFacade } from '../shared/services/user-context/user-context.facade';

// Initialize the service
const userContextFacade = new UserContextFacade();
await userContextFacade.initialize();

// Store a basic conversation turn
const turnId = await userContextFacade.storeConversationTurn(
  userId,
  conversationId,
  message,
  embeddings,
  'user', // or 'assistant', 'system'
);

// Store a turn with additional metadata
const turnIdWithMetadata = await userContextFacade.storeConversationTurn(
  userId,
  conversationId,
  message,
  embeddings,
  'assistant',
  `turn-${Date.now()}`, // Custom turn ID (optional)
  {
    timestamp: Date.now(),
    agentId: 'research-agent',
    agentName: 'Research Assistant',
    capability: 'information-retrieval',
    retentionPolicy: 'extended', // 'standard', 'extended', or 'permanent'
    isHighValue: true,
    segmentId: 'topic-123',
    segmentTopic: 'TypeScript Development',
    isSegmentStart: false, // Set to true to start a new topic segment
  }
);

// Store an agent-specific turn with the specialized method
const agentTurnId = await userContextFacade.storeAgentConversationTurn(
  userId,
  conversationId,
  message,
  embeddings,
  'assistant',
  {
    agentId: 'code-agent',
    agentName: 'Code Assistant',
    capability: 'code-generation',
    retentionPolicy: 'extended',
  }
);
```

### Retrieving Conversation History

```typescript
// Basic conversation history retrieval
const history = await userContextFacade.getConversationHistory(
  userId,
  conversationId,
  20 // limit
);

// Conversation history with filters
const filteredHistory = await userContextFacade.getConversationHistory(
  userId,
  conversationId,
  10, // limit
  {
    beforeTimestamp: Date.now(), // Only get turns before this time
    afterTimestamp: Date.now() - 24 * 60 * 60 * 1000, // Only get turns after this time (last 24 hours)
    segmentId: 'segment-123', // Only get turns from a specific segment
    agentId: 'research-agent', // Only get turns from a specific agent
    role: 'user', // Only get user turns
    includeMetadata: true, // Include metadata in the results
  }
);

// Search conversations by relevance
const relevantTurns = await userContextFacade.searchConversations(
  userId,
  queryEmbedding, // Vector embedding of the query
  {
    conversationIds: ['conv-123', 'conv-456'], // Optional: limit to specific conversations
    role: 'assistant', // Optional: filter by role
    minRelevanceScore: 0.7, // Only return turns with relevance score >= 0.7
    maxResults: 5, // Maximum number of results to return
    timeRangeStart: Date.now() - 7 * 24 * 60 * 60 * 1000, // Last week
    timeRangeEnd: Date.now(),
  }
);
```

### Using Conversation Segments

```typescript
// List all segments in a conversation
const segments = await userContextFacade.getConversationSegments(
  userId,
  conversationId
);

// Get conversation history for a specific segment
const segmentHistory = await userContextFacade.getConversationHistory(
  userId,
  conversationId,
  50,
  { segmentId: segments[0].segmentId }
);

// Create a new segment
const turnId = await userContextFacade.storeConversationTurn(
  userId,
  conversationId,
  "Let's switch to a new topic. Tell me about Docker containers.",
  embeddings,
  'user',
  `turn-${Date.now()}`,
  {
    isSegmentStart: true,
    segmentTopic: 'Docker Containers',
  }
);
```

### Managing Retention Policies

```typescript
// Update retention policy for an entire conversation
const updatedTurns = await userContextFacade.updateRetentionPolicy(
  userId,
  conversationId,
  'permanent', // 'standard' (30 days), 'extended' (90 days), 'permanent' (no deletion)
);

// Update retention policy for specific turns
const updatedSpecificTurns = await userContextFacade.updateRetentionPolicy(
  userId,
  conversationId,
  'extended',
  {
    turnIds: ['turn-123', 'turn-456'],
    retentionPriority: 8, // Priority scale 1-10
    retentionTags: ['important', 'reference'],
    isHighValue: true,
  }
);

// Delete a conversation and all its turns
const deletedTurnCount = await userContextFacade.deleteConversation(
  userId,
  conversationId
);
```

### Creating Context Windows

Context windows provide optimized subsets of conversation history for specific agent needs:

```typescript
const contextWindow = await userContextFacade.createContextWindow(
  userId,
  conversationId,
  {
    windowSize: 10, // Number of turns to include
    includeCurrentSegmentOnly: true, // Only include turns from the current segment
    includeAgentIds: ['research-agent', 'code-agent'], // Include turns from these agents
    excludeAgentIds: ['test-agent'], // Exclude turns from these agents
    relevanceThreshold: 0.5, // Only include turns with relevance score >= 0.5
    relevanceQuery: "How do I use TypeScript interfaces?", // Calculate relevance based on this query
    relevanceEmbedding: queryEmbedding, // Or provide an embedding directly
    recencyWeight: 0.3, // Weight of recency vs. relevance (0-1)
    filterByCapabilities: ['information-retrieval'], // Only include turns from agents with these capabilities
    maxTokens: 2000, // Limit the total token count
    includeTurnMetadata: true, // Include metadata in the results
  }
);

// The result includes:
// - messages: Array of conversation turns
// - contextSummary: Optional summary of the context
// - segmentInfo: Information about the segment
// - tokenCount: Approximate token count
```

### Conversation Analytics

```typescript
// Import the analytics service directly
import { ConversationAnalyticsService } from '../shared/services/user-context/conversation-analytics.service';

// Create and initialize the service
const analyticsService = new ConversationAnalyticsService({
  conversationService: userContextFacade.conversationContextService,
  logger: logger
});

// Generate comprehensive analytics
const analytics = await analyticsService.generateAnalytics(
  userId,
  {
    forceRefresh: false, // Use cached results if available
    timeframe: {
      startTime: Date.now() - 30 * 24 * 60 * 60 * 1000, // Last 30 days
      endTime: Date.now()
    },
    includeUsageStatistics: true,
    includeTopicAnalysis: true,
    includeSentimentAnalysis: true,
    includeAgentPerformance: true,
    includeQualityMetrics: true,
    includeSegmentAnalytics: true
  }
);

// The analytics result includes:
// - usageStatistics: Overall usage metrics and trends
// - topicAnalysis: Topic distribution and trends
// - sentimentAnalysis: Sentiment scores and trends
// - agentPerformance: Performance metrics by agent
// - qualityMetrics: Conversation quality metrics
// - segmentAnalytics: Segment distribution and analysis
```

### Conversation Indexing for Faster Retrieval

```typescript
// Import the indexing service directly
import { ConversationIndexingService } from '../shared/services/user-context/conversation-indexing.service';

// Create and initialize the service
const indexingService = new ConversationIndexingService({
  conversationService: userContextFacade.conversationContextService,
  logger: logger,
  config: {
    enableMetadataIndexing: true,
    enableContentIndexing: true,
    enableHybridSearch: true,
    chunkSize: 1000, // Characters per chunk
    chunkOverlap: 200, // Overlap between chunks
  }
});
await indexingService.initialize();

// Create a specialized index for a user's conversations
const indexMetadata = await indexingService.createIndex(
  userId,
  {
    conversationIds: ['conv-123', 'conv-456'], // Optional: limit to specific conversations
    timeRange: {
      start: Date.now() - 30 * 24 * 60 * 60 * 1000, // Last 30 days
      end: Date.now()
    },
    indexName: 'my-specialized-index' // Optional custom name
  }
);

// Search the index
const searchResults = await indexingService.search(
  userId,
  "TypeScript interfaces with generics",
  {
    conversationIds: ['conv-123'], // Optional: limit to specific conversations
    agentIds: ['code-agent'], // Optional: filter by agent
    segmentIds: ['segment-123'], // Optional: filter by segment
    limit: 5, // Maximum number of results
    minScore: 0.7, // Minimum relevance score
    includeMetadata: true, // Include metadata in results
    filterOptions: { // Additional filters
      role: 'assistant'
    }
  }
);

// Update the index with new conversations
await indexingService.updateIndex(
  indexMetadata.indexId,
  {
    addConversations: ['conv-789'],
    removeConversations: ['conv-123']
  }
);

// Delete the index when no longer needed
indexingService.deleteIndex(indexMetadata.indexId);
```

## Integration with History-Aware Supervisor

The Enhanced Conversation Service integrates with the History-Aware Supervisor to enable context-aware coordination between agents:

```typescript
import { HistoryAwareSupervisor } from '../langgraph/core/workflows/history-aware-supervisor';
import { UserContextFacade } from '../shared/services/user-context/user-context.facade';

// Initialize the UserContextFacade
const userContextFacade = new UserContextFacade({
  logger,
  pineconeService
});
await userContextFacade.initialize();

// Create the History-Aware Supervisor
const supervisor = new HistoryAwareSupervisor({
  userContextFacade,
  logger,
  userId,
  conversationId,
  historyLimit: 10,
  includeMetadata: true,
  llmConnector: languageModelProvider,
  useRelevanceRanking: true,
  includeAnalytics: true,
  summarizeHistory: true,
  maxHistoryTokens: 2000,
  agentContextFilters: {
    includeAgentIds: ['research-agent', 'code-agent'],
    excludeAgentIds: ['test-agent']
  }
});

// Register agents with the supervisor
supervisor.registerAgent(assistantAgent);
supervisor.registerAgent(researchAgent);

// Execute a query with history awareness
const result = await supervisor.executeWithHistory(
  userInput,
  {
    userId,
    conversationId,
    historyLimit: 5,
    includeMetadata: true
  }
);

// The result includes:
// - finalResponse: The final response to the user
// - tasks: The tasks that were executed
// - metrics: Execution metrics
// - agentsInvolved: The agents that were involved
// - primaryAgent: The primary agent that handled the request
// - createNewSegment: Whether a new segment was created
// - segmentTitle: The title of the new segment
// - segmentSummary: A summary of the new segment
```

## Best Practices

1. **Use Appropriate Retention Policies**: Apply permanent retention only to critical conversations.
2. **Include Rich Metadata**: The more metadata you include, the more powerful your filtering and retrieval capabilities.
3. **Handle Topic Changes**: Set `isSegmentStart: true` when detecting a topic change to improve context relevance.
4. **Optimize Context Windows**: Use context windows instead of raw history for better agent performance.
5. **Include Agent Information**: Always specify agent IDs and capabilities for better analysis and retrieval.
6. **Consider Indexing**: For large conversation datasets, use the ConversationIndexingService for faster retrieval.
7. **Add Embeddings**: Always provide embeddings for messages to enable semantic search and relevance-based retrieval.

## Error Handling

The conversation services include robust error handling with retries for transient issues:

```typescript
try {
  const result = await userContextFacade.getConversationHistory(userId, conversationId);
  // Handle successful result
} catch (error) {
  if (error instanceof UserContextValidationError) {
    // Handle validation errors (e.g., invalid parameters)
  } else if (error instanceof StorageOperationError) {
    // Handle storage-related errors
  } else {
    // Handle other errors
  }
}
```

## Threading and Concurrency

The Enhanced Conversation Service is designed to handle concurrent requests safely. However, be aware of potential race conditions when:

1. Multiple processes update the same conversation simultaneously
2. Reading conversation history while it's being updated
3. Creating and updating indexes concurrently

## Performance Considerations

- Use appropriate limits when retrieving conversation history
- Consider using the indexing service for large conversation datasets
- Apply filters at query time rather than filtering in memory when possible
- Use context windows to optimize token usage with large language models

## Migrating from Basic Conversation Service

If you're migrating from the basic conversation service to the enhanced version:

1. Replace direct `ConversationContextService` usage with `UserContextFacade`
2. Update your code to use the new metadata parameters
3. Consider using segmentation for better context management
4. Update retention policies for compliance with your data requirements
5. Consider using analytics and indexing for improved insights and performance 