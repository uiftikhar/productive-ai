# User Context Service for Meeting Intelligence Platform

## Overview

The `UserContextService` is a comprehensive solution for managing user-specific contextual data in Pinecone vector databases. It has been enhanced to support the needs of a Meeting Intelligence Platform with extensive features for tracking meetings, decisions, action items, topics, and knowledge continuity across the organization.

## Key Components

### Context Types

The service supports various types of contextual data:

- **Conversations**: Message history between users and the system
- **Documents**: Knowledge base documents and chunks
- **Meetings**: Transcripts and content from meetings
- **Decisions**: Decisions made during meetings
- **Action Items**: Tasks assigned during meetings
- **Topics**: Subject matter tracked across multiple meetings
- **Questions**: Questions asked during meetings with answer tracking
- **Agenda Items**: Structured agenda items for meetings

### Core Features

1. **User-Specific Context Isolation**:
   - Each user's context is stored in a separate namespace
   - Cross-team context can be analyzed for knowledge gaps

2. **Robust Error Handling & Resilience**:
   - Comprehensive error types
   - Retry logic with exponential backoff
   - Structured logging

3. **Meeting Intelligence**:
   - Store and retrieve meeting content
   - Track decisions and action items
   - Monitor topic evolution across meetings
   - Track and answer questions
   - Generate pre-meeting context briefings

4. **Knowledge Gap Detection**:
   - Identify misalignments between teams
   - Detect missing information
   - Track unanswered questions

5. **External System Integration**:
   - Sync action items with tools like Jira, Asana, etc.
   - Support for custom external system IDs

6. **Advanced Context Retrieval**:
   - Pagination support
   - Enhanced relevance scoring
   - Multifaceted filtering options

7. **Context Usage Tracking**:
   - View counts and timestamps
   - Explicit relevance feedback
   - Usage patterns analysis

## New Methods

### Meeting & Topic Management

- `storeMeetingContent`: Store meeting transcripts and content
- `storeAgendaItem`: Store meeting agenda items
- `storeDecision`: Record decisions made in meetings
- `storeActionItem`: Track action items from meetings
- `updateActionItemStatus`: Update the status of action items
- `trackTopicAcrossMeetings`: Track topics across multiple meetings
- `updateTopicMeetings`: Update topic-meeting associations
- `getTopicEvolution`: See how topics evolve across meetings

### Question & Answer Tracking

- `storeQuestion`: Store questions from meetings
- `markQuestionAsAnswered`: Update questions when answered
- `findUnansweredQuestions`: Find unanswered questions by meeting or topic

### Knowledge Gap Analysis

- `detectKnowledgeGaps`: Identify knowledge gaps between teams
- `generatePreMeetingContext`: Create context briefings before meetings

### Context Retrieval & Enhancement

- `retrieveContextWithPagination`: Get context with pagination and enhanced relevance
- `recordContextAccess`: Track context views for importance scoring
- `provideRelevanceFeedback`: Allow explicit feedback on context relevance

### External System Integration

- `integrateActionItemWithExternalSystem`: Connect action items to external systems

## Enhanced Testing

The service comes with comprehensive tests covering:

- Core functionality
- Error handling
- Retry logic
- Meeting content management
- Decision and action item tracking
- Topic evolution tracking
- Knowledge gap detection
- Question and answer workflows
- Advanced context retrieval
- Usage tracking

## Usage Example

A complete example showing RAG (Retrieval-Augmented Generation) capabilities is available in `rag-example.ts`, demonstrating:

1. Storing conversation history
2. Storing document chunks
3. Retrieving relevant context for queries
4. Accessing conversation history
5. Getting user context statistics

## Integration with Meeting Intelligence Platform

This enhanced service provides the foundation for:

- Cross-meeting topic tracking
- Decision tracking and implementation monitoring
- Proactive meeting intelligence with pre-meeting briefings
- Unanswered question tracking
- Organizational knowledge graph visualization
- Cross-team knowledge gap identification
- Predictive meeting topic suggestions 