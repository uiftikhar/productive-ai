# Agentic Meeting Analysis System Architecture

## Overview

The Agentic Meeting Analysis System is a sophisticated, goal-oriented multi-agent system designed to autonomously analyze meeting transcripts. It leverages LangGraph's agent framework to coordinate a team of specialized agents that collaborate to extract insights, identify action items, track decisions, and generate comprehensive summaries of meetings.

This document details the end-to-end flow from API endpoint to the inner workings of the agent system and back.

## System Architecture

![Agentic Meeting Analysis System Architecture](https://mermaid.ink/img/pako:eNqNVE1vGyEQ_SvIp7aSa6c-9JBDpUqV2qpS1UtPFgvMriMWGBaMo0T57zDgtWOvnfhiMx_vvTczwJUpNGSQe7GpahE11mqBNVTGu60o9v4L7JxvXgqpIKvNo6tKCEVkS_1GYWFZ0LjnXVdUqKCRmNcYSwrpTHQFBb9fmRz93tceGq1a2JOQw5-N8aApHCskJvA72IgKnLcRGm3BcGcTKJMZiUi0lbQSlCkljLAYKdxFI5nTTuJm2jF-XTQOEk35wTkpnkVE-yq12kU0WLUqTdpqShtcQTYfXl4gG4bhFGh28kh-4Mf0TXiCrwQyBKwdJwVtf9fobVy_UY3I9n6v03GRnRyVmEqDJnGnc7LUMcLMPbLb9RpL9G3rcBQ8jB-PoWxNHa3Gj_Bla-p-eEvfgnDu6QvJDSk6yM6cNKwWdUz2cGdKilhSOVdYkxM_JMQqnS5JN6YXDZHMfmUz1r_gKapspZaSkPsvJOvP5__d4XPCcyJFnqKZZNzptCt7Nj86l8jXw1xfDf-Lrj_0FUfI0iFqgXYsxZzPa15JmE3S-eDnuB_U9VNb01Z-V6sPkD_DPkD-rM6v4h_AH9c1Xv1G_QEy6kbhSTckfLYrJ9i4tMTojRWbvyeYD6aURuYj5f4Lm3vzH9zWFUztLj0JdoJLCzNV0X1a2U80nJdI0YFKG_47aXLI7_OZYsZRv5BtZL03z3wQIYdXFjc8mwO_83X_BXQSPj0)

The system is structured as a layered architecture with the following components:

1. **API Layer**: HTTP endpoints that accept requests and return responses
2. **Agent Coordination Layer**: Manages agent collaboration and workflow
3. **Agent Execution Layer**: Individual specialized agents that perform analyses
4. **Shared Memory Layer**: Communication and knowledge storage
5. **Integration Layer**: External services for embeddings, databases, and LLMs

## API Flow

### Entry Points

The system exposes RESTful API endpoints for analyzing meeting transcripts:

1. **POST /api/transcript/analyze**
   - Accepts a transcript and optional context
   - Returns a task ID for tracking progress

2. **GET /api/transcript/status/:meetingId**
   - Accepts a meeting ID
   - Returns the current status and results (if available)

### Controller Implementation

The `TranscriptAnalysisController` manages these endpoints and interfaces with the agentic system:

```typescript
export class TranscriptAnalysisController {
  private agenticSystem: AgenticMeetingAnalysis;
  
  // Singleton implementation...
  
  // Analyze endpoint handler
  public async analyzeTranscript(req: Request, res: Response): Promise<void> {
    // Extract transcript, meetingId, etc.
    // Call agenticSystem.analyzeMeeting()
    // Return task information
  }
  
  // Status endpoint handler
  public async getAnalysisStatus(req: Request, res: Response): Promise<void> {
    // Extract meetingId
    // Call agenticSystem.getAnalysisStatus()
    // Return status and results
  }
}
```

## Core System Components

### AgenticMeetingAnalysis

The main orchestration class that initializes and manages the entire system:

```typescript
const system = new AgenticMeetingAnalysis({
  logger: new ConsoleLogger(),
  useCollaborativeFramework: true,
  enableHumanFeedback: false,
  enableAdvancedFunctionality: true
});

await system.initialize();
```

This class manages:
- System initialization
- Agent registration
- Workflow coordination
- State management
- Communication between agents

### Transcript Analysis Workflow

1. **Request Received**: The API receives a transcript analysis request
2. **Team Formation**: The system assesses the transcript and forms an agent team
3. **Task Assignment**: Specialized tasks are assigned to appropriate agents
4. **Individual Analysis**: Each agent performs specialized analysis
5. **Collaborative Synthesis**: Agents share findings and resolve conflicts
6. **Result Generation**: The coordinator compiles final results
7. **Response Delivery**: Results are made available via the API

## Agent System

### Coordinator Agent

The `AnalysisCoordinatorAgent` is the central orchestrator that:
- Initiates the workflow
- Assigns tasks to specialized agents
- Monitors progress
- Resolves conflicts
- Aggregates results

### Specialized Agents

The system includes the following specialized agents:

1. **SummaryAgent**
   - Creates concise meeting summaries
   - Identifies key themes and topics

2. **ActionItemAgent**
   - Identifies tasks and commitments
   - Extracts assignees, deadlines, and priorities

3. **DecisionTrackingAgent**
   - Identifies decisions made during the meeting
   - Tracks approval status and stakeholders

4. **TopicAnalysisAgent**
   - Segments the meeting into distinct topics
   - Measures time spent on each topic

5. **SentimentAnalysisAgent**
   - Analyzes emotional tone and engagement
   - Identifies points of agreement/disagreement

6. **ParticipantAnalysisAgent**
   - Tracks speaker participation
   - Identifies roles and contributions

Each agent follows the same basic structure:

```typescript
class SpecializedAgent extends BaseMeetingAnalysisAgent {
  // Specialized analysis methods
  async analyzeTranscript(transcript: string): Promise<any> {
    // 1. Process transcript
    // 2. Generate embeddings
    // 3. Execute specialized analysis
    // 4. Return structured data
  }
  
  // Collaboration methods
  async receiveMessage(message: AgentMessage): Promise<void> {
    // Process messages from other agents
  }
}
```

## Collaboration Framework

The agents work together using a collaborative protocol:

### Phases of Collaboration

1. **Individual Analysis**: Each agent works independently
2. **Knowledge Sharing**: Agents publish findings to shared memory
3. **Conflict Detection**: The system identifies contradictions
4. **Conflict Resolution**: Agents work together to resolve differences
5. **Synthesis**: The coordinator combines inputs into a coherent result

### Communication Services

The `CommunicationService` facilitates message passing between agents:

```typescript
// Example of agent communication
await communicationService.sendMessage({
  type: MessageType.FINDINGS,
  sender: this.id,
  recipients: ['coordinator'],
  content: analysisResults,
  timestamp: Date.now(),
});
```

### Shared Memory

The `SharedMemoryService` provides a central knowledge repository:

```typescript
// Storing analysis results
await memoryService.storeAnalysis(
  meetingId,
  'action_items',
  actionItems
);

// Retrieving shared knowledge
const decisions = await memoryService.getAnalysis(
  meetingId,
  'decisions'
);
```

## Advanced Features

### Semantic Chunking

The system uses advanced chunking strategies to process long transcripts:

1. **Content-Aware Segmentation**: The transcript is divided based on semantic boundaries
2. **Importance-Based Processing**: Critical segments receive more thorough analysis
3. **Adaptive Chunk Sizing**: Chunk sizes vary based on content complexity

This is implemented in `adaptive-chunking.ts`:

```typescript
// Content-type detection
export enum TranscriptSegmentType {
  INTRODUCTION = 'introduction',
  MAIN_DISCUSSION = 'main_discussion',
  TOPIC_TRANSITION = 'topic_transition',
  ACTION_ITEMS = 'action_items',
  DECISIONS = 'decisions',
  CONCLUSION = 'conclusion',
  Q_AND_A = 'q_and_a',
  GENERAL = 'general',
}

// Adaptive chunking algorithm
export function chunkTranscriptAdaptively(
  transcript: string,
  config: Partial<AdaptiveChunkingConfig> = {},
): string[] {
  // 1. Identify content segments
  // 2. Process each segment with appropriate chunking parameters
  // 3. Merge small chunks
}
```

### Team Formation

The `TeamFormationService` dynamically selects agents based on meeting characteristics:

```typescript
// Team formation process
await teamFormationService.assessMeetingCharacteristics(
  meetingId,
  transcript
);

const selectedAgents = await teamFormationService.formTeam(
  meetingId,
  transcript,
  availableAgents
);
```

### Adaptation Triggers

The system can adapt its analysis approach based on:
- Transcript content complexity
- Topic detection
- Length and structure
- Previous analysis effectiveness

## Integration Layer

### Language Models

The system communicates with OpenAI's API (or other LLMs) through adapters:

```typescript
// OpenAI communication
const llmResponse = await this.llmConnector.complete({
  messages: [
    { role: 'system', content: this.systemPrompt },
    { role: 'user', content: formattedTask }
  ],
  temperature: 0.3,
  maxTokens: 2000
});
```

### Embedding Services

Transcripts are vectorized using embedding services:

```typescript
// Generating embeddings
const embedding = await embeddingService.generateEmbedding(
  transcriptChunk
);

// Semantic similarity search
const similarChunks = await embeddingService.findSimilarContent(
  query,
  allChunks
);
```

### Vector Storage

The system uses vector databases (Pinecone) for semantic search:

```typescript
// Storing embeddings
await pineconeConnector.upsert(
  indexName,
  vectors,
  metadata
);

// Querying for similar content
const results = await pineconeConnector.query(
  indexName,
  queryVector,
  { topK: 5 }
);
```

## Performance and Monitoring

The system includes performance monitoring:

```typescript
// Recording performance metrics
performanceMonitor.recordMetric(
  'agent_execution_time',
  executionTime,
  { agentType: 'summary' }
);

// Monitoring memory usage
performanceMonitor.recordMemoryUsage();
```

## Error Handling and Resilience

The system employs several strategies for reliability:

1. **Graceful Degradation**: If a specialized agent fails, the system continues with reduced functionality
2. **Retry Mechanisms**: Failed API calls are retried with exponential backoff
3. **Error Logging**: Detailed error information is logged for diagnosis
4. **Timeout Management**: Long-running operations have appropriate timeouts

## Security Considerations

1. **Input Validation**: All API inputs are validated before processing
2. **Rate Limiting**: Endpoints are protected against excessive requests
3. **Authentication**: API routes require proper authentication
4. **Prompt Injection Protection**: Inputs are sanitized before being sent to LLMs

## Scalability

The system is designed for horizontal scaling:
- Stateless API layer for load balancing
- Task queue integration for asynchronous processing
- Database connection pooling
- Caching for frequently accessed data

## Conclusion

The Agentic Meeting Analysis System represents a sophisticated approach to meeting analysis using a team of AI agents. Through careful coordination, specialized analysis, and collaborative synthesis, the system can process meeting transcripts to extract valuable insights that would traditionally require significant human effort.

This architecture provides a foundation that can be extended with new agent types, improved analysis techniques, and enhanced collaboration mechanisms as the system evolves. 