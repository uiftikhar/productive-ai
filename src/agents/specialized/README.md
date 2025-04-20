# Specialized Agents

This directory contains specialized agent implementations that extend the base `UnifiedAgent` class.

## MeetingAnalysisAgent

The `MeetingAnalysisAgent` is a specialized agent for analyzing meeting transcripts. It extracts key information such as action items, decisions, topics, and questions from meeting transcripts.

### Capabilities

- `analyze-transcript-chunk`: Analyze a chunk of a meeting transcript to extract key information
- `generate-final-analysis`: Generate a comprehensive analysis from partial analyses of transcript chunks
- `extract-action-items`: Extract action items and their owners from a meeting transcript
- `extract-topics`: Extract main topics discussed in a meeting
- `extract-decisions`: Extract decisions made during a meeting

### Retrieval-Augmented Generation (RAG)

The agent uses true RAG functionality to enhance meeting analysis with relevant context:

1. **Embedding Generation**: Uses the standardized `IEmbeddingService` from `EmbeddingServiceFactory` to generate embeddings for input text
2. **Context Retrieval**: Retrieves relevant meeting content from vector storage based on semantic similarity
3. **Context Storage**: Stores analysis results with proper embeddings for future reference
4. **Contextual Analysis**: Enhances analysis by incorporating related content from previous meetings

The agent automatically selects appropriate context types based on the capability:
- For `analyze-transcript-chunk`: Focuses on meeting context
- For `generate-final-analysis`: Includes decisions and action items from related meetings
- For extraction capabilities: Retrieves similar extracted content for consistency

### Integration with RagPromptManager

The agent uses the `RagPromptManager` service and standardized instruction templates from the Productive AI prompt system. This integration provides:

1. Consistent prompt formatting across the application
2. Standardized output formats (JSON objects with specific structures)
3. Template reuse and maintenance
4. Enhanced analysis through retrieval-augmented generation

### Usage Example

```typescript
import { getDefaultAgentFactory } from '../factories/agent-factory';

// Create the agent using the factory (recommended)
const factory = getDefaultAgentFactory();
const meetingAnalysisAgent = factory.createMeetingAnalysisAgent({
  id: 'meeting-analysis-agent-1',
  // Optional customization
  name: 'Meeting Analysis Agent',
  description: 'Analyzes meeting transcripts with RAG capabilities'
});

// Initialize the agent
await meetingAnalysisAgent.initialize();

// Process a transcript chunk with RAG
const chunkResult = await meetingAnalysisAgent.execute({
  input: transcriptChunk,
  capability: 'analyze-transcript-chunk',
  parameters: {
    userId: 'user123',
    meetingId: 'meeting123',
    meetingTitle: 'Weekly Planning Meeting',
    chunkIndex: 0,
    totalChunks: 3,
    // Enable context storage
    storeInContext: true,
    // Optional: Include specific document IDs in retrieval
    documentIds: ['prev-meeting-1', 'prev-meeting-2']
  }
});

// Generate a final analysis from multiple chunks using RAG
const finalAnalysis = await meetingAnalysisAgent.execute({
  input: combinedChunkResults,
  capability: 'generate-final-analysis',
  parameters: {
    userId: 'user123',
    meetingId: 'meeting123',
    meetingTitle: 'Weekly Planning Meeting',
    // Determine whether to include historical data
    includeHistorical: true
  }
});

// Extract specific information with RAG
const actionItems = await meetingAnalysisAgent.extractSpecificInformation(
  transcript,
  'action-items',
  { 
    userId: 'user123', 
    meetingId: 'meeting123'
  }
);
```

### Workflow Integration

This agent is designed to be used with the `StandardizedMeetingAnalysisAdapter`, which creates a LangGraph workflow to process large meeting transcripts by:

1. Splitting the transcript into manageable chunks
2. Processing each chunk through the agent with RAG-enhanced context
3. Combining the results into a final comprehensive analysis
4. Storing results for future reference and knowledge building

## Other Specialized Agents

Other specialized agents in this directory include:

- `DecisionTrackingAgent`: Tracks decisions across meetings
- `KnowledgeRetrievalAgent`: Retrieves relevant knowledge from a knowledge base
- `RetrievalAgent`: General purpose retrieval for various content types 