# Enhanced Conversation Service Quick Start

This guide provides the essential steps to quickly implement the enhanced conversation service in your application.

## Setup

```typescript
import { UserContextFacade } from '../shared/services/user-context/user-context.facade';
import { PineconeConnectionService } from '../pinecone/pinecone-connection.service';
import { ConsoleLogger } from '../shared/logger/console-logger';

// Create dependencies
const logger = new ConsoleLogger();
const pineconeService = new PineconeConnectionService({ logger });

// Initialize the service
const userContextFacade = new UserContextFacade({
  logger,
  pineconeService,
  retryOptions: {
    maxRetries: 3,
    retryDelayMs: 1000
  }
});

// Initialize
await userContextFacade.initialize();
```

## Basic Conversation Flow

```typescript
// Generate unique IDs for your application
const userId = 'user-123';
const conversationId = 'conversation-456';

// Step 1: Store user message
const embeddings = await languageModel.generateEmbedding(userMessage);
const userTurnId = await userContextFacade.storeConversationTurn(
  userId,
  conversationId,
  userMessage,
  embeddings,
  'user'
);

// Step 2: Get conversation history for context
const history = await userContextFacade.getConversationHistory(
  userId,
  conversationId,
  10 // Limit to last 10 turns
);

// Step 3: Generate AI response using history
const aiResponse = await languageModel.generateResponse(history, userMessage);

// Step 4: Store AI response
const responseEmbeddings = await languageModel.generateEmbedding(aiResponse);
const assistantTurnId = await userContextFacade.storeConversationTurn(
  userId,
  conversationId,
  aiResponse,
  responseEmbeddings,
  'assistant'
);
```

## Advanced Features

### Topic Segmentation

```typescript
// Check if this is a new topic
const isNewTopic = detectTopicChange(userMessage, history);
if (isNewTopic) {
  const topicName = generateTopicName(userMessage);
  
  // Store with segment information
  await userContextFacade.storeConversationTurn(
    userId,
    conversationId,
    userMessage,
    embeddings,
    'user',
    `turn-${Date.now()}`,
    {
      isSegmentStart: true,
      segmentTopic: topicName
    }
  );
}
```

### Agent-Specific Context

```typescript
// Store agent-specific turn
await userContextFacade.storeAgentConversationTurn(
  userId,
  conversationId,
  agentResponse,
  embeddings,
  'assistant',
  {
    agentId: 'research-agent',
    agentName: 'Research Assistant',
    capability: 'information-retrieval'
  }
);

// Get history for specific agent
const agentHistory = await userContextFacade.getConversationHistory(
  userId,
  conversationId,
  20,
  { agentId: 'research-agent' }
);
```

### Optimized Context Window

```typescript
// Get optimized context window for an agent
const contextWindow = await userContextFacade.createContextWindow(
  userId,
  conversationId,
  {
    windowSize: 10,
    includeAgentIds: ['code-agent'],
    maxTokens: 2000,
    relevanceQuery: userMessage
  }
);

// Use the optimized context
const optimizedHistory = contextWindow.messages;
const contextSummary = contextWindow.contextSummary;
const segmentInfo = contextWindow.segmentInfo;
```

### Relevance Search

```typescript
// Search for relevant conversation turns
const relevantTurns = await userContextFacade.searchConversations(
  userId,
  embeddings,
  {
    minRelevanceScore: 0.7,
    maxResults: 5
  }
);
```

## Integration with History-Aware Supervisor

```typescript
import { HistoryAwareSupervisor } from '../langgraph/core/workflows/history-aware-supervisor';

// Create supervisor with userContextFacade
const supervisor = new HistoryAwareSupervisor({
  userContextFacade,
  logger,
  userId,
  conversationId,
  historyLimit: 10,
  llmConnector: languageModelProvider
});

// Register agents
supervisor.registerAgent(assistantAgent);
supervisor.registerAgent(researchAgent);

// Execute with history awareness
const result = await supervisor.executeWithHistory(userInput);
```

## Common Issues

1. **Indexing Delay**: After storing turns, Pinecone can take several seconds to index. Add a delay or retry mechanism for immediate search.

2. **Filter Combinations**: Some combinations of filters may not work as expected. Use single strong filters (role, contextType) and filter the rest in memory.

3. **Embeddings Size**: Ensure embeddings are consistently sized (3072 dimensions for standard models).

For full documentation, see [CONVERSATION_SERVICE.md](./CONVERSATION_SERVICE.md) 