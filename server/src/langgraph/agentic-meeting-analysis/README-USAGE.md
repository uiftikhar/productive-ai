# Meeting Analysis System - Developer Guide

## Introduction

The Meeting Analysis System is a powerful tool that uses a team of AI agents to automatically analyze meeting transcripts. This guide provides practical information for developers on how to use, extend, and troubleshoot the system.

## Quick Start

### API Endpoints

The system provides two primary REST API endpoints:

#### 1. Analyze a Transcript

```
POST /api/transcript/analyze
```

**Request Body:**
```json
{
  "transcript": "Your meeting transcript content here...",
  "meetingId": "optional-custom-id-123",
  "previousMeetings": ["previous-meeting-id-1", "previous-meeting-id-2"],
  "additionalContext": "Any additional context about the meeting"
}
```

**Response:**
```json
{
  "message": "Analysis started",
  "analysisTaskId": "analysis-uuid-123456",
  "meetingId": "optional-custom-id-123",
  "status": "in_progress"
}
```

#### 2. Check Analysis Status

```
GET /api/transcript/status/:meetingId
```

**Response (in progress):**
```json
{
  "meetingId": "optional-custom-id-123",
  "status": "in_progress",
  "currentPhase": "individual_analysis",
  "progress": 0.45
}
```

**Response (completed):**
```json
{
  "meetingId": "optional-custom-id-123",
  "status": "completed",
  "results": {
    "summary": "Meeting summary text here...",
    "actionItems": [
      { "description": "Task 1", "assignee": "John", "dueDate": "2023-10-15" },
      { "description": "Task 2", "assignee": "Mary", "dueDate": "2023-10-20" }
    ],
    "decisions": [
      { "description": "Decision 1", "approvers": ["John", "Mary"] },
      { "description": "Decision 2", "approvers": ["Sarah"] }
    ],
    "topics": [
      { "name": "Project Update", "duration": "10 minutes" },
      { "name": "Budget Discussion", "duration": "15 minutes" }
    ],
    "sentimentAnalysis": {
      "overall": "positive",
      "participants": {
        "John": "neutral",
        "Mary": "positive",
        "Sarah": "slightly negative"
      }
    },
    "participantAnalysis": {
      "speakerStats": {
        "John": { "speakingTime": "35%", "contributions": 12 },
        "Mary": { "speakingTime": "40%", "contributions": 15 },
        "Sarah": { "speakingTime": "25%", "contributions": 8 }
      }
    }
  }
}
```

## System Components

### 1. TranscriptAnalysisController

Located at `src/controllers/transcript-analysis.controller.ts`, this controller:
- Handles HTTP requests to the API endpoints
- Validates input
- Interacts with the agentic system
- Returns appropriate responses

### 2. AgenticMeetingAnalysis

The main system class located at `src/langgraph/agentic-meeting-analysis/index.ts`:
- Initializes all required services
- Manages the agent team
- Coordinates the analysis workflow
- Stores and retrieves results

### 3. Specialized Agents

Each agent has a specific role:

- `SummaryAgent`: Creates concise meeting summaries
- `ActionItemAgent`: Extracts tasks and commitments
- `DecisionTrackingAgent`: Identifies decisions
- `TopicAnalysisAgent`: Segments by topic
- `SentimentAnalysisAgent`: Analyzes emotional tone
- `ParticipantAnalysisAgent`: Tracks speaker participation

## Configuration Options

The system can be configured with various options:

```typescript
const config = {
  // Enable the collaborative framework for better results
  useCollaborativeFramework: true,
  
  // Enable human feedback for quality control (if needed)
  enableHumanFeedback: false,
  
  // Enable advanced functionality like adaptive chunking
  enableAdvancedFunctionality: true,
  
  // Custom logger
  logger: customLogger
};

const system = new AgenticMeetingAnalysis(config);
```

## Environment Variables

The system uses the following environment variables:

- `OPENAI_API_KEY`: Your OpenAI API key
- `OPENAI_MODEL`: Model to use (default: 'gpt-4o')
- `PINECONE_API_KEY`: Pinecone API key (for vector storage)
- `PINECONE_ENVIRONMENT`: Pinecone environment
- `MONGODB_URI`: MongoDB connection string

## Data Flow Diagram

```
┌─────────┐     ┌──────────────┐     ┌──────────────┐
│  Client │────►│ API Endpoint │────►│Agentic System│
└─────────┘     └──────────────┘     └──────────────┘
                                           │
                       ┌─────────────────┬─┴──────────────┬──────────────────┐
                       ▼                 ▼                ▼                   ▼
               ┌───────────────┐ ┌──────────────┐ ┌──────────────┐  ┌──────────────┐
               │ Summary Agent │ │Action Agent  │ │Decision Agent│  │ Other Agents │
               └───────────────┘ └──────────────┘ └──────────────┘  └──────────────┘
                       │                 │                │                   │
                       └─────────────────┴────────┬──────┴───────────────────┘
                                                  ▼
                                        ┌──────────────────┐
                                        │ Shared Memory    │
                                        └──────────────────┘
                                                  │
                                                  ▼
                                        ┌──────────────────┐
                                        │ External Services│
                                        │ (LLM, Embeddings)│
                                        └──────────────────┘
```

## Error Handling

Common errors and their solutions:

| Error | Possible Cause | Solution |
|-------|----------------|----------|
| 400 Bad Request | Missing transcript | Ensure transcript is provided in the request |
| 500 Internal Error | LLM API failure | Check API key and rate limits |
| Analysis Timeout | Transcript too long | Break into smaller meetings or increase timeout |
| Missing ActionItems | No action items in meeting | This is normal for some meeting types |

## Performance Optimization

For optimal performance:

1. **Transcript Length**: Keep transcripts under 15,000 words for best results
2. **Pre-processing**: Clean up transcripts to remove filler words and repetitions
3. **Context**: Provide relevant previous meetings for better continuity
4. **Memory Management**: For long-running servers, ensure proper resource cleanup

## Extending the System

### Adding a New Agent Type

1. Create a new agent class in `src/langgraph/agentic-meeting-analysis/agents/`
2. Extend `BaseMeetingAnalysisAgent` 
3. Implement the required methods
4. Register your agent in the team formation service

Example:

```typescript
import { BaseMeetingAnalysisAgent } from '../base-meeting-analysis-agent';

export class NewSpecializedAgent extends BaseMeetingAnalysisAgent {
  constructor(config) {
    super(config);
    this.agentType = 'new_specialized_agent';
  }
  
  async analyzeTranscript(transcript) {
    // Your specialized analysis logic here
    return results;
  }
}
```

### Custom Prompts

Modify the prompts for existing agents in `src/langgraph/agentic-meeting-analysis/agents/prompts/`:

```typescript
export const SUMMARY_AGENT_PROMPT = `
  You are a specialized Summary Agent that creates concise, accurate summaries of meetings.
  
  Your task is to:
  1. Read the provided meeting transcript
  2. Identify the key points discussed
  3. Create a structured summary that captures the essence of the meeting
  
  Include:
  - Main topics discussed
  - Key insights
  - Overall meeting purpose and outcome
`;
```

## Debugging

For debugging, enable verbose logging:

```typescript
const logger = new ConsoleLogger({ level: 'debug' });
const system = new AgenticMeetingAnalysis({ logger });
```

Check logs for:
- Agent communication
- LLM API calls
- Workflow state transitions
- Error details

## Testing

Run the test suite:

```bash
npm run test:agentic
```

Or test specific components:

```bash
npm run test:agentic -- --grep "ActionItemAgent"
```

## Best Practices

1. **Input Validation**: Always validate transcripts before processing
2. **Asynchronous Processing**: Use the status endpoint for long-running analyses
3. **Rate Limiting**: Implement rate limiting for production deployments
4. **Error Handling**: Implement proper error handling and fallback strategies
5. **Monitoring**: Track API usage and performance metrics

## FAQ

**Q: How long does analysis typically take?**
A: Typically 30 seconds to 2 minutes, depending on transcript length.

**Q: How accurate is the action item extraction?**
A: ~85-90% accuracy on clear action items, lower for ambiguous ones.

**Q: Can it handle multiple languages?**
A: Currently optimized for English, but can process other languages with reduced accuracy.

**Q: What's the maximum transcript length?**
A: The system can handle transcripts up to about 30,000 words, but performance is best under 15,000.

**Q: How can I improve analysis quality?**
A: Provide clean transcripts with speaker labels and clear punctuation.

## Support

For issues or questions, contact the development team at [dev@example.com](mailto:dev@example.com) or open an issue in the project repository. 