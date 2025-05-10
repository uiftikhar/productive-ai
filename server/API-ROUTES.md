# Meeting Analysis API Routes

This document outlines the API routes available for the Meeting Analysis feature.

## Base URL

All API endpoints are accessible at:

```
/api/v1/analysis
```

## Available Endpoints

### Sessions

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/sessions` | List all analysis sessions |
| `POST` | `/sessions` | Create a new analysis session |
| `GET` | `/sessions/:sessionId` | Get session status |
| `DELETE` | `/sessions/:sessionId` | Delete a session |
| `POST` | `/sessions/:sessionId/analyze` | Submit transcript for analysis |
| `GET` | `/sessions/:sessionId/results` | Get analysis results |

## Request/Response Examples

### Create Session

**Request:**
```http
POST /api/v1/analysis/sessions
Content-Type: application/json

{
  "analysisGoal": "MEETING_SUMMARY",
  "enabledExpertise": ["GENERAL"]
}
```

**Response:**
```json
{
  "data": {
    "sessionId": "session-12345678-1234-1234-1234-123456789012",
    "status": "created",
    "metadata": {
      "analysisGoal": "MEETING_SUMMARY",
      "enabledExpertise": ["GENERAL"]
    }
  }
}
```

### Submit Transcript for Analysis

**Request:**
```http
POST /api/v1/analysis/sessions/:sessionId/analyze
Content-Type: application/json

{
  "transcript": "Meeting transcript content...",
  "message": "Optional instructions for the analysis"
}
```

**Response:**
```json
{
  "data": {
    "sessionId": "session-12345678-1234-1234-1234-123456789012",
    "status": "processing",
    "message": "Transcript accepted for analysis"
  }
}
```

### Get Analysis Results

**Request:**
```http
GET /api/v1/analysis/sessions/:sessionId/results
```

**Response:**
```json
{
  "data": {
    "sessionId": "session-12345678-1234-1234-1234-123456789012",
    "status": "completed",
    "results": {
      "topics": ["Project Updates", "Timeline Discussion", "Budget Concerns"],
      "actionItems": [
        {
          "description": "Update project timeline document",
          "assignee": "Alice",
          "dueDate": "2023-11-30"
        }
      ],
      "summary": "Meeting covered project updates, timeline adjustments, and budget considerations."
    },
    "metadata": {
      // Session metadata
    }
  }
}
```

## Error Handling

All API errors follow a standard format:

```json
{
  "error": {
    "type": "ERROR_TYPE",
    "message": "Human-readable error message",
    "code": "ERROR_CODE"
  }
}
```

Common error codes:
- `ERR_MISSING_ANALYSIS_GOAL` - Missing required analysisGoal field
- `ERR_INVALID_ANALYSIS_GOAL` - Invalid analysisGoal value
- `ERR_INVALID_EXPERTISE_FORMAT` - enabledExpertise must be an array
- `ERR_INVALID_EXPERTISE` - Invalid expertise values
- `ERR_INVALID_SESSION_ID` - Invalid session ID
- `ERR_INVALID_TRANSCRIPT` - Missing or invalid transcript
- `ERR_TRANSCRIPT_TOO_SHORT` - Transcript is too short
- `ERR_INVALID_MESSAGE` - Message must be a string
- `ERR_SESSION_NOT_FOUND` - Session not found
- `ERR_RESULTS_NOT_FOUND` - Results not found 