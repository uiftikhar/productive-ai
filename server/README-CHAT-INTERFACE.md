# Chat Interface API for Hierarchical Agent Architecture

This document describes the API endpoints for interacting with the hierarchical agent architecture via a chat interface.

## Overview

The chat interface provides a simple way to interact with the meeting analysis system. It enables:

1. Creating and managing chat sessions
2. Uploading meeting transcripts for analysis
3. Analyzing transcripts with the hierarchical agent system
4. Querying analysis results and related information
5. Getting related meetings and insights

## API Endpoints

### Session Management

#### Create a Session

```
POST /api/chat/session
```

Request body:
```json
{
  "userId": "user-123",
  "metadata": {
    "name": "Test User",
    "email": "test@example.com"
  }
}
```

Response:
```json
{
  "id": "session-456abc",
  "userId": "user-123",
  "createdAt": 1678901234567,
  "expiresAt": 1678987634567,
  "metadata": {
    "name": "Test User",
    "email": "test@example.com"
  }
}
```

#### Get Session Details

```
GET /api/chat/session/:sessionId
```

Response:
```json
{
  "id": "session-456abc",
  "userId": "user-123",
  "createdAt": 1678901234567,
  "lastActiveAt": 1678901234567,
  "expiresAt": 1678987634567,
  "currentMeetingId": "meeting-789xyz",
  "metadata": {
    "name": "Test User",
    "email": "test@example.com"
  }
}
```

### Message Handling

#### Send Message

```
POST /api/chat/message
```

Request body:
```json
{
  "sessionId": "session-456abc",
  "content": "What were the main topics discussed in the meeting?",
  "metadata": {
    "client_version": "1.0.0"
  }
}
```

Response:
```json
{
  "id": "msg-789xyz",
  "content": "The main topics discussed were product roadmap, user research findings, and development priorities for the next sprint.",
  "type": "text",
  "timestamp": 1678901234567,
  "attachments": []
}
```

#### Get Message History

```
GET /api/chat/history/:sessionId
```

Optional query parameters:
- `limit` - Maximum number of messages to return (default: 50)
- `before` - Timestamp to get messages before
- `after` - Timestamp to get messages after

Response:
```json
[
  {
    "id": "msg-123abc",
    "sessionId": "session-456abc",
    "content": "What were the main topics discussed in the meeting?",
    "role": "user",
    "timestamp": 1678901234567
  },
  {
    "id": "msg-789xyz",
    "sessionId": "session-456abc",
    "content": "The main topics discussed were product roadmap, user research findings, and development priorities for the next sprint.",
    "role": "assistant",
    "timestamp": 1678901234568
  }
]
```

### Transcript Analysis

#### Upload Transcript

```
POST /api/chat/transcript/upload
```

Request body:
```json
{
  "sessionId": "session-456abc",
  "transcript": "John: Hello everyone...",
  "title": "Product Planning Meeting",
  "description": "Weekly product planning discussion",
  "participants": [
    {
      "id": "john",
      "name": "John Smith",
      "role": "Product Manager"
    }
  ]
}
```

Response:
```json
{
  "meetingId": "meeting-789xyz",
  "analysisSessionId": "session-abc123",
  "status": "pending",
  "progress": {
    "overallProgress": 0,
    "goals": []
  },
  "sessionId": "session-456abc",
  "timestamp": 1678901234567
}
```

#### Analyze Transcript

```
POST /api/chat/transcript/:meetingId/analyze
```

Request body:
```json
{
  "sessionId": "session-456abc",
  "goals": ["GENERATE_SUMMARY", "EXTRACT_ACTION_ITEMS"]
}
```

Response:
```json
{
  "meetingId": "meeting-789xyz",
  "analysisSessionId": "session-abc123",
  "status": "in_progress",
  "progress": {
    "overallProgress": 25,
    "goals": []
  }
}
```

#### Get Analysis Status

```
GET /api/chat/transcript/:meetingId/status
```

Response:
```json
{
  "meetingId": "meeting-789xyz",
  "analysisSessionId": "session-abc123",
  "status": "completed",
  "progress": {
    "overallProgress": 100,
    "goals": []
  }
}
```

#### Get Related Meetings

```
GET /api/chat/transcript/:meetingId/related?sessionId=session-456abc
```

Response:
```json
[
  {
    "meetingId": "meeting-def456",
    "title": "Previous Product Planning",
    "timestamp": 1678814834567,
    "duration": 3600,
    "participants": [
      {
        "id": "john",
        "name": "John Smith"
      }
    ],
    "topics": [
      {
        "name": "User Research",
        "relevance": 0.85
      }
    ],
    "relevance": 0.9,
    "relationType": "previous"
  }
]
```

## Testing

You can test the API using the provided test script:

```
node test-chat-interface.js
```

## Error Handling

All API endpoints follow a standard error response format:

```json
{
  "error": {
    "type": "ERROR_TYPE",
    "message": "Human-readable error message",
    "details": {}
  }
}
```

Error types include:
- `BAD_REQUEST` - Invalid request parameters (400)
- `NOT_FOUND` - Requested resource not found (404)
- `INTERNAL_ERROR` - Server-side error (500)
- `UNAUTHORIZED` - Authentication required (401)
- `CONFLICT` - Resource conflict (409)
- `SERVICE_UNAVAILABLE` - Service temporarily unavailable (503)

## Next Steps

1. Implement authentication for secure access
2. Add real-time streaming capabilities
3. Implement detailed visualization endpoint
4. Add support for multi-format transcript uploads
5. Implement cross-meeting continuity features 