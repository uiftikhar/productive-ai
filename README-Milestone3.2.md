# Milestone 3.2: Conversation History Retrieval

This milestone focuses on implementing enhanced conversation history retrieval capabilities for better agent-specific context management.

## Key Features Implemented

### 1. Agent-Specific History Filters

The `getConversationHistory` method now supports comprehensive filtering options:

- `agentId` - Filter messages by specific agent
- `role` - Filter by message role (user/assistant/system)
- `segmentId` - Filter by conversation segment
- Time-based filtering with `beforeTimestamp` and `afterTimestamp`

Example usage:

```typescript
const agentSpecificHistory = await conversationService.getConversationHistory(
  userId,
  conversationId,
  10,  // limit
  { 
    agentId: 'technical-support-agent',
    afterTimestamp: Date.now() - (24 * 60 * 60 * 1000)  // last 24 hours
  }
);
```

### 2. Chronological and Relevance-Based Sorting

The conversation history can now be sorted in two ways:

- **Chronological sorting** (default) - Messages sorted by timestamp
- **Relevance-based sorting** - Messages sorted by semantic similarity to a query

Example usage:

```typescript
// Chronological sorting
const chronologicalHistory = await conversationService.getConversationHistory(
  userId,
  conversationId,
  20,
  { sortBy: 'chronological' }
);

// Relevance-based sorting
const relevanceHistory = await conversationService.getConversationHistory(
  userId,
  conversationId,
  20,
  { 
    sortBy: 'relevance',
    relevanceEmbedding: queryEmbedding  // vector embedding of query
  }
);
```

### 3. Context Windows for Different Agent Needs

A new `createContextWindow` method creates tailored conversation history views for different agent requirements. Features include:

- Configurable window size
- Agent inclusion/exclusion filters
- Relevance thresholds
- Recency weighting (combined with relevance)
- Token limitations with smart truncation
- Capability-based filtering

Example usage:

```typescript
const contextWindow = await conversationService.createContextWindow(
  userId,
  conversationId,
  {
    windowSize: 10,
    includeAgentIds: ['customer-service-agent'],
    excludeAgentIds: ['sales-agent'],
    relevanceThreshold: 0.7,
    relevanceEmbedding: queryEmbedding,
    recencyWeight: 0.3,
    filterByCapabilities: ['order-management'],
    maxTokens: 2000
  }
);
```

### 4. Context Summarization

A new `generateContextSummary` method provides summaries of conversation segments for agents:

```typescript
const summary = await conversationService.generateContextSummary(
  userId,
  conversationId,
  segmentId
);
```

## Examples

Two example implementations demonstrate these features:

### 1. Real Implementation Example

The real implementation with Pinecone storage is available in:

```
src/agents/examples/context-window-example.ts
```

Run with:

```bash
npx ts-node src/agents/examples/context-window-example.ts
```

**Note**: This requires a valid Pinecone connection to work properly.

### 2. Mock Implementation Example

A mock implementation using in-memory storage for testing is available in:

```
src/agents/examples/context-window-mock-example.ts
```

Run with:

```bash
npx ts-node src/agents/examples/context-window-mock-example.ts
```

The mock example demonstrates all the same capabilities as the real implementation but doesn't require any external services. This is useful for:

- Testing context window functionality without external dependencies
- Running quick demos of the new capabilities
- Unit testing the context window logic

The mock implementation includes:
- In-memory conversation storage
- Mock embedding service with deterministic outputs
- Full context window capability with agent filtering
- Segment management and capability-based filtering
- Relevance-based search with recency weighting

Sample output from the mock example:

```
Retrieved 1 messages for technical support agent
- assistant: "I'm sorry to hear that. Let's troubleshoot the iss..." (Agent: technical-support-agent)

Retrieved 3 messages from warranty segment
Segment info: Warranty Claim
- user: "I think the product might be defective. How do I m..."
- assistant: "I understand your frustration. Since this is still..."
- user: "My address is 123 Main St, Anytown, CA 12345...."

Retrieved 1 messages related to warranty processing capability
- assistant: "I understand your frustration. Since this is still..." (Capability: warranty-processing)
```

## Integration with LangGraph

These enhanced retrieval capabilities integrate with LangGraph workflows by:

1. Allowing agents to retrieve only the conversation history relevant to their task
2. Supporting more efficient context management with tailored context windows
3. Enabling semantic search for knowledge retrieval agents
4. Providing context summarization for history compression

## Next Steps

- Add support for cross-conversation context windows
- Implement real LLM-based summarization
- Add memory selection strategies (key point extraction)

## Summary of Milestone Achievements

Milestone 3.2 has successfully delivered a comprehensive enhancement to the conversation history retrieval capabilities, addressing several key requirements for agent-specific context management:

1. **Advanced Filtering**: The system now supports a wide range of filtering options, allowing agents to retrieve only the conversation history that is relevant to their specific needs.

2. **Multi-dimensional Sorting**: With both chronological and relevance-based sorting, the system balances temporal context with semantic relevance, ensuring agents get the most valuable conversation history.

3. **Customizable Context Windows**: The new `createContextWindow` method is a powerful abstraction that combines multiple filtering, sorting, and processing capabilities to create agent-optimized views of conversation history.

4. **Context Summarization**: The addition of context summarization addresses the need for compact yet informative context, helping to reduce token usage while maintaining context quality.

5. **Agent and Capability Awareness**: By filtering by agent ID or capability, the system supports specialized agents that need to focus on their particular domain of expertise.

6. **Token Management**: Smart truncation based on importance rather than recency ensures that even with token limitations, the most valuable context is retained.

7. **Recency-Relevance Balancing**: The ability to weight recency against relevance allows fine-tuning how much the system prioritizes recent interactions versus topical relevance.

8. **Testable Implementation**: The development of both real and mock implementations ensures the system can be thoroughly tested and demonstrated without external dependencies.

These enhancements create a robust foundation for context-aware AI agents that can maintain conversational continuity while focusing on their specialized tasks. The improved context management will lead to more coherent, relevant, and efficient agent interactions while reducing unnecessary token usage. 