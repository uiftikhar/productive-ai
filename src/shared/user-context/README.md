# User Context Service

## Overview

The User Context Service provides functionality for storing, retrieving, and managing context data for AI applications. It is primarily used for RAG (Retrieval-Augmented Generation) applications to enhance AI responses with relevant user context.

## Modular Architecture

The User Context Service has been refactored to a modular architecture to improve maintainability, testability, and extensibility. The architecture follows these principles:

1. **Single Responsibility**: Each service handles a specific domain of functionality
2. **Separation of Concerns**: Clear boundaries between different types of operations
3. **Dependency Injection**: Services accept dependencies in constructors for flexibility and testability
4. **Facade Pattern**: A unified interface maintains backward compatibility

### Key Components

#### Type Definitions

- **`context.types.ts`**: Base types, enums, and interfaces for context operations
- **`memory.types.ts`**: Types related to cognitive memory structures
- **`theme.types.ts`**: Types for theme relationships and evolution
- **`temporal.types.ts`**: Types for temporal relevance models and patterns

#### Core Services

- **`BaseContextService`**: Foundation service for vector storage/retrieval 
- **`MetadataValidationService`**: Handles validation of different metadata types

#### Domain-Specific Services

- **`ConversationContextService`**: Conversation history management
- **`DocumentContextService`**: Document chunk storage and retrieval
- **`MeetingContextService`**: Meeting content and related entities
- **`ThemeManagementService`**: Theme tracking and relationships
- **`MemoryManagementService`**: Cognitive memory operations
- **`TemporalIntelligenceService`**: Time-based relevance modeling
- **`KnowledgeGapService`**: Knowledge gap detection

#### Cross-Cutting Services

- **`RelevanceCalculationService`**: Role-based relevance calculations
- **`IntegrationService`**: External system integrations

#### Unified Interface

- **`UserContextFacade`**: Provides a unified interface to all services, maintaining backward compatibility

## Usage

### Installing Dependencies

```bash
npm install
```

### Initializing the Service

```typescript
// Using the facade for backward compatibility
import { UserContextFacade } from './user-context.facade.ts';

const contextService = new UserContextFacade();
await contextService.initialize();
```

Or use specific services directly:

```typescript
import { DocumentContextService } from './services/document-context.service.ts';

const docService = new DocumentContextService();
await docService.initialize();
```

### Storing Context

```typescript
// Store a conversation turn
const turnId = await contextService.storeConversationTurn(
  userId,
  conversationId,
  message,
  embeddings,
  'user'
);

// Store a document chunk
const chunkId = await contextService.storeDocumentChunk(
  userId,
  documentId,
  documentTitle,
  content,
  embeddings,
  0,
  10
);

// Add memory structure to context
await contextService.addSemanticMemoryStructure(
  userId,
  contextId,
  {
    concept: "Agile Development",
    definition: "An iterative approach to software delivery",
    specificity: 0.8,
    // ...other fields
  }
);
```

### Retrieving Context

```typescript
// Get conversation history
const history = await contextService.getConversationHistory(
  userId,
  conversationId,
  20
);

// Semantic search across all context
const results = await contextService.retrieveUserContext(
  userId,
  queryEmbedding,
  {
    topK: 5,
    filter: { contextType: 'document' }
  }
);

// Find connected memories
const memoryGraph = await contextService.findConnectedMemories(
  userId,
  startingContextId,
  2, // depth
  0.3 // minimum strength
);
```

## Migration from Legacy Architecture

The `UserContextFacade` class provides the same interface as the original monolithic `UserContextService`, making migration straightforward:

1. Replace imports:
   ```typescript
   // Before
   import { UserContextService } from './user-context.service.ts';
   
   // After
   import { UserContextFacade } from './user-context.facade.ts';
   ```

2. Replace instantiation:
   ```typescript
   // Before
   const contextService = new UserContextService();
   
   // After
   const contextService = new UserContextFacade();
   ```

No other code changes are needed as the facade maintains the same API.

## Future Enhancements

1. **Custom Vector Storage**: Support for different vector databases beyond Pinecone
2. **Streaming Support**: Real-time streaming of context updates
3. **Schema Evolution**: Tools for managing schema changes over time
4. **Multi-tenant Support**: Enhanced isolation for multi-tenant scenarios

## Contributing

If adding new functionality, consider which service it belongs in and maintain the separation of concerns. Add appropriate unit tests for new functionality.