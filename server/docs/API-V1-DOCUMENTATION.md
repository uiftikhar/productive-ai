# Meeting Analysis API Documentation (v1)

This document describes the RESTful API endpoints for the meeting analysis functionality. The API follows a standardized response format and uses versioning to ensure compatibility.

## API Base URL

```
/api/v1/analysis
```

For convenience, the latest API version is also available at:

```
/api/analysis
```

## Authentication

All API endpoints require authentication. Use the appropriate authentication headers:

```
Authorization: Bearer <jwt_token>
```

## Standard Response Format

All API endpoints return responses in a standardized format:

### Success Response

```json
{
  "success": true,
  "data": {
    // Response data specific to the endpoint
  },
  "meta": {
    "timestamp": "2023-11-02T12:34:56.789Z",
    // Additional metadata
  }
}
```

### Error Response

```json
{
  "success": false,
  "error": {
    "type": "ERROR_TYPE",
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {
      // Additional error details
    }
  },
  "meta": {
    "timestamp": "2023-11-02T12:34:56.789Z",
    "requestId": "unique-request-id"
  }
}
```

## Analysis Sessions

### Create a New Analysis Session

Creates a new session for meeting analysis.

**Endpoint**: `POST /sessions`

**Request Body**:

```json
{
  "analysisGoal": "full_analysis",
  "enabledExpertise": ["topic_analysis", "action_item_extraction", "summary_generation"]
}
```

**Response (201 Created)**:

```json
{
  "success": true,
  "data": {
    "sessionId": "session-abc123",
    "status": "created",
    "metadata": {
      "analysisGoal": "full_analysis",
      "enabledExpertise": ["topic_analysis", "action_item_extraction", "summary_generation"]
    }
  },
  "meta": {
    "timestamp": "2023-11-02T12:34:56.789Z"
  }
}
```

### List All Analysis Sessions

Retrieves a list of all analysis sessions.

**Endpoint**: `GET /sessions`

**Response (200 OK)**:

```json
{
  "success": true,
  "data": {
    "sessions": [
      {
        "sessionId": "session-abc123",
        "status": "created",
        "createdAt": 1667390096789,
        "analysisGoal": "full_analysis",
        "enabledExpertise": ["topic_analysis", "action_item_extraction", "summary_generation"]
      },
      {
        "sessionId": "session-def456",
        "status": "completed",
        "createdAt": 1667380096789,
        "completedAt": 1667381096789,
        "analysisGoal": "summary_only"
      }
    ]
  },
  "meta": {
    "timestamp": "2023-11-02T12:34:56.789Z"
  }
}
```

### Get Session Status

Retrieves the status of a specific analysis session.

**Endpoint**: `GET /sessions/:sessionId`

**Response (200 OK)**:

```json
{
  "success": true,
  "data": {
    "sessionId": "session-abc123",
    "status": "processing",
    "metadata": {
      "createdAt": 1667390096789,
      "analysisGoal": "full_analysis",
      "enabledExpertise": ["topic_analysis", "action_item_extraction", "summary_generation"],
      "transcriptSubmitted": true,
      "transcriptLength": 5432,
      "processingStartedAt": 1667390196789,
      "progress": 45
    }
  },
  "meta": {
    "timestamp": "2023-11-02T12:34:56.789Z"
  }
}
```

### Delete a Session

Deletes a specific analysis session and all associated data.

**Endpoint**: `DELETE /sessions/:sessionId`

**Response (200 OK)**:

```json
{
  "success": true,
  "data": {
    "sessionId": "session-abc123",
    "status": "deleted",
    "message": "Session deleted successfully"
  },
  "meta": {
    "timestamp": "2023-11-02T12:34:56.789Z"
  }
}
```

### Submit Transcript for Analysis

Submits a meeting transcript for analysis.

**Endpoint**: `POST /sessions/:sessionId/analyze`

**Request Body**:

```json
{
  "transcript": "Full meeting transcript content...",
  "message": "Please analyze this meeting transcript"
}
```

**Response (202 Accepted)**:

```json
{
  "success": true,
  "data": {
    "sessionId": "session-abc123",
    "status": "processing",
    "message": "Transcript accepted for analysis"
  },
  "meta": {
    "timestamp": "2023-11-02T12:34:56.789Z"
  }
}
```

### Get Analysis Results

Retrieves the results of a completed analysis.

**Endpoint**: `GET /sessions/:sessionId/results`

**Response - Analysis in Progress (200 OK)**:

```json
{
  "success": true,
  "data": {
    "sessionId": "session-abc123",
    "status": "processing",
    "message": "Analysis not yet complete",
    "progress": 65
  },
  "meta": {
    "timestamp": "2023-11-02T12:34:56.789Z"
  }
}
```

**Response - Analysis Complete (200 OK)**:

```json
{
  "success": true,
  "data": {
    "sessionId": "session-abc123",
    "status": "completed",
    "results": {
      "topics": [
        "Project Updates", 
        "Timeline Discussion", 
        "Budget Concerns"
      ],
      "actionItems": [
        {
          "description": "Update project timeline document",
          "assignee": "Alice",
          "dueDate": "2023-11-30"
        },
        {
          "description": "Schedule meeting with finance team",
          "assignee": "Bob",
          "dueDate": "2023-11-15"
        }
      ],
      "summary": "Meeting covered project updates, timeline adjustments, and budget considerations. Several action items were assigned."
    },
    "metadata": {
      "createdAt": 1667390096789,
      "completedAt": 1667390296789,
      "analysisGoal": "full_analysis",
      "enabledExpertise": ["topic_analysis", "action_item_extraction", "summary_generation"],
      "transcriptSubmitted": true,
      "transcriptLength": 5432,
      "processingStartedAt": 1667390196789,
      "progress": 100
    }
  },
  "meta": {
    "timestamp": "2023-11-02T12:34:56.789Z"
  }
}
```

## WebSocket Interface

Real-time updates for meeting analysis are available through WebSockets.

### Connection URL

```
ws://server-url/api/ws/analysis
```

### Events

#### Client-to-Server Events

- `join_session`: Subscribe to updates for a specific session
  ```json
  { "sessionId": "session-abc123" }
  ```

- `leave_session`: Unsubscribe from a session
  ```json
  { "sessionId": "session-abc123" }
  ```

- `submit_transcript`: Submit a transcript for analysis
  ```json
  { 
    "sessionId": "session-abc123",
    "transcript": "Full meeting transcript content..."
  }
  ```

- `cancel_analysis`: Cancel an ongoing analysis
  ```json
  { "sessionId": "session-abc123" }
  ```

#### Server-to-Client Events

- `session_joined`: Confirmation of session subscription
  ```json
  {
    "type": "session_joined",
    "sessionId": "session-abc123",
    "data": { "success": true },
    "timestamp": 1667390096789
  }
  ```

- `session_update`: General session status updates
  ```json
  {
    "type": "session_update",
    "sessionId": "session-abc123",
    "data": { 
      "status": "processing", 
      "transcriptReceived": true 
    },
    "timestamp": 1667390096789
  }
  ```

- `analysis_progress`: Progress updates during analysis
  ```json
  {
    "type": "analysis_progress",
    "sessionId": "session-abc123",
    "data": { 
      "progress": 65, 
      "status": "Processing step 3 of 5" 
    },
    "timestamp": 1667390196789
  }
  ```

- `topic_detected`: Real-time topic detection updates
  ```json
  {
    "type": "topic_detected",
    "sessionId": "session-abc123",
    "data": { 
      "topic": {
        "name": "Project Updates",
        "confidence": 0.92,
        "keywords": ["milestone", "deadline", "progress"]
      }
    },
    "timestamp": 1667390196989
  }
  ```

- `action_item_detected`: Real-time action item detection updates
  ```json
  {
    "type": "action_item_detected",
    "sessionId": "session-abc123",
    "data": { 
      "actionItem": {
        "description": "Update project timeline document",
        "assignee": "Alice",
        "dueDate": "2023-11-30",
        "confidence": 0.88
      }
    },
    "timestamp": 1667390197089
  }
  ```

- `analysis_complete`: Notification of analysis completion
  ```json
  {
    "type": "analysis_complete",
    "sessionId": "session-abc123",
    "data": { 
      "results": {
        "topics": ["Project Updates", "Timeline Discussion", "Budget Concerns"],
        "actionItems": [
          {
            "description": "Update project timeline document",
            "assignee": "Alice",
            "dueDate": "2023-11-30"
          },
          {
            "description": "Schedule meeting with finance team",
            "assignee": "Bob",
            "dueDate": "2023-11-15"
          }
        ],
        "summary": "Meeting covered project updates, timeline adjustments, and budget considerations. Several action items were assigned."
      }
    },
    "timestamp": 1667390297089
  }
  ```

- `analysis_error`: Error notifications
  ```json
  {
    "type": "analysis_error",
    "sessionId": "session-abc123",
    "data": { 
      "error": "Failed to process transcript", 
      "code": "ERR_PROCESSING_FAILED" 
    },
    "timestamp": 1667390197189
  }
  ```

## Error Codes

| Code | Description |
|------|-------------|
| `ERR_VALIDATION` | Invalid request parameters |
| `ERR_AUTHENTICATION` | Authentication failed |
| `ERR_AUTHORIZATION` | Not authorized to access the resource |
| `ERR_NOT_FOUND` | Resource not found |
| `ERR_SESSION_NOT_FOUND` | Analysis session not found |
| `ERR_RESULTS_NOT_FOUND` | Analysis results not found |
| `ERR_PROCESSING_FAILED` | Failed to process the transcript |
| `ERR_INTERNAL` | Internal server error |

## Rate Limiting

API endpoints are rate-limited. The current limits are:

- 100 requests per minute per IP address
- 10 session creations per minute per user
- 5 transcript submissions per minute per user

When rate limits are exceeded, the API will return a 429 status code with a `RATE_LIMIT_EXCEEDED` error. 