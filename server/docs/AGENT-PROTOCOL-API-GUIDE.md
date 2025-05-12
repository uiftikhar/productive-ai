# Agent Protocol API Guide

This guide describes how to use the new Agent Protocol API for meeting analysis.

## Overview

The Agent Protocol API provides a standardized interface for interacting with the meeting analysis system using the LangGraph Agent Protocol. This API offers improved capabilities including:

- Asynchronous meeting analysis with better status tracking
- Enhanced RAG integration for context-aware responses
- Better tool support with standardized input/output formats
- Improved error handling and debugging

## API Endpoints

### Base URL

The Agent Protocol API is available at:

```
/api/v2/agent-protocol
```

For backward compatibility, it may also be available at `/api/v1/analysis` when enabled by the feature flag.

### 1. Analyze Meeting

Start a meeting analysis job.

**Endpoint**: `POST /api/v2/agent-protocol/meetings/analyze`

**Request Body**:

```json
{
  "meetingId": "meeting-123",
  "transcript": "John: Hello everyone. Let's begin...",
  "title": "Project Status Update",
  "participants": [
    {
      "id": "john",
      "name": "John Smith",
      "role": "Manager"
    },
    {
      "id": "alice",
      "name": "Alice Johnson",
      "role": "Developer"
    }
  ],
  "userId": "user-456",
  "goals": [
    "extract_topics",
    "extract_action_items",
    "generate_summary"
  ],
  "options": {
    "visualization": true,
    "teamComposition": {
      "maxTeamSize": 5
    }
  }
}
```

**Response**:

```json
{
  "executionId": "run-abc123",
  "meetingId": "meeting-123",
  "status": "scheduled",
  "message": "Analysis scheduled successfully",
  "threadId": "thread-xyz789",
  "executionTimeMs": 245
}
```

### 2. Get Meeting Analysis Status

Check the status of a meeting analysis job.

**Endpoint**: `GET /api/v2/agent-protocol/meetings/:meetingId/status?executionId=run-abc123`

**Response**:

```json
{
  "meetingId": "meeting-123",
  "status": "in_progress",
  "progress": 50,
  "runId": "run-abc123",
  "threadId": "thread-xyz789",
  "partialResults": {
    "topics": ["Project Timeline", "Budget Issues"]
  },
  "metadata": {
    "startedAt": "2023-11-01T14:30:00Z"
  }
}
```

Possible status values:
- `pending`: Job is queued but not started
- `in_progress`: Job is currently running
- `requires_action`: Job needs user input
- `completed`: Job is complete
- `failed`: Job failed
- `canceled`: Job was canceled

### 3. Get Meeting Analysis Result

Get the results of a completed meeting analysis job.

**Endpoint**: `GET /api/v2/agent-protocol/meetings/:meetingId/result?executionId=run-abc123`

**Response**:

```json
{
  "meetingId": "meeting-123",
  "status": "completed",
  "results": {
    "topics": [
      {
        "name": "Project Timeline",
        "keywords": ["deadline", "schedule", "milestone"]
      },
      {
        "name": "Budget Issues",
        "keywords": ["cost", "funding", "expenses"]
      }
    ],
    "actionItems": [
      {
        "description": "Update the project timeline",
        "assignees": ["John Smith"],
        "dueDate": "2023-11-15"
      }
    ],
    "summary": {
      "short": "The team discussed project timeline and budget issues.",
      "detailed": "The team reviewed the current project timeline and identified potential delays..."
    }
  },
  "message": "Analysis completed successfully",
  "runId": "run-abc123",
  "threadId": "thread-xyz789"
}
```

### 4. Cancel Meeting Analysis

Cancel a running meeting analysis job.

**Endpoint**: `POST /api/v2/agent-protocol/meetings/:meetingId/cancel`

**Request Body**:

```json
{
  "executionId": "run-abc123"
}
```

**Response**:

```json
{
  "meetingId": "meeting-123",
  "status": "canceled",
  "message": "Analysis canceled successfully",
  "runId": "run-abc123"
}
```

### 5. Set Feature Flag

Toggle the Agent Protocol feature flag.

**Endpoint**: `POST /api/v2/agent-protocol/feature-flag`

**Request Body**:

```json
{
  "enabled": true
}
```

**Response**:

```json
{
  "message": "Agent Protocol feature flag set to true",
  "featureFlagEnabled": true
}
```

## Migration Notes

### Feature Flag

The system uses a feature flag to control which implementation is active:

1. **Environment Variable**: Set `USE_AGENT_PROTOCOL=true` in the `.env` file to enable by default
2. **API Endpoint**: Use the feature flag endpoint to toggle at runtime

### Differences from Legacy API

1. **Asynchronous Processing**: The new API always processes asynchronously, returning immediately with an execution ID
2. **Run IDs**: Execution IDs now start with `run-` to identify them as Agent Protocol runs
3. **Thread IDs**: The new API includes thread IDs for multi-turn conversations
4. **Status Field**: More detailed status reporting with progress tracking
5. **Context Integration**: Better integration with RAG for context-aware responses

### Transition Period

During the transition period:

1. Both APIs will be available simultaneously
2. Legacy API at `/api/v1/analysis`
3. New API at `/api/v2/agent-protocol`
4. When feature flag is enabled, the new implementation will also be available at `/api/v1/analysis`

## Example: Complete Analysis Flow

```javascript
// 1. Start analysis
const startResponse = await fetch('/api/v2/agent-protocol/meetings/analyze', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    meetingId: 'meeting-123',
    transcript: 'John: Hello everyone...',
    title: 'Weekly Status',
    goals: ['extract_topics', 'generate_summary']
  })
});

const { executionId, threadId } = await startResponse.json();

// 2. Poll for status
let status = 'scheduled';
while (status !== 'completed' && status !== 'failed' && status !== 'canceled') {
  await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
  
  const statusResponse = await fetch(
    `/api/v2/agent-protocol/meetings/meeting-123/status?executionId=${executionId}`
  );
  
  const statusData = await statusResponse.json();
  status = statusData.status;
  console.log(`Status: ${status}, Progress: ${statusData.progress}%`);
  
  if (statusData.partialResults) {
    console.log('Partial results:', statusData.partialResults);
  }
}

// 3. Get final results
if (status === 'completed') {
  const resultResponse = await fetch(
    `/api/v2/agent-protocol/meetings/meeting-123/result?executionId=${executionId}`
  );
  
  const resultData = await resultResponse.json();
  console.log('Final results:', resultData.results);
}
```

## Error Handling

The API uses standard HTTP status codes:

- `200/202`: Success
- `400`: Bad request (invalid parameters)
- `404`: Resource not found
- `500`: Server error

Error responses include detailed messages:

```json
{
  "error": "An error occurred while analyzing the meeting",
  "message": "Timeout waiting for meeting analysis to complete"
}
```

## RAG Integration

The Agent Protocol API automatically integrates with RAG when available:

1. Meeting transcripts are processed and stored in Pinecone
2. Context is retrieved during analysis to improve results
3. Additional metadata is maintained for future searches

No additional configuration is needed to enable RAG - it will be used automatically when Pinecone is configured.

## Visualization Support

The API maintains compatibility with the visualization system:

1. Set `options.visualization = true` in the analysis request
2. Visualization data will be generated during processing
3. Visualization can be accessed via the existing visualization endpoints 