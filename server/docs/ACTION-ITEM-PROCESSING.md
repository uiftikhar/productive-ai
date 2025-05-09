# Action Item Processing System

## Overview

The Action Item Processing System is a comprehensive solution for extracting, managing, and tracking action items from meeting transcripts. It uses a combination of rule-based NLP techniques and LLM-based extraction to identify action items, along with their assignees, deadlines, and priorities.

## Key Components

1. **ActionItemProcessor**: The core component that extracts action items from meeting transcripts using both rule-based patterns and LLM capabilities.

2. **AssigneeResolutionService**: Resolves ambiguous assignee references by matching them against organizational data.

3. **ActionItemIntegrationService**: Provides integration with external project management tools like JIRA, Asana, etc.

4. **ActionItemController**: Coordinates the various services and exposes a REST API for client applications.

## Features

### Action Item Extraction

The system can extract action items from meeting transcripts with the following details:
- Task description
- Assignee
- Deadline/due date
- Priority level
- Status

It uses a hybrid approach combining:
- Regular expression patterns for identifying common action item phrases
- Time-based patterns for deadline extraction
- Language model analysis for more complex cases

### Assignee Resolution

The system can resolve assignee references:
- Match partial names or aliases to full user profiles
- Use meeting participant context to improve matching
- Handle ambiguous cases with verification workflows
- Provide confidence scores for resolution quality

### Priority and Deadline Detection

Sophisticated detection of:
- Explicit deadlines (e.g., "by next Friday")
- Relative deadlines (e.g., "within two weeks")
- Time-frame references (e.g., "end of month")
- Priority signals based on language (e.g., "urgent", "critical", "if time permits")

### External Tool Integration

Seamless integration with external project management tools:
- JIRA adapter implementation
- Bi-directional synchronization
- Status tracking across systems
- Configurable synchronization behavior

## API Endpoints

### 1. Process Transcript

```
POST /api/v1/action-items/process
```

Extracts action items from a meeting transcript.

**Request Body:**
```json
{
  "userId": "user123",
  "meetingId": "meeting456",
  "transcript": "Meeting transcript text...",
  "meetingDate": "2023-06-15T10:30:00Z",
  "organizationalData": [
    {
      "id": "user1",
      "firstName": "John",
      "lastName": "Doe",
      "fullName": "John Doe",
      "email": "john.doe@example.com",
      "role": "Product Manager"
    },
    ...
  ],
  "participantIds": ["user1", "user2", ...]
}
```

**Response:**
```json
{
  "success": true,
  "actionItems": [
    {
      "id": "action-123",
      "content": "Create wireframes for the dashboard",
      "assignee": "user1",
      "deadline": "2023-06-22T23:59:59Z",
      "priority": "medium",
      "status": "pending",
      "confidence": 0.85,
      "extractionMethod": "hybrid"
    },
    ...
  ],
  "meetingId": "meeting456",
  "extractedCount": 3
}
```

### 2. Get Meeting Action Items

```
GET /api/v1/action-items/:userId/:meetingId
```

Retrieves all action items for a specific meeting.

### 3. Update Action Item Status

```
PUT /api/v1/action-items/:userId/:actionItemId/status
```

Updates the status of an action item.

**Request Body:**
```json
{
  "status": "completed",
  "meetingId": "meeting456"
}
```

### 4. Resolve Ambiguous Assignee

```
POST /api/v1/action-items/resolve-assignee
```

Resolves an ambiguous assignee reference.

**Request Body:**
```json
{
  "assigneeText": "Mike",
  "selectedUserId": "user3",
  "meetingId": "meeting456"
}
```

### 5. Setup Integration

```
POST /api/v1/action-items/integration/setup
```

Sets up integration with an external system.

**Request Body:**
```json
{
  "userId": "user123",
  "platform": "jira",
  "credentials": {
    "baseUrl": "https://your-domain.atlassian.net",
    "email": "your-email@example.com",
    "apiToken": "your-api-token",
    "projectKey": "PRJ"
  }
}
```

### 6. Sync Action Items

```
POST /api/v1/action-items/integration/sync
```

Synchronizes action items with an external system.

**Request Body:**
```json
{
  "userId": "user123",
  "platform": "jira",
  "meetingId": "meeting456",
  "direction": "bidirectional"
}
```

## Usage Examples

### Basic Action Item Extraction

```javascript
const axios = require('axios');

// Extract action items from transcript
const response = await axios.post('/api/v1/action-items/process', {
  userId: 'user123',
  meetingId: 'meeting456',
  transcript: meetingTranscript,
  meetingDate: new Date().toISOString()
});

const actionItems = response.data.actionItems;
console.log(`Extracted ${actionItems.length} action items`);
```

### Integration with JIRA

```javascript
// Set up JIRA integration
await axios.post('/api/v1/action-items/integration/setup', {
  userId: 'user123',
  platform: 'jira',
  credentials: {
    baseUrl: 'https://your-domain.atlassian.net',
    email: 'your-email@example.com',
    apiToken: 'your-api-token',
    projectKey: 'PRJ'
  }
});

// Sync action items with JIRA
await axios.post('/api/v1/action-items/integration/sync', {
  userId: 'user123',
  platform: 'jira',
  meetingId: 'meeting456',
  direction: 'export_only'
});
```

## Implementation Details

### Rule-Based Extraction Patterns

The system uses several regex patterns to identify action items:

```javascript
const actionPhrasePatterns = [
  /(?:action item|task|to-?do|assignment)(?:\s+for\s+(\w+))?:?\s*(.*?)(?:\.|$)/i,
  /(\w+)\s+(?:to|will|should|needs? to|is going to)\s+(.*?)(?:\.|$)/i,
  /(\w+)\s+(?:is responsible for|is assigned to|agreed to)\s+(.*?)(?:\.|$)/i,
  /let's\s+(\w+)\s+(.*?)(?:\.|$)/i,
  /(\w+),\s+(?:please|could you)\s+(.*?)(?:\.|$)/i
];
```

### Deadline Extraction

The system recognizes various date formats:

- Specific dates: "by January 15th", "due on 3/15/2023"
- Relative days: "by tomorrow", "by next Friday"
- Timeframes: "within 2 weeks", "in 3 days"
- End of periods: "by end of week", "end of month"

### Priority Detection

Priority is determined by keyword analysis:

- Critical: "urgent", "critical", "ASAP", "immediately"
- High: "high priority", "important", "pressing"
- Medium: "should", "need to" (default for most action items)
- Low: "low priority", "whenever possible", "if time permits"

## Integration Architecture

The system uses an adapter pattern for external tool integration:

1. `IntegrationAdapter`: Abstract base class for tool-specific adapters
2. `JiraAdapter`: Concrete implementation for JIRA
3. `ActionItemIntegrationService`: Manages the adapters and synchronization

## Future Enhancements

1. **Enhanced NLP**: More sophisticated NLP for complex action item detection
2. **Additional Adapters**: Support for more project management tools
3. **ML-based Priority Detection**: Machine learning for better priority inference
4. **Automated Follow-ups**: Automatic reminders and follow-ups for action items
5. **Analytics Dashboard**: Visual analytics for action item completion trends

## Getting Started

1. Ensure the necessary environment variables are set:
   - `OPENAI_API_KEY`
   - `OPENAI_MODEL` (default: "gpt-4")

2. Run the server:
   ```
   yarn start
   ```

3. Test action item extraction:
   ```
   node test-action-item-processing.js
   ``` 