# History-Aware Supervisor

## Overview

The History-Aware Supervisor is an enhanced extension of the standard Supervisor Workflow that integrates conversation history awareness and analytics capabilities. It provides a robust solution for building contextually aware AI agent workflows that can maintain conversation continuity across multiple interactions.

## Key Features

- **Conversation History Integration**: Automatically retrieves and incorporates relevant conversation history into agent workflows.
- **Context-Aware Decision Making**: Uses historical context to make better agent selection and task delegation decisions.
- **Topic Change Detection**: Automatically identifies when a user changes topics and creates appropriate conversation segments.
- **Relevance Ranking**: Prioritizes the most relevant parts of conversation history for each new query.
- **Agent-Specific Context Filtering**: Can tailor the historical context provided to each agent based on its role and capabilities.
- **Seamless User Context Integration**: Works with the UserContextFacade to provide a unified approach to managing user context.
- **Robust Error Handling**: Gracefully handles failures in context retrieval and continues execution with degraded capabilities.

## Architecture

The History-Aware Supervisor extends the base SupervisorWorkflow with additional components:

1. **ConversationContextService**: Manages conversation history storage and retrieval
2. **ConversationAnalyticsService**: Analyzes conversation data for insights 
3. **Context Enrichment**: Augments execution state with relevant historical context
4. **Agent Registry**: Manages relationships between specialized agents
5. **Topic Detection**: Identifies conversation topic changes
6. **Segment Management**: Creates and manages conversation segments for better organization

## Usage

### Basic Setup

```typescript
// Initialize required services
const userContextFacade = new UserContextFacade({
  logger: new ConsoleLogger()
});

// Create specialized agents
const knowledgeAgent = new KnowledgeRetrievalAgent({/*...*/});
const planningAgent = new PlanningAgent({/*...*/});
const contentAgent = new ContentGenerationAgent({/*...*/});

// Create and configure the History-Aware Supervisor
const historyAwareSupervisor = new HistoryAwareSupervisor({
  userContextFacade,
  userId: 'user-123',
  conversationId: 'conversation-456',
  historyLimit: 10,
  includeMetadata: true,
  llmConnector: openAIConnector
});

// Register agents with the supervisor
historyAwareSupervisor.registerAgent(knowledgeAgent);
historyAwareSupervisor.registerAgent(planningAgent);
historyAwareSupervisor.registerAgent(contentAgent);

// Define agent dependencies
historyAwareSupervisor.addAgentDependency('content', 'knowledge');
historyAwareSupervisor.addAgentDependency('planner', 'knowledge');
```

### Executing With History Awareness

```typescript
// Execute a query with history awareness
const result = await historyAwareSupervisor.executeWithHistory(
  "How do those benefits specifically help with large-scale applications?",
  {
    userId: 'user-123',
    conversationId: 'conversation-456'
  }
);

// Result will include:
// - finalResponse: The final response to return to the user
// - tasks: The tasks that were executed
// - agentsInvolved: Which agents participated in responding
// - primaryAgent: The primary agent that handled the request
// - metrics: Performance metrics for the execution
// - createNewSegment: Whether this was detected as a topic change
// - segmentTitle/segmentSummary: If a new segment was created, its metadata
```

### Configuration Options

```typescript
const historyAwareSupervisor = new HistoryAwareSupervisor({
  // Required components
  userContextFacade: userContextFacade,
  llmConnector: llmConnector,
  
  // User and conversation identifiers
  userId: 'user-123', 
  conversationId: 'conversation-456',
  
  // History retrieval options
  historyLimit: 20,            // Maximum number of history items to retrieve
  includeMetadata: true,       // Whether to include metadata in history
  useRelevanceRanking: true,   // Use semantic relevance to rank history
  
  // Advanced configuration
  summarizeHistory: true,      // Generate summaries of longer conversations
  maxHistoryTokens: 4000,      // Maximum tokens for history context
  
  // Agent filtering options
  agentContextFilters: {
    includeAgentIds: ['agent1', 'agent2'],  // Only include history from these agents
    excludeAgentIds: ['agent3']             // Exclude history from these agents
  },
  
  // Logging and error handling
  logger: customLogger
});
```

## Example Implementation

See the full example implementation in `src/examples/history-aware-workflow.ts` which demonstrates:

1. Setting up the History-Aware Supervisor with appropriate services
2. Configuring specialized agents for different capabilities
3. Handling initial queries with no prior history
4. Processing follow-up questions that reference previous context
5. Detecting and managing topic changes
6. Storing conversation turns for future reference

## Integration with User Context

The History-Aware Supervisor integrates seamlessly with the User Context system:

- Uses `UserContextFacade` to retrieve conversation history
- Stores conversation turns with appropriate metadata
- Creates conversation segments for topic organization
- Leverages vector search for relevant context retrieval
- Maintains conversation continuity across multiple turns

## Advanced Features

### Topic Change Detection

The supervisor automatically detects when a user changes topics and can create new conversation segments accordingly:

```typescript
if (result.createNewSegment) {
  console.log(`New topic detected: ${result.segmentTitle}`);
  console.log(`Summary: ${result.segmentSummary}`);
}
```

### Agent Selection Based on History

The supervisor analyzes conversation history to select the most appropriate agents for each query, prioritizing agents that have previously handled similar requests successfully.

### Context Window Management

For lengthy conversations, the supervisor manages token limits by:
- Summarizing older parts of the conversation
- Prioritizing the most relevant context
- Removing redundant information
- Focusing on the most recent and relevant turns

## Key Benefits

1. **Improved Continuity**: Maintains context across conversation turns for natural dialogue
2. **Better Agent Selection**: Makes more informed decisions about which agents to use
3. **Efficient Execution**: Focuses computational resources on the most relevant history
4. **Topic Organization**: Keeps conversations organized by topic for easier reference
5. **Transparent Metrics**: Provides detailed execution metrics for monitoring and optimization

## Implementation Details

The History-Aware Supervisor implementation can be found at:
`src/langgraph/core/workflows/history-aware-supervisor.ts` 