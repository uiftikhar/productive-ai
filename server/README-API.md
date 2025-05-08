# API Documentation

## Overview

This document describes the API endpoints for the meeting analysis and chat interface.

## Base URL

All API endpoints are under the `/api/v1` prefix, with backward compatibility to `/api` for existing clients.

## Authentication

Authentication is not implemented in the current version. User IDs are passed as parameters for demonstration purposes.

## API Versioning

The API uses versioning to ensure backward compatibility:
- `/api/v1/*` - Version 1 of the API
- `/api/*` - Alias to the latest version for backward compatibility

## Health Endpoints

### Check Health

```
GET /health
```

Returns basic health status of the API.

#### Response

```json
{
  "status": "ok",
  "timestamp": 1623456789012,
  "uptime": 3600,
  "version": "1.0.0"
}
```

### Detailed Health

```
GET /health/detailed
```

Returns detailed health information about all system components.

#### Response

```json
{
  "status": "ok",
  "timestamp": 1623456789012,
  "version": "1.0.0",
  "components": {
    "api": { "status": "ok" },
    "services": { 
      "status": "ok",
      "initialized": true
    },
    "storage": {
      "status": "ok",
      "adapter": "FileStorageAdapter",
      "initialized": true
    }
  },
  "metrics": {
    "memory": {
      "total": 8589934592,
      "free": 4294967296,
      "usage": 50
    },
    "cpu": {
      "cores": 8,
      "load": [1.0, 0.8, 0.5]
    },
    "uptime": {
      "system": 86400,
      "process": 3600
    }
  }
}
```

## Chat API Endpoints

### Create Session

```
POST /api/v1/chat/session
```

Create a new chat session.

#### Request Body

```json
{
  "userId": "user123",
  "metadata": {
    "name": "Test User",
    "email": "test@example.com"
  }
}
```

#### Response

```json
{
  "data": {
    "id": "session123",
    "userId": "user123",
    "createdAt": 1623456789012,
    "expiresAt": 1623543189012,
    "metadata": {
      "name": "Test User",
      "email": "test@example.com"
    }
  },
  "timestamp": 1623456789012
}
```

### Send Message

```
POST /api/v1/chat/session/:sessionId/message
```

Send a message to a chat session.

#### Request Body

```json
{
  "content": "What were the main topics discussed in this meeting?"
}
```

#### Response

```json
{
  "id": "msg123",
  "content": "The main topics discussed were product roadmap, user research, and timeline estimates.",
  "role": "assistant",
  "timestamp": 1623456789012
}
```

### Get Messages

```
GET /api/v1/chat/session/:sessionId/messages
```

Get messages for a chat session.

#### Query Parameters

- `limit` (optional): Maximum number of messages to return
- `before` (optional): Timestamp to get messages before
- `after` (optional): Timestamp to get messages after

#### Response

```json
[
  {
    "id": "msg123",
    "sessionId": "session123",
    "content": "What were the main topics discussed in this meeting?",
    "role": "user",
    "timestamp": 1623456789012,
    "attachments": [],
    "metadata": {}
  },
  {
    "id": "msg124",
    "sessionId": "session123",
    "content": "The main topics discussed were product roadmap, user research, and timeline estimates.",
    "role": "assistant",
    "timestamp": 1623456789013,
    "attachments": [],
    "metadata": {}
  }
]
```

### Upload Transcript

```
POST /api/v1/chat/transcript
```

Upload a transcript for analysis.

#### Request Body

```json
{
  "sessionId": "session123",
  "transcript": "John: Hi everyone, let's discuss the roadmap...",
  "title": "Product Planning Meeting",
  "description": "Weekly product planning discussion",
  "participants": [
    { "id": "john", "name": "John Smith", "role": "Product Manager" },
    { "id": "sarah", "name": "Sarah Johnson", "role": "UX Designer" }
  ]
}
```

#### Response

```json
{
  "meetingId": "meeting123",
  "analysisSessionId": "analysis123",
  "status": "pending",
  "progress": {
    "overallProgress": 0,
    "goals": []
  },
  "sessionId": "session123",
  "timestamp": 1623456789012
}
```

### Get Analysis Status

```
GET /api/v1/chat/analysis/:meetingId/status
```

Get the status of a meeting analysis.

#### Response

```json
{
  "meetingId": "meeting123",
  "analysisSessionId": "analysis123",
  "status": "in_progress",
  "progress": {
    "overallProgress": 50,
    "goals": [
      {
        "type": "generate_summary",
        "status": "completed",
        "progress": 100
      },
      {
        "type": "extract_topics",
        "status": "in_progress",
        "progress": 50
      }
    ]
  }
}
```

## Error Handling

All endpoints use standardized error responses:

```json
{
  "error": {
    "type": "ERROR_TYPE",
    "message": "Human readable error message",
    "details": { /* Additional error details */ },
    "timestamp": 1623456789012
  }
}
```

### Error Types

- `BAD_REQUEST` - Invalid request format or parameters
- `NOT_FOUND` - Requested resource not found
- `INTERNAL_ERROR` - Server-side error
- `UNAUTHORIZED` - Authentication required or failed
- `CONFLICT` - Resource conflict
- `SERVICE_UNAVAILABLE` - Service temporarily unavailable
- `VALIDATION_ERROR` - Request validation failed
- `RESOURCE_LIMIT_EXCEEDED` - Resource limit exceeded
- `TIMEOUT_ERROR` - Operation timed out

## Rate Limiting

Rate limiting is applied based on user ID:
- Maximum 10 active sessions per user
- Maximum 100 messages per minute per session

## Pagination

Pagination is supported for message history using the following parameters:
- `limit` - Maximum number of items to return
- `before` - Return items before this timestamp
- `after` - Return items after this timestamp 